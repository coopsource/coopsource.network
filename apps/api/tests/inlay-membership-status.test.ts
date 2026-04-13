import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { P256Keypair } from '@atproto/crypto';
import { InlayAuthVerifier } from '@coopsource/federation/atproto';
import type { DidDocument } from '@coopsource/federation';
import type { DID } from '@coopsource/common';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin, type TestApp } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

/** Mint a viewer JWT (as a viewer's PDS would). */
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

describe('Inlay MembershipStatus component', () => {
  const viewerDid = 'did:plc:viewer123';
  const audienceDid = 'did:web:localhost';
  const lxm = 'network.coopsource.inlay.MembershipStatus';

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
    const publicKeyMultibase = viewerKeypair.did().slice('did:key:'.length);

    // Create a keypair for the admin (who IS a member)
    adminKeypair = await P256Keypair.create({ exportable: true });

    const verifier = new InlayAuthVerifier(
      {
        resolve: async (did: string): Promise<DidDocument> => {
          const keyMap: Record<string, string> = {
            [viewerDid]: publicKeyMultibase,
          };
          // Dynamically add the admin DID once we know it
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

  it('returns element tree for non-member viewer', async () => {
    const token = await mintViewerJwt({
      keypair: viewerKeypair, iss: viewerDid, aud: audienceDid, lxm,
    });

    const res = await bare
      .post('/xrpc/network.coopsource.inlay.MembershipStatus')
      .set('Authorization', `Bearer ${token}`)
      .send({ did: coopDid })
      .expect(200);

    expect(res.body.node).toBeDefined();
    expect(res.body.cache).toBeDefined();
    // Non-member should see "Not a member"
    const json = JSON.stringify(res.body.node);
    expect(json).toContain('Not a member');
  });

  it('rejects GET requests with 405', async () => {
    const res = await bare
      .get('/xrpc/network.coopsource.inlay.MembershipStatus')
      .query({ did: coopDid })
      .expect(405);

    expect(res.body.error).toBe('InvalidMethod');
    expect(res.body.message).toContain('procedure');
  });

  it('returns 401 without a Bearer token', async () => {
    const res = await bare
      .post('/xrpc/network.coopsource.inlay.MembershipStatus')
      .send({ did: coopDid })
      .expect(401);

    expect(res.body.error).toBe('AuthenticationRequired');
  });

  it('returns 404 for nonexistent cooperative', async () => {
    const token = await mintViewerJwt({
      keypair: viewerKeypair, iss: viewerDid, aud: audienceDid, lxm,
    });

    const res = await bare
      .post('/xrpc/network.coopsource.inlay.MembershipStatus')
      .set('Authorization', `Bearer ${token}`)
      .send({ did: 'did:plc:nonexistent' })
      .expect(404);

    expect(res.body.error).toBe('NotFound');
  });

  it('CORS headers are set on POST response', async () => {
    const token = await mintViewerJwt({
      keypair: viewerKeypair, iss: viewerDid, aud: audienceDid, lxm,
    });

    const res = await bare
      .post('/xrpc/network.coopsource.inlay.MembershipStatus')
      .set('Authorization', `Bearer ${token}`)
      .send({ did: coopDid })
      .expect(200);

    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-allow-methods']).toContain('POST');
  });

  it('returns active member status with roles for admin viewer', async () => {
    const token = await mintViewerJwt({
      keypair: adminKeypair, iss: adminDid, aud: audienceDid, lxm,
    });

    const res = await bare
      .post('/xrpc/network.coopsource.inlay.MembershipStatus')
      .set('Authorization', `Bearer ${token}`)
      .send({ did: coopDid })
      .expect(200);

    expect(res.body.node).toBeDefined();
    const json = JSON.stringify(res.body.node);
    expect(json).toContain('Active member');
    expect(json).toContain('admin');
  });
});
