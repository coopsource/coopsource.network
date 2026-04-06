import { Router } from 'express';
import { sql } from 'kysely';
import type { Container } from '../container.js';
import { asyncHandler } from '../lib/async-handler.js';
import { requireAuth, requireAdmin, resetSetupCache } from '../auth/middleware.js';
import { getFirehoseHealth } from '../appview/loop.js';
import { listDeadLetters, resolveDeadLetter } from '../appview/hooks/dead-letter.js';
import { processFirehoseEvent } from '../appview/hooks/pipeline.js';
import type { FirehoseEvent } from '@coopsource/federation';
import type { DID, AtUri, CID } from '@coopsource/common';

export function createAdminRoutes(container: Container): Router {
  const router = Router();

  // GET /api/v1/admin/pds/status
  router.get(
    '/api/v1/admin/pds/status',
    requireAuth,
    requireAdmin,
    asyncHandler(async (_req, res) => {
      const recordCount = await container.db
        .selectFrom('pds_record')
        .where('deleted_at', 'is', null)
        .select((eb) => [eb.fn.countAll<number>().as('count')])
        .executeTakeFirst();

      const lastRecord = await container.db
        .selectFrom('pds_record')
        .select('indexed_at')
        .orderBy('indexed_at', 'desc')
        .limit(1)
        .executeTakeFirst();

      res.json({
        totalRecords: recordCount?.count ?? 0,
        lastIndexedAt: lastRecord?.indexed_at ?? null,
      });
    }),
  );

  // POST /api/v1/admin/pds/reindex/:did — replay pds_record through post-storage hooks
  router.post(
    '/api/v1/admin/pds/reindex/:did',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req, res) => {
      const did = req.params.did;

      const records = await container.db
        .selectFrom('pds_record')
        .where('did', '=', did)
        .where('deleted_at', 'is', null)
        .selectAll()
        .execute();

      let processed = 0;
      let errors = 0;

      for (const record of records) {
        const event: FirehoseEvent = {
          seq: 0,
          did: record.did as DID,
          operation: 'create',
          uri: record.uri as AtUri,
          cid: record.cid as CID,
          record: record.content as Record<string, unknown>,
          time: new Date().toISOString(),
        };

        try {
          await processFirehoseEvent(container.db, container.hookRegistry, event);
          processed++;
        } catch {
          errors++;
        }
      }

      res.json({ ok: true, did, processed, errors, total: records.length });
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
  // No auth required: endpoint only exists when NODE_ENV !== 'production'
  if (process.env.NODE_ENV !== 'production') {
    router.post(
      '/api/v1/admin/test-reset',
      asyncHandler(async (_req, res) => {
        await sql`
          TRUNCATE TABLE
            connection_binding, external_connection,
            agreement_template,
            stakeholder_terms, agreement_revision, agreement_signature, agreement,
            interest_map, desired_outcome, stakeholder_interest,
            funding_pledge, funding_campaign,
            vote, proposal,
            post, thread_member, thread,
            membership_role, membership, invitation,
            pds_record, pds_firehose_cursor,
            auth_credential, entity_key, session,
            cooperative_profile, entity,
            fact_log_redaction, fact_log,
            data_deletion_request, system_config,
            role_definition, signature_request,
            payment_provider_config, model_provider_config,
            agent_config, agent_session, agent_message, agent_usage, agent_trigger,
            api_token, trigger_execution_log, notification,
            legal_document, meeting_record, admin_officer,
            compliance_item, member_notice, fiscal_period,
            private_record, operator_audit_log,
            governance_label,
            calendar_event_ref, frontpage_post_ref,
            patronage_config, patronage_record,
            capital_account, capital_account_transaction, tax_form_1099_patr,
            onboarding_config, onboarding_progress, onboarding_review,
            member_class, cooperative_link,
            delegation,
            task, task_label, task_checklist_item,
            time_entry, schedule_shift,
            expense_category, expense, revenue_entry,
            commerce_listing, commerce_need,
            intercoop_agreement,
            collaborative_project, collaborative_contribution,
            shared_resource, resource_booking,
            procurement_group, procurement_demand,
            connector_config, connector_sync_log, connector_field_mapping,
            webhook_endpoint, webhook_delivery_log,
            report_template, report_snapshot,
            notification_preference, mention,
            hook_dead_letter,
            script_execution_log, cooperative_script
          CASCADE
        `.execute(container.db);
        resetSetupCache();
        res.json({ ok: true });
      }),
    );
  }

  // POST /api/v1/admin/reindex — reset firehose cursor to trigger a full re-index
  router.post(
    '/api/v1/admin/reindex',
    requireAuth,
    requireAdmin,
    asyncHandler(async (_req, res) => {
      // Reset all firehose cursors to 0 so the AppView loop replays from the beginning
      const result = await container.db
        .updateTable('pds_firehose_cursor')
        .set({
          last_global_seq: 0,
          updated_at: new Date(),
        })
        .execute();

      res.json({
        ok: true,
        message: 'Firehose cursors reset. Restart the server to begin re-indexing.',
        cursorsReset: result.length,
      });
    }),
  );

  // ─── Hook pipeline introspection ────────────────────────────────────────

  // GET /api/v1/admin/hooks — list all registered hooks
  router.get(
    '/api/v1/admin/hooks',
    requireAuth,
    requireAdmin,
    asyncHandler(async (_req, res) => {
      const hooks = container.hookRegistry.listAll().map((h) => ({
        id: h.id,
        name: h.name,
        phase: h.phase,
        source: h.source,
        collections: h.collections,
        priority: h.priority,
      }));
      const health = getFirehoseHealth();
      res.json({ hooks, health });
    }),
  );

  // GET /api/v1/admin/hooks/dead-letter — list unresolved dead letter entries
  router.get(
    '/api/v1/admin/hooks/dead-letter',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req, res) => {
      const limitParam = req.query.limit;
      const limit = typeof limitParam === 'string' ? Number(limitParam) : undefined;
      const cursorParam = req.query.cursor;
      const cursor = typeof cursorParam === 'string' ? cursorParam : undefined;
      const result = await listDeadLetters(container.db, { limit, cursor });
      res.json(result);
    }),
  );

  // POST /api/v1/admin/hooks/dead-letter/:id/resolve — mark as resolved
  router.post(
    '/api/v1/admin/hooks/dead-letter/:id/resolve',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req, res) => {
      const id = Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id;
      const resolved = await resolveDeadLetter(container.db, id);
      if (!resolved) {
        res.status(404).json({ error: 'Dead letter entry not found or already resolved' });
        return;
      }
      res.json({ ok: true });
    }),
  );

  // Add hook_dead_letter to test-reset truncate list
  // (already in the SQL truncate above via cascade, but noted for awareness)

  return router;
}
