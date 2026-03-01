import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

/**
 * Chat tests use a mock approach: we configure a model provider and create
 * an agent, but since there's no real API key, the chat endpoint will fail
 * with a provider error. We test the setup, session management, and error handling.
 *
 * Full chat integration tests with real model providers are done manually.
 */
describe('Agent Chat API', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  async function setupWithAgent(testApp: ReturnType<typeof createTestApp>) {
    const { coopDid } = await setupAndLogin(testApp);

    // Configure an Anthropic provider (fake key)
    await testApp.agent
      .post('/api/v1/model-providers')
      .send({
        providerId: 'anthropic',
        displayName: 'Anthropic',
        credentials: { apiKey: 'sk-ant-test-fake-key' },
      })
      .expect(201);

    // Create an agent
    const agentRes = await testApp.agent
      .post('/api/v1/agents')
      .send({
        name: 'Chat Agent',
        modelConfig: { chat: 'anthropic:claude-sonnet-4-20250514' },
        systemPrompt: 'You are a helpful test assistant.',
      })
      .expect(201);

    return { coopDid, agentId: agentRes.body.id };
  }

  // ─── Chat endpoint (will fail at provider level with fake key) ────────

  it('rejects chat to non-existent agent (404)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/agents/00000000-0000-0000-0000-000000000000/chat')
      .send({ message: 'Hello' })
      .expect(404);
  });

  it('rejects chat to disabled agent', async () => {
    const testApp = createTestApp();
    const { agentId } = await setupWithAgent(testApp);

    // Disable the agent
    await testApp.agent
      .put(`/api/v1/agents/${agentId}`)
      .send({ enabled: false })
      .expect(200);

    const res = await testApp.agent
      .post(`/api/v1/agents/${agentId}/chat`)
      .send({ message: 'Hello' })
      .expect(403);

    expect(res.body.message).toContain('disabled');
  });

  it('rejects chat without a message (400)', async () => {
    const testApp = createTestApp();
    const { agentId } = await setupWithAgent(testApp);

    await testApp.agent
      .post(`/api/v1/agents/${agentId}/chat`)
      .send({})
      .expect(400);
  });

  it('rejects chat without auth (401)', async () => {
    const testApp = createTestApp();

    await testApp.agent
      .post('/api/v1/agents/some-id/chat')
      .send({ message: 'Hello' })
      .expect(401);
  });

  // ─── Sessions ─────────────────────────────────────────────────────────

  it('lists empty sessions (200)', async () => {
    const testApp = createTestApp();
    const { agentId } = await setupWithAgent(testApp);

    const res = await testApp.agent
      .get(`/api/v1/agents/${agentId}/sessions`)
      .expect(200);

    expect(res.body.sessions).toEqual([]);
  });

  it('returns empty messages for non-existent session', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const res = await testApp.agent
      .get('/api/v1/agents/sessions/00000000-0000-0000-0000-000000000000/messages')
      .expect(200);

    expect(res.body.messages).toEqual([]);
  });

  // ─── Available models ─────────────────────────────────────────────────

  it('lists available models for co-op (200)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    // Before any provider configured — empty
    const emptyRes = await testApp.agent
      .get('/api/v1/agents/models')
      .expect(200);

    expect(emptyRes.body.providers).toEqual([]);

    // Configure Anthropic
    await testApp.agent
      .post('/api/v1/model-providers')
      .send({
        providerId: 'anthropic',
        displayName: 'Anthropic',
        credentials: { apiKey: 'sk-ant-test-fake' },
        allowedModels: ['claude-sonnet-4-20250514'],
      })
      .expect(201);

    const res = await testApp.agent
      .get('/api/v1/agents/models')
      .expect(200);

    expect(res.body.providers).toHaveLength(1);
    expect(res.body.providers[0].providerId).toBe('anthropic');
    expect(res.body.providers[0].models).toHaveLength(1);
    expect(res.body.providers[0].models[0].id).toBe('claude-sonnet-4-20250514');
  });

  it('returns all models when allowedModels is empty', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/model-providers')
      .send({
        providerId: 'anthropic',
        displayName: 'Anthropic',
        credentials: { apiKey: 'sk-ant-test-fake' },
      })
      .expect(201);

    const res = await testApp.agent
      .get('/api/v1/agents/models')
      .expect(200);

    // Should return all Anthropic models (no filter)
    expect(res.body.providers[0].models.length).toBeGreaterThan(1);
  });
});
