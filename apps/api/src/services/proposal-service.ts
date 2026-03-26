import type { Kysely, Selectable } from 'kysely';
import type { Database, ProposalTable, VoteTable } from '@coopsource/db';

type ProposalRow = Selectable<ProposalTable>;
type VoteRow = Selectable<VoteTable>;
import type { DID } from '@coopsource/common';
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@coopsource/common';
import type { IPdsService, IClock } from '@coopsource/federation';
import type { Page, PageParams } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';
import { logger } from '../middleware/logger.js';

export interface ProposalWithVotes {
  proposal: ProposalRow;
  votes: VoteRow[];
  voteSummary: Record<string, number>;
}

export interface CreateProposalInput {
  cooperativeDid: string;
  title: string;
  body: string;
  bodyFormat?: string;
  votingType: string;
  options?: unknown[];
  quorumType: string;
  quorumBasis?: string;
  quorumThreshold?: number;
  closesAt?: string;
  tags?: string[];
  meetingEvent?: string;      // AT-URI: Smoke Signal calendar event
  fullDocument?: string;      // AT-URI: WhiteWind blog entry
  discussionThread?: string;  // AT-URI: Frontpage link submission
}

import type { IMemberRecordWriter } from './member-write-proxy.js';
import type { GovernanceLabeler } from './governance-labeler.js';
import type { VisibilityRouter } from './visibility-router.js';

export class ProposalService {
  constructor(
    private db: Kysely<Database>,
    private pdsService: IPdsService,
    private clock: IClock,
    private memberWriteProxy?: IMemberRecordWriter,
    private labeler?: GovernanceLabeler,
    private visibilityRouter?: VisibilityRouter,
  ) {}

  async listProposals(
    cooperativeDid: string,
    params: PageParams & { status?: string },
  ): Promise<Page<ProposalRow>> {
    const limit = params.limit ?? 50;
    let query = this.db
      .selectFrom('proposal')
      .where('cooperative_did', '=', cooperativeDid)
      .where('invalidated_at', 'is', null)
      .selectAll()
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1);

    if (params.status) {
      query = query.where('status', '=', params.status);
    }

    if (params.cursor) {
      const { t, i } = decodeCursor(params.cursor);
      query = query.where((eb) =>
        eb.or([
          eb('created_at', '<', new Date(t)),
          eb.and([
            eb('created_at', '=', new Date(t)),
            eb('id', '<', i),
          ]),
        ]),
      );
    }

    const rows = await query.execute();
    const slice = rows.slice(0, limit);
    const cursor =
      rows.length > limit
        ? encodeCursor(
            slice[slice.length - 1]!.created_at,
            slice[slice.length - 1]!.id,
          )
        : undefined;

