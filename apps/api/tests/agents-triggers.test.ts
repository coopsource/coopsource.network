import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('Agent Trigger API', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  async function setupWithAgent(testApp: ReturnType<typeof createTestApp>) {
    await setupAndLogin(testApp);

    const agentRes = await testApp.agent
      .post('/api/v1/agents')
      .send({
        name: 'Trigger Agent',
        modelConfig: { chat: 'anthropic:claude-sonnet-4-20250514' },
        systemPrompt: 'You handle events.',
      })
      .expect(201);

    return agentRes.body.id as string;
  }

  it('creates a trigger (201)', async () => {
    const testApp = createTestApp();
    const agentId = await setupWithAgent(testApp);

    const res = await testApp.agent
      .post(`/api/v1/agents/${agentId}/triggers`)
      .send({
        eventType: 'proposal.created',
        promptTemplate:
          'A new proposal was created: {{event_data}}. Please summarize it.',
        cooldownSeconds: 60,
      })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.eventType).toBe('proposal.created');
    expect(res.body.cooldownSeconds).toBe(60);
    expect(res.body.enabled).toBe(true);
  });

  it('lists triggers (200)', async () => {
    const testApp = createTestApp();
    const agentId = await setupWithAgent(testApp);

    await testApp.agent
      .post(`/api/v1/agents/${agentId}/triggers`)
      .send({
        eventType: 'member.joined',
        promptTemplate: 'Welcome new member: {{event_data}}',
      })
      .expect(201);

    await testApp.agent
      .post(`/api/v1/agents/${agentId}/triggers`)
      .send({
        eventType: 'proposal.created',
        promptTemplate: 'New proposal: {{event_data}}',
      })
      .expect(201);

    const res = await testApp.agent
      .get(`/api/v1/agents/${agentId}/triggers`)
      .expect(200);

    expect(res.body.triggers).toHaveLength(2);
  });

  it('updates a trigger (200)', async () => {
    const testApp = createTestApp();
    const agentId = await setupWithAgent(testApp);

    const createRes = await testApp.agent
      .post(`/api/v1/agents/${agentId}/triggers`)
      .send({
        eventType: 'member.joined',
        promptTemplate: 'Welcome!',
      })
      .expect(201);

    const res = await testApp.agent
      .put(`/api/v1/agents/triggers/${createRes.body.id}`)
      .send({
        promptTemplate: 'Welcome new member! Please introduce yourself.',
        enabled: false,
        cooldownSeconds: 300,
      })
      .expect(200);

    expect(res.body.promptTemplate).toBe(
      'Welcome new member! Please introduce yourself.',
    );
    expect(res.body.enabled).toBe(false);
    expect(res.body.cooldownSeconds).toBe(300);
  });

  it('deletes a trigger (204)', async () => {
    const testApp = createTestApp();
    const agentId = await setupWithAgent(testApp);

    const createRes = await testApp.agent
      .post(`/api/v1/agents/${agentId}/triggers`)
      .send({
        eventType: 'member.joined',
        promptTemplate: 'Welcome!',
      })
      .expect(201);

    await testApp.agent
      .delete(`/api/v1/agents/triggers/${createRes.body.id}`)
      .expect(204);

    const listRes = await testApp.agent
      .get(`/api/v1/agents/${agentId}/triggers`)
      .expect(200);

    expect(listRes.body.triggers).toHaveLength(0);
  });

  it('rejects trigger for non-existent agent (404)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/agents/00000000-0000-0000-0000-000000000000/triggers')
      .send({
        eventType: 'member.joined',
        promptTemplate: 'Hello',
      })
      .expect(404);
  });

  it('requires auth (401)', async () => {
    const testApp = createTestApp();

    await testApp.agent
      .get('/api/v1/agents/some-id/triggers')
      .expect(401);
  });
});
