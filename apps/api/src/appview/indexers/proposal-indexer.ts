import type { DID } from '@coopsource/common';
import type { Database } from '@coopsource/db';
import type { FirehoseEvent } from '@coopsource/federation';
import type { Kysely } from 'kysely';
import { loadProjectedMemberVoteWeight } from '../../services/membership-read-model.js';
import { emitAppEvent } from '../sse.js';

type RecordData = Record<string, unknown>;

export async function indexProposal(
  db: Kysely<Database>,
  event: FirehoseEvent,
): Promise<void> {
  const indexedAt = eventDate(event);
  if (event.operation === 'delete') {
    await db
      .updateTable('proposal')
      .set({ invalidated_at: indexedAt, indexed_at: indexedAt })
      .where('uri', '=', event.uri)
      .execute();
    return;
  }

  const record = asRecord(event.record);
  if (!record) return;
  const cooperativeDid = stringField(record.cooperative, record.cooperativeDid);
  const title = stringField(record.title);
  const body = stringField(record.body);
  if (!cooperativeDid || !title || body === undefined) return;

  const existing = await db
    .selectFrom('proposal')
    .where('uri', '=', event.uri)
    .select(['id'])
    .executeTakeFirst();
  const sourceFields = {
    cid: event.cid,
    title,
    body,
    body_format: stringField(record.bodyFormat) ?? 'text',
    voting_type: votingType(record),
    options: Array.isArray(record.options) ? record.options : null,
    quorum_type: quorumType(record),
    quorum_basis: stringField(record.quorumBasis) ?? 'votesCast',
    quorum_threshold: numberField(
      record.quorumThreshold,
      record.quorumRequired,
    ),
    closes_at: dateField(record.closesAt, record.votingEndsAt),
    tags: stringArray(record.tags),
    meeting_event: stringField(record.meetingEvent) ?? null,
    full_document: stringField(record.fullDocument) ?? null,
    discussion_thread: stringField(record.discussionThread) ?? null,
    invalidated_at: null,
    invalidated_by: null,
    indexed_at: indexedAt,
  };

  if (existing) {
    await db
      .updateTable('proposal')
      .set(sourceFields)
      .where('id', '=', existing.id)
      .execute();
    return;
  }

  await db
    .insertInto('proposal')
    .values({
      uri: event.uri,
      ...sourceFields,
      cooperative_did: cooperativeDid,
      author_did: event.did,
      status: proposalStatus(record),
      outcome: null,
      opens_at: null,
      resolved_at: null,
      class_quorum_rules: null,
      created_at: dateField(record.createdAt) ?? indexedAt,
      created_by: event.did,
    })
    .onConflict((conflict) => conflict.column('uri').doUpdateSet(sourceFields))
    .execute();
}

/**
 * Returns false when an upsert cannot yet be projected because its proposal
 * is absent. Public firehose hooks may retry independently; the permissioned
 * consumer treats false as a checkpoint-blocking ordering gap.
 */
