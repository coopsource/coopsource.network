import { describe, expect, it } from 'vitest';
import {
  SpaceCredentialError,
  type SpaceCredential,
  type SpaceCredentialExchangeClientPort,
  type SpaceCredentialExchangeRequest,
  type SpaceCredentialExchangeResponse,
  type SpaceCredentialIssueRequest,
  type SpaceDelegationTokenClientPort,
  type SpaceDelegationTokenRequest,
  type SpaceDelegationTokenResponse,
  TwoStepSpaceCredentialIssuer,
  formatSpaceCredentialSpaceUri,
} from '../index.js';
import type { SpaceRef } from '../types.js';
import { fakeDid } from './helpers/factories.js';

const ref: SpaceRef = {
  arbiterDid: fakeDid('did:plc:coop'),
  expectedSpaceType: 'network.coopsource.org.spaceType.role',
  spaceKey: 'roles/board',
};
const now = new Date('2026-07-06T12:00:00Z');
const request: SpaceCredentialIssueRequest = {
  ref,
  reason: 'missing',
  now,
};

describe('TwoStepSpaceCredentialIssuer', () => {
  it('requests a delegation token before exchanging it for a space credential', async () => {
    const events: string[] = [];
    const delegationClient = new RecordingDelegationTokenClient(
      { token: 'delegation-token' },
      events,
      'delegation-resolved',
    );
    const exchangeClient = new RecordingExchangeClient(
      {
        credential: 'space-token',
        expiresAt: new Date('2026-07-06T13:00:00Z'),
      },
      events,
      'exchange-resolved',
    );
    const issuer = new TwoStepSpaceCredentialIssuer(
      delegationClient,
      exchangeClient,
      { clientId: 'https://app.example/oauth/client.json' },
    );

    await expect(issuer.issue(request)).resolves.toEqual({
      token: 'space-token',
      expiresAt: new Date('2026-07-06T13:00:00Z'),
    });

    expect(events).toEqual([
      'delegation-start',
      'delegation-resolved',
      'exchange-start',
      'exchange-resolved',
    ]);
    expect(delegationClient.requests).toEqual([
      {
        ref,
        space:
          'at://did:plc:coop/space/network.coopsource.org.spaceType.role/roles%2Fboard',
        clientId: 'https://app.example/oauth/client.json',
        reason: 'missing',
        previous: undefined,
        now,
      },
    ]);
    expect(exchangeClient.requests).toEqual([
      {
        ref,
        space:
          'at://did:plc:coop/space/network.coopsource.org.spaceType.role/roles%2Fboard',
        clientId: 'https://app.example/oauth/client.json',
        delegationToken: 'delegation-token',
        reason: 'missing',
        previous: undefined,
        now,
      },
    ]);
  });

  it('derives credential expiry from JWT exp when the exchange response omits expiresAt', async () => {
    const issuer = new TwoStepSpaceCredentialIssuer(
      new RecordingDelegationTokenClient({ token: 'delegation-token' }),
      new RecordingExchangeClient({
        credential: jwtWithExp(1783342800),
      }),
      { clientId: 'https://app.example/oauth/client.json' },
    );

    await expect(issuer.issue(request)).resolves.toEqual({
      token: jwtWithExp(1783342800),
      expiresAt: new Date('2026-07-06T13:00:00.000Z'),
    });
  });

  it('propagates refresh metadata and previous credentials to both client ports', async () => {
    const previous: SpaceCredential = {
      token: 'old-space-token',
      expiresAt: new Date('2026-07-06T12:02:00Z'),
    };
    const nearExpiryRequest: SpaceCredentialIssueRequest = {
      ...request,
      reason: 'near-expiry',
      previous,
    };
    const delegationClient = new RecordingDelegationTokenClient({
      token: 'delegation-token',
    });
    const exchangeClient = new RecordingExchangeClient({
      credential: 'space-token',
      expiresAt: new Date('2026-07-06T13:00:00Z'),
    });
    const issuer = new TwoStepSpaceCredentialIssuer(
      delegationClient,
      exchangeClient,
      { clientId: 'https://app.example/oauth/client.json' },
    );

    await issuer.issue(nearExpiryRequest);

    expect(delegationClient.requests[0]!.reason).toBe('near-expiry');
    expect(delegationClient.requests[0]!.previous).toBe(previous);
    expect(exchangeClient.requests[0]!.reason).toBe('near-expiry');
    expect(exchangeClient.requests[0]!.previous).toBe(previous);
  });

  it('passes configured client attestation to the credential exchange', async () => {
    const exchangeClient = new RecordingExchangeClient({
      credential: 'space-token',
      expiresAt: new Date('2026-07-06T13:00:00Z'),
    });
    const issuer = new TwoStepSpaceCredentialIssuer(
      new RecordingDelegationTokenClient({ token: 'delegation-token' }),
      exchangeClient,
      {
        clientId: 'https://app.example/oauth/client.json',
        clientAttestationProvider: {
          async getClientAttestation(input) {
            expect(input).toMatchObject({
              ref,
              clientId: 'https://app.example/oauth/client.json',
              audience: 'did:plc:coop#atproto_space_host',
              reason: 'missing',
              now,
            });
            return 'attestation-jwt';
          },
        },
      },
    );

    await issuer.issue(request);

    expect(exchangeClient.requests[0]!.clientAttestation).toBe(
      'attestation-jwt',
    );
  });

  it('allows callers to override the provisional space URI formatter', async () => {
    const delegationClient = new RecordingDelegationTokenClient({
      token: 'delegation-token',
    });
    const exchangeClient = new RecordingExchangeClient({
      credential: 'space-token',
      expiresAt: new Date('2026-07-06T13:00:00Z'),
    });
    const issuer = new TwoStepSpaceCredentialIssuer(
      delegationClient,
      exchangeClient,
      {
        clientId: 'https://app.example/oauth/client.json',
        spaceUriForRef: () => 'custom-space-uri',
      },
    );

    await issuer.issue(request);

    expect(delegationClient.requests[0]!.space).toBe('custom-space-uri');
    expect(exchangeClient.requests[0]!.space).toBe('custom-space-uri');
  });

  it('rejects missing tokens, missing credential tokens, and credentials without expiry', async () => {
    await expect(
      new TwoStepSpaceCredentialIssuer(
        new RecordingDelegationTokenClient({ token: '' }),
        new RecordingExchangeClient({
          credential: 'unused',
          expiresAt: new Date('2026-07-06T13:00:00Z'),
        }),
        { clientId: 'https://app.example/oauth/client.json' },
      ).issue(request),
    ).rejects.toThrow('Delegation token response did not include a token');

    await expect(
      new TwoStepSpaceCredentialIssuer(
        new RecordingDelegationTokenClient({ token: 'delegation-token' }),
        new RecordingExchangeClient({
          credential: '',
          expiresAt: new Date('2026-07-06T13:00:00Z'),
        }),
        { clientId: 'https://app.example/oauth/client.json' },
      ).issue(request),
    ).rejects.toThrow(
      'Space credential response did not include a credential token',
    );

    await expect(
      new TwoStepSpaceCredentialIssuer(
        new RecordingDelegationTokenClient({ token: 'delegation-token' }),
        new RecordingExchangeClient({ credential: 'not-a-jwt' }),
        { clientId: 'https://app.example/oauth/client.json' },
      ).issue(request),
    ).rejects.toThrow(
      'Space credential response must include expiresAt or a JWT exp claim',
    );

    await expect(
      new TwoStepSpaceCredentialIssuer(
        new RecordingDelegationTokenClient({ token: 'delegation-token' }),
        new RecordingExchangeClient({
          credential: 'space-token',
          expiresAt: new Date(Number.NaN),
        }),
        { clientId: 'https://app.example/oauth/client.json' },
      ).issue(request),
    ).rejects.toThrow('Space credential response included an invalid expiry');
  });

  it('requires expectedSpaceType for the default provisional space URI', () => {
    expect(() =>
      formatSpaceCredentialSpaceUri({
        arbiterDid: fakeDid('did:plc:coop'),
        spaceKey: 'members',
      }),
    ).toThrow(SpaceCredentialError);
  });
});

