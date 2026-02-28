import crypto from 'node:crypto';
import { Router } from 'express';
import type { Container } from '../container.js';
import { asyncHandler } from '../lib/async-handler.js';
import { requireAuth, requireSetup } from '../auth/middleware.js';
import { ValidationError, RegisterSchema, LoginSchema } from '@coopsource/common';
import type { NodeOAuthClient } from '@atproto/oauth-client-node';

export interface AuthRoutesOptions {
  oauthClient?: NodeOAuthClient;
  frontendUrl: string;
}

export function createAuthRoutes(
  container: Container,
  options: AuthRoutesOptions,
): Router {
  const { oauthClient, frontendUrl } = options;
  const router = Router();

  // POST /api/v1/auth/register
  router.post(
    '/api/v1/auth/register',
    requireSetup,
    asyncHandler(async (req, res) => {
      const { email, password, displayName, invitationToken } =
        RegisterSchema.parse(req.body);

      // Get cooperative DID from system config
      const coopConfig = await container.db
        .selectFrom('system_config')
        .where('key', '=', 'cooperative_did')
        .select('value')
        .executeTakeFirst();

      const cooperativeDid = coopConfig
        ? String(coopConfig.value)
        : null;

      if (!cooperativeDid) {
        throw new ValidationError('Instance not set up');
      }

      const result = await container.authService.register({
        email,
        password,
        displayName,
        cooperativeDid,
        invitationToken,
      });

      req.session.did = result.did;
      res.status(201).json(result);
    }),
  );

  async function buildMeResponse(did: string, actor: {
    did: string;
    displayName: string;
    roles: string[];
    cooperativeDid: string;
    membershipId: string;
  }) {
    // Fetch email from auth_credential
    const cred = await container.db
      .selectFrom('auth_credential')
      .where('entity_did', '=', did)
      .where('credential_type', '=', 'password')
      .where('invalidated_at', 'is', null)
      .select(['identifier'])
      .executeTakeFirst();

    // Fetch handle from entity
    const entity = await container.db
      .selectFrom('entity')
      .where('did', '=', did)
      .select(['handle'])
      .executeTakeFirst();

    return {
      did: actor.did,
      handle: entity?.handle ?? null,
      displayName: actor.displayName,
      email: cred?.identifier ?? null,
      roles: actor.roles,
      cooperativeDid: actor.cooperativeDid,
      membershipId: actor.membershipId,
    };
  }

  // POST /api/v1/auth/login
  router.post(
    '/api/v1/auth/login',
    asyncHandler(async (req, res) => {
      const { email, password } = LoginSchema.parse(req.body);

      const result = await container.authService.login(email, password);
      req.session.did = result.did;

      // Fetch full actor context for the response
      const actor = await container.authService.getSessionActor(result.did);
      if (!actor) {
        res.json({ did: result.did, handle: null, displayName: result.displayName, email, roles: [], cooperativeDid: null, membershipId: null });
        return;
      }

      res.json(await buildMeResponse(result.did, actor));
    }),
  );

  // DELETE /api/v1/auth/session
  router.delete(
    '/api/v1/auth/session',
    requireAuth,
    (_req, res) => {
      _req.session.destroy(() => {});
      res.status(204).send();
    },
  );

  // GET /api/v1/auth/me
  router.get(
    '/api/v1/auth/me',
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json(await buildMeResponse(req.actor!.did, req.actor!));
    }),
  );

  // GET /api/v1/me/memberships — list all cooperatives/networks user belongs to
  router.get(
    '/api/v1/me/memberships',
    requireAuth,
    asyncHandler(async (req, res) => {
      const rows = await container.db
        .selectFrom('membership')
        .innerJoin('entity', 'entity.did', 'membership.cooperative_did')
        .innerJoin('cooperative_profile', 'cooperative_profile.entity_did', 'entity.did')
        .where('membership.member_did', '=', req.session.did!)
        .where('membership.status', '=', 'active')
        .where('membership.invalidated_at', 'is', null)
        .select([
          'entity.did',
          'entity.handle',
          'entity.display_name',
          'entity.description',
          'cooperative_profile.is_network',
          'cooperative_profile.website',
          'membership.joined_at',
        ])
        .execute();

      const cooperatives = rows
        .filter((r) => !r.is_network)
        .map((r) => ({
          did: r.did,
          handle: r.handle,
          displayName: r.display_name,
          description: r.description,
          website: r.website,
          isNetwork: false,
          status: 'active',
          createdAt: r.joined_at ? r.joined_at.toISOString() : null,
        }));

      const networks = rows
        .filter((r) => r.is_network)
        .map((r) => ({
          did: r.did,
          handle: r.handle,
          displayName: r.display_name,
          description: r.description,
          website: r.website,
          isNetwork: true,
          status: 'active',
          createdAt: r.joined_at ? r.joined_at.toISOString() : null,
        }));

      res.json({ cooperatives, networks });
    }),
  );

  // ─── ATProto OAuth Routes (Stage 2) ─────────────────────────────────────

  if (oauthClient) {
    // GET /api/v1/auth/oauth/client-metadata.json — Serve client metadata
    router.get(
      '/api/v1/auth/oauth/client-metadata.json',
      (_req, res) => {
        res.json(oauthClient.clientMetadata);
      },
    );

    // POST /api/v1/auth/oauth/login — Initiate OAuth flow
    router.post(
      '/api/v1/auth/oauth/login',
      asyncHandler(async (req, res) => {
        const { handle } = req.body as { handle?: string };
        if (!handle || typeof handle !== 'string') {
          res.status(400).json({ error: 'handle is required' });
          return;
        }

        const url = await oauthClient.authorize(handle, {
          scope: 'atproto transition:generic',
        });

        res.json({ redirectUrl: url.toString() });
      }),
    );

    // GET /api/v1/auth/oauth/callback — Handle OAuth callback
    // After OAuth success, generates a one-time token and redirects to frontend.
    // The frontend exchanges the token via POST /api/v1/auth/oauth/exchange.
    router.get(
      '/api/v1/auth/oauth/callback',
      asyncHandler(async (req, res) => {
        const params = new URLSearchParams(
          req.url.split('?')[1] ?? '',
        );

        const { session: oauthSession } = await oauthClient.callback(params);
        const did = oauthSession.did;

        // Check if this DID already has an entity in our system
        const existingEntity = await container.db
          .selectFrom('entity')
          .where('did', '=', did)
          .select(['did', 'display_name'])
          .executeTakeFirst();

        if (!existingEntity) {
          // New user — create entity from ATProto profile
          const now = new Date();
          await container.db
            .insertInto('entity')
            .values({
              did,
              type: 'person',
              handle: did,
              display_name: did,
              status: 'active',
              created_at: now,
              indexed_at: now,
            })
            .execute();
        }

        // Generate a one-time token for the frontend to exchange
        const token = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 60 * 1000); // 60 seconds

        await container.db
          .insertInto('oauth_state')
          .values({
            key: `exchange:${token}`,
            state: JSON.stringify({ did }),
            expires_at: expiresAt,
            created_at: new Date(),
          })
          .execute();

        // Redirect to frontend, which will exchange the token server-side
        res.redirect(
          `${frontendUrl}/auth/oauth/complete?token=${encodeURIComponent(token)}`,
        );
      }),
    );

    // POST /api/v1/auth/oauth/exchange — Exchange one-time token for session
    router.post(
      '/api/v1/auth/oauth/exchange',
      asyncHandler(async (req, res) => {
        const { token } = req.body as { token?: string };
        if (!token || typeof token !== 'string') {
          res.status(400).json({ error: 'token is required' });
          return;
        }

        const key = `exchange:${token}`;
        const row = await container.db
          .selectFrom('oauth_state')
          .where('key', '=', key)
          .where('expires_at', '>', new Date())
          .select(['state'])
          .executeTakeFirst();

        if (!row) {
          res.status(401).json({ error: 'Invalid or expired token' });
          return;
        }

        // Delete the one-time token immediately
        await container.db
          .deleteFrom('oauth_state')
          .where('key', '=', key)
          .execute();

        const { did } = typeof row.state === 'string'
          ? JSON.parse(row.state) as { did: string }
          : row.state as unknown as { did: string };

        // Set session
        req.session.did = did;

        // Return user info (same format as login endpoint)
        const actor = await container.authService.getSessionActor(did);
        if (!actor) {
          res.json({
            did,
            handle: null,
            displayName: did,
            email: null,
            roles: [],
            cooperativeDid: null,
            membershipId: null,
          });
          return;
        }

        res.json(await buildMeResponse(did, actor));
      }),
    );
  }

  return router;
}
