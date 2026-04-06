/**
 * Types for the sandboxed `ctx` object available to cooperative scripts.
 *
 * These types define the API surface that scripts can use. The actual
 * implementation is provided by the main thread via MessagePort callbacks.
 */

// ─── Top-level context ──────────────────────────────────────────────────

export interface ScriptContext {
  event: ScriptEvent;
  config: Record<string, unknown>;
  db: ScriptDbApi;
  http: ScriptHttpApi;
  email: ScriptEmailApi;
  pds: ScriptPdsApi;
  emitEvent: (type: string, data: Record<string, unknown>) => Promise<void>;
  log: ScriptLogApi;
}

// ─── Event ──────────────────────────────────────────────────────────────

export interface ScriptEvent {
  /** Collection NSID (for record hooks) or domain event type (for domain-event scripts) */
  type: string;
  /** Record operation: 'create' | 'update' | 'delete' (only for record hooks) */
  operation?: string;
  /** AT URI of the record (only for record hooks) */
  uri?: string;
  /** DID of the actor */
  did: string;
  /** Record content (only for record hooks with create/update) */
  record?: Record<string, unknown>;
  /** DID of the cooperative this script belongs to */
  cooperativeDid: string;
}

// ─── Database API ───────────────────────────────────────────────────────

export interface ScriptDbApi {
  /** Query records from a collection, scoped to the cooperative */
  query: (collection: string, filters?: ScriptDbQueryFilters) => Promise<ScriptRecord[]>;
  /** Get a single record by AT URI (scoped to cooperative) */
  get: (uri: string) => Promise<ScriptRecord | null>;
  /** Count records in a collection (scoped to cooperative) */
  count: (collection: string, filters?: ScriptDbCountFilters) => Promise<number>;
}

export interface ScriptDbQueryFilters {
  did?: string;
  limit?: number;
  offset?: number;
}

export interface ScriptDbCountFilters {
  did?: string;
}

export interface ScriptRecord {
  uri: string;
  did: string;
  collection: string;
  content: Record<string, unknown>;
}

// ─── HTTP API ───────────────────────────────────────────────────────────

export interface ScriptHttpApi {
  /** Fetch a URL (SSRF-protected, HTTPS only, no private addresses) */
  fetch: (url: string, options?: ScriptHttpOptions) => Promise<ScriptHttpResponse>;
}

export interface ScriptHttpOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface ScriptHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

// ─── Email API ──────────────────────────────────────────────────────────

export interface ScriptEmailApi {
  /** Send a notification email (uses the platform email service) */
  send: (params: ScriptEmailParams) => Promise<void>;
}

export interface ScriptEmailParams {
  to: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
}

// ─── PDS API ────────────────────────────────────────────────────────────

export interface ScriptPdsApi {
  /** Create a record in the cooperative's PDS (via OperatorWriteProxy) */
  createRecord: (params: ScriptPdsCreateParams) => Promise<ScriptPdsRecordRef>;
}

export interface ScriptPdsCreateParams {
  collection: string;
  record: Record<string, unknown>;
  rkey?: string;
}

export interface ScriptPdsRecordRef {
  uri: string;
  cid: string;
}

// ─── Logging API ────────────────────────────────────────────────────────

export interface ScriptLogApi {
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, data?: Record<string, unknown>) => void;
}

// ─── Serializable context (passed to worker) ────────────────────────────

/**
 * The subset of ScriptContext that can be passed via structured clone
 * to the Worker thread. Methods are replaced with MessagePort callbacks.
 */
export interface SerializableScriptContext {
  event: ScriptEvent;
  config: Record<string, unknown>;
  cooperativeDid: string;
}

// ─── Script execution result ────────────────────────────────────────────

export interface ScriptResult {
  success: boolean;
  error?: string;
  durationMs: number;
  logs: ScriptLogEntry[];
}

export interface ScriptLogEntry {
  level: 'info' | 'warn' | 'error';
  message: string;
  data?: Record<string, unknown>;
  timestamp: string;
}
