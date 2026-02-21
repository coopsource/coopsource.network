import { Router } from 'express';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth, requireAdmin } from '../../auth/middleware.js';
import { parsePagination } from '../../lib/pagination.js';
import {
  NotFoundError,
  ValidationError,
  CreateProposalBodySchema,
  UpdateProposalBodySchema,
  CastVoteSchema,
} from '@coopsource/common';
import {
  formatProposal,
  formatVote,
  type ProposalResponse,
  type VoteResponse,
} from '../../lib/formatters.js';

// Enrich a proposal row with author display name/handle
async function enrichProposal(
  container: Container,
  row: Parameters<typeof formatProposal>[0] & { author_did: string },
): Promise<ProposalResponse> {
  const author = await container.db
    .selectFrom('entity')
    .where('did', '=', row.author_did)
    .select(['display_name', 'handle'])
    .executeTakeFirst();
  return formatProposal(row, {
    displayName: author?.display_name,
    handle: author?.handle,
  });
}

// Enrich a vote row with voter display name/handle
async function enrichVote(
  container: Container,
  row: Parameters<typeof formatVote>[0] & { voter_did: string },
): Promise<VoteResponse> {
  const voter = await container.db
    .selectFrom('entity')
    .where('did', '=', row.voter_did)
    .select(['display_name', 'handle'])
    .executeTakeFirst();
  return formatVote(row, {
    displayName: voter?.display_name,
    handle: voter?.handle,
  });
}

export function createProposalRoutes(container: Container): Router {
  const router = Router();

  // GET /api/v1/proposals
  router.get(
    '/api/v1/proposals',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const status = req.query.status as string | undefined;
      const result = await container.proposalService.listProposals(
        req.actor!.cooperativeDid,
        { ...params, status },
      );

      const proposals = await Promise.all(
        result.items.map((row) => enrichProposal(container, row)),
      );

      res.json({ proposals, cursor: result.cursor ?? null });
    }),
  );

  // POST /api/v1/proposals
  router.post(
    '/api/v1/proposals',
    requireAuth,
    asyncHandler(async (req, res) => {
      const {
        title,
        body,
        bodyFormat,
        votingType,
        options,
        quorumType,
        quorumBasis,
        quorumThreshold,
        closesAt,
        tags,
      } = CreateProposalBodySchema.parse(req.body);

      const proposal = await container.proposalService.createProposal(
        req.actor!.did,
        {
          cooperativeDid: req.actor!.cooperativeDid,
          title,
          body,
          bodyFormat,
          votingType,
          options,
          quorumType,
          quorumBasis,
          quorumThreshold,
          closesAt,
          tags,
        },
      );

      res.status(201).json(await enrichProposal(container, proposal));
    }),
  );

  // GET /api/v1/proposals/:id
  router.get(
    '/api/v1/proposals/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const result = await container.proposalService.getProposal(
        (req.params.id as string),
      );
      if (!result) throw new NotFoundError('Proposal not found');
      res.json(await enrichProposal(container, result.proposal));
    }),
  );

  // PUT /api/v1/proposals/:id (author, draft only)
  router.put(
    '/api/v1/proposals/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const proposal = await container.db
        .selectFrom('proposal')
        .where('id', '=', (req.params.id as string))
        .where('invalidated_at', 'is', null)
        .selectAll()
        .executeTakeFirst();

      if (!proposal) throw new NotFoundError('Proposal not found');
      if (proposal.author_did !== req.actor!.did) {
        res.status(403).json({
          error: { code: 'FORBIDDEN', message: 'Not the proposal author' },
        });
        return;
      }
      if (proposal.status !== 'draft') {
        throw new ValidationError('Can only edit draft proposals');
      }

      const { title, body, closesAt, tags } = UpdateProposalBodySchema.parse(req.body);

      const [updated] = await container.db
        .updateTable('proposal')
        .set({
          ...(title ? { title } : {}),
          ...(body ? { body } : {}),
          ...(closesAt ? { closes_at: new Date(closesAt) } : {}),
          ...(tags ? { tags } : {}),
          indexed_at: new Date(),
        })
        .where('id', '=', (req.params.id as string))
        .returningAll()
        .execute();

      res.json(await enrichProposal(container, updated!));
    }),
  );

  // DELETE /api/v1/proposals/:id (author or admin)
  router.delete(
    '/api/v1/proposals/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const proposal = await container.db
        .selectFrom('proposal')
        .where('id', '=', (req.params.id as string))
        .where('invalidated_at', 'is', null)
        .select(['author_did'])
        .executeTakeFirst();

      if (!proposal) throw new NotFoundError('Proposal not found');

      const isAuthor = proposal.author_did === req.actor!.did;
      const isAdmin = req.actor!.hasRole('admin', 'owner');
      if (!isAuthor && !isAdmin) {
        res.status(403).json({
          error: { code: 'FORBIDDEN', message: 'Not authorized' },
        });
        return;
      }

      await container.db
        .updateTable('proposal')
        .set({
          invalidated_at: new Date(),
          invalidated_by: req.actor!.did,
          indexed_at: new Date(),
        })
        .where('id', '=', (req.params.id as string))
        .execute();

      res.status(204).send();
    }),
  );

  // POST /api/v1/proposals/:id/open
  router.post(
    '/api/v1/proposals/:id/open',
    requireAuth,
    asyncHandler(async (req, res) => {
      const result = await container.proposalService.openProposal(
        (req.params.id as string),
        req.actor!.did,
      );
      res.json(await enrichProposal(container, result));
    }),
  );

  // POST /api/v1/proposals/:id/close (admin)
  router.post(
    '/api/v1/proposals/:id/close',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req, res) => {
      const result = await container.proposalService.closeProposal(
        (req.params.id as string),
        req.actor!.did,
      );
      res.json(await enrichProposal(container, result));
    }),
  );

  // POST /api/v1/proposals/:id/resolve (admin)
  router.post(
    '/api/v1/proposals/:id/resolve',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req, res) => {
      const result = await container.proposalService.resolveProposal(
        (req.params.id as string),
      );
      res.json(await enrichProposal(container, result));
    }),
  );

  // GET /api/v1/proposals/:id/votes
  router.get(
    '/api/v1/proposals/:id/votes',
    requireAuth,
    asyncHandler(async (req, res) => {
      const voteRows = await container.db
        .selectFrom('vote')
        .where('proposal_id', '=', (req.params.id as string))
        .where('retracted_at', 'is', null)
        .selectAll()
        .execute();

      const votes = await Promise.all(
        voteRows.map((row) => enrichVote(container, row)),
      );

      // Build tally
      const tally: Record<string, number> = { yes: 0, no: 0, abstain: 0 };
      for (const v of votes) {
        tally[v.choice] = (tally[v.choice] ?? 0) + 1;
      }

      res.json({ votes, tally });
    }),
  );

  // POST /api/v1/proposals/:id/vote
  router.post(
    '/api/v1/proposals/:id/vote',
    requireAuth,
    asyncHandler(async (req, res) => {
      const { choice, rationale } = CastVoteSchema.parse(req.body);

      const vote = await container.proposalService.castVote({
        proposalId: (req.params.id as string),
        voterDid: req.actor!.did,
        choice,
        rationale,
      });

      res.status(201).json(await enrichVote(container, vote));
    }),
  );

  // DELETE /api/v1/proposals/:id/vote
  router.delete(
    '/api/v1/proposals/:id/vote',
    requireAuth,
    asyncHandler(async (req, res) => {
      await container.proposalService.retractVote(
        (req.params.id as string),
        req.actor!.did,
      );
      res.status(204).send();
    }),
  );

  return router;
}
