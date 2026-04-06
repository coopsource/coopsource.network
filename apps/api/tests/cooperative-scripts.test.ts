import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin, type TestApp } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('Cooperative scripts (P8)', () => {
  let testApp: TestApp;
  let coopDid: string;

  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
    testApp = createTestApp();
    const result = await setupAndLogin(testApp);
    coopDid = result.coopDid;
  });

  it('POST /cooperatives/:did/scripts creates a script with compiled_js (201)', async () => {
    const res = await testApp.agent
      .post(`/api/v1/cooperatives/${coopDid}/scripts`)
      .send({
        name: 'Test Hook',
        description: 'A test post-storage hook',
        sourceCode: 'export default async function handler(ctx: any) { console.log("hello"); }',
        phase: 'post-storage',
        collections: ['network.coopsource.governance.proposal'],
      })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe('Test Hook');
    expect(res.body.sourceCode).toContain('handler');
    expect(res.body.compiledJs).toBeDefined();
    expect(res.body.compiledJs.length).toBeGreaterThan(0);
    expect(res.body.phase).toBe('post-storage');
    expect(res.body.enabled).toBe(false);
  });

  it('GET /cooperatives/:did/scripts lists scripts', async () => {
    // Create a script
    await testApp.agent
      .post(`/api/v1/cooperatives/${coopDid}/scripts`)
      .send({
        name: 'Listable Script',
        sourceCode: 'export default async function() {}',
        phase: 'post-storage',
      })
      .expect(201);

    const res = await testApp.agent
      .get(`/api/v1/cooperatives/${coopDid}/scripts`)
      .expect(200);

    expect(res.body.items).toBeDefined();
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    expect(res.body.items[0].name).toBe('Listable Script');
  });

  it('GET /cooperatives/:did/scripts/:id returns script with source and compiled_js', async () => {
    const createRes = await testApp.agent
      .post(`/api/v1/cooperatives/${coopDid}/scripts`)
      .send({
        name: 'Get Script',
        sourceCode: 'const x: number = 42; export default async function() { return x; }',
        phase: 'post-storage',
      })
      .expect(201);

    const scriptId = createRes.body.id;

    const res = await testApp.agent
      .get(`/api/v1/cooperatives/${coopDid}/scripts/${scriptId}`)
      .expect(200);

    expect(res.body.id).toBe(scriptId);
    expect(res.body.name).toBe('Get Script');
    expect(res.body.sourceCode).toContain('const x');
    expect(res.body.compiledJs).toBeDefined();
    // esbuild strips types: compiled JS should not have `: number`
    expect(res.body.compiledJs).not.toContain(': number');
  });

  it('PUT /cooperatives/:did/scripts/:id updates and re-compiles', async () => {
    const createRes = await testApp.agent
      .post(`/api/v1/cooperatives/${coopDid}/scripts`)
      .send({
        name: 'Update Script',
        sourceCode: 'export default async function() { return 1; }',
        phase: 'post-storage',
      })
      .expect(201);

    const scriptId = createRes.body.id;
    const originalCompiledJs = createRes.body.compiledJs;

    const res = await testApp.agent
      .put(`/api/v1/cooperatives/${coopDid}/scripts/${scriptId}`)
      .send({
        name: 'Updated Script',
        sourceCode: 'export default async function() { return 2; }',
      })
      .expect(200);

    expect(res.body.name).toBe('Updated Script');
    expect(res.body.sourceCode).toContain('return 2');
    expect(res.body.compiledJs).toBeDefined();
    // Compiled JS should be different from the original
    expect(res.body.compiledJs).not.toBe(originalCompiledJs);
  });

  it('DELETE /cooperatives/:did/scripts/:id removes the script', async () => {
    const createRes = await testApp.agent
      .post(`/api/v1/cooperatives/${coopDid}/scripts`)
      .send({
        name: 'Delete Script',
        sourceCode: 'export default async function() {}',
        phase: 'post-storage',
      })
      .expect(201);

    const scriptId = createRes.body.id;

    // Delete
    await testApp.agent
      .delete(`/api/v1/cooperatives/${coopDid}/scripts/${scriptId}`)
      .expect(200);

    // Should be gone
    await testApp.agent
      .get(`/api/v1/cooperatives/${coopDid}/scripts/${scriptId}`)
      .expect(404);

    // Listing should not include it
    const listRes = await testApp.agent
      .get(`/api/v1/cooperatives/${coopDid}/scripts`)
      .expect(200);
    const found = listRes.body.items.find(
      (s: { id: string }) => s.id === scriptId,
    );
    expect(found).toBeUndefined();
  });

  it('creates script with invalid TypeScript (esbuild strips types, still transpiles)', async () => {
    // esbuild transpiles TS to JS without type-checking, so type errors
    // are silently ignored and the script still compiles
    const res = await testApp.agent
      .post(`/api/v1/cooperatives/${coopDid}/scripts`)
      .send({
        name: 'Bad Types Script',
        sourceCode: `
          const x: string = 42 as unknown as string;
          export default async function() { return x; }
        `,
        phase: 'post-storage',
      })
      .expect(201);

    expect(res.body.compiledJs).toBeDefined();
    expect(res.body.compiledJs.length).toBeGreaterThan(0);
  });

  it('POST with missing required fields returns 400', async () => {
    // Missing sourceCode
    await testApp.agent
      .post(`/api/v1/cooperatives/${coopDid}/scripts`)
      .send({
        name: 'Missing Code',
        phase: 'post-storage',
      })
      .expect(400);

    // Missing name
    await testApp.agent
      .post(`/api/v1/cooperatives/${coopDid}/scripts`)
      .send({
        sourceCode: 'export default async function() {}',
        phase: 'post-storage',
      })
      .expect(400);

    // Missing phase
    await testApp.agent
      .post(`/api/v1/cooperatives/${coopDid}/scripts`)
      .send({
        name: 'Missing Phase',
        sourceCode: 'export default async function() {}',
      })
      .expect(400);
  });

  it('POST with invalid phase returns 400', async () => {
    await testApp.agent
      .post(`/api/v1/cooperatives/${coopDid}/scripts`)
      .send({
        name: 'Bad Phase',
        sourceCode: 'export default async function() {}',
        phase: 'invalid-phase',
      })
      .expect(400);
  });
});
