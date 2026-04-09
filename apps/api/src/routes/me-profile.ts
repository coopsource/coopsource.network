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
 *   Returns `{ profile: { id, displayName, avatarCid, bio, verified,
 *   discoverable } | null }`. The nested shape mirrors V8.7's
 *   me-matches.ts convention. Used by the settings page to hydrate the
 *   initial toggle state via `data.profile?.discoverable`.
 *
 * PATCH /api/v1/me/profile
 *   Accepts `{ discoverable?: boolean; dismissedGetStarted?: boolean }`.
 *   At least one field must be present. Each field that's present triggers
 *   an independent UPDATE on the profile row. A future revision can extend
 *   the payload with display_name/bio updates once the rate-limited rename
 *   flow lands (V8.X).
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
        // person, so this is effectively unreachable. Return a nulled
        // nested shape rather than 404 so the settings page can still
        // render and treat `data.profile?.discoverable` as undefined.
        res.json({ profile: null });
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
          dismissedGetStarted: profile.dismissedGetStarted,
        },
      });
    }),
  );

  // PATCH /api/v1/me/profile
  router.patch(
    '/api/v1/me/profile',
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = (req.body ?? {}) as {
        discoverable?: unknown;
        dismissedGetStarted?: unknown;
      };
      const hasDiscoverable = typeof body.discoverable === 'boolean';
      const hasDismissed = typeof body.dismissedGetStarted === 'boolean';
      if (!hasDiscoverable && !hasDismissed) {
        throw new ValidationError(
          'at least one of discoverable, dismissedGetStarted required',
        );
      }

      if (hasDiscoverable) {
        await container.profileService.setDiscoverable(
          req.actor!.did,
          body.discoverable as boolean,
        );
      }
      if (hasDismissed) {
        await container.profileService.setDismissedGetStarted(
          req.actor!.did,
          body.dismissedGetStarted as boolean,
        );
      }

      res.json({
        ok: true,
        ...(hasDiscoverable && { discoverable: body.discoverable }),
        ...(hasDismissed && { dismissedGetStarted: body.dismissedGetStarted }),
      });
    }),
  );

  return router;
}
