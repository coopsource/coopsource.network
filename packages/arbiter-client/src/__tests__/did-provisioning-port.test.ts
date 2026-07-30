import type { DID } from '@coopsource/common';
import { describe, expect, it } from 'vitest';
import {
  PdsDidProvisioningPort,
  SPACE_HOST_SERVICE_ID,
  SPACE_HOST_SERVICE_TYPE,
  type DidDocumentWithServices,
} from '../index.js';

const did = 'did:plc:coop' as DID;
const actorDid = 'did:plc:owner' as DID;

describe('PdsDidProvisioningPort', () => {
  it('binds the current Proposal 0016 space-host service entry', async () => {
    let document: DidDocumentWithServices = {
      id: did,
      service: [
        {
          id: '#atproto_pds',
          type: 'AtprotoPersonalDataServer',
          serviceEndpoint: 'https://pds.example',
        },
      ],
    };
    const port = new PdsDidProvisioningPort({
      async resolveDid() {
        return document;
      },
      async updateDidDocument(_did, updates) {
        document = { id: did, service: updates.services };
        return document;
      },
    });

    await expect(
      port.bindSpaceHost({
        did,
        actorDid,
        serviceEndpoint: 'https://spaces.example',
      }),
    ).resolves.toEqual({
      ok: true,
      did,
      service: {
        id: '#atproto_space_host',
        type: 'AtprotoSpaceHost',
        serviceEndpoint: 'https://spaces.example',
      },
      changed: true,
    });
    expect(SPACE_HOST_SERVICE_ID).toBe('#atproto_space_host');
    expect(SPACE_HOST_SERVICE_TYPE).toBe('AtprotoSpaceHost');
    expect(document.service).toHaveLength(2);
  });

  it('recognizes a canonical absolute service id without rewriting the DID', async () => {
    let updateCalled = false;
    const port = new PdsDidProvisioningPort({
      async resolveDid() {
        return {
          id: did,
          service: [
            {
              id: `${did}#atproto_space_host`,
              type: 'AtprotoSpaceHost',
              serviceEndpoint: 'https://spaces.example',
            },
          ],
        };
      },
      async updateDidDocument() {
        updateCalled = true;
        throw new Error('unchanged binding must not update the DID document');
      },
    });

    await expect(
      port.bindSpaceHost({
        did,
        actorDid,
        serviceEndpoint: 'https://spaces.example',
      }),
    ).resolves.toMatchObject({ ok: true, changed: false });
    expect(updateCalled).toBe(false);
  });
});
