import { describe, expect, it } from 'vitest';
import type { DID } from '@coopsource/common';
import { DidPermissionedSyncResolver } from '../did-permissioned-sync-resolver.js';
import type { SpaceRef } from '../types.js';

const authorityDid = 'did:plc:coop' as DID;
const writerDid = 'did:plc:alice' as DID;
const space: SpaceRef = {
  arbiterDid: authorityDid,
  expectedSpaceType: 'app.example.space',
  spaceKey: 'members',
};

describe('DidPermissionedSyncResolver', () => {
  it('separately resolves the authority host and writer repo/key', async () => {
    const resolver = new DidPermissionedSyncResolver({
      resolveDid: async (did) =>
        did === authorityDid
          ? {
              id: authorityDid,
              service: [
                {
                  id: '#atproto_space_host',
                  serviceEndpoint: 'https://space.example',
                },
              ],
              verificationMethod: [
                {
                  id: '#atproto_space',
                  publicKeyMultibase: 'zAuthority',
                },
              ],
            }
          : {
              id: writerDid,
              service: [
                {
                  id: `${writerDid}#atproto_pds`,
                  serviceEndpoint: 'https://writer.example/',
                },
              ],
              verificationMethod: [
                {
                  id: `${writerDid}#atproto`,
                  publicKeyMultibase: 'zWriter',
                },
              ],
            },
    });

    await expect(resolver.resolveSpaceHost(space)).resolves.toBe(
      'https://space.example',
    );
    await expect(resolver.resolveRepoHost(writerDid)).resolves.toBe(
      'https://writer.example',
    );
    await expect(resolver.resolveSigningKey(writerDid)).resolves.toBe(
      'did:key:zWriter',
    );
  });

  it('fails closed when a writer DID document is mismatched', async () => {
    const resolver = new DidPermissionedSyncResolver({
      resolveDid: async () => ({
        id: 'did:plc:other' as DID,
        service: [],
        verificationMethod: [],
      }),
    });

    await expect(resolver.resolveRepoHost(writerDid)).rejects.toMatchObject({
      kind: 'did-mismatch',
    });
  });
});
