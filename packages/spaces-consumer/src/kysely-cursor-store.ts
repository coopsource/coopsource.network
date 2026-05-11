import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { CursorStore } from './consumer.js';

/**
 * Postgres-backed CursorStore against the `spaces_consumer_cursor` table
 * (composite PK on cooperative_did, space_type, space_skey, member_did).
 *
 * Key format (set by SpacesConsumer.handleNotification): pipe-delimited
 * `${arbiter}|${type}|${skey}|${memberDid}`. We split on `|` here. DIDs and
 * NSIDs cannot contain `|` so the split is unambiguous.
 *
 * Test note: this class is not unit-tested in the spaces-consumer package
 * because the migrations/ folder is empty and no automated bootstrap exists
 * for the spaces_consumer_cursor table in a unit-test context. End-to-end
 * coverage arrives via Task 11's apps/api dispatch wiring against a real
 * Postgres instance configured by DATABASE_URL.
 */
export class KyselyCursorStore implements CursorStore {
  constructor(private readonly db: Kysely<Database>) {}

  async get(key: string): Promise<string> {
    const parts = key.split('|');
    if (parts.length !== 4) {
      throw new Error(
        `KyselyCursorStore: malformed cursor key (expected 4 pipe-delimited parts): ${key}`,
      );
    }
    const [coop, type, skey, member] = parts as [string, string, string, string];
    const row = await this.db
      .selectFrom('spaces_consumer_cursor')
      .select('cursor')
      .where('cooperative_did', '=', coop)
      .where('space_type', '=', type)
      .where('space_skey', '=', skey)
      .where('member_did', '=', member)
      .executeTakeFirst();
    return row?.cursor ?? '';
  }

  async set(key: string, value: string): Promise<void> {
    const parts = key.split('|');
    if (parts.length !== 4) {
      throw new Error(
        `KyselyCursorStore: malformed cursor key (expected 4 pipe-delimited parts): ${key}`,
      );
    }
    const [coop, type, skey, member] = parts as [string, string, string, string];
    await this.db
      .insertInto('spaces_consumer_cursor')
      .values({
        cooperative_did: coop,
        space_type: type,
        space_skey: skey,
        member_did: member,
        cursor: value,
      })
      .onConflict((oc) =>
        oc
          .columns(['cooperative_did', 'space_type', 'space_skey', 'member_did'])
          .doUpdateSet({ cursor: value }),
      )
      .execute();
  }
}
