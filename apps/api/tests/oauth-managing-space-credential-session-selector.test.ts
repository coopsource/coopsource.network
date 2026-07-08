import type { DID, Permission } from '@coopsource/common';
import type { SpaceRef } from '@coopsource/spaces-consumer';
import {
  OAuthManagingSpaceCredentialSessionSelector,
  StaticManagingSpaceSessionCandidateProvider,
} from '../src/services/oauth-managing-space-credential-session-selector.js';
import type {
  OAuthPermissionedRecordWriteClient,
  OAuthPermissionedRecordWriteSession,
} from '../src/services/oauth-permissioned-record-write-session-provider.js';
import type { MembershipReadModel } from '../src/services/membership-read-model.js';
import { describe, expect, it } from 'vitest';

const space: SpaceRef = {
  arbiterDid: 'did:plc:coop' as DID,
  spaceKey: 'members',
  expectedSpaceType: 'network.coopsource.org.spaceType.members',
};
const firstCandidate = 'did:plc:first' as DID;
const secondCandidate = 'did:plc:second' as DID;
const thirdCandidate = 'did:plc:third' as DID;
const fourthCandidate = 'did:plc:fourth' as DID;
const requiredPermission = 'private.manage' as Permission;

describe('OAuthManagingSpaceCredentialSessionSelector', () => {
  it('returns null when no OAuth client is configured', async () => {
    const selector = new OAuthManagingSpaceCredentialSessionSelector({
      membershipReadModel: new FakeMembershipReadModel([firstCandidate]),
      candidateProvider: new StaticManagingSpaceSessionCandidateProvider([
        firstCandidate,
      ]),
      requiredPermission,
    });

    await expect(selector.selectSession(space)).resolves.toBeNull();
  });

  it('selects the first eligible candidate with a restorable OAuth session', async () => {
    const fetchCalls: Array<{
      readonly path: string;
      readonly init?: RequestInit;
    }> = [];
    const client = new FakeOAuthClient(
      new Map([
        [
          secondCandidate,
          {
            did: secondCandidate,
            async getTokenInfo(refresh) {
              expect(refresh).toBe('auto');
              return { aud: 'https://pds.example' };
            },
            async fetchHandler(pathname, init) {
              fetchCalls.push({ path: pathname, init });
              return new Response(JSON.stringify({ ok: true }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
              });
            },
          },
        ],
      ]),
    );
    const selector = new OAuthManagingSpaceCredentialSessionSelector({
      oauthClient: client,
      membershipReadModel: new FakeMembershipReadModel([secondCandidate]),
      candidateProvider: new StaticManagingSpaceSessionCandidateProvider([
        firstCandidate,
        secondCandidate,
      ]),
      requiredPermission,
    });

    const selected = await selector.selectSession(space);

    expect(selected?.managerDid).toBe(secondCandidate);
    expect(selected?.serviceUrl).toBe('https://pds.example');
    expect(client.restoreAttempts).toEqual([secondCandidate]);
    const response = await selected!.authenticatedFetch(
      'https://pds.example/xrpc/com.atproto.space.getDelegationToken',
      {
        method: 'POST',
        headers: { accept: 'application/json' },
        body: '{}',
      },
    );
    expect(response.status).toBe(200);
    expect(fetchCalls).toEqual([
      {
        path: '/xrpc/com.atproto.space.getDelegationToken',
        init: {
          method: 'POST',
          headers: { accept: 'application/json' },
          body: '{}',
        },
      },
    ]);
  });

  it('returns null when candidates are ineligible or have no session', async () => {
    const client = new FakeOAuthClient(new Map());
    const selector = new OAuthManagingSpaceCredentialSessionSelector({
      oauthClient: client,
      membershipReadModel: new FakeMembershipReadModel([firstCandidate]),
      candidateProvider: new StaticManagingSpaceSessionCandidateProvider([
        firstCandidate,
        secondCandidate,
      ]),
      requiredPermission,
    });

    await expect(selector.selectSession(space)).resolves.toBeNull();
    expect(client.restoreAttempts).toEqual([firstCandidate]);
  });

  it('continues to later eligible candidates when restored sessions lack a usable token audience', async () => {
    const tokenAttempts: DID[] = [];
    const client = new FakeOAuthClient(
      new Map([
        [
          firstCandidate,
          {
            did: firstCandidate,
            async getTokenInfo(refresh) {
              expect(refresh).toBe('auto');
              tokenAttempts.push(firstCandidate);
              await Promise.resolve();
              throw new Error('token refresh failed');
            },
            async fetchHandler() {
              throw new Error('fetchHandler should not receive calls');
            },
          },
        ],
        [
          secondCandidate,
          {
            did: secondCandidate,
            async getTokenInfo(refresh) {
              expect(refresh).toBe('auto');
              tokenAttempts.push(secondCandidate);
              await Promise.resolve();
              return { aud: undefined as unknown as string };
            },
            async fetchHandler() {
              throw new Error('fetchHandler should not receive calls');
            },
          },
        ],
        [
          thirdCandidate,
          {
            did: thirdCandidate,
            async getTokenInfo(refresh) {
              expect(refresh).toBe('auto');
              tokenAttempts.push(thirdCandidate);
              await Promise.resolve();
              return { aud: 'not a url' };
            },
            async fetchHandler() {
              throw new Error('fetchHandler should not receive calls');
            },
          },
        ],
        [
          fourthCandidate,
          {
            did: fourthCandidate,
            async getTokenInfo(refresh) {
              expect(refresh).toBe('auto');
              tokenAttempts.push(fourthCandidate);
              await Promise.resolve();
              return { aud: 'https://fallback-pds.example' };
            },
            async fetchHandler() {
              return new Response('{}');
            },
          },
        ],
      ]),
    );
    const selector = new OAuthManagingSpaceCredentialSessionSelector({
      oauthClient: client,
      membershipReadModel: new FakeMembershipReadModel([
        firstCandidate,
        secondCandidate,
        thirdCandidate,
        fourthCandidate,
      ]),
      candidateProvider: new StaticManagingSpaceSessionCandidateProvider([
        firstCandidate,
        secondCandidate,
        thirdCandidate,
        fourthCandidate,
      ]),
      requiredPermission,
    });

    const selected = await selector.selectSession(space);

    expect(selected?.managerDid).toBe(fourthCandidate);
    expect(selected?.serviceUrl).toBe('https://fallback-pds.example');
    expect(client.restoreAttempts).toEqual([
      firstCandidate,
      secondCandidate,
      thirdCandidate,
      fourthCandidate,
    ]);
    expect(tokenAttempts).toEqual([
      firstCandidate,
      secondCandidate,
      thirdCandidate,
      fourthCandidate,
    ]);
  });

  it('fails closed when the restored session DID differs from the candidate', async () => {
    const client = new FakeOAuthClient(
      new Map([
        [
          firstCandidate,
          {
            did: 'did:plc:mallory' as DID,
            async getTokenInfo() {
              return { aud: 'https://pds.example' };
            },
            async fetchHandler() {
              return new Response('{}');
            },
          },
        ],
        [
          secondCandidate,
          {
            did: secondCandidate,
            async getTokenInfo() {
              throw new Error('selector should fail before later candidates');
            },
            async fetchHandler() {
              throw new Error('fetchHandler should not receive calls');
            },
          },
        ],
      ]),
    );
    const selector = new OAuthManagingSpaceCredentialSessionSelector({
      oauthClient: client,
      membershipReadModel: new FakeMembershipReadModel([
        firstCandidate,
        secondCandidate,
      ]),
      candidateProvider: new StaticManagingSpaceSessionCandidateProvider([
        firstCandidate,
        secondCandidate,
      ]),
      requiredPermission,
    });

    await expect(selector.selectSession(space)).rejects.toMatchObject({
      name: 'SpaceCredentialError',
    });
    expect(client.restoreAttempts).toEqual([firstCandidate]);
  });

  it('rejects fetch calls outside the managing session audience', async () => {
    const selector = new OAuthManagingSpaceCredentialSessionSelector({
      oauthClient: new FakeOAuthClient(
        new Map([
          [
            firstCandidate,
            {
              did: firstCandidate,
              async getTokenInfo() {
                return { aud: 'https://pds.example' };
              },
              async fetchHandler() {
                throw new Error('fetchHandler should not receive calls');
              },
            },
          ],
        ]),
      ),
      membershipReadModel: new FakeMembershipReadModel([firstCandidate]),
      candidateProvider: new StaticManagingSpaceSessionCandidateProvider([
        firstCandidate,
      ]),
      requiredPermission,
    });

    const selected = await selector.selectSession(space);

    await expect(
      selected!.authenticatedFetch(
        'https://other.example/xrpc/com.atproto.space.getDelegationToken',
        {
          method: 'POST',
          headers: {},
          body: '{}',
        },
      ),
    ).rejects.toMatchObject({ name: 'SpaceCredentialError' });
  });
});

