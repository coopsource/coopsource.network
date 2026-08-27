/**
 * THROWAWAY PROBE — audit N-1. Delete after capturing output.
 */
import { describe, it, beforeEach } from 'vitest';
import { appendFileSync } from 'node:fs';
import { truncateAllTables, getTestDb } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

const OUT = process.env.PROBE_OUT ?? '/tmp/probe4.txt';
const log = (...args: unknown[]) =>
  appendFileSync(
    OUT,
    args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ') + '\n',
  );

describe('zz coop identity probe', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  it('N-1: GET /cooperative after a second cooperative entity exists', async () => {
    const testApp = createTestApp();
    const { coopDid } = await setupAndLogin(testApp);
    const db = getTestDb();

    log(`N-1 setup coop did: ${coopDid}`);

    const before = await testApp.agent.get('/api/v1/cooperative').expect(200);
    log(`N-1 GET /cooperative (fresh): did=${before.body.did} name=${JSON.stringify(before.body.displayName)}`);

    const net = await testApp.agent
      .post('/api/v1/networks')
      .send({ name: 'Beta Network' });
    log(`N-1 POST /networks: status=${net.status} did=${net.body?.did}`);

    const entities = await db
      .selectFrom('entity')
      .where('type', '=', 'cooperative')
      .select(['did', 'display_name', 'status'])
      .execute();
    log('N-1 cooperative entities now:', entities);

    const canonical = await db
      .selectFrom('system_config')
      .where('key', '=', 'cooperative_did')
      .select('value')
      .executeTakeFirst();
    log(`N-1 system_config.cooperative_did = ${JSON.stringify(canonical?.value)}`);

    const after = await testApp.agent.get('/api/v1/cooperative').expect(200);
    log(`N-1 GET /cooperative (after network): did=${after.body.did} name=${JSON.stringify(after.body.displayName)}`);

    const put = await testApp.agent
      .put('/api/v1/cooperative')
      .send({ displayName: 'Alpha Coop', website: 'https://alpha.example' });
    log(`N-1 PUT /cooperative: status=${put.status} echoed did=${put.body?.did} name=${JSON.stringify(put.body?.displayName)} website=${JSON.stringify(put.body?.website)}`);

    const rows = await db
      .selectFrom('entity')
      .innerJoin('cooperative_profile', 'cooperative_profile.entity_did', 'entity.did')
      .where('entity.type', '=', 'cooperative')
      .select(['entity.did', 'entity.display_name', 'cooperative_profile.website'])
      .execute();
    log('N-1 where the write landed:', rows);

    const final = await testApp.agent.get('/api/v1/cooperative').expect(200);
    log(`N-1 GET /cooperative (after PUT): did=${final.body.did} name=${JSON.stringify(final.body.displayName)}`);

    // Repeat the unordered read a few times to show it is not stable.
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await testApp.agent.get('/api/v1/cooperative').expect(200);
      seen.push(r.body.did);
    }
    log('N-1 five consecutive reads:', seen);
  });
});
