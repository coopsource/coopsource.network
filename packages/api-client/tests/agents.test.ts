import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CoopSourceClient } from '../src/client.js';
import {
  BASE_URL,
  COOKIE,
  PROJECT_URI,
  ENCODED_PROJECT_URI,
  mockOkResponse,
  createMockFetchAndClient,
} from './helpers.js';

describe('CoopSourceClient - Agents', () => {
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

  // =====================================================================
  // createAgentConfig
  // =====================================================================

  describe('createAgentConfig', () => {
    it('sends POST /api/projects/{encoded}/agents with JSON body and returns AgentConfig', async () => {
      const input = {
        name: 'Review Bot',
        agentType: 'reviewer',
        model: 'claude-sonnet-4-5-20250929',
        systemPrompt: 'You review PRs',
      };
      const created = {
        id: 'agent1',
        projectUri: PROJECT_URI,
        createdBy: 'did:plc:abc',
        name: 'Review Bot',
        agentType: 'reviewer',
        model: 'claude-sonnet-4-5-20250929',
        systemPrompt: 'You review PRs',
        allowedTools: [],
        contextSources: [],
        temperature: 0.7,
        maxTokensPerRequest: 4096,
        maxTokensPerSession: 100000,
        monthlyBudgetCents: 1000,
        enabled: true,
        createdAt: '2026-01-15T00:00:00Z',
        updatedAt: '2026-01-15T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(created));

      const result = await client.createAgentConfig(PROJECT_URI, input);

      expect(result).toEqual(created);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/projects/${ENCODED_PROJECT_URI}/agents`);
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

  // =====================================================================
  // createAgentFromTemplate
  // =====================================================================

  describe('createAgentFromTemplate', () => {
    it('sends POST /api/projects/{encoded}/agents/from-template with JSON body and returns AgentConfig', async () => {
      const input = {
        agentType: 'reviewer',
        name: 'My Reviewer',
      };
      const created = {
        id: 'agent2',
        projectUri: PROJECT_URI,
        createdBy: 'did:plc:abc',
        name: 'My Reviewer',
        agentType: 'reviewer',
        model: 'claude-sonnet-4-5-20250929',
        systemPrompt: 'Default reviewer prompt',
        allowedTools: ['read_file', 'search_code'],
        contextSources: ['github'],
        temperature: 0.5,
        maxTokensPerRequest: 4096,
        maxTokensPerSession: 100000,
        monthlyBudgetCents: 500,
        enabled: true,
        createdAt: '2026-01-15T00:00:00Z',
        updatedAt: '2026-01-15T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(created));

      const result = await client.createAgentFromTemplate(PROJECT_URI, input);

      expect(result).toEqual(created);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        `${BASE_URL}/api/projects/${ENCODED_PROJECT_URI}/agents/from-template`,
      );
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

  // =====================================================================
  // listAgentConfigs
  // =====================================================================

  describe('listAgentConfigs', () => {
    it('sends GET /api/projects/{encoded}/agents and returns agents array', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ agents: [] }),
      );

      const result = await client.listAgentConfigs(PROJECT_URI);

      expect(result).toEqual({ agents: [] });

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/projects/${ENCODED_PROJECT_URI}/agents`);
      expect(init.method).toBe('GET');
      expect(init.headers).toEqual({ Cookie: COOKIE });
    });

    it('returns agents when present', async () => {
      const agents = [
        {
          id: 'agent1',
          projectUri: PROJECT_URI,
          createdBy: 'did:plc:abc',
          name: 'Review Bot',
          agentType: 'reviewer',
          model: 'claude-sonnet-4-5-20250929',
          systemPrompt: 'You review PRs',
          allowedTools: [],
          contextSources: [],
          temperature: 0.7,
          maxTokensPerRequest: 4096,
          maxTokensPerSession: 100000,
          monthlyBudgetCents: 1000,
          enabled: true,
          createdAt: '2026-01-15T00:00:00Z',
          updatedAt: '2026-01-15T00:00:00Z',
        },
      ];
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ agents }),
      );

      const result = await client.listAgentConfigs(PROJECT_URI);

      expect(result.agents).toEqual(agents);
      expect(result.agents).toHaveLength(1);
    });
  });

  // =====================================================================
  // getAgentConfig
  // =====================================================================

  describe('getAgentConfig', () => {
    it('sends GET /api/agents/{configId} and returns AgentConfig', async () => {
      const config = {
        id: 'agent1',
        projectUri: PROJECT_URI,
        createdBy: 'did:plc:abc',
        name: 'Review Bot',
        agentType: 'reviewer',
        model: 'claude-sonnet-4-5-20250929',
        systemPrompt: 'You review PRs',
        allowedTools: [],
        contextSources: [],
        temperature: 0.7,
        maxTokensPerRequest: 4096,
        maxTokensPerSession: 100000,
        monthlyBudgetCents: 1000,
        enabled: true,
        createdAt: '2026-01-15T00:00:00Z',
        updatedAt: '2026-01-15T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(config));

      const result = await client.getAgentConfig('agent1');

      expect(result).toEqual(config);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/agents/agent1`);
      expect(init.method).toBe('GET');
      expect(init.headers).toEqual({ Cookie: COOKIE });
    });
  });

  // =====================================================================
  // updateAgentConfig
  // =====================================================================

  describe('updateAgentConfig', () => {
    it('sends PUT /api/agents/{configId} with JSON body and returns updated AgentConfig', async () => {
      const input = { enabled: false };
      const updated = {
        id: 'agent1',
        projectUri: PROJECT_URI,
        createdBy: 'did:plc:abc',
        name: 'Review Bot',
        agentType: 'reviewer',
        model: 'claude-sonnet-4-5-20250929',
        systemPrompt: 'You review PRs',
        allowedTools: [],
        contextSources: [],
        temperature: 0.7,
        maxTokensPerRequest: 4096,
        maxTokensPerSession: 100000,
        monthlyBudgetCents: 1000,
        enabled: false,
        createdAt: '2026-01-15T00:00:00Z',
        updatedAt: '2026-01-16T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(updated));

      const result = await client.updateAgentConfig('agent1', input);

      expect(result).toEqual(updated);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/agents/agent1`);
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

  // =====================================================================
  // deleteAgentConfig
  // =====================================================================

  describe('deleteAgentConfig', () => {
    it('sends DELETE /api/agents/{configId} and returns { ok: true }', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ ok: true }),
      );

      const result = await client.deleteAgentConfig('agent1');

      expect(result).toEqual({ ok: true });

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/agents/agent1`);
      expect(init.method).toBe('DELETE');
      expect(init.headers).toEqual({ Cookie: COOKIE });
    });
  });

  // =====================================================================
  // sendAgentMessage
  // =====================================================================

  describe('sendAgentMessage', () => {
    it('sends POST /api/agents/{configId}/chat with JSON body and returns AgentChatResponse', async () => {
      const input = {
        message: 'Review this code',
        sessionId: 'sess1',
      };
      const chatResponse = {
        sessionId: 'sess1',
        response: 'LGTM',
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          costCents: 1,
        },
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(chatResponse));

      const result = await client.sendAgentMessage('agent1', input);

      expect(result).toEqual(chatResponse);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/agents/agent1/chat`);
      expect(init.method).toBe('POST');
      expect(init.headers).toEqual(
        expect.objectContaining({
          'Content-Type': 'application/json',
          Cookie: COOKIE,
        }),
      );
      expect(JSON.parse(init.body as string)).toEqual(input);
    });

    it('returns response with usage data', async () => {
      const input = { message: 'Review this code', sessionId: 'sess1' };
      const chatResponse = {
        sessionId: 'sess1',
        response: 'LGTM',
        usage: { inputTokens: 100, outputTokens: 50, costCents: 1 },
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(chatResponse));

      const result = await client.sendAgentMessage('agent1', input);

      expect(result.sessionId).toBe('sess1');
      expect(result.response).toBe('LGTM');
      expect(result.usage.inputTokens).toBe(100);
      expect(result.usage.outputTokens).toBe(50);
      expect(result.usage.costCents).toBe(1);
    });
  });

  // =====================================================================
  // listAgentSessions
  // =====================================================================

  describe('listAgentSessions', () => {
    it('sends GET /api/agents/{configId}/sessions and maps response to { data, cursor }', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ sessions: [], cursor: null }),
      );

      const result = await client.listAgentSessions('agent1');

      expect(result).toEqual({ data: [], cursor: null });

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/agents/agent1/sessions`);
      expect(init.method).toBe('GET');
      expect(init.headers).toEqual({ Cookie: COOKIE });
    });

    it('returns session data mapped to the data field', async () => {
      const session = {
        id: 'sess1',
        configId: 'agent1',
        userDid: 'did:plc:abc',
        title: 'Code review session',
        messageCount: 5,
        totalTokens: 2000,
        totalCostCents: 10,
        createdAt: '2026-01-15T00:00:00Z',
        lastMessageAt: '2026-01-15T01:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ sessions: [session], cursor: 'next-sess' }),
      );

      const result = await client.listAgentSessions('agent1');

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual(session);
      expect(result.cursor).toBe('next-sess');
    });

    it('includes pagination query params', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ sessions: [], cursor: null }),
      );

      await client.listAgentSessions('agent1', { limit: 10, cursor: 'cur1' });

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      const parsedUrl = new URL(url);
      expect(parsedUrl.searchParams.get('limit')).toBe('10');
      expect(parsedUrl.searchParams.get('cursor')).toBe('cur1');
    });

    it('omits query string when no pagination params given', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ sessions: [], cursor: null }),
      );

      await client.listAgentSessions('agent1');

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).not.toContain('?');
    });
  });

  // =====================================================================
  // getAgentSession
  // =====================================================================

  describe('getAgentSession', () => {
    it('sends GET /api/agents/sessions/{sessionId} and returns AgentSession', async () => {
      const session = {
        id: 'sess1',
        configId: 'agent1',
        userDid: 'did:plc:abc',
        title: 'Code review session',
        messageCount: 5,
        totalTokens: 2000,
        totalCostCents: 10,
        createdAt: '2026-01-15T00:00:00Z',
        lastMessageAt: '2026-01-15T01:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(session));

      const result = await client.getAgentSession('sess1');

      expect(result).toEqual(session);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/agents/sessions/sess1`);
      expect(init.method).toBe('GET');
      expect(init.headers).toEqual({ Cookie: COOKIE });
    });
  });

  // =====================================================================
  // getAgentSessionMessages
  // =====================================================================

  describe('getAgentSessionMessages', () => {
    it('sends GET /api/agents/sessions/{sessionId}/messages and maps response to { data, cursor }', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ messages: [], cursor: null }),
      );

      const result = await client.getAgentSessionMessages('sess1');

      expect(result).toEqual({ data: [], cursor: null });

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/agents/sessions/sess1/messages`);
      expect(init.method).toBe('GET');
      expect(init.headers).toEqual({ Cookie: COOKIE });
    });

    it('returns message data mapped to the data field', async () => {
      const message = {
        id: 'msg1',
        sessionId: 'sess1',
        role: 'assistant',
        content: 'LGTM',
        toolCalls: null,
        tokenCount: 50,
        costCents: 1,
        createdAt: '2026-01-15T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ messages: [message], cursor: 'next-msg' }),
      );

      const result = await client.getAgentSessionMessages('sess1');

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual(message);
      expect(result.cursor).toBe('next-msg');
    });

    it('includes pagination query params', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ messages: [], cursor: null }),
      );

      await client.getAgentSessionMessages('sess1', { limit: 20, cursor: 'msg-cur' });

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      const parsedUrl = new URL(url);
      expect(parsedUrl.searchParams.get('limit')).toBe('20');
      expect(parsedUrl.searchParams.get('cursor')).toBe('msg-cur');
    });

    it('omits query string when no pagination params given', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ messages: [], cursor: null }),
      );

      await client.getAgentSessionMessages('sess1');

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).not.toContain('?');
    });
  });

  // =====================================================================
  // deleteAgentSession
  // =====================================================================

  describe('deleteAgentSession', () => {
    it('sends DELETE /api/agents/sessions/{sessionId} and returns { ok: true }', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ ok: true }),
      );

      const result = await client.deleteAgentSession('sess1');

      expect(result).toEqual({ ok: true });

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/agents/sessions/sess1`);
      expect(init.method).toBe('DELETE');
      expect(init.headers).toEqual({ Cookie: COOKIE });
    });
  });

  // =====================================================================
  // getAgentUsage
  // =====================================================================

  describe('getAgentUsage', () => {
    it('sends GET /api/agents/{configId}/usage and returns AgentUsage', async () => {
      const usage = {
        configId: 'agent1',
        period: '2026-01',
        inputTokens: 50000,
        outputTokens: 25000,
        totalCostCents: 150,
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(usage));

      const result = await client.getAgentUsage('agent1');

      expect(result).toEqual(usage);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/agents/agent1/usage`);
      expect(init.method).toBe('GET');
      expect(init.headers).toEqual({ Cookie: COOKIE });
    });
  });

  // =====================================================================
  // getProjectAgentUsage
  // =====================================================================

  describe('getProjectAgentUsage', () => {
    it('sends GET /api/projects/{encoded}/agent-usage and returns ProjectAgentUsage', async () => {
      const projectUsage = {
        projectUri: PROJECT_URI,
        period: '2026-01',
        agents: [
          {
            configId: 'agent1',
            period: '2026-01',
            inputTokens: 50000,
            outputTokens: 25000,
            totalCostCents: 150,
          },
        ],
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(projectUsage));

      const result = await client.getProjectAgentUsage(PROJECT_URI);

      expect(result).toEqual(projectUsage);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/projects/${ENCODED_PROJECT_URI}/agent-usage`);
      expect(init.method).toBe('GET');
      expect(init.headers).toEqual({ Cookie: COOKIE });
    });

    it('encodes the project URI in the URL path', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ projectUri: PROJECT_URI, period: '2026-01', agents: [] }),
      );

      await client.getProjectAgentUsage(PROJECT_URI);

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(ENCODED_PROJECT_URI);
    });
  });

  // =====================================================================
  // listAgentTemplates
  // =====================================================================

  describe('listAgentTemplates', () => {
    it('sends GET /api/agents/templates and returns templates array', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ templates: [] }),
      );

      const result = await client.listAgentTemplates();

      expect(result).toEqual({ templates: [] });

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/agents/templates`);
      expect(init.method).toBe('GET');
      expect(init.headers).toEqual({ Cookie: COOKIE });
    });

    it('returns templates when present', async () => {
      const templates = [
        {
          id: 'tmpl-reviewer',
          name: 'Code Reviewer',
          description: 'Reviews pull requests',
          agentType: 'reviewer',
          model: 'claude-sonnet-4-5-20250929',
          systemPrompt: 'You are a code reviewer.',
        },
      ];
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ templates }),
      );

      const result = await client.listAgentTemplates();

      expect(result.templates).toEqual(templates);
      expect(result.templates).toHaveLength(1);
    });
  });

  // =====================================================================
  // listAgentTools
  // =====================================================================

  describe('listAgentTools', () => {
    it('sends GET /api/agents/tools and returns tools array', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ tools: [] }),
      );

      const result = await client.listAgentTools();

      expect(result).toEqual({ tools: [] });

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/agents/tools`);
      expect(init.method).toBe('GET');
      expect(init.headers).toEqual({ Cookie: COOKIE });
    });

    it('returns tools when present', async () => {
      const tools = [
        {
          name: 'read_file',
          description: 'Read a file from the repository',
          category: 'code',
        },
        {
          name: 'search_code',
          description: 'Search code across the repository',
          category: 'code',
        },
      ];
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ tools }),
      );

      const result = await client.listAgentTools();

      expect(result.tools).toEqual(tools);
      expect(result.tools).toHaveLength(2);
    });
  });

  // =====================================================================
  // listAgentModels
  // =====================================================================

  describe('listAgentModels', () => {
    it('sends GET /api/agents/models and returns models array', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ models: [] }),
      );

      const result = await client.listAgentModels();

      expect(result).toEqual({ models: [] });

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/agents/models`);
      expect(init.method).toBe('GET');
      expect(init.headers).toEqual({ Cookie: COOKIE });
    });

    it('returns models when present', async () => {
      const models = [
        {
          id: 'claude-sonnet-4-5-20250929',
          name: 'Claude Sonnet 4.5',
          provider: 'anthropic',
          capabilities: ['code_review', 'analysis', 'generation'],
        },
        {
          id: 'claude-opus-4-20250514',
          name: 'Claude Opus 4',
          provider: 'anthropic',
          capabilities: ['code_review', 'analysis', 'generation', 'complex_reasoning'],
        },
      ];
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ models }),
      );

      const result = await client.listAgentModels();

      expect(result.models).toEqual(models);
      expect(result.models).toHaveLength(2);
    });
  });
});
