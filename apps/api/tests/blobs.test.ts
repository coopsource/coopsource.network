import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';
import type { TestApp } from './helpers/test-app.js';

describe('Blobs', () => {
  let testApp: TestApp;

  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
    testApp = createTestApp();
    await setupAndLogin(testApp);
  });

  it('requires authentication (401)', async () => {
    const unauthApp = createTestApp();
    await unauthApp.agent
      .get('/api/v1/blobs/fakecid')
      .expect(401);
  });

  it('returns 404 for non-existent CID', async () => {
    const res = await testApp.agent
      .get('/api/v1/blobs/bafyblobnonexistent')
      .expect(404);

    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns blob data with correct headers', async () => {
    // Upload a blob through the store directly
    const data = Buffer.from('Hello, blob!');
    const ref = await testApp.container.blobStore.upload(data, 'text/plain');
    const cid = ref.ref.$link;

    const res = await testApp.agent
      .get(`/api/v1/blobs/${cid}`)
      .expect(200);

    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(res.text).toBe('Hello, blob!');
  });
});
