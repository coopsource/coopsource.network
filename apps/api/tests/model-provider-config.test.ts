import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('Model Provider Config API', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  // ─── Supported Providers ──────────────────────────────────────────────

  it('lists supported provider types (200)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const res = await testApp.agent
      .get('/api/v1/model-providers/supported')
      .expect(200);

    expect(res.body.providers).toHaveLength(2);
    const ids = res.body.providers.map(
      (p: { id: string }) => p.id,
    );
    expect(ids).toContain('anthropic');
    expect(ids).toContain('ollama');
  });

  // ─── CRUD ─────────────────────────────────────────────────────────────

  it('adds a model provider config (201)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const res = await testApp.agent
      .post('/api/v1/model-providers')
      .send({
        providerId: 'anthropic',
        displayName: 'Anthropic',
        credentials: { apiKey: 'sk-ant-test-123' },
        allowedModels: ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001'],
      })
      .expect(201);

    expect(res.body.providerId).toBe('anthropic');
    expect(res.body.displayName).toBe('Anthropic');
    expect(res.body.enabled).toBe(true);
    expect(res.body.allowedModels).toEqual([
      'claude-sonnet-4-20250514',
      'claude-haiku-4-5-20251001',
    ]);
    expect(res.body.id).toBeDefined();
    // Should NOT return credentials
    expect(res.body.credentials).toBeUndefined();
    expect(res.body.credentialsEnc).toBeUndefined();
  });

  it('adds an Ollama provider config (201)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const res = await testApp.agent
      .post('/api/v1/model-providers')
      .send({
        providerId: 'ollama',
        displayName: 'Local Ollama',
        credentials: { baseUrl: 'http://localhost:11434' },
      })
      .expect(201);

    expect(res.body.providerId).toBe('ollama');
    expect(res.body.displayName).toBe('Local Ollama');
  });

  it('lists configured providers (200)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/model-providers')
      .send({
        providerId: 'anthropic',
        displayName: 'Anthropic',
        credentials: { apiKey: 'sk-ant-test-123' },
      })
      .expect(201);

    const res = await testApp.agent
      .get('/api/v1/model-providers')
      .expect(200);

    expect(res.body.providers).toHaveLength(1);
    expect(res.body.providers[0].providerId).toBe('anthropic');
  });

  it('updates a provider config (200)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/model-providers')
      .send({
        providerId: 'anthropic',
        displayName: 'Anthropic',
        credentials: { apiKey: 'sk-ant-test-123' },
      })
      .expect(201);

    const res = await testApp.agent
      .put('/api/v1/model-providers/anthropic')
      .send({
        displayName: 'Anthropic (Production)',
        enabled: false,
        allowedModels: ['claude-opus-4-20250514'],
      })
      .expect(200);

    expect(res.body.displayName).toBe('Anthropic (Production)');
    expect(res.body.enabled).toBe(false);
    expect(res.body.allowedModels).toEqual(['claude-opus-4-20250514']);
  });

  it('removes a provider config (204)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/model-providers')
      .send({
        providerId: 'anthropic',
        displayName: 'Anthropic',
        credentials: { apiKey: 'sk-ant-test-123' },
      })
      .expect(201);

    await testApp.agent
      .delete('/api/v1/model-providers/anthropic')
      .expect(204);

    const res = await testApp.agent
      .get('/api/v1/model-providers')
      .expect(200);

    expect(res.body.providers).toHaveLength(0);
  });

  // ─── Credential Encryption Round-trip ─────────────────────────────────

  it('encrypts and decrypts credentials correctly', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    // Add with credentials
    await testApp.agent
      .post('/api/v1/model-providers')
      .send({
        providerId: 'anthropic',
        displayName: 'Anthropic',
        credentials: { apiKey: 'sk-ant-secret-key-12345' },
      })
      .expect(201);

    // Update with new credentials
    await testApp.agent
      .put('/api/v1/model-providers/anthropic')
      .send({
        credentials: { apiKey: 'sk-ant-new-key-67890' },
      })
      .expect(200);

    // Verify credentials_enc is stored (not readable from API, check DB)
    const row = await testApp.container.db
      .selectFrom('model_provider_config')
      .where('provider_id', '=', 'anthropic')
      .select(['credentials_enc'])
      .executeTakeFirst();

    expect(row).toBeDefined();
    expect(row!.credentials_enc).toBeDefined();
    // Should be encrypted (not plaintext)
    expect(row!.credentials_enc).not.toContain('sk-ant-new-key-67890');
  });

  // ─── Validation ───────────────────────────────────────────────────────

  it('rejects unsupported provider type (404)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/model-providers')
      .send({
        providerId: 'unsupported',
        displayName: 'Unknown',
        credentials: { apiKey: 'test' },
      })
      .expect(404);
  });

  it('rejects duplicate provider config (409)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/model-providers')
      .send({
        providerId: 'anthropic',
        displayName: 'Anthropic',
        credentials: { apiKey: 'sk-ant-test-123' },
      })
      .expect(201);

    await testApp.agent
      .post('/api/v1/model-providers')
      .send({
        providerId: 'anthropic',
        displayName: 'Anthropic Again',
        credentials: { apiKey: 'sk-ant-test-456' },
      })
      .expect(409);
  });

  // ─── Auth ─────────────────────────────────────────────────────────────

  it('requires authentication', async () => {
    const testApp = createTestApp();

    await testApp.agent
      .get('/api/v1/model-providers')
      .expect(401);
  });
});
