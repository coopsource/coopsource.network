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
 * Persistence (Kysely-backed) is deferred to Stage 2 when a real arbiter is
 * issuing credentials. InMemorySpaceCredentialStore is the only impl in
 * Stage 1.
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
    const expiresAtMs = entry.cred.expiresAt.getTime();
    if (
      !Number.isFinite(expiresAtMs) ||
      expiresAtMs <= this.opts.clock().getTime()
    ) {
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
    const now = this.opts.clock().getTime();
    return [...this.map.values()].filter(
      (e) =>
        Number.isFinite(e.cred.expiresAt.getTime()) &&
        e.cred.expiresAt.getTime() > now,
    );
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

  async invalidateForMemberListChange(ref: SpaceRef): Promise<void> {
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

export class SpaceCredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpaceCredentialError';
  }
}
