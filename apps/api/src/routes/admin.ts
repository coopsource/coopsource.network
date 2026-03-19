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
            pds_commit, pds_record, pds_firehose_cursor, plc_operation,
            auth_credential, entity_key, session,
            cooperative_profile, entity,
            fact_log_redaction, fact_log,
            data_deletion_request, system_config,
            role_definition, federation_peer, signature_request, federation_outbox,
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
            notification_preference, mention
          CASCADE
        `.execute(container.db);
        resetSetupCache();
        res.json({ ok: true });
      }),
    );
  }

  return router;
}
