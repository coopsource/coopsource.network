import { Router, type Request, type Response } from 'express';
import type { Container } from '../../container.js';
import type { AppConfig } from '../../config.js';
import { logger } from '../../middleware/logger.js';

export function createStripeWebhookRoutes(
  container: Container,
  config: AppConfig,
): Router {
  const router = Router();

  // POST /api/v1/webhooks/stripe — Stripe webhook endpoint
  // NOTE: This route must receive the raw body for signature verification.
  // The raw body middleware is mounted in index.ts before JSON parsing.
  router.post(
    '/api/v1/webhooks/stripe',
    async (req: Request, res: Response) => {
      if (!config.STRIPE_SECRET_KEY || !config.STRIPE_WEBHOOK_SECRET) {
        res.status(503).json({ error: 'Stripe not configured' });
        return;
      }

      try {
        // Dynamic import — Stripe is optional
        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(config.STRIPE_SECRET_KEY);

        const sig = req.headers['stripe-signature'];
        if (!sig) {
          res.status(400).json({ error: 'Missing stripe-signature header' });
          return;
        }

        const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
        if (!rawBody) {
          res.status(400).json({ error: 'Missing raw body' });
          return;
        }

        const event = stripe.webhooks.constructEvent(
          rawBody,
          sig,
          config.STRIPE_WEBHOOK_SECRET,
        );

        switch (event.type) {
          case 'checkout.session.completed': {
            const session = event.data.object;
            const pledge = await container.fundingService.findPledgeByStripeSession(
              session.id,
            );
            if (pledge) {
              await container.fundingService.updatePledgeStatus(
                pledge.uri,
                'completed',
                session.id,
              );
              logger.info(
                { pledgeUri: pledge.uri, sessionId: session.id },
                'Stripe payment completed',
              );
            }
            break;
          }

          case 'checkout.session.expired': {
            const session = event.data.object;
            const pledge = await container.fundingService.findPledgeByStripeSession(
              session.id,
            );
            if (pledge) {
              await container.fundingService.updatePledgeStatus(
                pledge.uri,
                'failed',
                session.id,
              );
              logger.info(
                { pledgeUri: pledge.uri, sessionId: session.id },
                'Stripe session expired',
              );
            }
            break;
          }

          default:
            logger.debug({ type: event.type }, 'Unhandled Stripe event');
        }

        res.json({ received: true });
      } catch (err) {
        if (err instanceof Error && 'type' in err && (err as Error & { type: string }).type === 'StripeSignatureVerificationError') {
          logger.warn({ err }, 'Stripe signature verification failed');
          res.status(400).json({ error: 'Invalid signature' });
          return;
        }
        logger.error({ err }, 'Stripe webhook processing error');
        res.status(500).json({ error: 'Webhook processing failed' });
      }
    },
  );

  return router;
}
