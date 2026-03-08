import { Router } from 'express';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../auth/middleware.js';
import { requirePermission } from '../../middleware/permissions.js';
import { parsePagination } from '../../lib/pagination.js';
import { CreateDelegationSchema } from '@coopsource/common';

function formatDelegation(row: Record<string, unknown>) {
  return {
    uri: row.uri,
    delegatorDid: row.delegator_did,
    delegateeDid: row.delegatee_did,
    scope: row.scope,
    proposalUri: row.proposal_uri ?? null,
    status: row.status,
    createdAt: (row.created_at as Date).toISOString(),
    revokedAt: row.revoked_at
      ? (row.revoked_at as Date).toISOString()
      : null,
  };
}

export function createDelegationRoutes(container: Container): Router {
  const router = Router();

  // POST /api/v1/governance/delegations — Create delegation
  router.post(
    '/api/v1/governance/delegations',
    requireAuth,
    requirePermission('vote.cast'),
    asyncHandler(async (req, res) => {
      const data = CreateDelegationSchema.parse(req.body);
      const delegation = await container.delegationVotingService.createDelegation(
        req.actor!.cooperativeDid,
        req.actor!.did,
        data,
      );
      res.status(201).json(formatDelegation(delegation as unknown as Record<string, unknown>));
    }),
  );

  // DELETE /api/v1/governance/delegations/:uri — Revoke delegation
  router.delete(
    '/api/v1/governance/delegations/:uri',
    requireAuth,
    requirePermission('vote.cast'),
    asyncHandler(async (req, res) => {
      const uri = decodeURIComponent(String(req.params.uri));
      const delegation = await container.delegationVotingService.revokeDelegation(
        req.actor!.cooperativeDid,
        req.actor!.did,
        uri,
      );
      res.json(formatDelegation(delegation as unknown as Record<string, unknown>));
    }),
  );

  // GET /api/v1/governance/delegations — List delegations
  router.get(
    '/api/v1/governance/delegations',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const status = req.query.status ? String(req.query.status) : undefined;
      const result = await container.delegationVotingService.listDelegations(
        req.actor!.cooperativeDid,
        { ...params, status },
      );
      res.json({
        delegations: result.items.map(formatDelegation),
        cursor: result.cursor,
      });
    }),
  );

  // GET /api/v1/governance/delegations/chain/:memberDid — Get delegation chain
  router.get(
    '/api/v1/governance/delegations/chain/:memberDid',
    requireAuth,
    asyncHandler(async (req, res) => {
      const memberDid = decodeURIComponent(String(req.params.memberDid));
      const scope = req.query.scope ? String(req.query.scope) : 'project';
      const proposalUri = req.query.proposalUri
        ? String(req.query.proposalUri)
        : undefined;
      const chain = await container.delegationVotingService.getDelegationChain(
        req.actor!.cooperativeDid,
        memberDid,
        scope,
        proposalUri,
      );
      res.json({ chain });
    }),
  );

  // GET /api/v1/governance/vote-weight/:memberDid — Calculate vote weight
  router.get(
    '/api/v1/governance/vote-weight/:memberDid',
    requireAuth,
    asyncHandler(async (req, res) => {
      const memberDid = decodeURIComponent(String(req.params.memberDid));
      if (!req.query.proposalId) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'proposalId query parameter is required' });
        return;
      }
      const proposalId = String(req.query.proposalId);
      const weight = await container.delegationVotingService.calculateVoteWeight(
        req.actor!.cooperativeDid,
        memberDid,
        proposalId,
      );
      res.json({ memberDid, weight });
    }),
  );

  return router;
}
