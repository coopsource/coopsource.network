import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { FirehoseEvent } from '@coopsource/federation';
import type { DID, AtUri, CID } from '@coopsource/common';
import { logger } from '../../middleware/logger.js';
import type { HookRegistry } from './registry.js';
import { processFirehoseEvent } from './pipeline.js';
import type { HookPhase } from './types.js';

/**
 * Where a failure happened. `storage` is not a hook phase — it is the
 * `pds_record` write itself, which is the source of truth and therefore has to
 * be recorded when it fails rather than merely logged.
 */
export type DeadLetterPhase = HookPhase | 'storage';

/**
 * Record a failure in the dead letter queue, with the full event payload so
 * the event can be replayed later.
 *
 * Dead-lettered events can be retried or resolved via the admin API.
 */
export async function recordDeadLetter(
  db: Kysely<Database>,
  params: {
    event: FirehoseEvent;
    collection: string;
    operation: string;
    hookId: string;
    hookPhase: DeadLetterPhase;
    error: unknown;
  },
): Promise<void> {
  const err = params.error instanceof Error ? params.error : new Error(String(params.error));

  const row = {
    event_uri: params.event.uri,
    event_did: params.event.did,
    collection: params.collection,
    operation: params.operation,
    hook_id: params.hookId,
    hook_phase: params.hookPhase,
    error_message: withoutNulls(err.message),
    error_stack: err.stack ? withoutNulls(err.stack) : null,
  };

  try {
    await db
      .insertInto('hook_dead_letter')
      .values({
        ...row,
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
    return;
  } catch (payloadErr) {
    // The payload can itself be unstorable: `event_data` is jsonb, and
    // PostgreSQL rejects a NUL character in jsonb, so exactly the records that
    // break the `pds_record` write also break the obvious dead-letter write.
    // Recording the loss without the payload is far better than not recording
    // it at all — the URI identifies the record, which can be refetched from
    // the PDS.
    logger.warn(
      { err: payloadErr, uri: params.event.uri },
      'Dead letter payload could not be stored; recording without it',
    );
  }

  await db
    .insertInto('hook_dead_letter')
    .values({
      ...row,
      event_data: null,
      error_message: `${row.error_message} [not replayable: the event payload could not be stored]`,
    })
    .execute();
}

/** PostgreSQL rejects NUL in text columns; these fields are diagnostics. */
function withoutNulls(value: string): string {
  return value.replace(/\0/g, '');
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

/**
 * Replay a dead-lettered event through the pipeline (audit O-12).
 *
 * Returns `null` when there is no unresolved entry with that id. The attempt is
 * counted before it is made, so a replay that fails is still visible in
 * `retry_count`.
 *
 * For a `storage`-phase entry, success is checked against `pds_record` itself,
 * which is exactly what that entry recorded the loss of. For a hook-phase entry
 * the pipeline is fail-open by design, so a hook that fails again lands a fresh
 * dead-letter entry of its own rather than reopening this one — read the queue,
 * not this result, for the current state of a hook failure.
 */
export async function retryDeadLetter(
  db: Kysely<Database>,
  registry: HookRegistry,
  id: string,
): Promise<{ ok: boolean; error?: string } | null> {
  // Claim the entry and count the attempt in one statement, so two concurrent
  // retries cannot both replay the same entry.
  const [claimed] = await db
    .updateTable('hook_dead_letter')
    .set((eb) => ({ retry_count: eb('retry_count', '+', 1) }))
    .where('id', '=', id)
    .where('resolved_at', 'is', null)
    .returningAll()
    .execute();

  if (!claimed) return null;

  const event = eventFromDeadLetter(claimed);
  if (!event) {
    return { ok: false, error: 'Stored event data is not a replayable event' };
  }

  try {
    await processFirehoseEvent(db, registry, event);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, deadLetterId: id }, 'Dead letter replay threw');
    return { ok: false, error: message };
  }



  if (claimed.hook_phase === 'storage') {
    const stored = await db
      .selectFrom('pds_record')
      .where('uri', '=', event.uri)
      .select('uri')
      .executeTakeFirst();
    if (!stored) {
      return { ok: false, error: 'Record still could not be stored' };
    }
  }

  await db
    .updateTable('hook_dead_letter')
    .set({ resolved_at: new Date() })
    .where('id', '=', id)
    .where('resolved_at', 'is', null)
    .execute();

  return { ok: true };
}

function eventFromDeadLetter(row: {
  event_data: Record<string, unknown> | null;
}): FirehoseEvent | null {
  const raw = row.event_data;
  const data: unknown = typeof raw === 'string' ? safeParse(raw) : raw;
  if (!data || typeof data !== 'object') return null;

  const d = data as Record<string, unknown>;
  const { uri, did, operation } = d;
  if (typeof uri !== 'string' || typeof did !== 'string') return null;
  if (operation !== 'create' && operation !== 'update' && operation !== 'delete') {
    return null;
  }

  return {
    seq: typeof d.seq === 'number' ? d.seq : 0,
    did: did as DID,
    operation,
    uri: uri as AtUri,
    cid: (typeof d.cid === 'string' ? d.cid : '') as CID,
    record: (d.record ?? undefined) as Record<string, unknown> | undefined,
    time: typeof d.time === 'string' ? d.time : new Date().toISOString(),
  };
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
