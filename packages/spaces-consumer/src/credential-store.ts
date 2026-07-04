import { spaceRefKey, type ClockedOptions, type SpaceRef } from './types.js';

export interface SpaceCredential {
  readonly token: string;
  readonly expiresAt: Date;
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
  private readonly map = new Map<string, { ref: SpaceRef; cred: SpaceCredential }>();
  constructor(private readonly opts: ClockedOptions) {}

  async get(ref: SpaceRef): Promise<SpaceCredential | undefined> {
    const entry = this.map.get(spaceRefKey(ref));
    if (!entry) return undefined;
    // Treat expiresAt as exclusive: expired at the boundary instant (per JWT §4.1.4).
    if (entry.cred.expiresAt.getTime() <= this.opts.clock().getTime()) return undefined;
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
    return [...this.map.values()].filter((e) => e.cred.expiresAt.getTime() > now);
  }
}
