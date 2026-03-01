import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { requirePermission } from '../../middleware/permissions.js';
import { NotFoundError } from '@coopsource/common';

const CreateTokenSchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.string().min(1).max(50)).default(['read']),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

export function createApiTokenRoutes(container: Container): Router {
  const router = Router();

  // GET /api/v1/api-tokens — list tokens for the authenticated user
  router.get(
    '/api/v1/api-tokens',
    requireAuth,
    requirePermission('agent.use'),
    asyncHandler(async (req, res) => {
      const tokens = await container.db
        .selectFrom('api_token')
        .where('cooperative_did', '=', req.actor!.cooperativeDid)
        .where('user_did', '=', req.actor!.did)
        .select(['id', 'name', 'scopes', 'last_used_at', 'expires_at', 'created_at'])
        .orderBy('created_at', 'desc')
        .execute();

      res.json({
        tokens: tokens.map((t) => ({
          id: t.id,
          name: t.name,
          scopes: t.scopes,
          lastUsedAt: t.last_used_at,
          expiresAt: t.expires_at,
          createdAt: t.created_at instanceof Date ? t.created_at.toISOString() : t.created_at,
        })),
      });
    }),
  );

  // POST /api/v1/api-tokens — create a new token
  router.post(
    '/api/v1/api-tokens',
    requireAuth,
    requirePermission('agent.use'),
    asyncHandler(async (req, res) => {
      const data = CreateTokenSchema.parse(req.body);

      // Generate a random token
      const rawToken = `csk_${crypto.randomBytes(32).toString('hex')}`;
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      const expiresAt = data.expiresInDays
        ? new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000)
        : null;

      const [row] = await container.db
        .insertInto('api_token')
        .values({
          cooperative_did: req.actor!.cooperativeDid,
          user_did: req.actor!.did,
          name: data.name,
          token_hash: tokenHash,
          scopes: JSON.stringify(data.scopes),
          expires_at: expiresAt,
        })
        .returning(['id', 'name', 'scopes', 'expires_at', 'created_at'])
        .execute();

      // Return the raw token ONLY on creation
      res.status(201).json({
        id: row!.id,
        name: row!.name,
        token: rawToken,
        scopes: row!.scopes,
        expiresAt: row!.expires_at,
        createdAt: row!.created_at instanceof Date ? row!.created_at.toISOString() : row!.created_at,
      });
    }),
  );

  // DELETE /api/v1/api-tokens/:id — revoke a token
  router.delete(
    '/api/v1/api-tokens/:id',
    requireAuth,
    requirePermission('agent.use'),
    asyncHandler(async (req, res) => {
      const result = await container.db
        .deleteFrom('api_token')
        .where('id', '=', String(req.params.id))
        .where('user_did', '=', req.actor!.did)
        .executeTakeFirst();

      if (Number(result.numDeletedRows) === 0) {
        throw new NotFoundError('Token not found');
      }

      res.status(204).end();
    }),
  );

  return router;
}
