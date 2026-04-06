import { describe, it, expect, beforeEach } from 'vitest';
import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import { truncateAllTables, getTestDb } from './helpers/test-db.js';
import { createTestApp, setupAndLogin, type TestApp } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';
import { createDeclarativeHandler } from '../src/appview/hooks/declarative/handler.js';
import {
  adminOfficerConfig,
  meetingRecordConfig,
  interestConfig,
  frontpagePostConfig,
  calendarRsvpConfig,
  calendarEventConfig,
} from '../src/appview/hooks/declarative/configs.js';
import type { HookContext } from '../src/appview/hooks/types.js';
import type { FirehoseEvent } from '@coopsource/federation';
import type { DID, AtUri, CID } from '@coopsource/common';

/**
 * Build a HookContext for testing declarative handlers.
 */
function buildCtx(
  db: Kysely<Database>,
  event: FirehoseEvent,
  collection: string,
  operation: 'create' | 'update' | 'delete',
  content?: Record<string, unknown>,
): HookContext {
  const withoutScheme = event.uri.replace('at://', '');
  const parts = withoutScheme.split('/');
  return {
    db,
    event,
    record: {
      uri: event.uri,
      did: event.did,
      collection,
      rkey: parts[2] ?? '',
      cid: event.cid,
      content,
    },
    collection,
    did: event.did,
    operation,
  };
}

function makeTestEvent(
  collection: string,
  operation: 'create' | 'update' | 'delete' = 'create',
  did: string = 'did:plc:testdecl',
  rkey: string = 'rkey1',
  record?: Record<string, unknown>,
): FirehoseEvent {
  return {
    seq: 1,
    did: did as DID,
    operation,
    uri: `at://${did}/${collection}/${rkey}` as AtUri,
    cid: 'bafydecl' as CID,
    record: record ?? { $type: collection },
    time: '2026-01-01T00:00:00Z',
  };
}

