import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';
import type { TestApp } from './helpers/test-app.js';

describe('Agreement Templates', () => {
  let testApp: TestApp;
  let coopDid: string;
  let adminDid: string;

  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
    testApp = createTestApp();
    const result = await setupAndLogin(testApp);
    coopDid = result.coopDid;
    adminDid = result.adminDid;
  });

  const sampleTemplate = {
    name: 'Standard Worker Agreement',
    description: 'Template for onboarding new workers',
    agreementType: 'worker-cooperative',
    templateData: {
      title: 'Worker Cooperative Agreement',
      purpose: 'Govern the cooperative structure',
      scope: 'All worker-members',
      body: 'Standard terms and conditions apply.',
    },
  };

  function createTemplate(overrides: Record<string, unknown> = {}) {
    return testApp.agent
      .post('/api/v1/agreement-templates')
      .send({ ...sampleTemplate, ...overrides });
  }

  // ─── CRUD ──────────────────────────────────────────────────────────

  it('creates a template (201)', async () => {
    const res = await createTemplate().expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe('Standard Worker Agreement');
    expect(res.body.description).toBe('Template for onboarding new workers');
    expect(res.body.agreementType).toBe('worker-cooperative');
    expect(res.body.templateData.title).toBe('Worker Cooperative Agreement');
    expect(res.body.templateData.purpose).toBe('Govern the cooperative structure');
    expect(res.body.createdBy).toBe(adminDid);
    expect(res.body.cooperativeDid).toBe(coopDid);
    expect(res.body.createdAt).toBeDefined();
    expect(res.body.updatedAt).toBeDefined();
  });

  it('lists templates with pagination', async () => {
    await createTemplate({ name: 'Template A' }).expect(201);
    testApp.clock.advance(1000);
    await createTemplate({ name: 'Template B' }).expect(201);

    const res = await testApp.agent.get('/api/v1/agreement-templates').expect(200);

    expect(res.body.templates).toHaveLength(2);
    expect(res.body.cursor).toBeNull();
    // Newest first
    expect(res.body.templates[0].name).toBe('Template B');
    expect(res.body.templates[1].name).toBe('Template A');
  });

  it('paginates with cursor', async () => {
    // Create 3 templates
    await createTemplate({ name: 'Template 1' }).expect(201);
    testApp.clock.advance(1000);
    await createTemplate({ name: 'Template 2' }).expect(201);
    testApp.clock.advance(1000);
    await createTemplate({ name: 'Template 3' }).expect(201);

    // Get first page of 2
    const page1 = await testApp.agent
      .get('/api/v1/agreement-templates?limit=2')
      .expect(200);

    expect(page1.body.templates).toHaveLength(2);
    expect(page1.body.cursor).toBeDefined();

    // Get second page
    const page2 = await testApp.agent
      .get(`/api/v1/agreement-templates?limit=2&cursor=${page1.body.cursor}`)
      .expect(200);

    expect(page2.body.templates).toHaveLength(1);
    expect(page2.body.templates[0].name).toBe('Template 1');
    expect(page2.body.cursor).toBeNull();
  });

  it('gets a single template by id', async () => {
    const created = await createTemplate().expect(201);

    const res = await testApp.agent
      .get(`/api/v1/agreement-templates/${created.body.id}`)
      .expect(200);

    expect(res.body.name).toBe('Standard Worker Agreement');
    expect(res.body.id).toBe(created.body.id);
  });

  it('returns 404 for non-existent template', async () => {
    await testApp.agent
      .get('/api/v1/agreement-templates/00000000-0000-0000-0000-000000000000')
      .expect(404);
  });

  it('updates a template', async () => {
    const created = await createTemplate().expect(201);
    testApp.clock.advance(1000);

    const res = await testApp.agent
      .put(`/api/v1/agreement-templates/${created.body.id}`)
      .send({
        name: 'Updated Template',
        description: 'Updated description',
        templateData: {
          title: 'Updated Title',
          purpose: 'Updated purpose',
        },
      })
      .expect(200);

    expect(res.body.name).toBe('Updated Template');
    expect(res.body.description).toBe('Updated description');
    expect(res.body.templateData.title).toBe('Updated Title');
    expect(res.body.templateData.purpose).toBe('Updated purpose');
  });

  it('deletes a template (204)', async () => {
    const created = await createTemplate().expect(201);

    await testApp.agent
      .delete(`/api/v1/agreement-templates/${created.body.id}`)
      .expect(204);

    // Verify it's gone
    await testApp.agent
      .get(`/api/v1/agreement-templates/${created.body.id}`)
      .expect(404);
  });

  it('returns 404 when deleting non-existent template', async () => {
    await testApp.agent
      .delete('/api/v1/agreement-templates/00000000-0000-0000-0000-000000000000')
      .expect(404);
  });

  // ─── Use Template ──────────────────────────────────────────────────

  it('creates an agreement from template (201)', async () => {
    const created = await createTemplate().expect(201);

    const res = await testApp.agent
      .post(`/api/v1/agreement-templates/${created.body.id}/use`)
      .expect(201);

    expect(res.body.uri).toBeDefined();
    expect(res.body.title).toBe('Worker Cooperative Agreement');
    expect(res.body.purpose).toBe('Govern the cooperative structure');
    expect(res.body.scope).toBe('All worker-members');
    expect(res.body.body).toBe('Standard terms and conditions apply.');
    expect(res.body.agreementType).toBe('worker-cooperative');
    expect(res.body.status).toBe('draft');
    expect(res.body.authorDid).toBe(adminDid);
  });

  // ─── Validation ────────────────────────────────────────────────────

  it('returns 400 when name is missing', async () => {
    await testApp.agent
      .post('/api/v1/agreement-templates')
      .send({ description: 'No name' })
      .expect(400);
  });

  // ─── Auth ──────────────────────────────────────────────────────────

  it('requires authentication (401)', async () => {
    const unauthApp = createTestApp();

    await unauthApp.agent.get('/api/v1/agreement-templates').expect(401);
    await unauthApp.agent.post('/api/v1/agreement-templates').expect(401);
  });
});
