import type { Kysely, Selectable, Transaction } from 'kysely';
import type { Database, PrivateRecordTable } from '@coopsource/db';
import { MEMBERS_SPACE_KEY, MEMBERS_SPACE_TYPE } from '@coopsource/arbiter-client';
import { parseSpaceRecordUri } from '@coopsource/spaces-consumer';
import {
  formatPrivatePermissionedRecordRkey,
  parsePrivatePermissionedRecordRkey,
} from './private-record-permissioned-write-port.js';

const PROPOSAL_COLLECTION = 'network.coopsource.governance.proposal';
const VOTE_COLLECTION = 'network.coopsource.governance.vote';
const GOVERNANCE_COLLECTIONS = [PROPOSAL_COLLECTION, VOTE_COLLECTION] as const;

type ProjectionKind = 'proposal' | 'vote';
type PrivateRecordRow = Selectable<PrivateRecordTable>;

interface ProjectionSource {
  readonly kind: ProjectionKind;
  readonly projectionId: string;
  readonly uri: string | null;
  readonly cid: string | null;
  readonly cooperativeDid: string;
  readonly authorDid: string;
  readonly collection: (typeof GOVERNANCE_COLLECTIONS)[number];
  readonly expectedRecord: Readonly<Record<string, unknown>>;
}

export type GovernanceTier2MigrationIssueCode =
  | 'invalid-private-source'
  | 'missing-private-source'
  | 'orphan-private-source'
  | 'projection-location-mismatch';

export interface GovernanceTier2MigrationCandidate {
  readonly kind: ProjectionKind;
  readonly projectionId: string;
  readonly uri: string;
  readonly currentCid: string | null;
  readonly sourceKey: string;
  readonly sourceUpdatedAt: string;
  readonly location: {
    readonly spaceDid: string;
    readonly spaceType: string;
    readonly spaceKey: string;
    readonly authorDid: string;
    readonly collection: string;
    readonly rkey: string;
  };
}

export interface GovernanceTier2MigrationIssue {
  readonly code: GovernanceTier2MigrationIssueCode;
  readonly sourceKey?: string;
  readonly kind?: ProjectionKind;
  readonly projectionId?: string;
  readonly uri?: string;
  readonly details: ReadonlyArray<string>;
}

export interface GovernanceTier2MigrationReadinessReport {
  readonly generatedAt: string;
  readonly cooperativeDid?: string;
  readonly readyForCopy: boolean;
  readonly summary: {
    readonly activeProjectionCount: number;
    readonly publicProjectionCount: number;
    readonly permissionedProjectionCount: number;
    readonly privateSourceCount: number;
    readonly readyCount: number;
    readonly blockerCount: number;
    readonly missingSourceCount: number;
    readonly invalidProjectionCount: number;
    readonly invalidSourceCount: number;
    readonly orphanSourceCount: number;
  };
  readonly candidates: ReadonlyArray<GovernanceTier2MigrationCandidate>;
  readonly issues: ReadonlyArray<GovernanceTier2MigrationIssue>;
}

export class GovernanceTier2MigrationReadinessService {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async inspect(cooperativeDid?: string): Promise<GovernanceTier2MigrationReadinessReport> {
    return this.db
      .transaction()
      .setIsolationLevel('repeatable read')
      .execute((trx) => this.inspectSnapshot(trx, cooperativeDid));
  }

