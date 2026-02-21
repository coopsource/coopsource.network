import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CoopSourceClient } from '../src/client.js';
import {
  BASE_URL,
  COOKIE,
  PROJECT_URI,
  ENCODED_PROJECT_URI,
  COOP_URI,
  mockOkResponse,
  createMockFetchAndClient,
} from './helpers.js';

describe('CoopSourceClient - Projects', () => {
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

  // --- listProjects ---

  describe('listProjects', () => {
    it('sends GET /api/projects and maps response to { data, cursor }', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ projects: [], cursor: null }),
      );

      const result = await client.listProjects();

      expect(result).toEqual({ data: [], cursor: null });

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/projects`);
      expect(init.method).toBe('GET');
      expect(init.headers).toEqual({ Cookie: COOKIE });
    });

    it('sends cooperativeUri query param when provided', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ projects: [], cursor: null }),
      );

      await client.listProjects({ cooperativeUri: COOP_URI });

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      const parsedUrl = new URL(url);
      expect(parsedUrl.searchParams.get('cooperativeUri')).toBe(COOP_URI);
    });

    it('sends limit and cursor query params', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ projects: [], cursor: 'next-page' }),
      );

      const result = await client.listProjects({ limit: 10, cursor: 'abc' });

      expect(result).toEqual({ data: [], cursor: 'next-page' });

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      const parsedUrl = new URL(url);
      expect(parsedUrl.searchParams.get('limit')).toBe('10');
      expect(parsedUrl.searchParams.get('cursor')).toBe('abc');
    });

    it('returns projects in the data array', async () => {
      const projects = [
        {
          uri: PROJECT_URI,
          did: 'did:plc:abc',
          name: 'Project One',
          description: null,
          cooperativeUri: COOP_URI,
          visibility: 'members',
          status: 'active',
          createdAt: '2026-01-01T00:00:00Z',
        },
      ];
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ projects, cursor: null }),
      );

      const result = await client.listProjects();

      expect(result.data).toEqual(projects);
      expect(result.data).toHaveLength(1);
      expect(result.cursor).toBeNull();
    });
  });

  // --- createProject ---

  describe('createProject', () => {
    it('sends POST /api/projects with JSON body', async () => {
      const input = {
        name: 'Test Project',
        cooperativeUri: 'at://did:plc:abc/coop/xyz',
      };
      const created = {
        uri: PROJECT_URI,
        did: 'did:plc:abc',
        name: 'Test Project',
        description: null,
        cooperativeUri: 'at://did:plc:abc/coop/xyz',
        visibility: 'members',
        status: 'active',
        createdAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(created));

      const result = await client.createProject(input);

      expect(result).toEqual(created);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/projects`);
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

  // --- getProject ---

  describe('getProject', () => {
    it('sends GET /api/projects/{encoded} with encoded AT URI', async () => {
      const project = {
        uri: PROJECT_URI,
        did: 'did:plc:abc',
        name: 'Test Project',
        description: 'A test project',
        cooperativeUri: COOP_URI,
        visibility: 'members',
        status: 'active',
        createdAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(project));

      const result = await client.getProject(PROJECT_URI);

      expect(result).toEqual(project);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/projects/${ENCODED_PROJECT_URI}`);
      expect(init.method).toBe('GET');
      expect(init.headers).toEqual({ Cookie: COOKIE });
    });
  });

  // --- updateProject ---

  describe('updateProject', () => {
    it('sends PUT /api/projects/{encoded} with JSON body', async () => {
      const input = { name: 'Updated Project' };
      const updated = {
        uri: PROJECT_URI,
        did: 'did:plc:abc',
        name: 'Updated Project',
        description: null,
        cooperativeUri: COOP_URI,
        visibility: 'members',
        status: 'active',
        createdAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(updated));

      const result = await client.updateProject(PROJECT_URI, input);

      expect(result).toEqual(updated);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/projects/${ENCODED_PROJECT_URI}`);
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

  // --- getConnectedResources ---

  describe('getConnectedResources', () => {
    it('sends GET /api/projects/{encoded}/connected-resources', async () => {
      const response = { bindings: [] };
      mockFetch.mockResolvedValueOnce(mockOkResponse(response));

      const result = await client.getConnectedResources(PROJECT_URI);

      expect(result).toEqual({ bindings: [] });

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        `${BASE_URL}/api/projects/${ENCODED_PROJECT_URI}/connected-resources`,
      );
      expect(init.method).toBe('GET');
      expect(init.headers).toEqual({ Cookie: COOKIE });
    });

    it('returns bindings when present', async () => {
      const bindings = [
        {
          uri: 'at://did:plc:abc/network.coopsource.connection.binding/b1',
          connectionUri: 'at://did:plc:abc/network.coopsource.connection.external/conn1',
          projectUri: PROJECT_URI,
          resourceType: 'github_repo',
          resourceId: 'org/repo',
          resourceName: 'My Repo',
          resourceUrl: 'https://github.com/org/repo',
          createdAt: '2026-01-01T00:00:00Z',
        },
      ];
      mockFetch.mockResolvedValueOnce(mockOkResponse({ bindings }));

      const result = await client.getConnectedResources(PROJECT_URI);

      expect(result.bindings).toEqual(bindings);
      expect(result.bindings).toHaveLength(1);
    });
  });
});
