import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('Proposals & Voting', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  /**
   * Helper: create a draft proposal via the API.
   * Returns the response body (formatted camelCase proposal).
   */
  async function createDraftProposal(
    agent: import('supertest').Agent,
    overrides: Record<string, unknown> = {},
  ) {
    const body = {
      title: 'Adopt open-source policy',
      body: 'We should release all internal tools under the MIT license.',
      votingType: 'binary',
      quorumType: 'simpleMajority',
      ...overrides,
    };
    const res = await agent.post('/api/v1/proposals').send(body).expect(201);
    return res.body;
  }

  // ---------------------------------------------------------------
  // 1. Create draft proposal
  // ---------------------------------------------------------------
  it('creates a draft proposal (201, camelCase response)', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    const proposal = await createDraftProposal(testApp.agent);

    expect(proposal.id).toBeDefined();
    expect(proposal.title).toBe('Adopt open-source policy');
    expect(proposal.body).toBe(
      'We should release all internal tools under the MIT license.',
    );
    expect(proposal.status).toBe('draft');
    expect(proposal.votingType).toBe('binary');
    expect(proposal.quorumType).toBe('simpleMajority');
    expect(proposal.quorumBasis).toBeDefined();
    expect(proposal.authorDid).toBe(adminDid);
    expect(proposal.authorDisplayName).toBe('Test Admin');
    expect(proposal.createdAt).toBeDefined();
    // closesAt is null when not provided
    expect(proposal.closesAt).toBeNull();
  });

  // ---------------------------------------------------------------
  // 2. List proposals
  // ---------------------------------------------------------------
  it('lists proposals with cursor-based pagination', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await createDraftProposal(testApp.agent, { title: 'Proposal A' });
    testApp.clock.advance(1000);
    await createDraftProposal(testApp.agent, { title: 'Proposal B' });

    const res = await testApp.agent.get('/api/v1/proposals').expect(200);

    expect(res.body).toHaveProperty('proposals');
    expect(res.body).toHaveProperty('cursor');
    expect(Array.isArray(res.body.proposals)).toBe(true);
    expect(res.body.proposals).toHaveLength(2);
    // Most recent first
    expect(res.body.proposals[0].title).toBe('Proposal B');
    expect(res.body.proposals[1].title).toBe('Proposal A');
  });

  // ---------------------------------------------------------------
  // 3. Get proposal by ID
  // ---------------------------------------------------------------
  it('gets a proposal by ID', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const created = await createDraftProposal(testApp.agent);
    const res = await testApp.agent
      .get(`/api/v1/proposals/${created.id}`)
      .expect(200);

    expect(res.body.id).toBe(created.id);
    expect(res.body.title).toBe(created.title);
    expect(res.body.authorDisplayName).toBe('Test Admin');
  });

  it('does not operate on proposal IDs outside the actor cooperative', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);
    const now = testApp.clock.now();
    const foreignCoopDid = 'did:web:foreign-coop.example.com';
    await testApp.container.db
      .insertInto('entity')
      .values({
        did: foreignCoopDid,
        type: 'cooperative',
        display_name: 'Foreign Cooperative',
        handle: 'foreign-coop',
        description: null,
        status: 'active',
        created_at: now,
        indexed_at: now,
      })
      .execute();
    await testApp.container.db
      .insertInto('cooperative_profile')
      .values({
        entity_did: foreignCoopDid,
        cooperative_type: 'worker',
        is_network: false,
        membership_policy: 'invite_only',
        created_at: now,
        indexed_at: now,
      })
      .execute();

    async function insertForeignProposal(status: string) {
      const [proposal] = await testApp.container.db
        .insertInto('proposal')
        .values({
          uri: `at://${foreignCoopDid}/network.coopsource.governance.proposal/${status}`,
          cid: `cid-${status}`,
          cooperative_did: foreignCoopDid,
          author_did: adminDid,
          title: `Foreign ${status}`,
          body: 'Foreign body',
          body_format: 'text',
          voting_type: 'binary',
          options: null,
          quorum_type: 'simpleMajority',
          quorum_basis: 'votesCast',
          quorum_threshold: null,
          status,
          outcome: null,
          opens_at: status === 'draft' ? null : now,
          closes_at: status === 'closed' ? now : null,
          resolved_at: null,
          class_quorum_rules: null,
          tags: [],
          created_at: now,
          created_by: adminDid,
          invalidated_at: null,
          invalidated_by: null,
          indexed_at: now,
        })
        .returning(['id'])
        .execute();
      return proposal!;
    }

    const draft = await insertForeignProposal('draft');
    const open = await insertForeignProposal('open');
    const closed = await insertForeignProposal('closed');

    await testApp.container.db
      .insertInto('vote')
      .values({
        uri: null,
        cid: null,
        proposal_id: open.id,
        proposal_uri: `at://${foreignCoopDid}/network.coopsource.governance.proposal/open`,
        proposal_cid: 'cid-open',
        voter_did: adminDid,
        choice: 'yes',
        vote_weight: 1,
        rationale: null,
        created_at: now,
        retracted_at: null,
        retracted_by: null,
        indexed_at: now,
      })
      .execute();

    await testApp.agent.get(`/api/v1/proposals/${open.id}`).expect(404);
    await testApp.agent.post(`/api/v1/proposals/${draft.id}/open`).expect(404);
    await testApp.agent.post(`/api/v1/proposals/${open.id}/close`).expect(404);
    await testApp.agent
      .post(`/api/v1/proposals/${closed.id}/resolve`)
      .expect(404);
    await testApp.agent.get(`/api/v1/proposals/${open.id}/votes`).expect(404);
    await testApp.agent
      .get(
        `/api/v1/governance/vote-weight/${encodeURIComponent(
          adminDid,
        )}?proposalId=${open.id}`,
      )
      .expect(404);
    await testApp.agent
      .post(`/api/v1/proposals/${open.id}/vote`)
      .send({ choice: 'yes' })
      .expect(404);
    await testApp.agent.delete(`/api/v1/proposals/${open.id}/vote`).expect(404);
  });

  // ---------------------------------------------------------------
  // 4. Update draft proposal
  // ---------------------------------------------------------------
  it('updates a draft proposal (title change)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const created = await createDraftProposal(testApp.agent, {
      meetingEvent:
        'at://did:plc:eventhost/network.smokesignal.calendar.event/evt1',
      fullDocument: 'at://did:plc:docs/com.whtwnd.blog.entry/doc1',
      discussionThread:
        'at://did:plc:frontpage/fyi.unravel.frontpage.post/thread1',
    });

    const res = await testApp.agent
      .put(`/api/v1/proposals/${created.id}`)
      .send({ title: 'Updated title' })
      .expect(200);

    expect(res.body.title).toBe('Updated title');
    // Body unchanged
    expect(res.body.body).toBe(created.body);
    expect(res.body.status).toBe('draft');

    const row = await testApp.container.db
      .selectFrom('proposal')
      .where('id', '=', created.id)
      .select(['uri'])
      .executeTakeFirstOrThrow();
    const source = await testApp.container.db
      .selectFrom('pds_record')
      .where('uri', '=', row.uri!)
      .select(['content', 'deleted_at'])
      .executeTakeFirstOrThrow();
    const content =
      typeof source.content === 'string'
        ? JSON.parse(source.content)
        : source.content;
    expect(content).toMatchObject({
      title: 'Updated title',
      body: created.body,
      meetingEvent:
        'at://did:plc:eventhost/network.smokesignal.calendar.event/evt1',
      fullDocument: 'at://did:plc:docs/com.whtwnd.blog.entry/doc1',
      discussionThread:
        'at://did:plc:frontpage/fyi.unravel.frontpage.post/thread1',
    });
    expect(source.deleted_at).toBeNull();
  });

  // ---------------------------------------------------------------
  // 5. Open proposal (draft -> open)
  // ---------------------------------------------------------------
  it('opens a draft proposal', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const created = await createDraftProposal(testApp.agent);

    const res = await testApp.agent
      .post(`/api/v1/proposals/${created.id}/open`)
      .expect(200);

    expect(res.body.status).toBe('open');
    expect(res.body.id).toBe(created.id);
  });

  // ---------------------------------------------------------------
  // 6. Cast vote on open proposal
  // ---------------------------------------------------------------
  it('casts a vote on an open proposal (201, camelCase)', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    const created = await createDraftProposal(testApp.agent);
    await testApp.agent
      .post(`/api/v1/proposals/${created.id}/open`)
      .expect(200);

    const res = await testApp.agent
      .post(`/api/v1/proposals/${created.id}/vote`)
      .send({ choice: 'yes', rationale: 'Fully in favor' })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.proposalId).toBe(created.id);
    expect(res.body.voterDid).toBe(adminDid);
    expect(res.body.voterDisplayName).toBe('Test Admin');
    expect(res.body.choice).toBe('yes');
    expect(res.body.rationale).toBe('Fully in favor');
    expect(res.body.createdAt).toBeDefined();
  });

  // ---------------------------------------------------------------
  // 7. Re-vote (auto-retracts previous via partial unique index)
  // ---------------------------------------------------------------
  it('re-votes by auto-retracting the previous vote', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const created = await createDraftProposal(testApp.agent);
    await testApp.agent
      .post(`/api/v1/proposals/${created.id}/open`)
      .expect(200);

    // First vote
    const vote1 = await testApp.agent
      .post(`/api/v1/proposals/${created.id}/vote`)
      .send({ choice: 'yes' })
      .expect(201);

    // Re-vote with different choice
    const vote2 = await testApp.agent
      .post(`/api/v1/proposals/${created.id}/vote`)
      .send({ choice: 'no' })
      .expect(201);

    // Should be a new vote row
    expect(vote2.body.id).not.toBe(vote1.body.id);
    expect(vote2.body.choice).toBe('no');

    // Verify only the new vote is active via the votes endpoint
    const votesRes = await testApp.agent
      .get(`/api/v1/proposals/${created.id}/votes`)
      .expect(200);

    expect(votesRes.body.votes).toHaveLength(1);
    expect(votesRes.body.votes[0].choice).toBe('no');
    expect(votesRes.body.tally.no).toBe(1);
  });

  // ---------------------------------------------------------------
  // 8. Retract vote (DELETE)
  // ---------------------------------------------------------------
  it('retracts a vote (204)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const created = await createDraftProposal(testApp.agent);
    await testApp.agent
      .post(`/api/v1/proposals/${created.id}/open`)
      .expect(200);

    await testApp.agent
      .post(`/api/v1/proposals/${created.id}/vote`)
      .send({ choice: 'yes' })
      .expect(201);

    await testApp.agent
      .delete(`/api/v1/proposals/${created.id}/vote`)
      .expect(204);

    // Verify no active votes
    const votesRes = await testApp.agent
      .get(`/api/v1/proposals/${created.id}/votes`)
      .expect(200);

    expect(votesRes.body.votes).toHaveLength(0);
  });

  // ---------------------------------------------------------------
  // 9. Re-vote after retraction (partial unique index allows it)
  // ---------------------------------------------------------------
  it('allows re-voting after retraction', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const created = await createDraftProposal(testApp.agent);
    await testApp.agent
      .post(`/api/v1/proposals/${created.id}/open`)
      .expect(200);

    // Vote, retract, then vote again
    await testApp.agent
      .post(`/api/v1/proposals/${created.id}/vote`)
      .send({ choice: 'yes' })
      .expect(201);

    await testApp.agent
      .delete(`/api/v1/proposals/${created.id}/vote`)
      .expect(204);

    const res = await testApp.agent
      .post(`/api/v1/proposals/${created.id}/vote`)
      .send({ choice: 'abstain' })
      .expect(201);

    expect(res.body.choice).toBe('abstain');

    // Only the new vote should be active
    const votesRes = await testApp.agent
      .get(`/api/v1/proposals/${created.id}/votes`)
      .expect(200);

    expect(votesRes.body.votes).toHaveLength(1);
    expect(votesRes.body.votes[0].choice).toBe('abstain');
  });

  // ---------------------------------------------------------------
  // 10. Close proposal (admin only)
  // ---------------------------------------------------------------
  it('closes an open proposal (admin only)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const created = await createDraftProposal(testApp.agent);
    await testApp.agent
      .post(`/api/v1/proposals/${created.id}/open`)
      .expect(200);

    const res = await testApp.agent
      .post(`/api/v1/proposals/${created.id}/close`)
      .expect(200);

    expect(res.body.status).toBe('closed');
    expect(res.body.id).toBe(created.id);
  });

  // ---------------------------------------------------------------
  // 11. Resolve proposal (tallies votes, returns result)
  // ---------------------------------------------------------------
  it('resolves a closed proposal with vote tally', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const created = await createDraftProposal(testApp.agent);

    // Open -> vote -> close -> resolve
    await testApp.agent
      .post(`/api/v1/proposals/${created.id}/open`)
      .expect(200);

    await testApp.agent
      .post(`/api/v1/proposals/${created.id}/vote`)
      .send({ choice: 'yes' })
      .expect(201);

    await testApp.agent
      .post(`/api/v1/proposals/${created.id}/close`)
      .expect(200);

    const res = await testApp.agent
      .post(`/api/v1/proposals/${created.id}/resolve`)
      .expect(200);

    expect(res.body.status).toBe('resolved');
    expect(res.body.id).toBe(created.id);
  });

  it('closes and resolves expired open proposals in the background', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);
    const closesAt = new Date(testApp.clock.now().getTime() + 1_000);
    const created = await createDraftProposal(testApp.agent, {
      closesAt: closesAt.toISOString(),
    });

    await testApp.agent
      .post(`/api/v1/proposals/${created.id}/open`)
      .expect(200);
    testApp.clock.advance(1_001);

    await testApp.container.proposalService.resolveExpiredProposals();

    const resolved = await testApp.container.db
      .selectFrom('proposal')
      .where('id', '=', created.id)
      .select(['status', 'outcome', 'resolved_at'])
      .executeTakeFirstOrThrow();
    expect(resolved.status).toBe('resolved');
    expect(resolved.outcome).toBe('no_quorum');
    expect(resolved.resolved_at).toEqual(testApp.clock.now());
  });

  it('retries resolution for an already-closed expired proposal', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);
    const closesAt = new Date(testApp.clock.now().getTime() + 1_000);
    const created = await createDraftProposal(testApp.agent, {
      closesAt: closesAt.toISOString(),
    });

    await testApp.container.proposalService.openProposal(created.id, adminDid);
    testApp.clock.advance(1_001);
    await testApp.container.proposalService.closeProposal(created.id, adminDid);

    await testApp.container.proposalService.resolveExpiredProposals();

    const resolved = await testApp.container.db
      .selectFrom('proposal')
      .where('id', '=', created.id)
      .select(['status', 'resolved_at'])
      .executeTakeFirstOrThrow();
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolved_at).toEqual(testApp.clock.now());
  });

  // ---------------------------------------------------------------
  // 12. Delete proposal (soft delete, 204)
  // ---------------------------------------------------------------
  it('soft-deletes a proposal (204)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const created = await createDraftProposal(testApp.agent);

    await testApp.agent.delete(`/api/v1/proposals/${created.id}`).expect(204);

    const row = await testApp.container.db
      .selectFrom('proposal')
      .where('id', '=', created.id)
      .select(['uri'])
      .executeTakeFirstOrThrow();
    const source = await testApp.container.db
      .selectFrom('pds_record')
      .where('uri', '=', row.uri!)
      .select(['deleted_at'])
      .executeTakeFirstOrThrow();
    expect(source.deleted_at).not.toBeNull();

    // Should no longer appear in list
    const listRes = await testApp.agent.get('/api/v1/proposals').expect(200);
    expect(listRes.body.proposals).toHaveLength(0);

    // Should 404 on direct get
    await testApp.agent.get(`/api/v1/proposals/${created.id}`).expect(404);
  });

  // ---------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------
  it('rejects voting on a draft proposal', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const created = await createDraftProposal(testApp.agent);

    // Try to vote on a draft (not open)
    await testApp.agent
      .post(`/api/v1/proposals/${created.id}/vote`)
      .send({ choice: 'yes' })
      .expect(400);
  });

  it('rejects creating proposal with missing title', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/proposals')
      .send({
        body: 'No title',
        votingType: 'binary',
        quorumType: 'simpleMajority',
      })
      .expect(400);
  });
});
