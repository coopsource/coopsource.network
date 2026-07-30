import type { DID } from '@coopsource/common';
import type { Database } from '@coopsource/db';
import type { Kysely, Transaction } from 'kysely';
import { spaceRefKey, type ClockedOptions, type SpaceRef } from './types.js';

export interface SpaceCredential {
  readonly token: string;
  readonly expiresAt: Date;
}

export type SpaceCredentialRefreshReason =
  | 'missing'
  | 'refresh-per-batch'
  | 'near-expiry';

export interface SpaceCredentialIssueRequest {
  readonly ref: SpaceRef;
  readonly reason: SpaceCredentialRefreshReason;
  readonly previous?: SpaceCredential;
  readonly now: Date;
}

export interface SpaceCredentialIssuerPort {
  issue(request: SpaceCredentialIssueRequest): Promise<SpaceCredential>;
}

export interface SpaceCredentialManagerOptions extends ClockedOptions {
  readonly refreshPerBatch?: boolean;
  readonly refreshBeforeMs?: number;
}

/**
 * Stage 2+ surface: short-lived bearer-token storage for arbiter operations
 * on permissioned spaces. The Stage 1 spaces consumer does not consume this
 * interface directly — it's part of the package's public surface so that the
 * real PermissionedRepoPort adapter has a pre-shaped place to obtain
 * per-(coop, space) credentials.
 *
 * InMemorySpaceCredentialStore is useful for local harnesses; the Kysely
 * implementation persists credentials across API process restarts.
 */
export interface SpaceCredentialStore {
  get(ref: SpaceRef): Promise<SpaceCredential | undefined>;
  put(ref: SpaceRef, cred: SpaceCredential): Promise<void>;
  delete(ref: SpaceRef): Promise<void>;
  live(): Promise<Array<{ ref: SpaceRef; cred: SpaceCredential }>>;
}

export class InMemorySpaceCredentialStore implements SpaceCredentialStore {
  private readonly map = new Map<
    string,
    { ref: SpaceRef; cred: SpaceCredential }
  >();
  constructor(private readonly opts: ClockedOptions) {}

  async get(ref: SpaceRef): Promise<SpaceCredential | undefined> {
    const entry = this.map.get(spaceRefKey(ref));
    if (!entry) return undefined;
    // Treat expiresAt as exclusive: expired at the boundary instant (per JWT §4.1.4).
    if (!isLiveCredential(entry.cred, this.opts.clock())) {
      return undefined;
    }
    return entry.cred;
  }

  async put(ref: SpaceRef, cred: SpaceCredential): Promise<void> {
    this.map.set(spaceRefKey(ref), { ref, cred });
  }

  async delete(ref: SpaceRef): Promise<void> {
    this.map.delete(spaceRefKey(ref));
  }

  async live(): Promise<Array<{ ref: SpaceRef; cred: SpaceCredential }>> {
    const now = this.opts.clock();
    return [...this.map.values()].filter((e) => isLiveCredential(e.cred, now));
  }
}

export class KyselySpaceCredentialStore implements SpaceCredentialStore {
  constructor(
    private readonly db: Kysely<Database> | Transaction<Database>,
    private readonly opts: ClockedOptions,
  ) {}

  async get(ref: SpaceRef): Promise<SpaceCredential | undefined> {
    const row = await this.db
      .selectFrom('space_credential')
      .select(['token', 'expires_at'])
      .where('space_ref_key', '=', spaceRefKey(ref))
      .executeTakeFirst();
    if (!row) return undefined;

    const cred = toCredential(row);
    if (!isLiveCredential(cred, this.opts.clock())) return undefined;
    return cred;
  }

