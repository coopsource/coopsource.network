import { describe, it, expect, beforeEach } from 'vitest';
import type { FirehoseEvent } from '@coopsource/federation';
import type { AtUri, CID, DID } from '@coopsource/common';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, type TestApp } from './helpers/test-app.js';
import { indexMemberConsent } from '../src/appview/indexers/membership-indexer.js';

const COOP = 'did:plc:coop' as DID;
const MEMBER = 'did:plc:member' as DID;

function event(over: Partial<FirehoseEvent>): FirehoseEvent {
  return {
    seq: 1,
    did: MEMBER,
    operation: 'create',
    uri: 'at://did:plc:member/network.coopsource.org.memberConsent/1' as AtUri,
    cid: 'bafyreiverified' as CID,
    time: '2026-07-04T00:00:00.000Z',
    ...over,
  };
}

describe('indexMemberConsent', () => {
  let testApp: TestApp;

  beforeEach(async () => {
    await truncateAllTables();
    testApp = createTestApp();
    await testApp.container.db
      .insertInto('entity')
      .values([
        { did: COOP, type: 'cooperative', display_name: 'Coop', status: 'active', created_at: new Date('2026-01-01T00:00:00Z'), indexed_at: new Date('2026-01-01T00:00:00Z') },
        { did: MEMBER, type: 'person', display_name: 'Member', status: 'active', created_at: new Date('2026-01-01T00:00:00Z'), indexed_at: new Date('2026-01-01T00:00:00Z') },
      ])
      .execute();
    await testApp.container.db
      .insertInto('membership')
      .values({
        member_did: MEMBER,
        cooperative_did: COOP,
        status: 'active',
        directory_visible: false,
        member_record_uri: 'at://did:plc:member/network.coopsource.org.memberConsent/1',
        member_record_cid: 'bafyreiverified',
        joined_at: new Date('2026-01-01T00:00:00Z'),
        created_at: new Date('2026-01-01T00:00:00Z'),
        indexed_at: new Date('2026-01-01T00:00:00Z'),
      })
      .execute();
  });

  async function pointer() {
    return testApp.container.db
      .selectFrom('membership')
      .where('member_did', '=', MEMBER)
      .where('cooperative_did', '=', COOP)
      .select(['member_record_uri', 'member_record_cid'])
      .executeTakeFirst();
  }

  it('clears the pointer on delete even though the firehose sends cid=""', async () => {
    // Deletes carry cid='' (op.cid is null); clearing must match on (author, uri).
    await indexMemberConsent(
      testApp.container.db,
      event({ operation: 'delete', cid: '' as CID }),
    );
    const p = await pointer();
    expect(p?.member_record_uri).toBeNull();
    expect(p?.member_record_cid).toBeNull();
  });

  it('does not overwrite a verified pointer with an invalid consentType record', async () => {
    await indexMemberConsent(
      testApp.container.db,
      event({
        cid: 'bafyreimalicious' as CID,
        record: { cooperative: COOP, consentType: 'totally-bogus', createdAt: '2026-07-04T00:00:00.000Z' },
      }),
    );
    const p = await pointer();
    expect(p?.member_record_cid).toBe('bafyreiverified'); // unchanged
  });

  it('projects a valid consentType record', async () => {
    await indexMemberConsent(
      testApp.container.db,
      event({
        cid: 'bafyreinew' as CID,
        record: { cooperative: COOP, consentType: 'joinRequest', createdAt: '2026-07-04T00:00:00.000Z' },
      }),
    );
    const p = await pointer();
    expect(p?.member_record_cid).toBe('bafyreinew');
  });
});
