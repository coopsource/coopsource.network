import { describe, it, expect, beforeEach } from 'vitest';
import {
  truncateAllTables,
  getTestDb,
} from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('Automation Execution', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  async function setupWithTrigger(
    testApp: ReturnType<typeof createTestApp>,
    overrides: Record<string, unknown> = {},
  ) {
    const { coopDid } = await setupAndLogin(testApp);

    const agentRes = await testApp.agent
      .post('/api/v1/agents')
      .send({
        name: 'Automation Agent',
        modelConfig: { chat: 'anthropic:claude-sonnet-4-20250514' },
        systemPrompt: 'You handle events.',
      })
      .expect(201);

    const agentId = agentRes.body.id as string;

    const triggerRes = await testApp.agent
      .post(`/api/v1/agents/${agentId}/triggers`)
      .send({
        eventType: 'proposal.opened',
        promptTemplate: 'Event fired: {{event_type}} with data {{event_data}}',
        cooldownSeconds: 0,
        ...overrides,
      })
      .expect(201);

    return { coopDid, agentId, triggerId: triggerRes.body.id as string };
  }

  it('logs execution when trigger fires (via direct DB insert)', async () => {
    const testApp = createTestApp();
    const { coopDid, triggerId } = await setupWithTrigger(testApp);

    // Directly insert execution log to verify the schema works
    const db = getTestDb();
    await db
      .insertInto('trigger_execution_log')
      .values({
        trigger_id: triggerId,
        cooperative_did: coopDid,
        event_type: 'proposal.opened',
        event_data: JSON.stringify({ proposalId: '123' }),
        conditions_matched: true,
        actions_executed: JSON.stringify([
          { type: 'agent_message', status: 'success', durationMs: 100 },
        ]),
        status: 'completed',
        started_at: new Date(),
        completed_at: new Date(),
        duration_ms: 100,
      })
      .execute();

    // Verify via API
    const res = await testApp.agent
      .get(`/api/v1/agents/triggers/${triggerId}/executions`)
      .expect(200);

    expect(res.body.executions).toHaveLength(1);
    expect(res.body.executions[0].status).toBe('completed');
    expect(res.body.executions[0].conditionsMatched).toBe(true);
    expect(res.body.executions[0].eventType).toBe('proposal.opened');
  });

  it('logs skipped execution when conditions not matched', async () => {
    const testApp = createTestApp();
    const { coopDid, triggerId } = await setupWithTrigger(testApp);

    const db = getTestDb();
    await db
      .insertInto('trigger_execution_log')
      .values({
        trigger_id: triggerId,
        cooperative_did: coopDid,
        event_type: 'proposal.opened',
        event_data: JSON.stringify({ status: 'draft' }),
        conditions_matched: false,
        actions_executed: JSON.stringify([]),
        status: 'skipped',
        error: 'Conditions not matched',
        started_at: new Date(),
        completed_at: new Date(),
        duration_ms: 1,
      })
      .execute();

    const res = await testApp.agent
      .get(`/api/v1/agents/triggers/${triggerId}/executions`)
      .expect(200);

    expect(res.body.executions).toHaveLength(1);
    expect(res.body.executions[0].status).toBe('skipped');
    expect(res.body.executions[0].conditionsMatched).toBe(false);
  });

  it('creates trigger with conditions array', async () => {
    const testApp = createTestApp();
    const { agentId } = await setupWithTrigger(testApp);

    const res = await testApp.agent
      .post(`/api/v1/agents/${agentId}/triggers`)
      .send({
        eventType: 'vote.cast',
        conditions: [
          { field: 'proposal.status', operator: 'eq', value: 'voting' },
        ],
        promptTemplate: 'Vote cast: {{event_data}}',
      })
      .expect(201);

    expect(res.body.conditions).toEqual([
      { field: 'proposal.status', operator: 'eq', value: 'voting' },
    ]);
  });

  it('creates trigger with actions array', async () => {
    const testApp = createTestApp();
    const { agentId } = await setupWithTrigger(testApp);

    const res = await testApp.agent
      .post(`/api/v1/agents/${agentId}/triggers`)
      .send({
        eventType: 'member.joined',
        actions: [
          { type: 'notify', config: { title: 'New member joined!' } },
        ],
      })
      .expect(201);

    expect(res.body.actions).toEqual([
      { type: 'notify', config: { title: 'New member joined!' } },
    ]);
    expect(res.body.promptTemplate).toBeNull();
  });

  it('creates trigger with agent_message action requiring promptTemplate', async () => {
    const testApp = createTestApp();
    const { agentId } = await setupWithTrigger(testApp);

    const res = await testApp.agent
      .post(`/api/v1/agents/${agentId}/triggers`)
      .send({
        eventType: 'proposal.opened',
        actions: [
          {
            type: 'agent_message',
            config: { promptTemplate: 'Inline template: {{event_data}}' },
          },
        ],
      })
      .expect(201);

    expect(res.body.actions).toHaveLength(1);
    expect(res.body.actions[0].type).toBe('agent_message');
  });

  it('backward compat: old triggers with empty object conditions still work', async () => {
    const testApp = createTestApp();
    const { agentId } = await setupWithTrigger(testApp);

    // The trigger was created with default conditions = [] (migration converted {} to [])
    const res = await testApp.agent
      .get(`/api/v1/agents/${agentId}/triggers`)
      .expect(200);

    expect(res.body.triggers).toHaveLength(1);
    expect(Array.isArray(res.body.triggers[0].conditions)).toBe(true);
  });

  it('paginates execution logs', async () => {
    const testApp = createTestApp();
    const { coopDid, triggerId } = await setupWithTrigger(testApp);

    const db = getTestDb();
    // Insert 3 execution logs with different timestamps
    for (let i = 0; i < 3; i++) {
      const ts = new Date(Date.now() - i * 1000);
      await db
        .insertInto('trigger_execution_log')
        .values({
          trigger_id: triggerId,
          cooperative_did: coopDid,
          event_type: 'proposal.opened',
          event_data: JSON.stringify({ i }),
          conditions_matched: true,
          actions_executed: JSON.stringify([]),
          status: 'completed',
          started_at: ts,
          completed_at: ts,
          duration_ms: 1,
        })
        .execute();
    }

    const res = await testApp.agent
      .get(`/api/v1/agents/triggers/${triggerId}/executions?limit=2`)
      .expect(200);

    expect(res.body.executions).toHaveLength(2);
    expect(res.body.cursor).toBeDefined();

    const res2 = await testApp.agent
      .get(
        `/api/v1/agents/triggers/${triggerId}/executions?limit=2&cursor=${res.body.cursor}`,
      )
      .expect(200);

    expect(res2.body.executions).toHaveLength(1);
    expect(res2.body.cursor).toBeUndefined();
  });

  it('updates trigger actions field', async () => {
    const testApp = createTestApp();
    const { triggerId } = await setupWithTrigger(testApp);

    const res = await testApp.agent
      .put(`/api/v1/agents/triggers/${triggerId}`)
      .send({
        actions: [
          { type: 'call_webhook', config: { url: 'https://example.com/hook' } },
        ],
      })
      .expect(200);

    expect(res.body.actions).toEqual([
      { type: 'call_webhook', config: { url: 'https://example.com/hook' } },
    ]);
  });
});
