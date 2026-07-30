import type { DID } from '@coopsource/common';
import {
  InMemoryPermissionedRecordWritePort,
  PermissionedRecordWriteError,
  spaceRefKey,
} from '@coopsource/spaces-consumer';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetSetupCache } from '../src/auth/middleware.js';
import {
  GovernanceTier2CopyBlockedError,
  GovernanceTier2CopyService,
  PermissionedRecordGovernanceTier2CopyTarget,
  type GovernanceTier2CopyTarget,
} from '../src/services/governance-tier2-copy-service.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { truncateAllTables } from './helpers/test-db.js';

describe('GovernanceTier2CopyService', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  it('copies closed governance sources without changing authority or exposing payloads', async () => {
    const fixture = await closedGovernanceFixture('ledger copy secret');
    const writer = new InMemoryPermissionedRecordWritePort();
    const service = copyService(fixture.testApp, writer);

    const report = await service.copy(fixture.coopDid);

    expect(report.complete).toBe(true);
    expect(report.candidateCount).toBe(2);
    expect(report.results.map((result) => result.outcome)).toEqual(['copied', 'copied']);
    expect(JSON.stringify(report)).not.toContain('ledger copy secret');
    expect(writer.writtenRecords()).toHaveLength(2);
    expect(
      writer.writtenRecords().every((write) => write.record.$type === write.location.collection),
    ).toBe(true);

    const ledger = await fixture.testApp.container.db
      .selectFrom('tier2_governance_migration')
      .selectAll()
      .orderBy('target_uri')
      .execute();
    expect(ledger).toHaveLength(2);
    expect(ledger.every((row) => row.status === 'copied')).toBe(true);
    expect(ledger.every((row) => row.source_digest.length === 64)).toBe(true);
    expect(JSON.stringify(ledger)).not.toContain('ledger copy secret');

    const privateSources = await fixture.testApp.container.db
      .selectFrom('private_record')
      .select('rkey')
      .execute();
    expect(privateSources).toHaveLength(2);
    const projections = await fixture.testApp.container.db
      .selectFrom('proposal')
      .leftJoin('vote', 'vote.proposal_id', 'proposal.id')
      .select(['proposal.cid as proposal_cid', 'vote.cid as vote_cid'])
      .executeTakeFirstOrThrow();
    expect(projections).toEqual({
      proposal_cid: 'private',
      vote_cid: 'private',
    });

    const retry = await service.copy(fixture.coopDid);
    expect(retry.complete).toBe(true);
    expect(retry.results.map((result) => result.outcome)).toEqual([
      'already_copied',
      'already_copied',
    ]);
    expect(writer.writtenRecords()).toHaveLength(2);
  });

  it('verifies copies only after the trusted permissioned replica observes them', async () => {
    const fixture = await closedGovernanceFixture('replica verification secret');
    const writer = new InMemoryPermissionedRecordWritePort({
      sourceRevisionFactory: () => 'rev-copy',
    });
    const service = copyService(fixture.testApp, writer);
    await service.copy(fixture.coopDid);

    const awaiting = await service.verify(fixture.coopDid);
    expect(awaiting.complete).toBe(false);
    expect(awaiting.results.every((result) => result.outcome === 'awaiting_replica')).toBe(true);

    await insertReplicaRecords(fixture.testApp, writer);
    const verified = await service.verify(fixture.coopDid);

    expect(verified.complete).toBe(true);
    expect(verified.results.every((result) => result.outcome === 'verified')).toBe(true);
    const statuses = await fixture.testApp.container.db
      .selectFrom('tier2_governance_migration')
      .select('status')
      .execute();
    expect(statuses).toEqual([{ status: 'verified' }, { status: 'verified' }]);
  });

  it('retries an acknowledged copy with create-conflict then put when its source changes', async () => {
    const fixture = await closedGovernanceFixture('before update');
    const writer = new InMemoryPermissionedRecordWritePort();
    const service = copyService(fixture.testApp, writer);
    await service.copy(fixture.coopDid);

    const proposalRow = await fixture.testApp.container.db
      .selectFrom('proposal')
      .where('id', '=', fixture.proposalId)
      .select(['uri', 'title'])
      .executeTakeFirstOrThrow();
    const source = await fixture.testApp.container.db
      .selectFrom('private_record')
      .where('collection', '=', 'network.coopsource.governance.proposal')
      .select(['rkey', 'record'])
      .executeTakeFirstOrThrow();
    const changedAt = new Date('2026-07-30T18:00:00.000Z');
    await fixture.testApp.container.db
      .updateTable('proposal')
      .set({ title: 'after update' })
      .where('id', '=', fixture.proposalId)
      .execute();
    await fixture.testApp.container.db
      .updateTable('private_record')
      .set({
        record: { ...source.record, title: 'after update' },
        updated_at: changedAt,
      })
      .where('rkey', '=', source.rkey)
      .execute();

    const retry = await service.copy(fixture.coopDid);

    expect(retry.complete).toBe(true);
    expect(retry.results.map((result) => result.outcome)).toEqual(['copied', 'already_copied']);
    const copiedProposal = writer
      .writtenRecords()
      .find((write) => write.location.collection.endsWith('.proposal'));
    expect(copiedProposal?.record.title).toBe('after update');
    expect(copiedProposal?.location).toMatchObject({
      rkey: proposalRow.uri?.split('/').at(-1),
    });
    const ledger = await fixture.testApp.container.db
      .selectFrom('tier2_governance_migration')
      .where('projection_kind', '=', 'proposal')
      .select(['copy_attempt_count', 'source_updated_at'])
      .executeTakeFirstOrThrow();
    expect(ledger.copy_attempt_count).toBe(2);
    expect(ledger.source_updated_at).toEqual(changedAt);
  });

  it('keeps a coded pending ledger entry when the target is unavailable', async () => {
    const fixture = await closedGovernanceFixture('unavailable target secret');
    const target: GovernanceTier2CopyTarget = {
      async putRecord() {
        throw new PermissionedRecordWriteError('unavailable', 'target included secret details');
      },
    };
    const service = new GovernanceTier2CopyService(
      fixture.testApp.container.db,
      target,
      fixedClock,
    );

    const report = await service.copy(fixture.coopDid);

    expect(report.complete).toBe(false);
    expect(report.results).toHaveLength(1);
    expect(report.results[0]).toMatchObject({
      outcome: 'blocked',
      errorCode: 'target_unavailable',
    });
    const ledger = await fixture.testApp.container.db
      .selectFrom('tier2_governance_migration')
      .select(['status', 'last_error_code'])
      .executeTakeFirstOrThrow();
    expect(ledger).toEqual({
      status: 'copy_pending',
      last_error_code: 'target_unavailable',
    });
    expect(JSON.stringify({ report, ledger })).not.toContain('secret');
  });

  it('blocks verification when the replica CID differs from the acknowledged copy', async () => {
    const fixture = await closedGovernanceFixture('changed target');
    const writer = new InMemoryPermissionedRecordWritePort();
    const service = copyService(fixture.testApp, writer);
    await service.copy(fixture.coopDid);
    await insertReplicaRecords(fixture.testApp, writer);
    const initialVerification = await service.verify(fixture.coopDid);
    expect(initialVerification.complete).toBe(true);
    const first = writer.writtenRecords()[0]!;
    await fixture.testApp.container.db
      .updateTable('permissioned_repo_record')
      .set({ cid: 'cid-changed-after-copy' })
      .where('space_ref_key', '=', spaceRefKey(first.location.space))
      .where('repo_did', '=', first.location.authorDid)
      .where('collection', '=', first.location.collection)
      .where('rkey', '=', first.location.rkey)
      .execute();

    const report = await service.verify(fixture.coopDid);

    expect(report.complete).toBe(false);
    expect(report.results).toContainEqual(
      expect.objectContaining({
        outcome: 'blocked',
        errorCode: 'target_cid_mismatch',
      }),
    );
    const changed = report.results.find((result) => result.errorCode === 'target_cid_mismatch')!;
    const changedLedger = await fixture.testApp.container.db
      .selectFrom('tier2_governance_migration')
      .where('target_uri', '=', changed.uri)
      .select(['status', 'last_error_code'])
      .executeTakeFirstOrThrow();
    expect(changedLedger).toEqual({
      status: 'copied',
      last_error_code: 'target_cid_mismatch',
    });

    const retry = await service.copy(fixture.coopDid);
    expect(retry.complete).toBe(false);
    expect(retry.results).toContainEqual(
      expect.objectContaining({
        outcome: 'blocked',
        errorCode: 'ledger_verification_blocked',
      }),
    );
    expect(writer.writtenRecords()).toHaveLength(2);
  });

  it('does not create a ledger when readiness is blocked', async () => {
    const fixture = await closedGovernanceFixture('missing source');
    await fixture.testApp.container.db
      .deleteFrom('private_record')
      .where('collection', '=', 'network.coopsource.governance.vote')
      .execute();
    const service = copyService(fixture.testApp, new InMemoryPermissionedRecordWritePort());

    await expect(service.copy(fixture.coopDid)).rejects.toMatchObject<
      Partial<GovernanceTier2CopyBlockedError>
    >({
      code: 'readiness_blocked',
    });
    const ledger = await fixture.testApp.container.db
      .selectFrom('tier2_governance_migration')
      .select('projection_id')
      .execute();
    expect(ledger).toEqual([]);
  });
});

