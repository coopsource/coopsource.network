import type { Kysely, Selectable } from 'kysely';
import { sql } from 'kysely';
import type { Database, MatchSuggestionTable, MatchReason } from '@coopsource/db';
import type { IClock } from '@coopsource/federation';
import { logger } from '../middleware/logger.js';
import { scoreCandidate, SCORING_VERSION } from './matchmaking/score.js';

/**
 * V8.7 / V8.8 — Match Service.
 *
 * Periodic background job that fills `match_suggestion` with cooperatives
 * AND persons a user might want to connect with. Surfaced via the `/me`
 * Home widget and the `/me/matches` page. Users can dismiss matches and
 * mark them as acted-on.
 *
 * V8.7 shipped the *plumbing* with a deliberately simple stub scoring
 * function (recency × cooperative-type-diversity). V8.8 swaps the scoring
 * function for alignment-based scoring (see ./matchmaking/score.ts) AND
 * extends the candidate pool to include persons whose interest categories
 * overlap with the user's. A single TOP_N cap applies across both pools
 * — no per-type quota; highest scores win regardless of `match_type`.
 *
 * Architectural decisions (see plan §V8.7/§V8.8):
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
 *   6. Person candidates follow V8.8's D1 hybrid discoverability rule:
 *      `profile.discoverable = true` OR the person has any
 *      `stakeholder_interest` row (alignment data = implicit opt-in).
 *   7. The pure scoring module in ./matchmaking/score.ts is the single
 *      source of truth for the composition formula. This service loads
 *      candidates + user alignment data, passes them in, and persists the
 *      result. It does not interpret signals.
 */

type MatchSuggestionRow = Selectable<MatchSuggestionTable>;

export interface MatchView {
  id: string;
  /** 'cooperative' or 'person' — discriminator for the target shape. */
  matchType: 'cooperative' | 'person';
  targetDid: string;
  handle: string | null;
  displayName: string;
  description: string | null;
  avatarCid: string | null;
  /** Non-null only for cooperative matches. */
  cooperativeType: string | null;
  /** Non-null only for cooperative matches (active member count). */
  memberCount: number | null;
  /**
   * V8.8 — number of interest categories present on BOTH the viewer and
   * the candidate person (sourced from the reason.signals JSONB). Null for
   * cooperative matches.
   */
  sharedInterestCount: number | null;
  /**
   * V8.8 — number of cooperatives the candidate person shares with the
   * viewer (sourced from reason.signals JSONB). Null for cooperative
   * matches.
   */
  sharedCoopCount: number | null;
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
  /** DIDs of cooperatives the user is already an active member of. */
  existingCoopDids: Set<string>;
  /** Cooperative types the user is already a member of (diversity input). */
  userCoopTypes: Set<string>;
  /**
   * V8.8 — Mean priority [1,5] per lowercased interest category, computed
   * from the user's `stakeholder_interest` rows. Empty map = user has no
   * alignment data (the score function's fallback branch will fire).
   */
  userInterestPriorityByCategory: Map<string, number>;
}

/**
 * V8.8 — Discriminated union so we can pass CandidateRow straight into
 * `scoreCandidate`. Structurally matches `ScoreInput.candidate` exactly.
 */
type CandidateRow =
  | {
      did: string;
      type: 'cooperative';
      cooperativeType: string;
      createdAt: Date;
      interestPriorityByCategory: Map<string, number>;
      sharedCoopCount: 0;
    }
  | {
      did: string;
      type: 'person';
      cooperativeType: null;
      createdAt: Date;
      interestPriorityByCategory: Map<string, number>;
      sharedCoopCount: number;
    };

/**
 * Shape of an `interests` JSONB element in `stakeholder_interest`. The
 * category is the only load-bearing field for matchmaking; priority is
 * optional (defaults to 1). Other fields (description, scope) are ignored.
 */
interface InterestItem {
  category: string;
  priority?: number;
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
    // V8.8 — Fetch both candidate pools in parallel. The two reads are
    // independent: cooperative candidates come from `entity + cooperative_
    // profile`, person candidates come from `entity + profile`. The second-
    // step interest aggregations are both keyed off their respective
    // candidate DID lists, so there's no ordering dependency.
    const [coopCandidates, personCandidates] = await Promise.all([
      this.fetchCandidates(userDid, ctx),
      this.fetchPersonCandidates(userDid, ctx),
    ]);
    const candidates: CandidateRow[] = [...coopCandidates, ...personCandidates];
    const now = this.clock.now();