export async function indexVote(
  db: Kysely<Database>,
  event: FirehoseEvent,
  constraints?: { readonly expectedCooperativeDid?: string },
): Promise<boolean> {
  const indexedAt = eventDate(event);
  if (event.operation === 'delete') {
    const vote = await db
      .selectFrom('vote')
      .innerJoin('proposal', 'proposal.id', 'vote.proposal_id')
      .where('vote.uri', '=', event.uri)
      .select('proposal.cooperative_did')
      .executeTakeFirst();
    await db
      .updateTable('vote')
      .set({
        retracted_at: indexedAt,
        retracted_by: event.did,
        indexed_at: indexedAt,
      })
      .where('uri', '=', event.uri)
      .execute();

    emitAppEvent({
      type: 'vote.retracted',
      data: { voterDid: event.did, uri: event.uri },
      cooperativeDid: vote?.cooperative_did ?? '',
    });
    return true;
  }

  const record = asRecord(event.record);
  if (!record) return true;
  const declaredVoter = stringField(record.voterDid);
  if (declaredVoter && declaredVoter !== event.did) {
    throw new Error(
      `Vote ${event.uri} declares voter ${declaredVoter}, expected ${event.did}`,
    );
  }
  const proposalUri = stringField(record.proposal, record.proposalUri);
  const choice = stringField(record.choice);
  if (!proposalUri || choice === undefined) return true;

  const proposal = await db
    .selectFrom('proposal')
    .where('uri', '=', proposalUri)
    .where('invalidated_at', 'is', null)
    .select(['id', 'cid', 'cooperative_did'])
    .executeTakeFirst();
  if (!proposal) return false;
  if (
    constraints?.expectedCooperativeDid &&
    proposal.cooperative_did !== constraints.expectedCooperativeDid
  ) {
    throw new Error(
      `Vote ${event.uri} references proposal cooperative ${proposal.cooperative_did}, expected ${constraints.expectedCooperativeDid}`,
    );
  }
  const proposalCid = stringField(record.proposalCid);
  if (proposalCid && proposalCid !== proposal.cid) {
    throw new Error(
      `Vote ${event.uri} references proposal CID ${proposalCid}, expected ${proposal.cid}`,
    );
  }

  const voteWeight = await loadProjectedMemberVoteWeight(
    db,
    proposal.cooperative_did as DID,
    event.did as DID,
  );
  const createdAt = dateField(record.createdAt) ?? indexedAt;

  await db.transaction().execute(async (transaction) => {
    await transaction
      .updateTable('vote')
      .set({
        retracted_at: indexedAt,
        retracted_by: event.did,
        indexed_at: indexedAt,
      })
      .where('proposal_id', '=', proposal.id)
      .where('voter_did', '=', event.did)
      .where('retracted_at', 'is', null)
      .where('uri', '!=', event.uri)
      .execute();

    await transaction
      .insertInto('vote')
      .values({
        uri: event.uri,
        cid: event.cid,
        proposal_id: proposal.id,
        proposal_uri: proposalUri,
        proposal_cid: proposalCid ?? '',
        voter_did: event.did,
        choice,
        vote_weight: voteWeight,
        rationale: stringField(record.rationale) ?? null,
        created_at: createdAt,
        retracted_at: null,
        retracted_by: null,
        indexed_at: indexedAt,
      })
      .onConflict((conflict) =>
        conflict.column('uri').doUpdateSet({
          cid: event.cid,
          proposal_id: proposal.id,
          proposal_uri: proposalUri,
          proposal_cid: proposalCid ?? '',
          voter_did: event.did,
          choice,
          vote_weight: voteWeight,
          rationale: stringField(record.rationale) ?? null,
          retracted_at: null,
          retracted_by: null,
          indexed_at: indexedAt,
        }),
      )
      .execute();
  });

  emitAppEvent({
    type: 'vote.cast',
    data: {
      voterDid: event.did,
      proposalId: proposal.id,
      choice,
    },
    cooperativeDid: proposal.cooperative_did,
  });
  return true;
}

function asRecord(value: unknown): RecordData | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as RecordData;
}

function stringField(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string');
}

function numberField(...values: unknown[]): number | null {
  const value = values.find((candidate) => typeof candidate === 'number');
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function dateField(...values: unknown[]): Date | null {
  const value = stringField(...values);
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function eventDate(event: FirehoseEvent): Date {
  const date = new Date(event.time);
  return Number.isFinite(date.getTime()) ? date : new Date();
}

function votingType(record: RecordData): string {
  const value = stringField(record.votingType, record.votingMethod);
  if (value === 'approval') return 'approval';
  if (value === 'ranked' || value === 'ranked_choice') return 'ranked';
  return 'binary';
}

function quorumType(record: RecordData): string {
  const value = stringField(record.quorumType);
  if (
    value === 'simpleMajority' ||
    value === 'superMajority' ||
    value === 'unanimous' ||
    value === 'custom'
  ) {
    return value;
  }
  return numberField(record.quorumRequired) === null
    ? 'simpleMajority'
    : 'custom';
}

function proposalStatus(record: RecordData): string {
  const value = stringField(record.status);
  if (value === 'voting') return 'open';
  if (value === 'passed' || value === 'failed') return 'resolved';
  if (value === 'withdrawn') return 'withdrawn';
  return 'draft';
}
