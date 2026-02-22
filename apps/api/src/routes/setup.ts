import { Router } from 'express';
import type { DID } from '@coopsource/common';
import { ValidationError, SetupInitializeSchema } from '@coopsource/common';
import type { Container } from '../container.js';
import { asyncHandler } from '../lib/async-handler.js';
import {
  checkSetupComplete,
  markSetupComplete,
} from '../auth/middleware.js';

export function createSetupRoutes(container: Container): Router {
  const router = Router();

  // GET /api/v1/setup/status
  router.get(
    '/api/v1/setup/status',
    asyncHandler(async (_req, res) => {
      const setupComplete = await checkSetupComplete(container.db);
      res.json({ setupComplete });
    }),
  );

  // POST /api/v1/setup/initialize
  router.post(
    '/api/v1/setup/initialize',
    asyncHandler(async (req, res) => {
      const setupComplete = await checkSetupComplete(container.db);
      if (setupComplete) {
        throw new ValidationError('Setup already complete');
      }

      const { cooperativeName, cooperativeHandle, adminDisplayName, adminHandle, adminEmail, adminPassword } =
        SetupInitializeSchema.parse(req.body);

      const now = container.clock.now();
      const { hash } = await import('bcrypt');
      const secretHash = await hash(adminPassword, 12);

      // Create DIDs outside the transaction (PDS operations are not DB-transactional)
      const coopDidDoc = await container.pdsService.createDid({
        entityType: 'cooperative',
        pdsUrl: process.env.INSTANCE_URL ?? 'http://localhost:3001',
      });
      const coopDid = coopDidDoc.id;

      const adminDidDoc = await container.pdsService.createDid({
        entityType: 'person',
        pdsUrl: process.env.INSTANCE_URL ?? 'http://localhost:3001',
      });
      const adminDid = adminDidDoc.id;

      // Write PDS records outside the transaction
      await container.pdsService.createRecord({
        did: coopDid as DID,
        collection: 'network.coopsource.org.cooperative',
        record: {
          name: cooperativeName,
          description: undefined,
          cooperativeType: 'worker',
          createdAt: now.toISOString(),
        },
      });

      const memberRef = await container.pdsService.createRecord({
        did: adminDid as DID,
        collection: 'network.coopsource.org.membership',
        record: {
          cooperative: coopDid,
          createdAt: now.toISOString(),
        },
      });

      const approvalRef = await container.pdsService.createRecord({
        did: coopDid as DID,
        collection: 'network.coopsource.org.memberApproval',
        record: {
          member: adminDid,
          roles: ['owner', 'admin'],
          createdAt: now.toISOString(),
        },
      });

      // All DB writes wrapped in a transaction
      await container.db.transaction().execute(async (trx) => {
        // Insert cooperative entity
        await trx
          .insertInto('entity')
          .values({
            did: coopDid,
            type: 'cooperative',
            display_name: cooperativeName,
            handle: cooperativeHandle ?? null,
            description: null,
            status: 'active',
            created_at: now,
            indexed_at: now,
          })
          .execute();

        // Insert cooperative_profile
        await trx
          .insertInto('cooperative_profile')
          .values({
            entity_did: coopDid,
            cooperative_type: 'worker',
            is_network: false,
            membership_policy: 'invite_only',
            created_at: now,
            indexed_at: now,
          })
          .execute();

        // Insert admin entity
        await trx
          .insertInto('entity')
          .values({
            did: adminDid,
            type: 'person',
            display_name: adminDisplayName,
            handle: adminHandle ?? null,
            status: 'active',
            created_at: now,
            indexed_at: now,
          })
          .execute();

        // Create auth credential for admin
        await trx
          .insertInto('auth_credential')
          .values({
            entity_did: adminDid,
            credential_type: 'password',
            identifier: adminEmail,
            secret_hash: secretHash,
            created_at: now,
          })
          .execute();

        // Create membership (admin is owner)
        const [membership] = await trx
          .insertInto('membership')
          .values({
            member_did: adminDid,
            cooperative_did: coopDid,
            status: 'active',
            joined_at: now,
            member_record_uri: memberRef.uri,
            member_record_cid: memberRef.cid,
            approval_record_uri: approvalRef.uri,
            approval_record_cid: approvalRef.cid,
            created_at: now,
            indexed_at: now,
          })
          .returning('id')
          .execute();

        // Set roles
        await trx
          .insertInto('membership_role')
          .values([
            { membership_id: membership!.id, role: 'owner', indexed_at: now },
            { membership_id: membership!.id, role: 'admin', indexed_at: now },
          ])
          .execute();

        // Set system_config
        await trx
          .insertInto('system_config')
          .values({ key: 'setup_complete', value: JSON.stringify(true) })
          .execute();

        await trx
          .insertInto('system_config')
          .values({ key: 'cooperative_did', value: JSON.stringify(coopDid) })
          .execute();
      });

      markSetupComplete();

      // Set session
      req.session.did = adminDid;

      res.status(201).json({ coopDid, adminDid });
    }),
  );

  return router;
}
