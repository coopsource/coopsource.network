import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // ─── Connector config table ─────────────────────────────────────────
  await db.schema
    .createTable('connector_config')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('connector_type', 'text', (col) => col.notNull())
    .addColumn('display_name', 'text', (col) => col.notNull())
    .addColumn('config', 'jsonb', (col) =>
      col.notNull().defaultTo(sql`'{}'::jsonb`),
    )
    .addColumn('enabled', 'boolean', (col) =>
      col.notNull().defaultTo(true),
    )
    .addColumn('last_sync_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addUniqueConstraint('uq_connector_config_coop_type', [
      'cooperative_did',
      'connector_type',
    ])
    .execute();

  await db.schema
    .createIndex('idx_connector_config_coop_enabled')
    .on('connector_config')
    .columns(['cooperative_did', 'enabled'])
    .execute();

  // ─── Connector sync log table ───────────────────────────────────────
  await db.schema
    .createTable('connector_sync_log')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('connector_config_id', 'text', (col) => col.notNull())
    .addColumn('direction', 'text', (col) => col.notNull())
    .addColumn('records_synced', 'integer', (col) => col.defaultTo(0))
    .addColumn('records_failed', 'integer', (col) => col.defaultTo(0))
    .addColumn('error_details', 'text')
    .addColumn('started_at', 'timestamptz', (col) => col.notNull())
    .addColumn('completed_at', 'timestamptz')
    .addColumn('status', 'text', (col) =>
      col.notNull().defaultTo('running'),
    )
    .execute();

  await sql`ALTER TABLE connector_sync_log ADD CONSTRAINT connector_sync_log_status_check
    CHECK (status IN ('running', 'completed', 'failed'))`.execute(db);

  await sql`ALTER TABLE connector_sync_log ADD CONSTRAINT connector_sync_log_direction_check
    CHECK (direction IN ('inbound', 'outbound', 'bidirectional'))`.execute(db);

  await db.schema
    .createIndex('idx_connector_sync_log_config_started')
    .on('connector_sync_log')
    .columns(['connector_config_id', 'started_at'])
    .execute();

  // ─── Connector field mapping table ──────────────────────────────────
  await db.schema
    .createTable('connector_field_mapping')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('connector_config_id', 'text', (col) => col.notNull())
    .addColumn('local_field', 'text', (col) => col.notNull())
    .addColumn('remote_field', 'text', (col) => col.notNull())
    .addColumn('transform', 'text')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addUniqueConstraint('uq_connector_field_mapping_config_local', [
      'connector_config_id',
      'local_field',
    ])
    .execute();

  // ─── Webhook endpoint table ─────────────────────────────────────────
  await db.schema
    .createTable('webhook_endpoint')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('url', 'text', (col) => col.notNull())
    .addColumn('event_types', sql.raw('text[]'), (col) => col.notNull())
    .addColumn('secret', 'text', (col) => col.notNull())
    .addColumn('enabled', 'boolean', (col) =>
      col.notNull().defaultTo(true),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .execute();

  await db.schema
    .createIndex('idx_webhook_endpoint_coop_enabled')
    .on('webhook_endpoint')
    .columns(['cooperative_did', 'enabled'])
    .execute();

  // ─── Webhook delivery log table ─────────────────────────────────────
  await db.schema
    .createTable('webhook_delivery_log')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('webhook_endpoint_id', 'text', (col) => col.notNull())
    .addColumn('event_type', 'text', (col) => col.notNull())
    .addColumn('payload', 'jsonb', (col) => col.notNull())
    .addColumn('response_status', 'integer')
    .addColumn('response_body', 'text')
    .addColumn('attempts', 'integer', (col) =>
      col.notNull().defaultTo(1),
    )
    .addColumn('delivered_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .execute();

  await db.schema
    .createIndex('idx_webhook_delivery_log_endpoint_created')
    .on('webhook_delivery_log')
    .columns(['webhook_endpoint_id', 'created_at'])
    .execute();

  await db.schema
    .createIndex('idx_webhook_delivery_log_event_created')
    .on('webhook_delivery_log')
    .columns(['event_type', 'created_at'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('webhook_delivery_log').ifExists().execute();
  await db.schema.dropTable('webhook_endpoint').ifExists().execute();
  await db.schema.dropTable('connector_field_mapping').ifExists().execute();
  await db.schema.dropTable('connector_sync_log').ifExists().execute();
  await db.schema.dropTable('connector_config').ifExists().execute();
}