class RecordingDelegationTokenClient implements SpaceDelegationTokenClientPort {
  readonly requests: SpaceDelegationTokenRequest[] = [];

  constructor(
    private readonly response: SpaceDelegationTokenResponse,
    private readonly events: string[] = [],
    private readonly resolutionEvent = 'delegation-resolved',
  ) {}

  async getDelegationToken(
    request: SpaceDelegationTokenRequest,
  ): Promise<SpaceDelegationTokenResponse> {
    this.events.push('delegation-start');
    this.requests.push(request);
    await Promise.resolve();
    this.events.push(this.resolutionEvent);
    return this.response;
  }
}

class RecordingExchangeClient implements SpaceCredentialExchangeClientPort {
  readonly requests: SpaceCredentialExchangeRequest[] = [];

  constructor(
    private readonly response: SpaceCredentialExchangeResponse,
    private readonly events: string[] = [],
    private readonly resolutionEvent = 'exchange-resolved',
  ) {}

  async getSpaceCredential(
    request: SpaceCredentialExchangeRequest,
  ): Promise<SpaceCredentialExchangeResponse> {
    this.events.push('exchange-start');
    this.requests.push(request);
    await Promise.resolve();
    this.events.push(this.resolutionEvent);
    return this.response;
  }
}

function jwtWithExp(exp: number): string {
  return [
    base64Url(JSON.stringify({ alg: 'none' })),
    base64Url(JSON.stringify({ exp })),
    '',
  ].join('.');
}

function base64Url(value: string): string {
  let output = '';
  let buffer = 0;
  let bits = 0;

  for (let i = 0; i < value.length; i += 1) {
    buffer = (buffer << 8) | value.charCodeAt(i);
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      output += BASE64URL_ALPHABET[(buffer >> bits) & 0x3f];
      buffer &= (1 << bits) - 1;
    }
  }

  if (bits > 0) {
    output += BASE64URL_ALPHABET[(buffer << (6 - bits)) & 0x3f];
  }

  return output;
}

const BASE64URL_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
