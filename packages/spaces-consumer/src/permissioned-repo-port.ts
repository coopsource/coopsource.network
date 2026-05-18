import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import {
  spaceRefKey,
  type ClockedOptions,
  type PermissionedChangeHint,
  type PermissionedCheckpoint,
  type SpaceRef,
  type VerifiedPermissionedChanges,
  type VerifiedPermissionedRecord,
  type PermissionedVerificationStatus,
} from './types.js';

export interface PermissionedWatchHandle {
  close(): Promise<void> | void;
}

export interface PermissionedRepoPort {
  watch(args: {
    readonly spaces: ReadonlyArray<SpaceRef>;
    readonly onChange: (hint: PermissionedChangeHint) => Promise<void> | void;
  }): Promise<PermissionedWatchHandle>;

  sync(args: {
    readonly space: SpaceRef;
    readonly hint?: PermissionedChangeHint;
  }): Promise<VerifiedPermissionedChanges>;

  commitCheckpoint(args: {
    readonly space: SpaceRef;
    readonly checkpoint: PermissionedCheckpoint;
  }): Promise<void>;
}

export interface PermissionedCheckpointStore {
  get(space: SpaceRef): Promise<PermissionedCheckpoint | undefined>;
  set(space: SpaceRef, checkpoint: PermissionedCheckpoint): Promise<void>;
}

export class InMemoryPermissionedCheckpointStore implements PermissionedCheckpointStore {
  private readonly checkpoints = new Map<string, PermissionedCheckpoint>();

  async get(space: SpaceRef): Promise<PermissionedCheckpoint | undefined> {
    return this.checkpoints.get(spaceRefKey(space));
  }

  async set(space: SpaceRef, checkpoint: PermissionedCheckpoint): Promise<void> {
    this.checkpoints.set(spaceRefKey(space), checkpoint);
  }
}

/**
 * Stage 1 checkpoint store backed by the existing spaces_consumer_cursor table.
 * The old schema is per-member; the stable port stores one space-level
 * checkpoint using a reserved member_did sentinel until the PoC schema is
 * revisited.
 */
export class KyselyPermissionedCheckpointStore implements PermissionedCheckpointStore {
  private static readonly spaceCheckpointMemberDid = '__permissioned_space__';

  constructor(private readonly db: Kysely<Database>) {}

  async get(space: SpaceRef): Promise<PermissionedCheckpoint | undefined> {
    const row = await this.db
      .selectFrom('spaces_consumer_cursor')
      .select('cursor')
      .where('cooperative_did', '=', space.arbiter)
      .where('space_type', '=', space.type)
      .where('space_skey', '=', space.skey)
      .where('member_did', '=', KyselyPermissionedCheckpointStore.spaceCheckpointMemberDid)
      .executeTakeFirst();
    return row?.cursor ? this.checkpoint(row.cursor) : undefined;
  }

  async set(space: SpaceRef, checkpoint: PermissionedCheckpoint): Promise<void> {
    await this.db
      .insertInto('spaces_consumer_cursor')
      .values({
        cooperative_did: space.arbiter,
        space_type: space.type,
        space_skey: space.skey,
        member_did: KyselyPermissionedCheckpointStore.spaceCheckpointMemberDid,
        cursor: checkpoint,
        updated_at: new Date(),
      })
      .onConflict((oc) =>
        oc
          .columns(['cooperative_did', 'space_type', 'space_skey', 'member_did'])
          .doUpdateSet({ cursor: checkpoint, updated_at: new Date() }),
      )
      .execute();
  }

  private checkpoint(value: string): PermissionedCheckpoint {
    return value as PermissionedCheckpoint;
  }
}

export interface InMemoryPermissionedRepoPortOptions extends ClockedOptions {
  readonly records?: ReadonlyArray<VerifiedPermissionedRecord>;
  readonly verification?: PermissionedVerificationStatus;
  readonly checkpoints?: PermissionedCheckpointStore;
}

