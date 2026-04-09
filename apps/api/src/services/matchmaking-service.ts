import type { Kysely, Selectable } from 'kysely';
import { sql } from 'kysely';
import type { Database, MatchSuggestionTable, MatchReason } from '@coopsource/db';
import type { IClock } from '@coopsource/federation';
import { logger } from '../middleware/logger.js';
import { scoreCandidate, SCORING_VERSION } from './matchmaking/score.js';

/**
 * V8.7 — Match Service.
 *
 * Periodic background job that fills `match_suggestion` with cooperatives
 * a user might want to join. Surfaced via the `/me` Home widget and the
 * `/me/matches` page. Users can dismiss matches and mark them as
 * acted-on.
 *
 * V8.7 ships the *plumbing* with a deliberately simple stub scoring
 * function (recency × cooperative-type-diversity, see ./matchmaking/score.ts).
 * V8.8 swaps the scoring function for alignment-based scoring without
 * touching the table, the job, the routes, or the UI.
 *
 * Architectural decisions (see plan §V8.7):
 *   1. Notifications are DEFERRED — `notification.cooperative_did` is
 *      NOT NULL and system-generated matches have no natural sender.
 *   2. Dismissed/acted rows are TOMBSTONES — they stay in the table to
 *      block re-suggestion via the unique key on `(user_did, target_did)`.
 *      `pruneStale` only deletes un-actioned rows.
 *   3. The job uses DELETE+INSERT in a transaction (NOT pure ON CONFLICT
 *      DO NOTHING) so the candidate pool refreshes each run. The INSERT
 *      additionally uses ON CONFLICT DO NOTHING as a safety net for the
 *      tiny race window between the tombstone-read SELECT and the INSERT.
 *   4. Networks (`is_network=true`) are excluded — different join model.
 *   5. `runMatchmakingForAllUsers` skips users with no active memberships
 *      at query time (via JOIN), not via per-user no-op.
 */

type MatchSuggestionRow = Selectable<MatchSuggestionTable>;

export interface MatchView {
  id: string;
  targetDid: string;
  handle: string | null;
  displayName: string;
  description: string | null;
  avatarCid: string | null;
  cooperativeType: string;
  memberCount: number | null;
  /** Postgres numeric → string. */
  score: string;
  reason: MatchReason;
  createdAt: string;
  dismissedAt: string | null;
  actedOnAt: string | null;
}

export interface RunForUserResult {
  inserted: number;
  deleted: number;
}

export interface RunForAllResult {
  users: number;
  inserted: number;
  deleted: number;
  errors: number;
}

interface UserContext {
  existingCoopDids: Set<string>;
  userCoopTypes: Set<string>;
}

interface CandidateRow {
  did: string;
  cooperativeType: string;
  createdAt: Date;
}

const TOP_N = 20;
const PRUNE_AFTER_DAYS = 14;

