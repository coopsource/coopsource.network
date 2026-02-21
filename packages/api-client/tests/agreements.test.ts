import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CoopSourceClient } from '../src/client.js';
import {
  BASE_URL,
  PROJECT_URI,
  ENCODED_PROJECT_URI,
  AGREEMENT_URI,
  ENCODED_AGREEMENT_URI,
  AMENDMENT_URI,
  ENCODED_AMENDMENT_URI,
  mockOkResponse,
  createMockFetchAndClient,
} from './helpers.js';

describe('CoopSourceClient - Agreements', () => {
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

  describe('createAgreement', () => {
    it('sends POST /api/projects/{encoded}/agreements with JSON body', async () => {
      const input = { title: 'Partnership Agreement', purpose: 'Collaborate on project' };
      const created = {
        uri: AGREEMENT_URI,
        did: 'did:plc:abc',
        projectUri: PROJECT_URI,
        title: 'Partnership Agreement',
        purpose: 'Collaborate on project',
        status: 'draft',
        createdAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(created));

      const result = await client.createAgreement(PROJECT_URI, input);

      expect(result).toEqual(created);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/projects/${ENCODED_PROJECT_URI}/agreements`);
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual(input);
    });
  });

  describe('listAgreements', () => {
    it('sends GET /api/projects/{encoded}/agreements and maps agreements to data', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ agreements: [], cursor: null }),
      );

      const result = await client.listAgreements(PROJECT_URI);

      expect(result).toEqual({ data: [], cursor: null });

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/projects/${ENCODED_PROJECT_URI}/agreements`);
      expect(init.method).toBe('GET');
    });
  });

  describe('getAgreement', () => {
    it('sends GET /api/agreements/{encoded} and returns agreement', async () => {
      const agreement = {
        uri: AGREEMENT_URI,
        did: 'did:plc:abc',
        projectUri: PROJECT_URI,
        title: 'Partnership Agreement',
        status: 'draft',
        createdAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(agreement));

      const result = await client.getAgreement(AGREEMENT_URI);

      expect(result).toEqual(agreement);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/agreements/${ENCODED_AGREEMENT_URI}`);
      expect(init.method).toBe('GET');
    });
  });

  describe('updateAgreement', () => {
    it('sends PUT /api/agreements/{encoded} with JSON body', async () => {
      const input = { title: 'Updated Agreement', status: 'active' };
      const updated = {
        uri: AGREEMENT_URI,
        did: 'did:plc:abc',
        projectUri: PROJECT_URI,
        title: 'Updated Agreement',
        status: 'active',
        createdAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(updated));

      const result = await client.updateAgreement(AGREEMENT_URI, input);

      expect(result).toEqual(updated);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/agreements/${ENCODED_AGREEMENT_URI}`);
      expect(init.method).toBe('PUT');
      expect(JSON.parse(init.body as string)).toEqual(input);
    });
  });

  describe('addStakeholderTerms', () => {
    it('sends POST /api/agreements/{encoded}/terms with JSON body', async () => {
      const input = { stakeholderDid: 'did:plc:bob', stakeholderType: 'contributor' };
      const terms = {
        uri: 'at://did:plc:abc/network.coopsource.agreement.terms/t1',
        did: 'did:plc:abc',
        agreementUri: AGREEMENT_URI,
        stakeholderDid: 'did:plc:bob',
        stakeholderType: 'contributor',
        createdAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(terms));

      const result = await client.addStakeholderTerms(AGREEMENT_URI, input);

      expect(result).toEqual(terms);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/agreements/${ENCODED_AGREEMENT_URI}/terms`);
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual(input);
    });
  });

  describe('signAgreement', () => {
    it('sends POST /api/agreements/{encoded}/sign with optional JSON body', async () => {
      const input = { signerRole: 'member', signatureType: 'digital' };
      const signature = {
        uri: 'at://did:plc:abc/network.coopsource.agreement.signature/sig1',
        did: 'did:plc:abc',
        agreementUri: AGREEMENT_URI,
        signerRole: 'member',
        signatureType: 'digital',
        signedAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(signature));

      const result = await client.signAgreement(AGREEMENT_URI, input);

      expect(result).toEqual(signature);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/agreements/${ENCODED_AGREEMENT_URI}/sign`);
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual(input);
    });
  });

  describe('getSignatureStatus', () => {
    it('sends GET /api/agreements/{encoded}/signatures and returns status', async () => {
      const status = {
        agreementUri: AGREEMENT_URI,
        signatures: [],
        totalExpected: 3,
        totalSigned: 1,
        allSigned: false,
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(status));

      const result = await client.getSignatureStatus(AGREEMENT_URI);

      expect(result).toEqual(status);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/agreements/${ENCODED_AGREEMENT_URI}/signatures`);
      expect(init.method).toBe('GET');
    });
  });

  describe('proposeAmendment', () => {
    it('sends POST /api/agreements/{encoded}/amendments with JSON body', async () => {
      const input = { proposedChanges: { title: 'New Title' }, reasoning: 'Better clarity' };
      const amendment = {
        uri: AMENDMENT_URI,
        did: 'did:plc:abc',
        agreementUri: AGREEMENT_URI,
        proposedChanges: { title: 'New Title' },
        reasoning: 'Better clarity',
        status: 'proposed',
        createdAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(amendment));

      const result = await client.proposeAmendment(AGREEMENT_URI, input);

      expect(result).toEqual(amendment);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/agreements/${ENCODED_AGREEMENT_URI}/amendments`);
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual(input);
    });
  });

  describe('listAmendments', () => {
    it('sends GET /api/agreements/{encoded}/amendments and maps amendments to data', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ amendments: [], cursor: null }),
      );

      const result = await client.listAmendments(AGREEMENT_URI);

      expect(result).toEqual({ data: [], cursor: null });

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/agreements/${ENCODED_AGREEMENT_URI}/amendments`);
      expect(init.method).toBe('GET');
    });
  });

  describe('getAmendment', () => {
    it('sends GET /api/amendments/{encoded} and returns amendment', async () => {
      const amendment = {
        uri: AMENDMENT_URI,
        did: 'did:plc:abc',
        agreementUri: AGREEMENT_URI,
        proposedChanges: { title: 'New Title' },
        reasoning: 'Better clarity',
        status: 'proposed',
        createdAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(amendment));

      const result = await client.getAmendment(AMENDMENT_URI);

      expect(result).toEqual(amendment);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/amendments/${ENCODED_AMENDMENT_URI}`);
      expect(init.method).toBe('GET');
    });
  });

  describe('applyAmendment', () => {
    it('sends POST /api/amendments/{encoded}/apply and returns updated amendment', async () => {
      const applied = {
        uri: AMENDMENT_URI,
        did: 'did:plc:abc',
        agreementUri: AGREEMENT_URI,
        proposedChanges: { title: 'New Title' },
        reasoning: 'Better clarity',
        status: 'applied',
        createdAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(applied));

      const result = await client.applyAmendment(AMENDMENT_URI);

      expect(result).toEqual(applied);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/amendments/${ENCODED_AMENDMENT_URI}/apply`);
      expect(init.method).toBe('POST');
    });
  });

  describe('getVersionHistory', () => {
    it('sends GET /api/agreements/{encoded}/versions and returns version history', async () => {
      const history = {
        agreementUri: AGREEMENT_URI,
        versions: [{ version: 1, createdAt: '2026-01-01T00:00:00Z', changes: null }],
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(history));

      const result = await client.getVersionHistory(AGREEMENT_URI);

      expect(result).toEqual(history);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/agreements/${ENCODED_AGREEMENT_URI}/versions`);
      expect(init.method).toBe('GET');
    });
  });

  describe('compareVersions', () => {
    it('sends GET /api/agreements/{encoded}/versions/compare with query params', async () => {
      const comparison = {
        agreementUri: AGREEMENT_URI,
        versionA: 1,
        versionB: 2,
        changes: { title: ['Old', 'New'] },
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(comparison));

      const result = await client.compareVersions(AGREEMENT_URI, 1, 2);

      expect(result).toEqual(comparison);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const parsedUrl = new URL(url);
      expect(parsedUrl.pathname).toBe(`/api/agreements/${ENCODED_AGREEMENT_URI}/versions/compare`);
      expect(parsedUrl.searchParams.get('versionA')).toBe('1');
      expect(parsedUrl.searchParams.get('versionB')).toBe('2');
      expect(init.method).toBe('GET');
    });
  });

  describe('listAgreementTemplates', () => {
    it('sends GET /api/agreement-templates and returns the templates array directly', async () => {
      const templates = [
        { id: 't1', name: 'Standard', description: 'desc', sections: {} },
      ];
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ templates }),
      );

      const result = await client.listAgreementTemplates();

      expect(result).toEqual(templates);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/agreement-templates`);
      expect(init.method).toBe('GET');
    });
  });

  describe('getAgreementTemplate', () => {
    it('sends GET /api/agreement-templates/{templateId} and returns template', async () => {
      const template = {
        id: 't1',
        name: 'Standard',
        description: 'A standard agreement template',
        sections: { intro: 'Welcome' },
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(template));

      const result = await client.getAgreementTemplate('t1');

      expect(result).toEqual(template);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/agreement-templates/t1`);
      expect(init.method).toBe('GET');
    });
  });
});
