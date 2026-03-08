import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { IClock } from '@coopsource/federation';
import type { PageParams, Page } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';

export class GovernanceFeedService {
  constructor(
    private db: Kysely<Database>,
    private clock: IClock,
  ) {}

  /**
   * Get action items for a member: open proposals needing their vote,
   * pending onboarding reviews, etc.
   */
  async getActionItems(
    cooperativeDid: string,
    memberDid: string,
    params: PageParams,
  ): Promise<Page<Record<string, unknown>>> {
    const limit = params.limit ?? 50;

    // Get proposals in 'voting' status that the member hasn't voted on
    let query = this.db
      .selectFrom('proposal')
      .leftJoin('vote', (join) =>
        join
          .onRef('vote.proposal_id', '=', 'proposal.id')
          .on('vote.voter_did', '=', memberDid)
          .on('vote.retracted_at', 'is', null),
      )
      .where('proposal.cooperative_did', '=', cooperativeDid)
      .where('proposal.status', '=', 'open')
      .where('vote.id', 'is', null)
      .select([
        'proposal.id',
        'proposal.title',
        'proposal.status',
        'proposal.closes_at',
        'proposal.created_at',
      ])
      .orderBy('proposal.created_at', 'desc')
      .orderBy('proposal.id', 'desc')
      .limit(limit + 1);

    if (params.cursor) {
      const { t, i } = decodeCursor(params.cursor);
      query = query.where((eb) =>
        eb.or([
          eb('proposal.created_at', '<', new Date(t)),
          eb.and([
            eb('proposal.created_at', '=', new Date(t)),
            eb('proposal.id', '<', i),
          ]),
        ]),
      );
    }

    const rows = await query.execute();
    const slice = rows.slice(0, limit);
    const cursor =
      rows.length > limit
        ? encodeCursor(
            slice[slice.length - 1]!.created_at as Date,
            slice[slice.length - 1]!.id,
          )
        : undefined;

    const items = slice.map((r) => ({
      type: 'proposal_vote_needed' as const,
      proposalId: r.id,
      title: r.title,
      status: r.status,
      closesAt: r.closes_at ? (r.closes_at as Date).toISOString() : null,
      createdAt: (r.created_at as Date).toISOString(),
    }));

    return { items, cursor };
  }

  /**
   * Get recent outcomes: proposals that have been resolved
   * (passed, failed, withdrawn).
   */
  async getRecentOutcomes(
    cooperativeDid: string,
    params: PageParams,
  ): Promise<Page<Record<string, unknown>>> {
    const limit = params.limit ?? 50;

    let query = this.db
      .selectFrom('proposal')
      .where('cooperative_did', '=', cooperativeDid)
      .where('status', 'in', ['resolved', 'withdrawn'])
      .select([
        'id',
        'title',
        'status',
        'outcome',
        'resolved_at',
        'created_at',
      ])
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1);

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
            slice[slice.length - 1]!.created_at as Date,
            slice[slice.length - 1]!.id,
          )
        : undefined;

    const items = slice.map((r) => ({
      type: 'proposal_outcome' as const,
      proposalId: r.id,
      title: r.title,
      status: r.status,
      outcome: r.outcome,
      resolvedAt: r.resolved_at ? (r.resolved_at as Date).toISOString() : null,
      createdAt: (r.created_at as Date).toISOString(),
    }));

    return { items, cursor };
  }

  /**
   * Get upcoming meetings — proposals of type 'other' with a close date
   * in the next 30 days, used as a simple meeting proxy.
   */
  async getUpcomingMeetings(
    cooperativeDid: string,
    params: PageParams,
  ): Promise<Page<Record<string, unknown>>> {
    const limit = params.limit ?? 50;
    const now = this.clock.now();
    const thirtyDaysLater = new Date(
      now.getTime() + 30 * 24 * 60 * 60 * 1000,
    );

    let query = this.db
      .selectFrom('proposal')
      .where('cooperative_did', '=', cooperativeDid)
      .where('status', 'in', ['draft', 'open'])
      .where('closes_at', '>=', now)
      .where('closes_at', '<=', thirtyDaysLater)
      .select(['id', 'title', 'status', 'closes_at', 'created_at'])
      .orderBy('closes_at', 'asc')
      .orderBy('id', 'asc')
      .limit(limit + 1);

    if (params.cursor) {
      const { t, i } = decodeCursor(params.cursor);
      query = query.where((eb) =>
        eb.or([
          eb('closes_at', '>', new Date(t)),
          eb.and([
            eb('closes_at', '=', new Date(t)),
            eb('id', '>', i),
          ]),
        ]),
      );
    }

    const rows = await query.execute();
    const slice = rows.slice(0, limit);
    const cursor =
      rows.length > limit
        ? encodeCursor(
            slice[slice.length - 1]!.closes_at as Date,
            slice[slice.length - 1]!.id,
          )
        : undefined;

    const items = slice.map((r) => ({
      type: 'upcoming_deadline' as const,
      proposalId: r.id,
      title: r.title,
      status: r.status,
      closesAt: r.closes_at ? (r.closes_at as Date).toISOString() : null,
      createdAt: (r.created_at as Date).toISOString(),
    }));

    return { items, cursor };
  }
}
