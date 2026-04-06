import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { FirehoseEvent } from '@coopsource/federation';
import type { DID } from '@coopsource/common';
import { logger } from '../../middleware/logger.js';
import { collectionFromUri } from '../utils.js';
import type { HookContext, PdsRecordPreview, PreStorageResult } from './types.js';
import type { HookRegistry } from './registry.js';
import { recordDeadLetter } from './dead-letter.js';

// ─── Health state ────────────────────────────────────────────────────────

const healthState = {
  validationWarnings: 0,
};

export function getValidationWarnings(): number {
  return healthState.validationWarnings;
}

export function incrementValidationWarnings(): void {
  healthState.validationWarnings++;
}

// ─── Pipeline ────────────────────────────────────────────────────────────

/**
 * Process a firehose event through the hook pipeline.
 *
 * 1. Build PdsRecordPreview from the event
 * 2. Run pre-storage hooks (can transform, skip, or pass through)
 * 3. Upsert into pds_record (source of truth)
 * 4. Run post-storage hooks (build materialized views, emit events)
 *
 * Fail-open: pre-storage hook errors → dead letter + store original.
 * Post-storage hook errors → dead letter + continue remaining hooks.
 */
export async function processFirehoseEvent(
  db: Kysely<Database>,
  registry: HookRegistry,
  event: FirehoseEvent,
): Promise<void> {
  const collection = collectionFromUri(event.uri);
  const operation = event.operation;

  // Parse URI parts: at://did/collection/rkey
  const withoutScheme = event.uri.replace('at://', '');
  const parts = withoutScheme.split('/');
  const rkey = parts[2] ?? '';

  // Build the record preview
  let preview: PdsRecordPreview = {
    uri: event.uri,
    did: event.did,
    collection,
    rkey,
    cid: event.cid,
    content: event.record,
  };

  const ctx: HookContext = {
    db,
    event,
    record: preview,
    collection,
    did: event.did as DID,
    operation,
  };

  // ── 1. Pre-storage hooks ───────────────────────────────────────────────

  let shouldStore = true;
  const preHooks = registry.getPreStorageHooks(collection);

  for (const hook of preHooks) {
    try {
      const result = await hook.preHandler!(ctx);
      if (result.action === 'skip') {
        shouldStore = false;
        logger.debug({ collection, hookId: hook.id, reason: result.reason }, 'Pre-storage hook skipped record');
        break;
      }
      if (result.action === 'transform' && result.transformedRecord) {
        preview = { ...preview, content: result.transformedRecord };
        ctx.record = preview;
      }
    } catch (err) {
      // Fail-open: log to dead letter, continue with original record
      logger.error({ err, hookId: hook.id, collection }, 'Pre-storage hook error (fail-open)');
      await recordDeadLetter(db, {
        event,
        collection,
        operation,
        hookId: hook.id,
        hookPhase: 'pre-storage',
        error: err,
      }).catch((dlErr) => {
        logger.error({ err: dlErr, originalError: String(err), hookId: hook.id, collection }, 'Failed to record dead letter');
      });
    }
  }

  // ── 2. Upsert into pds_record (source of truth) ───────────────────────

  if (shouldStore) {
    try {
      if (operation === 'delete') {
        await db
          .updateTable('pds_record')
          .set({ deleted_at: new Date(), indexed_at: new Date() })
          .where('uri', '=', event.uri)
          .execute();
      } else {
        await db
          .insertInto('pds_record')
          .values({
            uri: event.uri,
            did: event.did,
            collection,
            rkey,
            cid: event.cid,
            content: JSON.stringify(preview.content ?? {}),
            indexed_at: new Date(),
          })
          .onConflict((oc) =>
            oc.column('uri').doUpdateSet({
              cid: event.cid,
              content: JSON.stringify(preview.content ?? {}),
              indexed_at: new Date(),
              deleted_at: null, // Clear any prior soft-delete
            }),
          )
          .execute();
      }
    } catch (err) {
      logger.error({ err, uri: event.uri }, 'Failed to upsert pds_record');
      // If pds_record write fails, still run post-storage hooks for backward compat
      // (the old switch statement didn't write to pds_record at all in Tap mode)
    }
  }

  // ── 3. Post-storage hooks ──────────────────────────────────────────────

  const postHooks = registry.getPostStorageHooks(collection);

  for (const hook of postHooks) {
    try {
      await hook.postHandler!(ctx);
    } catch (err) {
      // Dead letter + continue remaining hooks
      logger.error({ err, hookId: hook.id, collection }, 'Post-storage hook error');
      await recordDeadLetter(db, {
        event,
        collection,
        operation,
        hookId: hook.id,
        hookPhase: 'post-storage',
        error: err,
      }).catch((dlErr) => {
        logger.error({ err: dlErr, originalError: String(err), hookId: hook.id, collection }, 'Failed to record dead letter');
      });
    }
  }
}
