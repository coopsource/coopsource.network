import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Database } from '@coopsource/db';
import type { PageParams } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';

/**
 * V8.6 — Postgres FTS over cooperative profiles and posts.
 *
 * Two endpoints:
 *   - searchCooperatives: anon-safe, filters via cooperative_profile.anon_discoverable
 *     and the entity_search_tsv generated column (added in migration 059).
 *   - searchPosts: requires viewer DID. Scoped via thread_member (NOT cooperative
 *     membership) so officer-only direct threads don't leak post bodies to regular
 *     members. Mirrors the read-access semantics of /api/v1/threads/:id/posts.
 *
 * Both methods use recency cursors (created_at DESC, id DESC) — no relevance
 * ranking in v1. setweight() is in the migration so a future ts_rank-based
 * ordering can prefer name/handle matches without another schema change.
 *
 * Empty/whitespace queries return empty results immediately (no SQL hit).
 */

export interface CoopSearchRow {
  did: string;
  handle: string | null;
  displayName: string;
  description: string | null;
  cooperativeType: string;
  memberCount: number | null;
  website: string | null;
  createdAt: Date;
}

export interface PostSearchRow {
  id: string;
  threadId: string;
  cooperativeDid: string;
  cooperativeHandle: string | null;
  cooperativeDisplayName: string;
  threadTitle: string | null;
  body: string;
  authorDid: string;
  createdAt: Date;
}

/**
 * V8.8 — People search row.
 *
 * `membershipCount` reflects ACTIVE bilateral memberships only
 * (status = 'active' AND invalidated_at IS NULL). This is a count of
 * cooperatives the person is a member of, not roles or pending applications.
 */
export interface PersonSearchRow {
  did: string;
  handle: string | null;
  displayName: string;
  bio: string | null;
  avatarCid: string | null;
  membershipCount: number;
  createdAt: Date;
}

/**
 * V8.8 — Alignment search row.
 *
 * `alignmentScore` is a cheap cooperative-discovery heuristic (NOT the
 * V8.7 match-service score). Formula:
 *   min(1.0, matched_outcomes * 0.5 + matched_interests * 0.2)
 * where `matched_outcomes` is the count of desired_outcome rows whose
 * `outcome_search_tsv` matches the query, and `matched_interests` is the
 * count of distinct interest categories (lowercased) that appear in the
 * caller-provided interests list.
 */
export interface AlignmentSearchRow {
  did: string;
  handle: string | null;
  displayName: string;
  cooperativeType: string;
  matchedOutcomes: number;
  matchedInterests: number;
  alignmentScore: number;
  createdAt: Date;
}

export class SearchService {
  constructor(private readonly db: Kysely<Database>) {}

