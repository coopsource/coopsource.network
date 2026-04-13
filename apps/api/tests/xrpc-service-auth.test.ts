import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { P256Keypair } from '@atproto/crypto';
import { ServiceAuthVerifier } from '@coopsource/federation/atproto';
import type { DidDocument } from '@coopsource/federation';
import type { DID } from '@coopsource/common';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin, type TestApp } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

/** Mint a service-auth JWT. */
async function mintJwt(opts: {
  keypair: P256Keypair;
  iss: string;
  aud: string;
  lxm: string;
  sub?: string;
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
  if (opts.sub !== undefined) payload.sub = opts.sub;

  const h = Buffer.from(JSON.stringify(header)).toString('base64url');
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signingInput = `${h}.${p}`;
  const sig = await opts.keypair.sign(new TextEncoder().encode(signingInput));
  return `${signingInput}.${Buffer.from(sig).toString('base64url')}`;
}

describe('XRPC service-auth integration', () => {
  const issuerDid = 'did:plc:externalapp123';
  const audienceDid = 'did:web:localhost';
  const lxm = 'network.coopsource.org.getCooperative';

  let testApp: TestApp;
  let coopDid: string;
  let keypair: P256Keypair;
  let bare: ReturnType<typeof supertest>;

  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();

    // Generate a keypair for the external app
    keypair = await P256Keypair.create({ exportable: true });
    const publicKeyMultibase = keypair.did().slice('did:key:'.length);

    // Create a ServiceAuthVerifier with a mock DID resolver
    const verifier = new ServiceAuthVerifier(
      {
        resolve: async (did: string): Promise<DidDocument> => {
          if (did === issuerDid) {
            return {
              '@context': ['https://www.w3.org/ns/did/v1'],
              id: issuerDid as DID,
              verificationMethod: [{
                id: `${issuerDid}#atproto`,
                type: 'Multikey',
                controller: issuerDid,
                publicKeyMultibase,
              }],
              service: [],
            };
          }
          throw new Error(`Unknown DID: ${did}`);
        },
      },
      audienceDid,
      new Set([issuerDid]),
    );

    // Create test app with the service-auth verifier wired into the XRPC dispatcher
    testApp = createTestApp({ xrpcRouteOptions: { serviceAuthVerifier: verifier } });
    const setup = await setupAndLogin(testApp);
    coopDid = setup.coopDid;

    // Bare supertest (no session cookie) for testing Bearer auth
    bare = supertest(testApp.app);
  });

  it('accepts a valid Bearer JWT and returns cooperative data', async () => {
    const token = await mintJwt({
      keypair, iss: issuerDid, aud: audienceDid, lxm,
    });

    const res = await bare
      .get('/xrpc/network.coopsource.org.getCooperative')
      .set('Authorization', `Bearer ${token}`)
      .query({ cooperative: coopDid })
      .expect(200);

    expect(res.body.did).toBe(coopDid);
    expect(res.body.displayName).toBe('Test Cooperative');
  });

  it('sets viewer.did to sub claim when present', async () => {
    const userDid = 'did:plc:someuser456';
    const memberLxm = 'network.coopsource.org.getMembership';
    const token = await mintJwt({
      keypair, iss: issuerDid, aud: audienceDid,
      lxm: memberLxm, sub: userDid,
    });

    // getMembership requires auth and uses viewer.did to check the membership.
    // The viewer should be the sub DID (userDid), not the issuer. Since this
    // user has no membership, we get { isMember: false } — proving
    // service-auth resolved the viewer successfully (200, not 401).
    const res = await bare
      .get('/xrpc/network.coopsource.org.getMembership')
      .set('Authorization', `Bearer ${token}`)
      .query({ cooperative: coopDid })
      .expect(200);

    expect(res.body.isMember).toBe(false);
  });

  it('rejects an expired Bearer JWT with 401', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await mintJwt({
      keypair, iss: issuerDid, aud: audienceDid, lxm,
      exp: now - 120,
    });

    const res = await bare
      .get('/xrpc/network.coopsource.org.getCooperative')
      .set('Authorization', `Bearer ${token}`)
      .query({ cooperative: coopDid })
      .expect(401);

    expect(res.body.error).toBe('AuthenticationRequired');
    expect(res.body.message).toContain('expired');
  });

  it('rejects a JWT from an untrusted issuer with 401', async () => {
    const untrustedKeypair = await P256Keypair.create({ exportable: true });
    const token = await mintJwt({
      keypair: untrustedKeypair,
      iss: 'did:plc:untrusted999',
      aud: audienceDid, lxm,
    });

    const res = await bare
      .get('/xrpc/network.coopsource.org.getCooperative')
      .set('Authorization', `Bearer ${token}`)
      .query({ cooperative: coopDid })
      .expect(401);

    expect(res.body.error).toBe('AuthenticationRequired');
    expect(res.body.message).toContain('Untrusted');
  });

  it('existing session auth still works when no Bearer header', async () => {
    // The testApp.agent has a session cookie from setupAndLogin
    const res = await testApp.agent
      .get('/xrpc/network.coopsource.org.getCooperative')
      .query({ cooperative: coopDid })
      .expect(200);

    expect(res.body.did).toBe(coopDid);
  });

  it('CORS includes Authorization in allowed headers', async () => {
    const res = await bare
      .options('/xrpc/network.coopsource.org.getCooperative')
      .expect(204);

    expect(res.headers['access-control-allow-headers']).toContain('Authorization');
  });
});
