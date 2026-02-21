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

describe('CoopSourceClient - Automation', () => {
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
  // Workflows
  // =====================================================================

  describe('createWorkflow', () => {
    it('sends POST /api/projects/{encoded}/workflows with JSON body', async () => {
      const input = { name: 'Auto-deploy', description: 'Deploy on merge' };
      const created = {
        id: 'wf1',
        projectUri: PROJECT_URI,
        name: 'Auto-deploy',
        description: 'Deploy on merge',
        definition: null,
        enabled: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(created));

      const result = await client.createWorkflow(PROJECT_URI, input);

      expect(result).toEqual(created);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        `${BASE_URL}/api/projects/${ENCODED_PROJECT_URI}/workflows`,
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

  describe('listWorkflows', () => {
    it('sends GET /api/projects/{encoded}/workflows and returns { workflows }', async () => {
      const workflows = [
        {
          id: 'wf1',
          projectUri: PROJECT_URI,
          name: 'Auto-deploy',
          description: 'Deploy on merge',
          definition: null,
          enabled: true,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ];
      mockFetch.mockResolvedValueOnce(mockOkResponse({ workflows }));

      const result = await client.listWorkflows(PROJECT_URI);

      expect(result).toEqual({ workflows });
      expect(result.workflows).toHaveLength(1);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        `${BASE_URL}/api/projects/${ENCODED_PROJECT_URI}/workflows`,
      );
      expect(init.method).toBe('GET');
      expect(init.headers).toEqual({ Cookie: COOKIE });
    });

    it('returns empty array when no workflows exist', async () => {
      mockFetch.mockResolvedValueOnce(mockOkResponse({ workflows: [] }));

      const result = await client.listWorkflows(PROJECT_URI);

      expect(result).toEqual({ workflows: [] });
      expect(result.workflows).toHaveLength(0);
    });
  });

  describe('getWorkflow', () => {
    it('sends GET /api/workflows/{workflowId}', async () => {
      const workflow = {
        id: 'wf1',
        projectUri: PROJECT_URI,
        name: 'Auto-deploy',
        description: 'Deploy on merge',
        definition: null,
        enabled: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(workflow));

      const result = await client.getWorkflow('wf1');

      expect(result).toEqual(workflow);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/workflows/wf1`);
      expect(init.method).toBe('GET');
      expect(init.headers).toEqual({ Cookie: COOKIE });
    });
  });

  describe('updateWorkflow', () => {
    it('sends PUT /api/workflows/{workflowId} with JSON body', async () => {
      const input = { enabled: false };
      const updated = {
        id: 'wf1',
        projectUri: PROJECT_URI,
        name: 'Auto-deploy',
        description: 'Deploy on merge',
        definition: null,
        enabled: false,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-02T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(updated));

      const result = await client.updateWorkflow('wf1', input);

      expect(result).toEqual(updated);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/workflows/wf1`);
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

  describe('deleteWorkflow', () => {
    it('sends DELETE /api/workflows/{workflowId} and returns { ok: true }', async () => {
      mockFetch.mockResolvedValueOnce(mockOkResponse({ ok: true }));

      const result = await client.deleteWorkflow('wf1');

      expect(result).toEqual({ ok: true });

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/workflows/wf1`);
      expect(init.method).toBe('DELETE');
      expect(init.headers).toEqual({ Cookie: COOKIE });
    });
  });

  describe('executeWorkflow', () => {
    it('sends POST /api/workflows/{workflowId}/execute and returns execution', async () => {
      const execution = {
        id: 'exec1',
        workflowId: 'wf1',
        status: 'running',
        triggeredBy: 'manual',
        startedAt: '2026-01-01T00:00:00Z',
        completedAt: null,
        steps: [],
        error: null,
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(execution));

      const result = await client.executeWorkflow('wf1');

      expect(result).toEqual(execution);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/workflows/wf1/execute`);
      expect(init.method).toBe('POST');
      expect(init.headers).toEqual({ Cookie: COOKIE });
    });
  });

  describe('listWorkflowExecutions', () => {
    it('sends GET /api/workflows/{workflowId}/executions and maps to { data, cursor }', async () => {
      const executions = [
        {
          id: 'exec1',
          workflowId: 'wf1',
          status: 'completed',
          triggeredBy: 'manual',
          startedAt: '2026-01-01T00:00:00Z',
          completedAt: '2026-01-01T00:01:00Z',
          steps: [],
          error: null,
        },
      ];
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ executions, cursor: null }),
      );

      const result = await client.listWorkflowExecutions('wf1');

      expect(result).toEqual({ data: executions, cursor: null });

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/workflows/wf1/executions`);
      expect(init.method).toBe('GET');
      expect(init.headers).toEqual({ Cookie: COOKIE });
    });

    it('passes limit and cursor query params', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ executions: [], cursor: 'next-page' }),
      );

      const result = await client.listWorkflowExecutions('wf1', {
        limit: 5,
        cursor: 'abc',
      });

      expect(result).toEqual({ data: [], cursor: 'next-page' });

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      const parsedUrl = new URL(url);
      expect(parsedUrl.searchParams.get('limit')).toBe('5');
      expect(parsedUrl.searchParams.get('cursor')).toBe('abc');
    });
  });

  describe('getWorkflowExecution', () => {
    it('sends GET /api/workflows/{workflowId}/executions/{executionId}', async () => {
      const execution = {
        id: 'exec1',
        workflowId: 'wf1',
        status: 'completed',
        triggeredBy: 'manual',
        startedAt: '2026-01-01T00:00:00Z',
        completedAt: '2026-01-01T00:01:00Z',
        steps: [],
        error: null,
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(execution));

      const result = await client.getWorkflowExecution('wf1', 'exec1');

      expect(result).toEqual(execution);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/workflows/wf1/executions/exec1`);
      expect(init.method).toBe('GET');
      expect(init.headers).toEqual({ Cookie: COOKIE });
    });
  });

  // =====================================================================
  // Triggers
  // =====================================================================

  describe('createTrigger', () => {
    it('sends POST /api/workflows/{workflowId}/triggers with JSON body', async () => {
      const input = {
        eventType: 'proposal.created',
        conditions: { status: 'open' },
      };
      const created = {
        id: 'trig1',
        workflowId: 'wf1',
        eventType: 'proposal.created',
        conditions: { status: 'open' },
        enabled: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(created));

      const result = await client.createTrigger('wf1', input);

      expect(result).toEqual(created);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/workflows/wf1/triggers`);
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

  describe('listTriggers', () => {
    it('sends GET /api/workflows/{workflowId}/triggers and returns { triggers }', async () => {
      const triggers = [
        {
          id: 'trig1',
          workflowId: 'wf1',
          eventType: 'proposal.created',
          conditions: { status: 'open' },
          enabled: true,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ];
      mockFetch.mockResolvedValueOnce(mockOkResponse({ triggers }));

      const result = await client.listTriggers('wf1');

      expect(result).toEqual({ triggers });
      expect(result.triggers).toHaveLength(1);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/workflows/wf1/triggers`);
      expect(init.method).toBe('GET');
      expect(init.headers).toEqual({ Cookie: COOKIE });
    });

    it('returns empty array when no triggers exist', async () => {
      mockFetch.mockResolvedValueOnce(mockOkResponse({ triggers: [] }));

      const result = await client.listTriggers('wf1');

      expect(result).toEqual({ triggers: [] });
      expect(result.triggers).toHaveLength(0);
    });
  });

  describe('getTrigger', () => {
    it('sends GET /api/triggers/{triggerId}', async () => {
      const trigger = {
        id: 'trig1',
        workflowId: 'wf1',
        eventType: 'proposal.created',
        conditions: { status: 'open' },
        enabled: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(trigger));

      const result = await client.getTrigger('trig1');

      expect(result).toEqual(trigger);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/triggers/trig1`);
      expect(init.method).toBe('GET');
      expect(init.headers).toEqual({ Cookie: COOKIE });
    });
  });

  describe('updateTrigger', () => {
    it('sends PUT /api/triggers/{triggerId} with JSON body', async () => {
      const input = { enabled: false };
      const updated = {
        id: 'trig1',
        workflowId: 'wf1',
        eventType: 'proposal.created',
        conditions: { status: 'open' },
        enabled: false,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-02T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(updated));

      const result = await client.updateTrigger('trig1', input);

      expect(result).toEqual(updated);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/triggers/trig1`);
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

  describe('deleteTrigger', () => {
    it('sends DELETE /api/triggers/{triggerId} and returns { ok: true }', async () => {
      mockFetch.mockResolvedValueOnce(mockOkResponse({ ok: true }));

      const result = await client.deleteTrigger('trig1');

      expect(result).toEqual({ ok: true });

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/triggers/trig1`);
      expect(init.method).toBe('DELETE');
      expect(init.headers).toEqual({ Cookie: COOKIE });
    });
  });

  // =====================================================================
  // Events
  // =====================================================================

  describe('listEvents', () => {
    it('sends GET /api/projects/{encoded}/events and maps to { data, cursor }', async () => {
      const events = [
        {
          id: 'evt1',
          projectUri: PROJECT_URI,
          eventType: 'proposal.created',
          actorDid: 'did:plc:abc',
          payload: { proposalUri: 'at://...' },
          createdAt: '2026-01-01T00:00:00Z',
        },
      ];
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ events, cursor: null }),
      );

      const result = await client.listEvents(PROJECT_URI);

      expect(result).toEqual({ data: events, cursor: null });

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        `${BASE_URL}/api/projects/${ENCODED_PROJECT_URI}/events`,
      );
      expect(init.method).toBe('GET');
      expect(init.headers).toEqual({ Cookie: COOKIE });
    });

    it('passes limit and cursor query params', async () => {
      mockFetch.mockResolvedValueOnce(
        mockOkResponse({ events: [], cursor: 'next-page' }),
      );

      const result = await client.listEvents(PROJECT_URI, {
        limit: 20,
        cursor: 'page2',
      });

      expect(result).toEqual({ data: [], cursor: 'next-page' });

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      const parsedUrl = new URL(url);
      expect(parsedUrl.searchParams.get('limit')).toBe('20');
      expect(parsedUrl.searchParams.get('cursor')).toBe('page2');
    });
  });

  // =====================================================================
  // Templates
  // =====================================================================

  describe('listWorkflowTemplates', () => {
    it('sends GET /api/workflow-templates and returns { templates }', async () => {
      const templates = [
        {
          id: 'tpl1',
          name: 'CI/CD Pipeline',
          description: 'Standard CI/CD workflow template',
          definition: { steps: [] },
          category: 'deployment',
        },
      ];
      mockFetch.mockResolvedValueOnce(mockOkResponse({ templates }));

      const result = await client.listWorkflowTemplates();

      expect(result).toEqual({ templates });
      expect(result.templates).toHaveLength(1);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/workflow-templates`);
      expect(init.method).toBe('GET');
      expect(init.headers).toEqual({ Cookie: COOKIE });
    });

    it('returns empty array when no templates exist', async () => {
      mockFetch.mockResolvedValueOnce(mockOkResponse({ templates: [] }));

      const result = await client.listWorkflowTemplates();

      expect(result).toEqual({ templates: [] });
      expect(result.templates).toHaveLength(0);
    });
  });

  describe('getWorkflowTemplate', () => {
    it('sends GET /api/workflow-templates/{templateId}', async () => {
      const template = {
        id: 'tpl1',
        name: 'CI/CD Pipeline',
        description: 'Standard CI/CD workflow template',
        definition: { steps: [] },
        category: 'deployment',
      };
      mockFetch.mockResolvedValueOnce(mockOkResponse(template));

      const result = await client.getWorkflowTemplate('tpl1');

      expect(result).toEqual(template);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/workflow-templates/tpl1`);
      expect(init.method).toBe('GET');
      expect(init.headers).toEqual({ Cookie: COOKIE });
    });
  });
});
