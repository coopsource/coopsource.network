import { Router } from 'express';
import type { Container } from '../container.js';
import { asyncHandler } from '../lib/async-handler.js';
import { requireAuth } from '../auth/middleware.js';
import { requirePermission } from '../middleware/permissions.js';
import { parsePagination } from '../lib/pagination.js';
import { formatThread, formatPost } from '../lib/formatters.js';
import {
  UnauthorizedError,
  NotFoundError,
  ValidationError,
  CreateThreadSchema,
  CreatePostSchema,
  UpdatePostSchema,
} from '@coopsource/common';

export function createPostRoutes(container: Container): Router {
  const router = Router();

  // GET /api/v1/threads
  router.get(
    '/api/v1/threads',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const result = await container.postService.listThreads(
        req.actor!.cooperativeDid,
        params,
      );

      // Batch-load member counts to avoid N+1 queries
      const threadIds = result.items.map((t) => t.id);
      const memberCounts = threadIds.length > 0
        ? await container.db
            .selectFrom('thread_member')
            .where('thread_id', 'in', threadIds)
            .groupBy('thread_id')
            .select(['thread_id', container.db.fn.countAll<number>().as('count')])
            .execute()
        : [];
      const countMap = new Map(memberCounts.map((c) => [c.thread_id, Number(c.count)]));

      const threads = result.items.map((row) =>
        formatThread(row, countMap.get(row.id) ?? 0),
      );

      res.json({ threads, cursor: result.cursor });
    }),
  );

  // POST /api/v1/threads
  router.post(
    '/api/v1/threads',
    requireAuth,
    requirePermission('post.create'),
    asyncHandler(async (req, res) => {
      const { title, threadType, memberDids } = CreateThreadSchema.parse(req.body);

      const thread = await container.postService.createThread({
        cooperativeDid: req.actor!.cooperativeDid,
        createdByDid: req.actor!.did,
        title,
        threadType,
        memberDids,
      });

      // Count members (creator + specified members)
      const memberCount = new Set([
        req.actor!.did,
        ...(memberDids ?? []),
      ]).size;

      res.status(201).json(formatThread(thread, memberCount));
    }),
  );

  // GET /api/v1/threads/:id
  router.get(
    '/api/v1/threads/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const thread = await container.postService.getThread((req.params.id as string));
      if (!thread) {
        throw new NotFoundError('Thread not found');
      }

      // Check membership in thread
      if (!thread.members.includes(req.actor!.did)) {
        throw new UnauthorizedError('Not a member of this thread');
      }

      res.json({ ...thread, memberCount: thread.members.length });
    }),
  );

  // POST /api/v1/threads/:id/posts
  router.post(
    '/api/v1/threads/:id/posts',
    requireAuth,
    requirePermission('post.create'),
    asyncHandler(async (req, res) => {
      const thread = await container.postService.getThread((req.params.id as string));
      if (!thread) throw new NotFoundError('Thread not found');
      if (!thread.members.includes(req.actor!.did)) {
        throw new UnauthorizedError('Not a member of this thread');
      }

      const { body, parentPostId } = CreatePostSchema.parse(req.body);

      const post = await container.postService.createPost({
        threadId: (req.params.id as string),
        authorDid: req.actor!.did,
        body,
        parentPostId,
      });

      res.status(201).json(formatPost(post));
    }),
  );

  // GET /api/v1/threads/:id/posts
  router.get(
    '/api/v1/threads/:id/posts',
    requireAuth,
    asyncHandler(async (req, res) => {
      const thread = await container.postService.getThread((req.params.id as string));
      if (!thread) throw new NotFoundError('Thread not found');
      if (!thread.members.includes(req.actor!.did)) {
        throw new UnauthorizedError('Not a member of this thread');
      }

      const params = parsePagination(req.query as Record<string, unknown>);
      const result = await container.postService.listPosts(
        (req.params.id as string),
        params,
      );
      res.json({ posts: result.items.map(formatPost), cursor: result.cursor });
    }),
  );

  // PUT /api/v1/posts/:id
  router.put(
    '/api/v1/posts/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const { body } = UpdatePostSchema.parse(req.body);

      const post = await container.postService.updatePost(
        (req.params.id as string),
        req.actor!.did,
        body,
      );
      res.json(formatPost(post));
    }),
  );

  // DELETE /api/v1/posts/:id
  router.delete(
    '/api/v1/posts/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      await container.postService.deletePost(
        (req.params.id as string),
        req.actor!.did,
        req.actor!.roles,
      );
      res.status(204).send();
    }),
  );

  return router;
}
