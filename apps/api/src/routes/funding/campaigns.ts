import { Router } from 'express';
import { z } from 'zod';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { parsePagination } from '../../lib/pagination.js';
import {
  CreateCampaignSchema,
  UpdateCampaignSchema,
  UpdateCampaignStatusSchema,
  CreatePledgeSchema,
} from '@coopsource/common';

const CheckoutSchema = z.object({
  pledgeUri: z.string(),
  providerId: z.string(),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

export function createCampaignRoutes(container: Container): Router {
  const router = Router();

  // POST /api/v1/campaigns — Create campaign
  router.post(
    '/api/v1/campaigns',
    requireAuth,
    asyncHandler(async (req, res) => {
      const data = CreateCampaignSchema.parse(req.body);

      const campaign = await container.fundingService.createCampaign(
        req.actor!.did,
        req.actor!.cooperativeDid,
        data,
      );

      res.status(201).json(formatCampaign(campaign));
    }),
  );

  // GET /api/v1/campaigns — List campaigns
  router.get(
    '/api/v1/campaigns',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query);
      const status = req.query.status ? String(req.query.status) : undefined;
      const cooperativeDid = req.query.cooperativeDid
        ? String(req.query.cooperativeDid)
        : req.actor!.cooperativeDid;

      const page = await container.fundingService.listCampaigns(
        cooperativeDid,
        { ...params, status },
      );

      res.json({
        campaigns: page.items.map(formatCampaign),
        cursor: page.cursor,
      });
    }),
  );

  // GET /api/v1/campaigns/:uri — Get single campaign
  router.get(
    '/api/v1/campaigns/:uri',
    requireAuth,
    asyncHandler(async (req, res) => {
      const uri = decodeURIComponent(String(req.params.uri));
      const campaign = await container.fundingService.getCampaign(uri);
      res.json(formatCampaign(campaign));
    }),
  );

  // PUT /api/v1/campaigns/:uri — Update campaign
  router.put(
    '/api/v1/campaigns/:uri',
    requireAuth,
    asyncHandler(async (req, res) => {
      const uri = decodeURIComponent(String(req.params.uri));
      const data = UpdateCampaignSchema.parse(req.body);

      const campaign = await container.fundingService.updateCampaign(
        uri,
        req.actor!.cooperativeDid,
        data,
      );

      res.json(formatCampaign(campaign));
    }),
  );

  // POST /api/v1/campaigns/:uri/status — Change campaign status
  router.post(
    '/api/v1/campaigns/:uri/status',
    requireAuth,
    asyncHandler(async (req, res) => {
      const uri = decodeURIComponent(String(req.params.uri));
      const { status } = UpdateCampaignStatusSchema.parse(req.body);

      const campaign = await container.fundingService.updateCampaignStatus(
        uri,
        req.actor!.cooperativeDid,
        status,
      );

      res.json(formatCampaign(campaign));
    }),
  );

  // GET /api/v1/campaigns/:uri/providers — List enabled payment providers
  router.get(
    '/api/v1/campaigns/:uri/providers',
    requireAuth,
    asyncHandler(async (req, res) => {
      const uri = decodeURIComponent(String(req.params.uri));
      const providers =
        await container.fundingService.getAvailableProviders(uri);
      res.json({ providers });
    }),
  );

  // POST /api/v1/campaigns/:uri/checkout — Create checkout session
  router.post(
    '/api/v1/campaigns/:uri/checkout',
    requireAuth,
    asyncHandler(async (req, res) => {
      const campaignUri = decodeURIComponent(String(req.params.uri));
      const { pledgeUri, providerId, successUrl, cancelUrl } =
        CheckoutSchema.parse(req.body);

      // Verify the campaign exists (throws NotFoundError if not)
      await container.fundingService.getCampaign(campaignUri);

      const result = await container.fundingService.createCheckoutSession(
        pledgeUri,
        providerId,
        successUrl,
        cancelUrl,
      );

      res.json({ checkoutUrl: result.checkoutUrl, mode: 'redirect' as const });
    }),
  );

  // POST /api/v1/campaigns/:uri/pledge — Create pledge
  router.post(
    '/api/v1/campaigns/:uri/pledge',
    requireAuth,
    asyncHandler(async (req, res) => {
      const campaignUri = decodeURIComponent(String(req.params.uri));
      const body = req.body as Record<string, unknown>;
      const data = CreatePledgeSchema.parse({
        ...body,
        campaignUri,
      });

      const pledge = await container.fundingService.createPledge(
        req.actor!.did,
        data,
      );

      res.status(201).json(formatPledge(pledge));
    }),
  );

  // GET /api/v1/campaigns/:uri/pledges — List pledges for campaign
  router.get(
    '/api/v1/campaigns/:uri/pledges',
    requireAuth,
    asyncHandler(async (req, res) => {
      const campaignUri = decodeURIComponent(String(req.params.uri));
      const params = parsePagination(req.query);

      const page = await container.fundingService.listPledges(
        campaignUri,
        params,
      );

      res.json({
        pledges: page.items.map(formatPledge),
        cursor: page.cursor,
      });
    }),
  );

  return router;
}

// ─── Formatters ──────────────────────────────────────────────────────────────

function formatCampaign(row: Record<string, unknown>) {
  return {
    uri: row.uri,
    did: row.did,
    title: row.title,
    description: row.description,
    tier: row.tier,
    campaignType: row.campaign_type,
    goalAmount: row.goal_amount,
    goalCurrency: row.goal_currency,
    amountRaised: row.amount_raised,
    backerCount: row.backer_count,
    fundingModel: row.funding_model,
    status: row.status,
    startDate: row.start_date ? (row.start_date as Date).toISOString() : null,
    endDate: row.end_date ? (row.end_date as Date).toISOString() : null,
    metadata: row.metadata,
    createdAt: (row.created_at as Date).toISOString(),
  };
}

function formatPledge(row: Record<string, unknown>) {
  return {
    uri: row.uri,
    did: row.did,
    campaignUri: row.campaign_uri,
    backerDid: row.backer_did,
    amount: row.amount,
    currency: row.currency,
    paymentStatus: row.payment_status,
    paymentProvider: row.payment_provider ?? null,
    paymentSessionId: row.payment_session_id ?? null,
    metadata: row.metadata,
    createdAt: (row.created_at as Date).toISOString(),
  };
}