    // Single TOP_N cap across both pools. No per-type quota: highest scores
    // win regardless of match_type. This is intentional — if a user's
    // alignment interests overlap strongly with a set of people, those
    // people should outrank unrelated cooperatives, and vice versa.
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
        // V8.8 — persisted so `getMatchesForUser` can LEFT JOIN on
        // cooperative_profile conditionally and the UI can render person
        // vs cooperative cards differently.
        match_type: candidate.type,
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

    // V8.8 — LEFT JOIN cooperative_profile so person targets (which have
    // no cp row) are returned with null cooperative_type. The membership
    // LEFT JOIN naturally yields member_count=0 for persons because the
    // join predicate `m.cooperative_did = e.did` never matches a person
    // DID; the mapper nulls that out on the person branch anyway.
    let query = this.db
      .selectFrom('match_suggestion as ms')
      .innerJoin('entity as e', 'e.did', 'ms.target_did')
      .leftJoin('cooperative_profile as cp', 'cp.entity_did', 'e.did')
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
        'ms.match_type',
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
        'ms.match_type',
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

    return rows.map((r) => {
      const matchType: 'cooperative' | 'person' =
        r.match_type === 'person' ? 'person' : 'cooperative';
      // For person rows we read shared* counts from the persisted
      // reason.signals JSONB. V8.7 rows still in the dev DB will have
      // signals shaped as {recency, diversity, ageDays} only — the
      // `?? 0` fallbacks handle missing fields intentionally. The 14-day
      // pruner eventually clears those; Task 12 documents an optional
      // one-time truncate.
      const reasonAsAny = r.reason as Record<string, unknown>;
      const signals = (reasonAsAny?.signals ?? {}) as Record<string, unknown>;
      return {
        id: r.id,
        matchType,
        targetDid: r.target_did,
        handle: r.handle,
        displayName: r.display_name,
        description: r.description,
        avatarCid: r.avatar_cid,
        cooperativeType: r.cooperative_type ?? null,
        memberCount: matchType === 'cooperative' ? Number(r.member_count) : null,
        sharedInterestCount:
          matchType === 'person' ? Number(signals.sharedCategoryCount ?? 0) : null,
        sharedCoopCount:
          matchType === 'person' ? Number(signals.sharedCoopCount ?? 0) : null,
        score: r.score,
        reason: r.reason as unknown as MatchReason,
        createdAt: toIso(r.created_at),
        dismissedAt: r.dismissed_at ? toIso(r.dismissed_at) : null,
        actedOnAt: r.acted_on_at ? toIso(r.acted_on_at) : null,
      };
    });
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
    // 1. Active memberships → existing coop DIDs (exclude from candidate
    //    pool) AND cooperative types (diversity input).
    const membershipRows = await this.db
      .selectFrom('membership as m')
      .innerJoin('cooperative_profile as cp', 'cp.entity_did', 'm.cooperative_did')
      .where('m.member_did', '=', userDid)
      .where('m.status', '=', 'active')
      .where('m.invalidated_at', 'is', null)
      .select(['m.cooperative_did', 'cp.cooperative_type'])
      .execute();

    // 2. V8.8 — User's alignment interests, aggregated by category. Categories
    //    are lowercased to match alignment-service.ts:496. Priority is the
    //    MEAN across all of the user's stakeholder_interest rows (a user may
    //    have multiple, one per project_uri they've acted on), which matches
    //    the aggregation shape passed into `scoreCandidate`'s weighted
    //    Jaccard.
    const interestRows = await this.db
      .selectFrom('stakeholder_interest')
      .where('did', '=', userDid)
      .select('interests')
      .execute();

    const userInterestPriorityByCategory = aggregateInterestsByCategory(interestRows);

