import { Router } from 'express';
import type { Container } from '../container.js';
import { asyncHandler } from '../lib/async-handler.js';
import { requireAuth, requireSetup } from '../auth/middleware.js';
import { ValidationError, RegisterSchema, LoginSchema } from '@coopsource/common';

export function createAuthRoutes(container: Container): Router {
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
        ? JSON.parse(
            typeof coopConfig.value === 'string'
              ? coopConfig.value
              : JSON.stringify(coopConfig.value),
          )
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

  return router;
}
