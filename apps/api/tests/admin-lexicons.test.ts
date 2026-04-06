import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin, type TestApp } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('Admin lexicon management (P7)', () => {
  let testApp: TestApp;
  let coopDid: string;

  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
    testApp = createTestApp();
    const result = await setupAndLogin(testApp);
    coopDid = result.coopDid;
  });

  it('POST /admin/lexicons registers a new lexicon (201)', async () => {
    const lexiconDoc = {
      lexicon: 1,
      id: 'com.example.test.record',
      defs: {
        main: {
          type: 'record',
          key: 'tid',
          record: {
            type: 'object',
            required: ['title'],
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
            },
          },
        },
      },
    };

    const res = await testApp.agent
      .post('/api/v1/admin/lexicons')
      .send({
        nsid: 'com.example.test.record',
        lexiconDoc,
      })
      .expect(201);

    expect(res.body.nsid).toBe('com.example.test.record');
    expect(res.body.registered).toBe(true);
  });

  it('GET /admin/lexicons lists built-in and registered lexicons', async () => {
    // Register a lexicon first
    await testApp.agent
      .post('/api/v1/admin/lexicons')
      .send({
        nsid: 'com.example.listed.record',
        lexiconDoc: {
          lexicon: 1,
          id: 'com.example.listed.record',
          defs: { main: { type: 'record', key: 'tid', record: { type: 'object', properties: {} } } },
        },
      })
      .expect(201);

    const res = await testApp.agent
      .get('/api/v1/admin/lexicons')
      .expect(200);

    expect(res.body.lexicons).toBeDefined();
    expect(Array.isArray(res.body.lexicons)).toBe(true);

    // Should include built-in lexicons
    const builtins = res.body.lexicons.filter(
      (l: { source: string }) => l.source === 'builtin',
    );
    expect(builtins.length).toBeGreaterThan(0);

    // Should include our registered lexicon
    const registered = res.body.lexicons.find(
      (l: { nsid: string }) => l.nsid === 'com.example.listed.record',
    );
    expect(registered).toBeDefined();
    expect(registered.source).toBe('registered');
  });

  it('GET /admin/lexicons/:nsid returns a single lexicon', async () => {
    // Register
    const doc = {
      lexicon: 1,
      id: 'com.example.single.record',
      defs: { main: { type: 'record', key: 'tid', record: { type: 'object', properties: { name: { type: 'string' } } } } },
    };

    await testApp.agent
      .post('/api/v1/admin/lexicons')
      .send({ nsid: 'com.example.single.record', lexiconDoc: doc })
      .expect(201);

    const res = await testApp.agent
      .get('/api/v1/admin/lexicons/com.example.single.record')
      .expect(200);

    expect(res.body.nsid).toBe('com.example.single.record');
    expect(res.body.source).toBe('registered');
    expect(res.body.lexiconDoc).toBeDefined();
    expect(res.body.enabled).toBe(true);
  });

  it('GET /admin/lexicons/:nsid returns 404 for unknown NSID', async () => {
    await testApp.agent
      .get('/api/v1/admin/lexicons/com.example.nonexistent')
      .expect(404);
  });

  it('DELETE /admin/lexicons/:nsid removes a registered lexicon', async () => {
    // Register first
    await testApp.agent
      .post('/api/v1/admin/lexicons')
      .send({
        nsid: 'com.example.deletable.record',
        lexiconDoc: {
          lexicon: 1,
          id: 'com.example.deletable.record',
          defs: { main: { type: 'record', key: 'tid', record: { type: 'object', properties: {} } } },
        },
      })
      .expect(201);

    // Verify it exists
    await testApp.agent
      .get('/api/v1/admin/lexicons/com.example.deletable.record')
      .expect(200);

    // Delete
    const res = await testApp.agent
      .delete('/api/v1/admin/lexicons/com.example.deletable.record')
      .expect(200);

    expect(res.body.nsid).toBe('com.example.deletable.record');
    expect(res.body.removed).toBe(true);

    // Should no longer be found
    await testApp.agent
      .get('/api/v1/admin/lexicons/com.example.deletable.record')
      .expect(404);
  });

  it('POST /admin/lexicons with missing nsid returns 400', async () => {
    const res = await testApp.agent
      .post('/api/v1/admin/lexicons')
      .send({
        lexiconDoc: { lexicon: 1, id: 'test' },
      })
      .expect(400);

    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('POST /admin/lexicons with missing lexiconDoc returns 400', async () => {
    const res = await testApp.agent
      .post('/api/v1/admin/lexicons')
      .send({
        nsid: 'com.example.nodoc',
      })
      .expect(400);

    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });
});
