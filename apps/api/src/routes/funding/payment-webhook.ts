import { Router, type Request, type Response } from 'express';
import type { Container } from '../../container.js';
import { logger } from '../../middleware/logger.js';

export function createPaymentWebhookRoutes(container: Container): Router {
  const router = Router();

  // POST /api/v1/webhooks/payment/:providerId/:cooperativeDid
  //
  // Each cooperative gets a unique webhook URL containing their DID.
  // This avoids brute-forcing all co-op secrets — we look up the exact
  // cooperative's provider config and verify with their specific secret.
  //
  // NOTE: This route must receive the raw body for signature verification.
  // The raw body middleware is mounted in index.ts before JSON parsing.
  router.post(
    '/api/v1/webhooks/payment/:providerId/:cooperativeDid',
    async (req: Request, res: Response) => {
      const providerId = String(req.params.providerId);
      const cooperativeDid = decodeURIComponent(String(req.params.cooperativeDid));

      const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
      if (!rawBody) {
        res.status(400).json({ error: 'Missing raw body' });
        return;
      }

      try {
        const provider = await container.paymentRegistry.getProvider(
          cooperativeDid,
          providerId,
        );

        const webhookEvent = await provider.verifyWebhook(rawBody, req.headers);
        if (!webhookEvent) {
          // Unhandled event type — acknowledge receipt
          res.json({ received: true });
          return;
        }

        const pledge = await container.fundingService.findPledgeByPaymentSession(
          webhookEvent.sessionId,
        );

        if (!pledge) {
          logger.warn(
            { sessionId: webhookEvent.sessionId, providerId, cooperativeDid },
            'Payment webhook: no pledge found for session',
          );
          res.json({ received: true });
          return;
        }

        const statusMap: Record<string, string> = {
          'payment.completed': 'completed',
          'payment.failed': 'failed',
          'payment.expired': 'failed',
        };

        await container.fundingService.updatePledgeStatus(
          pledge.uri,
          statusMap[webhookEvent.type]!,
          webhookEvent.sessionId,
        );

        logger.info(
          {
            pledgeUri: pledge.uri,
            sessionId: webhookEvent.sessionId,
            providerId,
            cooperativeDid,
            eventType: webhookEvent.type,
          },
          'Payment webhook processed',
        );

        res.json({ received: true });
      } catch (err) {
        // Log the error with context for debugging
        if (err instanceof Error && err.message.includes('not configured')) {
          logger.warn({ providerId, cooperativeDid }, 'Webhook for unconfigured provider');
          res.status(404).json({ error: 'Provider not configured' });
          return;
        }

        logger.error({ err, providerId, cooperativeDid }, 'Payment webhook processing error');
        res.status(500).json({ error: 'Webhook processing failed' });
      }
    },
  );

  return router;
}
