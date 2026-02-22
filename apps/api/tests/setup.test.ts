import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('Setup & Auth', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  describe('GET /api/v1/setup/status', () => {
    it('returns setupComplete: false initially', async () => {
      const { agent } = createTestApp();
      const res = await agent.get('/api/v1/setup/status').expect(200);
      expect(res.body).toEqual({ setupComplete: false });
    });

    it('returns setupComplete: true after initialization', async () => {
      const testApp = createTestApp();
      await setupAndLogin(testApp);

      const res = await testApp.agent.get('/api/v1/setup/status').expect(200);
      expect(res.body).toEqual({ setupComplete: true });
    });
  });

  describe('POST /api/v1/setup/initialize', () => {
    it('creates cooperative and admin entity', async () => {
      const testApp = createTestApp();
      const res = await testApp.agent
        .post('/api/v1/setup/initialize')
        .send({
          cooperativeName: 'Test Co-op',
          adminEmail: 'admin@test.com',
          adminPassword: 'password123',
          adminDisplayName: 'Admin User',
        })
        .expect(201);

      expect(res.body.coopDid).toBeDefined();
      expect(res.body.adminDid).toBeDefined();
      expect(res.body.coopDid).toMatch(/^did:/);
      expect(res.body.adminDid).toMatch(/^did:/);
    });

    it('fails when setup is already complete', async () => {
      const testApp = createTestApp();
      await setupAndLogin(testApp);

      const res = await testApp.agent
        .post('/api/v1/setup/initialize')
        .send({
          cooperativeName: 'Another Co-op',
          adminEmail: 'admin2@test.com',
          adminPassword: 'password123',
          adminDisplayName: 'Admin Two',
        })
        .expect(400);

      expect(res.body.error).toBe('ValidationError');
    });

    it('rejects short password', async () => {
      const testApp = createTestApp();
      await testApp.agent
        .post('/api/v1/setup/initialize')
        .send({
          cooperativeName: 'Test Cooperative',
          adminEmail: 'admin@test.com',
          adminPassword: 'short',
          adminDisplayName: 'Test Admin',
        })
        .expect(400);
    });

    it('rejects missing email', async () => {
      const testApp = createTestApp();
      await testApp.agent
        .post('/api/v1/setup/initialize')
        .send({
          cooperativeName: 'Test Cooperative',
          adminPassword: 'password123',
          adminDisplayName: 'Test Admin',
        })
        .expect(400);
    });

    it('validates required fields', async () => {
      const { agent } = createTestApp();
      const res = await agent
        .post('/api/v1/setup/initialize')
        .send({ cooperativeName: '' })
        .expect(400);

      expect(res.body.error).toBe('ValidationError');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('logs in with valid credentials', async () => {
      const testApp = createTestApp();
      await setupAndLogin(testApp);

      // Login with a fresh agent to test login independently
      const freshAgent = (await import('supertest')).default.agent(testApp.app);
      const res = await freshAgent
        .post('/api/v1/auth/login')
        .send({ email: 'admin@test.com', password: 'password123' })
        .expect(200);

      expect(res.body.did).toBeDefined();
      expect(res.body.displayName).toBe('Test Admin');
      expect(res.body.email).toBe('admin@test.com');
      expect(res.body.roles).toContain('admin');
      expect(res.body.roles).toContain('owner');
    });

    it('rejects invalid credentials', async () => {
      const testApp = createTestApp();
      await setupAndLogin(testApp);

      const freshAgent = (await import('supertest')).default.agent(testApp.app);
      await freshAgent
        .post('/api/v1/auth/login')
        .send({ email: 'admin@test.com', password: 'wrong' })
        .expect(401);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('returns current user with session', async () => {
      const testApp = createTestApp();
      await setupAndLogin(testApp);

      const res = await testApp.agent.get('/api/v1/auth/me').expect(200);

      expect(res.body.did).toBeDefined();
      expect(res.body.displayName).toBe('Test Admin');
      expect(res.body.email).toBe('admin@test.com');
      expect(res.body.roles).toContain('admin');
    });

    it('rejects unauthenticated request', async () => {
      const testApp = createTestApp();
      await setupAndLogin(testApp);

      const freshAgent = (await import('supertest')).default.agent(testApp.app);
      await freshAgent.get('/api/v1/auth/me').expect(401);
    });
  });

  describe('DELETE /api/v1/auth/session', () => {
    it('logs out and invalidates session', async () => {
      const testApp = createTestApp();
      await setupAndLogin(testApp);

      await testApp.agent.delete('/api/v1/auth/session').expect(204);

      // Should no longer be authenticated
      await testApp.agent.get('/api/v1/auth/me').expect(401);
    });
  });
});
