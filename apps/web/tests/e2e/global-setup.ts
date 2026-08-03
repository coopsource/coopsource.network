import pg from 'pg';
import { Kysely, PostgresDialect, FileMigrationProvider, Migrator } from 'kysely';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB_URL =
  process.env.E2E_DATABASE_URL ??
  'postgresql://coopsource:dev_password@localhost:5433/coopsource_test';
const derivedAdminUrl = new URL(TEST_DB_URL);
derivedAdminUrl.pathname = '/postgres';
const ADMIN_URL = process.env.E2E_DATABASE_ADMIN_URL ?? derivedAdminUrl.toString();

// Derived, not hardcoded: this admin URL already follows E2E_DATABASE_URL, so a
// literal name here would drop `coopsource_test` while the run used a different
// database — the same defect the API harness had.
const TEST_DB_NAME = (() => {
  const name = decodeURIComponent(new URL(TEST_DB_URL).pathname.replace(/^\//, ''));
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    throw new Error(`Refusing to use E2E database name '${name}'`);
  }
  return name;
})();

async function globalSetup(): Promise<void> {
  // Drop and recreate the test database
  const client = new pg.Client({ connectionString: ADMIN_URL });
  await client.connect();
  try {
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [TEST_DB_NAME],
    );
    await client.query(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}"`);
    await client.query(`CREATE DATABASE "${TEST_DB_NAME}"`);
  } finally {
    await client.end();
  }

  // Run migrations
  const db = new Kysely<Record<string, unknown>>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({
        connectionString: TEST_DB_URL,
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

  await db.destroy();
  console.log(`E2E: Test database ${TEST_DB_NAME} ready`);
}

// Self-execute when run as a standalone script
globalSetup().catch((err) => {
  console.error(err);
  process.exit(1);
});
