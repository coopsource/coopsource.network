import type { SpaceCredentialManager } from './credential-store.js';
import type {
  PermissionedRepoPort,
  PermissionedWatchHandle,
} from './permissioned-repo-port.js';
import type {
  PermissionedChangeHint,
  PermissionedCheckpoint,
  SpaceRef,
  VerifiedPermissionedChanges,
} from './types.js';

export interface CredentialedPermissionedRepoPortOptions {
  readonly credentials: SpaceCredentialManager;
  readonly inner: PermissionedRepoPort;
}

/**
 * PermissionedRepoPort decorator that acquires a fresh-enough space credential
 * before each sync batch, then leaves protocol verification/checkpointing to
 * the wrapped repo adapter.
 */
export class CredentialedPermissionedRepoPort implements PermissionedRepoPort {
  constructor(private readonly opts: CredentialedPermissionedRepoPortOptions) {}

  watch(args: {
    readonly spaces: ReadonlyArray<SpaceRef>;
    readonly onChange: (hint: PermissionedChangeHint) => Promise<void> | void;
  }): Promise<PermissionedWatchHandle> {
    return this.opts.inner.watch(args);
  }

  async sync(args: {
    readonly space: SpaceRef;
    readonly hint?: PermissionedChangeHint;
  }): Promise<VerifiedPermissionedChanges> {
    const credential = await this.opts.credentials.getForBatch(args.space);
    return this.opts.inner.sync({ ...args, credential });
  }

  commitCheckpoint(args: {
    readonly space: SpaceRef;
    readonly checkpoint: PermissionedCheckpoint;
  }): Promise<void> {
    return this.opts.inner.commitCheckpoint(args);
  }
}
