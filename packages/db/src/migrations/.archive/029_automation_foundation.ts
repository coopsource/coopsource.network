import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Migration 029 — Automation foundation
 *
 * 1. trigger_execution_log: audit trail for trigger firings
 * 2. agent_trigger: add actions column, make prompt_template nullable, fix conditions default
 * 3. notification: user-facing notifications from triggers and system events
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. trigger_execution_log table
  await db.schema
    .createTable('trigger_execution_log')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('trigger_id', 'uuid', (col) =>
      col.notNull().references('agent_trigger.id').onDelete('cascade'),
    )
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('event_type', 'text', (col) => col.notNull())
    .addColumn('event_data', 'jsonb', (col) => col.notNull())
    .addColumn('conditions_matched', 'boolean', (col) => col.notNull())
    .addColumn('actions_executed', 'jsonb', (col) =>
      col.notNull().defaultTo(sql`'[]'::jsonb`),
    )
    .addColumn('status', 'text', (col) =>
      col.notNull().defaultTo('pending'),
    )
    .addColumn('error', 'text')
    .addColumn('started_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('completed_at', 'timestamptz')
    .addColumn('duration_ms', 'integer')
    .execute();

  await db.schema
    .createIndex('idx_trigger_execution_log_trigger')
    .on('trigger_execution_log')
    .column('trigger_id')
    .execute();

  await db.schema
    .createIndex('idx_trigger_execution_log_coop_started')
    .on('trigger_execution_log')
    .columns(['cooperative_did', 'started_at'])
    .execute();

  // 2. Modify agent_trigger
  await sql`ALTER TABLE agent_trigger ADD COLUMN actions jsonb NOT NULL DEFAULT '[]'::jsonb`.execute(db);
  await sql`ALTER TABLE agent_trigger ALTER COLUMN prompt_template DROP NOT NULL`.execute(db);
  await sql`UPDATE agent_trigger SET conditions = '[]'::jsonb WHERE conditions = '{}'::jsonb`.execute(db);
  await sql`ALTER TABLE agent_trigger ALTER COLUMN conditions SET DEFAULT '[]'::jsonb`.execute(db);

  // 3. notification table
  await db.schema
    .createTable('notification')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('recipient_did', 'text', (col) => col.notNull())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('body', 'text')
    .addColumn('category', 'text', (col) =>
      col.notNull().defaultTo('automation'),
    )
    .addColumn('source_type', 'text')
    .addColumn('source_id', 'text')
    .addColumn('read', 'boolean', (col) =>
      col.notNull().defaultTo(false),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('idx_notification_recipient')
    .on('notification')
    .columns(['recipient_did', 'read', 'created_at'])
    .execute();

  await db.schema
    .createIndex('idx_notification_coop')
    .on('notification')
    .columns(['cooperative_did', 'created_at'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('notification').execute();

  await sql`ALTER TABLE agent_trigger DROP COLUMN actions`.execute(db);
  await sql`ALTER TABLE agent_trigger ALTER COLUMN prompt_template SET NOT NULL`.execute(db);
  await sql`ALTER TABLE agent_trigger ALTER COLUMN conditions SET DEFAULT '{}'::jsonb`.execute(db);

  await db.schema.dropTable('trigger_execution_log').execute();
}
