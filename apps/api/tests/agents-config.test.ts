import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('Agent Config API', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  // ─── CRUD ─────────────────────────────────────────────────────────────

  it('creates an agent (201)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const res = await testApp.agent
      .post('/api/v1/agents')
      .send({
        name: 'Test Agent',
        modelConfig: { chat: 'anthropic:claude-sonnet-4-20250514' },
        systemPrompt: 'You are a helpful assistant.',
      })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe('Test Agent');
    expect(res.body.agentType).toBe('custom');
    expect(res.body.modelConfig).toEqual({
      chat: 'anthropic:claude-sonnet-4-20250514',
    });
    expect(res.body.systemPrompt).toBe('You are a helpful assistant.');
    expect(res.body.enabled).toBe(true);
    expect(res.body.temperature).toBe(0.7);
    expect(res.body.maxTokensPerRequest).toBe(4096);
  });

  it('creates an agent with full model routing config (201)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const res = await testApp.agent
      .post('/api/v1/agents')
      .send({
        name: 'Routed Agent',
        modelConfig: {
          chat: 'anthropic:claude-opus-4-20250514',
          automation: 'ollama:llama3.3:70b',
          summarization: 'anthropic:claude-haiku-4-5-20251001',
          fallback: 'ollama:llama3.3:70b',
        },
        systemPrompt: 'You are a cooperative facilitator.',
        agentType: 'facilitator',
        temperature: 0.5,
      })
      .expect(201);

    expect(res.body.modelConfig.chat).toBe('anthropic:claude-opus-4-20250514');
    expect(res.body.modelConfig.automation).toBe('ollama:llama3.3:70b');
    expect(res.body.modelConfig.summarization).toBe(
      'anthropic:claude-haiku-4-5-20251001',
    );
    expect(res.body.modelConfig.fallback).toBe('ollama:llama3.3:70b');
    expect(res.body.agentType).toBe('facilitator');
    expect(res.body.temperature).toBe(0.5);
  });

  it('lists agents (200)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/agents')
      .send({
        name: 'Agent 1',
        modelConfig: { chat: 'anthropic:claude-sonnet-4-20250514' },
        systemPrompt: 'Prompt 1',
      })
      .expect(201);

    await testApp.agent
      .post('/api/v1/agents')
      .send({
        name: 'Agent 2',
        modelConfig: { chat: 'anthropic:claude-haiku-4-5-20251001' },
        systemPrompt: 'Prompt 2',
      })
      .expect(201);

    const res = await testApp.agent.get('/api/v1/agents').expect(200);

    expect(res.body.agents).toHaveLength(2);
    expect(res.body.agents[0].name).toBe('Agent 1');
    expect(res.body.agents[1].name).toBe('Agent 2');
  });

  it('gets a single agent (200)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const createRes = await testApp.agent
      .post('/api/v1/agents')
      .send({
        name: 'My Agent',
        modelConfig: { chat: 'anthropic:claude-sonnet-4-20250514' },
        systemPrompt: 'You help people.',
      })
      .expect(201);

    const res = await testApp.agent
      .get(`/api/v1/agents/${createRes.body.id}`)
      .expect(200);

    expect(res.body.name).toBe('My Agent');
    expect(res.body.id).toBe(createRes.body.id);
  });

  it('updates an agent (200)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const createRes = await testApp.agent
      .post('/api/v1/agents')
      .send({
        name: 'Original',
        modelConfig: { chat: 'anthropic:claude-sonnet-4-20250514' },
        systemPrompt: 'Original prompt',
      })
      .expect(201);

    const res = await testApp.agent
      .put(`/api/v1/agents/${createRes.body.id}`)
      .send({
        name: 'Updated',
        modelConfig: {
          chat: 'anthropic:claude-opus-4-20250514',
          summarization: 'anthropic:claude-haiku-4-5-20251001',
        },
        enabled: false,
      })
      .expect(200);

    expect(res.body.name).toBe('Updated');
    expect(res.body.modelConfig.chat).toBe('anthropic:claude-opus-4-20250514');
    expect(res.body.modelConfig.summarization).toBe(
      'anthropic:claude-haiku-4-5-20251001',
    );
    expect(res.body.enabled).toBe(false);
  });

  it('deletes an agent (204)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const createRes = await testApp.agent
      .post('/api/v1/agents')
      .send({
        name: 'To Delete',
        modelConfig: { chat: 'anthropic:claude-sonnet-4-20250514' },
        systemPrompt: 'Delete me',
      })
      .expect(201);

    await testApp.agent
      .delete(`/api/v1/agents/${createRes.body.id}`)
      .expect(204);

    // Should be gone
    await testApp.agent
      .get(`/api/v1/agents/${createRes.body.id}`)
      .expect(404);
  });

  // ─── Templates ────────────────────────────────────────────────────────

  it('creates an agent from template (201)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const res = await testApp.agent
      .post('/api/v1/agents/from-template')
      .send({ agentType: 'facilitator' })
      .expect(201);

    expect(res.body.agentType).toBe('facilitator');
    expect(res.body.name).toBe('Facilitator Agent');
    expect(res.body.systemPrompt).toContain('facilitator');
    expect(res.body.allowedTools).toContain('list-proposals');
    expect(res.body.modelConfig.chat).toBeDefined();
  });

  it('creates a template with custom name (201)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const res = await testApp.agent
      .post('/api/v1/agents/from-template')
      .send({
        agentType: 'governance',
        name: 'Governance Bot',
        monthlyBudgetCents: 5000,
      })
      .expect(201);

    expect(res.body.name).toBe('Governance Bot');
    expect(res.body.agentType).toBe('governance');
    expect(res.body.monthlyBudgetCents).toBe(5000);
  });

  it('rejects unknown template type (404)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/agents/from-template')
      .send({ agentType: 'custom' })
      .expect(404);
  });

  // ─── Validation ───────────────────────────────────────────────────────

  it('rejects agent without model config (400)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/agents')
      .send({
        name: 'Bad Agent',
        systemPrompt: 'No model config',
      })
      .expect(400);
  });

  it('rejects agent without system prompt (400)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/agents')
      .send({
        name: 'Bad Agent',
        modelConfig: { chat: 'anthropic:claude-sonnet-4-20250514' },
      })
      .expect(400);
  });

  it('rejects non-existent agent (404)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .get('/api/v1/agents/00000000-0000-0000-0000-000000000000')
      .expect(404);
  });

  // ─── Auth ─────────────────────────────────────────────────────────────

  it('requires authentication', async () => {
    const testApp = createTestApp();

    await testApp.agent.get('/api/v1/agents').expect(401);
  });

  // ─── Usage ────────────────────────────────────────────────────────────

  it('returns null usage for agent with no activity', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const createRes = await testApp.agent
      .post('/api/v1/agents')
      .send({
        name: 'Unused Agent',
        modelConfig: { chat: 'anthropic:claude-sonnet-4-20250514' },
        systemPrompt: 'Unused',
      })
      .expect(201);

    const res = await testApp.agent
      .get(`/api/v1/agents/${createRes.body.id}/usage`)
      .expect(200);

    expect(res.body.usage).toBeNull();
  });
});
