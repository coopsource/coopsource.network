import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { FirehoseEvent } from '@coopsource/federation';
import type { HookPhase } from './types.js';

/**
 * Record a hook failure in the dead letter queue.
 *
 * Dead-lettered events can be retried or resolved via admin API.
 * The original record is always stored in pds_record regardless (fail-open).
 */
export async function recordDeadLetter(
  db: Kysely<Database>,
  params: {
    event: FirehoseEvent;
    collection: string;
    operation: string;
    hookId: string;
    hookPhase: HookPhase;
    error: unknown;
  },
): Promise<void> {
  const err = params.error instanceof Error ? params.error : new Error(String(params.error));

  await db
    .insertInto('hook_dead_letter')
    .values({
      event_uri: params.event.uri,
      event_did: params.event.did,
      collection: params.collection,
      operation: params.operation,
      hook_id: params.hookId,
      hook_phase: params.hookPhase,
      error_message: err.message,
      error_stack: err.stack ?? null,
      event_data: JSON.stringify({
        seq: params.event.seq,
        did: params.event.did,
        operation: params.event.operation,
        uri: params.event.uri,
        cid: params.event.cid,
        record: params.event.record,
        time: params.event.time,
      }),
    })
    .execute();
}

/**
 * Mark a dead letter entry as resolved (dismissed by admin).
 */
export async function resolveDeadLetter(
  db: Kysely<Database>,
  id: string,
): Promise<boolean> {
  const result = await db
    .updateTable('hook_dead_letter' as const)
    .set({ resolved_at: new Date() })
    .where('id', '=', id)
    .where('resolved_at', 'is', null)
    .execute();

  return result.length > 0 && (result[0]?.numUpdatedRows ?? 0n) > 0n;
}

/**
 * List unresolved dead letter entries, newest first.
 */
export async function listDeadLetters(
  db: Kysely<Database>,
  params: { limit?: number; cursor?: string },
): Promise<{ entries: DeadLetterEntry[]; cursor: string | null }> {
  const limit = Math.min(params.limit ?? 50, 100);

  const query = db
    .selectFrom('hook_dead_letter' as const)
    .where('resolved_at', 'is', null)
    .selectAll()
    .orderBy('created_at', 'desc')
    .limit(limit + 1);

  const rows = params.cursor
    ? await query.where('created_at', '<', new Date(params.cursor)).execute()
    : await query.execute();

  const hasMore = rows.length > limit;
  const entries = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && entries.length > 0
    ? (entries[entries.length - 1]!.created_at as Date).toISOString()
    : null;

  return { entries: entries as unknown as DeadLetterEntry[], cursor: nextCursor };
}

export interface DeadLetterEntry {
  id: string;
  event_uri: string;
  event_did: string;
  collection: string;
  operation: string;
  hook_id: string;
  hook_phase: string;
  error_message: string;
  error_stack: string | null;
  event_data: Record<string, unknown> | null;
  retry_count: number;
  resolved_at: Date | null;
  created_at: Date;
}
