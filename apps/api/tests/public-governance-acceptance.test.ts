import { describe, it, expect, beforeEach } from 'vitest';
import type { FirehoseEvent } from '@coopsource/federation';
import { truncateAllTables, getTestDb } from './helpers/test-db.js';
import { createTestApp, setupAndLogin, type TestApp } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';
import { indexProposal, indexVote } from '../src/appview/indexers/proposal-indexer.js';

/**
 * Audit finding C-01: the public firehose projectors applied no application
 * authority. The proposal projector trusted the cooperative DID asserted by the
 * record itself, the vote projector accepted any repo author referencing a known
 * proposal, and absent membership defaulted to vote weight 1 — so an arbitrary
 * public ATProto identity could inject proposals and counted votes into another
 * cooperative's governance state.
 *
 * The permissioned path already gates on space membership; this closes the
 * asymmetry on the public path.
 */
const OUTSIDER = 'did:web:outsider.example';

describe('Public governance acceptance gate (C-01)', () => {
  let testApp: TestApp;
  let coopDid: string;
  let memberDid: string;

  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
    testApp = createTestApp();
    const result = await setupAndLogin(testApp);
    coopDid = result.coopDid;
    memberDid = result.adminDid;
  });

  function proposalEvent(authorDid: string, declaredCoop: string, rkey = 'p1'): FirehoseEvent {
    return {
      seq: 1,
      did: authorDid as FirehoseEvent['did'],
      operation: 'create',
      uri: `at://${authorDid}/network.coopsource.governance.proposal/${rkey}` as FirehoseEvent['uri'],
      cid: `bafyproposal${rkey}` as FirehoseEvent['cid'],
      time: new Date().toISOString(),
      record: {
        $type: 'network.coopsource.governance.proposal',
        cooperative: declaredCoop,
        title: 'Injected proposal',
        body: 'Body',
        createdAt: new Date().toISOString(),
        status: 'voting',
      },
    };
  }

  function voteEvent(authorDid: string, proposalUri: string): FirehoseEvent {
    return {
      seq: 2,
      did: authorDid as FirehoseEvent['did'],
      operation: 'create',
      uri: `at://${authorDid}/network.coopsource.governance.vote/v1` as FirehoseEvent['uri'],
      cid: 'bafyvote1' as FirehoseEvent['cid'],
      time: new Date().toISOString(),
      record: {
        $type: 'network.coopsource.governance.vote',
        proposal: proposalUri,
        choice: 'yes',
        createdAt: new Date().toISOString(),
      },
    };
  }

  async function proposalCount(): Promise<number> {
    const rows = await getTestDb().selectFrom('proposal').select('uri').execute();
    return rows.length;
  }

  async function seedMemberProposal(): Promise<string> {
    const event = proposalEvent(memberDid, coopDid, 'member1');
    await indexProposal(getTestDb(), event);
    return event.uri;
  }

  it('discards a proposal whose author is not a member of the declared cooperative', async () => {
    await indexProposal(getTestDb(), proposalEvent(OUTSIDER, coopDid));

    expect(await proposalCount()).toBe(0);
  });

  it('discards a proposal declaring a cooperative that does not exist locally', async () => {
    await indexProposal(getTestDb(), proposalEvent(OUTSIDER, 'did:web:nonexistent.example'));

    expect(await proposalCount()).toBe(0);
  });

  it('discards a proposal for a suspended cooperative', async () => {
    await getTestDb()
      .updateTable('entity')
      .set({ status: 'suspended' })
      .where('did', '=', coopDid)
      .execute();

    await indexProposal(getTestDb(), proposalEvent(memberDid, coopDid));

    expect(await proposalCount()).toBe(0);
  });

  it('still projects a proposal authored by an active member', async () => {
    await seedMemberProposal();

    expect(await proposalCount()).toBe(1);
  });

  it('discards a vote cast by a non-member', async () => {
    const proposalUri = await seedMemberProposal();

    await indexVote(getTestDb(), voteEvent(OUTSIDER, proposalUri));

    const votes = await getTestDb().selectFrom('vote').selectAll().execute();
    expect(votes).toEqual([]);
  });

  it('never assigns a default weight to a non-member ballot', async () => {
    const proposalUri = await seedMemberProposal();

    await indexVote(getTestDb(), voteEvent(OUTSIDER, proposalUri));

    const weights = await getTestDb().selectFrom('vote').select('vote_weight').execute();
    expect(weights).toEqual([]);
  });

  it('still projects a vote cast by an active member', async () => {
    const proposalUri = await seedMemberProposal();

    await indexVote(getTestDb(), voteEvent(memberDid, proposalUri));

    const votes = await getTestDb().selectFrom('vote').select('voter_did').execute();
    expect(votes.map((v) => v.voter_did)).toEqual([memberDid]);
  });

  it('discards a vote arriving after the proposal deadline', async () => {
    const proposalUri = await seedMemberProposal();
    await getTestDb()
      .updateTable('proposal')
      .set({ closes_at: new Date(Date.now() - 60_000) })
      .where('uri', '=', proposalUri)
      .execute();

    await indexVote(getTestDb(), voteEvent(memberDid, proposalUri));

    const votes = await getTestDb().selectFrom('vote').selectAll().execute();
    expect(votes).toEqual([]);
  });

  it('re-projects a vote after its proposal resolves, so a reindex is not lossy', async () => {
    const proposalUri = await seedMemberProposal();
    const event = voteEvent(memberDid, proposalUri);
    await indexVote(getTestDb(), event);

    // Voting closes and the proposal resolves, then projections are rebuilt
    // from the canonical records the way a reindex or backfill would.
    await getTestDb()
      .updateTable('proposal')
      .set({ status: 'resolved' })
      .where('uri', '=', proposalUri)
      .execute();
    await getTestDb().deleteFrom('vote').execute();

    await indexVote(getTestDb(), event);

    const votes = await getTestDb().selectFrom('vote').select('voter_did').execute();
    expect(votes.map((v) => v.voter_did)).toEqual([memberDid]);
  });

  it('still discards a late ballot on replay, because the deadline is time-invariant', async () => {
    const proposalUri = await seedMemberProposal();
    await getTestDb()
      .updateTable('proposal')
      .set({ closes_at: new Date(Date.now() - 60_000) })
      .where('uri', '=', proposalUri)
      .execute();

    await indexVote(getTestDb(), voteEvent(memberDid, proposalUri));
    await indexVote(getTestDb(), voteEvent(memberDid, proposalUri));

    expect(await getTestDb().selectFrom('vote').selectAll().execute()).toEqual([]);
  });

  it('projects a permissioned ballot with weight 1 when no membership row exists yet', async () => {
    const proposalUri = await seedMemberProposal();
    // The author is a known entity but has no projected membership row.
    await getTestDb()
      .insertInto('entity')
      .values({ did: OUTSIDER, type: 'person', display_name: 'Outsider' })
      .execute();

    // Space membership is the authority on the permissioned path; the projected
    // membership row may legitimately lag behind it.
    await indexVote(getTestDb(), voteEvent(OUTSIDER, proposalUri), {
      authorityVerified: true,
    });

    const votes = await getTestDb().selectFrom('vote').select(['voter_did', 'vote_weight']).execute();
    expect(votes).toEqual([{ voter_did: OUTSIDER, vote_weight: 1 }]);
  });

  it('reports an absent proposal as an ordering gap, not a rejection', async () => {
    const missing = `at://${memberDid}/network.coopsource.governance.proposal/absent`;

    const handled = await indexVote(getTestDb(), voteEvent(memberDid, missing));

    expect(handled).toBe(false);
  });
});
