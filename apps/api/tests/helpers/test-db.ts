import pg from 'pg';
import {
  Kysely,
  PostgresDialect,
  FileMigrationProvider,
  Migrator,
  sql,
} from 'kysely';
import type { Database } from '@coopsource/db';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Each run gets its own database.
 *
 * A shared name made `createTestDb`'s drop-and-recreate destructive to any
 * concurrent run — the victim then fails on the first table of
 * `truncateAllTables`, which looks like a mass product regression rather than
 * a harness collision. It also put this suite in contention with the Playwright
 * harness over ownership of `coopsource_test`, which previously needed a manual
 * `psql DROP` between the two.
 *
 * Set `TEST_DATABASE_URL` to pin a specific database instead (turbo.json
 * already passes it through), and `TEST_DB_KEEP=1` to leave it behind for
 * post-mortem inspection.
 */
export function perRunConnectionString(): string {
  return `postgresql://localhost:5432/coopsource_test_${process.pid}`;
}

/**
 * Resolved once in the global setup and exported to the workers, because tests
 * run in forked processes whose `process.pid` differs from the one that created
 * the database.
 */
export function getTestConnectionString(): string {
  return process.env.TEST_DATABASE_URL ?? perRunConnectionString();
}

/** Env marker distinguishing a database this run created from one pinned by the caller. */
export const OWNED_DB_ENV = 'TEST_DATABASE_OWNED';

/**
 * The database a run owns. It reaches DDL, where it cannot be parameterised,
 * so it must be a bare identifier — and it is now attacker-adjacent in the
 * sense that it comes from the environment rather than a literal.
 */
export function getTestDbName(
  connectionString: string = getTestConnectionString(),
): string {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error(
      `TEST_DATABASE_URL must be a URL (postgresql://host:port/name), got '${connectionString}'. ` +
        'libpq keyword strings are not supported here.',
    );
  }

  const name = decodeURIComponent(url.pathname.replace(/^\//, ''));
  // Hyphens are common in hosted database names and are safe because the
  // identifier is quoted at every DDL site; quotes and semicolons are not.
  if (!/^[A-Za-z0-9_-]+$/.test(name)) {
    throw new Error(
      `Refusing to use test database name '${name}': expected a bare identifier`,
    );
  }
  return name;
}

/** Same server and credentials as the target, pointed at `postgres`. */
export function getAdminConnectionString(
  connectionString: string = getTestConnectionString(),
): string {
  if (process.env.TEST_DATABASE_ADMIN_URL) {
    return process.env.TEST_DATABASE_ADMIN_URL;
  }
  const url = new URL(connectionString);
  url.pathname = '/postgres';
  return url.toString();
}

export async function createTestDb(): Promise<void> {
  const dbName = getTestDbName();
  const client = new pg.Client({ connectionString: getAdminConnectionString() });
  await client.connect();
  try {
    // Drop and recreate to ensure clean migration state
    // Terminate any active connections first
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [dbName],
    );
    await client.query(`DROP DATABASE IF EXISTS "${dbName}"`);
    await client.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await client.end();
  }
}

/**
 * Drops the database this run created. A database pinned by the caller through
 * `TEST_DATABASE_URL` is theirs, not ours to remove.
 */
export async function dropTestDb(): Promise<void> {
  if (process.env[OWNED_DB_ENV] !== '1' || process.env.TEST_DB_KEEP) return;

  const dbName = getTestDbName();
  const client = new pg.Client({ connectionString: getAdminConnectionString() });
  await client.connect();
  try {
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [dbName],
    );
    await client.query(`DROP DATABASE IF EXISTS "${dbName}"`);
  } finally {
    await client.end();
  }
}

/**
 * Removes per-run databases left behind by runs that died before teardown —
 * a killed process, a crashed CI job. Without this, owning a database per run
 * trades a collision problem for an accumulation problem.
 *
 * Deliberately conservative: only names this harness generates, and only when
 * the owning process is gone. A pid that has been reused by an unrelated
 * process just means the database survives another round, which is harmless;
 * dropping one out from under a live run would not be.
 */
export function selectOrphanedTestDbs(datnames: readonly string[]): string[] {
  return datnames.filter((datname) => {
    const match = /^coopsource_test_(\d+)$/.exec(datname);
    if (!match) return false;

    const pid = Number(match[1]);
    if (!Number.isInteger(pid) || pid <= 0) return false;

    try {
      // Signal 0 performs the permission/existence check without delivering.
      process.kill(pid, 0);
      return false; // still running — not ours to reclaim
    } catch (err) {
      // EPERM means the process exists under another user; only ESRCH is proof
      // that nothing is running.
      return (err as NodeJS.ErrnoException).code === 'ESRCH';
    }
  });
}

export async function sweepOrphanedTestDbs(): Promise<void> {
  const client = new pg.Client({ connectionString: getAdminConnectionString() });
  await client.connect();
  try {
    const { rows } = await client.query<{ datname: string }>(
      `SELECT datname FROM pg_database WHERE datname LIKE 'coopsource\\_test\\_%'`,
    );

    for (const datname of selectOrphanedTestDbs(rows.map((r) => r.datname))) {
      await client.query(`DROP DATABASE IF EXISTS "${datname}"`);
    }
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
      tax_form_1099_patr, capital_account_transaction, capital_account,
      patronage_record, patronage_config,
      expense, expense_category, revenue_entry,
      fiscal_period, member_notice, compliance_item, admin_officer,
      meeting_record, legal_document,
      frontpage_post_ref, calendar_event_ref, governance_label,
      cooperative_link, member_class,
      delegation,
      onboarding_review, onboarding_progress, onboarding_config,
      operator_audit_log, private_record,
      trigger_execution_log, notification,
      api_token, agent_trigger, agent_usage, agent_message, agent_session, agent_config,
      model_provider_config,
      connection_binding, external_connection,
      agreement_template, role_definition,
      signature_request,
      stakeholder_terms, agreement_revision, agreement_signature, agreement,
      interest_map, desired_outcome, stakeholder_interest,
      payment_provider_config,
      funding_pledge, funding_campaign,
      vote, public_governance_anchor, proposal,
      post, thread_member, thread,
      membership_role, membership, invitation,
      pds_record, pds_firehose_cursor,
      auth_credential, entity_key, session,
      profile,
      cooperative_profile, entity,
      fact_log_redaction, fact_log,
      data_deletion_request, system_config,
      hook_dead_letter,
      registered_lexicon,
      script_execution_log, cooperative_script,
      did_rotation_history, spaces_consumer_cursor, space_credential,
      permissioned_notification_registration, permissioned_repo_account_state,
      permissioned_repo_cursor,
      permissioned_repo_record, tier2_governance_migration
    CASCADE
  `.execute(db);
}

export async function destroyTestDb(): Promise<void> {
  if (_db) {
    await _db.destroy();
    _db = null;
  }
}
