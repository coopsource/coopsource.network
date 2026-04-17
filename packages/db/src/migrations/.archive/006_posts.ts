import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // thread — private discussion threads within a cooperative
  await db.schema
    .createTable('thread')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('cooperative_did', 'text', (col) =>
      col.notNull().references('entity.did'),
    )
    .addColumn('title', 'text')
    .addColumn('thread_type', 'text', (col) =>
      col.notNull().defaultTo('discussion'),
    )
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('open'))
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('created_by', 'text', (col) =>
      col.notNull().references('entity.did'),
    )
    .addColumn('invalidated_at', 'timestamptz')
    .addColumn('invalidated_by', 'text', (col) =>
      col.references('entity.did'),
    )
    .execute();

  await sql`
    ALTER TABLE thread
      ADD CONSTRAINT thread_type_check
      CHECK (thread_type IN ('discussion', 'direct', 'announcement'));
  `.execute(db);

  await sql`
    ALTER TABLE thread
      ADD CONSTRAINT thread_status_check
      CHECK (status IN ('open', 'closed', 'archived'));
  `.execute(db);

  // thread_member — participants in a thread
  await db.schema
    .createTable('thread_member')
    .addColumn('thread_id', 'uuid', (col) =>
      col.notNull().references('thread.id'),
    )
    .addColumn('entity_did', 'text', (col) =>
      col.notNull().references('entity.did'),
    )
    .addColumn('joined_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('last_read_at', 'timestamptz')
    .execute();

  await sql`
    ALTER TABLE thread_member
      ADD CONSTRAINT thread_member_pkey
      PRIMARY KEY (thread_id, entity_did);
  `.execute(db);

  // post — messages within a thread
  await db.schema
    .createTable('post')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('thread_id', 'uuid', (col) =>
      col.notNull().references('thread.id'),
    )
    .addColumn('author_did', 'text', (col) =>
      col.notNull().references('entity.did'),
    )
    .addColumn('body', 'text', (col) => col.notNull())
    .addColumn('body_format', 'text', (col) =>
      col.notNull().defaultTo('markdown'),
    )
    .addColumn('parent_post_id', 'uuid', (col) => col.references('post.id'))
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('active'))
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('edited_at', 'timestamptz')
    .addColumn('invalidated_at', 'timestamptz')
    .addColumn('invalidated_by', 'text', (col) =>
      col.references('entity.did'),
    )
    .execute();

  await sql`
    ALTER TABLE post
      ADD CONSTRAINT post_body_format_check
      CHECK (body_format IN ('plain', 'markdown'));
  `.execute(db);

  await sql`
    ALTER TABLE post
      ADD CONSTRAINT post_status_check
      CHECK (status IN ('active', 'edited', 'deleted'));
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('post').execute();
  await db.schema.dropTable('thread_member').execute();
  await db.schema.dropTable('thread').execute();
}
