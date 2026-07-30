import { Buffer } from 'node:buffer';
import type { DID } from '@coopsource/common';
import {
  SpaceAuthorityResolutionError,
  type SpaceRef,
} from '@coopsource/spaces-consumer';
import { OAuthSpaceCredentialExchangeClient } from '../src/services/oauth-space-credential-exchange-client.js';
import { describe, expect, it } from 'vitest';

const ref: SpaceRef = {
  arbiterDid: 'did:plc:coop' as DID,
  spaceKey: 'members',
  expectedSpaceType: 'network.coopsource.org.spaceType.members',
};
const request = {
  ref,
  space:
    'at://did:plc:coop/space/network.coopsource.org.spaceType.members/members',
  clientId: 'https://api.example/api/v1/auth/oauth/client-metadata.json',
  delegationToken: 'delegation-token',
  reason: 'missing' as const,
  now: new Date('2026-07-08T12:00:00Z'),
};

describe('OAuthSpaceCredentialExchangeClient', () => {
  it('exchanges a delegation token for a space credential at the authority PDS', async () => {
    const calls: Array<{
      readonly url: string;
      readonly init: {
        readonly method: string;
        readonly headers: unknown;
        readonly body?: string;
      };
    }> = [];
    const client = new OAuthSpaceCredentialExchangeClient({
      serviceUrlForSpaceAuthority(space) {
        expect(space).toBe(ref);
        return 'https://authority-pds.example/';
      },
      async fetch(url, init) {
        calls.push({ url, init });
        await Promise.resolve();
        return jsonResponse({
          credential: 'space-credential',
          expiresAt: '2026-07-08T13:00:00Z',
        });
      },
    });

    await expect(client.getSpaceCredential(request)).resolves.toEqual({
      credential: 'space-credential',
      expiresAt: new Date('2026-07-08T13:00:00Z'),
    });

    expect(calls).toEqual([
      {
        url: 'https://authority-pds.example/xrpc/com.atproto.space.getSpaceCredential',
        init: {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            authorization: 'Bearer delegation-token',
          },
          body: JSON.stringify({ space: request.space }),
        },
      },
    ]);
  });

  it('passes client attestation when app access is allow-listed', async () => {
    const calls: string[] = [];
    const client = new OAuthSpaceCredentialExchangeClient({
      serviceUrlForSpaceAuthority: () => 'https://authority-pds.example',
      async fetch(_url, init) {
        calls.push(init.body ?? '');
        return jsonResponse({ credential: jwtWithExp(1783515600) });
      },
    });

    await expect(
      client.getSpaceCredential({
        ...request,
        clientAttestation: 'client-attestation-jwt',
      }),
    ).resolves.toEqual({
      credential: jwtWithExp(1783515600),
    });

    expect(JSON.parse(calls[0]!)).toEqual({
      space: request.space,
      clientAttestation: 'client-attestation-jwt',
    });
  });

  it('fails closed when no authority PDS URL is configured', async () => {
    const client = new OAuthSpaceCredentialExchangeClient({
      serviceUrlForSpaceAuthority: () => undefined,
      async fetch() {
        throw new Error('fetch should not be called without authority URL');
      },
    });

    await expect(client.getSpaceCredential(request)).rejects.toMatchObject({
      name: 'SpaceCredentialError',
      kind: 'invalid-space',
    });
  });

  it('preserves typed DID authority resolution failures', async () => {
    const unavailable = new OAuthSpaceCredentialExchangeClient({
      serviceUrlForSpaceAuthority: () => {
        throw new SpaceAuthorityResolutionError(
          'unavailable',
          'PLC directory unavailable',
        );
      },
      async fetch() {
        throw new Error('fetch should not be called after resolution fails');
      },
    });
    const invalid = new OAuthSpaceCredentialExchangeClient({
      serviceUrlForSpaceAuthority: () => {
        throw new SpaceAuthorityResolutionError(
          'missing-service',
          'authority has no space host',
        );
      },
      async fetch() {
        throw new Error('fetch should not be called after resolution fails');
      },
    });

    await expect(unavailable.getSpaceCredential(request)).rejects.toMatchObject(
      {
        kind: 'unavailable',
      },
    );
    await expect(invalid.getSpaceCredential(request)).rejects.toMatchObject({
      kind: 'invalid-space',
    });
  });

  it('maps upstream credential errors to distinct failure kinds', async () => {
    const cases = [
      {
        response: { status: 404, body: { error: 'SpaceNotFound' } },
        kind: 'invalid-space',
      },
      {
        response: {
          status: 403,
          body: { error: 'UserNotAuthorized', message: 'not in space' },
        },
        kind: 'not-member',
      },
      {
        response: {
          status: 403,
          body: { error: 'AppNotAuthorized', message: 'client denied' },
        },
        kind: 'client-policy',
      },
      {
        response: { status: 401, body: { error: 'InvalidDelegationToken' } },
        kind: 'auth',
      },
      {
        response: { status: 503, body: { error: 'UpstreamTimeout' } },
        kind: 'unavailable',
      },
    ] as const;

    for (const testCase of cases) {
      const client = new OAuthSpaceCredentialExchangeClient({
        serviceUrlForSpaceAuthority: () => 'https://authority-pds.example',
        async fetch() {
          await Promise.resolve();
          return jsonResponse(testCase.response.body, testCase.response.status);
        },
      });

      await expect(client.getSpaceCredential(request)).rejects.toMatchObject({
        name: 'SpaceCredentialError',
        kind: testCase.kind,
      });
    }
  });

  it('rejects successful responses without a credential token', async () => {
    const client = new OAuthSpaceCredentialExchangeClient({
      serviceUrlForSpaceAuthority: () => 'https://authority-pds.example',
      async fetch() {
        return jsonResponse({ expiresAt: '2026-07-08T13:00:00Z' });
      },
    });

    await expect(client.getSpaceCredential(request)).rejects.toMatchObject({
      name: 'SpaceCredentialError',
      kind: 'protocol',
    });
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function jwtWithExp(exp: number): string {
  return [
    base64Url(JSON.stringify({ alg: 'none' })),
    base64Url(JSON.stringify({ exp })),
    '',
  ].join('.');
}

function base64Url(value: string): string {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}
