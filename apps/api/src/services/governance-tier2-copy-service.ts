import { createHash } from 'node:crypto';
import type { CID, DID } from '@coopsource/common';
import type {
  Database,
  PrivateRecordTable,
  Tier2GovernanceMigrationTable,
} from '@coopsource/db';
import {
  formatPermissionedRecordLocationUri,
  parseSpaceRecordUri,
  PermissionedRecordWriteError,
  spaceRefKey,
  type PermissionedRecordUpdateRequest,
  type PermissionedRecordWritePort,
  type PermissionedRecordWriteResult,
} from '@coopsource/spaces-consumer';
import type { Kysely, Selectable, Transaction } from 'kysely';
import {
  GovernanceTier2MigrationReadinessService,
  type GovernanceTier2MigrationCandidate,
} from './governance-tier2-migration-readiness.js';
import { formatPrivatePermissionedRecordRkey } from './private-record-permissioned-write-port.js';

type DatabaseExecutor = Kysely<Database> | Transaction<Database>;
type LedgerRow = Selectable<Tier2GovernanceMigrationTable>;
type PrivateRecordRow = Selectable<PrivateRecordTable>;

export type GovernanceTier2CopyOperation = 'copy' | 'verify';
export type GovernanceTier2CopyOutcome =
  | 'already_copied'
  | 'already_verified'
  | 'awaiting_replica'
  | 'blocked'
  | 'copied'
  | 'verified';

export interface GovernanceTier2CopyResult {
  readonly kind: 'proposal' | 'vote';
  readonly projectionId: string;
  readonly uri: string;
  readonly outcome: GovernanceTier2CopyOutcome;
  readonly errorCode?: string;
}

export interface GovernanceTier2CopyReport {
  readonly operation: GovernanceTier2CopyOperation;
  readonly cooperativeDid: string;
  readonly generatedAt: string;
  readonly complete: boolean;
  readonly candidateCount: number;
  readonly results: ReadonlyArray<GovernanceTier2CopyResult>;
}

export interface GovernanceTier2CopyTarget {
  putRecord(
    args: PermissionedRecordUpdateRequest,
  ): Promise<PermissionedRecordWriteResult>;
}

/**
 * Makes deterministic migration copies idempotent over the ordinary write
 * port: create first, then use put when a prior or ambiguous attempt already
 * created the target.
 */
export class PermissionedRecordGovernanceTier2CopyTarget implements GovernanceTier2CopyTarget {
  constructor(private readonly writer: PermissionedRecordWritePort) {}

  async putRecord(
    args: PermissionedRecordUpdateRequest,
  ): Promise<PermissionedRecordWriteResult> {
    try {
      return await this.writer.createRecord(args);
    } catch (error) {
      if (
        !(error instanceof PermissionedRecordWriteError) ||
        error.kind !== 'conflict'
      ) {
        throw error;
      }
      return this.writer.updateRecord(args);
    }
  }
}

export class GovernanceTier2CopyService {
  private readonly readiness: GovernanceTier2MigrationReadinessService;

  constructor(
    private readonly db: Kysely<Database>,
    private readonly target: GovernanceTier2CopyTarget | undefined,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.readiness = new GovernanceTier2MigrationReadinessService(db, now);
  }

  async copy(cooperativeDid: string): Promise<GovernanceTier2CopyReport> {
    if (!this.target) {
      throw new Error('Tier 2 copy requires an explicit migration target');
    }

    const readiness = await this.readiness.inspect(cooperativeDid);
    if (!readiness.readyForCopy) {
      throw new GovernanceTier2CopyBlockedError(
        'readiness_blocked',
        `Tier 2 readiness has ${readiness.summary.blockerCount} blocker(s)`,
      );
    }

    const results: GovernanceTier2CopyResult[] = [];
    for (const candidate of readiness.candidates) {
      const result = await this.copyCandidate(candidate);
      results.push(result);
      if (result.outcome === 'blocked') break;
    }

    return this.report(
      'copy',
      cooperativeDid,
      readiness.candidates.length,
      results,
      results.length === readiness.candidates.length &&
        results.every((result) =>
          ['copied', 'already_copied', 'already_verified'].includes(
            result.outcome,
          ),
        ),
    );
  }

  async verify(cooperativeDid: string): Promise<GovernanceTier2CopyReport> {
    const rows = await this.db
      .selectFrom('tier2_governance_migration')
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .orderBy('target_uri', 'asc')
      .execute();
    const results: GovernanceTier2CopyResult[] = [];

    for (const row of rows) {
      results.push(await this.verifyLedgerRow(row));
    }

    return this.report(
      'verify',
      cooperativeDid,
      rows.length,
      results,
      results.every((result) =>
        ['verified', 'already_verified'].includes(result.outcome),
      ),
    );
  }