function copyService(
  testApp: ReturnType<typeof createTestApp>,
  writer: InMemoryPermissionedRecordWritePort,
): GovernanceTier2CopyService {
  return new GovernanceTier2CopyService(
    testApp.container.db,
    new PermissionedRecordGovernanceTier2CopyTarget(writer),
    fixedClock,
  );
}

async function closedGovernanceFixture(title: string): Promise<{
  readonly testApp: ReturnType<typeof createTestApp>;
  readonly coopDid: string;
  readonly proposalId: string;
}> {
  const testApp = createTestApp();
  const { coopDid } = await setupAndLogin(testApp);
  await testApp.agent
    .put('/api/v1/cooperative')
    .send({ governanceVisibility: 'closed' })
    .expect(200);
  const proposal = await testApp.agent
    .post('/api/v1/proposals')
    .send({
      title,
      body: `${title} body`,
      votingType: 'binary',
      quorumType: 'simpleMajority',
    })
    .expect(201);
  const proposalId = String(proposal.body.id);
  await testApp.agent.post(`/api/v1/proposals/${proposalId}/open`).expect(200);
  await testApp.agent
    .post(`/api/v1/proposals/${proposalId}/vote`)
    .send({ choice: 'yes', rationale: `${title} rationale` })
    .expect(201);
  return { testApp, coopDid, proposalId };
}

async function insertReplicaRecords(
  testApp: ReturnType<typeof createTestApp>,
  writer: InMemoryPermissionedRecordWritePort,
): Promise<void> {
  const updatedAt = fixedClock();
  await testApp.container.db
    .insertInto('permissioned_repo_record')
    .values(
      writer.writtenRecords().map((write) => ({
        space_ref_key: spaceRefKey(write.location.space),
        repo_did: write.location.authorDid,
        collection: write.location.collection,
        rkey: write.location.rkey,
        cid: write.cid,
        record: write.record,
        source_revision: write.sourceRevision ?? 'rev-observed',
        updated_at: updatedAt,
      })),
    )
    .execute();
}

function fixedClock(): Date {
  return new Date('2026-07-30T17:00:00.000Z');
}
