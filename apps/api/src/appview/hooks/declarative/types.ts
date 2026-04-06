/**
 * Declarative hook configuration types.
 *
 * A DeclarativeHookConfig describes how to map an ATProto record to a
 * PostgreSQL materialized view table — without writing any TypeScript handler code.
 * The generic declarative handler interprets these configs at runtime.
 */

// ─── Core config ────────────────────────────────────────────────────────

export interface DeclarativeHookConfig {
  /** ATProto collection NSID (e.g., 'network.coopsource.admin.officer') */
  collection: string;
  /** Target PostgreSQL table name */
  targetTable: string;
  /** Primary key for locating existing rows */
  primaryKey: { column: string; source: 'event.uri' | 'event.did' };
  /** 'update-only' skips when row doesn't exist; 'upsert' does INSERT ON CONFLICT */
  writeMode: 'update-only' | 'upsert';
  /** How to handle delete operations */
  deleteStrategy: 'soft-delete' | 'hard-delete' | 'ignore';
  /** Column for soft-delete timestamp (required when deleteStrategy is 'soft-delete') */
  softDeleteColumn?: string;
  /** Field-to-column mappings for the record content */
  fieldMappings: FieldMapping[];
  /** Counter updates on related tables (e.g., RSVP count) */
  counterMappings?: CounterMapping[];
  /** Event emissions on specific operations (reserved for future use) */
  events?: EventMapping[];
  /** Column to set to NOW() on every write */
  indexedAtColumn?: string;
  /** Additional columns to set to NOW() on every write (e.g., 'updated_at') */
  additionalTimestampColumns?: string[];
}

// ─── Field mapping ──────────────────────────────────────────────────────

export interface FieldMapping {
  /** Dot-path into the record content (e.g., 'certifiedBy', 'redLines') */
  recordField: string;
  /** Target PostgreSQL column name (e.g., 'certified_by', 'red_lines') */
  column: string;
  /** Optional transform to apply before writing */
  transform?: 'json_stringify' | 'date_parse';
  /** Default value when the record field is missing/undefined */
  defaultValue?: unknown;
}

// ─── Counter mapping ────────────────────────────────────────────────────

export interface CounterMapping {
  /** Table containing the counter column */
  targetTable: string;
  /** Column to increment/decrement */
  column: string;
  /** Foreign key linking the record to the counter row */
  foreignKey: { recordField: string; column: string };
}

// ─── Event mapping ──────────────────────────────────────────────────────

export interface EventMapping {
  /** Which operation triggers this event */
  operation: 'create' | 'update' | 'delete';
  /** Event type string to emit */
  eventType: string;
  /** Map of event data fields to record fields */
  dataMapping: Record<string, string>;
}
