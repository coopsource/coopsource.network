import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // invitation — cooperative membership invitations
  await db.schema
    .createTable('invitation')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('cooperative_did', 'text', (col) =>
      col.notNull().references('entity.did'),
    )
    .addColumn('invitee_did', 'text', (col) => col.references('entity.did'))
    .addColumn('invitee_email', 'text')
    .addColumn('invited_by_did', 'text', (col) =>
      col.notNull().references('entity.did'),
    )
    .addColumn('intended_roles', sql`text[]`, (col) =>
      col.notNull().defaultTo(sql`'{member}'`),
    )
    .addColumn('token', 'text', (col) => col.unique().notNull())
    .addColumn('message', 'text')
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('pending'))
    .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('invalidated_at', 'timestamptz')
    .addColumn('invalidated_by', 'text', (col) =>
      col.references('entity.did'),
    )
    .execute();

  await sql`
    ALTER TABLE invitation
      ADD CONSTRAINT invitation_status_check
      CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'revoked'));
  `.execute(db);

  // membership — bilateral cooperative membership
  await db.schema
    .createTable('membership')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('member_did', 'text', (col) =>
      col.notNull().references('entity.did'),
    )
    .addColumn('cooperative_did', 'text', (col) =>
      col.notNull().references('entity.did'),
    )
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('pending'))
    .addColumn('member_record_uri', 'text')
    .addColumn('member_record_cid', 'text')
    .addColumn('approval_record_uri', 'text')
    .addColumn('approval_record_cid', 'text')
    .addColumn('invited_by_did', 'text', (col) =>
      col.references('entity.did'),
    )
    .addColumn('invitation_id', 'uuid', (col) =>
      col.references('invitation.id'),
    )
    .addColumn('joined_at', 'timestamptz')
    .addColumn('departed_at', 'timestamptz')
    .addColumn('status_reason', 'text')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('created_by', 'text', (col) => col.references('entity.did'))
    .addColumn('invalidated_at', 'timestamptz')
    .addColumn('invalidated_by', 'text', (col) =>
      col.references('entity.did'),
    )
    .addColumn('indexed_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .execute();

  await sql`
    ALTER TABLE membership
      ADD CONSTRAINT membership_status_check
      CHECK (status IN ('pending', 'active', 'suspended', 'departed'));
  `.execute(db);

  // Partial unique index: only one active membership per member+cooperative
  await sql`
    CREATE UNIQUE INDEX membership_active_unique
      ON membership(member_did, cooperative_did)
      WHERE invalidated_at IS NULL;
  `.execute(db);

  // membership_role — roles assigned to a membership
  await db.schema
    .createTable('membership_role')
    .addColumn('membership_id', 'uuid', (col) =>
      col.notNull().references('membership.id'),
    )
    .addColumn('role', 'text', (col) => col.notNull())
    .addColumn('indexed_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .execute();

  await sql`
    ALTER TABLE membership_role
      ADD CONSTRAINT membership_role_pkey
      PRIMARY KEY (membership_id, role);
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('membership_role').execute();
  await db.schema.dropTable('membership').execute();
  await db.schema.dropTable('invitation').execute();
}