  async searchCooperatives(
    query: string,
    params: PageParams,
  ): Promise<{ items: CoopSearchRow[]; cursor: string | null }> {
    const trimmed = query.trim();
    if (!trimmed) return { items: [], cursor: null };

    const limit = params.limit ?? 50;

    let q = this.db
      .selectFrom('entity')
      .innerJoin('cooperative_profile', 'cooperative_profile.entity_did', 'entity.did')
      .leftJoin('membership', (join) =>
        join
          .onRef('membership.cooperative_did', '=', 'entity.did')
          .on('membership.status', '=', 'active'),
      )
      .where('entity.type', '=', 'cooperative')
      .where('entity.status', '=', 'active')
      .where('cooperative_profile.is_network', '=', false)
      .where('cooperative_profile.anon_discoverable', '=', true)
      .where(sql<boolean>`entity.entity_search_tsv @@ websearch_to_tsquery('english', ${trimmed})`)
      .groupBy([
        'entity.did',
        'entity.handle',
        'entity.display_name',
        'entity.description',
        'entity.created_at',
        'cooperative_profile.cooperative_type',
        'cooperative_profile.website',
        'cooperative_profile.public_description',
        'cooperative_profile.public_members',
      ])
      .select([
        'entity.did',
        'entity.handle',
        'entity.display_name as displayName',
        'entity.description',
        'entity.created_at as createdAt',
        'cooperative_profile.cooperative_type as cooperativeType',
        'cooperative_profile.website',
        'cooperative_profile.public_description as publicDescription',
        'cooperative_profile.public_members as publicMembers',
        sql<number>`count(membership.id)::int`.as('memberCount'),
      ])
      .orderBy('entity.created_at', 'desc')
      .orderBy('entity.did', 'desc');

    if (params.cursor) {
      const { t, i } = decodeCursor(params.cursor);
      q = q.where((eb) =>
        eb.or([
          eb('entity.created_at', '<', new Date(t)),
          eb.and([
            eb('entity.created_at', '=', new Date(t)),
            eb('entity.did', '<', i),
          ]),
        ]),
      );
    }

    const rows = await q.limit(limit + 1).execute();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    const nextCursor =
      hasMore && items.length > 0
        ? encodeCursor(items[items.length - 1]!.createdAt, items[items.length - 1]!.did)
        : null;

    return {
      items: items.map((row) => ({
        did: row.did,
        handle: row.handle,
        displayName: row.displayName,
        // Mirror getExploreCooperatives: gate description by public_description.
        description: row.publicDescription ? row.description : null,
        cooperativeType: row.cooperativeType,
        memberCount: row.publicMembers ? row.memberCount : null,
        website: row.website,
        createdAt: row.createdAt,
      })),
      cursor: nextCursor,
    };
  }

  async searchPosts(
    query: string,
    viewerDid: string,
    params: PageParams,
  ): Promise<{ items: PostSearchRow[]; cursor: string | null }> {
    const trimmed = query.trim();
    if (!trimmed) return { items: [], cursor: null };

    const limit = params.limit ?? 50;

    // Scoped via thread_member, NOT cooperative membership. The thread_member
    // table is the authoritative read-access gate for posts (matches the
    // semantics of /api/v1/threads/:id/posts via PostService).
    let q = this.db
      .selectFrom('post')
      .innerJoin('thread', 'thread.id', 'post.thread_id')
      .innerJoin('thread_member', (join) =>
        join
          .onRef('thread_member.thread_id', '=', 'post.thread_id')
          .on('thread_member.entity_did', '=', viewerDid),
      )
      .innerJoin('entity', 'entity.did', 'thread.cooperative_did')
      .where('post.invalidated_at', 'is', null)
      // Status filter: !=' deleted' (NOT == 'active'). The post status enum is
      // ('active','edited','deleted') per migration 006_posts.ts. Excluding
      // 'edited' would silently drop edited posts.
      .where('post.status', '!=', 'deleted')
      .where('thread.invalidated_at', 'is', null)
      .where(sql<boolean>`post.post_search_tsv @@ websearch_to_tsquery('english', ${trimmed})`)
      .select([
        'post.id',
        'post.thread_id as threadId',
        'thread.cooperative_did as cooperativeDid',
        'entity.handle as cooperativeHandle',
        'entity.display_name as cooperativeDisplayName',
        'thread.title as threadTitle',
        'post.body',
        'post.author_did as authorDid',
        'post.created_at as createdAt',
      ])
      .orderBy('post.created_at', 'desc')
      .orderBy('post.id', 'desc');

    if (params.cursor) {
      const { t, i } = decodeCursor(params.cursor);
      q = q.where((eb) =>
        eb.or([
          eb('post.created_at', '<', new Date(t)),
          eb.and([
            eb('post.created_at', '=', new Date(t)),
            eb('post.id', '<', i),
          ]),
        ]),
      );
    }

    const rows = await q.limit(limit + 1).execute();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    const nextCursor =
      hasMore && items.length > 0
        ? encodeCursor(items[items.length - 1]!.createdAt, items[items.length - 1]!.id)
        : null;

    return {
      items: items.map((row) => ({
        id: row.id,
        threadId: row.threadId,
        cooperativeDid: row.cooperativeDid,
        cooperativeHandle: row.cooperativeHandle,
        cooperativeDisplayName: row.cooperativeDisplayName,
        threadTitle: row.threadTitle,
        body: row.body,
        authorDid: row.authorDid,
        createdAt: row.createdAt,
      })),
      cursor: nextCursor,
    };
  }

