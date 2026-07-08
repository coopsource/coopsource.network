import type { DID } from '@coopsource/common';
import type { SpaceRef } from '@coopsource/spaces-consumer';
import type { OAuthManagingSpaceCredentialSession } from '../src/services/oauth-managing-space-credential-session-selector.js';
import { OAuthSpaceDelegationTokenClient } from '../src/services/oauth-space-delegation-token-client.js';
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
  reason: 'missing' as const,
  now: new Date('2026-07-07T12:00:00Z'),
};

describe('OAuthSpaceDelegationTokenClient', () => {
  it('gets a delegation token with the selected managing session', async () => {
    const calls: Array<{
      readonly url: string;
      readonly init: { readonly method: string; readonly headers: unknown };
    }> = [];
    const selector = new FakeManagingSessionSelector({
      managerDid: 'did:plc:manager' as DID,
      serviceUrl: 'https://pds.example/',
      async authenticatedFetch(url, init) {
        calls.push({ url, init });
        await Promise.resolve();
        return jsonResponse({
          delegationToken: 'delegation-token',
          expiresAt: '2026-07-07T12:01:00Z',
        });
      },
    });
    const client = new OAuthSpaceDelegationTokenClient({
      sessionSelector: selector,
    });

    await expect(client.getDelegationToken(request)).resolves.toEqual({
      token: 'delegation-token',
    });

    expect(selector.requests).toEqual([ref]);
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]!.url);
    expect(url.origin).toBe('https://pds.example');
    expect(url.pathname).toBe(
      '/xrpc/com.atproto.space.getDelegationToken',
    );
    expect(url.searchParams.get('space')).toBe(request.space);
    expect(calls[0]!.init).toEqual({
      method: 'GET',
      headers: { accept: 'application/json' },
    });
  });

  it('fails closed when no eligible managing session is available', async () => {
    const client = new OAuthSpaceDelegationTokenClient({
      sessionSelector: new FakeManagingSessionSelector(null),
    });

    await expect(client.getDelegationToken(request)).rejects.toMatchObject({
      name: 'SpaceCredentialError',
      message:
        'No eligible managing OAuth session available for did:plc:coop/members',
    });
  });

  it('maps upstream XRPC errors to space credential errors', async () => {
    const client = new OAuthSpaceDelegationTokenClient({
      sessionSelector: new FakeManagingSessionSelector({
        managerDid: 'did:plc:manager' as DID,
        serviceUrl: 'https://pds.example',
        async authenticatedFetch() {
          await Promise.resolve();
          return jsonResponse(
            { error: 'NotAMember', message: 'Managing session is not a member' },
            403,
          );
        },
      }),
    });

    await expect(client.getDelegationToken(request)).rejects.toMatchObject({
      name: 'SpaceCredentialError',
      message: 'Managing session is not a member',
    });
  });

  it('rejects a successful response without a delegation token', async () => {
    const client = new OAuthSpaceDelegationTokenClient({
      sessionSelector: new FakeManagingSessionSelector({
        managerDid: 'did:plc:manager' as DID,
        serviceUrl: 'https://pds.example',
        async authenticatedFetch() {
          await Promise.resolve();
          return jsonResponse({ expiresAt: '2026-07-07T12:01:00Z' });
        },
      }),
    });

    await expect(client.getDelegationToken(request)).rejects.toMatchObject({
      name: 'SpaceCredentialError',
      message:
        'com.atproto.space.getDelegationToken response must include delegationToken',
    });
  });

  it('wraps transport failures from the selected session fetch', async () => {
    const client = new OAuthSpaceDelegationTokenClient({
      sessionSelector: new FakeManagingSessionSelector({
        managerDid: 'did:plc:manager' as DID,
        serviceUrl: 'https://pds.example',
        async authenticatedFetch() {
          await Promise.resolve();
          throw new Error('socket closed');
        },
      }),
    });

    await expect(client.getDelegationToken(request)).rejects.toMatchObject({
      name: 'SpaceCredentialError',
      message:
        'Failed to call com.atproto.space.getDelegationToken: socket closed',
    });
  });
});

class FakeManagingSessionSelector {
  readonly requests: SpaceRef[] = [];

  constructor(
    private readonly session: OAuthManagingSpaceCredentialSession | null,
  ) {}

  async selectSession(
    requestedRef: SpaceRef,
  ): Promise<OAuthManagingSpaceCredentialSession | null> {
    this.requests.push(requestedRef);
    await Promise.resolve();
    return this.session;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
