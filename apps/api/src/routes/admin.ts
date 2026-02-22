import { Router } from 'express';
import { sql } from 'kysely';
import type { Container } from '../container.js';
import { asyncHandler } from '../lib/async-handler.js';
import { requireAuth, requireAdmin, resetSetupCache } from '../auth/middleware.js';

export function createAdminRoutes(container: Container): Router {
  const router = Router();

  // GET /api/v1/admin/pds/status
  router.get(
    '/api/v1/admin/pds/status',
    requireAuth,
    requireAdmin,
    asyncHandler(async (_req, res) => {
      const commitCount = await container.db
        .selectFrom('pds_commit')
        .select((eb) => [eb.fn.countAll<number>().as('count')])
        .executeTakeFirst();

      const lastCommit = await container.db
        .selectFrom('pds_commit')
        .select('global_seq')
        .orderBy('global_seq', 'desc')
        .limit(1)
        .executeTakeFirst();

      res.json({
        totalCommits: commitCount?.count ?? 0,
        lastSeq: lastCommit?.global_seq ?? 0,
      });
    }),
  );

  // POST /api/v1/admin/pds/reindex/:did
  router.post(
    '/api/v1/admin/pds/reindex/:did',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req, res) => {
      // TODO: Implement reindex
      res.json({
        message: `TODO: reindex ${req.params.did}`,
      });
    }),
  );

  // GET /api/v1/admin/activity
  router.get(
    '/api/v1/admin/activity',
    requireAuth,
    requireAdmin,
    asyncHandler(async (_req, res) => {
      const entries = await container.db
        .selectFrom('fact_log')
        .selectAll()
        .orderBy('changed_at', 'desc')
        .limit(50)
        .execute();

      res.json({ items: entries });
    }),
  );

  // POST /api/v1/admin/test-reset — truncate all tables (non-production only)
  if (process.env.NODE_ENV !== 'production') {
    router.post(
      '/api/v1/admin/test-reset',
      asyncHandler(async (_req, res) => {
        await sql`
          TRUNCATE TABLE
            agreement_signature, agreement_party, agreement,
            vote, proposal,
            post, thread_member, thread,
            membership_role, membership, invitation,
            pds_commit, pds_record, pds_firehose_cursor, plc_operation,
            auth_credential, entity_key, session,
            cooperative_profile, entity,
            fact_log_redaction, fact_log,
            data_deletion_request, system_config
          CASCADE
        `.execute(container.db);
        resetSetupCache();
        res.json({ ok: true });
      }),
    );
  }

  return router;
}
