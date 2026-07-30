import { describe, expect, it } from 'vitest';
import {
  DidSpaceAuthorityResolver,
  type SpaceAuthorityDidDocument,
} from '../index.js';
import { fakeDid } from './helpers/factories.js';

const authorityDid = fakeDid('did:plc:coop');
const ref = {
  arbiterDid: authorityDid,
  expectedSpaceType: 'network.coopsource.org.spaceType.members',
  spaceKey: 'members',
};

describe('DidSpaceAuthorityResolver', () => {
  it('prefers dedicated Proposal 0016 host and verification entries', async () => {
    const resolver = resolverFor({
      id: authorityDid,
      service: [
        {
          id: `${authorityDid}#atproto_pds`,
          type: 'AtprotoPersonalDataServer',
          serviceEndpoint: 'https://pds.example/',
        },
        {
          id: '#atproto_space_host',
          type: 'AtprotoSpaceHost',
          serviceEndpoint: 'https://spaces.example/',
        },
      ],
      verificationMethod: [
        {
          id: `${authorityDid}#atproto`,
          publicKeyMultibase: 'zAccount',
        },
        {
          id: '#atproto_space',
          publicKeyMultibase: 'zSpace',
        },
      ],
    });

    await expect(resolver.resolve(ref)).resolves.toEqual({
      did: authorityDid,
      serviceId: `${authorityDid}#atproto_space_host`,
      serviceUrl: 'https://spaces.example',
      verificationMethodId: `${authorityDid}#atproto_space`,
      verificationMethod: {
        id: '#atproto_space',
        publicKeyMultibase: 'zSpace',
      },
    });
  });

  it('falls back to the account PDS and signing key', async () => {
    const resolver = resolverFor({
      id: authorityDid,
      service: [
        {
          id: '#atproto_pds',
          type: 'AtprotoPersonalDataServer',
          serviceEndpoint: 'http://localhost:2583',
        },
      ],
      verificationMethod: [
        {
          id: '#atproto',
          publicKeyMultibase: 'zAccount',
        },
      ],
    });

    await expect(resolver.resolve(ref)).resolves.toMatchObject({
      serviceId: `${authorityDid}#atproto_pds`,
      serviceUrl: 'http://localhost:2583',
      verificationMethodId: `${authorityDid}#atproto`,
    });
  });

  it('fails closed for mismatched documents and incomplete authority DIDs', async () => {
    await expect(
      resolverFor({
        id: fakeDid('did:plc:other'),
        service: [],
        verificationMethod: [],
      }).resolve(ref),
    ).rejects.toMatchObject({ kind: 'did-mismatch' });

    await expect(
      resolverFor({
        id: authorityDid,
        service: [],
        verificationMethod: [{ id: '#atproto' }],
      }).resolve(ref),
    ).rejects.toMatchObject({ kind: 'missing-service' });

    await expect(
      resolverFor({
        id: authorityDid,
        service: [
          {
            id: '#atproto_pds',
            serviceEndpoint: 'https://pds.example',
          },
        ],
        verificationMethod: [],
      }).resolve(ref),
    ).rejects.toMatchObject({ kind: 'missing-verification-method' });
  });

  it('rejects non-HTTP and structured service endpoints', async () => {
    for (const serviceEndpoint of [
      'did:example:service',
      { uri: 'https://pds.example' },
    ]) {
      await expect(
        resolverFor({
          id: authorityDid,
          service: [
            {
              id: '#atproto_pds',
              serviceEndpoint,
            },
          ],
          verificationMethod: [{ id: '#atproto' }],
        }).resolve(ref),
      ).rejects.toMatchObject({ kind: 'invalid-service' });
    }
  });

  it('maps DID resolution failures to an unavailable result', async () => {
    const resolver = new DidSpaceAuthorityResolver({
      async resolveDid() {
        throw new Error('PLC timeout');
      },
    });

    await expect(resolver.resolve(ref)).rejects.toMatchObject({
      kind: 'unavailable',
      message: 'Failed to resolve space authority did:plc:coop: PLC timeout',
    });
  });
});

function resolverFor(
  didDocument: SpaceAuthorityDidDocument,
): DidSpaceAuthorityResolver {
  return new DidSpaceAuthorityResolver({
    async resolveDid(did) {
      expect(did).toBe(authorityDid);
      return didDocument;
    },
  });
}