  private async copyCandidate(
    candidate: GovernanceTier2MigrationCandidate,
  ): Promise<GovernanceTier2CopyResult> {
    let prepared: PreparedCopy | AlreadyCopied;
    try {
      prepared = await this.prepareCopy(candidate);
    } catch (error) {
      return this.blocked(candidate, migrationErrorCode(error));
    }

    if (prepared.kind === 'already-copied') {
      return {
        kind: candidate.kind,
        projectionId: candidate.projectionId,
        uri: candidate.uri,
        outcome:
          prepared.status === 'verified'
            ? 'already_verified'
            : 'already_copied',
      };
    }

    try {
      const write = await this.target!.putRecord({
        space: {
          arbiterDid: candidate.location.spaceDid as DID,
          expectedSpaceType: candidate.location.spaceType,
          spaceKey: candidate.location.spaceKey,
        },
        authorDid: candidate.location.authorDid as DID,
        collection: candidate.location.collection,
        rkey: candidate.location.rkey,
        record: prepared.targetRecord,
      });
      const returnedUri = formatPermissionedRecordLocationUri(write.location);
      if (returnedUri !== candidate.uri) {
        throw new GovernanceTier2CopyBlockedError(
          'target_location_mismatch',
          'Migration target returned a different record location',
        );
      }

      const stillCurrent = await this.sourceStillCurrent(candidate, prepared);
      if (!stillCurrent) {
        await this.recordPendingResult(
          candidate,
          write.cid,
          write.sourceRevision,
          'source_changed_after_copy',
        );
        return this.blocked(candidate, 'source_changed_after_copy');
      }

      const copiedAt = this.now();
      await this.db
        .updateTable('tier2_governance_migration')
        .set({
          status: 'copied',
          target_cid: write.cid,
          target_revision: write.sourceRevision ?? null,
          last_error_code: null,
          copied_at: copiedAt,
          verified_at: null,
          updated_at: copiedAt,
        })
        .where('projection_kind', '=', candidate.kind)
        .where('projection_id', '=', candidate.projectionId)
        .execute();

      return {
        kind: candidate.kind,
        projectionId: candidate.projectionId,
        uri: candidate.uri,
        outcome: 'copied',
      };
    } catch (error) {
      const errorCode = migrationErrorCode(error);
      await this.recordPendingResult(
        candidate,
        undefined,
        undefined,
        errorCode,
      );
      return this.blocked(candidate, errorCode);
    }
  }

  private async prepareCopy(
    candidate: GovernanceTier2MigrationCandidate,
  ): Promise<PreparedCopy | AlreadyCopied> {
    return this.db
      .transaction()
      .setIsolationLevel('repeatable read')
      .execute(async (trx) => {
        const snapshot = await this.loadSourceSnapshot(trx, candidate);
        const existing = await trx
          .selectFrom('tier2_governance_migration')
          .where('projection_kind', '=', candidate.kind)
          .where('projection_id', '=', candidate.projectionId)
          .selectAll()
          .forUpdate()
          .executeTakeFirst();

        if (existing) {
          assertLedgerIdentity(existing, candidate);
          if (
            (existing.status === 'copied' || existing.status === 'verified') &&
            existing.source_digest === snapshot.sourceDigest &&
            existing.source_updated_at.getTime() ===
              snapshot.source.updated_at.getTime()
          ) {
            if (
              existing.last_error_code &&
              existing.last_error_code !== 'awaiting_replica'
            ) {
              throw new GovernanceTier2CopyBlockedError(
                'ledger_verification_blocked',
                'Existing copy has an unresolved verification blocker',
              );
            }
            return {
              kind: 'already-copied',
              status: existing.status,
            };
          }
        }

        const now = this.now();
        if (existing) {
          await trx
            .updateTable('tier2_governance_migration')
            .set({
              source_updated_at: snapshot.source.updated_at,
              source_digest: snapshot.sourceDigest,
              status: 'copy_pending',
              target_cid: null,
              target_revision: null,
              last_error_code: null,
              copy_attempt_count: existing.copy_attempt_count + 1,
              copied_at: null,
              verified_at: null,
              updated_at: now,
            })
            .where('projection_kind', '=', candidate.kind)
            .where('projection_id', '=', candidate.projectionId)
            .execute();
        } else {
          await trx
            .insertInto('tier2_governance_migration')
            .values({
              projection_kind: candidate.kind,
              projection_id: candidate.projectionId,
              cooperative_did: candidate.location.spaceDid,
              source_did: candidate.location.spaceDid,
              source_collection: candidate.location.collection,
              source_rkey: snapshot.source.rkey,
              source_updated_at: snapshot.source.updated_at,
              source_digest: snapshot.sourceDigest,
              target_uri: candidate.uri,
              target_cid: null,
              target_revision: null,
              status: 'copy_pending',
              last_error_code: null,
              copy_attempt_count: 1,
              copied_at: null,
              verified_at: null,
              created_at: now,
              updated_at: now,
            })
            .execute();
        }

        return {
          kind: 'prepared',
          targetRecord: snapshot.targetRecord,
          sourceDigest: snapshot.sourceDigest,
          sourceUpdatedAt: snapshot.source.updated_at,
        };
      });
  }

