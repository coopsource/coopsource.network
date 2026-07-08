import { describe, expect, it } from 'vitest';
import type { DID } from '@coopsource/common';
import { PermissionedRecordWriteError } from '@coopsource/spaces-consumer';
import {
  OAuthPermissionedRecordWriteSessionProvider,
  type OAuthPermissionedRecordWriteClient,
  type OAuthPermissionedRecordWriteSession,
} from '../src/services/oauth-permissioned-record-write-session-provider.js';

const authorDid = 'did:plc:alice' as DID;
const writeRequest = {
  operation: 'createRecord' as const,
  args: {
    space: {
      arbiterDid: 'did:plc:coop' as DID,
      spaceKey: 'members',
      expectedSpaceType: 'network.coopsource.org.spaceType.members',
    },
    authorDid,
    collection: 'network.coopsource.governance.vote',
    record: { choice: 'yes' },
  },
};

describe('OAuthPermissionedRecordWriteSessionProvider', () => {
  it('returns null when no OAuth client is configured', async () => {
    const provider = new OAuthPermissionedRecordWriteSessionProvider(undefined);

    await expect(provider.sessionForWrite(writeRequest)).resolves.toBeNull();
  });

  it('restores the author session and delegates writes through the session fetch handler', async () => {
    const fetchCalls: Array<{
      readonly url: string;
      readonly init?: RequestInit;
    }> = [];
    const session: OAuthPermissionedRecordWriteSession = {
      did: authorDid,
      async getTokenInfo(refresh) {
        expect(refresh).toBe('auto');
        return { aud: 'https://pds.example' };
      },
      async fetchHandler(pathname, init) {
        fetchCalls.push({ url: pathname, init });
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    };
    const client = new FakeOAuthClient(session);
    const provider = new OAuthPermissionedRecordWriteSessionProvider(client);

    const result = await provider.sessionForWrite(writeRequest);

    expect(client.restoredDids).toEqual([authorDid]);
    expect(result?.serviceUrl).toBe('https://pds.example');
    const response = await result!.authenticatedFetch!(
      'https://pds.example/xrpc/com.atproto.space.createRecord',
      {
        method: 'POST',
        headers: { accept: 'application/json' },
        body: '{"ok":true}',
      },
    );
    expect(response.status).toBe(200);
    expect(fetchCalls).toEqual([
      {
        url: '/xrpc/com.atproto.space.createRecord',
        init: {
          method: 'POST',
          headers: { accept: 'application/json' },
          body: '{"ok":true}',
        },
      },
    ]);
  });

  it('rejects authenticated fetch calls outside the OAuth audience', async () => {
    const provider = new OAuthPermissionedRecordWriteSessionProvider(
      new FakeOAuthClient({
        did: authorDid,
        async getTokenInfo() {
          return { aud: 'https://pds.example' };
        },
        async fetchHandler() {
          throw new Error('fetchHandler should not receive cross-origin calls');
        },
      }),
    );

    const result = await provider.sessionForWrite(writeRequest);

    await expect(
      result!.authenticatedFetch!(
        'https://evil.example/xrpc/com.atproto.space.createRecord',
        {
          method: 'POST',
          headers: {},
          body: '{}',
        },
      ),
    ).rejects.toMatchObject({
      name: 'PermissionedRecordWriteError',
      kind: 'auth',
    });
  });

  it('fails closed when the OAuth audience is not a valid URL', async () => {
    const provider = new OAuthPermissionedRecordWriteSessionProvider(
      new FakeOAuthClient({
        did: authorDid,
        async getTokenInfo() {
          return { aud: 'not a url' };
        },
        async fetchHandler() {
          return new Response('{}');
        },
      }),
    );

    await expect(provider.sessionForWrite(writeRequest)).rejects.toMatchObject({
      name: 'PermissionedRecordWriteError',
      kind: 'auth',
    });
  });

  it('returns null when the author has no restorable OAuth session', async () => {
    const provider = new OAuthPermissionedRecordWriteSessionProvider(
      new FailingOAuthClient(),
    );

    await expect(provider.sessionForWrite(writeRequest)).resolves.toBeNull();
  });

  it('fails closed when the restored session DID differs from the author DID', async () => {
    const provider = new OAuthPermissionedRecordWriteSessionProvider(
      new FakeOAuthClient({
        did: 'did:plc:mallory',
        async getTokenInfo() {
          return { aud: 'https://pds.example' };
        },
        async fetchHandler() {
          return new Response('{}');
        },
      }),
    );

    await expect(provider.sessionForWrite(writeRequest)).rejects.toMatchObject({
      name: 'PermissionedRecordWriteError',
      kind: 'auth',
    });
    await expect(provider.sessionForWrite(writeRequest)).rejects.toBeInstanceOf(
      PermissionedRecordWriteError,
    );
  });
});

class FakeOAuthClient implements OAuthPermissionedRecordWriteClient {
  readonly restoredDids: string[] = [];

  constructor(private readonly session: OAuthPermissionedRecordWriteSession) {}

  async restore(did: string): Promise<OAuthPermissionedRecordWriteSession> {
    this.restoredDids.push(did);
    await Promise.resolve();
    return this.session;
  }
}

class FailingOAuthClient implements OAuthPermissionedRecordWriteClient {
  async restore(): Promise<OAuthPermissionedRecordWriteSession> {
    await Promise.resolve();
    throw new Error('no session');
  }
}
