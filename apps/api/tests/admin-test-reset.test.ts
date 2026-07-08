import { describe, expect, it, beforeEach } from 'vitest';
import { sql } from 'kysely';
import { createTestApp } from './helpers/test-app.js';
import { getTestDb, truncateAllTables } from './helpers/test-db.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('Admin test reset', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  it('truncates spaces substrate tables', async () => {
    const db = getTestDb();
    await db
      .insertInto('did_rotation_history')
      .values({
        prior_did: 'did:plc:space-prior',
        current_did: 'did:plc:space-current',
        rotated_at: new Date('2026-07-07T12:00:00Z'),
        evidence_uri: null,
      })
      .execute();
    await db
      .insertInto('spaces_consumer_cursor')
      .values({
        arbiter_did: 'did:plc:space-authority',
        space_key: 'members',
        expected_space_type: 'network.coopsource.org.spaceType.members',
        member_did: '__permissioned_space__',
        cursor: 'cursor-1',
        updated_at: new Date('2026-07-07T12:00:00Z'),
      })
      .execute();
    await db
      .insertInto('space_credential')
      .values({
        space_ref_key:
          'did:plc:space-authority|members|network.coopsource.org.spaceType.members',
        arbiter_did: 'did:plc:space-authority',
        space_key: 'members',
        expected_space_type: 'network.coopsource.org.spaceType.members',
        token: 'credential-token',
        expires_at: new Date('2026-07-07T13:00:00Z'),
        updated_at: new Date('2026-07-07T12:00:00Z'),
      })
      .execute();

    await createTestApp().agent.post('/api/v1/admin/test-reset').expect(200);

    await expect(countRows('did_rotation_history')).resolves.toBe(0);
    await expect(countRows('spaces_consumer_cursor')).resolves.toBe(0);
    await expect(countRows('space_credential')).resolves.toBe(0);
  });
});

async function countRows(tableName: string): Promise<number> {
  const result = await sql<{ count: string }>`
    SELECT COUNT(*)::text AS count FROM ${sql.table(tableName)}
  `.execute(getTestDb());
  return Number(result.rows[0]!.count);
}
