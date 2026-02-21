import { Router } from 'express';
import multer from 'multer';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth, requireAdmin } from '../../auth/middleware.js';

const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB

export function createCooperativeRoutes(container: Container): Router {
  const router = Router();

  function formatCooperative(result: NonNullable<Awaited<ReturnType<typeof container.entityService.getCooperative>>>) {
    return {
      did: result.entity.did,
      handle: null,
      displayName: result.entity.display_name,
      description: result.entity.description,
      website: result.profile.website,
      status: result.entity.status,
      createdAt: null,
    };
  }

  // GET /api/v1/cooperative
  router.get(
    '/api/v1/cooperative',
    requireAuth,
    asyncHandler(async (_req, res) => {
      const result = await container.entityService.getCooperative();
      if (!result) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Cooperative not found' },
        });
        return;
      }
      res.json(formatCooperative(result));
    }),
  );

  // PUT /api/v1/cooperative
  router.put(
    '/api/v1/cooperative',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req, res) => {
      const { displayName, description, website } = req.body as {
        displayName?: string;
        description?: string;
        website?: string;
      };

      await container.entityService.updateCooperative(
        req.actor!.cooperativeDid,
        { displayName, description, website },
      );

      const updated = await container.entityService.getCooperative();
      res.json(updated ? formatCooperative(updated) : null);
    }),
  );

  // POST /api/v1/cooperative/avatar
  router.post(
    '/api/v1/cooperative/avatar',
    requireAuth,
    requireAdmin,
    upload.single('avatar'),
    asyncHandler(async (req, res) => {
      const file = req.file;
      if (!file) {
        res.status(400).json({
          error: { code: 'VALIDATION', message: 'No file provided' },
        });
        return;
      }

      const cid = await container.entityService.uploadAvatar(
        req.actor!.cooperativeDid,
        file.buffer,
        file.mimetype,
      );

      res.json({ cid, url: `/api/v1/blobs/${cid}` });
    }),
  );

  return router;
}
