import { Router } from 'express';
import type { Container } from '../container.js';
import { asyncHandler } from '../lib/async-handler.js';
import { requireAuth } from '../auth/middleware.js';
import { parsePagination } from '../lib/pagination.js';
import { UnauthorizedError, NotFoundError, ValidationError } from '@coopsource/common';

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
      res.json(result);
    }),
  );

  // POST /api/v1/threads
  router.post(
    '/api/v1/threads',
    requireAuth,
    asyncHandler(async (req, res) => {
      const { title, threadType, memberDids } = req.body as {
        title?: string;
        threadType?: string;
        memberDids?: string[];
      };

      const thread = await container.postService.createThread({
        cooperativeDid: req.actor!.cooperativeDid,
        createdByDid: req.actor!.did,
        title,
        threadType,
        memberDids,
      });

      res.status(201).json(thread);
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

      res.json(thread);
    }),
  );

  // POST /api/v1/threads/:id/posts
  router.post(
    '/api/v1/threads/:id/posts',
    requireAuth,
    asyncHandler(async (req, res) => {
      const thread = await container.postService.getThread((req.params.id as string));
      if (!thread) throw new NotFoundError('Thread not found');
      if (!thread.members.includes(req.actor!.did)) {
        throw new UnauthorizedError('Not a member of this thread');
      }

      const { body, parentPostId } = req.body as {
        body?: string;
        parentPostId?: string;
      };

      if (!body) {
        throw new ValidationError('body is required');
      }

      const post = await container.postService.createPost({
        threadId: (req.params.id as string),
        authorDid: req.actor!.did,
        body,
        parentPostId,
      });

      res.status(201).json(post);
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
      res.json(result);
    }),
  );

  // PUT /api/v1/posts/:id
  router.put(
    '/api/v1/posts/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const { body } = req.body as { body?: string };
      if (!body) throw new ValidationError('body is required');

      const post = await container.postService.updatePost(
        (req.params.id as string),
        req.actor!.did,
        body,
      );
      res.json(post);
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
