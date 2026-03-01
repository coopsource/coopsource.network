import { Router, type Request, type Response } from 'express';
import type { Container } from '../../container.js';
import { logger } from '../../middleware/logger.js';

export function createPaymentWebhookRoutes(container: Container): Router {
  const router = Router();

  // POST /api/v1/webhooks/payment/:providerId — Payment provider webhook
  // NOTE: This route must receive the raw body for signature verification.
  // The raw body middleware is mounted in index.ts before JSON parsing.
  router.post(
    '/api/v1/webhooks/payment/:providerId',
    async (req: Request, res: Response) => {
      const providerId = String(req.params.providerId);

      const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
      if (!rawBody) {
        res.status(400).json({ error: 'Missing raw body' });
        return;
      }

      try {
        // We need to find the pledge to determine which cooperative's
        // provider credentials to use. For Stripe, the client_reference_id
        // contains the pledgeUri. We first try to verify the webhook with
        // all configured providers for this provider type.
        //
        // Strategy: look up all payment_provider_config rows for this providerId,
        // try each one's webhook secret until verification succeeds.
        const configs = await container.db
          .selectFrom('payment_provider_config')
          .where('provider_id', '=', providerId)
          .where('enabled', '=', true)
          .select(['cooperative_did'])
          .execute();

        if (configs.length === 0) {
          res.status(503).json({ error: `No ${providerId} providers configured` });
          return;
        }

        // Try each cooperative's provider until one verifies successfully
        let webhookEvent = null;
        for (const config of configs) {
          try {
            const provider = await container.paymentRegistry.getWebhookProvider(
              config.cooperative_did,
              providerId,
            );
            webhookEvent = await provider.verifyWebhook(rawBody, req.headers);
            if (webhookEvent) break;
          } catch {
            // Verification failed for this cooperative — try next
            continue;
          }
        }

        if (!webhookEvent) {
          // Either unhandled event type or no cooperative's secret matched
          res.json({ received: true });
          return;
        }

        const pledge = await container.fundingService.findPledgeByPaymentSession(
          webhookEvent.sessionId,
        );

        if (!pledge) {
          logger.warn(
            { sessionId: webhookEvent.sessionId, providerId },
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
            eventType: webhookEvent.type,
          },
          'Payment webhook processed',
        );

        res.json({ received: true });
      } catch (err) {
        logger.error({ err, providerId }, 'Payment webhook processing error');
        res.status(500).json({ error: 'Webhook processing failed' });
      }
    },
  );

  return router;
}
