/**
 * V9.2.1 validation gate — verifies that provisionCooperative() adds a
 * #coopsource service entry to the cooperative's PLC DID document when
 * serviceEndpoint is provided.
 *
 * Runs under `make test:pds` — the federation global-setup auto-starts
 * PDS + PLC + Mailpit Docker containers.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import {
  Kysely,
  PostgresDialect,
  FileMigrationProvider,
  Migrator,
} from 'kysely';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import type { Database } from '@coopsource/db';
import { provisionCooperative } from '../src/local/cooperative-provisioning.js';
import { PlcClient } from '../src/local/plc-client.js';
import { MailpitClient } from '../src/email/mailpit-client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEST_DB_NAME = 'coopsource_v921_plc_test';
const PG_ADMIN_URL = 'postgresql://localhost:5432/postgres';
const TEST_KEY_ENC_KEY = Buffer.alloc(32, 9).toString('base64');

async function createFreshTestDb(): Promise<void> {
  const client = new pg.Client({ connectionString: PG_ADMIN_URL });
  await client.connect();
  try {
    await client.query(
      `SELECT pg_terminate_backend(pid)
       FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [TEST_DB_NAME],
    );
    await client.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await client.query(`CREATE DATABASE ${TEST_DB_NAME}`);
  } finally {
    await client.end();
  }
}

async function dropTestDb(): Promise<void> {
  const client = new pg.Client({ connectionString: PG_ADMIN_URL });
  await client.connect();
  try {
    await client.query(
      `DROP DATABASE IF EXISTS ${TEST_DB_NAME} WITH (FORCE)`,
    );
  } finally {
    await client.end();
  }
}

function createTestDbHandle(): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({
        connectionString: `postgresql://localhost:5432/${TEST_DB_NAME}`,
        max: 5,
      }),
    }),
  });
}

async function runMigrations(db: Kysely<Database>): Promise<void> {
  const migrationsPath = path.resolve(
    __dirname,
    '../../../packages/db/src/migrations',
  );
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({ fs, path, migrationFolder: migrationsPath }),
  });
  const { error } = await migrator.migrateToLatest();
  if (error) throw error;
}

// ─── The test ──────────────────────────────────────────────────────────────

describe('V9.2.1 validation gate — PLC #coopsource service entry', () => {
  const PDS_URL = process.env.PDS_URL ?? 'http://localhost:2583';
  const PDS_ADMIN_PASSWORD = process.env.PDS_ADMIN_PASSWORD ?? 'admin';
  const PLC_URL = process.env.PLC_URL ?? 'http://localhost:2582';
  const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';
  const SERVICE_ENDPOINT = 'http://localhost:3001';

  let db: Kysely<Database>;
  let plc: PlcClient;
  let coopDid: string;

  beforeAll(async () => {
    await createFreshTestDb();
    db = createTestDbHandle();
    await runMigrations(db);
    plc = new PlcClient(PLC_URL);

    // Clear Mailpit inbox to avoid stale emails from prior test runs
    const mailpit = new MailpitClient(MAILPIT_URL);
    await mailpit.clearInbox();

    // Provision with serviceEndpoint — triggers the PLC service entry flow
    const ts = Date.now().toString(36);
    const handle = `plc-${ts}.test`;
    const result = await provisionCooperative({
      db,
      pdsUrl: PDS_URL,
      adminPassword: PDS_ADMIN_PASSWORD,
      keyEncKey: TEST_KEY_ENC_KEY,
      handle,
      displayName: 'V9.2.1 PLC Gate Test',
      description: 'Ephemeral test cooperative — deleted at end of run',
      serviceEndpoint: SERVICE_ENDPOINT,
      mailpitUrl: MAILPIT_URL,
    });
    coopDid = result.did;
  }, 60_000);

  afterAll(async () => {
    if (db) await db.destroy();
    await dropTestDb();
  }, 30_000);

  it('DID document contains #atproto_pds (preserved by defensive map)', async () => {
    const didDoc = (await plc.resolve(coopDid)) as {
      service: Array<{ id: string; type: string; serviceEndpoint: string }>;
    };
    const pdsEntry = didDoc.service?.find((s) => s.id === '#atproto_pds');
    expect(pdsEntry).toBeDefined();
    expect(pdsEntry!.type).toBe('AtprotoPersonalDataServer');
  });

  it('DID document contains #coopsource with correct type and endpoint', async () => {
    const didDoc = (await plc.resolve(coopDid)) as {
      service: Array<{ id: string; type: string; serviceEndpoint: string }>;
    };
    const csEntry = didDoc.service?.find((s) => s.id === '#coopsource');
    expect(csEntry).toBeDefined();
    expect(csEntry!.type).toBe('CoopSourceNetwork');
    expect(csEntry!.serviceEndpoint).toBe(SERVICE_ENDPOINT);
  });

  it('entity row was written (provisioning completed fully)', async () => {
    const entity = await db
      .selectFrom('entity')
      .where('did', '=', coopDid)
      .select(['did', 'type', 'status'])
      .executeTakeFirst();
    expect(entity).toBeDefined();
    expect(entity!.type).toBe('cooperative');
    expect(entity!.status).toBe('active');
  });
});