  /**
   * V8.8 — People search with D1 hybrid discoverability.
   *
   * Surfaces a person iff:
   *   - their profile.discoverable flag is true, OR
   *   - they have at least one stakeholder_interest record (i.e., they
   *     participate in alignment data — a soft opt-in by action).
   *
   * FTS is over BOTH entity.entity_search_tsv (display name / handle /
   * description, added in migration 059) AND profile.profile_bio_tsv
   * (bio text, added in migration 061). The OR across the two tsvectors
   * keeps the query simple and lets Postgres short-circuit on whichever
   * GIN index matches first.
   *
   * The viewer is always excluded from their own results.
   */
  async searchPeople(
    query: string,
    viewerDid: string,
    params: PageParams,
  ): Promise<{ items: PersonSearchRow[]; cursor: string | null }> {
    const trimmed = query.trim();
    if (!trimmed) return { items: [], cursor: null };

    const limit = params.limit ?? 50;

    let q = this.db
      .selectFrom('entity')
      .innerJoin('profile', (join) =>
        join
          .onRef('profile.entity_did', '=', 'entity.did')
          .on('profile.is_default', '=', true)
          .on('profile.invalidated_at', 'is', null),
      )
      .where('entity.type', '=', 'person')
      .where('entity.status', '=', 'active')
      .where('entity.invalidated_at', 'is', null)
      .where('entity.did', '!=', viewerDid)
      .where((eb) =>
        eb.or([
          eb('profile.discoverable', '=', true),
          eb.exists(
            eb
              .selectFrom('stakeholder_interest as si')
              .whereRef('si.did', '=', 'entity.did')
              .select('si.uri'),
          ),
        ]),
      )
      .where(
        sql<boolean>`(
          entity.entity_search_tsv @@ websearch_to_tsquery('english', ${trimmed})
          OR profile.profile_bio_tsv @@ websearch_to_tsquery('english', ${trimmed})
        )`,
      )
      .select([
        'entity.did',
        'entity.handle',
        'entity.display_name as displayName',
        'profile.bio',
        'profile.avatar_cid as avatarCid',
        'entity.created_at as createdAt',
        sql<number>`(
          SELECT COUNT(*)::int FROM membership m
          WHERE m.member_did = entity.did
            AND m.status = 'active'
            AND m.invalidated_at IS NULL
        )`.as('membershipCount'),
      ])
      .orderBy('entity.created_at', 'desc')
      .orderBy('entity.did', 'desc');

    if (params.cursor) {
      const { t, i } = decodeCursor(params.cursor);
      q = q.where((eb) =>
        eb.or([
          eb('entity.created_at', '<', new Date(t)),
          eb.and([
            eb('entity.created_at', '=', new Date(t)),
            eb('entity.did', '<', i),
          ]),
        ]),
      );
    }

    const rows = await q.limit(limit + 1).execute();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    const nextCursor =
      hasMore && items.length > 0
        ? encodeCursor(items[items.length - 1]!.createdAt, items[items.length - 1]!.did)
        : null;

    return {
      items: items.map((row) => ({
        did: row.did,
        handle: row.handle,
        displayName: row.displayName,
        bio: row.bio,
        avatarCid: row.avatarCid,
        membershipCount: row.membershipCount,
        createdAt: row.createdAt,
      })),
      cursor: nextCursor,
    };
  }