  private async inspectSnapshot(
    db: Transaction<Database>,
    cooperativeDid?: string,
  ): Promise<GovernanceTier2MigrationReadinessReport> {
    const projections = await this.loadActiveProjections(db, cooperativeDid);
    const privateSources = await this.loadPrivateSources(db, cooperativeDid);
    const issues: GovernanceTier2MigrationIssue[] = [];
    const candidates: GovernanceTier2MigrationCandidate[] = [];
    const sourceByKey = new Map<string, PrivateRecordRow>();
    const consumedSourceKeys = new Set<string>();

    for (const source of privateSources) {
      const physical = parsePrivatePermissionedRecordRkey(source.rkey);
      if (!physical) {
        issues.push({
          code: 'invalid-private-source',
          sourceKey: privateSourceKey(source.did, source.collection, source.rkey),
          details: ['physical rkey does not encode an author DID and record key'],
        });
        continue;
      }
      const normalizedSourceKey = privateSourceKey(
        source.did,
        source.collection,
        formatPrivatePermissionedRecordRkey(physical.authorDid, physical.rkey),
      );
      if (sourceByKey.has(normalizedSourceKey)) {
        issues.push({
          code: 'invalid-private-source',
          sourceKey: normalizedSourceKey,
          details: ['multiple private rows normalize to the same source key'],
        });
        continue;
      }
      sourceByKey.set(normalizedSourceKey, source);
    }

    let publicProjectionCount = 0;
    let permissionedProjectionCount = 0;
    for (const projection of projections) {
      if (!projection.uri) {
        issues.push({
          code: 'projection-location-mismatch',
          kind: projection.kind,
          projectionId: projection.projectionId,
          details: ['active projection has no source URI'],
        });
        continue;
      }
      const location = parseSpaceRecordUri(projection.uri);
      if (!location) {
        const publicProblems = validatePublicProjectionLocation(projection);
        if (publicProblems.length > 0) {
          issues.push({
            code: 'projection-location-mismatch',
            kind: projection.kind,
            projectionId: projection.projectionId,
            uri: projection.uri,
            details: publicProblems,
          });
          continue;
        }
        publicProjectionCount += 1;
        continue;
      }
      permissionedProjectionCount += 1;

      const projectionProblems = validateProjectionLocation(projection, location);
      if (projectionProblems.length > 0) {
        issues.push({
          code: 'projection-location-mismatch',
          kind: projection.kind,
          projectionId: projection.projectionId,
          uri: projection.uri,
          details: projectionProblems,
        });
        continue;
      }

      const sourceKey = privateSourceKey(
        location.spaceDid,
        location.collection,
        formatPrivatePermissionedRecordRkey(location.authorDid, location.rkey),
      );
      const source = sourceByKey.get(sourceKey);
      if (!source) {
        issues.push({
          code: 'missing-private-source',
          sourceKey,
          kind: projection.kind,
          projectionId: projection.projectionId,
          uri: projection.uri,
          details: ['active permissioned projection has no private source row'],
        });
        continue;
      }
      consumedSourceKeys.add(sourceKey);

      const sourceProblems = validatePrivateSource(source, projection, location);
      if (sourceProblems.length > 0) {
        issues.push({
          code: 'invalid-private-source',
          sourceKey,
          kind: projection.kind,
          projectionId: projection.projectionId,
          uri: projection.uri,
          details: sourceProblems,
        });
        continue;
      }

      candidates.push({
        kind: projection.kind,
        projectionId: projection.projectionId,
        uri: projection.uri,
        currentCid: projection.cid,
        sourceKey,
        sourceUpdatedAt: source.updated_at.toISOString(),
        location: {
          spaceDid: location.spaceDid,
          spaceType: location.spaceType,
          spaceKey: location.skey,
          authorDid: location.authorDid,
          collection: location.collection,
          rkey: location.rkey,
        },
      });
    }

    for (const [sourceKey, source] of sourceByKey) {
      if (consumedSourceKeys.has(sourceKey)) continue;
      issues.push({
        code: 'orphan-private-source',
        sourceKey,
        details: [`private ${source.collection} source has no active permissioned projection`],
      });
    }

    candidates.sort((left, right) => left.uri.localeCompare(right.uri));
    issues.sort((left, right) => issueSortKey(left).localeCompare(issueSortKey(right)));

    const count = (code: GovernanceTier2MigrationIssueCode) =>
      issues.filter((issue) => issue.code === code).length;
    return {
      generatedAt: this.now().toISOString(),
      ...(cooperativeDid ? { cooperativeDid } : {}),
      readyForCopy: issues.length === 0,
      summary: {
        activeProjectionCount: projections.length,
        publicProjectionCount,
        permissionedProjectionCount,
        privateSourceCount: privateSources.length,
        readyCount: candidates.length,
        blockerCount: issues.length,
        missingSourceCount: count('missing-private-source'),
        invalidProjectionCount: count('projection-location-mismatch'),
        invalidSourceCount: count('invalid-private-source'),
        orphanSourceCount: count('orphan-private-source'),
      },
      candidates,
      issues,
    };
  }