export class InMemoryPermissionedRepoPort implements PermissionedRepoPort {
  private readonly records: ReadonlyArray<VerifiedPermissionedRecord>;
  private readonly verification: PermissionedVerificationStatus;
  private readonly checkpoints: PermissionedCheckpointStore;
  private readonly clock: () => Date;
  private readonly watchers = new Map<string, (hint: PermissionedChangeHint) => Promise<void> | void>();

  constructor(options: InMemoryPermissionedRepoPortOptions) {
    this.records = options.records ?? [];
    this.verification = options.verification ?? 'verified';
    this.checkpoints = options.checkpoints ?? new InMemoryPermissionedCheckpointStore();
    this.clock = options.clock;
  }

  async watch(args: {
    readonly spaces: ReadonlyArray<SpaceRef>;
    readonly onChange: (hint: PermissionedChangeHint) => Promise<void> | void;
  }): Promise<PermissionedWatchHandle> {
    for (const space of args.spaces) {
      this.watchers.set(spaceRefKey(space), args.onChange);
    }
    return {
      close: () => {
        for (const space of args.spaces) {
          this.watchers.delete(spaceRefKey(space));
        }
      },
    };
  }

  async emit(space: SpaceRef): Promise<void> {
    const handler = this.watchers.get(spaceRefKey(space));
    if (!handler) return;
    await handler({ space, receivedAt: this.clock() });
  }

  async sync(args: {
    readonly space: SpaceRef;
    readonly hint?: PermissionedChangeHint;
  }): Promise<VerifiedPermissionedChanges> {
    if (this.verification === 'failed-closed') {
      return {
        space: args.space,
        records: [],
        verification: 'failed-closed',
      };
    }

    if (args.hint?.checkpointHint) {
      return {
        space: args.space,
        records: this.recordsForSpace(args.space),
        verification: this.verification,
        checkpoint: args.hint.checkpointHint,
        sourceRevision: args.hint.sourceRevision,
      };
    }

    const records = this.recordsForSpace(args.space);
    return {
      space: args.space,
      records,
      verification: this.verification,
      checkpoint: this.checkpointFor(records),
      sourceRevision: this.maxSourceRevision(records),
      resynced: this.verification === 'resynced',
    };
  }

  async commitCheckpoint(args: {
    readonly space: SpaceRef;
    readonly checkpoint: PermissionedCheckpoint;
  }): Promise<void> {
    await this.checkpoints.set(args.space, args.checkpoint);
  }

  async committedCheckpoint(space: SpaceRef): Promise<PermissionedCheckpoint | undefined> {
    return this.checkpoints.get(space);
  }

  private recordsForSpace(space: SpaceRef): ReadonlyArray<VerifiedPermissionedRecord> {
    return this.records.filter((record) => spaceRefKey(record.location.space) === spaceRefKey(space));
  }

  private checkpointFor(records: ReadonlyArray<VerifiedPermissionedRecord>): PermissionedCheckpoint | undefined {
    const sourceRevision = this.maxSourceRevision(records);
    return sourceRevision ? this.checkpoint(sourceRevision) : undefined;
  }

  private maxSourceRevision(records: ReadonlyArray<VerifiedPermissionedRecord>): string | undefined {
    return records.reduce<string | undefined>((max, record) => {
      if (!record.sourceRevision) return max;
      if (!max || record.sourceRevision > max) return record.sourceRevision;
      return max;
    }, undefined);
  }

  private checkpoint(value: string): PermissionedCheckpoint {
    return value as PermissionedCheckpoint;
  }
}

export class FailClosedPermissionedRepoPort extends InMemoryPermissionedRepoPort {
  constructor(options: Pick<InMemoryPermissionedRepoPortOptions, 'clock' | 'checkpoints'>) {
    super({ ...options, verification: 'failed-closed', records: [] });
  }
}