  private async loadSourceSnapshot(
    db: DatabaseExecutor,
    candidate: GovernanceTier2MigrationCandidate,
  ): Promise<SourceSnapshot> {
    const currentUri = await activeProjectionUri(db, candidate);
    if (currentUri !== candidate.uri) {
      throw new GovernanceTier2CopyBlockedError(
        'projection_changed',
        'Projection source location changed after readiness inspection',
      );
    }

    const physicalRkey = formatPrivatePermissionedRecordRkey(
      candidate.location.authorDid,
      candidate.location.rkey,
    );
    const source = await db
      .selectFrom('private_record')
      .where('did', '=', candidate.location.spaceDid)
      .where('collection', '=', candidate.location.collection)
      .where('rkey', '=', physicalRkey)
      .selectAll()
      .executeTakeFirst();
    if (!source) {
      throw new GovernanceTier2CopyBlockedError(
        'source_missing',
        'Private migration source disappeared after readiness inspection',
      );
    }
    if (source.updated_at.toISOString() !== candidate.sourceUpdatedAt) {
      throw new GovernanceTier2CopyBlockedError(
        'source_changed',
        'Private migration source changed after readiness inspection',
      );
    }

    const targetRecord = targetRecordForCollection(
      candidate.location.collection,
      source.record,
    );
    return {
      source,
      targetRecord,
      sourceDigest: digestTargetRecord(targetRecord),
    };
  }

  private async sourceStillCurrent(
    candidate: GovernanceTier2MigrationCandidate,
    prepared: PreparedCopy,
  ): Promise<boolean> {
    try {
      const snapshot = await this.db
        .transaction()
        .setIsolationLevel('repeatable read')
        .execute((trx) => this.loadSourceSnapshot(trx, candidate));
      return (
        snapshot.source.updated_at.getTime() ===
          prepared.sourceUpdatedAt.getTime() &&
        snapshot.sourceDigest === prepared.sourceDigest
      );
    } catch {
      return false;
    }
  }

  private async verifyLedgerRow(
    row: LedgerRow,
  ): Promise<GovernanceTier2CopyResult> {
    return this.db
      .transaction()
      .setIsolationLevel('repeatable read')
      .execute(async (trx) => {
        const current = await trx
          .selectFrom('tier2_governance_migration')
          .where('projection_kind', '=', row.projection_kind)
          .where('projection_id', '=', row.projection_id)
          .selectAll()
          .forUpdate()
          .executeTakeFirst();
        if (!current) {
          throw new GovernanceTier2CopyBlockedError(
            'ledger_missing',
            'Migration ledger row disappeared during verification',
          );
        }
        return this.verifyLedgerSnapshot(trx, current);
      });
  }

