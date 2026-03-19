import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import { NotFoundError, ValidationError } from '@coopsource/common';
import type { IClock } from '@coopsource/federation';

interface InboundWebhookResult {
  connectorConfigId: string;
  connectorType: string;
  acknowledged: boolean;
}

export class WebhookService {
  constructor(
    private db: Kysely<Database>,
    private clock: IClock,
  ) {}

  /**
   * Process an inbound webhook from an external service.
   *
   * Validates the connector exists and is enabled, logs the event,
   * and returns an acknowledgment. Specific connector implementations
   * (Stripe, Discord, etc.) will extend this framework later.
   */
  async processInboundWebhook(
    cooperativeDid: string,
    connectorType: string,
    headers: Record<string, string>,
    body: unknown,
  ): Promise<InboundWebhookResult> {
    // Find the connector config for this cooperative and type
    const config = await this.db
      .selectFrom('connector_config')
      .where('cooperative_did', '=', cooperativeDid)
      .where('connector_type', '=', connectorType)
      .selectAll()
      .executeTakeFirst();

    if (!config) {
      throw new NotFoundError(`No connector config found for type '${connectorType}'`);
    }

    if (!config.enabled) {
      throw new ValidationError(`Connector '${connectorType}' is disabled`);
    }

    const now = this.clock.now();

    // Log the inbound event in the sync log
    await this.db
      .insertInto('connector_sync_log')
      .values({
        connector_config_id: config.id,
        direction: 'inbound',
        status: 'completed',
        records_synced: 1,
        records_failed: 0,
        started_at: now,
        completed_at: now,
      })
      .execute();

    // Update last_sync_at on the connector config
    await this.db
      .updateTable('connector_config')
      .set({ last_sync_at: now, updated_at: now })
      .where('id', '=', config.id)
      .execute();

    return {
      connectorConfigId: config.id,
      connectorType: config.connector_type,
      acknowledged: true,
    };
  }

  /**
   * Verify an HMAC-SHA256 webhook signature (Stripe-style).
   *
   * Compares the computed HMAC against the signature from headers
   * using timing-safe comparison to prevent timing attacks.
   */
  verifySignature(
    secret: string,
    headers: Record<string, string>,
    body: string,
  ): boolean {
    // Support common webhook signature header patterns
    const signatureHeader =
      headers['x-signature-256'] ??
      headers['x-hub-signature-256'] ??
      headers['stripe-signature'] ??
      headers['x-webhook-signature'];

    if (!signatureHeader) {
      return false;
    }

    const computed = createHmac('sha256', secret)
      .update(body, 'utf8')
      .digest('hex');

    // Handle "sha256=<hex>" prefix format (GitHub, etc.)
    const signature = signatureHeader.startsWith('sha256=')
      ? signatureHeader.slice(7)
      : signatureHeader;

    // Timing-safe comparison
    try {
      const sigBuffer = Buffer.from(signature, 'hex');
      const computedBuffer = Buffer.from(computed, 'hex');

      if (sigBuffer.length !== computedBuffer.length) {
        return false;
      }

      return timingSafeEqual(sigBuffer, computedBuffer);
    } catch {
      return false;
    }
  }
}
