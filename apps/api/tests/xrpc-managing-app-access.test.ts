import { beforeEach, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import { P256Keypair } from '@atproto/crypto';
import type { DID } from '@coopsource/common';
import {
  formatProtocolSpaceUri,
  membersSpace,
  type ManagingAppAccessPolicyPort,
  type ManagingAppAccessRequest,
} from '@coopsource/arbiter-client';
import { ServiceAuthVerifier } from '@coopsource/federation/atproto';
import type { DidDocument } from '@coopsource/federation';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

const methodId = 'com.atproto.simplespace.checkUserAccess';
const authorityDid = 'did:plc:spaceauthority' as DID;
const otherAuthorityDid = 'did:plc:otherauthority' as DID;
const userDid = 'did:plc:alice' as DID;
const audience = 'did:web:csn.example#managing-app';

describe('SimpleSpace managing-app access XRPC', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  it('is not registered when no managing-app policy is configured', async () => {
    const testApp = createTestApp();

    const response = await testApp.agent
      .get(`/xrpc/${methodId}`)
      .query({
        space: formatProtocolSpaceUri(membersSpace(authorityDid)),
        user: userDid,
      })
      .expect(404);

    expect(response.body.error).toBe('MethodNotFound');
  });

  it('requires service authentication when the policy is enabled', async () => {
    const testApp = createTestApp({
      managingAppAccessPolicy: fixedPolicy(true),
    });

    const response = await testApp.agent
      .get(`/xrpc/${methodId}`)
      .query({
        space: formatProtocolSpaceUri(membersSpace(authorityDid)),
        user: userDid,
      })
      .expect(401);

    expect(response.body.error).toBe('AuthenticationRequired');
  });

  it('passes an authority-authenticated request to the policy', async () => {
    const requests: ManagingAppAccessRequest[] = [];
    const policy: ManagingAppAccessPolicyPort = {
      async checkUserAccess(request) {
        await Promise.resolve();
        requests.push(request);
        return { authorized: true, sourceRevision: 'policy-rev-1' };
      },
    };
    const { testApp, keypair } = await createAuthenticatedTestApp(policy);
    const token = await mintJwt({
      keypair,
      iss: authorityDid,
      aud: audience,
      lxm: methodId,
    });
    const clientId = 'https://client.example/metadata.json';

    const response = await supertest(testApp.app)
      .get(`/xrpc/${methodId}`)
      .set('Authorization', `Bearer ${token}`)
      .query({
        space: formatProtocolSpaceUri(membersSpace(authorityDid)),
        user: userDid,
        clientId,
      })
      .expect(200);

    expect(response.body).toEqual({ authorized: true });
    expect(requests).toEqual([
      {
        space: membersSpace(authorityDid),
        userDid,
        clientId,
      },
    ]);
  });

  it('returns the policy denial without exposing its internal reason', async () => {
    const policy = fixedPolicy(false);
    const { testApp, keypair } = await createAuthenticatedTestApp(policy);
    const token = await mintJwt({
      keypair,
      iss: authorityDid,
      aud: audience,
      lxm: methodId,
    });

    const response = await supertest(testApp.app)
      .get(`/xrpc/${methodId}`)
      .set('Authorization', `Bearer ${token}`)
      .query({
        space: formatProtocolSpaceUri(membersSpace(authorityDid)),
        user: userDid,
      })
      .expect(200);

    expect(response.body).toEqual({ authorized: false });
  });

  it('rejects a trusted issuer that does not control the requested space', async () => {
    let policyCalls = 0;
    const policy: ManagingAppAccessPolicyPort = {
      async checkUserAccess() {
        policyCalls += 1;
        return { authorized: true };
      },
    };
    const { testApp, keypair } = await createAuthenticatedTestApp(policy);
    const token = await mintJwt({
      keypair,
      iss: authorityDid,
      aud: audience,
      lxm: methodId,
      sub: otherAuthorityDid,
    });

    const response = await supertest(testApp.app)
      .get(`/xrpc/${methodId}`)
      .set('Authorization', `Bearer ${token}`)
      .query({
        space: formatProtocolSpaceUri(membersSpace(otherAuthorityDid)),
        user: userDid,
      })
      .expect(403);

    expect(response.body.error).toBe('SpaceAuthorityMismatch');
    expect(policyCalls).toBe(0);
  });

  it('rejects malformed space and user parameters before policy evaluation', async () => {
    let policyCalls = 0;
    const policy: ManagingAppAccessPolicyPort = {
      async checkUserAccess() {
        policyCalls += 1;
        return { authorized: true };
      },
    };
    const { testApp, keypair } = await createAuthenticatedTestApp(policy);
    const token = await mintJwt({
      keypair,
      iss: authorityDid,
      aud: audience,
      lxm: methodId,
    });

    await supertest(testApp.app)
      .get(`/xrpc/${methodId}`)
      .set('Authorization', `Bearer ${token}`)
      .query({ space: 'not-a-space-uri', user: 'alice.example' })
      .expect(400);

    expect(policyCalls).toBe(0);
  });
});

function fixedPolicy(authorized: boolean): ManagingAppAccessPolicyPort {
  return {
    async checkUserAccess() {
      await Promise.resolve();
      return authorized
        ? { authorized: true }
        : { authorized: false, reason: 'not-member' };
    },
  };
}

async function createAuthenticatedTestApp(
  policy: ManagingAppAccessPolicyPort,
): Promise<{
  readonly testApp: ReturnType<typeof createTestApp>;
  readonly keypair: P256Keypair;
}> {
  const keypair = await P256Keypair.create({ exportable: true });
  const publicKeyMultibase = keypair.did().slice('did:key:'.length);
  const verifier = new ServiceAuthVerifier(
    {
      async resolve(did: string): Promise<DidDocument> {
        if (did !== authorityDid) throw new Error(`Unknown DID: ${did}`);
        return {
          '@context': ['https://www.w3.org/ns/did/v1'],
          id: authorityDid,
          verificationMethod: [
            {
              id: `${authorityDid}#atproto`,
              type: 'Multikey',
              controller: authorityDid,
              publicKeyMultibase,
            },
          ],
          service: [],
        };
      },
    },
    audience,
    new Set([authorityDid]),
  );
  return {
    testApp: createTestApp({
      managingAppAccessPolicy: policy,
      xrpcRouteOptions: { serviceAuthVerifier: verifier },
    }),
    keypair,
  };
}

async function mintJwt(args: {
  readonly keypair: P256Keypair;
  readonly iss: DID;
  readonly aud: string;
  readonly lxm: string;
  readonly sub?: DID;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', typ: 'JWT' };
  const payload = {
    iss: args.iss,
    aud: args.aud,
    lxm: args.lxm,
    exp: now + 60,
    iat: now,
    jti: crypto.randomUUID(),
    ...(args.sub ? { sub: args.sub } : {}),
  };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString(
    'base64url',
  );
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    'base64url',
  );
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = await args.keypair.sign(
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${Buffer.from(signature).toString('base64url')}`;
}
