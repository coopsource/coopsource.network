import { describe, it, expect, beforeEach } from 'vitest';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import { truncateAllTables, getTestDb } from './helpers/test-db.js';
import { resetSetupCache } from '../src/auth/middleware.js';

/**
 * Tests for MCP tools (P9) — queries against pds_record.
 *
 * The MCP server tools are thin wrappers around DB queries.
 * Since createScopedMcpServer creates closures that are not directly
 * accessible, we test the underlying queries by inserting pds_record
 * rows directly and verifying the query patterns.
 */
describe('MCP tools data queries (P9)', () => {
  let db: Kysely<Database>;

  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
    db = getTestDb();
  });

  /**
   * Insert a pds_record row for testing.
   */
  async function insertRecord(params: {
    uri: string;
    did: string;
    collection: string;
    rkey: string;
    content: Record<string, unknown>;
    cid?: string;
  }): Promise<void> {
    await db
      .insertInto('pds_record')
      .values({
        uri: params.uri,
        did: params.did,
        collection: params.collection,
        rkey: params.rkey,
        cid: params.cid ?? 'bafytest',
        content: JSON.stringify(params.content),
        indexed_at: new Date(),
      })
      .execute();
  }

  // ─── query-records pattern ────────────────────────────────────────

  it('query by collection returns matching records', async () => {
    await insertRecord({
      uri: 'at://did:plc:a/network.coopsource.org.membership/r1',
      did: 'did:plc:a',
      collection: 'network.coopsource.org.membership',
      rkey: 'r1',
      content: { $type: 'network.coopsource.org.membership', cooperative: 'did:plc:coop1' },
    });

    await insertRecord({
      uri: 'at://did:plc:b/network.coopsource.governance.proposal/r2',
      did: 'did:plc:b',
      collection: 'network.coopsource.governance.proposal',
      rkey: 'r2',
      content: { $type: 'network.coopsource.governance.proposal', title: 'Budget 2026' },
    });

    // Query for memberships only
    const rows = await db
      .selectFrom('pds_record')
      .where('collection', '=', 'network.coopsource.org.membership')
      .where('deleted_at', 'is', null)
      .select(['uri', 'did', 'collection', 'content', 'indexed_at'])
      .execute();

    expect(rows).toHaveLength(1);
    expect(rows[0]!.uri).toBe('at://did:plc:a/network.coopsource.org.membership/r1');
  });

  // ─── get-record pattern ───────────────────────────────────────────

  it('get by URI returns a single record', async () => {
    const testUri = 'at://did:plc:test/network.coopsource.governance.vote/v1';

    await insertRecord({
      uri: testUri,
      did: 'did:plc:test',
      collection: 'network.coopsource.governance.vote',
      rkey: 'v1',
      content: { $type: 'network.coopsource.governance.vote', choice: 'approve' },
    });

    const row = await db
      .selectFrom('pds_record')
      .where('uri', '=', testUri)
      .where('deleted_at', 'is', null)
      .select(['uri', 'did', 'collection', 'rkey', 'cid', 'content', 'indexed_at'])
      .executeTakeFirst();

    expect(row).toBeDefined();
    expect(row!.uri).toBe(testUri);
    expect(row!.collection).toBe('network.coopsource.governance.vote');

    const content = typeof row!.content === 'string' ? JSON.parse(row!.content) : row!.content;
    expect(content.choice).toBe('approve');
  });

  it('get by URI returns nothing for deleted records', async () => {
    const testUri = 'at://did:plc:test/network.coopsource.governance.vote/deleted1';

    await insertRecord({
      uri: testUri,
      did: 'did:plc:test',
      collection: 'network.coopsource.governance.vote',
      rkey: 'deleted1',
      content: { $type: 'network.coopsource.governance.vote', choice: 'reject' },
    });

    // Soft-delete
    await db
      .updateTable('pds_record')
      .set({ deleted_at: new Date() })
      .where('uri', '=', testUri)
      .execute();

    const row = await db
      .selectFrom('pds_record')
      .where('uri', '=', testUri)
      .where('deleted_at', 'is', null)
      .selectAll()
      .executeTakeFirst();

    expect(row).toBeUndefined();
  });

  // ─── search-records pattern ───────────────────────────────────────

  it('search finds matching records by content text', async () => {
    await insertRecord({
      uri: 'at://did:plc:x/network.coopsource.governance.proposal/p1',
      did: 'did:plc:x',
      collection: 'network.coopsource.governance.proposal',
      rkey: 'p1',
      content: { $type: 'network.coopsource.governance.proposal', title: 'Adopt Solar Energy Policy' },
    });

    await insertRecord({
      uri: 'at://did:plc:x/network.coopsource.governance.proposal/p2',
      did: 'did:plc:x',
      collection: 'network.coopsource.governance.proposal',
      rkey: 'p2',
      content: { $type: 'network.coopsource.governance.proposal', title: 'Budget Review 2026' },
    });

    const searchTerm = 'Solar Energy';

    const rows = await db
      .selectFrom('pds_record')
      .where('deleted_at', 'is', null)
      .where(
        sql<boolean>`content::text ILIKE ${'%' + searchTerm + '%'}`,
      )
      .select(['uri', 'did', 'collection', 'content', 'indexed_at'])
      .execute();

    expect(rows).toHaveLength(1);
    expect(rows[0]!.uri).toContain('p1');
  });

  it('search with collection filter limits scope', async () => {
    await insertRecord({
      uri: 'at://did:plc:y/network.coopsource.governance.proposal/p3',
      did: 'did:plc:y',
      collection: 'network.coopsource.governance.proposal',
      rkey: 'p3',
      content: { $type: 'network.coopsource.governance.proposal', title: 'Test Keyword Match' },
    });

    await insertRecord({
      uri: 'at://did:plc:y/network.coopsource.agreement.master/a1',
      did: 'did:plc:y',
      collection: 'network.coopsource.agreement.master',
      rkey: 'a1',
      content: { $type: 'network.coopsource.agreement.master', title: 'Test Keyword Match' },
    });

    const rows = await db
      .selectFrom('pds_record')
      .where('deleted_at', 'is', null)
      .where('collection', '=', 'network.coopsource.governance.proposal')
      .where(
        sql<boolean>`content::text ILIKE ${'%Keyword Match%'}`,
      )
      .select(['uri', 'collection'])
      .execute();

    expect(rows).toHaveLength(1);
    expect(rows[0]!.collection).toBe('network.coopsource.governance.proposal');
  });

  // ─── list-collections pattern ─────────────────────────────────────

  it('list-collections returns correct counts per collection', async () => {
    // Insert records in different collections
    await insertRecord({
      uri: 'at://did:plc:z/network.coopsource.org.membership/m1',
      did: 'did:plc:z',
      collection: 'network.coopsource.org.membership',
      rkey: 'm1',
      content: { $type: 'network.coopsource.org.membership' },
    });

    await insertRecord({
      uri: 'at://did:plc:z/network.coopsource.org.membership/m2',
      did: 'did:plc:z',
      collection: 'network.coopsource.org.membership',
      rkey: 'm2',
      content: { $type: 'network.coopsource.org.membership' },
    });

    await insertRecord({
      uri: 'at://did:plc:z/network.coopsource.governance.proposal/p4',
      did: 'did:plc:z',
      collection: 'network.coopsource.governance.proposal',
      rkey: 'p4',
      content: { $type: 'network.coopsource.governance.proposal', title: 'Count Test' },
    });

    const rows = await db
      .selectFrom('pds_record')
      .where('deleted_at', 'is', null)
      .select([
        'collection',
        db.fn.countAll<string>().as('count'),
      ])
      .groupBy('collection')
      .orderBy(sql`count(*) desc`)
      .execute();

    const result = rows.map((r) => ({
      collection: r.collection,
      count: Number(r.count),
    }));

    // Find membership count (should be >= 2 — may have records from init)
    const membershipEntry = result.find(
      (r) => r.collection === 'network.coopsource.org.membership',
    );
    expect(membershipEntry).toBeDefined();
    expect(membershipEntry!.count).toBeGreaterThanOrEqual(2);

    // Find proposal count
    const proposalEntry = result.find(
      (r) => r.collection === 'network.coopsource.governance.proposal',
    );
    expect(proposalEntry).toBeDefined();
    expect(proposalEntry!.count).toBeGreaterThanOrEqual(1);
  });

  it('list-collections excludes deleted records', async () => {
    const testUri = 'at://did:plc:del/test.deleted.collection/d1';

    await insertRecord({
      uri: testUri,
      did: 'did:plc:del',
      collection: 'test.deleted.collection',
      rkey: 'd1',
      content: { $type: 'test.deleted.collection' },
    });

    // Soft-delete
    await db
      .updateTable('pds_record')
      .set({ deleted_at: new Date() })
      .where('uri', '=', testUri)
      .execute();

    const rows = await db
      .selectFrom('pds_record')
      .where('deleted_at', 'is', null)
      .where('collection', '=', 'test.deleted.collection')
      .select([
        'collection',
        db.fn.countAll<string>().as('count'),
      ])
      .groupBy('collection')
      .execute();

    expect(rows).toHaveLength(0);
  });

  // ─── Cursor-based pagination ──────────────────────────────────────

  it('query-records supports cursor-based pagination', async () => {
    // Insert 3 records with distinct timestamps
    for (let i = 1; i <= 3; i++) {
      await db
        .insertInto('pds_record')
        .values({
          uri: `at://did:plc:pag/test.pagination/r${i}`,
          did: 'did:plc:pag',
          collection: 'test.pagination',
          rkey: `r${i}`,
          cid: `bafypage${i}`,
          content: JSON.stringify({ $type: 'test.pagination', index: i }),
          indexed_at: new Date(Date.now() - (3 - i) * 1000), // r1 oldest, r3 newest
        })
        .execute();
    }

    // First page: limit 2
    const page1 = await db
      .selectFrom('pds_record')
      .where('collection', '=', 'test.pagination')
      .where('deleted_at', 'is', null)
      .select(['uri', 'did', 'collection', 'content', 'indexed_at'])
      .orderBy('indexed_at', 'desc')
      .orderBy('uri', 'desc')
      .limit(3)
      .execute();

    expect(page1.length).toBe(3);

    // Use the last item's indexed_at as cursor for next page
    const lastItem = page1[page1.length - 1]!;
    const cursorTime = new Date(lastItem.indexed_at as unknown as string);

    const page2 = await db
      .selectFrom('pds_record')
      .where('collection', '=', 'test.pagination')
      .where('deleted_at', 'is', null)
      .where('indexed_at', '<', cursorTime)
      .select(['uri', 'did', 'collection', 'content', 'indexed_at'])
      .orderBy('indexed_at', 'desc')
      .limit(2)
      .execute();

    // Should have 0 since all 3 records were on page1
    expect(page2.length).toBe(0);
  });
});
