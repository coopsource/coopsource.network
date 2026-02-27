import pg from 'pg';
import { Kysely, PostgresDialect, FileMigrationProvider, Migrator, sql } from 'kysely';
import type { Database } from '@coopsource/db';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB_NAME = 'coopsource_test';
const ADMIN_URL = 'postgresql://localhost:5432/postgres';

export function getTestConnectionString(): string {
  return process.env.TEST_DATABASE_URL ?? `postgresql://localhost:5432/${TEST_DB_NAME}`;
}

export async function createTestDb(): Promise<void> {
  const client = new pg.Client({ connectionString: ADMIN_URL });
  await client.connect();
  try {
    // Drop and recreate to ensure clean migration state
    // Terminate any active connections first
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [TEST_DB_NAME],
    );
    await client.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await client.query(`CREATE DATABASE ${TEST_DB_NAME}`);
  } finally {
    await client.end();
  }
}

export async function migrateTestDb(): Promise<void> {
  const db = getTestDb();
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
    throw error;
  }
}

let _db: Kysely<Database> | null = null;

export function getTestDb(): Kysely<Database> {
  if (!_db) {
    _db = new Kysely<Database>({
      dialect: new PostgresDialect({
        pool: new pg.Pool({
          connectionString: getTestConnectionString(),
          max: 5,
        }),
      }),
    });
  }
  return _db;
}

export async function truncateAllTables(): Promise<void> {
  const db = getTestDb();
  await sql`
    TRUNCATE TABLE
      connection_binding, external_connection,
      agreement_template, role_definition,
      stakeholder_terms, agreement_revision, agreement_signature, agreement,
      interest_map, desired_outcome, stakeholder_interest,
      funding_pledge, funding_campaign,
      vote, proposal,
      post, thread_member, thread,
      membership_role, membership, invitation,
      pds_commit, pds_record, pds_firehose_cursor, plc_operation,
      auth_credential, entity_key, session,
      cooperative_profile, entity,
      fact_log_redaction, fact_log,
      data_deletion_request, system_config
    CASCADE
  `.execute(db);
}

export async function destroyTestDb(): Promise<void> {
  if (_db) {
    await _db.destroy();
    _db = null;
  }
}
