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
    'network.coopsource.org.memberConsent',
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
    const createEvent = makeEvent('network.coopsource.org.memberConsent');
    await processFirehoseEvent(db, registry, createEvent);

    // Then delete
    const deleteEvent = makeEvent('network.coopsource.org.memberConsent', 'delete');
    await processFirehoseEvent(db, registry, deleteEvent);

    const row = await db
      .selectFrom('pds_record')
      .where('uri', '=', createEvent.uri)
      .select('deleted_at')
      .executeTakeFirst();

    expect(row).toBeDefined();
    expect(row!.deleted_at).not.toBeNull();
  });

  it('attaches and clears member consent evidence without creating authority', async () => {
    const now = new Date('2026-01-01T00:00:00Z');
    await db
      .insertInto('entity')
      .values([
        {
          did: 'did:plc:test',
          type: 'person',
          handle: null,
          display_name: 'Test Member',
          description: null,
          avatar_cid: null,
          status: 'active',
          created_at: now,
          created_by: null,
          invalidated_at: null,
          invalidated_by: null,
          indexed_at: now,
        },
        {
          did: 'did:plc:coop',
          type: 'cooperative',
          handle: null,
          display_name: 'Test Coop',
          description: null,
          avatar_cid: null,
          status: 'active',
          created_at: now,
          created_by: null,
          invalidated_at: null,
          invalidated_by: null,
          indexed_at: now,
        },
      ])
      .execute();

    await db
      .insertInto('membership')
      .values({
        member_did: 'did:plc:test',
        cooperative_did: 'did:plc:coop',
        status: 'active',
        member_class: null,
        member_record_uri: null,
        member_record_cid: null,
        approval_record_uri: null,
        approval_record_cid: null,
        invited_by_did: null,
        invitation_id: null,
        joined_at: now,
        departed_at: null,
        status_reason: null,
        directory_visible: true,
        created_at: now,
        created_by: 'did:plc:coop',
        invalidated_at: null,
        invalidated_by: null,
        indexed_at: now,
      })
      .execute();

    const createEvent = makeEvent(
      'network.coopsource.org.memberConsent',
      'create',
      {
        $type: 'network.coopsource.org.memberConsent',
        cooperative: 'did:plc:coop',
        consentType: 'joinRequest',
        createdAt: now.toISOString(),
      },
    );
    await processFirehoseEvent(db, registry, createEvent);

    const updated = await db
      .selectFrom('membership')
      .where('member_did', '=', 'did:plc:test')
      .where('cooperative_did', '=', 'did:plc:coop')
      .select(['member_record_uri', 'member_record_cid'])
      .executeTakeFirstOrThrow();

    expect(updated.member_record_uri).toBe(createEvent.uri);
    expect(updated.member_record_cid).toBe(createEvent.cid);

    const unrelatedEvent = makeEvent(
      'network.coopsource.org.memberConsent',
      'create',
      {
        $type: 'network.coopsource.org.memberConsent',
        cooperative: 'did:plc:other',
        consentType: 'joinRequest',
        createdAt: now.toISOString(),
      },
      { did: 'did:plc:no-authority' },
    );
    await processFirehoseEvent(db, registry, unrelatedEvent);

    const count = await db
      .selectFrom('membership')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .executeTakeFirstOrThrow();
    expect(Number(count.count)).toBe(1);

    const deleteEvent = makeEvent(
      'network.coopsource.org.memberConsent',
      'delete',
      undefined,
      { uri: createEvent.uri },
    );
    await processFirehoseEvent(db, registry, deleteEvent);

    const cleared = await db
      .selectFrom('membership')
      .where('member_did', '=', 'did:plc:test')
      .where('cooperative_did', '=', 'did:plc:coop')
      .select(['member_record_uri', 'member_record_cid'])
      .executeTakeFirstOrThrow();

    expect(cleared.member_record_uri).toBeNull();
    expect(cleared.member_record_cid).toBeNull();
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