  private async loadActiveProjections(
    db: Transaction<Database>,
    cooperativeDid?: string,
  ): Promise<ReadonlyArray<ProjectionSource>> {
    let proposalQuery = db
      .selectFrom('proposal')
      .where('invalidated_at', 'is', null)
      .select([
        'id',
        'uri',
        'cid',
        'cooperative_did',
        'author_did',
        'title',
        'body',
        'voting_type',
      ]);
    if (cooperativeDid) {
      proposalQuery = proposalQuery.where('cooperative_did', '=', cooperativeDid);
    }

    let voteQuery = db
      .selectFrom('vote as vote')
      .innerJoin('proposal as proposal', 'proposal.id', 'vote.proposal_id')
      .where('vote.retracted_at', 'is', null)
      .where('proposal.invalidated_at', 'is', null)
      .select([
        'vote.id as id',
        'vote.uri as uri',
        'vote.cid as cid',
        'proposal.cooperative_did as cooperative_did',
        'vote.voter_did as author_did',
        'vote.choice as choice',
        'vote.proposal_uri as proposal_uri',
      ]);
    if (cooperativeDid) {
      voteQuery = voteQuery.where('proposal.cooperative_did', '=', cooperativeDid);
    }

    const [proposals, votes] = await Promise.all([proposalQuery.execute(), voteQuery.execute()]);
    return [
      ...proposals.map(
        (row): ProjectionSource => ({
          kind: 'proposal',
          projectionId: row.id,
          uri: row.uri,
          cid: row.cid,
          cooperativeDid: row.cooperative_did,
          authorDid: row.author_did,
          collection: PROPOSAL_COLLECTION,
          expectedRecord: {
            cooperative: row.cooperative_did,
            title: row.title,
            body: row.body,
            votingType: row.voting_type,
          },
        }),
      ),
      ...votes.map(
        (row): ProjectionSource => ({
          kind: 'vote',
          projectionId: row.id,
          uri: row.uri,
          cid: row.cid,
          cooperativeDid: row.cooperative_did,
          authorDid: row.author_did,
          collection: VOTE_COLLECTION,
          expectedRecord: {
            proposal: row.proposal_uri,
            choice: row.choice,
          },
        }),
      ),
    ];
  }

  private async loadPrivateSources(
    db: Transaction<Database>,
    cooperativeDid?: string,
  ): Promise<ReadonlyArray<PrivateRecordRow>> {
    let query = db
      .selectFrom('private_record')
      .where('collection', 'in', [...GOVERNANCE_COLLECTIONS])
      .selectAll();
    if (cooperativeDid) {
      query = query.where('did', '=', cooperativeDid);
    }
    return query.execute();
  }
}

function validateProjectionLocation(
  projection: ProjectionSource,
  location: NonNullable<ReturnType<typeof parseSpaceRecordUri>>,
): string[] {
  const problems: string[] = [];
  if (location.spaceDid !== projection.cooperativeDid) {
    problems.push('space authority does not match projection cooperative');
  }
  if (location.spaceType !== MEMBERS_SPACE_TYPE || location.skey !== MEMBERS_SPACE_KEY) {
    problems.push('location is not the cooperative members space');
  }
  if (location.authorDid !== projection.authorDid) {
    problems.push('location author does not match projection author');
  }
  if (location.collection !== projection.collection) {
    problems.push('location collection does not match projection kind');
  }
  return problems;
}

function validatePublicProjectionLocation(projection: ProjectionSource): string[] {
  const match = /^at:\/\/([^/]+)\/([^/]+)\/([^/?#]+)$/.exec(projection.uri ?? '');
  const [, authorDid, collection] = match ?? [];
  if (!authorDid || !collection) {
    return ['source URI is neither a permissioned record nor a public record'];
  }

  const problems: string[] = [];
  if (authorDid !== projection.authorDid) {
    problems.push('public repository does not match projection author');
  }
  if (collection !== projection.collection) {
    problems.push('public collection does not match projection kind');
  }
  return problems;
}

function validatePrivateSource(
  source: PrivateRecordRow,
  projection: ProjectionSource,
  location: NonNullable<ReturnType<typeof parseSpaceRecordUri>>,
): string[] {
  const problems: string[] = [];
  if (source.created_by !== location.authorDid) {
    problems.push('private source creator does not match location author');
  }
  const record = asRecord(source.record);
  if (!record) return [...problems, 'private source payload is not an object'];
  if (typeof record.$type === 'string' && record.$type !== projection.collection) {
    problems.push('private source $type does not match collection');
  }
  for (const [field, expected] of Object.entries(projection.expectedRecord)) {
    if (record[field] !== expected) {
      problems.push(`private source ${field} does not match projection`);
    }
  }
  if (!validDate(record.createdAt)) {
    problems.push('private source createdAt is missing or invalid');
  }
  return problems;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function validDate(value: unknown): boolean {
  return typeof value === 'string' && Number.isFinite(new Date(value).getTime());
}

function privateSourceKey(did: string, collection: string, physicalRkey: string): string {
  return JSON.stringify([did, collection, physicalRkey]);
}

function issueSortKey(issue: GovernanceTier2MigrationIssue): string {
  return [issue.code, issue.uri ?? '', issue.sourceKey ?? '', issue.projectionId ?? ''].join('|');
}
