import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables, getTestDb } from './helpers/test-db.js';
import { createTestApp, setupAndLogin, type TestApp } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';
import { ScriptWorkerPool } from '../src/scripting/worker-pool.js';

/**
 * Gate 0 containment for audit finding C-02: the in-process `node:vm` script
 * sandbox is escapable, so all cooperative-script routes and runtime execution
 * are disabled until an isolated runner outside the API trust domain exists
 * (amendment AM-1). These tests prove the containment.
 */
describe('Cooperative scripting containment (Gate 0, C-02)', () => {
  let testApp: TestApp;
  let coopDid: string;

  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
    testApp = createTestApp();
    const result = await setupAndLogin(testApp);
    coopDid = result.coopDid;
  });

  const scriptId = '00000000-0000-4000-8000-000000000001';

  const disabledRoutes: Array<{ method: 'get' | 'post' | 'put' | 'delete'; path: () => string }> = [
    { method: 'post', path: () => `/api/v1/cooperatives/${coopDid}/scripts` },
    { method: 'get', path: () => `/api/v1/cooperatives/${coopDid}/scripts` },
    { method: 'get', path: () => `/api/v1/cooperatives/${coopDid}/scripts/${scriptId}` },
    { method: 'put', path: () => `/api/v1/cooperatives/${coopDid}/scripts/${scriptId}` },
    { method: 'delete', path: () => `/api/v1/cooperatives/${coopDid}/scripts/${scriptId}` },
    { method: 'post', path: () => `/api/v1/cooperatives/${coopDid}/scripts/${scriptId}/enable` },
    { method: 'post', path: () => `/api/v1/cooperatives/${coopDid}/scripts/${scriptId}/disable` },
    { method: 'post', path: () => `/api/v1/cooperatives/${coopDid}/scripts/${scriptId}/test` },
    { method: 'get', path: () => `/api/v1/cooperatives/${coopDid}/scripts/${scriptId}/logs` },
  ];

  for (const route of disabledRoutes) {
    it(`${route.method.toUpperCase()} ${route.method === 'post' && route.path().endsWith('/scripts') ? '.../scripts' : route.path().replace(/did:[^/]+/, ':did').replace(scriptId, ':id')} returns 410 even for an authorized admin`, async () => {
      const res = await testApp.agent[route.method](route.path()).send({
        name: 'x',
        sourceCode: 'export default async function () {}',
        phase: 'post-storage',
      });
      expect(res.status).toBe(410);
      expect(res.body.error).toMatch(/disabled/i);
    });
  }

  it('ScriptWorkerPool.execute rejects without spawning a worker', async () => {
    const pool = new ScriptWorkerPool();
    await expect(
      pool.execute({
        scriptId: 'test',
        cooperativeDid: coopDid,
        compiledJs: 'module.exports = async () => 42;',
        timeoutMs: 1000,
        input: {},
      } as never),
    ).rejects.toThrow(/disabled/i);
  });

  it('loadEnabledScripts does not register hooks for enabled scripts', async () => {
    const db = getTestDb();
    await db
      .insertInto('cooperative_script')
      .values({
        cooperative_did: coopDid,
        name: 'Persisted enabled script',
        source_code: 'export default async function () {}',
        compiled_js: 'module.exports = async () => {};',
        phase: 'post-storage',
        enabled: true,
      })
      .execute();

    await testApp.container.scriptService.loadEnabledScripts();

    const scriptHooks = testApp.container.hookRegistry
      .listAll()
      .filter((h) => h.id.startsWith('script:'));
    expect(scriptHooks).toEqual([]);
  });
});
