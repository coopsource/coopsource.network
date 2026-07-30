import type { AtUri, CID } from '@coopsource/common';
import type { Database } from '@coopsource/db';
import type { FirehoseEvent } from '@coopsource/federation';
import {
  formatPermissionedRecordLocationUri,
  parseSpaceRecordUri,
  type VerifiedPermissionedRecord,
} from '@coopsource/spaces-consumer';
import type { Kysely } from 'kysely';
import { indexProposal, indexVote } from './indexers/proposal-indexer.js';

const PROPOSAL_COLLECTION = 'network.coopsource.governance.proposal';
const VOTE_COLLECTION = 'network.coopsource.governance.vote';

export async function projectPermissionedGovernanceChange(
  db: Kysely<Database>,
  change: VerifiedPermissionedRecord,
  now: Date,
): Promise<'ignored' | 'projected'> {
  const collection = change.location.collection;
  if (collection !== PROPOSAL_COLLECTION && collection !== VOTE_COLLECTION) {
    return 'ignored';
  }
  if (change.operation !== 'delete') {
    validateGovernanceRecord(change);
  }

  const event: FirehoseEvent = {
    seq: 0,
    did: change.location.authorDid,
    operation: change.operation,
    uri: formatPermissionedRecordLocationUri(change.location) as AtUri,
    cid: change.operation === 'delete' ? ('' as CID) : change.cid,
    ...(change.operation === 'delete'
      ? {}
      : { record: change.record as Record<string, unknown> }),
    time: now.toISOString(),
  };

  if (collection === PROPOSAL_COLLECTION) {
    await indexProposal(db, event);
    return 'projected';
  }
  if (
    !(await indexVote(db, event, {
      expectedCooperativeDid: change.location.space.arbiterDid,
    }))
  ) {
    throw new Error(
      `Permissioned vote ${event.uri} references an unprojected proposal`,
    );
  }
  return 'projected';
}

function validateGovernanceRecord(
  change: Extract<
    VerifiedPermissionedRecord,
    { operation: 'create' | 'update' }
  >,
): void {
  const record = asRecord(change.record);
  if (!record) {
    throw invalidRecord(change, 'record must be an object');
  }
  if (
    typeof record.$type === 'string' &&
    record.$type !== change.location.collection
  ) {
    throw invalidRecord(
      change,
      `$type ${record.$type} does not match its collection`,
    );
  }

  if (change.location.collection === PROPOSAL_COLLECTION) {
    const cooperativeDid = firstString(
      record.cooperative,
      record.cooperativeDid,
    );
    if (
      !cooperativeDid ||
      typeof record.title !== 'string' ||
      typeof record.body !== 'string' ||
      !validDate(record.createdAt)
    ) {
      throw invalidRecord(change, 'missing required proposal fields');
    }
    if (cooperativeDid !== change.location.space.arbiterDid) {
      throw invalidRecord(
        change,
        `declares cooperative ${cooperativeDid}, expected ${change.location.space.arbiterDid}`,
      );
    }
    return;
  }

  const proposalUri = firstString(record.proposal, record.proposalUri);
  if (
    !proposalUri ||
    typeof record.choice !== 'string' ||
    !validDate(record.createdAt)
  ) {
    throw invalidRecord(change, 'missing required vote fields');
  }
  if (
    typeof record.voterDid === 'string' &&
    record.voterDid !== change.location.authorDid
  ) {
    throw invalidRecord(
      change,
      `declares voter ${record.voterDid}, expected ${change.location.authorDid}`,
    );
  }
  const proposalLocation = parseSpaceRecordUri(proposalUri);
  if (
    proposalLocation &&
    (proposalLocation.spaceDid !== change.location.space.arbiterDid ||
      proposalLocation.spaceType !==
        change.location.space.expectedSpaceType ||
      proposalLocation.skey !== change.location.space.spaceKey ||
      proposalLocation.collection !== PROPOSAL_COLLECTION)
  ) {
    throw invalidRecord(
      change,
      'references a proposal outside the containing governance space',
    );
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string');
}

function validDate(value: unknown): boolean {
  return (
    typeof value === 'string' && Number.isFinite(new Date(value).getTime())
  );
}

function invalidRecord(
  change: VerifiedPermissionedRecord,
  reason: string,
): Error {
  return new Error(
    `Permissioned ${change.location.collection} ${formatPermissionedRecordLocationUri(change.location)} ${reason}`,
  );
}