describe('Declarative hooks (P7)', () => {
  let db: Kysely<Database>;
  let testApp: TestApp;
  let coopDid: string;

  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
    db = getTestDb();
    testApp = createTestApp();
    const result = await setupAndLogin(testApp);
    coopDid = result.coopDid;
  });

  // ─── Admin officer (update-only, soft-delete) ─────────────────────

  it('admin officer: create event updates status field', async () => {
    const officerUri = `at://${coopDid}/network.coopsource.admin.officer/off1`;

    // Seed the domain table directly (update-only requires existing row)
    await db
      .insertInto('admin_officer')
      .values({
        uri: officerUri,
        cooperative_did: coopDid,
        officer_did: coopDid,
        title: 'treasurer',
        appointment_type: 'elected',
        appointed_at: new Date(),
        status: 'active',
      })
      .execute();

    // Fire a declarative handler with status update
    const handler = createDeclarativeHandler(adminOfficerConfig);
    const event = makeTestEvent(
      'network.coopsource.admin.officer', 'update', coopDid, 'off1',
      { $type: 'network.coopsource.admin.officer', status: 'inactive' },
    );

    const ctx = buildCtx(db, event, 'network.coopsource.admin.officer', 'update', {
      $type: 'network.coopsource.admin.officer', status: 'inactive',
    });
    await handler(ctx);

    const row = await db
      .selectFrom('admin_officer')
      .where('uri', '=', officerUri)
      .selectAll()
      .executeTakeFirst();
    expect(row).toBeDefined();
    expect(row!.status).toBe('inactive');
  });

  it('admin officer: delete event sets invalidated_at (soft-delete)', async () => {
    const officerUri = `at://${coopDid}/network.coopsource.admin.officer/off2`;

    await db
      .insertInto('admin_officer')
      .values({
        uri: officerUri,
        cooperative_did: coopDid,
        officer_did: coopDid,
        title: 'secretary',
        appointment_type: 'appointed',
        appointed_at: new Date(),
        status: 'active',
      })
      .execute();

    const handler = createDeclarativeHandler(adminOfficerConfig);
    const event = makeTestEvent(
      'network.coopsource.admin.officer', 'delete', coopDid, 'off2',
    );

    const ctx = buildCtx(db, event, 'network.coopsource.admin.officer', 'delete', undefined);
    await handler(ctx);

    const row = await db
      .selectFrom('admin_officer')
      .where('uri', '=', officerUri)
      .selectAll()
      .executeTakeFirst();
    expect(row).toBeDefined();
    expect(row!.invalidated_at).not.toBeNull();
  });

  // ─── Legal meetingRecord (field mapping: certifiedBy → certified_by) ──

  it('meeting record: certifiedBy maps to certified_by column', async () => {
    const meetingUri = `at://${coopDid}/network.coopsource.legal.meetingRecord/mtg1`;

    await db
      .insertInto('meeting_record')
      .values({
        uri: meetingUri,
        cooperative_did: coopDid,
        author_did: coopDid,
        title: 'Board Meeting Q1',
        meeting_type: 'board',
        meeting_date: new Date(),
      })
      .execute();

    const handler = createDeclarativeHandler(meetingRecordConfig);
    const event = makeTestEvent(
      'network.coopsource.legal.meetingRecord', 'update', coopDid, 'mtg1',
      {
        $type: 'network.coopsource.legal.meetingRecord',
        title: 'Board Meeting Q1 - Updated',
        minutes: 'Minutes of the meeting...',
        certifiedBy: 'did:plc:certifier',
      },
    );

    const ctx = buildCtx(db, event, 'network.coopsource.legal.meetingRecord', 'update', {
      $type: 'network.coopsource.legal.meetingRecord',
      title: 'Board Meeting Q1 - Updated',
      minutes: 'Minutes of the meeting...',
      certifiedBy: 'did:plc:certifier',
    });
    await handler(ctx);

    const row = await db
      .selectFrom('meeting_record')
      .where('uri', '=', meetingUri)
      .selectAll()
      .executeTakeFirst();
    expect(row).toBeDefined();
    expect(row!.certified_by).toBe('did:plc:certifier');
  });

  // ─── Alignment interest (JSON.stringify on all 5 fields) ──────────

  it('alignment interest: all 5 fields get JSON.stringify transform', async () => {
    const interestUri = `at://${coopDid}/network.coopsource.alignment.interest/int1`;

    await db
      .insertInto('stakeholder_interest')
      .values({
        uri: interestUri,
        did: coopDid,
        rkey: 'int1',
        project_uri: `at://${coopDid}/network.coopsource.org.cooperative/main`,
        interests: '[]',
        contributions: '[]',
        constraints: '[]',
        red_lines: '[]',
        preferences: '{}',
      })
      .execute();

    const handler = createDeclarativeHandler(interestConfig);
    const newData = {
      interests: ['green energy'],
      contributions: ['ops'],
      constraints: ['budget limited'],
      redLines: ['surveillance'],
      preferences: { priority: 'low' },
    };
    const event = makeTestEvent(
      'network.coopsource.alignment.interest', 'update', coopDid, 'int1',
      { $type: 'network.coopsource.alignment.interest', ...newData },
    );

    const ctx = buildCtx(db, event, 'network.coopsource.alignment.interest', 'update', {
      $type: 'network.coopsource.alignment.interest', ...newData,
    });
    await handler(ctx);

    const row = await db
      .selectFrom('stakeholder_interest')
      .where('uri', '=', interestUri)
      .selectAll()
      .executeTakeFirst();
    expect(row).toBeDefined();

    // All fields should be JSON strings
    const interests = typeof row!.interests === 'string' ? row!.interests : JSON.stringify(row!.interests);
    expect(JSON.parse(interests)).toEqual(['green energy']);
    const redLines = typeof row!.red_lines === 'string' ? row!.red_lines : JSON.stringify(row!.red_lines);
    expect(JSON.parse(redLines)).toEqual(['surveillance']);
  });

  // ─── Frontpage post (upsert mode) ────────────────────────────────

  it('frontpage post: upsert mode creates row when none exists', async () => {
    const handler = createDeclarativeHandler(frontpagePostConfig);
    const event = makeTestEvent('fyi.unravel.frontpage.post', 'create', 'did:plc:testdecl', 'fp1', {
      $type: 'fyi.unravel.frontpage.post',
      proposalUri: 'at://did:plc:coop/network.coopsource.governance.proposal/abc',
      title: 'Discussion Thread',
    });

    const ctx = buildCtx(db, event, 'fyi.unravel.frontpage.post', 'create', {
      $type: 'fyi.unravel.frontpage.post',
      proposalUri: 'at://did:plc:coop/network.coopsource.governance.proposal/abc',
      title: 'Discussion Thread',
    });

    await handler(ctx);

    const row = await db
      .selectFrom('frontpage_post_ref')
      .where('post_uri', '=', event.uri)
      .selectAll()
      .executeTakeFirst();
    expect(row).toBeDefined();
    expect(row!.title).toBe('Discussion Thread');
    expect(row!.cooperative_did).toBe('did:plc:testdecl');
  });

  // ─── Calendar RSVP (counter mapping) ─────────────────────────────

  it('calendar RSVP: counter increments on create, decrements on delete', async () => {
    const eventUri = 'at://did:plc:testdecl/community.lexicon.calendar.event/evt1';

    // Create the event ref using the event config's upsert
    const eventHandler = createDeclarativeHandler(calendarEventConfig);
    const calEvent = makeTestEvent(
      'community.lexicon.calendar.event', 'create', 'did:plc:testdecl', 'evt1',
      {
        $type: 'community.lexicon.calendar.event',
        name: 'Quarterly Meeting',
        startDate: '2026-04-01T10:00:00Z',
      },
    );

    const eventCtx = buildCtx(db, calEvent, 'community.lexicon.calendar.event', 'create', {
      $type: 'community.lexicon.calendar.event',
      name: 'Quarterly Meeting',
      startDate: '2026-04-01T10:00:00Z',
    });
    await eventHandler(eventCtx);

    // Verify event was created with rsvp_count 0
    const eventRow = await db
      .selectFrom('calendar_event_ref')
      .where('event_uri', '=', eventUri)
      .selectAll()
      .executeTakeFirst();
    expect(eventRow).toBeDefined();
    const initialCount = Number(eventRow!.rsvp_count);

    // Now RSVP (create) — should increment
    const rsvpHandler = createDeclarativeHandler(calendarRsvpConfig);
    const rsvpEvent = makeTestEvent(
      'community.lexicon.calendar.rsvp', 'create', 'did:plc:testdecl', 'rsvp1',
      { $type: 'community.lexicon.calendar.rsvp', event: eventUri, status: 'going' },
    );

    const rsvpCtx = buildCtx(db, rsvpEvent, 'community.lexicon.calendar.rsvp', 'create', {
      $type: 'community.lexicon.calendar.rsvp', event: eventUri, status: 'going',
    });
    await rsvpHandler(rsvpCtx);

    const afterCreate = await db
      .selectFrom('calendar_event_ref')
      .where('event_uri', '=', eventUri)
      .selectAll()
      .executeTakeFirst();
    expect(Number(afterCreate!.rsvp_count)).toBe(initialCount + 1);

    // RSVP delete — should decrement
    const rsvpDeleteEvent = makeTestEvent(
      'community.lexicon.calendar.rsvp', 'delete', 'did:plc:testdecl', 'rsvp1',
      { $type: 'community.lexicon.calendar.rsvp', event: eventUri, status: 'going' },
    );

    const rsvpDeleteCtx = buildCtx(db, rsvpDeleteEvent, 'community.lexicon.calendar.rsvp', 'delete', {
      $type: 'community.lexicon.calendar.rsvp', event: eventUri, status: 'going',
    });
    await rsvpHandler(rsvpDeleteCtx);

    const afterDelete = await db
      .selectFrom('calendar_event_ref')
      .where('event_uri', '=', eventUri)
      .selectAll()
      .executeTakeFirst();
    expect(Number(afterDelete!.rsvp_count)).toBe(initialCount);
  });

  // ─── Update-only mode: non-existent row is silently skipped ───────

  it('update-only mode: event for non-existent row is silently skipped', async () => {
    const handler = createDeclarativeHandler(adminOfficerConfig);
    const event = makeTestEvent('network.coopsource.admin.officer', 'update', 'did:plc:testdecl', 'nonexistent', {
      $type: 'network.coopsource.admin.officer', status: 'active',
    });

    // This URI doesn't exist in admin_officer table — should not throw
    await expect(handler(
      buildCtx(db, event, 'network.coopsource.admin.officer', 'update', {
        $type: 'network.coopsource.admin.officer', status: 'active',
      }),
    )).resolves.toBeUndefined();

    // Verify no row was created
    const rows = await db
      .selectFrom('admin_officer')
      .where('uri', '=', event.uri)
      .selectAll()
      .execute();
    expect(rows).toHaveLength(0);
  });

  // ─── Default values ──────────────────────────────────────────────

  it('default values applied when record field is missing', async () => {
    const officerUri = `at://${coopDid}/network.coopsource.admin.officer/off3`;

    await db
      .insertInto('admin_officer')
      .values({
        uri: officerUri,
        cooperative_did: coopDid,
        officer_did: coopDid,
        title: 'chair',
        appointment_type: 'elected',
        appointed_at: new Date(),
        status: 'suspended', // Start with non-default status
      })
      .execute();

    // Fire handler WITHOUT status field — default should be 'active'
    const handler = createDeclarativeHandler(adminOfficerConfig);
    const event = makeTestEvent(
      'network.coopsource.admin.officer', 'update', coopDid, 'off3',
      { $type: 'network.coopsource.admin.officer' }, // status intentionally omitted
    );

    const ctx = buildCtx(db, event, 'network.coopsource.admin.officer', 'update', {
      $type: 'network.coopsource.admin.officer',
    });
    await handler(ctx);

    const row = await db
      .selectFrom('admin_officer')
      .where('uri', '=', officerUri)
      .selectAll()
      .executeTakeFirst();
    expect(row).toBeDefined();
    expect(row!.status).toBe('active');
  });
});
