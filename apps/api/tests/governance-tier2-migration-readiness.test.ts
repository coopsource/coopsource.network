import { beforeEach, describe, expect, it } from 'vitest';
import {
  formatPrivatePermissionedRecordRkey,
  parsePrivatePermissionedRecordRkey,
} from '../src/services/private-record-permissioned-write-port.js';
import { GovernanceTier2MigrationReadinessService } from '../src/services/governance-tier2-migration-readiness.js';
import { resetSetupCache } from '../src/auth/middleware.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { truncateAllTables } from './helpers/test-db.js';

describe('GovernanceTier2MigrationReadinessService', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  it('reports closed proposal and vote sources without exposing payloads', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);
    await testApp.agent
      .put('/api/v1/cooperative')
      .send({ governanceVisibility: 'closed' })
      .expect(200);
    const proposal = await createProposal(testApp, 'private migration secret');
    await testApp.agent.post(`/api/v1/proposals/${proposal.id}/open`).expect(200);
    await testApp.agent
      .post(`/api/v1/proposals/${proposal.id}/vote`)
      .send({ choice: 'yes', rationale: 'private rationale secret' })
      .expect(201);

    const report = await new GovernanceTier2MigrationReadinessService(
      testApp.container.db,
      () => new Date('2026-07-30T12:00:00.000Z'),
    ).inspect();

    expect(report.readyForCopy).toBe(true);
    expect(report.summary).toMatchObject({
      activeProjectionCount: 2,
      publicProjectionCount: 0,
      permissionedProjectionCount: 2,
      privateSourceCount: 2,
      readyCount: 2,
      blockerCount: 0,
    });
    expect(report.candidates.map((candidate) => candidate.kind).sort()).toEqual([
      'proposal',
      'vote',
    ]);
    expect(JSON.stringify(report)).not.toContain('private migration secret');
    expect(JSON.stringify(report)).not.toContain('private rationale secret');
  });

  it('blocks on missing, invalid, and orphaned private sources', async () => {
    const testApp = createTestApp();
    const { coopDid, adminDid } = await setupAndLogin(testApp);
    await testApp.agent
      .put('/api/v1/cooperative')
      .send({ governanceVisibility: 'closed' })
      .expect(200);
    const missing = await createProposal(testApp, 'missing source');
    const invalid = await createProposal(testApp, 'invalid source');

    const privateRows = await testApp.container.db
      .selectFrom('private_record')
      .select(['rkey', 'record'])
      .execute();
    const missingRow = privateRows.find((row) => String(row.record.title).includes('missing'));
    const invalidRow = privateRows.find((row) => String(row.record.title).includes('invalid'));
    expect(missingRow).toBeDefined();
    expect(invalidRow).toBeDefined();

    await testApp.container.db
      .deleteFrom('private_record')
      .where('rkey', '=', missingRow!.rkey)
      .execute();
    await testApp.container.db
      .updateTable('private_record')
      .set({ created_by: 'did:plc:someone-else' })
      .where('rkey', '=', invalidRow!.rkey)
      .execute();
    await testApp.container.db
      .insertInto('private_record')
      .values({
        did: coopDid,
        collection: 'network.coopsource.governance.proposal',
        rkey: formatPrivatePermissionedRecordRkey(adminDid, 'orphan'),
        record: {
          cooperative: coopDid,
          title: 'orphan',
          body: 'orphan',
          votingType: 'binary',
          createdAt: '2026-07-30T12:00:00.000Z',
        },
        created_by: adminDid,
        created_at: new Date('2026-07-30T12:00:00.000Z'),
        updated_at: new Date('2026-07-30T12:00:00.000Z'),
      })
      .execute();

    const report = await new GovernanceTier2MigrationReadinessService(testApp.container.db).inspect(
      coopDid,
    );

    expect(report.readyForCopy).toBe(false);
    expect(report.summary).toMatchObject({
      activeProjectionCount: 2,
      permissionedProjectionCount: 2,
      privateSourceCount: 2,
      readyCount: 0,
      blockerCount: 3,
      missingSourceCount: 1,
      invalidSourceCount: 1,
      orphanSourceCount: 1,
    });
    expect(report.issues.map((issue) => issue.code).sort()).toEqual([
      'invalid-private-source',
      'missing-private-source',
      'orphan-private-source',
    ]);
    expect(report.issues.find((issue) => issue.projectionId === missing.id)?.code).toBe(
      'missing-private-source',
    );
    expect(report.issues.find((issue) => issue.projectionId === invalid.id)?.code).toBe(
      'invalid-private-source',
    );
  });

  it('round-trips physical private permissioned record keys', () => {
    const formatted = formatPrivatePermissionedRecordRkey('did:plc:alice', 'record/with/slash');
    expect(parsePrivatePermissionedRecordRkey(formatted)).toEqual({
      authorDid: 'did:plc:alice',
      rkey: 'record/with/slash',
    });
    expect(parsePrivatePermissionedRecordRkey('not-a-physical-key')).toBeNull();
    expect(parsePrivatePermissionedRecordRkey('%/record')).toBeNull();
  });

  it('blocks an active projection with no source URI', async () => {
    const testApp = createTestApp();
    const { coopDid } = await setupAndLogin(testApp);
    await testApp.agent
      .put('/api/v1/cooperative')
      .send({ governanceVisibility: 'closed' })
      .expect(200);
    const proposal = await createProposal(testApp, 'missing URI');
    await testApp.container.db
      .updateTable('proposal')
      .set({ uri: null })
      .where('id', '=', proposal.id)
      .execute();

    const report = await new GovernanceTier2MigrationReadinessService(testApp.container.db).inspect(
      coopDid,
    );

    expect(report.readyForCopy).toBe(false);
    expect(report.summary).toMatchObject({
      activeProjectionCount: 1,
      permissionedProjectionCount: 0,
      invalidProjectionCount: 1,
      orphanSourceCount: 1,
      blockerCount: 2,
    });
    expect(
      report.issues.find((issue) => issue.code === 'projection-location-mismatch')?.details,
    ).toContain('active projection has no source URI');
  });

  it('counts public governance projections without treating them as candidates', async () => {
    const testApp = createTestApp();
    const { coopDid } = await setupAndLogin(testApp);
    await createProposal(testApp, 'public proposal');

    const report = await new GovernanceTier2MigrationReadinessService(testApp.container.db).inspect(
      coopDid,
    );

    expect(report.readyForCopy).toBe(true);
    expect(report.summary).toMatchObject({
      activeProjectionCount: 1,
      publicProjectionCount: 1,
      permissionedProjectionCount: 0,
      privateSourceCount: 0,
      readyCount: 0,
      blockerCount: 0,
    });
    expect(report.candidates).toEqual([]);
  });

  it('blocks malformed space locations instead of counting them as public', async () => {
    const testApp = createTestApp();
    const { coopDid } = await setupAndLogin(testApp);
    const proposal = await createProposal(testApp, 'malformed location');
    await testApp.container.db
      .updateTable('proposal')
      .set({ uri: `at://${coopDid}/space/incomplete/extra` })
      .where('id', '=', proposal.id)
      .execute();

    const report = await new GovernanceTier2MigrationReadinessService(testApp.container.db).inspect(
      coopDid,
    );

    expect(report.readyForCopy).toBe(false);
    expect(report.summary).toMatchObject({
      activeProjectionCount: 1,
      publicProjectionCount: 0,
      permissionedProjectionCount: 0,
      invalidProjectionCount: 1,
      blockerCount: 1,
    });
    expect(report.issues[0]?.details).toContain(
      'source URI is neither a permissioned record nor a public record',
    );
  });
});

async function createProposal(
  testApp: ReturnType<typeof createTestApp>,
  title: string,
): Promise<{ readonly id: string }> {
  const response = await testApp.agent
    .post('/api/v1/proposals')
    .send({
      title,
      body: `${title} body`,
      votingType: 'binary',
      quorumType: 'simpleMajority',
    })
    .expect(201);
  return response.body as { id: string };
}