    return {
      existingCoopDids: new Set(membershipRows.map((r) => r.cooperative_did)),
      userCoopTypes: new Set(membershipRows.map((r) => r.cooperative_type)),
      userInterestPriorityByCategory,
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
    if (rows.length === 0) return [];

    // V8.8 — Second query: aggregate each candidate cooperative's
    // stakeholder_interest rows by category with mean priority. Cooperatives
    // without any alignment data get an empty Map (score.ts treats that as
    // alignment=0 and either suppresses or falls back to V8.7 recency*
    // diversity depending on whether the USER has alignment data).
    const coopDids = rows.map((r) => r.did);
    const coopInterestsByDid = await this.loadCoopInterestsByDid(coopDids);

    return rows.map((r) => ({
      did: r.did,
      type: 'cooperative' as const,
      cooperativeType: r.cooperative_type,
      // Kysely returns Date for timestamptz columns.
      createdAt: r.created_at instanceof Date ? r.created_at : new Date(r.created_at),
      interestPriorityByCategory: coopInterestsByDid.get(r.did) ?? new Map(),
      sharedCoopCount: 0 as const,
    }));
  }

  /**
   * V8.8 — Fetch person candidates for alignment-driven matching.
   *
   * Candidate pool: active persons (other than the viewer) who are
   * discoverable under the D1 hybrid rule — `profile.discoverable = true`
   * OR the person has at least one `stakeholder_interest` record (alignment
   * data is an implicit opt-in because it's already Tier 1 public).
   *
   * Candidates who have been tombstoned (dismissed or acted-on) by the
   * viewer are excluded via the same NOT IN subquery as `fetchCandidates`.
   * The viewer themselves is excluded via `e.did != userDid`.
   *
   * For each remaining candidate, the second query loads their full
   * `stakeholder_interest` rows to build:
   *   - `interestPriorityByCategory`: mean priority per lowercased category
   *     (the scoring function's alignment input), and
   *   - `sharedCoopCount`: how many of the candidate's `project_uri`s
   *     appear in the viewer's `existingCoopDids` (the scoring signal
   *     that surfaces "we're in the same co-ops" as a tie-breaker).
   *
   * Persons with no alignment data are included in the pool if they've
   * set `discoverable = true`; their `interestPriorityByCategory` will be
   * empty, which makes `scoreCandidate` either suppress them (if the user
   * has alignment data, they score 0) or rank them via the V8.7 fallback
   * (if the user also has no alignment data).
   */
  private async fetchPersonCandidates(
    userDid: string,
    ctx: UserContext,
  ): Promise<CandidateRow[]> {
    const rows = await this.db
      .selectFrom('entity as e')
      .innerJoin('profile as p', (j) =>
        j
          .onRef('p.entity_did', '=', 'e.did')
          .on('p.is_default', '=', true)
          .on('p.invalidated_at', 'is', null),
      )
      .where('e.type', '=', 'person')
      .where('e.status', '=', 'active')
      .where('e.invalidated_at', 'is', null)
      .where('e.did', '!=', userDid)
      // D1 hybrid: discoverable OR has any alignment data.
      .where((eb) =>
        eb.or([
          eb('p.discoverable', '=', true),
          eb.exists(
            eb
              .selectFrom('stakeholder_interest as si')
              .whereRef('si.did', '=', 'e.did')
              .select('si.uri'),
          ),
        ]),
      )
      // Same tombstone subquery as the cooperative path.
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
      .select(['e.did', 'e.created_at'])
      .execute();

    if (rows.length === 0) return [];

    // Second query: fetch interests + project_uris for all candidate persons
    // in one shot, then bucket by did.
    const personDids = rows.map((r) => r.did);
    const interestRows = await this.db
      .selectFrom('stakeholder_interest')
      .where('did', 'in', personDids)
      .select(['did', 'project_uri', 'interests'])
      .execute();

    // Per-person accumulator: mean priority by category + set of
    // project_uris (to compute sharedCoopCount against ctx.existingCoopDids).
    interface PersonAccum {
      priorityAccum: Map<string, { sum: number; count: number }>;
      projectUris: Set<string>;
    }
    const dataByPerson = new Map<string, PersonAccum>();
    for (const r of interestRows) {
      let acc = dataByPerson.get(r.did);
      if (!acc) {
        acc = { priorityAccum: new Map(), projectUris: new Set() };
        dataByPerson.set(r.did, acc);
      }
      acc.projectUris.add(r.project_uri);
      const items = (r.interests as InterestItem[] | null) ?? [];
      for (const item of items) {
        const cat = String(item.category ?? '').toLowerCase();
        if (!cat) continue;
        const p = acc.priorityAccum.get(cat) ?? { sum: 0, count: 0 };
        p.sum += Number(item.priority ?? 1);
        p.count += 1;
        acc.priorityAccum.set(cat, p);
      }
    }

    return rows.map((r) => {
      const data = dataByPerson.get(r.did);
      const interestPriorityByCategory = new Map<string, number>();
      if (data) {
        for (const [cat, { sum, count }] of data.priorityAccum) {
          interestPriorityByCategory.set(cat, sum / count);
        }
      }
      const sharedCoopCount = data
        ? Array.from(data.projectUris).filter((d) => ctx.existingCoopDids.has(d)).length
        : 0;
      return {
        did: r.did,
        type: 'person' as const,
        cooperativeType: null,
        createdAt: r.created_at instanceof Date ? r.created_at : new Date(r.created_at),
        interestPriorityByCategory,
        sharedCoopCount,
      };
    });
  }

