import type { DID } from '@coopsource/common';
import type { Database } from '@coopsource/db';
import type { FirehoseEvent } from '@coopsource/federation';
import type { Kysely } from 'kysely';
import { loadActiveProjectedMemberVoteWeight } from '../../services/membership-read-model.js';
import { logger } from '../../middleware/logger.js';
import { emitAppEvent } from '../sse.js';

type RecordData = Record<string, unknown>;

/**
 * Constraints supplied by the caller that owns the authority decision.
 *
 * Records arriving on the public firehose carry no proof that their author may
 * affect the cooperative they name, so the projectors below apply the
 * application acceptance policy themselves (audit C-01). The permissioned
 * consumer has already proved space membership cryptographically and says so
 * with `authorityVerified`.
 */
export interface GovernanceProjectionConstraints {
  readonly expectedCooperativeDid?: string;
  readonly authorityVerified?: boolean;
}

/**
 * An active membership in the cooperative is the minimum authority to affect
 * its projected governance state. Fails closed on anything else.
 */
async function activeMemberWeight(
  db: Kysely<Database>,
  cooperativeDid: string,
  memberDid: string,
): Promise<number | null> {
  return loadActiveProjectedMemberVoteWeight(
    db,
    cooperativeDid as DID,
    memberDid as DID,
  );
}

/**
 * A suspended or deleted cooperative is not a valid destination for projected
 * governance: suspension is a moderation decision, so records naming it are
 * discarded rather than accumulating against it.
 */
async function isKnownCooperative(
  db: Kysely<Database>,
  cooperativeDid: string,
): Promise<boolean> {
  const row = await db
    .selectFrom('entity')
    .where('did', '=', cooperativeDid)
    .where('type', '=', 'cooperative')
    .where('status', '=', 'active')
    .where('invalidated_at', 'is', null)
    .select('did')
    .executeTakeFirst();
  return row !== undefined;
}

export async function indexProposal(
  db: Kysely<Database>,
  event: FirehoseEvent,
  constraints?: GovernanceProjectionConstraints,
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

  if (!constraints?.authorityVerified) {
    if (
      constraints?.expectedCooperativeDid &&
      cooperativeDid !== constraints.expectedCooperativeDid
    ) {
      logger.warn(
        { uri: event.uri, cooperativeDid, expected: constraints.expectedCooperativeDid },
        'Discarding proposal declaring a different cooperative',
      );
      return;
    }
    if (!(await isKnownCooperative(db, cooperativeDid))) {
      logger.warn(
        { uri: event.uri, cooperativeDid, authorDid: event.did },
        'Discarding proposal for an unknown cooperative',
      );
      return;
    }
    if ((await activeMemberWeight(db, cooperativeDid, event.did)) === null) {
      logger.warn(
        { uri: event.uri, cooperativeDid, authorDid: event.did },
        'Discarding proposal from a non-member of the declared cooperative',
      );
      return;
    }
  }

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
  constraints?: GovernanceProjectionConstraints,
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
    .select(['id', 'cid', 'cooperative_did', 'status', 'closes_at'])
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

  const createdAt = dateField(record.createdAt) ?? indexedAt;

  // A ballot is only counted for an active member of the proposal's own
  // cooperative, cast before the deadline (audit C-01). A rejected ballot is
  // discarded permanently, which is distinct from the `false` above that
  // reports an ordering gap the caller may retry.
  //
  // Both tests are deliberately time-invariant: they compare the record's own
  // `createdAt` against a stored deadline, so replaying a record reaches the
  // same verdict it did the first time. Testing the proposal's *current*
  // status would not — a reindex after voting closed would silently discard
  // every ballot for it, and Postgres is a projection cache that has to be
  // rebuildable from the repos. Rejecting ballots on a draft or resolved
  // proposal belongs with Phase 4's governance-boundary snapshot.
  //
  // The membership test carries a smaller version of the same sensitivity: a
  // member who later departs would have their historical ballot discarded on
  // replay. That is finding L-07, and Phase 4's eligibility snapshot resolves
  // it; membership cannot simply be dropped here because it is the C-01 fix.
  const voteWeight = await activeMemberWeight(
    db,
    proposal.cooperative_did,
    event.did,
  );
  if (!constraints?.authorityVerified) {
    if (voteWeight === null) {
      logger.warn(
        { uri: event.uri, cooperativeDid: proposal.cooperative_did, voterDid: event.did },
        'Discarding vote from a non-member of the proposal cooperative',
      );
      return true;
    }
    if (proposal.closes_at && createdAt > proposal.closes_at) {
      logger.warn(
        { uri: event.uri, closesAt: proposal.closes_at, voterDid: event.did },
        'Discarding vote cast after the proposal deadline',
      );
      return true;
    }
  }

  // On the permissioned path space membership is the authority, and the
  // projected membership row may legitimately lag it. Weight 1 is the same
  // default an active member without a weighted class receives — but it is a
  // deliberate choice here rather than the silent `?? 1` that C-01 was about,
  // so it is recorded.
  if (voteWeight === null) {
    logger.warn(
      { uri: event.uri, cooperativeDid: proposal.cooperative_did, voterDid: event.did },
      'Projecting authority-verified vote at default weight; no projected membership row',
    );
  }
  const effectiveWeight = voteWeight ?? 1;

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
        vote_weight: effectiveWeight,
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
          vote_weight: effectiveWeight,
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
