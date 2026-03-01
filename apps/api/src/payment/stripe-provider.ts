import Stripe from 'stripe';
import type {
  IPaymentProvider,
  PaymentProviderInfo,
  CheckoutSessionRequest,
  CheckoutSessionResult,
  WebhookEvent,
} from '@coopsource/common';

export class StripePaymentProvider implements IPaymentProvider {
  readonly info: PaymentProviderInfo = {
    id: 'stripe',
    displayName: 'Stripe',
  };

  private stripe: Stripe;
  private webhookSecret: string;

  constructor(secretKey: string, webhookSecret: string) {
    this.stripe = new Stripe(secretKey);
    this.webhookSecret = webhookSecret;
  }

  async createCheckoutSession(
    request: CheckoutSessionRequest,
  ): Promise<CheckoutSessionResult> {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: request.currency.toLowerCase(),
            product_data: { name: request.campaignTitle },
            unit_amount: request.amount,
          },
          quantity: 1,
        },
      ],
      success_url: request.successUrl,
      cancel_url: request.cancelUrl,
      client_reference_id: request.pledgeUri,
      metadata: {
        pledgeUri: request.pledgeUri,
        ...request.metadata,
      },
    });

    if (!session.url) {
      throw new Error('Stripe did not return a checkout URL');
    }

    return {
      sessionId: session.id,
      checkoutUrl: session.url,
    };
  }

  async verifyWebhook(
    rawBody: Uint8Array,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<WebhookEvent | null> {
    if (!this.webhookSecret) return null;

    const sig = headers['stripe-signature'];
    if (!sig || Array.isArray(sig)) return null;

    const event = this.stripe.webhooks.constructEvent(
      rawBody as Buffer,
      sig,
      this.webhookSecret,
    );

    switch (event.type) {
      case 'checkout.session.completed':
        return {
          type: 'payment.completed',
          sessionId: (event.data.object as { id: string }).id,
          raw: event,
        };
      case 'checkout.session.expired':
        return {
          type: 'payment.expired',
          sessionId: (event.data.object as { id: string }).id,
          raw: event,
        };
      default:
        return null;
    }
  }
}