  /**
   * V8.8 — Alignment search over cooperatives.
   *
   * Combined signal from two sources:
   *   - outcome FTS: matches against `desired_outcome.outcome_search_tsv`,
   *     grouped by project_uri (used as the cooperative DID — see
   *     alignment-service.ts which treats project_uri as the coop's DID).
   *   - interest tag overlap: counts distinct interest categories
   *     (lowercased) that match the caller-supplied list, using
   *     `jsonb_array_elements` to expand the `interests` JSON array stored
   *     on `stakeholder_interest`.
   *
   * Either input alone is enough to seed results; both are OR-combined.
   * If neither is supplied (empty/whitespace `q` AND empty/null `interests`)
   * we return empty immediately — same short-circuit as searchCooperatives.
   *
   * Cooperatives surface only when `anon_discoverable = true`. This is
   * belt-and-braces: even though the route is auth-gated, alignment search
   * intentionally mirrors the anon-safe discoverability predicate so a
   * future unauth'd variant (if the product decides to expose it) requires
   * zero schema changes.
   *
   * Ordering: by (alignment_score DESC, did DESC). The cursor encoding
   * for this endpoint is `(alignmentScore, did)` — distinct from the
   * `(createdAt, did)` encoding used by recency-ordered searches. It's
   * best-effort: rows inserted or whose scores change between pages may
   * be missed or repeated at the boundary. Acceptable for a discovery UI.
   *
   * Cooperatives the viewer is already an active member of are excluded
   * from results — mirroring the noise-reduction in the matchmaking-service
   * coop path, since surfacing them on a discovery endpoint is ~always noise.
   */
  async searchAlignment(
    opts: { q?: string; interests?: string[]; limit?: number; cursor?: string },
    viewerDid: string,
  ): Promise<{ items: AlignmentSearchRow[]; cursor: string | null }> {
    const limit = opts.limit ?? 50;
    const q = opts.q?.trim();
    const interests = opts.interests
      ?.map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);

    const hasQ = !!(q && q.length > 0);
    const hasInterests = !!(interests && interests.length > 0);

    if (!hasQ && !hasInterests) {
      return { items: [], cursor: null };
    }

    // Best-effort relevance cursor: (alignmentScore, did). Encoded as
    // base64url JSON. Kept local to this method rather than polluting
    // the shared pagination helpers, which assume recency ordering.
    let cursorScore: number | null = null;
    let cursorDid: string | null = null;
    if (opts.cursor) {
      try {
        const decoded = JSON.parse(
          Buffer.from(opts.cursor, 'base64url').toString(),
        ) as { s: number; i: string };
        cursorScore = decoded.s;
        cursorDid = decoded.i;
      } catch {
        throw Object.assign(new Error('Invalid cursor'), { statusCode: 400 });
      }
    }

    // Raw SQL: two CTEs (outcome_matches, interest_matches) joined onto
    // entity + cooperative_profile. We parameterise hasQ / hasInterests
    // with literal SQL booleans so the CTE short-circuits cleanly when a
    // caller supplies only one signal.
    //
    // Parameter binding notes:
    //   - trimmed query is only referenced inside the outcome_matches CTE,
    //     guarded by `${hasQ}::boolean`. When hasQ is false the CTE is
    //     empty and the query text parameter is still bound but never
    //     evaluated — Postgres is fine with this.
    //   - `interests` is passed as a text[] via Kysely's sql.val, and
    //     compared with `= ANY(...)` against the lowercased category.
    //
    // `project_uri` is used as the cooperative DID (not parsed from an
    // AT-URI) to match the semantics in alignment-service.ts where records
    // are stored with project_uri set directly to the coop DID.
    const qText = hasQ ? q! : '';
    // When hasInterests is false, pass a one-element sentinel array rather
    // than an empty array. Kysely/pg serializers can be fussy about empty
    // arrays without an explicit type hint, and the CTE body is guarded by
    // `${hasInterests}::boolean = FALSE` anyway so the sentinel is never
    // compared. The explicit `::text[]` cast at the call site is retained
    // as belt-and-braces.
    const interestsArr: string[] = hasInterests ? interests! : [''];

