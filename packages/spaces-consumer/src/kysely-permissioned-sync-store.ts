import type { CID, DID } from '@coopsource/common';
import type { Database } from '@coopsource/db';
import type { Kysely } from 'kysely';
import type {
  PermissionedReplicaState,
  PermissionedReplicaStore,
} from './permissioned-sync.js';
import { PermissionedSyncError } from './permissioned-sync.js';
import type {
  PermissionedNotificationRegistration,
  PermissionedNotificationRegistrationStore,
} from './xrpc-permissioned-repo-port.js';
import { spaceRefKey, type ClockedOptions, type SpaceRef } from './types.js';

export class KyselyPermissionedReplicaStore implements PermissionedReplicaStore {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly options: ClockedOptions,
  ) {}

  async list(
    space: SpaceRef,
  ): Promise<ReadonlyArray<PermissionedReplicaState>> {
    const rows = await this.db
      .selectFrom('permissioned_repo_cursor')
      .select('repo_did')
      .where('space_ref_key', '=', spaceRefKey(space))
      .orderBy('repo_did', 'asc')
      .execute();
    return Promise.all(
      rows.map(async (row) => {
        const state = await this.load(space, row.repo_did as DID);
        if (!state) {
          throw new PermissionedSyncError(
            'protocol',
            `Permissioned repo cursor disappeared while listing ${row.repo_did}`,
          );
        }
        return state;
      }),
    );
  }

  async load(
    space: SpaceRef,
    repoDid: DID,
  ): Promise<PermissionedReplicaState | undefined> {
    const key = spaceRefKey(space);
    const cursor = await this.db
      .selectFrom('permissioned_repo_cursor')
      .select('revision')
      .where('space_ref_key', '=', key)
      .where('repo_did', '=', repoDid)
      .executeTakeFirst();
    if (!cursor) return undefined;

    const records = await this.db
      .selectFrom('permissioned_repo_record')
      .select(['collection', 'rkey', 'cid', 'record', 'source_revision'])
      .where('space_ref_key', '=', key)
      .where('repo_did', '=', repoDid)
      .orderBy('collection', 'asc')
      .orderBy('rkey', 'asc')
      .execute();

    return {
      space,
      repoDid,
      revision: cursor.revision,
      records: records.map((record) => ({
        collection: record.collection,
        rkey: record.rkey,
        cid: record.cid as CID,
        record: record.record,
        ...(record.source_revision
          ? { sourceRevision: record.source_revision }
          : {}),
      })),
    };
  }

  async commit(states: ReadonlyArray<PermissionedReplicaState>): Promise<void> {
    const now = this.options.clock();
    await this.db.transaction().execute(async (transaction) => {
      for (const state of states) {
        const key = spaceRefKey(state.space);
        if (state.removed) {
          await transaction
            .deleteFrom('permissioned_repo_record')
            .where('space_ref_key', '=', key)
            .where('repo_did', '=', state.repoDid)
            .execute();
          await transaction
            .deleteFrom('permissioned_repo_cursor')
            .where('space_ref_key', '=', key)
            .where('repo_did', '=', state.repoDid)
            .execute();
          continue;
        }
        if (!state.revision) {
          throw new PermissionedSyncError(
            'protocol',
            `Cannot persist repo ${state.repoDid} without a revision`,
          );
        }
        await transaction
          .insertInto('permissioned_repo_cursor')
          .values({
            space_ref_key: key,
            arbiter_did: state.space.arbiterDid,
            space_key: state.space.spaceKey,
            expected_space_type: state.space.expectedSpaceType ?? null,
            repo_did: state.repoDid,
            revision: state.revision,
            updated_at: now,
          })
          .onConflict((conflict) =>
            conflict.columns(['space_ref_key', 'repo_did']).doUpdateSet({
              arbiter_did: state.space.arbiterDid,
              space_key: state.space.spaceKey,
              expected_space_type: state.space.expectedSpaceType ?? null,
              revision: state.revision!,
              updated_at: now,
            }),
          )
          .execute();

        await transaction
          .deleteFrom('permissioned_repo_record')
          .where('space_ref_key', '=', key)
          .where('repo_did', '=', state.repoDid)
          .execute();
        if (state.records.length > 0) {
          await transaction
            .insertInto('permissioned_repo_record')
            .values(
              state.records.map((record) => ({
                space_ref_key: key,
                repo_did: state.repoDid,
                collection: record.collection,
                rkey: record.rkey,
                cid: record.cid,
                record: record.record,
                source_revision: record.sourceRevision ?? state.revision!,
                updated_at: now,
              })),
            )
            .execute();
        }
      }
    });
  }
}

export class KyselyPermissionedNotificationRegistrationStore implements PermissionedNotificationRegistrationStore {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly options: ClockedOptions,
  ) {}

  async get(
    space: SpaceRef,
    endpoint: string,
  ): Promise<PermissionedNotificationRegistration | undefined> {
    const row = await this.db
      .selectFrom('permissioned_notification_registration')
      .select('expires_at')
      .where('space_ref_key', '=', spaceRefKey(space))
      .where('endpoint', '=', endpoint)
      .executeTakeFirst();
    if (!row) return undefined;
    return { space, endpoint, expiresAt: row.expires_at };
  }

  async put(registration: PermissionedNotificationRegistration): Promise<void> {
    const now = this.options.clock();
    await this.db
      .insertInto('permissioned_notification_registration')
      .values({
        space_ref_key: spaceRefKey(registration.space),
        arbiter_did: registration.space.arbiterDid,
        space_key: registration.space.spaceKey,
        expected_space_type: registration.space.expectedSpaceType ?? null,
        endpoint: registration.endpoint,
        expires_at: registration.expiresAt,
        updated_at: now,
      })
      .onConflict((conflict) =>
        conflict.columns(['space_ref_key', 'endpoint']).doUpdateSet({
          arbiter_did: registration.space.arbiterDid,
          space_key: registration.space.spaceKey,
          expected_space_type: registration.space.expectedSpaceType ?? null,
          expires_at: registration.expiresAt,
          updated_at: now,
        }),
      )
      .execute();
  }
}
