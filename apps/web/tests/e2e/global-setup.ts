import pg from 'pg';
import { Kysely, PostgresDialect, FileMigrationProvider, Migrator, sql } from 'kysely';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB_NAME = 'coopsource_test';
const ADMIN_URL = 'postgresql://localhost:5432/postgres';

export default async function globalSetup(): Promise<void> {
  // Drop and recreate the test database
  const client = new pg.Client({ connectionString: ADMIN_URL });
  await client.connect();
  try {
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [TEST_DB_NAME],
    );
    await client.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await client.query(`CREATE DATABASE ${TEST_DB_NAME}`);
  } finally {
    await client.end();
  }

  // Run migrations
  const db = new Kysely<Record<string, unknown>>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({
        connectionString: `postgresql://localhost:5432/${TEST_DB_NAME}`,
        max: 3,
      }),
    }),
  });

  const migrationsPath = path.resolve(
    __dirname,
    '../../../../packages/db/src/migrations',
  );
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: migrationsPath,
    }),
  });

  const { error } = await migrator.migrateToLatest();
  if (error) {
    await db.destroy();
    throw error;
  }

  // Drop FK constraints that block PDS operations before entity insertion
  // (same as API test helper)
  await sql`ALTER TABLE pds_record DROP CONSTRAINT IF EXISTS pds_record_did_fkey`.execute(db);
  await sql`ALTER TABLE pds_commit DROP CONSTRAINT IF EXISTS pds_commit_did_fkey`.execute(db);

  await db.destroy();
  console.log(`E2E: Test database ${TEST_DB_NAME} ready`);
}
