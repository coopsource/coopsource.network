import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Migration 027 — Agent trigger table
 *
 * Allows agents to be triggered by platform events (e.g. proposal.created, member.joined).
 * Each trigger maps an event type to an agent config, with optional conditions and cooldown.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('agent_trigger')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('agent_config_id', 'uuid', (col) =>
      col.notNull().references('agent_config.id').onDelete('cascade'),
    )
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('event_type', 'text', (col) => col.notNull())
    .addColumn('conditions', 'jsonb', (col) =>
      col.notNull().defaultTo(sql`'{}'::jsonb`),
    )
    .addColumn('prompt_template', 'text', (col) => col.notNull())
    .addColumn('cooldown_seconds', 'integer', (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('enabled', 'boolean', (col) =>
      col.notNull().defaultTo(true),
    )
    .addColumn('last_triggered_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('idx_agent_trigger_event')
    .on('agent_trigger')
    .columns(['cooperative_did', 'event_type'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('agent_trigger').execute();
}
