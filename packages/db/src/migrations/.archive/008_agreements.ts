import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // agreement — multi-stakeholder agreements
  await db.schema
    .createTable('agreement')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('uri', 'text', (col) => col.unique())
    .addColumn('cid', 'text')
    .addColumn('cooperative_did', 'text', (col) =>
      col.notNull().references('entity.did'),
    )
    .addColumn('created_by', 'text', (col) =>
      col.notNull().references('entity.did'),
    )
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('agreement_type', 'text', (col) =>
      col.notNull().defaultTo('custom'),
    )
    .addColumn('body', 'text', (col) => col.notNull())
    .addColumn('body_format', 'text', (col) =>
      col.notNull().defaultTo('markdown'),
    )
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('draft'))
    .addColumn('parent_agreement_uri', 'text')
    .addColumn('effective_date', 'timestamptz')
    .addColumn('expires_at', 'timestamptz')
    .addColumn('executed_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('invalidated_at', 'timestamptz')
    .addColumn('invalidated_by', 'text', (col) =>
      col.references('entity.did'),
    )
    .addColumn('indexed_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .execute();

  await sql`
    ALTER TABLE agreement
      ADD CONSTRAINT agreement_type_check
      CHECK (agreement_type IN ('membership', 'revenueShare', 'contribution', 'service', 'governance', 'custom'));
  `.execute(db);

  await sql`
    ALTER TABLE agreement
      ADD CONSTRAINT agreement_status_check
      CHECK (status IN ('draft', 'open', 'executed', 'expired', 'voided'));
  `.execute(db);

  // agreement_party — parties to an agreement
  await db.schema
    .createTable('agreement_party')
    .addColumn('agreement_id', 'uuid', (col) =>
      col.notNull().references('agreement.id'),
    )
    .addColumn('entity_did', 'text', (col) =>
      col.notNull().references('entity.did'),
    )
    .addColumn('required', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('added_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .execute();

  await sql`
    ALTER TABLE agreement_party
      ADD CONSTRAINT agreement_party_pkey
      PRIMARY KEY (agreement_id, entity_did);
  `.execute(db);

  // agreement_signature — cryptographic signatures on agreements
  await db.schema
    .createTable('agreement_signature')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('uri', 'text', (col) => col.unique())
    .addColumn('cid', 'text')
    .addColumn('agreement_id', 'uuid', (col) =>
      col.notNull().references('agreement.id'),
    )
    .addColumn('agreement_uri', 'text', (col) => col.notNull())
    .addColumn('agreement_cid', 'text', (col) => col.notNull())
    .addColumn('signer_did', 'text', (col) =>
      col.notNull().references('entity.did'),
    )
    .addColumn('statement', 'text')
    .addColumn('signed_at', 'timestamptz', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('retracted_at', 'timestamptz')
    .addColumn('retracted_by', 'text', (col) =>
      col.references('entity.did'),
    )
    .addColumn('retraction_reason', 'text')
    .addColumn('indexed_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .execute();

  await sql`
    ALTER TABLE agreement_signature
      ADD CONSTRAINT agreement_signature_agreement_signer_unique
      UNIQUE (agreement_id, signer_did);
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('agreement_signature').execute();
  await db.schema.dropTable('agreement_party').execute();
  await db.schema.dropTable('agreement').execute();
}
