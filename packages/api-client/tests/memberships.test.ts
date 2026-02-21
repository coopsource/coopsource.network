import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CoopSourceClient } from '../src/client.js';
import {
  BASE_URL,
  COOP_URI,
  MEMBERSHIP_URI,
  ENCODED_MEMBERSHIP_URI,
  mockOkResponse,
  mock204Response,
  createMockFetchAndClient,
} from './helpers.js';

describe('CoopSourceClient - Memberships', () => {
  let mockFetch: ReturnType<typeof createMockFetchAndClient>['mockFetch'];
  let client: CoopSourceClient;
  let restoreFetch: () => void;

  beforeEach(() => {
    const ctx = createMockFetchAndClient();
    mockFetch = ctx.mockFetch;
    client = ctx.client;
    restoreFetch = ctx.restore;
  });

  afterEach(() => {
    restoreFetch();
  });

  describe('createMembership', () => {
    it('sends POST /api/memberships with JSON body', async () => {
      const input = { entityUri: COOP_URI, memberDid: 'did:plc:bob', role: 'member' };
      const created = {
        uri: MEMBERSHIP_URI,
        did: 'did:plc:abc',
        entityUri: COOP_URI,
        memberDid: 'did:plc:bob',
        role: 'member',
        status: 'active',
        joinedAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(created));

      const result = await client.createMembership(input);

      expect(result).toEqual(created);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/memberships`);
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual(input);
    });
  });

  describe('listMembers', () => {
    it('sends GET /api/memberships with entityUri param and maps members to data', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ members: [], cursor: null }),
      );

      const result = await client.listMembers({ entityUri: COOP_URI });

      expect(result).toEqual({ data: [], cursor: null });

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const parsedUrl = new URL(url);
      expect(parsedUrl.pathname).toBe('/api/memberships');
      expect(parsedUrl.searchParams.get('entityUri')).toBe(COOP_URI);
      expect(init.method).toBe('GET');
    });
  });

  describe('removeMember', () => {
    it('sends DELETE /api/memberships/{encoded} and resolves without error', async () => {
      mockFetch.mockResolvedValueOnce(mock204Response());

      await expect(client.removeMember(MEMBERSHIP_URI)).resolves.toBeUndefined();

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/memberships/${ENCODED_MEMBERSHIP_URI}`);
      expect(init.method).toBe('DELETE');
    });
  });
});
