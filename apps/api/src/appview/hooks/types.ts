import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { FirehoseEvent } from '@coopsource/federation';
import type { DID } from '@coopsource/common';

// ─── Hook phases and sources ─────────────────────────────────────────────

export type HookPhase = 'pre-storage' | 'post-storage';
export type HookSource = 'builtin' | 'declarative' | 'script';

// ─── Hook context ────────────────────────────────────────────────────────

/**
 * Preview of what will be / was stored in pds_record.
 *
 * At pre-storage phase: this is what WILL be stored (transforms can modify it).
 * At post-storage phase: this is what WAS stored.
 */
export interface PdsRecordPreview {
  uri: string;
  did: string;
  collection: string;
  rkey: string;
  cid: string;
  content: Record<string, unknown> | undefined; // undefined on delete
}

/**
 * Context passed to every hook handler.
 */
export interface HookContext {
  db: Kysely<Database>;
  event: FirehoseEvent;
  record: PdsRecordPreview;
  collection: string;
  did: DID;
  operation: 'create' | 'update' | 'delete';
}

// ─── Pre-storage result ──────────────────────────────────────────────────

export interface PreStorageResult {
  /** 'store' = proceed normally, 'skip' = don't store, 'transform' = store modified record */
  action: 'store' | 'skip' | 'transform';
  /** Modified record content (only when action === 'transform') */
  transformedRecord?: Record<string, unknown>;
  /** Reason for skipping (only when action === 'skip') */
  reason?: string;
}

// ─── Hook registration ───────────────────────────────────────────────────

export interface HookRegistration {
  id: string;
  name: string;
  phase: HookPhase;
  source: HookSource;
  /** Collection patterns: exact match or wildcard (e.g., 'network.coopsource.admin.*') */
  collections: string[];
  /** Priority within phase. Lower = earlier. builtin: 0-99, declarative: 100-199, script: 200+ */
  priority: number;
  /** Handler for pre-storage hooks */
  preHandler?: (ctx: HookContext) => Promise<PreStorageResult>;
  /** Handler for post-storage hooks */
  postHandler?: (ctx: HookContext) => Promise<void>;
}

// ─── Firehose health (extended) ──────────────────────────────────────────

export interface FirehoseHealthExtended {
  mode: 'tap' | 'local';
  lastSeq: number;
  lastEventAt: string | null;
  errorCount: number;
  validationWarnings: number;
  startedAt: string;
}