  /**
   * V8.8 — For a set of cooperative DIDs, aggregate their stakeholder
   * members' interest categories with mean priority. Returns a map keyed
   * by cooperative DID → (category → mean priority).
   *
   * Used by `fetchCandidates`. Extracted so the two-step read (entity
   * query → interest aggregation) stays readable. Cooperatives with no
   * stakeholder_interest rows simply don't appear in the returned map;
   * the caller substitutes an empty Map, which scores as alignment=0.
   */
  private async loadCoopInterestsByDid(
    coopDids: string[],
  ): Promise<Map<string, Map<string, number>>> {
    const result = new Map<string, Map<string, number>>();
    if (coopDids.length === 0) return result;

    const interestRows = await this.db
      .selectFrom('stakeholder_interest')
      .where('project_uri', 'in', coopDids)
      .select(['project_uri', 'interests'])
      .execute();

    const accumByCoop = new Map<
      string,
      Map<string, { sum: number; count: number }>
    >();
    for (const r of interestRows) {
      const items = (r.interests as InterestItem[] | null) ?? [];
      let coopAcc = accumByCoop.get(r.project_uri);
      if (!coopAcc) {
        coopAcc = new Map();
        accumByCoop.set(r.project_uri, coopAcc);
      }
      for (const item of items) {
        const cat = String(item.category ?? '').toLowerCase();
        if (!cat) continue;
        const a = coopAcc.get(cat) ?? { sum: 0, count: 0 };
        a.sum += Number(item.priority ?? 1);
        a.count += 1;
        coopAcc.set(cat, a);
      }
    }

    for (const [coopDid, accMap] of accumByCoop) {
      const meanMap = new Map<string, number>();
      for (const [cat, { sum, count }] of accMap) {
        meanMap.set(cat, sum / count);
      }
      result.set(coopDid, meanMap);
    }

    return result;
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

/**
 * V8.8 — Aggregate a set of `stakeholder_interest.interests` JSONB
 * arrays into a single {category → mean priority} map. Used by
 * `loadUserContext` (one DID = the user) and could be reused by
 * per-candidate aggregations; for the candidate paths we inline it
 * because we also need to track `project_uri` or group by DID, which
 * would awkwardly ride along.
 *
 * Categories are lowercased to match the rest of the alignment stack
 * (alignment-service.ts:496). Items with missing priority default to 1.
 * Items with missing/empty category are dropped. An empty input produces
 * an empty map — which `scoreCandidate` interprets as "no alignment
 * data" and routes to its fallback branch.
 */
function aggregateInterestsByCategory(
  rows: ReadonlyArray<{ interests: unknown }>,
): Map<string, number> {
  const accum = new Map<string, { sum: number; count: number }>();
  for (const row of rows) {
    const items = (row.interests as InterestItem[] | null) ?? [];
    for (const item of items) {
      const cat = String(item.category ?? '').toLowerCase();
      if (!cat) continue;
      const a = accum.get(cat) ?? { sum: 0, count: 0 };
      a.sum += Number(item.priority ?? 1);
      a.count += 1;
      accum.set(cat, a);
    }
  }
  const result = new Map<string, number>();
  for (const [cat, { sum, count }] of accum) {
    result.set(cat, sum / count);
  }
  return result;
}
