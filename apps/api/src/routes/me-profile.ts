import { Router } from 'express';
import { ValidationError } from '@coopsource/common';
import type { Container } from '../container.js';
import { asyncHandler } from '../lib/async-handler.js';
import { requireAuth } from '../auth/middleware.js';

/**
 * V8.8 — Current user's profile routes.
 *
 * Both endpoints require an active membership via `requireAuth`. The web
 * settings page (V8.8 Task 10) handles the 401 path — a newly registered
 * user without an approved coop membership sees the usual gate.
 *
 * GET /api/v1/me/profile
 *   Returns the caller's default profile (display name, avatar, bio,
 *   verified, and the V8.8 `discoverable` flag). Used by the settings
 *   page to hydrate the initial toggle state.
 *
 * PATCH /api/v1/me/profile
 *   Currently only accepts `{ discoverable: boolean }`. A future revision
 *   can extend the payload with display_name/bio updates once the
 *   rate-limited rename flow lands (V8.X).
 *
 * Ownership: every operation targets `req.actor!.did`. There is no `:id`
 * param and the service method filters by `entity_did` — no cross-user
 * write path exists.
 */
export function createMeProfileRoutes(container: Container): Router {
  const router = Router();

  // GET /api/v1/me/profile
  router.get(
    '/api/v1/me/profile',
    requireAuth,
    asyncHandler(async (req, res) => {
      const profile = await container.profileService.getDefaultProfile(req.actor!.did);
      if (!profile) {
        // AuthService.register() creates a default profile for every
        // person, so this is effectively unreachable. Return an empty
        // shape rather than 404 so the settings page can still render.
        res.json({
          profile: null,
          discoverable: false,
          displayName: null,
          bio: null,
          avatarCid: null,
        });
        return;
      }

      res.json({
        profile: {
          id: profile.id,
          displayName: profile.displayName,
          avatarCid: profile.avatarCid,
          bio: profile.bio,
          verified: profile.verified,
          discoverable: profile.discoverable,
        },
        // Convenience top-level fields for the settings page.
        discoverable: profile.discoverable,
        displayName: profile.displayName,
        bio: profile.bio,
        avatarCid: profile.avatarCid,
      });
    }),
  );

  // PATCH /api/v1/me/profile
  router.patch(
    '/api/v1/me/profile',
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = (req.body ?? {}) as { discoverable?: unknown };
      if (typeof body.discoverable !== 'boolean') {
        throw new ValidationError('discoverable: boolean required');
      }

      await container.profileService.setDiscoverable(req.actor!.did, body.discoverable);
      res.json({ ok: true, discoverable: body.discoverable });
    }),
  );

  return router;
}
