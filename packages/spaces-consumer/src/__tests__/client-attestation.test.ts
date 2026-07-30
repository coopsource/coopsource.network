import { describe, expect, it, vi } from 'vitest';
import {
  Proposal0016ClientAttestationProvider,
  type ClientAttestationJwtSigner,
} from '../index.js';
import { fakeDid } from './helpers/factories.js';

const ref = {
  arbiterDid: fakeDid('did:plc:coop'),
  expectedSpaceType: 'network.coopsource.org.spaceType.members',
  spaceKey: 'members',
};
const request = {
  ref,
  space:
    'at://did:plc:coop/space/network.coopsource.org.spaceType.members/members',
  clientId: 'https://app.example/oauth/client.json',
  audience: 'did:plc:coop#atproto_space_host',
  reason: 'missing' as const,
  now: new Date('2026-07-30T12:00:00Z'),
};

describe('Proposal0016ClientAttestationProvider', () => {
  it('builds deterministic short-lived, single-use JWT inputs', async () => {
    const signJwt = vi.fn(async () => 'signed-attestation');
    const signer: ClientAttestationJwtSigner = { signJwt };
    const provider = new Proposal0016ClientAttestationProvider({
      keyId: 'key-1',
      signer,
      ttlSeconds: 60,
      createNonce: () => 'nonce-1',
    });

    await expect(provider.getClientAttestation(request)).resolves.toBe(
      'signed-attestation',
    );
    expect(signJwt).toHaveBeenCalledWith({
      protectedHeader: {
        typ: 'atproto-client-attestation+jwt',
        alg: 'ES256',
        kid: 'key-1',
      },
      claims: {
        iss: request.clientId,
        sub: request.clientId,
        aud: request.audience,
        iat: 1785412800,
        exp: 1785412860,
        jti: 'nonce-1',
      },
    });
  });

  it('rejects an audience that is not the authority space-host service', async () => {
    const provider = new Proposal0016ClientAttestationProvider({
      keyId: 'key-1',
      signer: { signJwt: async () => 'unreachable' },
      createNonce: () => 'nonce-1',
    });

    await expect(
      provider.getClientAttestation({
        ...request,
        audience: 'did:plc:other#atproto_space_host',
      }),
    ).rejects.toThrow(
      'Client attestation audience must target did:plc:coop#atproto_space_host',
    );
  });

  it('rejects unsafe expiry and missing-key configurations', () => {
    const signer: ClientAttestationJwtSigner = {
      signJwt: async () => 'unreachable',
    };

    expect(
      () =>
        new Proposal0016ClientAttestationProvider({
          keyId: 'key-1',
          signer,
          ttlSeconds: 0,
        }),
    ).toThrow(
      'Client attestation ttlSeconds must be an integer between 1 and 300',
    );
    expect(
      () =>
        new Proposal0016ClientAttestationProvider({
          keyId: '',
          signer,
        }),
    ).toThrow('Client attestation keyId is required');
  });
});
