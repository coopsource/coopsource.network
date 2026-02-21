import type { Kysely, Selectable } from 'kysely';
import type { Database, ThreadTable, PostTable } from '@coopsource/db';

type ThreadRow = Selectable<ThreadTable>;
type PostRow = Selectable<PostTable>;
import { NotFoundError, UnauthorizedError } from '@coopsource/common';
import type { IClock } from '@coopsource/federation';
import type { Page, PageParams } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';

export interface ThreadWithMembers {
  id: string;
  cooperativeDid: string;
  title: string | null;
  threadType: string;
  status: string;
  createdAt: Date;
  createdBy: string;
  members: string[];
}

export class PostService {
  constructor(
    private db: Kysely<Database>,
    private clock: IClock,
  ) {}

  async listThreads(
    cooperativeDid: string,
    params: PageParams,
  ): Promise<Page<ThreadRow>> {
    const limit = params.limit ?? 50;
    let query = this.db
      .selectFrom('thread')
      .where('cooperative_did', '=', cooperativeDid)
      .where('invalidated_at', 'is', null)
      .selectAll()
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1);

    if (params.cursor) {
      const { t, i } = decodeCursor(params.cursor);
      query = query.where((eb) =>
        eb.or([
          eb('created_at', '<', new Date(t)),
          eb.and([eb('created_at', '=', new Date(t)), eb('id', '<', i)]),
        ]),
      );
    }

    const rows = await query.execute();
    const slice = rows.slice(0, limit);

    const cursor =
      rows.length > limit
        ? encodeCursor(slice[slice.length - 1]!.created_at, slice[slice.length - 1]!.id)
        : undefined;

    return { items: slice, cursor };
  }

  async createThread(params: {
    cooperativeDid: string;
    createdByDid: string;
    title?: string;
    threadType?: string;
    memberDids?: string[];
  }): Promise<ThreadRow> {
    const now = this.clock.now();

    const [thread] = await this.db
      .insertInto('thread')
      .values({
        cooperative_did: params.cooperativeDid,
        title: params.title ?? null,
        thread_type: params.threadType ?? 'discussion',
        status: 'open',
        created_at: now,
        created_by: params.createdByDid,
      })
      .returningAll()
      .execute();

    // Add creator + specified members
    const memberDids = new Set([
      params.createdByDid,
      ...(params.memberDids ?? []),
    ]);

    for (const did of memberDids) {
      await this.db
        .insertInto('thread_member')
        .values({ thread_id: thread!.id, entity_did: did, joined_at: now })
        .execute();
    }

    return thread!;
  }

  async getThread(threadId: string): Promise<ThreadWithMembers | null> {
    const thread = await this.db
      .selectFrom('thread')
      .where('id', '=', threadId)
      .where('invalidated_at', 'is', null)
      .selectAll()
      .executeTakeFirst();

    if (!thread) return null;

    const members = await this.db
      .selectFrom('thread_member')
      .where('thread_id', '=', threadId)
      .select('entity_did')
      .execute();

    return {
      id: thread.id,
      cooperativeDid: thread.cooperative_did,
      title: thread.title,
      threadType: thread.thread_type,
      status: thread.status,
      createdAt: thread.created_at,
      createdBy: thread.created_by,
      members: members.map((m) => m.entity_did),
    };
  }

  async listPosts(
    threadId: string,
    params: PageParams,
  ): Promise<Page<PostRow>> {
    const limit = params.limit ?? 50;
    let query = this.db
      .selectFrom('post')
      .where('thread_id', '=', threadId)
      .where('invalidated_at', 'is', null)
      .selectAll()
      .orderBy('created_at', 'asc')
      .orderBy('id', 'asc')
      .limit(limit + 1);

    if (params.cursor) {
      const { t, i } = decodeCursor(params.cursor);
      query = query.where((eb) =>
        eb.or([
          eb('created_at', '>', new Date(t)),
          eb.and([eb('created_at', '=', new Date(t)), eb('id', '>', i)]),
        ]),
      );
    }

    const rows = await query.execute();
    const slice = rows.slice(0, limit);

    const cursor =
      rows.length > limit
        ? encodeCursor(slice[slice.length - 1]!.created_at, slice[slice.length - 1]!.id)
        : undefined;

    return { items: slice, cursor };
  }

  async createPost(params: {
    threadId: string;
    authorDid: string;
    body: string;
    parentPostId?: string;
  }): Promise<PostRow> {
    const now = this.clock.now();

    const [post] = await this.db
      .insertInto('post')
      .values({
        thread_id: params.threadId,
        author_did: params.authorDid,
        body: params.body,
        body_format: 'plain',
        parent_post_id: params.parentPostId ?? null,
        status: 'active',
        created_at: now,
      })
      .returningAll()
      .execute();

    return post!;
  }

  async updatePost(
    postId: string,
    authorDid: string,
    body: string,
  ): Promise<PostRow> {
    const existing = await this.db
      .selectFrom('post')
      .where('id', '=', postId)
      .where('invalidated_at', 'is', null)
      .select(['author_did'])
      .executeTakeFirst();

    if (!existing) throw new NotFoundError('Post not found');
    if (existing.author_did !== authorDid) {
      throw new UnauthorizedError('Only the author can edit a post');
    }

    const [updated] = await this.db
      .updateTable('post')
      .set({ body, edited_at: this.clock.now() })
      .where('id', '=', postId)
      .returningAll()
      .execute();

    return updated!;
  }

  async deletePost(
    postId: string,
    actorDid: string,
    actorRoles: string[],
  ): Promise<void> {
    const existing = await this.db
      .selectFrom('post')
      .where('id', '=', postId)
      .where('invalidated_at', 'is', null)
      .select(['author_did'])
      .executeTakeFirst();

    if (!existing) throw new NotFoundError('Post not found');

    const isAuthor = existing.author_did === actorDid;
    const isAdmin =
      actorRoles.includes('admin') || actorRoles.includes('owner');

    if (!isAuthor && !isAdmin) {
      throw new UnauthorizedError(
        'Only the author or an admin can delete a post',
      );
    }

    await this.db
      .updateTable('post')
      .set({
        invalidated_at: this.clock.now(),
        invalidated_by: actorDid,
      })
      .where('id', '=', postId)
      .execute();
  }
}
