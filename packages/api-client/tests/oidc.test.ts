import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CoopSourceClient } from '../src/client.js';
import { BASE_URL, mockOkResponse, createMockFetchAndClient } from './helpers.js';

describe('CoopSourceClient - OIDC', () => {
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

  // --- registerOidcClient ---

  describe('registerOidcClient', () => {
    it('sends POST /api/oidc/clients with JSON body and returns OidcClient', async () => {
      const input = {
        name: 'My App',
        redirectUris: ['https://myapp.com/callback'],
        scopes: ['openid', 'profile'],
        grantTypes: ['authorization_code'],
      };
      const created = {
        clientId: 'client-123',
        clientSecret: 'secret-abc',
        name: 'My App',
        redirectUris: ['https://myapp.com/callback'],
        scopes: ['openid', 'profile'],
        grantTypes: ['authorization_code'],
        createdAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(created));

      const result = await client.registerOidcClient(input);

      expect(result).toEqual(created);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/oidc/clients`);
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual(input);
    });
  });

  // --- listOidcClients ---

  describe('listOidcClients', () => {
    it('sends GET /api/oidc/clients and returns clients array', async () => {
      const clients = [
        {
          clientId: 'client-123',
          clientSecret: 'secret-abc',
          name: 'My App',
          redirectUris: ['https://myapp.com/callback'],
          scopes: ['openid', 'profile'],
          grantTypes: ['authorization_code'],
          createdAt: '2026-01-01T00:00:00Z',
        },
      ];
      mockFetch.mockResolvedValueOnce(mockOkResponse({ clients }));

      const result = await client.listOidcClients();

      expect(result).toEqual({ clients });
      expect(result.clients).toHaveLength(1);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/oidc/clients`);
      expect(init.method).toBe('GET');
    });

    it('returns empty array when no clients exist', async () => {
      mockFetch.mockResolvedValueOnce(mockOkResponse({ clients: [] }));

      const result = await client.listOidcClients();

      expect(result).toEqual({ clients: [] });
      expect(result.clients).toHaveLength(0);
    });
  });

  // --- getOidcClient ---

  describe('getOidcClient', () => {
    it('sends GET /api/oidc/clients/{clientId} and returns OidcClient', async () => {
      const oidcClient = {
        clientId: 'client-123',
        clientSecret: 'secret-abc',
        name: 'My App',
        redirectUris: ['https://myapp.com/callback'],
        scopes: ['openid', 'profile'],
        grantTypes: ['authorization_code'],
        createdAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(oidcClient));

      const result = await client.getOidcClient('client-123');

      expect(result).toEqual(oidcClient);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/oidc/clients/client-123`);
      expect(init.method).toBe('GET');
    });
  });

  // --- deleteOidcClient ---

  describe('deleteOidcClient', () => {
    it('sends DELETE /api/oidc/clients/{clientId} and returns { ok: true }', async () => {
      mockFetch.mockResolvedValueOnce(mockOkResponse({ ok: true }));

      const result = await client.deleteOidcClient('client-123');

      expect(result).toEqual({ ok: true });

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/oidc/clients/client-123`);
      expect(init.method).toBe('DELETE');
    });
  });
});
