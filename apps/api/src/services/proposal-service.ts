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
}

export class ProposalService {
  constructor(
    private db: Kysely<Database>,
    private pdsService: IPdsService,
    private clock: IClock,
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

    // Write PDS record
    const ref = await this.pdsService.createRecord({
      did: authorDid as DID,
      collection: 'network.coopsource.governance.proposal',
      record: {
        title: data.title,
        body: data.body,
        votingType: data.votingType,
        options: data.options,
        quorumType: data.quorumType,
        quorumBasis: data.quorumBasis,
        cooperative: data.cooperativeDid,
        createdAt: now.toISOString(),
      },
    });

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

    // Write PDS record
    const ref = await this.pdsService.createRecord({
      did: params.voterDid as DID,
      collection: 'network.coopsource.governance.vote',
      record: {
        proposal: proposal.uri,
        proposalCid: proposal.cid,
        choice: params.choice,
        rationale: params.rationale,
        createdAt: now.toISOString(),
      },
    });

    // Retract any previous vote
    await this.db
      .updateTable('vote')
      .set({ retracted_at: now, retracted_by: params.voterDid })
      .where('proposal_id', '=', params.proposalId)
      .where('voter_did', '=', params.voterDid)
      .where('retracted_at', 'is', null)
      .execute();

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

    // Determine quorum
    let quorumMet = true;
    const threshold = proposal.quorum_threshold ?? 0.5;
    if (proposal.quorum_type === 'majority') {
      quorumMet = totalVotes > totalMembers * threshold;
    } else if (proposal.quorum_type === 'supermajority') {
      quorumMet = totalVotes > totalMembers * (threshold || 0.67);
    }

    // Tally
    const tally: Record<string, number> = {};
    for (const v of votes) {
      tally[v.choice] = (tally[v.choice] ?? 0) + 1;
    }

    // Determine outcome
    let outcome: string;
    if (!quorumMet) {
      outcome = 'no_quorum';
    } else if (proposal.voting_type === 'yes_no') {
      const yes = tally['yes'] ?? 0;
      const no = tally['no'] ?? 0;
      outcome = yes > no ? 'passed' : 'failed';
    } else {
      // For other types, the option with most votes wins
      const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
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
