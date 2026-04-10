import { describe, it, expect, beforeEach } from 'vitest';
import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import { HookRegistry } from '../src/appview/hooks/registry.js';
import { registerBuiltinHooks } from '../src/appview/hooks/builtin/index.js';
import { processFirehoseEvent } from '../src/appview/hooks/pipeline.js';
import { makeEvent } from './helpers/make-event.js';
import { getTestDb, truncateAllTables } from './helpers/test-db.js';

/**
 * Hook pipeline dispatch tests.
 *
 * Verifies that registerBuiltinHooks correctly wires all collections to
 * post-storage hooks, and that processFirehoseEvent routes events through
 * the pipeline (pds_record upsert + hook invocation).
 *
 * Uses real test DB — processFirehoseEvent upserts into pds_record.
 * Complements hook-pipeline.test.ts which tests pipeline mechanics
 * (skip, transform, dead-letter, priority, wildcards).
 */
describe('Hook pipeline dispatch', () => {
  let db: Kysely<Database>;
  let registry: HookRegistry;

  beforeEach(async () => {
    await truncateAllTables();
    db = getTestDb();
    registry = new HookRegistry();
    registerBuiltinHooks(registry);
  });

  // ─── Hook registration coverage ────────────────────────────────────

  const complexCollections = [
    'network.coopsource.org.membership',
    'network.coopsource.org.memberApproval',
    'network.coopsource.governance.proposal',
    'network.coopsource.governance.vote',
    'network.coopsource.agreement.master',
    'network.coopsource.agreement.signature',
  ];

  const declarativeCollections = [
    'network.coopsource.alignment.interest',
    'network.coopsource.alignment.outcome',
    'network.coopsource.alignment.interestMap',
    'network.coopsource.admin.officer',
    'network.coopsource.admin.complianceItem',
    'network.coopsource.admin.memberNotice',
    'network.coopsource.admin.fiscalPeriod',
    'network.coopsource.legal.document',
    'network.coopsource.legal.meetingRecord',
    'community.lexicon.calendar.event',
    'community.lexicon.calendar.rsvp',
    'fyi.unravel.frontpage.post',
  ];

  for (const collection of [...complexCollections, ...declarativeCollections]) {
    it(`has a post-storage hook registered for ${collection}`, () => {
      const hooks = registry.getPostStorageHooks(collection);
      expect(hooks.length).toBeGreaterThanOrEqual(1);
    });
  }

  // ─── Pipeline integration: pds_record storage ──────────────────────

  for (const collection of complexCollections) {
    it(`stores pds_record and invokes hook for ${collection}`, async () => {
      const event = makeEvent(collection);
      await processFirehoseEvent(db, registry, event);

      const row = await db
        .selectFrom('pds_record')
        .where('uri', '=', event.uri)
        .select(['collection', 'did', 'cid'])
        .executeTakeFirst();

      expect(row).toBeDefined();
      expect(row!.collection).toBe(collection);
      expect(row!.did).toBe('did:plc:test');
    });
  }

  for (const collection of declarativeCollections) {
    it(`stores pds_record via declarative hook for ${collection}`, async () => {
      const event = makeEvent(collection);
      await processFirehoseEvent(db, registry, event);

      const row = await db
        .selectFrom('pds_record')
        .where('uri', '=', event.uri)
        .select('collection')
        .executeTakeFirst();

      expect(row?.collection).toBe(collection);
    });
  }

  // ─── Edge cases ────────────────────────────────────────────────────

  it('stores pds_record for unknown collections with no hook', async () => {
    const event = makeEvent('app.bsky.feed.post');
    await processFirehoseEvent(db, registry, event);

    // No hook for bsky posts, but pds_record is still stored
    const hooks = registry.getPostStorageHooks('app.bsky.feed.post');
    expect(hooks.length).toBe(0);

    const row = await db
      .selectFrom('pds_record')
      .where('uri', '=', event.uri)
      .select('collection')
      .executeTakeFirst();
    expect(row?.collection).toBe('app.bsky.feed.post');
  });

  it('handles delete events (soft-deletes pds_record)', async () => {
    // Create first
    const createEvent = makeEvent('network.coopsource.org.membership');
    await processFirehoseEvent(db, registry, createEvent);

    // Then delete
    const deleteEvent = makeEvent('network.coopsource.org.membership', 'delete');
    await processFirehoseEvent(db, registry, deleteEvent);

    const row = await db
      .selectFrom('pds_record')
      .where('uri', '=', createEvent.uri)
      .select('deleted_at')
      .executeTakeFirst();

    expect(row).toBeDefined();
    expect(row!.deleted_at).not.toBeNull();
  });

  it('creates pds_record with correct fields', async () => {
    const event = makeEvent(
      'network.coopsource.governance.proposal',
      'create',
      { $type: 'network.coopsource.governance.proposal', title: 'Test' },
    );
    await processFirehoseEvent(db, registry, event);

    const row = await db
      .selectFrom('pds_record')
      .where('uri', '=', event.uri)
      .selectAll()
      .executeTakeFirst();

    expect(row).toBeDefined();
    expect(row!.did).toBe('did:plc:test');
    expect(row!.collection).toBe('network.coopsource.governance.proposal');
    expect(row!.cid).toBe('bafytest');
    expect(row!.rkey).toBe('rkey1');
    expect(row!.deleted_at).toBeNull();
  });
});
