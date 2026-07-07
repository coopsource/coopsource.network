import { describe, expect, it, vi } from 'vitest';
import {
  CredentialedPermissionedRepoPort,
  InMemoryPermissionedRepoPort,
  InMemorySpaceCredentialStore,
  SpaceCredentialError,
  SpaceCredentialManager,
  SpacesConsumer,
  StaticGroupDirectoryPort,
  TwoStepSpaceCredentialIssuer,
  type PermissionedRepoPort,
  type SpaceCredential,
  type SpaceCredentialExchangeClientPort,
  type SpaceCredentialExchangeRequest,
  type SpaceCredentialExchangeResponse,
  type SpaceDelegationTokenClientPort,
  type SpaceDelegationTokenRequest,
  type SpaceDelegationTokenResponse,
} from '../index.js';
import type { SpaceRef } from '../types.js';
import { buildVerifiedRecord, fakeDid } from './helpers/factories.js';

const now = new Date('2026-07-06T12:00:00Z');
const coopMembersSpace: SpaceRef = {
  arbiterDid: fakeDid('did:plc:coop'),
  expectedSpaceType: 'network.coopsource.org.spaceType.members',
  spaceKey: 'members',
};
const aliceDid = fakeDid('did:plc:alice');
const governanceVote = buildVerifiedRecord({
  space: coopMembersSpace,
  authorDid: aliceDid,
  rkey: 'vote-1',
  sourceRevision: '7',
  record: {
    $type: 'network.coopsource.governance.vote',
    proposal: 'proposal-1',
    choice: 'yes',
  },
});

describe('Phase 4 governance vote credential harness', () => {
  it('syncs a governance vote only after obtaining a two-step space credential', async () => {
    const events: string[] = [];
    const delegationClient = new RecordingDelegationTokenClient(
      { token: 'delegation-token' },
      events,
    );
    const exchangeClient = new RecordingExchangeClient(
      {
        credential: 'space-credential',
        expiresAt: new Date('2026-07-06T13:00:00Z'),
      },
      events,
    );
    const credentials = new SpaceCredentialManager(
      new InMemorySpaceCredentialStore({ clock: () => now }),
      new TwoStepSpaceCredentialIssuer(delegationClient, exchangeClient, {
        clientId: 'https://app.example/oauth/client.json',
      }),
      { clock: () => now },
    );
    const repo = new RecordingPermissionedRepoPort({
      records: [governanceVote],
      verification: 'verified',
      clock: () => now,
    });
    const permissionedRepo = new CredentialedPermissionedRepoPort({
      credentials,
      inner: repo,
    });
    const onAccepted = vi.fn();
    const onError = vi.fn();
    const consumer = new SpacesConsumer({
      groupDirectory: new StaticGroupDirectoryPort([
        { space: coopMembersSpace, members: [aliceDid] },
      ]),
      permissionedRepo,
      onAccepted,
      onError,
      clock: () => now,
    });

    await consumer.start([coopMembersSpace]);
    await repo.emit(coopMembersSpace);

    expect(events).toEqual([
      'delegation-start',
      'delegation-resolved',
      'exchange-start',
      'exchange-resolved',
    ]);
    expect(delegationClient.requests[0]).toMatchObject({
      space:
        'at://did:plc:coop/space/network.coopsource.org.spaceType.members/members',
      clientId: 'https://app.example/oauth/client.json',
      reason: 'missing',
      now,
    });
    expect(exchangeClient.requests[0]).toMatchObject({
      delegationToken: 'delegation-token',
      space:
        'at://did:plc:coop/space/network.coopsource.org.spaceType.members/members',
    });
    expect(repo.credentialsSeen.map((credential) => credential.token)).toEqual([
      'space-credential',
    ]);
    expect(onAccepted).toHaveBeenCalledWith(governanceVote);
    expect(onError).not.toHaveBeenCalled();
    expect(await repo.committedCheckpoint(coopMembersSpace)).toBe('7');
    expect(consumer.health()).toMatchObject({
      recordsAccepted: 1,
      recordsRejected: 0,
      verificationFailures: 0,
      errorCount: 0,
    });
  });

  it('does not sync or checkpoint when credential issuance fails', async () => {
    const delegationClient = new ThrowingDelegationTokenClient();
    const exchangeClient = new RecordingExchangeClient({
      credential: 'unused',
      expiresAt: new Date('2026-07-06T13:00:00Z'),
    });
    const credentials = new SpaceCredentialManager(
      new InMemorySpaceCredentialStore({ clock: () => now }),
      new TwoStepSpaceCredentialIssuer(delegationClient, exchangeClient, {
        clientId: 'https://app.example/oauth/client.json',
      }),
      { clock: () => now },
    );
    const repo = new InMemoryPermissionedRepoPort({
      records: [governanceVote],
      verification: 'verified',
      clock: () => now,
    });
    const consumer = new SpacesConsumer({
      groupDirectory: new StaticGroupDirectoryPort([
        { space: coopMembersSpace, members: [aliceDid] },
      ]),
      permissionedRepo: new CredentialedPermissionedRepoPort({
        credentials,
        inner: repo,
      }),
      onAccepted: vi.fn(),
      onError: vi.fn(),
      clock: () => now,
    });

    await consumer.start([coopMembersSpace]);
    await repo.emit(coopMembersSpace);

    expect(exchangeClient.requests).toEqual([]);
    expect(await repo.committedCheckpoint(coopMembersSpace)).toBeUndefined();
    expect(consumer.health()).toMatchObject({
      recordsAccepted: 0,
      errorCount: 1,
    });
  });
});

class RecordingDelegationTokenClient implements SpaceDelegationTokenClientPort {
  readonly requests: SpaceDelegationTokenRequest[] = [];

  constructor(
    private readonly response: SpaceDelegationTokenResponse,
    private readonly events: string[] = [],
  ) {}

  async getDelegationToken(
    request: SpaceDelegationTokenRequest,
  ): Promise<SpaceDelegationTokenResponse> {
    this.events.push('delegation-start');
    this.requests.push(request);
    await Promise.resolve();
    this.events.push('delegation-resolved');
    return this.response;
  }
}

class ThrowingDelegationTokenClient implements SpaceDelegationTokenClientPort {
  async getDelegationToken(): Promise<SpaceDelegationTokenResponse> {
    await Promise.resolve();
    throw new SpaceCredentialError('delegation denied');
  }
}

class RecordingPermissionedRepoPort extends InMemoryPermissionedRepoPort {
  readonly credentialsSeen: SpaceCredential[] = [];

  override async sync(
    args: Parameters<PermissionedRepoPort['sync']>[0],
  ): ReturnType<PermissionedRepoPort['sync']> {
    if (args.credential) this.credentialsSeen.push(args.credential);
    return super.sync(args);
  }
}

class RecordingExchangeClient implements SpaceCredentialExchangeClientPort {
  readonly requests: SpaceCredentialExchangeRequest[] = [];

  constructor(
    private readonly response: SpaceCredentialExchangeResponse,
    private readonly events: string[] = [],
  ) {}

  async getSpaceCredential(
    request: SpaceCredentialExchangeRequest,
  ): Promise<SpaceCredentialExchangeResponse> {
    this.events.push('exchange-start');
    this.requests.push(request);
    await Promise.resolve();
    this.events.push('exchange-resolved');
    return this.response;
  }
}
