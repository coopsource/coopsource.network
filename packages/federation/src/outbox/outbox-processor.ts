import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { SigningKeyResolver } from '../http/signing-key-resolver.js';
import { signRequest } from '../http/signing.js';

export interface OutboxProcessorOptions {
  /** How often to poll for pending messages (ms). Default: 5000 */
  pollIntervalMs?: number;
  /** Maximum messages to process per poll cycle. Default: 10 */
  batchSize?: number;
  /** Base backoff delay in ms for retries. Default: 1000 */
  baseBackoffMs?: number;
  /** Maximum backoff delay in ms. Default: 300000 (5 min) */
  maxBackoffMs?: number;
}

export interface OutboxLogger {
  info(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

const noopLogger: OutboxLogger = {
  info() {},
  error() {},
};

/**
 * OutboxProcessor — polls the federation_outbox table and delivers messages.
 *
 * Messages are signed with RFC 9421 HTTP Message Signatures before delivery.
 * Failed messages are retried with exponential backoff. After max_attempts,
 * messages are marked as 'dead' for manual review.
 */
export class OutboxProcessor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private processing = false;
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;

  constructor(
    private db: Kysely<Database>,
    private signingKeyResolver: SigningKeyResolver,
    private instanceDid: string,
    private logger: OutboxLogger = noopLogger,
    options: OutboxProcessorOptions = {},
  ) {
    this.pollIntervalMs = options.pollIntervalMs ?? 5000;
    this.batchSize = options.batchSize ?? 10;
    this.baseBackoffMs = options.baseBackoffMs ?? 1000;
    this.maxBackoffMs = options.maxBackoffMs ?? 300_000;
  }

  start(): void {
    if (this.timer) return;
    this.logger.info('Outbox processor starting', {
      pollIntervalMs: this.pollIntervalMs,
    });
    this.timer = setInterval(() => {
      void this.processBatch();
    }, this.pollIntervalMs);
    // Process immediately on start
    void this.processBatch();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger.info('Outbox processor stopped');
    }
  }

  async processBatch(): Promise<number> {
    if (this.processing) return 0;
    this.processing = true;
    let processed = 0;

    try {
      const now = new Date();

      // Fetch pending/failed messages that are due
      const messages = await this.db
        .selectFrom('federation_outbox')
        .where((eb) =>
          eb.or([eb('status', '=', 'pending'), eb('status', '=', 'failed')]),
        )
        .where('next_attempt_at', '<=', now)
        .selectAll()
        .orderBy('next_attempt_at', 'asc')
        .limit(this.batchSize)
        .execute();

      for (const msg of messages) {
        await this.processMessage(msg);
        processed++;
      }
    } catch (error) {
      this.logger.error('Outbox batch processing error', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.processing = false;
    }

    return processed;
  }

  private async processMessage(msg: {
    id: string;
    target_url: string;
    endpoint: string;
    method: string;
    payload: Record<string, unknown>;
    attempts: number;
    max_attempts: number;
  }): Promise<void> {
    // Mark as sending
    await this.db
      .updateTable('federation_outbox')
      .set({ status: 'sending' })
      .where('id', '=', msg.id)
      .execute();

    const url = `${msg.target_url}${msg.endpoint}`;

    try {
      const bodyStr = JSON.stringify(msg.payload);
      const headers: Record<string, string> = {
        accept: 'application/json',
        'content-type': 'application/json',
      };

      // Sign the request
      const { privateKey, keyId } =
        await this.signingKeyResolver.resolve(this.instanceDid);
      const sigHeaders = await signRequest(
        msg.method,
        url,
        headers,
        bodyStr,
        privateKey,
        keyId,
      );
      Object.assign(headers, sigHeaders);

      const response = await fetch(url, {
        method: msg.method,
        headers,
        body: bodyStr,
      });

      if (response.ok) {
        await this.db
          .updateTable('federation_outbox')
          .set({
            status: 'sent',
            sent_at: new Date(),
            completed_at: new Date(),
            attempts: msg.attempts + 1,
          })
          .where('id', '=', msg.id)
          .execute();

        this.logger.info('Outbox message sent', { id: msg.id, url });
      } else {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${errorBody}`);
      }
    } catch (error) {
      const attempts = msg.attempts + 1;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (attempts >= msg.max_attempts) {
        // Mark as dead
        await this.db
          .updateTable('federation_outbox')
          .set({
            status: 'dead',
            attempts,
            last_error: errorMessage,
            completed_at: new Date(),
          })
          .where('id', '=', msg.id)
          .execute();

        this.logger.error('Outbox message dead', {
          id: msg.id,
          attempts,
          error: errorMessage,
        });
      } else {
        // Exponential backoff: base * 2^(attempts-1), capped at max
        const backoff = Math.min(
          this.baseBackoffMs * Math.pow(2, attempts - 1),
          this.maxBackoffMs,
        );
        const nextAttempt = new Date(Date.now() + backoff);

        await this.db
          .updateTable('federation_outbox')
          .set({
            status: 'failed',
            attempts,
            last_error: errorMessage,
            next_attempt_at: nextAttempt,
          })
          .where('id', '=', msg.id)
          .execute();

        this.logger.error('Outbox message failed, will retry', {
          id: msg.id,
          attempts,
          nextAttempt: nextAttempt.toISOString(),
          error: errorMessage,
        });
      }
    }
  }
}