    const result = await sql<{
      did: string;
      handle: string | null;
      display_name: string;
      cooperative_type: string;
      matched_outcomes: number;
      matched_interests: number;
      alignment_score: number;
      created_at: Date;
    }>`
      WITH outcome_matches AS (
        -- NOTE: alias 'dout' (not 'do') — 'do' is reserved in Postgres
        -- as the PL/pgSQL DO block keyword and causes a parse error.
        SELECT dout.project_uri AS coop_did,
               COUNT(*)::int AS matched_outcomes
        FROM desired_outcome dout
        WHERE ${hasQ}::boolean
          AND dout.outcome_search_tsv @@ websearch_to_tsquery('english', ${qText})
        GROUP BY dout.project_uri
      ),
      interest_matches AS (
        -- Note: this CTE does a sequential scan over stakeholder_interest. The
        -- jsonb_array_elements + lower() shape cannot use a jsonb_path_ops GIN
        -- index (which only supports @>), and storing pre-lowercased categories
        -- would require a schema change. Acceptable at V8.8 scale; revisit if
        -- stakeholder_interest grows past ~100K rows.
        SELECT si.project_uri AS coop_did,
               COUNT(DISTINCT lower(item->>'category'))::int AS matched_interests
        FROM stakeholder_interest si,
             jsonb_array_elements(si.interests) AS item
        WHERE ${hasInterests}::boolean
          AND lower(item->>'category') = ANY(${sql.val(interestsArr)}::text[])
        GROUP BY si.project_uri
      )
      SELECT
        e.did,
        e.handle,
        e.display_name,
        cp.cooperative_type,
        e.created_at,
        COALESCE(om.matched_outcomes, 0) AS matched_outcomes,
        COALESCE(im.matched_interests, 0) AS matched_interests,
        LEAST(
          1.0,
          COALESCE(om.matched_outcomes, 0) * 0.5
            + COALESCE(im.matched_interests, 0) * 0.2
        )::float8 AS alignment_score
      FROM entity e
      INNER JOIN cooperative_profile cp ON cp.entity_did = e.did
      LEFT JOIN outcome_matches  om ON om.coop_did = e.did
      LEFT JOIN interest_matches im ON im.coop_did = e.did
      WHERE e.type = 'cooperative'
        AND e.status = 'active'
        AND e.invalidated_at IS NULL
        AND cp.is_network = false
        AND cp.anon_discoverable = true
        AND (COALESCE(om.matched_outcomes, 0) > 0 OR COALESCE(im.matched_interests, 0) > 0)
        AND (
          ${cursorScore === null}::boolean
          OR LEAST(
            1.0,
            COALESCE(om.matched_outcomes, 0) * 0.5
              + COALESCE(im.matched_interests, 0) * 0.2
          ) < ${cursorScore ?? 0}::float8
          OR (
            LEAST(
              1.0,
              COALESCE(om.matched_outcomes, 0) * 0.5
                + COALESCE(im.matched_interests, 0) * 0.2
            ) = ${cursorScore ?? 0}::float8
            AND e.did < ${cursorDid ?? ''}
          )
        )
        AND e.did NOT IN (
          SELECT m.cooperative_did FROM membership m
          WHERE m.member_did = ${sql.val(viewerDid)}
            AND m.status = 'active'
            AND m.invalidated_at IS NULL
        )
      ORDER BY alignment_score DESC, e.did DESC
      LIMIT ${limit + 1}
    `.execute(this.db);

    const rows = result.rows;
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    const last = items[items.length - 1];
    const nextCursor =
      hasMore && last
        ? Buffer.from(
            JSON.stringify({ s: Number(last.alignment_score), i: last.did }),
          ).toString('base64url')
        : null;

    return {
      items: items.map((row) => ({
        did: row.did,
        handle: row.handle,
        displayName: row.display_name,
        cooperativeType: row.cooperative_type,
        matchedOutcomes: Number(row.matched_outcomes),
        matchedInterests: Number(row.matched_interests),
        alignmentScore: Number(row.alignment_score),
        createdAt: row.created_at,
      })),
      cursor: nextCursor,
    };
  }
}
