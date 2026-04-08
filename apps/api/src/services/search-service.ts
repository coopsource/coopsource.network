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
}
