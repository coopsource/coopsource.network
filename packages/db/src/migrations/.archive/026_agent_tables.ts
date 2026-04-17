import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Migration 026 — AI Agent tables + model provider config
 *
 * Creates 5 tables:
 * 1. model_provider_config — per-co-op AI model provider credentials (mirrors payment_provider_config)
 * 2. agent_config — agent definitions with model routing config
 * 3. agent_session — conversation sessions
 * 4. agent_message — individual messages within sessions
 * 5. agent_usage — aggregated token/cost usage per period
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // ── model_provider_config ─────────────────────────────────────────────
  await db.schema
    .createTable('model_provider_config')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('provider_id', 'text', (col) => col.notNull())
    .addColumn('display_name', 'text', (col) => col.notNull())
    .addColumn('enabled', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('credentials_enc', 'text', (col) => col.notNull())
    .addColumn('allowed_models', 'jsonb', (col) =>
      col.notNull().defaultTo(sql`'[]'::jsonb`),
    )
    .addColumn('config', 'jsonb')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint('uq_mpc_coop_provider', [
      'cooperative_did',
      'provider_id',
    ])
    .execute();

  await db.schema
    .createIndex('idx_mpc_cooperative')
    .on('model_provider_config')
    .column('cooperative_did')
    .execute();

  // ── agent_config ──────────────────────────────────────────────────────
  await db.schema
    .createTable('agent_config')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('agent_type', 'text', (col) =>
      col.notNull().defaultTo('custom'),
    )
    .addColumn('model_config', 'jsonb', (col) => col.notNull())
    .addColumn('system_prompt', 'text', (col) => col.notNull())
    .addColumn('allowed_tools', 'jsonb', (col) =>
      col.notNull().defaultTo(sql`'[]'::jsonb`),
    )
    .addColumn('context_sources', 'jsonb', (col) =>
      col.notNull().defaultTo(sql`'[]'::jsonb`),
    )
    .addColumn('temperature', 'real', (col) =>
      col.notNull().defaultTo(0.7),
    )
    .addColumn('max_tokens_per_request', 'integer', (col) =>
      col.notNull().defaultTo(4096),
    )
    .addColumn('max_tokens_per_session', 'integer', (col) =>
      col.notNull().defaultTo(100000),
    )
    .addColumn('monthly_budget_cents', 'integer')
    .addColumn('enabled', 'boolean', (col) =>
      col.notNull().defaultTo(true),
    )
    .addColumn('created_by', 'text', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('idx_agent_config_coop')
    .on('agent_config')
    .column('cooperative_did')
    .execute();

  // ── agent_session ─────────────────────────────────────────────────────
  await db.schema
    .createTable('agent_session')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('agent_config_id', 'uuid', (col) =>
      col.notNull().references('agent_config.id').onDelete('cascade'),
    )
    .addColumn('user_did', 'text', (col) => col.notNull())
    .addColumn('title', 'text')
    .addColumn('status', 'text', (col) =>
      col.notNull().defaultTo('active'),
    )
    .addColumn('total_input_tokens', 'integer', (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('total_output_tokens', 'integer', (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('total_cost_microdollars', 'integer', (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('memory', 'jsonb', (col) =>
      col.notNull().defaultTo(sql`'{}'::jsonb`),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('expires_at', 'timestamptz')
    .execute();

  await db.schema
    .createIndex('idx_agent_session_config')
    .on('agent_session')
    .column('agent_config_id')
    .execute();

  await db.schema
    .createIndex('idx_agent_session_user')
    .on('agent_session')
    .column('user_did')
    .execute();

  // ── agent_message ─────────────────────────────────────────────────────
  await db.schema
    .createTable('agent_message')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('session_id', 'uuid', (col) =>
      col.notNull().references('agent_session.id').onDelete('cascade'),
    )
    .addColumn('role', 'text', (col) => col.notNull())
    .addColumn('content', 'text', (col) => col.notNull())
    .addColumn('tool_calls', 'jsonb')
    .addColumn('input_tokens', 'integer', (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('output_tokens', 'integer', (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('cost_microdollars', 'integer', (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('model', 'text')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('idx_agent_message_session')
    .on('agent_message')
    .column('session_id')
    .execute();

  // ── agent_usage ───────────────────────────────────────────────────────
  await db.schema
    .createTable('agent_usage')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('agent_config_id', 'uuid', (col) =>
      col.references('agent_config.id').onDelete('set null'),
    )
    .addColumn('period', 'text', (col) => col.notNull())
    .addColumn('total_requests', 'integer', (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('total_input_tokens', 'integer', (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('total_output_tokens', 'integer', (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('total_cost_microdollars', 'integer', (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('idx_agent_usage_coop_period')
    .on('agent_usage')
    .columns(['cooperative_did', 'period'])
    .execute();

  // Unique constraint for upsert on usage tracking
  await db.schema
    .alterTable('agent_usage')
    .addUniqueConstraint('uq_agent_usage_coop_agent_period', [
      'cooperative_did',
      'agent_config_id',
      'period',
    ])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('agent_usage').execute();
  await db.schema.dropTable('agent_message').execute();
  await db.schema.dropTable('agent_session').execute();
  await db.schema.dropTable('agent_config').execute();
  await db.schema.dropTable('model_provider_config').execute();
}