  private async verifyLedgerSnapshot(
    db: Transaction<Database>,
    row: LedgerRow,
  ): Promise<GovernanceTier2CopyResult> {
    const identity = ledgerResultIdentity(row);
    if (
      (row.status !== 'copied' && row.status !== 'verified') ||
      !row.target_cid
    ) {
      return this.recordVerificationResult(
        db,
        row,
        'blocked',
        'copy_not_acknowledged',
      );
    }

    const source = await this.loadLedgerSource(db, row);
    if (!source) {
      return this.recordVerificationResult(
        db,
        row,
        'blocked',
        'source_missing',
      );
    }
    let sourceDigest: string;
    try {
      sourceDigest = digestTargetRecord(
        targetRecordForCollection(row.source_collection, source.record),
      );
    } catch {
      return this.recordVerificationResult(
        db,
        row,
        'blocked',
        'source_invalid',
      );
    }
    if (
      sourceDigest !== row.source_digest ||
      source.updated_at.getTime() !== row.source_updated_at.getTime()
    ) {
      return this.recordVerificationResult(
        db,
        row,
        'blocked',
        'source_changed',
      );
    }

    const replica = await this.loadReplicaRecord(db, row);
    if (!replica) {
      return this.recordVerificationResult(
        db,
        row,
        'awaiting_replica',
        'awaiting_replica',
      );
    }
    if (replica.cid !== row.target_cid) {
      return this.recordVerificationResult(
        db,
        row,
        'blocked',
        'target_cid_mismatch',
      );
    }

    let replicaDigest: string;
    try {
      replicaDigest = digestTargetRecord(
        targetRecordForCollection(row.source_collection, replica.record),
      );
    } catch {
      return this.recordVerificationResult(
        db,
        row,
        'blocked',
        'target_invalid',
      );
    }
    if (replicaDigest !== row.source_digest) {
      return this.recordVerificationResult(
        db,
        row,
        'blocked',
        'target_payload_mismatch',
      );
    }

    const verifiedAt = this.now();
    await db
      .updateTable('tier2_governance_migration')
      .set({
        status: 'verified',
        last_error_code: null,
        verified_at: verifiedAt,
        updated_at: verifiedAt,
      })
      .where('projection_kind', '=', row.projection_kind)
      .where('projection_id', '=', row.projection_id)
      .execute();
    return {
      ...identity,
      outcome: row.status === 'verified' ? 'already_verified' : 'verified',
    };
  }

  private loadLedgerSource(
    db: DatabaseExecutor,
    row: LedgerRow,
  ): Promise<PrivateRecordRow | undefined> {
    return db
      .selectFrom('private_record')
      .where('did', '=', row.source_did)
      .where('collection', '=', row.source_collection)
      .where('rkey', '=', row.source_rkey)
      .selectAll()
      .executeTakeFirst();
  }

  private async loadReplicaRecord(
    db: DatabaseExecutor,
    row: LedgerRow,
  ): Promise<{ readonly cid: string; readonly record: unknown } | undefined> {
    const location = parseLedgerTarget(row);
    return db
      .selectFrom('permissioned_repo_record')
      .where('space_ref_key', '=', spaceRefKey(location.space))
      .where('repo_did', '=', location.authorDid)
      .where('collection', '=', location.collection)
      .where('rkey', '=', location.rkey)
      .select(['cid', 'record'])
      .executeTakeFirst();
  }

  private async recordVerificationResult(
    db: Transaction<Database>,
    row: LedgerRow,
    outcome: 'awaiting_replica' | 'blocked',
    errorCode: string,
  ): Promise<GovernanceTier2CopyResult> {
    await db
      .updateTable('tier2_governance_migration')
      .set({
        ...(row.status === 'verified' ? { status: 'copied' } : {}),
        last_error_code: errorCode,
        updated_at: this.now(),
      })
      .where('projection_kind', '=', row.projection_kind)
      .where('projection_id', '=', row.projection_id)
      .execute();
    return {
      ...ledgerResultIdentity(row),
      outcome,
      errorCode,
    };
  }

  private async recordPendingResult(
    candidate: GovernanceTier2MigrationCandidate,
    targetCid: CID | undefined,
    targetRevision: string | undefined,
    errorCode: string,
  ): Promise<void> {
    const now = this.now();
    await this.db
      .updateTable('tier2_governance_migration')
      .set({
        status: 'copy_pending',
        ...(targetCid ? { target_cid: targetCid } : {}),
        ...(targetRevision ? { target_revision: targetRevision } : {}),
        last_error_code: errorCode,
        updated_at: now,
      })
      .where('projection_kind', '=', candidate.kind)
      .where('projection_id', '=', candidate.projectionId)
      .execute();
  }

  private blocked(
    candidate: GovernanceTier2MigrationCandidate,
    errorCode: string,
  ): GovernanceTier2CopyResult {
    return {
      kind: candidate.kind,
      projectionId: candidate.projectionId,
      uri: candidate.uri,
      outcome: 'blocked',
      errorCode,
    };
  }

  private report(
    operation: GovernanceTier2CopyOperation,
    cooperativeDid: string,
    candidateCount: number,
    results: ReadonlyArray<GovernanceTier2CopyResult>,
    complete: boolean,
  ): GovernanceTier2CopyReport {
    return {
      operation,
      cooperativeDid,
      generatedAt: this.now().toISOString(),
      complete,
      candidateCount,
      results,
    };
  }
}

export class GovernanceTier2CopyBlockedError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GovernanceTier2CopyBlockedError';
  }
}