  async put(ref: SpaceRef, cred: SpaceCredential): Promise<void> {
    const now = this.opts.clock();
    await this.db
      .insertInto('space_credential')
      .values({
        space_ref_key: spaceRefKey(ref),
        arbiter_did: ref.arbiterDid,
        space_key: ref.spaceKey,
        expected_space_type: ref.expectedSpaceType ?? null,
        token: cred.token,
        expires_at: cred.expiresAt,
        updated_at: now,
      })
      .onConflict((oc) =>
        oc.column('space_ref_key').doUpdateSet({
          arbiter_did: ref.arbiterDid,
          space_key: ref.spaceKey,
          expected_space_type: ref.expectedSpaceType ?? null,
          token: cred.token,
          expires_at: cred.expiresAt,
          updated_at: now,
        }),
      )
      .execute();
  }

  async delete(ref: SpaceRef): Promise<void> {
    await this.db
      .deleteFrom('space_credential')
      .where('space_ref_key', '=', spaceRefKey(ref))
      .execute();
  }

  async live(): Promise<Array<{ ref: SpaceRef; cred: SpaceCredential }>> {
    const now = this.opts.clock();
    const rows = await this.db
      .selectFrom('space_credential')
      .select([
        'arbiter_did',
        'space_key',
        'expected_space_type',
        'token',
        'expires_at',
      ])
      .where('expires_at', '>', now)
      .orderBy('space_ref_key', 'asc')
      .execute();

    return rows
      .map((row) => ({
        ref: toSpaceRef(row),
        cred: toCredential(row),
      }))
      .filter((entry) => isLiveCredential(entry.cred, now));
  }
}

export class SpaceCredentialManager {
  constructor(
    private readonly store: SpaceCredentialStore,
    private readonly issuer: SpaceCredentialIssuerPort,
    private readonly opts: SpaceCredentialManagerOptions,
  ) {}

  async getForBatch(ref: SpaceRef): Promise<SpaceCredential> {
    const previous = await this.store.get(ref);
    const reason = this.refreshReason(previous);
    if (!reason && previous) {
      return previous;
    }

    const now = this.opts.clock();
    const credential = await this.issuer.issue({
      ref,
      reason: reason ?? 'missing',
      previous,
      now,
    });
    const expiresAtMs = credential.expiresAt.getTime();
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now.getTime()) {
      throw new SpaceCredentialError(
        'Issued space credential is already expired',
      );
    }
    await this.store.put(ref, credential);
    return credential;
  }

  async invalidate(ref: SpaceRef): Promise<void> {
    await this.store.delete(ref);
  }

  private refreshReason(
    previous: SpaceCredential | undefined,
  ): SpaceCredentialRefreshReason | null {
    if (!previous) return 'missing';
    if (this.opts.refreshPerBatch) return 'refresh-per-batch';

    const refreshBeforeMs = Math.max(0, this.opts.refreshBeforeMs ?? 0);
    if (
      refreshBeforeMs > 0 &&
      previous.expiresAt.getTime() - this.opts.clock().getTime() <=
        refreshBeforeMs
    ) {
      return 'near-expiry';
    }

    return null;
  }
}

export type SpaceCredentialErrorKind =
  | 'auth'
  | 'client-policy'
  | 'invalid-space'
  | 'not-member'
  | 'protocol'
  | 'unavailable';

export class SpaceCredentialError extends Error {
  constructor(
    message: string,
    public readonly kind: SpaceCredentialErrorKind = 'protocol',
  ) {
    super(message);
    this.name = 'SpaceCredentialError';
  }
}

function toCredential(row: {
  readonly token: string;
  readonly expires_at: Date;
}): SpaceCredential {
  return { token: row.token, expiresAt: row.expires_at };
}

function toSpaceRef(row: {
  readonly arbiter_did: string;
  readonly space_key: string;
  readonly expected_space_type: string | null;
}): SpaceRef {
  const base = {
    arbiterDid: row.arbiter_did as DID,
    spaceKey: row.space_key,
  };
  if (row.expected_space_type === null) return base;
  return { ...base, expectedSpaceType: row.expected_space_type };
}

function isLiveCredential(cred: SpaceCredential, now: Date): boolean {
  const expiresAtMs = cred.expiresAt.getTime();
  return Number.isFinite(expiresAtMs) && expiresAtMs > now.getTime();
}
