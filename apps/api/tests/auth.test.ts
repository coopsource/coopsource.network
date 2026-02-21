import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express from 'express';
import session from 'express-session';
import request from 'supertest';

// Create a minimal test app with session middleware
function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: 'test-secret',
      resave: false,
      saveUninitialized: false,
    }),
  );

  // Mock /auth/me endpoint (same logic as the real one but without OAuth restore)
  app.get('/auth/me', (req, res) => {
    if (!req.session.did) {
      res.status(401).json({ error: 'Unauthorized', message: 'Not authenticated' });
      return;
    }
    res.json({ did: req.session.did, handle: null, displayName: null });
  });

  // Mock /auth/logout endpoint
  app.post('/auth/logout', (req, res) => {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });

  // Helper to set session for testing
  app.post('/test/set-session', (req, res) => {
    req.session.did = req.body.did;
    req.session.save(() => {
      res.json({ ok: true });
    });
  });

  return app;
}

describe('Auth routes', () => {
  const app = createTestApp();

  it('GET /auth/me should return 401 when unauthenticated', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('GET /auth/me should return actor when authenticated', async () => {
    const agent = request.agent(app);

    // Set session
    await agent.post('/test/set-session').send({ did: 'did:plc:testuser' });

    const res = await agent.get('/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.did).toBe('did:plc:testuser');
  });

  it('POST /auth/logout should clear session', async () => {
    const agent = request.agent(app);

    // Set session
    await agent.post('/test/set-session').send({ did: 'did:plc:testuser' });

    // Verify authenticated
    const authRes = await agent.get('/auth/me');
    expect(authRes.status).toBe(200);

    // Logout
    const logoutRes = await agent.post('/auth/logout');
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.ok).toBe(true);

    // Verify session cleared
    const afterLogoutRes = await agent.get('/auth/me');
    expect(afterLogoutRes.status).toBe(401);
  });
});