class FakeMembershipReadModel implements Pick<
  MembershipReadModel,
  'hasPermissionResult'
> {
  readonly checks: Array<{
    readonly cooperativeDid: DID;
    readonly memberDid: DID;
    readonly permission: Permission;
  }> = [];
  private readonly allowed: ReadonlySet<DID>;

  constructor(allowed: readonly DID[]) {
    this.allowed = new Set(allowed);
  }

  async hasPermissionResult(
    cooperativeDid: DID,
    memberDid: DID,
    permission: Permission,
  ): ReturnType<MembershipReadModel['hasPermissionResult']> {
    this.checks.push({ cooperativeDid, memberDid, permission });
    await Promise.resolve();
    return {
      ok: true,
      allowed: this.allowed.has(memberDid),
    };
  }
}

class FakeOAuthClient implements OAuthPermissionedRecordWriteClient {
  readonly restoreAttempts: DID[] = [];

  constructor(
    private readonly sessions: ReadonlyMap<
      DID,
      OAuthPermissionedRecordWriteSession
    >,
  ) {}

  async restore(did: DID): Promise<OAuthPermissionedRecordWriteSession> {
    this.restoreAttempts.push(did);
    await Promise.resolve();
    const session = this.sessions.get(did);
    if (!session) throw new Error('no session');
    return session;
  }
}
