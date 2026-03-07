import { describe, it, expect, beforeEach, vi } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

/**
 * Integration tests verifying MemberWriteProxy is wired through the API routes.
 *
 * In test mode (NODE_ENV=test), the proxy falls back to pdsService with
 * console.warn. These tests verify:
 * 1. The fallback works correctly (records still created)
 * 2. Warnings are emitted (proving the proxy path is active)
 * 3. All existing flows continue to function
 */
describe('Write proxy integration (dev-mode fallback)', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  it('membership creation routes through MemberWriteProxy (fallback)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    // Register a new member — this triggers auth-service.register()
    // which writes org.membership via MemberWriteProxy
    const res = await testApp.agent
      .post('/api/v1/auth/register')
      .send({
        email: 'member@test.com',
        password: 'password123',
        displayName: 'Test Member',
      })
      .expect(201);

    expect(res.body.did).toBeDefined();

    // Verify MemberWriteProxy fallback warning was emitted
    const membershipWarnings = warnSpy.mock.calls.filter(
      (call) =>
        typeof call[0] === 'string' &&
        call[0].includes('[MemberWriteProxy]') &&
        call[0].includes('org.membership'),
    );
    expect(membershipWarnings.length).toBeGreaterThanOrEqual(1);

    warnSpy.mockRestore();
  });

  it('vote casting routes through MemberWriteProxy (fallback)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    // Create a proposal first
    const proposalRes = await testApp.agent
      .post('/api/v1/proposals')
      .send({
        title: 'Test proposal',
        body: 'Testing write proxy routing',
        votingType: 'binary',
        quorumType: 'simpleMajority',
      })
      .expect(201);

    // Open the proposal for voting
    await testApp.agent
      .post(`/api/v1/proposals/${proposalRes.body.id}/open`)
      .expect(200);

    // Cast a vote — this triggers ProposalService.castVote()
    // which writes governance.vote via MemberWriteProxy
    await testApp.agent
      .post(`/api/v1/proposals/${proposalRes.body.id}/vote`)
      .send({ choice: 'yes', rationale: 'I agree' })
      .expect(201);

    // Verify MemberWriteProxy fallback warning was emitted for the vote
    const voteWarnings = warnSpy.mock.calls.filter(
      (call) =>
        typeof call[0] === 'string' &&
        call[0].includes('[MemberWriteProxy]') &&
        call[0].includes('governance.vote'),
    );
    expect(voteWarnings.length).toBeGreaterThanOrEqual(1);

    warnSpy.mockRestore();
  });

  it('agreement signing routes through MemberWriteProxy (fallback)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const testApp = createTestApp();
    const { coopDid } = await setupAndLogin(testApp);

    // Create an agreement
    const agRes = await testApp.agent
      .post('/api/v1/agreements')
      .send({
        projectUri: coopDid,
        title: 'Test Agreement',
        purpose: 'Testing',
        scope: 'All members',
        terms: 'We agree to test things.',
      })
      .expect(201);

    // Open the agreement for signing
    await testApp.agent
      .post(`/api/v1/agreements/${encodeURIComponent(agRes.body.uri)}/open`)
      .send({})
      .expect(200);

    // Sign the agreement — triggers AgreementService.signAgreement()
    // which writes agreement.signature via MemberWriteProxy
    await testApp.agent
      .post(`/api/v1/agreements/${encodeURIComponent(agRes.body.uri)}/sign`)
      .send({ statement: 'I agree' })
      .expect(201);

    // Verify MemberWriteProxy fallback warning for signature
    const sigWarnings = warnSpy.mock.calls.filter(
      (call) =>
        typeof call[0] === 'string' &&
        call[0].includes('[MemberWriteProxy]') &&
        call[0].includes('agreement.signature'),
    );
    expect(sigWarnings.length).toBeGreaterThanOrEqual(1);

    warnSpy.mockRestore();
  });

  it('operator audit log records cooperative writes', async () => {
    const testApp = createTestApp();
    const { coopDid, adminDid } = await setupAndLogin(testApp);

    // Use OperatorWriteProxy directly to write a cooperative record
    const ref = await testApp.container.operatorWriteProxy.writeCoopRecord({
      operatorDid: adminDid,
      cooperativeDid: coopDid as import('@coopsource/common').DID,
      collection: 'network.coopsource.org.memberApproval',
      record: {
        member: 'did:plc:testmember',
        roles: ['member'],
        createdAt: new Date().toISOString(),
      },
    });

    expect(ref.uri).toBeTruthy();

    // Verify audit log entry was created
    const logs = await testApp.container.db
      .selectFrom('operator_audit_log')
      .where('cooperative_did', '=', coopDid)
      .selectAll()
      .execute();

    expect(logs).toHaveLength(1);
    expect(logs[0]!.operator_did).toBe(adminDid);
    expect(logs[0]!.collection).toBe('network.coopsource.org.memberApproval');
  });
});
