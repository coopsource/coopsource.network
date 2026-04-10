import { describe, it, expect, beforeAll } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin, type TestApp } from './helpers/test-app.js';

describe('/.well-known/did.json', () => {
  it('returns 404 when no cooperative has been set up', async () => {
    await truncateAllTables();
    const freshApp = createTestApp();
    const res = await freshApp.agent.get('/.well-known/did.json');
    expect(res.status).toBe(404);
  });

  it('returns a valid DID document after setup', async () => {
    await truncateAllTables();
    const testApp: TestApp = createTestApp();
    const { coopDid } = await setupAndLogin(testApp);

    const res = await testApp.agent.get('/.well-known/did.json');
    expect(res.status).toBe(200);

    // Verify DID document structure
    expect(res.body.id).toBe(coopDid);
    expect(res.body['@context']).toContain('https://www.w3.org/ns/did/v1');
    expect(res.body.service).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: '#coopsource',
          type: 'CoopSourcePds',
          serviceEndpoint: 'http://localhost:3001',
        }),
      ]),
    );

    // LocalPdsService creates an entity_key during setup
    expect(res.body.verificationMethod).toBeDefined();
    expect(res.body.verificationMethod.length).toBeGreaterThanOrEqual(1);
  });
});
