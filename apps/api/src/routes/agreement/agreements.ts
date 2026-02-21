import { Router } from 'express';
import type { Container } from '../../container.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth, requireAdmin } from '../../auth/middleware.js';
import { parsePagination } from '../../lib/pagination.js';
import { NotFoundError, ValidationError } from '@coopsource/common';
import {
  formatAgreement,
  type AgreementResponse,
} from '../../lib/formatters.js';

async function enrichAgreement(
  container: Container,
  row: Parameters<typeof formatAgreement>[0] & { created_by: string; id: string },
  currentDid: string,
): Promise<AgreementResponse> {
  const author = await container.db
    .selectFrom('entity')
    .where('did', '=', row.created_by)
    .select(['display_name', 'handle'])
    .executeTakeFirst();

  const sigCount = await container.db
    .selectFrom('agreement_signature')
    .where('agreement_id', '=', row.id)
    .where('retracted_at', 'is', null)
    .select((eb) => [eb.fn.count<string>('id').as('count')])
    .executeTakeFirst();

  const mySig = await container.db
    .selectFrom('agreement_signature')
    .where('agreement_id', '=', row.id)
    .where('signer_did', '=', currentDid)
    .where('retracted_at', 'is', null)
    .select('id')
    .executeTakeFirst();

  return formatAgreement(row, {
    displayName: author?.display_name,
    handle: author?.handle,
    signatureCount: Number(sigCount?.count ?? 0),
    mySignature: !!mySig,
  });
}

export function createAgreementRoutes(container: Container): Router {
  const router = Router();

  // GET /api/v1/agreements
  router.get(
    '/api/v1/agreements',
    requireAuth,
    asyncHandler(async (req, res) => {
      const params = parsePagination(req.query as Record<string, unknown>);
      const result = await container.agreementService.listAgreements(
        req.actor!.cooperativeDid,
        params,
      );

      const agreements = await Promise.all(
        result.items.map((row) =>
          enrichAgreement(container, row, req.actor!.did),
        ),
      );

      res.json({ agreements, cursor: result.cursor ?? null });
    }),
  );

  // POST /api/v1/agreements
  router.post(
    '/api/v1/agreements',
    requireAuth,
    asyncHandler(async (req, res) => {
      const { title, body, bodyFormat, agreementType, partyDids } =
        req.body as {
          title?: string;
          body?: string;
          bodyFormat?: string;
          agreementType?: string;
          partyDids?: string[];
        };

      if (!title || !body || !agreementType) {
        throw new ValidationError(
          'title, body, and agreementType are required',
        );
      }

      const agreement = await container.agreementService.createAgreement(
        req.actor!.did,
        {
          cooperativeDid: req.actor!.cooperativeDid,
          title,
          body,
          bodyFormat,
          agreementType,
          partyDids,
        },
      );

      res
        .status(201)
        .json(await enrichAgreement(container, agreement, req.actor!.did));
    }),
  );

  // GET /api/v1/agreements/:id
  router.get(
    '/api/v1/agreements/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const result = await container.agreementService.getAgreement(
        (req.params.id as string),
      );
      if (!result) throw new NotFoundError('Agreement not found');
      res.json(
        await enrichAgreement(container, result.agreement, req.actor!.did),
      );
    }),
  );

  // PUT /api/v1/agreements/:id (author, draft only)
  router.put(
    '/api/v1/agreements/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const agreement = await container.db
        .selectFrom('agreement')
        .where('id', '=', (req.params.id as string))
        .where('invalidated_at', 'is', null)
        .selectAll()
        .executeTakeFirst();

      if (!agreement) throw new NotFoundError('Agreement not found');
      if (agreement.created_by !== req.actor!.did) {
        res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'Not the agreement author',
          },
        });
        return;
      }
      if (agreement.status !== 'draft') {
        throw new ValidationError('Can only edit draft agreements');
      }

      const { title, body } = req.body as {
        title?: string;
        body?: string;
      };

      const [updated] = await container.db
        .updateTable('agreement')
        .set({
          ...(title ? { title } : {}),
          ...(body ? { body } : {}),
          indexed_at: new Date(),
        })
        .where('id', '=', (req.params.id as string))
        .returningAll()
        .execute();

      res.json(await enrichAgreement(container, updated!, req.actor!.did));
    }),
  );

  // POST /api/v1/agreements/:id/open
  router.post(
    '/api/v1/agreements/:id/open',
    requireAuth,
    asyncHandler(async (req, res) => {
      const result = await container.agreementService.openAgreement(
        (req.params.id as string),
        req.actor!.did,
      );
      res.json(await enrichAgreement(container, result, req.actor!.did));
    }),
  );

  // POST /api/v1/agreements/:id/sign
  router.post(
    '/api/v1/agreements/:id/sign',
    requireAuth,
    asyncHandler(async (req, res) => {
      const { statement } = req.body as { statement?: string };
      await container.agreementService.sign(
        (req.params.id as string),
        req.actor!.did,
        statement,
      );
      const result = await container.agreementService.getAgreement(
        (req.params.id as string),
      );
      if (!result) throw new NotFoundError('Agreement not found');
      res
        .status(201)
        .json(await enrichAgreement(container, result.agreement, req.actor!.did));
    }),
  );

  // DELETE /api/v1/agreements/:id/sign
  router.delete(
    '/api/v1/agreements/:id/sign',
    requireAuth,
    asyncHandler(async (req, res) => {
      const { reason } = req.body as { reason?: string };
      await container.agreementService.retractSignature(
        (req.params.id as string),
        req.actor!.did,
        reason,
      );
      res.status(204).send();
    }),
  );

  // POST /api/v1/agreements/:id/void (admin)
  router.post(
    '/api/v1/agreements/:id/void',
    requireAuth,
    requireAdmin,
    asyncHandler(async (req, res) => {
      const result = await container.agreementService.voidAgreement(
        (req.params.id as string),
        req.actor!.did,
      );
      res.json(await enrichAgreement(container, result, req.actor!.did));
    }),
  );

  return router;
}
