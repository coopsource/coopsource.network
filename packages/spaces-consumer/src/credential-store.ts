import { spaceRefKey, type SpaceRef } from './types.js';

export interface SpaceCredential {
  readonly token: string;
  readonly expiresAt: Date;
}

export interface SpaceCredentialStore {
  get(ref: SpaceRef): Promise<SpaceCredential | undefined>;
  put(ref: SpaceRef, cred: SpaceCredential): Promise<void>;
  delete(ref: SpaceRef): Promise<void>;
  live(): Promise<Array<{ ref: SpaceRef; cred: SpaceCredential }>>;
}

export interface InMemoryOptions {
  clock: () => Date;
}

export class InMemorySpaceCredentialStore implements SpaceCredentialStore {
  private readonly map = new Map<string, { ref: SpaceRef; cred: SpaceCredential }>();
  constructor(private readonly opts: InMemoryOptions) {}

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
