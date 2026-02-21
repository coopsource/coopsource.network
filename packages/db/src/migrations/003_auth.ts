import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // entity_key — cryptographic keys for entities
  await db.schema
    .createTable('entity_key')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('entity_did', 'text', (col) =>
      col.notNull().references('entity.did'),
    )
    .addColumn('key_type', 'text', (col) => col.notNull().defaultTo('ES256'))
    .addColumn('public_key_jwk', 'text', (col) => col.notNull())
    .addColumn('private_key_enc', 'text', (col) => col.notNull())
    .addColumn('key_purpose', 'text', (col) =>
      col.notNull().defaultTo('signing'),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('rotated_at', 'timestamptz')
    .addColumn('invalidated_at', 'timestamptz')
    .execute();

  // auth_credential — login credentials for entities
  await db.schema
    .createTable('auth_credential')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('entity_did', 'text', (col) =>
      col.notNull().references('entity.did'),
    )
    .addColumn('credential_type', 'text', (col) =>
      col.notNull().defaultTo('password'),
    )
    .addColumn('identifier', 'text', (col) => col.notNull())
    .addColumn('secret_hash', 'text')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('last_used_at', 'timestamptz')
    .addColumn('invalidated_at', 'timestamptz')
    .execute();

  await sql`
    ALTER TABLE auth_credential
      ADD CONSTRAINT auth_credential_type_identifier_unique
      UNIQUE (credential_type, identifier);
  `.execute(db);

  // session — express-session store
  await db.schema
    .createTable('session')
    .addColumn('sid', 'text', (col) => col.primaryKey())
    .addColumn('sess', 'jsonb', (col) => col.notNull())
    .addColumn('expire', 'timestamptz', (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex('idx_session_expire')
    .on('session')
    .column('expire')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('session').execute();
  await db.schema.dropTable('auth_credential').execute();
  await db.schema.dropTable('entity_key').execute();
}
