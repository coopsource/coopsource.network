import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // system_config — controls setup mode
  await db.schema
    .createTable('system_config')
    .addColumn('key', 'text', (col) => col.primaryKey())
    .addColumn('value', 'jsonb', (col) => col.notNull())
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .execute();

  // fact_log — append-only audit trail
  await db.schema
    .createTable('fact_log')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('entity_type', 'text', (col) => col.notNull())
    .addColumn('entity_id', 'text', (col) => col.notNull())
    .addColumn('field', 'text', (col) => col.notNull())
    .addColumn('old_value', 'jsonb')
    .addColumn('new_value', 'jsonb')
    .addColumn('changed_by', 'text')
    .addColumn('changed_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('reason', 'text')
    .addColumn('ip_address', sql.raw('inet'))
    .execute();

  await db.schema
    .createIndex('idx_fact_log_entity')
    .on('fact_log')
    .columns(['entity_type', 'entity_id', 'changed_at'])
    .execute();

  await db.schema
    .createIndex('idx_fact_log_changed_at')
    .on('fact_log')
    .column('changed_at')
    .execute();

  // Trigger to prevent mutation of fact_log rows
  await sql`
    CREATE FUNCTION prevent_fact_log_mutation() RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'fact_log is immutable — UPDATE and DELETE are not allowed';
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db);

  await sql`
    CREATE TRIGGER fact_log_immutable
      BEFORE UPDATE OR DELETE ON fact_log
      FOR EACH ROW
      EXECUTE FUNCTION prevent_fact_log_mutation();
  `.execute(db);

  // fact_log_redaction — privacy redactions without mutating the log
  await db.schema
    .createTable('fact_log_redaction')
    .addColumn('fact_log_id', 'uuid', (col) =>
      col.primaryKey().references('fact_log.id'),
    )
    .addColumn('redacted_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('redacted_by', 'text')
    .addColumn('request_id', 'uuid')
    .execute();

  // data_deletion_request — permanent record of privacy requests
  await db.schema
    .createTable('data_deletion_request')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('entity_did', 'text', (col) => col.notNull())
    .addColumn('requested_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('completed_at', 'timestamptz')
    .addColumn('requested_by', 'text', (col) => col.notNull())
    .addColumn('reason', 'text')
    .execute();

  // Add FK from fact_log_redaction.request_id to data_deletion_request
  await sql`
    ALTER TABLE fact_log_redaction
      ADD CONSTRAINT fk_fact_log_redaction_request
      FOREIGN KEY (request_id) REFERENCES data_deletion_request(id);
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE fact_log_redaction
      DROP CONSTRAINT IF EXISTS fk_fact_log_redaction_request;
  `.execute(db);
  await db.schema.dropTable('data_deletion_request').execute();
  await db.schema.dropTable('fact_log_redaction').execute();
  await sql`DROP TRIGGER IF EXISTS fact_log_immutable ON fact_log`.execute(db);
  await sql`DROP FUNCTION IF EXISTS prevent_fact_log_mutation()`.execute(db);
  await db.schema.dropTable('fact_log').execute();
  await db.schema.dropTable('system_config').execute();
}
