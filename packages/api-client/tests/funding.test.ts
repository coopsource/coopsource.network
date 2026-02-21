import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CoopSourceClient } from '../src/client.js';
import {
  BASE_URL,
  COOKIE,
  CAMPAIGN_URI,
  ENCODED_CAMPAIGN_URI,
  PLEDGE_URI,
  ENCODED_PLEDGE_URI,
  mockOkResponse,
  createMockFetchAndClient,
} from './helpers.js';

describe('CoopSourceClient - Funding', () => {
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

  // --- createCampaign ---

  describe('createCampaign', () => {
    it('sends POST /api/campaigns with JSON body', async () => {
      const input = {
        beneficiaryUri: 'at://did:plc:abc/network.coopsource.org.project/123',
        title: 'Fund Our Project',
        goalAmount: 10000,
        goalCurrency: 'USD',
      };
      const created = {
        uri: CAMPAIGN_URI,
        did: 'did:plc:abc',
        title: 'Fund Our Project',
        beneficiaryUri: 'at://did:plc:abc/network.coopsource.org.project/123',
        goalAmount: 10000,
        goalCurrency: 'USD',
        status: 'draft',
        createdAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(created));

      const result = await client.createCampaign(input);

      expect(result).toEqual(created);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/campaigns`);
      expect(init.method).toBe('POST');
      expect(init.headers).toEqual(
        expect.objectContaining({
          'Content-Type': 'application/json',
          Cookie: COOKIE,
        }),
      );
      expect(JSON.parse(init.body as string)).toEqual(input);
    });
  });

  // --- listCampaigns ---

  describe('listCampaigns', () => {
    it('sends GET /api/campaigns without params', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ campaigns: [], cursor: null }),
      );

      const result = await client.listCampaigns();

      expect(result).toEqual({ data: [], cursor: null });

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/campaigns`);
      expect(init.method).toBe('GET');
      expect(init.headers).toEqual({ Cookie: COOKIE });
      expect(init.body).toBeUndefined();
    });

    it('sends query params when provided', async () => {
      const campaigns = [
        {
          uri: CAMPAIGN_URI,
          did: 'did:plc:abc',
          title: 'Fund Our Project',
          status: 'active',
          createdAt: '2026-01-01T00:00:00Z',
        },
      ];
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ campaigns, cursor: 'next456' }),
      );

      const result = await client.listCampaigns({
        tier: 'seed',
        status: 'active',
        mine: true,
      });

      expect(result).toEqual({ data: campaigns, cursor: 'next456' });

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      const parsedUrl = new URL(url);
      expect(parsedUrl.searchParams.get('tier')).toBe('seed');
      expect(parsedUrl.searchParams.get('status')).toBe('active');
      expect(parsedUrl.searchParams.get('mine')).toBe('true');
    });
  });

  // --- getCampaign ---

  describe('getCampaign', () => {
    it('sends GET /api/campaigns/{encoded} with the encoded URI', async () => {
      const campaign = {
        uri: CAMPAIGN_URI,
        did: 'did:plc:abc',
        title: 'Fund Our Project',
        goalAmount: 10000,
        goalCurrency: 'USD',
        status: 'active',
        createdAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(campaign));

      const result = await client.getCampaign(CAMPAIGN_URI);

      expect(result).toEqual(campaign);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/campaigns/${ENCODED_CAMPAIGN_URI}`);
      expect(init.method).toBe('GET');
      expect(init.headers).toEqual({ Cookie: COOKIE });
      expect(init.body).toBeUndefined();
    });
  });

  // --- updateCampaign ---

  describe('updateCampaign', () => {
    it('sends PUT /api/campaigns/{encoded} with JSON body', async () => {
      const input = { title: 'Updated Campaign' };
      const updated = {
        uri: CAMPAIGN_URI,
        did: 'did:plc:abc',
        title: 'Updated Campaign',
        goalAmount: 10000,
        goalCurrency: 'USD',
        status: 'active',
        createdAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(updated));

      const result = await client.updateCampaign(CAMPAIGN_URI, input);

      expect(result).toEqual(updated);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/campaigns/${ENCODED_CAMPAIGN_URI}`);
      expect(init.method).toBe('PUT');
      expect(init.headers).toEqual(
        expect.objectContaining({
          'Content-Type': 'application/json',
          Cookie: COOKIE,
        }),
      );
      expect(JSON.parse(init.body as string)).toEqual(input);
    });
  });

  // --- updateCampaignStatus ---

  describe('updateCampaignStatus', () => {
    it('sends PUT /api/campaigns/{encoded}/status with JSON body', async () => {
      const input = { status: 'active' };
      const updated = {
        uri: CAMPAIGN_URI,
        did: 'did:plc:abc',
        title: 'Fund Our Project',
        goalAmount: 10000,
        goalCurrency: 'USD',
        status: 'active',
        createdAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(updated));

      const result = await client.updateCampaignStatus(CAMPAIGN_URI, input);

      expect(result).toEqual(updated);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/campaigns/${ENCODED_CAMPAIGN_URI}/status`);
      expect(init.method).toBe('PUT');
      expect(init.headers).toEqual(
        expect.objectContaining({
          'Content-Type': 'application/json',
          Cookie: COOKIE,
        }),
      );
      expect(JSON.parse(init.body as string)).toEqual(input);
    });
  });

  // --- discoverCampaigns ---

  describe('discoverCampaigns', () => {
    it('sends GET /api/discover/campaigns without params', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ campaigns: [], cursor: null }),
      );

      const result = await client.discoverCampaigns();

      expect(result).toEqual({ data: [], cursor: null });

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/discover/campaigns`);
      expect(init.method).toBe('GET');
      expect(init.headers).toEqual({ Cookie: COOKIE });
      expect(init.body).toBeUndefined();
    });

    it('sends query params when provided', async () => {
      const campaigns = [
        {
          uri: CAMPAIGN_URI,
          did: 'did:plc:abc',
          title: 'Discoverable Campaign',
          status: 'active',
          createdAt: '2026-01-01T00:00:00Z',
        },
      ];
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ campaigns, cursor: 'discover_next' }),
      );

      const result = await client.discoverCampaigns({
        tier: 'growth',
        campaignType: 'equity',
      });

      expect(result).toEqual({ data: campaigns, cursor: 'discover_next' });

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      const parsedUrl = new URL(url);
      expect(parsedUrl.searchParams.get('tier')).toBe('growth');
      expect(parsedUrl.searchParams.get('campaignType')).toBe('equity');
    });
  });

  // --- discoverCampaignDetail ---

  describe('discoverCampaignDetail', () => {
    it('sends GET /api/discover/campaigns/{encoded} with the encoded URI', async () => {
      const campaign = {
        uri: CAMPAIGN_URI,
        did: 'did:plc:abc',
        title: 'Fund Our Project',
        goalAmount: 10000,
        goalCurrency: 'USD',
        status: 'active',
        createdAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(campaign));

      const result = await client.discoverCampaignDetail(CAMPAIGN_URI);

      expect(result).toEqual(campaign);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/discover/campaigns/${ENCODED_CAMPAIGN_URI}`);
      expect(init.method).toBe('GET');
      expect(init.headers).toEqual({ Cookie: COOKIE });
      expect(init.body).toBeUndefined();
    });
  });

  // --- createPledge ---

  describe('createPledge', () => {
    it('sends POST /api/campaigns/{encoded}/pledges with JSON body', async () => {
      const input = { amount: 100, currency: 'USD' };
      const created = {
        uri: PLEDGE_URI,
        did: 'did:plc:abc',
        campaignUri: CAMPAIGN_URI,
        amount: 100,
        currency: 'USD',
        paymentStatus: 'pending',
        createdAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(created));

      const result = await client.createPledge(CAMPAIGN_URI, input);

      expect(result).toEqual(created);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/campaigns/${ENCODED_CAMPAIGN_URI}/pledges`);
      expect(init.method).toBe('POST');
      expect(init.headers).toEqual(
        expect.objectContaining({
          'Content-Type': 'application/json',
          Cookie: COOKIE,
        }),
      );
      expect(JSON.parse(init.body as string)).toEqual(input);
    });
  });

  // --- listPledges ---

  describe('listPledges', () => {
    it('sends GET /api/campaigns/{encoded}/pledges without params', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ pledges: [], cursor: null }),
      );

      const result = await client.listPledges(CAMPAIGN_URI);

      expect(result).toEqual({ data: [], cursor: null });

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/campaigns/${ENCODED_CAMPAIGN_URI}/pledges`);
      expect(init.method).toBe('GET');
      expect(init.headers).toEqual({ Cookie: COOKIE });
      expect(init.body).toBeUndefined();
    });

    it('sends query params when provided', async () => {
      const pledges = [
        {
          uri: PLEDGE_URI,
          did: 'did:plc:abc',
          campaignUri: CAMPAIGN_URI,
          amount: 100,
          currency: 'USD',
          paymentStatus: 'completed',
          createdAt: '2026-01-01T00:00:00Z',
        },
      ];
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ pledges, cursor: 'pledge_next' }),
      );

      const result = await client.listPledges(CAMPAIGN_URI, {
        limit: 5,
        cursor: 'prev',
        paymentStatus: 'completed',
      });

      expect(result).toEqual({ data: pledges, cursor: 'pledge_next' });

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      const parsedUrl = new URL(url);
      expect(parsedUrl.pathname).toBe(`/api/campaigns/${ENCODED_CAMPAIGN_URI}/pledges`);
      expect(parsedUrl.searchParams.get('limit')).toBe('5');
      expect(parsedUrl.searchParams.get('cursor')).toBe('prev');
      expect(parsedUrl.searchParams.get('paymentStatus')).toBe('completed');
    });
  });

  // --- listBackers ---

  describe('listBackers', () => {
    it('sends GET /api/campaigns/{encoded}/backers without params', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ backers: [], cursor: null }),
      );

      const result = await client.listBackers(CAMPAIGN_URI);

      expect(result).toEqual({ data: [], cursor: null });

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/campaigns/${ENCODED_CAMPAIGN_URI}/backers`);
      expect(init.method).toBe('GET');
      expect(init.headers).toEqual({ Cookie: COOKIE });
      expect(init.body).toBeUndefined();
    });

    it('sends query params when provided', async () => {
      const backers = [
        {
          did: 'did:plc:backer1',
          handle: 'backer.test',
          totalPledged: 500,
          pledgeCount: 3,
        },
      ];
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ backers, cursor: 'backer_next' }),
      );

      const result = await client.listBackers(CAMPAIGN_URI, {
        limit: 20,
        cursor: 'start',
      });

      expect(result).toEqual({ data: backers, cursor: 'backer_next' });

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      const parsedUrl = new URL(url);
      expect(parsedUrl.pathname).toBe(`/api/campaigns/${ENCODED_CAMPAIGN_URI}/backers`);
      expect(parsedUrl.searchParams.get('limit')).toBe('20');
      expect(parsedUrl.searchParams.get('cursor')).toBe('start');
    });
  });

  // --- getPledge ---

  describe('getPledge', () => {
    it('sends GET /api/pledges/{encoded} with the encoded URI', async () => {
      const pledge = {
        uri: PLEDGE_URI,
        did: 'did:plc:abc',
        campaignUri: CAMPAIGN_URI,
        amount: 100,
        currency: 'USD',
        paymentStatus: 'pending',
        createdAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(pledge));

      const result = await client.getPledge(PLEDGE_URI);

      expect(result).toEqual(pledge);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/pledges/${ENCODED_PLEDGE_URI}`);
      expect(init.method).toBe('GET');
      expect(init.headers).toEqual({ Cookie: COOKIE });
      expect(init.body).toBeUndefined();
    });
  });

  // --- cancelPledge ---

  describe('cancelPledge', () => {
    it('sends DELETE /api/pledges/{encoded} and returns pledge', async () => {
      const cancelled = {
        uri: PLEDGE_URI,
        did: 'did:plc:abc',
        campaignUri: CAMPAIGN_URI,
        amount: 100,
        currency: 'USD',
        paymentStatus: 'cancelled',
        createdAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(cancelled));

      const result = await client.cancelPledge(PLEDGE_URI);

      expect(result).toEqual(cancelled);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/pledges/${ENCODED_PLEDGE_URI}`);
      expect(init.method).toBe('DELETE');
      expect(init.headers).toEqual({ Cookie: COOKIE });
      expect(init.body).toBeUndefined();
    });
  });

  // --- refundPledge ---

  describe('refundPledge', () => {
    it('sends POST /api/pledges/{encoded}/refund and returns pledge', async () => {
      const refunded = {
        uri: PLEDGE_URI,
        did: 'did:plc:abc',
        campaignUri: CAMPAIGN_URI,
        amount: 100,
        currency: 'USD',
        paymentStatus: 'refunded',
        createdAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(refunded));

      const result = await client.refundPledge(PLEDGE_URI);

      expect(result).toEqual(refunded);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/pledges/${ENCODED_PLEDGE_URI}/refund`);
      expect(init.method).toBe('POST');
      expect(init.headers).toEqual({ Cookie: COOKIE });
      expect(init.body).toBeUndefined();
    });
  });
});
