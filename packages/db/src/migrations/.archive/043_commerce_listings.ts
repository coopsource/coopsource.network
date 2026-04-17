import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // ─── Commerce listing table ─────────────────────────────────────────
  await db.schema
    .createTable('commerce_listing')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('category', 'text', (col) => col.notNull())
    .addColumn('availability', 'text', (col) =>
      col.notNull().defaultTo('available'),
    )
    .addColumn('location', 'text')
    .addColumn('cooperative_type', 'text')
    .addColumn('tags', sql.raw('text[]'), (col) =>
      col.defaultTo(sql`'{}'`),
    )
    .addColumn('uri', 'text')
    .addColumn('cid', 'text')
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('active'))
    .addColumn('created_by', 'text', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('indexed_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .execute();

  await sql`ALTER TABLE commerce_listing ADD CONSTRAINT commerce_listing_status_check
    CHECK (status IN ('active', 'paused', 'archived'))`.execute(db);

  await sql`ALTER TABLE commerce_listing ADD CONSTRAINT commerce_listing_availability_check
    CHECK (availability IN ('available', 'limited', 'unavailable'))`.execute(db);

  await db.schema
    .createIndex('idx_commerce_listing_coop_category')
    .on('commerce_listing')
    .columns(['cooperative_did', 'category'])
    .execute();

  await db.schema
    .createIndex('idx_commerce_listing_coop_status_created')
    .on('commerce_listing')
    .columns(['cooperative_did', 'status', 'created_at'])
    .execute();

  await db.schema
    .createIndex('idx_commerce_listing_category_status')
    .on('commerce_listing')
    .columns(['category', 'status'])
    .execute();

  // ─── Commerce need table ────────────────────────────────────────────
  await db.schema
    .createTable('commerce_need')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('cooperative_did', 'text', (col) => col.notNull())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('category', 'text', (col) => col.notNull())
    .addColumn('urgency', 'text', (col) =>
      col.notNull().defaultTo('normal'),
    )
    .addColumn('location', 'text')
    .addColumn('tags', sql.raw('text[]'), (col) =>
      col.defaultTo(sql`'{}'`),
    )
    .addColumn('uri', 'text')
    .addColumn('cid', 'text')
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('open'))
    .addColumn('created_by', 'text', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('indexed_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .execute();

  await sql`ALTER TABLE commerce_need ADD CONSTRAINT commerce_need_status_check
    CHECK (status IN ('open', 'matched', 'fulfilled', 'cancelled'))`.execute(db);

  await sql`ALTER TABLE commerce_need ADD CONSTRAINT commerce_need_urgency_check
    CHECK (urgency IN ('low', 'normal', 'high', 'urgent'))`.execute(db);

  await db.schema
    .createIndex('idx_commerce_need_coop_status_created')
    .on('commerce_need')
    .columns(['cooperative_did', 'status', 'created_at'])
    .execute();

  await db.schema
    .createIndex('idx_commerce_need_category_status')
    .on('commerce_need')
    .columns(['category', 'status'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('commerce_need').ifExists().execute();
  await db.schema.dropTable('commerce_listing').ifExists().execute();
}
