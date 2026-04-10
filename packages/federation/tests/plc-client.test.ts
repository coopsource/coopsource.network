import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlcClient } from '../src/local/plc-client.js';

const MOCK_DID_DOC = {
  id: 'did:plc:abc123',
  alsoKnownAs: ['at://old.coop'],
  rotationKeys: ['zRotation1'],
  verificationMethods: { atproto: 'zOldKey' },
  services: {
    atproto_pds: {
      type: 'AtprotoPersonalDataServer',
      endpoint: 'https://old-pds.coop',
    },
  },
};

describe('PlcClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('create()', () => {
    it('should compute DID from DAG-CBOR and POST to /{did}', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', mockFetch);

      const client = new PlcClient('https://plc.directory');
      const did = await client.create({
        signingKey: 'zDnaerDaTF5BXEavCrfRZEk316dpbLsfPDZ3WJ5hRTPFU2169',
        handle: 'mycoop.coop',
        pdsUrl: 'https://pds.mycoop.coop',
      });

      // DID is computed client-side from DAG-CBOR, not from server response
      expect(did).toMatch(/^did:plc:[a-z2-7]{24}$/);
      expect(mockFetch).toHaveBeenCalledOnce();

      const [url, options] = mockFetch.mock.calls[0]!;
      // POST to /{did} (the computed DID, URL-encoded)
      expect(url).toBe(`https://plc.directory/${encodeURIComponent(did)}`);
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(options.body as string);
      expect(body.type).toBe('plc_operation');
      expect(body.prev).toBeNull();
      expect(body.verificationMethods.atproto).toBe(
        'zDnaerDaTF5BXEavCrfRZEk316dpbLsfPDZ3WJ5hRTPFU2169',
      );
      expect(body.alsoKnownAs).toEqual(['at://mycoop.coop']);
      expect(body.services.atproto_pds).toEqual({
        type: 'AtprotoPersonalDataServer',
        endpoint: 'https://pds.mycoop.coop',
      });
    });

    it('should return deterministic DID for same input', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', mockFetch);

      const client = new PlcClient('https://plc.directory');
      const params = {
        signingKey: 'zDnaerDaTF5BXEavCrfRZEk316dpbLsfPDZ3WJ5hRTPFU2169',
        handle: 'mycoop.coop',
        pdsUrl: 'https://pds.mycoop.coop',
      };
      const did1 = await client.create(params);
      const did2 = await client.create(params);
      expect(did1).toBe(did2);
    });

    it('should use signing key as rotation key when none provided', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', mockFetch);

      const client = new PlcClient('https://plc.directory');
      await client.create({
        signingKey: 'zSigningKey123',
        handle: 'test.coop',
        pdsUrl: 'https://pds.test.coop',
      });

      const body = JSON.parse(mockFetch.mock.calls[0]![1].body as string);
      expect(body.rotationKeys).toEqual(['zSigningKey123']);
    });

    it('should use custom rotation keys when provided', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', mockFetch);

      const client = new PlcClient('https://plc.directory');
      await client.create({
        signingKey: 'zSigningKey123',
        handle: 'test.coop',
        pdsUrl: 'https://pds.test.coop',
        rotationKeys: ['zRotation1', 'zRotation2'],
      });

      const body = JSON.parse(mockFetch.mock.calls[0]![1].body as string);
      expect(body.rotationKeys).toEqual(['zRotation1', 'zRotation2']);
    });

    it('should throw on HTTP error with details', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Invalid operation'),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = new PlcClient('https://plc.directory');
      await expect(
        client.create({
          signingKey: 'zKey',
          handle: 'test.coop',
          pdsUrl: 'https://pds.test.coop',
        }),
      ).rejects.toThrow('PLC create failed (400): Invalid operation');
    });
  });

  describe('resolve()', () => {
    it('should GET the DID document from PLC directory', async () => {
      const mockDoc = {
        id: 'did:plc:abc123',
        alsoKnownAs: ['at://mycoop.coop'],
        verificationMethod: [
          {
            id: '#atproto',
            type: 'Multikey',
            publicKeyMultibase: 'zKey123',
          },
        ],
        service: [
          {
            id: '#atproto_pds',
            type: 'AtprotoPersonalDataServer',
            serviceEndpoint: 'https://pds.mycoop.coop',
          },
        ],
      };
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockDoc),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = new PlcClient('https://plc.directory');
      const doc = await client.resolve('did:plc:abc123');

      expect(doc).toEqual(mockDoc);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://plc.directory/did%3Aplc%3Aabc123',
      );
    });

    it('should throw on resolution failure', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = new PlcClient('https://plc.directory');
      await expect(client.resolve('did:plc:notfound')).rejects.toThrow(
        'PLC resolve failed for did:plc:notfound (404)',
      );
    });
  });

  describe('update()', () => {
    it('should resolve current doc then POST an update operation', async () => {
      const mockFetch = vi.fn()
        // First call: resolve()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(MOCK_DID_DOC),
        })
        // Second call: update POST
        .mockResolvedValueOnce({ ok: true });
      vi.stubGlobal('fetch', mockFetch);

      const client = new PlcClient('https://plc.directory');
      await client.update(
        'did:plc:abc123',
        { handle: 'newhandle.coop' },
        { kty: 'EC', crv: 'P-256' }, // legacy object — no signing
      );

      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Second call is the update POST
      const [url, options] = mockFetch.mock.calls[1]!;
      expect(url).toBe('https://plc.directory/did%3Aplc%3Aabc123');
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body as string);
      expect(body.type).toBe('plc_operation');
      expect(body.alsoKnownAs).toEqual(['at://newhandle.coop']);
      // Merges with existing doc fields
      expect(body.rotationKeys).toEqual(['zRotation1']);
      expect(body.verificationMethods).toEqual({ atproto: 'zOldKey' });
    });

    it('should include only provided update fields, preserving others from current doc', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(MOCK_DID_DOC),
        })
        .mockResolvedValueOnce({ ok: true });
      vi.stubGlobal('fetch', mockFetch);

      const client = new PlcClient('https://plc.directory');
      await client.update(
        'did:plc:abc123',
        { pdsUrl: 'https://new-pds.coop' },
        {},
      );

      const body = JSON.parse(mockFetch.mock.calls[1]![1].body as string);
      expect(body.services.atproto_pds.endpoint).toBe('https://new-pds.coop');
      // Preserved from existing doc
      expect(body.alsoKnownAs).toEqual(['at://old.coop']);
      expect(body.verificationMethods).toEqual({ atproto: 'zOldKey' });
    });

    it('should throw on update failure', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(MOCK_DID_DOC),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 403,
          text: () => Promise.resolve('Unauthorized rotation key'),
        });
      vi.stubGlobal('fetch', mockFetch);

      const client = new PlcClient('https://plc.directory');
      await expect(
        client.update('did:plc:abc123', { handle: 'x.coop' }, {}),
      ).rejects.toThrow(
        'PLC update failed for did:plc:abc123 (403): Unauthorized rotation key',
      );
    });
  });
});
