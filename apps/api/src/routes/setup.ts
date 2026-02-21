import { Router } from 'express';
import type { DID } from '@coopsource/common';
import { ValidationError } from '@coopsource/common';
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

      const { coopName, coopDescription, adminEmail, adminPassword, adminDisplayName } =
        req.body as {
          coopName: string;
          coopDescription?: string;
          adminEmail: string;
          adminPassword: string;
          adminDisplayName: string;
        };

      if (!coopName || !adminEmail || !adminPassword || !adminDisplayName) {
        throw new ValidationError(
          'coopName, adminEmail, adminPassword, and adminDisplayName are required',
        );
      }

      const now = container.clock.now();

      // Create cooperative entity (DID via pdsService.createDid)
      const coopDidDoc = await container.pdsService.createDid({
        entityType: 'cooperative',
        pdsUrl: 'http://localhost:3001',
      });
      const coopDid = coopDidDoc.id;

      // Insert cooperative entity
      await container.db
        .insertInto('entity')
        .values({
          did: coopDid,
          type: 'cooperative',
          display_name: coopName,
          description: coopDescription ?? null,
          status: 'active',
          created_at: now,
          indexed_at: now,
        })
        .execute();

      // Insert cooperative_profile
      await container.db
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

      // Write org.cooperative PDS record
      await container.pdsService.createRecord({
        did: coopDid as DID,
        collection: 'network.coopsource.org.cooperative',
        record: {
          name: coopName,
          description: coopDescription,
          cooperativeType: 'worker',
          createdAt: now.toISOString(),
        },
      });

      // Create admin entity (person DID)
      const adminDidDoc = await container.pdsService.createDid({
        entityType: 'person',
        pdsUrl: 'http://localhost:3001',
      });
      const adminDid = adminDidDoc.id;

      // Insert admin entity
      await container.db
        .insertInto('entity')
        .values({
          did: adminDid,
          type: 'person',
          display_name: adminDisplayName,
          status: 'active',
          created_at: now,
          indexed_at: now,
        })
        .execute();

      // Create auth credential for admin
      const { hash } = await import('bcrypt');
      const secretHash = await hash(adminPassword, 12);
      await container.db
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
      const [membership] = await container.db
        .insertInto('membership')
        .values({
          member_did: adminDid,
          cooperative_did: coopDid,
          status: 'active',
          joined_at: now,
          created_at: now,
          indexed_at: now,
        })
        .returning('id')
        .execute();

      // Write org.membership PDS record (member's assertion)
      const memberRef = await container.pdsService.createRecord({
        did: adminDid as DID,
        collection: 'network.coopsource.org.membership',
        record: {
          cooperative: coopDid,
          createdAt: now.toISOString(),
        },
      });

      // Update membership with member record
      await container.db
        .updateTable('membership')
        .set({
          member_record_uri: memberRef.uri,
          member_record_cid: memberRef.cid,
        })
        .where('id', '=', membership!.id)
        .execute();

      // Write memberApproval PDS record (co-op's approval)
      const approvalRef = await container.pdsService.createRecord({
        did: coopDid as DID,
        collection: 'network.coopsource.org.memberApproval',
        record: {
          member: adminDid,
          roles: ['owner', 'admin'],
          createdAt: now.toISOString(),
        },
      });

      // Update membership with approval record
      await container.db
        .updateTable('membership')
        .set({
          approval_record_uri: approvalRef.uri,
          approval_record_cid: approvalRef.cid,
        })
        .where('id', '=', membership!.id)
        .execute();

      // Set roles
      await container.db
        .insertInto('membership_role')
        .values([
          {
            membership_id: membership!.id,
            role: 'owner',
            indexed_at: now,
          },
          {
            membership_id: membership!.id,
            role: 'admin',
            indexed_at: now,
          },
        ])
        .execute();

      // Set system_config
      await container.db
        .insertInto('system_config')
        .values({
          key: 'setup_complete',
          value: JSON.stringify(true),
        })
        .execute();

      await container.db
        .insertInto('system_config')
        .values({
          key: 'cooperative_did',
          value: JSON.stringify(coopDid),
        })
        .execute();

      markSetupComplete();

      // Set session
      req.session.did = adminDid;

      res.status(201).json({ coopDid, adminDid });
    }),
  );

  return router;
}
