import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';

export interface EnqueueParams {
  targetDid: string;
  targetUrl: string;
  endpoint: string;
  method?: string;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
  maxAttempts?: number;
}

/**
 * Enqueue a federation message for reliable delivery.
 *
 * Messages are stored in the federation_outbox table and processed
 * asynchronously by the OutboxProcessor. Idempotency keys prevent
 * duplicate messages.
 */
export async function enqueueOutboxMessage(
  db: Kysely<Database>,
  params: EnqueueParams,
): Promise<string> {
  const [row] = await db
    .insertInto('federation_outbox')
    .values({
      target_did: params.targetDid,
      target_url: params.targetUrl,
      endpoint: params.endpoint,
      method: params.method ?? 'POST',
      payload: JSON.stringify(params.payload),
      idempotency_key: params.idempotencyKey ?? null,
      status: 'pending',
      attempts: 0,
      max_attempts: params.maxAttempts ?? 5,
      next_attempt_at: new Date(),
    })
    .returning('id')
    .execute();

  return row!.id;
}
