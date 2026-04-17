import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Cooperative scripting engine tables.
 *
 * Part of V7 P8 — allows cooperatives to define custom TypeScript scripts
 * that execute in Worker Thread sandboxes in response to firehose events
 * or domain events.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // ── Cooperative scripts ────────────────────────────────────────────────

  await db.schema
    .createTable('cooperative_script')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('source_code', 'text', (col) => col.notNull())
    .addColumn('compiled_js', 'text')
    .addColumn('phase', 'text', (col) => col.notNull())
    .addColumn('collections', sql`text[]`)
    .addColumn('event_types', sql`text[]`)
    .addColumn('priority', 'integer', (col) => col.notNull().defaultTo(200))
    .addColumn('enabled', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('config', 'jsonb')
    .addColumn('timeout_ms', 'integer', (col) => col.notNull().defaultTo(5000))
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .execute();

  // Check constraint for phase values
  await sql`
    ALTER TABLE cooperative_script
    ADD CONSTRAINT check_script_phase
    CHECK (phase IN ('pre-storage', 'post-storage', 'domain-event'))
  `.execute(db);

  // Partial index for fast lookup of enabled scripts
  await sql`
    CREATE INDEX idx_coop_script_lookup
      ON cooperative_script (cooperative_did, enabled)
      WHERE enabled = true
  `.execute(db);

  // ── Script execution log ───────────────────────────────────────────────

  await db.schema
    .createTable('script_execution_log')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('script_id', 'uuid', (col) =>
      col.notNull().references('cooperative_script.id').onDelete('cascade'),
    )
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('trigger_type', 'text', (col) => col.notNull())
    .addColumn('trigger_detail', 'text')
    .addColumn('duration_ms', 'integer', (col) => col.notNull())
    .addColumn('status', 'text', (col) => col.notNull())
    .addColumn('error', 'text')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .execute();

  // Check constraint for status values
  await sql`
    ALTER TABLE script_execution_log
    ADD CONSTRAINT check_script_exec_status
    CHECK (status IN ('success', 'error', 'timeout'))
  `.execute(db);

  // Index for listing logs by cooperative
  await sql`
    CREATE INDEX idx_script_exec_log
      ON script_execution_log (cooperative_did, created_at DESC)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('script_execution_log').ifExists().execute();
  await db.schema.dropTable('cooperative_script').ifExists().execute();
}
