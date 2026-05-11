import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { DID } from '@coopsource/common';
import type { SpaceRef } from './types.js';
import type { CursorStore } from './cursor-store.js';

/**
 * Postgres-backed CursorStore against the `spaces_consumer_cursor` table
 * (composite PK on cooperative_did, space_type, space_skey, member_did).
 *
 * Test note: this class is not unit-tested in the spaces-consumer package
 * because the migrations/ folder is empty and no automated bootstrap exists
 * for the spaces_consumer_cursor table in a unit-test context. End-to-end
 * coverage arrives via Task 11's apps/api dispatch wiring against a real
 * Postgres instance configured by DATABASE_URL.
 */
export class KyselyCursorStore implements CursorStore {
  constructor(private readonly db: Kysely<Database>) {}

  async get(space: SpaceRef, memberDid: DID): Promise<string> {
    const row = await this.db
      .selectFrom('spaces_consumer_cursor')
      .select('cursor')
      .where('cooperative_did', '=', space.arbiter)
      .where('space_type', '=', space.type)
      .where('space_skey', '=', space.skey)
      .where('member_did', '=', memberDid)
      .executeTakeFirst();
    return row?.cursor ?? '';
  }

  async set(space: SpaceRef, memberDid: DID, value: string): Promise<void> {
    await this.db
      .insertInto('spaces_consumer_cursor')
      .values({
        cooperative_did: space.arbiter,
        space_type: space.type,
        space_skey: space.skey,
        member_did: memberDid,
        cursor: value,
        updated_at: new Date(),
      })
      .onConflict((oc) =>
        oc
          .columns(['cooperative_did', 'space_type', 'space_skey', 'member_did'])
          .doUpdateSet({ cursor: value, updated_at: new Date() }),
      )
      .execute();
  }
}