    return { items: slice, cursor };
  }

  async getProposal(id: string): Promise<ProposalWithVotes | null> {
    const proposal = await this.db
      .selectFrom('proposal')
      .where('id', '=', id)
      .where('invalidated_at', 'is', null)
      .selectAll()
      .executeTakeFirst();

    if (!proposal) return null;

    const votes = await this.db
      .selectFrom('vote')
      .where('proposal_id', '=', id)
      .where('retracted_at', 'is', null)
      .selectAll()
      .execute();

    const voteSummary: Record<string, number> = {};
    for (const v of votes) {
      voteSummary[v.choice] = (voteSummary[v.choice] ?? 0) + 1;
    }

    return { proposal, votes, voteSummary };
  }

  async createProposal(
    authorDid: string,
    data: CreateProposalInput,
  ): Promise<ProposalRow> {
    const now = this.clock.now();

    // Check visibility routing for closed cooperatives (Tier 2 private data)
    const collection = 'network.coopsource.governance.proposal';
    const record = {
      title: data.title,
      body: data.body,
      votingType: data.votingType,
      options: data.options,
      quorumType: data.quorumType,
      quorumBasis: data.quorumBasis,
      cooperative: data.cooperativeDid,
      ...(data.meetingEvent && { meetingEvent: data.meetingEvent }),
      ...(data.fullDocument && { fullDocument: data.fullDocument }),
      ...(data.discussionThread && { discussionThread: data.discussionThread }),
      createdAt: now.toISOString(),
    };

    let ref;
    if (this.visibilityRouter) {
      const route = await this.visibilityRouter.routeWrite({
        cooperativeDid: data.cooperativeDid,
        collection,
        record,
        createdBy: authorDid,
      });
      if (route.tier === 2) {
        // Tier 2: stored in private_record table, not on PDS/firehose
        ref = { uri: `at://${data.cooperativeDid}/${collection}/${route.rkey}` as const, cid: 'private' as const };
      } else {
        ref = await this.pdsService.createRecord({ did: authorDid as DID, collection, record });
      }
    } else {
      ref = await this.pdsService.createRecord({ did: authorDid as DID, collection, record });
    }

    const [row] = await this.db
      .insertInto('proposal')
      .values({
        uri: ref.uri,
        cid: ref.cid,
        cooperative_did: data.cooperativeDid,
        author_did: authorDid,
        title: data.title,
        body: data.body,
        body_format: data.bodyFormat ?? 'text',
        voting_type: data.votingType,
        options: data.options ?? null,
        quorum_type: data.quorumType,
        quorum_basis: data.quorumBasis ?? 'votesCast',
        quorum_threshold: data.quorumThreshold ?? null,
        status: 'draft',
        closes_at: data.closesAt ? new Date(data.closesAt) : null,
        tags: data.tags ?? [],
        created_at: now,
        created_by: authorDid,
        indexed_at: now,
      })
      .returningAll()
      .execute();

    return row!;
  }

  async openProposal(id: string, actorDid: string): Promise<ProposalRow> {
    const proposal = await this._getOwnedProposal(id, actorDid);
    if (proposal.status !== 'draft') {
      throw new ValidationError('Can only open a draft proposal');
    }

    const now = this.clock.now();
    const [updated] = await this.db
      .updateTable('proposal')
      .set({ status: 'open', opens_at: now, indexed_at: now })
      .where('id', '=', id)
      .returningAll()
      .execute();

    return updated!;
  }

  async closeProposal(id: string, _actorDid: string): Promise<ProposalRow> {
    const proposal = await this.db
      .selectFrom('proposal')
      .where('id', '=', id)
      .where('invalidated_at', 'is', null)
      .selectAll()
      .executeTakeFirst();

    if (!proposal) throw new NotFoundError('Proposal not found');
    if (proposal.status !== 'open') {
      throw new ValidationError('Can only close an open proposal');
    }

    const now = this.clock.now();
    const [updated] = await this.db
      .updateTable('proposal')
      .set({ status: 'closed', closes_at: now, indexed_at: now })
      .where('id', '=', id)
      .returningAll()
      .execute();

    return updated!;
  }

  async castVote(params: {
    proposalId: string;
    voterDid: string;
    choice: string;
    rationale?: string;
  }): Promise<VoteRow> {
    const proposal = await this.db
      .selectFrom('proposal')
      .where('id', '=', params.proposalId)
      .where('invalidated_at', 'is', null)
      .selectAll()
      .executeTakeFirst();

    if (!proposal) throw new NotFoundError('Proposal not found');
    if (proposal.status !== 'open') {
      throw new ValidationError('Proposal is not open for voting');
    }

    const now = this.clock.now();

    // Write PDS record (member-owned → MemberWriteProxy)
    const voteRecord = {
      proposal: proposal.uri,
      proposalCid: proposal.cid,
      choice: params.choice,
      rationale: params.rationale,
      createdAt: now.toISOString(),
    };
    const ref = this.memberWriteProxy
      ? await this.memberWriteProxy.writeRecord({
          memberDid: params.voterDid as DID,
          collection: 'network.coopsource.governance.vote',
          record: voteRecord,
        })
      : await this.pdsService.createRecord({
          did: params.voterDid as DID,
          collection: 'network.coopsource.governance.vote',
          record: voteRecord,
        });

    // Retract any previous vote
    await this.db
      .updateTable('vote')
      .set({ retracted_at: now, retracted_by: params.voterDid })
      .where('proposal_id', '=', params.proposalId)
      .where('voter_did', '=', params.voterDid)
      .where('retracted_at', 'is', null)
      .execute();

    // Look up voter's class weight
    const membershipRow = await this.db
      .selectFrom('membership')
      .leftJoin('member_class', (j) =>
        j
          .onRef('member_class.name', '=', 'membership.member_class')
          .onRef('member_class.cooperative_did', '=', 'membership.cooperative_did'),
      )
      .where('membership.member_did', '=', params.voterDid)
      .where('membership.cooperative_did', '=', proposal.cooperative_did)
      .select('member_class.vote_weight')
      .executeTakeFirst();
    const weight = membershipRow?.vote_weight ?? 1;

    const [vote] = await this.db
      .insertInto('vote')
      .values({
        uri: ref.uri,
        cid: ref.cid,
        proposal_id: params.proposalId,
        proposal_uri: proposal.uri ?? '',
        proposal_cid: proposal.cid ?? '',
        voter_did: params.voterDid,
        choice: params.choice,
        vote_weight: weight,
        rationale: params.rationale ?? null,
        created_at: now,
        indexed_at: now,
      })
      .returningAll()
      .execute();

    return vote!;
  }

  async retractVote(
    proposalId: string,
    voterDid: string,
  ): Promise<void> {
    const vote = await this.db
      .selectFrom('vote')
      .where('proposal_id', '=', proposalId)
      .where('voter_did', '=', voterDid)
      .where('retracted_at', 'is', null)
      .select('id')
      .executeTakeFirst();

    if (!vote) throw new NotFoundError('Vote not found');

    await this.db
      .updateTable('vote')
      .set({ retracted_at: this.clock.now(), retracted_by: voterDid })
      .where('id', '=', vote.id)
      .execute();
  }

  async resolveProposal(id: string): Promise<ProposalRow> {
    const proposal = await this.db
      .selectFrom('proposal')
      .where('id', '=', id)
      .where('invalidated_at', 'is', null)
      .selectAll()
      .executeTakeFirst();

    if (!proposal) throw new NotFoundError('Proposal not found');
    if (proposal.status !== 'closed') {
      throw new ValidationError('Can only resolve a closed proposal');
    }

    // Tally votes
    const votes = await this.db
      .selectFrom('vote')
      .where('proposal_id', '=', id)
      .where('retracted_at', 'is', null)
      .selectAll()
      .execute();

    // Count active members for quorum check
    const memberCount = await this.db
      .selectFrom('membership')
      .where('cooperative_did', '=', proposal.cooperative_did)
      .where('status', '=', 'active')
      .where('invalidated_at', 'is', null)
      .select((eb) => [eb.fn.countAll<number>().as('count')])
      .executeTakeFirst();

    const totalMembers = memberCount?.count ?? 0;
    const totalVotes = votes.length;

    // Determine quorum (fixed: match DB constraint values)
    let quorumMet = true;
    const threshold = proposal.quorum_threshold ?? 0.5;
    if (proposal.quorum_type === 'simpleMajority') {
      quorumMet = totalVotes > totalMembers * threshold;
    } else if (proposal.quorum_type === 'superMajority') {
      quorumMet = totalVotes > totalMembers * (threshold || 0.67);
    }

    // Weighted tally (sum of vote_weight) and head count tally
    const tally: Record<string, number> = {};
    const weightedTally: Record<string, number> = {};
    for (const v of votes) {
      tally[v.choice] = (tally[v.choice] ?? 0) + 1;
      weightedTally[v.choice] = (weightedTally[v.choice] ?? 0) + (v.vote_weight ?? 1);
    }

    // Per-class quorum check
    let outcome: string;
    if (proposal.class_quorum_rules && quorumMet) {
      const rules = proposal.class_quorum_rules as Record<
        string,
        { minVotes?: number; minWeight?: number }
      >;

      // Look up voter classes for all votes
      const voterClasses = await this.db
        .selectFrom('membership')
        .where('cooperative_did', '=', proposal.cooperative_did)
        .where(
          'member_did',
          'in',
          votes.map((v) => v.voter_did),
        )
        .select(['member_did', 'member_class'])
        .execute();
      const classMap = new Map(
        voterClasses.map((m) => [m.member_did, m.member_class]),
      );

      for (const [className, rule] of Object.entries(rules)) {
        const classVotes = votes.filter(
          (v) => classMap.get(v.voter_did) === className,
        );

        if (rule.minVotes && classVotes.length < rule.minVotes) {
          quorumMet = false;
          break;
        }

        if (rule.minWeight) {
          const classWeight = classVotes.reduce(
            (sum, v) => sum + (v.vote_weight ?? 1),
            0,
          );
          // Get total weight for this class (sum of all active members in class)
          const totalClassResult = await this.db
            .selectFrom('membership')
            .leftJoin('member_class', (j) =>
              j
                .onRef('member_class.name', '=', 'membership.member_class')
                .onRef(
                  'member_class.cooperative_did',
                  '=',
                  'membership.cooperative_did',
                ),
            )
            .where('membership.cooperative_did', '=', proposal.cooperative_did)
            .where('membership.member_class', '=', className)
            .where('membership.status', '=', 'active')
            .where('membership.invalidated_at', 'is', null)
            .select((eb) => [
              eb.fn
                .coalesce(
                  eb.fn.sum<number>('member_class.vote_weight'),
                  eb.val(0),
                )
                .as('total_weight'),
            ])
            .executeTakeFirst();

          const totalClassWeight = Number(totalClassResult?.total_weight ?? 0);
          if (totalClassWeight > 0 && classWeight / totalClassWeight < rule.minWeight) {
            quorumMet = false;
            break;
          }
        }
      }
    }

    // Determine outcome (using weighted tally for yes/no decisions)
    if (!quorumMet) {
      outcome = proposal.class_quorum_rules ? 'class_quorum_not_met' : 'no_quorum';
    } else if (proposal.voting_type === 'binary') {
      const yes = weightedTally['yes'] ?? 0;
      const no = weightedTally['no'] ?? 0;
      outcome = yes > no ? 'passed' : 'failed';
    } else {
      // For other types, the option with most weighted votes wins
      const sorted = Object.entries(weightedTally).sort((a, b) => b[1] - a[1]);
      outcome = sorted.length > 0 ? 'passed' : 'no_quorum';
    }

    const now = this.clock.now();
    const [updated] = await this.db
      .updateTable('proposal')
      .set({
        status: 'resolved',
        outcome,
        resolved_at: now,
        indexed_at: now,
      })
      .where('id', '=', id)
      .returningAll()
      .execute();

    // Emit governance label (best-effort)
    if (this.labeler && updated?.uri) {
      const labelValue = outcome === 'passed'
        ? 'proposal-approved'
        : outcome === 'failed'
          ? 'proposal-rejected'
          : 'proposal-archived';
      await this.labeler.emitLabel(
        updated.cooperative_did,
        updated.uri,
        labelValue as 'proposal-approved' | 'proposal-rejected' | 'proposal-archived',
        updated.cid ?? undefined,
      );
    }

    return updated!;
  }

  async resolveExpiredProposals(): Promise<void> {
    const now = this.clock.now();

    const expired = await this.db
      .selectFrom('proposal')
      .where('status', '=', 'open')
      .where('closes_at', '<=', now)
      .where('invalidated_at', 'is', null)
      .select('id')
      .execute();

    for (const { id } of expired) {
      try {
        await this.resolveProposal(id);
      } catch (err) {
        logger.error({ err, proposalId: id }, 'Failed to resolve expired proposal');
      }
    }
  }

  private async _getOwnedProposal(
    id: string,
    actorDid: string,
  ): Promise<ProposalRow> {
    const proposal = await this.db
      .selectFrom('proposal')
      .where('id', '=', id)
      .where('invalidated_at', 'is', null)
      .selectAll()
      .executeTakeFirst();

    if (!proposal) throw new NotFoundError('Proposal not found');
    if (proposal.author_did !== actorDid) {
      throw new UnauthorizedError('Not the proposal author');
    }

    return proposal;
  }
}
