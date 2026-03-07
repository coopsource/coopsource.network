import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('Legal Documents', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  it('creates a legal document (201)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const res = await testApp.agent
      .post('/api/v1/legal/documents')
      .send({
        title: 'Bylaws v1',
        body: '# Article 1\n\nPurpose of the cooperative.',
        documentType: 'bylaws',
      })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.title).toBe('Bylaws v1');
    expect(res.body.documentType).toBe('bylaws');
    expect(res.body.version).toBe(1);
    expect(res.body.status).toBe('draft');
    expect(res.body.previousVersionUri).toBeNull();
    expect(res.body.createdAt).toBeDefined();
  });

  it('lists legal documents with pagination', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/legal/documents')
      .send({ title: 'Bylaws', documentType: 'bylaws' })
      .expect(201);

    await testApp.agent
      .post('/api/v1/legal/documents')
      .send({ title: 'Articles', documentType: 'articles' })
      .expect(201);

    const res = await testApp.agent
      .get('/api/v1/legal/documents')
      .expect(200);

    expect(res.body.documents).toHaveLength(2);
  });

  it('filters documents by type', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/legal/documents')
      .send({ title: 'Bylaws', documentType: 'bylaws' })
      .expect(201);

    await testApp.agent
      .post('/api/v1/legal/documents')
      .send({ title: 'Policy', documentType: 'policy' })
      .expect(201);

    const res = await testApp.agent
      .get('/api/v1/legal/documents?documentType=bylaws')
      .expect(200);

    expect(res.body.documents).toHaveLength(1);
    expect(res.body.documents[0].documentType).toBe('bylaws');
  });

  it('gets a document by id', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const createRes = await testApp.agent
      .post('/api/v1/legal/documents')
      .send({ title: 'Test Doc', documentType: 'policy', body: 'Content here' })
      .expect(201);

    const res = await testApp.agent
      .get(`/api/v1/legal/documents/${createRes.body.id}`)
      .expect(200);

    expect(res.body.title).toBe('Test Doc');
    expect(res.body.body).toBe('Content here');
  });

  it('creates a new version when updating content', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    // Create initial doc as active
    const v1 = await testApp.agent
      .post('/api/v1/legal/documents')
      .send({ title: 'Bylaws', documentType: 'bylaws', status: 'active' })
      .expect(201);

    // Update creates new version
    const v2 = await testApp.agent
      .put(`/api/v1/legal/documents/${v1.body.id}`)
      .send({ title: 'Bylaws v2', body: 'Updated content' })
      .expect(200);

    expect(v2.body.version).toBe(2);
    expect(v2.body.title).toBe('Bylaws v2');
    expect(v2.body.previousVersionUri).toBeDefined();
    expect(v2.body.status).toBe('draft');
  });

  it('transitions status draft -> active', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const doc = await testApp.agent
      .post('/api/v1/legal/documents')
      .send({ title: 'Policy', documentType: 'policy' })
      .expect(201);

    const updated = await testApp.agent
      .put(`/api/v1/legal/documents/${doc.body.id}`)
      .send({ status: 'active' })
      .expect(200);

    expect(updated.body.status).toBe('active');
  });

  it('rejects invalid status transition', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const doc = await testApp.agent
      .post('/api/v1/legal/documents')
      .send({ title: 'Policy', documentType: 'policy' })
      .expect(201);

    // Activate
    await testApp.agent
      .put(`/api/v1/legal/documents/${doc.body.id}`)
      .send({ status: 'active' })
      .expect(200);

    // Archive
    await testApp.agent
      .put(`/api/v1/legal/documents/${doc.body.id}`)
      .send({ status: 'archived' })
      .expect(200);

    // Cannot transition from archived
    await testApp.agent
      .put(`/api/v1/legal/documents/${doc.body.id}`)
      .send({ status: 'active' })
      .expect(409);
  });

  it('supersedes old active document when creating new version', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const v1 = await testApp.agent
      .post('/api/v1/legal/documents')
      .send({ title: 'Bylaws', documentType: 'bylaws', status: 'active' })
      .expect(201);

    await testApp.agent
      .put(`/api/v1/legal/documents/${v1.body.id}`)
      .send({ title: 'Bylaws v2' })
      .expect(200);

    // Original should now be superseded
    const original = await testApp.agent
      .get(`/api/v1/legal/documents/${v1.body.id}`)
      .expect(200);

    expect(original.body.status).toBe('superseded');
  });

  it('filters documents by status', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/legal/documents')
      .send({ title: 'Draft', documentType: 'policy' })
      .expect(201);

    const active = await testApp.agent
      .post('/api/v1/legal/documents')
      .send({ title: 'Active', documentType: 'policy', status: 'active' })
      .expect(201);

    const res = await testApp.agent
      .get('/api/v1/legal/documents?status=active')
      .expect(200);

    expect(res.body.documents).toHaveLength(1);
    expect(res.body.documents[0].id).toBe(active.body.id);
  });
});