interface SourceSnapshot {
  readonly source: PrivateRecordRow;
  readonly targetRecord: Readonly<Record<string, unknown>>;
  readonly sourceDigest: string;
}

interface PreparedCopy {
  readonly kind: 'prepared';
  readonly targetRecord: Readonly<Record<string, unknown>>;
  readonly sourceDigest: string;
  readonly sourceUpdatedAt: Date;
}

interface AlreadyCopied {
  readonly kind: 'already-copied';
  readonly status: 'copied' | 'verified';
}

async function activeProjectionUri(
  db: DatabaseExecutor,
  candidate: GovernanceTier2MigrationCandidate,
): Promise<string | null | undefined> {
  if (candidate.kind === 'proposal') {
    const row = await db
      .selectFrom('proposal')
      .where('id', '=', candidate.projectionId)
      .where('invalidated_at', 'is', null)
      .select('uri')
      .executeTakeFirst();
    return row?.uri;
  }

  const row = await db
    .selectFrom('vote as vote')
    .innerJoin('proposal as proposal', 'proposal.id', 'vote.proposal_id')
    .where('vote.id', '=', candidate.projectionId)
    .where('vote.retracted_at', 'is', null)
    .where('proposal.invalidated_at', 'is', null)
    .select('vote.uri as uri')
    .executeTakeFirst();
  return row?.uri;
}

function targetRecordForCollection(
  collection: string,
  value: unknown,
): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new GovernanceTier2CopyBlockedError(
      'source_invalid',
      'Tier 2 source payload is not an object',
    );
  }
  const record = value as Record<string, unknown>;
  if (record.$type !== undefined && record.$type !== collection) {
    throw new GovernanceTier2CopyBlockedError(
      'source_invalid',
      'Tier 2 source payload type does not match its collection',
    );
  }
  return { ...record, $type: collection };
}

function digestTargetRecord(record: Readonly<Record<string, unknown>>): string {
  return createHash('sha256').update(canonicalJson(record)).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new GovernanceTier2CopyBlockedError(
        'source_invalid',
        'Tier 2 source payload contains a non-finite number',
      );
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  throw new GovernanceTier2CopyBlockedError(
    'source_invalid',
    'Tier 2 source payload is not JSON-compatible',
  );
}

function assertLedgerIdentity(
  row: LedgerRow,
  candidate: GovernanceTier2MigrationCandidate,
): void {
  const expectedSourceRkey = formatPrivatePermissionedRecordRkey(
    candidate.location.authorDid,
    candidate.location.rkey,
  );
  if (
    row.cooperative_did !== candidate.location.spaceDid ||
    row.source_did !== candidate.location.spaceDid ||
    row.source_collection !== candidate.location.collection ||
    row.source_rkey !== expectedSourceRkey ||
    row.target_uri !== candidate.uri
  ) {
    throw new GovernanceTier2CopyBlockedError(
      'ledger_identity_mismatch',
      'Existing migration ledger identity does not match readiness candidate',
    );
  }
}

function ledgerResultIdentity(
  row: LedgerRow,
): Pick<GovernanceTier2CopyResult, 'kind' | 'projectionId' | 'uri'> {
  if (row.projection_kind !== 'proposal' && row.projection_kind !== 'vote') {
    throw new GovernanceTier2CopyBlockedError(
      'ledger_invalid',
      'Migration ledger has an invalid projection kind',
    );
  }
  return {
    kind: row.projection_kind,
    projectionId: row.projection_id,
    uri: row.target_uri,
  };
}

function parseLedgerTarget(row: LedgerRow): {
  readonly space: {
    readonly arbiterDid: DID;
    readonly expectedSpaceType: string;
    readonly spaceKey: string;
  };
  readonly authorDid: DID;
  readonly collection: string;
  readonly rkey: string;
} {
  const parsed = parseSpaceRecordUri(row.target_uri);
  if (!parsed) {
    throw new GovernanceTier2CopyBlockedError(
      'ledger_invalid',
      'Migration ledger target is not a permissioned record URI',
    );
  }
  return {
    space: {
      arbiterDid: parsed.spaceDid as DID,
      expectedSpaceType: parsed.spaceType,
      spaceKey: parsed.skey,
    },
    authorDid: parsed.authorDid as DID,
    collection: parsed.collection,
    rkey: parsed.rkey,
  };
}

function migrationErrorCode(error: unknown): string {
  if (error instanceof GovernanceTier2CopyBlockedError) return error.code;
  if (error instanceof PermissionedRecordWriteError) {
    return `target_${error.kind.replaceAll('-', '_')}`;
  }
  return 'unexpected';
}