export class MatchmakingService {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly clock: IClock,
  ) {}

  // ─── Job entry points ─────────────────────────────────────────────

  async runMatchmakingForUser(userDid: string): Promise<RunForUserResult> {
    const ctx = await this.loadUserContext(userDid);
    const candidates = await this.fetchCandidates(userDid, ctx);
    const now = this.clock.now();

    const scored = candidates
      .map((candidate) => ({
        candidate,
        result: scoreCandidate({ candidate, ctx, now }),
      }))
      .sort((a, b) => b.result.score - a.result.score)
      .slice(0, TOP_N);

    if (scored.length === 0) {
      // Still run the DELETE so stale rows from a previous run are cleared.
      const deleted = await this.deleteActiveForUser(this.db, userDid);
      return { inserted: 0, deleted };
    }

    return await this.db.transaction().execute(async (trx) => {
      const deleted = await this.deleteActiveForUser(trx, userDid);

      const rows = scored.map(({ candidate, result }) => ({
        user_did: userDid,
        target_did: candidate.did,
        match_type: 'cooperative',
        score: result.score.toFixed(4),
        reason: JSON.stringify({
          signals: result.signals,
          version: SCORING_VERSION,
        }),
      }));

      // Race safety net: if a concurrent dismiss inserted a tombstone for
      // one of these target_dids between fetchCandidates() and now, the
      // unique key would otherwise crash. DO NOTHING means we lose at
      // most one would-be re-suggest — benign.
      const insertResult = await trx
        .insertInto('match_suggestion')
        .values(rows)
        .onConflict((oc) =>
          oc.columns(['user_did', 'target_did']).doNothing(),
        )
        .execute();

      const inserted = insertResult.reduce(
        (sum, r) => sum + Number(r.numInsertedOrUpdatedRows ?? 0),
        0,
      );

      return { inserted, deleted };
    });
  }

  async runMatchmakingForAllUsers(): Promise<RunForAllResult> {
    // Single SELECT enumerates only users WITH at least one active
    // membership. Skipping membership-less users at query time avoids
    // wasted DELETE+INSERT round-trips for users who would 401 on
    // `/me/matches` anyway.
    const userRows = await this.db
      .selectFrom('entity as e')
      .innerJoin('membership as m', (join) =>
        join
          .onRef('m.member_did', '=', 'e.did')
          .on('m.status', '=', 'active')
          .on('m.invalidated_at', 'is', null),
      )
      .where('e.type', '=', 'person')
      .where('e.status', '=', 'active')
      .where('e.invalidated_at', 'is', null)
      .select('e.did')
      .distinct()
      .execute();

    let inserted = 0;
    let deleted = 0;
    let errors = 0;

    for (const { did } of userRows) {
      try {
        const result = await this.runMatchmakingForUser(did);
        inserted += result.inserted;
        deleted += result.deleted;
      } catch (err) {
        errors += 1;
        logger.error(
          { err, userDid: did },
          'Matchmaking failed for user',
        );
      }
    }

    return { users: userRows.length, inserted, deleted, errors };
  }

  async pruneStale(): Promise<{ deleted: number }> {
    const result = await this.db
      .deleteFrom('match_suggestion')
      .where('dismissed_at', 'is', null)
      .where('acted_on_at', 'is', null)
      .where(
        'created_at',
        '<',
        sql<Date>`NOW() - (${PRUNE_AFTER_DAYS} || ' days')::interval`,
      )
      .executeTakeFirst();

    return { deleted: Number(result.numDeletedRows ?? 0) };
  }

  // ─── Read API ─────────────────────────────────────────────────────

  async getMatchesForUser(
    userDid: string,
    params: { limit?: number; include?: 'active' | 'all' },
  ): Promise<MatchView[]> {
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 50);
    const include = params.include ?? 'active';

    let query = this.db
      .selectFrom('match_suggestion as ms')
      .innerJoin('entity as e', 'e.did', 'ms.target_did')
      .innerJoin('cooperative_profile as cp', 'cp.entity_did', 'e.did')
      .leftJoin('membership as m', (join) =>
        join
          .onRef('m.cooperative_did', '=', 'e.did')
          .on('m.status', '=', 'active')
          .on('m.invalidated_at', 'is', null),
      )
      .where('ms.user_did', '=', userDid)
      .where('e.status', '=', 'active')
      .where('e.invalidated_at', 'is', null)
      .select([
        'ms.id',
        'ms.target_did',
        'ms.score',
        'ms.reason',
        'ms.created_at',
        'ms.dismissed_at',
        'ms.acted_on_at',
        'e.handle',
        'e.display_name',
        'e.description',
        'e.avatar_cid',
        'cp.cooperative_type',
      ])
      .select((eb) => eb.fn.count<number>('m.id').distinct().as('member_count'))
      .groupBy([
        'ms.id',
        'ms.target_did',
        'ms.score',
        'ms.reason',
        'ms.created_at',
        'ms.dismissed_at',
        'ms.acted_on_at',
        'e.handle',
        'e.display_name',
        'e.description',
        'e.avatar_cid',
        'cp.cooperative_type',
      ])
      .orderBy('ms.score', 'desc')
      .orderBy('ms.created_at', 'desc')
      .limit(limit);

    if (include === 'active') {
      query = query
        .where('ms.dismissed_at', 'is', null)
        .where('ms.acted_on_at', 'is', null);
    }

    const rows = await query.execute();

    return rows.map((r) => ({
      id: r.id,
      targetDid: r.target_did,
      handle: r.handle,
      displayName: r.display_name,
      description: r.description,
      avatarCid: r.avatar_cid,
      cooperativeType: r.cooperative_type,
      memberCount: Number(r.member_count),
      score: r.score,
      reason: r.reason as unknown as MatchReason,
      createdAt: toIso(r.created_at),
      dismissedAt: r.dismissed_at ? toIso(r.dismissed_at) : null,
      actedOnAt: r.acted_on_at ? toIso(r.acted_on_at) : null,
    }));
  }

  // ─── Mutations ────────────────────────────────────────────────────

  async dismissMatch(
    id: string,
    userDid: string,
  ): Promise<MatchSuggestionRow | null> {
    const row = await this.db
      .updateTable('match_suggestion')
      .set({ dismissed_at: this.clock.now() })
      .where('id', '=', id)
      .where('user_did', '=', userDid)
      .returningAll()
      .executeTakeFirst();
    return row ?? null;
  }

  async markActedOn(
    id: string,
    userDid: string,
  ): Promise<MatchSuggestionRow | null> {
    const row = await this.db
      .updateTable('match_suggestion')
      .set({ acted_on_at: this.clock.now() })
      .where('id', '=', id)
      .where('user_did', '=', userDid)
      .returningAll()
      .executeTakeFirst();
    return row ?? null;
  }

  // ─── Internals ────────────────────────────────────────────────────

  private async loadUserContext(userDid: string): Promise<UserContext> {
    const rows = await this.db
      .selectFrom('membership as m')
      .innerJoin('cooperative_profile as cp', 'cp.entity_did', 'm.cooperative_did')
      .where('m.member_did', '=', userDid)
      .where('m.status', '=', 'active')
      .where('m.invalidated_at', 'is', null)
      .select(['m.cooperative_did', 'cp.cooperative_type'])
      .execute();

    return {
      existingCoopDids: new Set(rows.map((r) => r.cooperative_did)),
      userCoopTypes: new Set(rows.map((r) => r.cooperative_type)),
    };
  }

  private async fetchCandidates(
    userDid: string,
    ctx: UserContext,
  ): Promise<CandidateRow[]> {
    let query = this.db
      .selectFrom('entity as e')
      .innerJoin('cooperative_profile as cp', 'cp.entity_did', 'e.did')
      .where('e.type', '=', 'cooperative')
      .where('e.status', '=', 'active')
      .where('e.invalidated_at', 'is', null)
      .where('cp.is_network', '=', false)
      .where('cp.anon_discoverable', '=', true)
      // Exclude tombstoned DIDs (any prior dismiss/act for this user).
      // NOTE: NOT IN, not IN — IN would invert the filter and re-suggest
      // dismissed coops. See plan §V8.7 subtle issue #3.
      .where(
        'e.did',
        'not in',
        this.db
          .selectFrom('match_suggestion')
          .where('user_did', '=', userDid)
          .where((eb) =>
            eb.or([
              eb('dismissed_at', 'is not', null),
              eb('acted_on_at', 'is not', null),
            ]),
          )
          .select('target_did'),
      )
      .select(['e.did', 'e.created_at', 'cp.cooperative_type']);

    if (ctx.existingCoopDids.size > 0) {
      query = query.where('e.did', 'not in', Array.from(ctx.existingCoopDids));
    }

    const rows = await query.execute();

    return rows.map((r) => ({
      did: r.did,
      cooperativeType: r.cooperative_type,
      // Kysely returns Date for timestamptz columns.
      createdAt: r.created_at instanceof Date ? r.created_at : new Date(r.created_at),
    }));
  }

  private async deleteActiveForUser(
    executor: Kysely<Database>,
    userDid: string,
  ): Promise<number> {
    const result = await executor
      .deleteFrom('match_suggestion')
      .where('user_did', '=', userDid)
      .where('dismissed_at', 'is', null)
      .where('acted_on_at', 'is', null)
      .executeTakeFirst();
    return Number(result.numDeletedRows ?? 0);
  }
}

function toIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}
