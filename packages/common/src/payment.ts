/**
 * Payment provider abstraction layer.
 *
 * Allows cooperatives to configure multiple payment providers (Stripe, PayPal, etc.)
 * and lets backers choose which to use at pledge time. Co-ops with no provider
 * configured operate in offline mode (pledges recorded but payment handled externally).
 */

export interface PaymentProviderInfo {
  /** Provider identifier, e.g. 'stripe', 'paypal' */
  id: string;
  /** Human-readable name, e.g. 'Stripe', 'PayPal' */
  displayName: string;
}

export interface CheckoutSessionRequest {
  /** Internal pledge URI used as idempotency/reference key */
  pledgeUri: string;
  /** Amount in smallest currency unit (e.g. cents) */
  amount: number;
  /** ISO 4217 currency code */
  currency: string;
  /** Campaign title for display on checkout page */
  campaignTitle: string;
  /** URL to redirect to after successful payment */
  successUrl: string;
  /** URL to redirect to if the user cancels */
  cancelUrl: string;
  /** Optional metadata to attach to the session */
  metadata?: Record<string, string>;
}

export interface CheckoutSessionResult {
  /** Provider's session/transaction ID */
  sessionId: string;
  /** URL to redirect the user to for payment */
  checkoutUrl: string;
}

export interface WebhookEvent {
  /** Normalized event type */
  type: 'payment.completed' | 'payment.failed' | 'payment.expired';
  /** Provider's session/transaction ID */
  sessionId: string;
  /** Raw provider-specific event data */
  raw: unknown;
}

export interface IPaymentProvider {
  /** Provider identity */
  readonly info: PaymentProviderInfo;

  /** Create a checkout session and return a redirect URL */
  createCheckoutSession(request: CheckoutSessionRequest): Promise<CheckoutSessionResult>;

  /**
   * Parse and verify a webhook payload from the provider.
   * Returns null if the event type is not relevant.
   */
  verifyWebhook(
    rawBody: Uint8Array,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<WebhookEvent | null>;
}
