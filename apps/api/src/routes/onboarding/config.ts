import { Router } from 'express';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { requirePermission } from '../../middleware/permissions.js';
import { parsePagination } from '../../lib/pagination.js';
import {
  CreateOnboardingConfigSchema,
  UpdateOnboardingConfigSchema,
  StartOnboardingSchema,
  CompleteTrainingSchema,
  CompleteBuyInSchema,
  CompleteMilestoneSchema,
  AssignBuddySchema,
  CreateOnboardingReviewSchema,
  CompleteOnboardingSchema,
} from '@coopsource/common';

function formatConfig(row: Record<string, unknown>) {
  return {
    id: row.id,
    cooperativeDid: row.cooperative_did,
    probationDurationDays: row.probation_duration_days,
    requireTraining: row.require_training,
    requireBuyIn: row.require_buy_in,
    buyInAmount: Number(row.buy_in_amount),
    buddySystemEnabled: row.buddy_system_enabled,
    milestones: row.milestones,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

function formatProgress(row: Record<string, unknown>) {
  return {
    id: row.id,
    cooperativeDid: row.cooperative_did,
    memberDid: row.member_did,
    status: row.status,
    probationStartsAt: (row.probation_starts_at as Date).toISOString(),
    probationEndsAt: (row.probation_ends_at as Date).toISOString(),
    buddyDid: row.buddy_did ?? null,
    trainingCompleted: row.training_completed,
    trainingCompletedAt: row.training_completed_at
      ? (row.training_completed_at as Date).toISOString()
      : null,
    buyInCompleted: row.buy_in_completed,
    buyInCompletedAt: row.buy_in_completed_at
      ? (row.buy_in_completed_at as Date).toISOString()
      : null,
    milestonesCompleted: row.milestones_completed,
    notes: row.notes ?? null,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
    completedAt: row.completed_at
      ? (row.completed_at as Date).toISOString()
      : null,
  };
}

function formatReview(row: Record<string, unknown>) {
  return {
    id: row.id,
    cooperativeDid: row.cooperative_did,
    memberDid: row.member_did,
    reviewerDid: row.reviewer_did,
    reviewType: row.review_type,
    outcome: row.outcome,
    comments: row.comments ?? null,
    milestoneName: row.milestone_name ?? null,
    createdAt: (row.created_at as Date).toISOString(),
  };
}

export function createOnboardingRoutes(container: Container): Router {
  const router = Router();

  // POST /api/v1/onboarding/config — Create config
  router.post(
    '/api/v1/onboarding/config',
    requireAuth,
    requirePermission('onboarding.manage'),
    asyncHandler(async (req, res) => {
      const data = CreateOnboardingConfigSchema.parse(req.body);
      const config = await container.onboardingService.createConfig(
        req.actor!.cooperativeDid,
        data,
      );
      res.status(201).json(formatConfig(config as unknown as Record<string, unknown>));
    }),
  );

  // GET /api/v1/onboarding/config — Get config
  router.get(
    '/api/v1/onboarding/config',
    requireAuth,
    asyncHandler(async (req, res) => {
      const config = await container.onboardingService.getConfig(
        req.actor!.cooperativeDid,
      );
      if (!config) {
        res.json(null);
        return;
      }
      res.json(formatConfig(config as unknown as Record<string, unknown>));
    }),
  );

  // PUT /api/v1/onboarding/config — Update config
  router.put(
    '/api/v1/onboarding/config',
    requireAuth,
    requirePermission('onboarding.manage'),
    asyncHandler(async (req, res) => {
      const data = UpdateOnboardingConfigSchema.parse(req.body);
      const config = await container.onboardingService.updateConfig(
        req.actor!.cooperativeDid,
        data,
      );
      res.json(formatConfig(config as unknown as Record<string, unknown>));
    }),
  );

  // POST /api/v1/onboarding/start — Start member onboarding
  router.post(
    '/api/v1/onboarding/start',
    requireAuth,
    requirePermission('onboarding.manage'),
    asyncHandler(async (req, res) => {
      const data = StartOnboardingSchema.parse(req.body);
      const progress = await container.onboardingService.startOnboarding(
        req.actor!.cooperativeDid,
        data,
      );
      res.status(201).json(formatProgress(progress as unknown as Record<string, unknown>));
    }),
  );

  // GET /api/v1/onboarding/progress — List all progress
  router.get(
    '/api/v1/onboarding/progress',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const status = req.query.status ? String(req.query.status) : undefined;
      const result = await container.onboardingService.listProgress(
        req.actor!.cooperativeDid,
        { ...params, status },
      );
      res.json({
        items: result.items.map(formatProgress),
        cursor: result.cursor,
      });
    }),
  );

  // GET /api/v1/onboarding/progress/:memberDid — Get member progress
  router.get(
    '/api/v1/onboarding/progress/:memberDid',
    requireAuth,
    asyncHandler(async (req, res) => {
      const memberDid = decodeURIComponent(String(req.params.memberDid));
      const progress = await container.onboardingService.getProgress(
        req.actor!.cooperativeDid,
        memberDid,
      );
      if (!progress) {
        res.json(null);
        return;
      }
      res.json(formatProgress(progress as unknown as Record<string, unknown>));
    }),
  );

  // POST /api/v1/onboarding/training/complete — Complete training
  router.post(
    '/api/v1/onboarding/training/complete',
    requireAuth,
    requirePermission('onboarding.manage'),
    asyncHandler(async (req, res) => {
      const data = CompleteTrainingSchema.parse(req.body);
      const progress = await container.onboardingService.completeTraining(
        req.actor!.cooperativeDid,
        data.memberDid,
      );
      res.json(formatProgress(progress as unknown as Record<string, unknown>));
    }),
  );

  // POST /api/v1/onboarding/buy-in/complete — Complete buy-in
  router.post(
    '/api/v1/onboarding/buy-in/complete',
    requireAuth,
    requirePermission('onboarding.manage'),
    asyncHandler(async (req, res) => {
      const data = CompleteBuyInSchema.parse(req.body);
      const progress = await container.onboardingService.completeBuyIn(
        req.actor!.cooperativeDid,
        data.memberDid,
      );
      res.json(formatProgress(progress as unknown as Record<string, unknown>));
    }),
  );

  // POST /api/v1/onboarding/milestone/complete — Complete milestone
  router.post(
    '/api/v1/onboarding/milestone/complete',
    requireAuth,
    requirePermission('onboarding.manage'),
    asyncHandler(async (req, res) => {
      const data = CompleteMilestoneSchema.parse(req.body);
      const progress = await container.onboardingService.completeMilestone(
        req.actor!.cooperativeDid,
        data.memberDid,
        data.milestoneName,
      );
      res.json(formatProgress(progress as unknown as Record<string, unknown>));
    }),
  );

  // POST /api/v1/onboarding/buddy/assign — Assign buddy
  router.post(
    '/api/v1/onboarding/buddy/assign',
    requireAuth,
    requirePermission('onboarding.manage'),
    asyncHandler(async (req, res) => {
      const data = AssignBuddySchema.parse(req.body);
      const progress = await container.onboardingService.assignBuddy(
        req.actor!.cooperativeDid,
        data.memberDid,
        data.buddyDid,
      );
      res.json(formatProgress(progress as unknown as Record<string, unknown>));
    }),
  );

  // POST /api/v1/onboarding/review — Create review
  router.post(
    '/api/v1/onboarding/review',
    requireAuth,
    requirePermission('onboarding.manage'),
    asyncHandler(async (req, res) => {
      const data = CreateOnboardingReviewSchema.parse(req.body);
      const review = await container.onboardingService.createReview(
        req.actor!.cooperativeDid,
        req.actor!.did,
        data,
      );
      res.status(201).json(formatReview(review as unknown as Record<string, unknown>));
    }),
  );

  // GET /api/v1/onboarding/reviews/:memberDid — List reviews
  router.get(
    '/api/v1/onboarding/reviews/:memberDid',
    requireAuth,
    asyncHandler(async (req, res) => {
      const memberDid = decodeURIComponent(String(req.params.memberDid));
      const reviews = await container.onboardingService.listReviews(
        req.actor!.cooperativeDid,
        memberDid,
      );
      res.json({
        reviews: reviews.map((r) => formatReview(r as unknown as Record<string, unknown>)),
      });
    }),
  );

  // POST /api/v1/onboarding/complete — Complete onboarding
  router.post(
    '/api/v1/onboarding/complete',
    requireAuth,
    requirePermission('onboarding.manage'),
    asyncHandler(async (req, res) => {
      const data = CompleteOnboardingSchema.parse(req.body);
      const progress = await container.onboardingService.completeOnboarding(
        req.actor!.cooperativeDid,
        data.memberDid,
      );
      res.json(formatProgress(progress as unknown as Record<string, unknown>));
    }),
  );

  return router;
}
