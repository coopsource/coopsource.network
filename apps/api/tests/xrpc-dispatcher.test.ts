import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, type TestApp } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('XRPC dispatcher', () => {
  let testApp: TestApp;

  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
    testApp = createTestApp();
  });

  it('returns 404 MethodNotFound for unregistered method', async () => {
    const res = await testApp.agent
      .get('/xrpc/com.example.nonexistent')
      .expect(404);

    expect(res.body).toEqual({
      error: 'MethodNotFound',
      message: 'Method not found: com.example.nonexistent',
    });
  });

  it('returns 405 InvalidMethod for POST to query endpoint', async () => {
    const res = await testApp.agent
      .post('/xrpc/network.coopsource.org.getCooperative')
      .send({})
      .expect(405);

    expect(res.body.error).toBe('InvalidMethod');
    expect(res.body.message).toContain('query');
    expect(res.body.message).toContain('GET');
  });

  it('sets CORS headers on GET response', async () => {
    const res = await testApp.agent
      .get('/xrpc/com.example.nonexistent');

    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-allow-methods']).toBe('GET, POST, OPTIONS');
  });

  it('handles OPTIONS preflight with CORS headers', async () => {
    const res = await testApp.agent
      .options('/xrpc/network.coopsource.org.getCooperative')
      .expect(204);

    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-allow-methods']).toBe('GET, POST, OPTIONS');
    expect(res.headers['access-control-allow-headers']).toBe('Content-Type, Authorization');
  });

  it('returns 400 InvalidRequest for missing required param', async () => {
    // getCooperative requires `cooperative` param
    const res = await testApp.agent
      .get('/xrpc/network.coopsource.org.getCooperative')
      .expect(400);

    expect(res.body.error).toBe('InvalidRequest');
  });

  it('returns 401 for viewer-gated method without session', async () => {
    const res = await testApp.agent
      .get('/xrpc/network.coopsource.org.getMembership')
      .query({ cooperative: 'did:plc:test123' })
      .expect(401);

    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});
