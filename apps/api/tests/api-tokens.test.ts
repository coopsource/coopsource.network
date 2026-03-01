import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('API Token API', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  it('creates a token (201)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const res = await testApp.agent
      .post('/api/v1/api-tokens')
      .send({ name: 'My Token', scopes: ['read'] })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe('My Token');
    expect(res.body.token).toBeDefined();
    expect(res.body.token).toMatch(/^csk_/);
    expect(res.body.scopes).toEqual(['read']);
    expect(res.body.expiresAt).toBeNull();
  });

  it('creates a token with expiry', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const res = await testApp.agent
      .post('/api/v1/api-tokens')
      .send({ name: 'Expiring Token', expiresInDays: 30 })
      .expect(201);

    expect(res.body.expiresAt).toBeDefined();
    expect(res.body.expiresAt).not.toBeNull();
  });

  it('lists tokens (200)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/api-tokens')
      .send({ name: 'Token 1' })
      .expect(201);

    await testApp.agent
      .post('/api/v1/api-tokens')
      .send({ name: 'Token 2' })
      .expect(201);

    const res = await testApp.agent
      .get('/api/v1/api-tokens')
      .expect(200);

    expect(res.body.tokens).toHaveLength(2);
    // Should NOT include the raw token value
    expect(res.body.tokens[0].token).toBeUndefined();
  });

  it('revokes a token (204)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const createRes = await testApp.agent
      .post('/api/v1/api-tokens')
      .send({ name: 'To Revoke' })
      .expect(201);

    await testApp.agent
      .delete(`/api/v1/api-tokens/${createRes.body.id}`)
      .expect(204);

    const listRes = await testApp.agent
      .get('/api/v1/api-tokens')
      .expect(200);

    expect(listRes.body.tokens).toHaveLength(0);
  });

  it('rejects revoke of non-existent token (404)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .delete('/api/v1/api-tokens/00000000-0000-0000-0000-000000000000')
      .expect(404);
  });

  it('requires auth (401)', async () => {
    const testApp = createTestApp();

    await testApp.agent
      .get('/api/v1/api-tokens')
      .expect(401);
  });
});
