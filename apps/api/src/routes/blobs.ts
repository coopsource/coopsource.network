import { Router } from 'express';
import { NotFoundError } from '@coopsource/common';
import type { Container } from '../container.js';
import { asyncHandler } from '../lib/async-handler.js';
import { requireAuth } from '../auth/middleware.js';

export function createBlobRoutes(container: Container): Router {
  const router = Router();

  // GET /api/v1/blobs/:cid
  router.get(
    '/api/v1/blobs/:cid',
    requireAuth,
    asyncHandler(async (req, res) => {
      const cid = String(req.params.cid);
      try {
        const blobData = await container.blobStore.get(cid);
        res.set('Content-Type', blobData.mimeType);
        res.set('Content-Length', String(blobData.size));
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
        res.send(blobData.data);
      } catch (err) {
        if (err instanceof NotFoundError) {
          res.status(404).json({
            error: { code: 'NOT_FOUND', message: 'Blob not found' },
          });
          return;
        }
        throw err;
      }
    }),
  );

  return router;
}
