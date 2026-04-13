import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { P256Keypair } from '@atproto/crypto';
import { InlayAuthVerifier } from '@coopsource/federation/atproto';
import type { DidDocument } from '@coopsource/federation';
import type { DID } from '@coopsource/common';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin, type TestApp } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

/** Mint a viewer JWT (same helper as inlay-membership-status.test.ts). */
async function mintViewerJwt(opts: {
  keypair: P256Keypair;
  iss: string;
  aud: string;
  lxm: string;
  exp?: number;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', typ: 'JWT' };
  const payload: Record<string, unknown> = {
    iss: opts.iss, aud: opts.aud, lxm: opts.lxm,
    exp: opts.exp ?? now + 60,
    iat: now,
    jti: crypto.randomUUID(),
  };

  const h = Buffer.from(JSON.stringify(header)).toString('base64url');
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signingInput = `${h}.${p}`;
  const sig = await opts.keypair.sign(new TextEncoder().encode(signingInput));
  return `${signingInput}.${Buffer.from(sig).toString('base64url')}`;
}

describe('Inlay VoteWidget component', () => {
  const viewerDid = 'did:plc:voter456';
  const audienceDid = 'did:web:localhost';
  const lxm = 'network.coopsource.inlay.VoteWidget';

  let testApp: TestApp;
  let coopDid: string;
  let adminDid: string;
  let viewerKeypair: P256Keypair;
  let adminKeypair: P256Keypair;
  let bare: ReturnType<typeof supertest>;

  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();

    viewerKeypair = await P256Keypair.create({ exportable: true });
    const viewerPkm = viewerKeypair.did().slice('did:key:'.length);

    adminKeypair = await P256Keypair.create({ exportable: true });

    const verifier = new InlayAuthVerifier(
      {
        resolve: async (did: string): Promise<DidDocument> => {
          const keyMap: Record<string, string> = {
            [viewerDid]: viewerPkm,
          };
          if (adminDid) {
            keyMap[adminDid] = adminKeypair.did().slice('did:key:'.length);
          }
          const pkm = keyMap[did];
          if (!pkm) throw new Error(`Unknown DID: ${did}`);
          return {
            '@context': ['https://www.w3.org/ns/did/v1'],
            id: did as DID,
            verificationMethod: [{
              id: `${did}#atproto`,
              type: 'Multikey',
              controller: did,
              publicKeyMultibase: pkm,
            }],
            service: [],
          };
        },
      },
      audienceDid,
    );

    testApp = createTestApp({
      xrpcRouteOptions: { inlayAuthVerifier: verifier },
    });
    const setup = await setupAndLogin(testApp);
    coopDid = setup.coopDid;
    adminDid = setup.adminDid;

    bare = supertest(testApp.app);
  });

  async function createOpenProposal(title = 'Test Proposal') {
    const proposal = await testApp.container.proposalService.createProposal(
      adminDid,
      {
        cooperativeDid: coopDid,
        title,
        body: `Body of ${title}`,
        votingType: 'binary',
        quorumType: 'simpleMajority',
      },
    );
    await testApp.container.proposalService.openProposal(proposal.id, adminDid);
    // Re-fetch to get updated status
    const updated = await testApp.container.proposalService.getProposal(proposal.id);
    return updated!.proposal;
  }

  it('shows eligible status for active member viewer', async () => {
    const proposal = await createOpenProposal();

    const token = await mintViewerJwt({
      keypair: adminKeypair, iss: adminDid, aud: audienceDid, lxm,
    });

    const res = await bare
      .post('/xrpc/network.coopsource.inlay.VoteWidget')
      .set('Authorization', `Bearer ${token}`)
      .send({ uri: proposal.uri })
      .expect(200);

    expect(res.body.node).toBeDefined();
    expect(res.body.cache.life).toBe('seconds');

    const json = JSON.stringify(res.body.node);
    expect(json).toContain('Test Proposal');
    expect(json).toContain('You can vote on this proposal');
    expect(json).toContain('Vote now');
  });

  it('shows already-voted status', async () => {
    const proposal = await createOpenProposal();

    // Admin casts a vote
    await testApp.container.proposalService.castVote({
      proposalId: proposal.id,
      voterDid: adminDid,
      choice: 'yes',
    });

    const token = await mintViewerJwt({
      keypair: adminKeypair, iss: adminDid, aud: audienceDid, lxm,
    });

    const res = await bare
      .post('/xrpc/network.coopsource.inlay.VoteWidget')
      .set('Authorization', `Bearer ${token}`)
      .send({ uri: proposal.uri })
      .expect(200);

    const json = JSON.stringify(res.body.node);
    expect(json).toContain('You have already voted');
  });

  it('shows members-only for non-member viewer on open coop', async () => {
    const proposal = await createOpenProposal();

    const token = await mintViewerJwt({
      keypair: viewerKeypair, iss: viewerDid, aud: audienceDid, lxm,
    });

    const res = await bare
      .post('/xrpc/network.coopsource.inlay.VoteWidget')
      .set('Authorization', `Bearer ${token}`)
      .send({ uri: proposal.uri })
      .expect(200);

    const json = JSON.stringify(res.body.node);
    expect(json).toContain('Members only');
  });

  it('shows voting-ended for closed proposal', async () => {
    const proposal = await createOpenProposal();
    await testApp.container.proposalService.closeProposal(proposal.id, adminDid);

    const token = await mintViewerJwt({
      keypair: adminKeypair, iss: adminDid, aud: audienceDid, lxm,
    });

    const res = await bare
      .post('/xrpc/network.coopsource.inlay.VoteWidget')
      .set('Authorization', `Bearer ${token}`)
      .send({ uri: proposal.uri })
      .expect(200);

    const json = JSON.stringify(res.body.node);
    expect(json).toContain('Voting has ended');
  });

  it('returns 404 for closed-coop non-member viewer', async () => {
    await testApp.container.db
      .updateTable('cooperative_profile')
      .set({ governance_visibility: 'closed' })
      .where('entity_did', '=', coopDid)
      .execute();

    const proposal = await createOpenProposal();

    const token = await mintViewerJwt({
      keypair: viewerKeypair, iss: viewerDid, aud: audienceDid, lxm,
    });

    const res = await bare
      .post('/xrpc/network.coopsource.inlay.VoteWidget')
      .set('Authorization', `Bearer ${token}`)
      .send({ uri: proposal.uri })
      .expect(404);

    expect(res.body.error).toBe('NotFound');
  });

  it('returns 401 without Bearer token', async () => {
    const proposal = await createOpenProposal();

    const res = await bare
      .post('/xrpc/network.coopsource.inlay.VoteWidget')
      .send({ uri: proposal.uri })
      .expect(401);

    expect(res.body.error).toBe('AuthenticationRequired');
  });

  it('returns 404 for invalid AT-URI', async () => {
    const token = await mintViewerJwt({
      keypair: adminKeypair, iss: adminDid, aud: audienceDid, lxm,
    });

    const res = await bare
      .post('/xrpc/network.coopsource.inlay.VoteWidget')
      .set('Authorization', `Bearer ${token}`)
      .send({ uri: 'at://did:plc:fake/network.coopsource.governance.proposal/nonexistent' })
      .expect(404);

    expect(res.body.error).toBe('NotFound');
  });

  it('shows delegation weight when > 1', async () => {
    const proposal = await createOpenProposal();

    // Insert a delegation: some DID delegates their vote to admin
    const delegatorDid = 'did:plc:delegator789';
    await testApp.container.db
      .insertInto('delegation')
      .values({
        uri: `at://${delegatorDid}/network.coopsource.governance.delegation/1`,
        did: coopDid,
        rkey: '1',
        project_uri: coopDid,
        delegator_did: delegatorDid,
        delegatee_did: adminDid,
        scope: 'project',
        proposal_uri: null,
        status: 'active',
        created_at: new Date(),
        indexed_at: new Date(),
      })
      .execute();

    const token = await mintViewerJwt({
      keypair: adminKeypair, iss: adminDid, aud: audienceDid, lxm,
    });

    const res = await bare
      .post('/xrpc/network.coopsource.inlay.VoteWidget')
      .set('Authorization', `Bearer ${token}`)
      .send({ uri: proposal.uri })
      .expect(200);

    const json = JSON.stringify(res.body.node);
    expect(json).toContain('Vote weight:');
    expect(json).toContain('includes delegations');
  });

  it('shows vote tally', async () => {
    const proposal = await createOpenProposal();

    // Cast a vote so tally is non-empty
    await testApp.container.proposalService.castVote({
      proposalId: proposal.id,
      voterDid: adminDid,
      choice: 'yes',
    });

    const token = await mintViewerJwt({
      keypair: viewerKeypair, iss: viewerDid, aud: audienceDid, lxm,
    });

    const res = await bare
      .post('/xrpc/network.coopsource.inlay.VoteWidget')
      .set('Authorization', `Bearer ${token}`)
      .send({ uri: proposal.uri })
      .expect(200);

    const json = JSON.stringify(res.body.node);
    // Tally should show the "yes" vote
    expect(json).toContain('yes');
  });
});
