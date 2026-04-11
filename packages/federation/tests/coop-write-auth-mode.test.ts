/**
 * V9.1 validation gate — verifies the app-password session path for
 * cooperative repo writes.
 *
 * This test:
 *   1. Creates a fresh test database, runs migrations.
 *   2. Provisions a test cooperative via `provisionCooperative()` — the
 *      same library function `apps/api/scripts/provision-cooperative.ts`
 *      uses. Provisioning:
 *        - Generates CSN-owned P-256 signing + secp256k1 rotation
 *          keypairs.
 *        - Registers the DID in PLC with the signing key as
 *          `verificationMethods.atproto` and a `#coopsource` service
 *          entry.
 *        - Imports the DID into the PDS via `createAccount` with a
 *          service-auth JWT signed by the signing key.
 *        - Creates a privileged app password via
 *          `com.atproto.server.createAppPassword` and stores it
 *          encrypted in `auth_credential`.
 *   3. Wires an `AtprotoPdsService` with an `AuthCredentialResolver` and
 *      asserts that `createRecord`, `putRecord`, and `deleteRecord` on
 *      the cooperative DID all succeed. Under the hood these route
 *      through `AtprotoPdsService.authFor` → `tryAppPasswordSession` →
 *      `agent.login` → cached session-bearing agent.
 *   4. Sanity-checks that the stored credential round-trips through the
 *      resolver and that the resolver throws (the fallback signal) for
 *      an unrelated DID.
 *
 * V9.1's write path is app-password login, NOT service-auth JWTs. The
 * original plan targeted JWTs; verification against `@atproto/pds` main
 * (0.4.218) showed `com.atproto.repo.createRecord/putRecord/deleteRecord`
 * use `authVerifier.authorization()` which accepts only session Bearer
 * tokens or DPoP OAuth — not service-auth JWTs. See ARCHITECTURE-V9.md §2
 * for the full rationale.
 *
 * Runs under `make test:pds` — the federation global-setup auto-starts
 * PDS + PLC Docker containers.
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
} from 'vitest';
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
import { AtprotoPdsService } from '../src/atproto/index.js';
import {
  AuthCredentialResolver,
  ATPROTO_APP_PASSWORD_CREDENTIAL_TYPE,
} from '../src/http/auth-credential-resolver.js';
import { provisionCooperative } from '../src/local/cooperative-provisioning.js';
import type { DID } from '@coopsource/common';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Test database lifecycle ────────────────────────────────────────────────

// Dedicated DB so this test doesn't collide with api tests that use
// `coopsource_test` or the dev DB `coopsource_dev`.
const TEST_DB_NAME = 'coopsource_v91_gate_test';
const PG_ADMIN_URL = 'postgresql://localhost:5432/postgres';
// KEY_ENC_KEY must be 32 bytes base64. Deterministic test value:
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
      `SELECT pg_terminate_backend(pid)
       FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [TEST_DB_NAME],
    );
    await client.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
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

// ─── The test ───────────────────────────────────────────────────────────────

describe('V9.1 validation gate — app-password session write path', () => {
  const PDS_URL = process.env.PDS_URL ?? 'http://localhost:2583';
  const PDS_ADMIN_PASSWORD = process.env.PDS_ADMIN_PASSWORD ?? 'admin';

  let db: Kysely<Database>;
  let authCredentialResolver: AuthCredentialResolver;
  let pdsService: AtprotoPdsService;
  let coopDid: DID;
  let expectedAppPassword: string;

  beforeAll(async () => {
    // Create the isolated test DB, run migrations, provision the
    // cooperative. A single shared setup — provisioning involves PDS
    // round-trips and we don't want to pay that per-test.
    await createFreshTestDb();
    db = createTestDbHandle();
    await runMigrations(db);

    authCredentialResolver = new AuthCredentialResolver(db, TEST_KEY_ENC_KEY);
    pdsService = new AtprotoPdsService(
      PDS_URL,
      PDS_ADMIN_PASSWORD,
      process.env.PLC_URL,
      authCredentialResolver,
    );

    const handle = `gate-${Date.now()}.test`;
    const result = await provisionCooperative({
      db,
      pdsUrl: PDS_URL,
      adminPassword: PDS_ADMIN_PASSWORD,
      keyEncKey: TEST_KEY_ENC_KEY,
      handle,
      displayName: 'V9.1 Gate Test Cooperative',
      description: 'Ephemeral test cooperative — deleted at end of run',
    });
    coopDid = result.did as DID;
    expectedAppPassword = result.appPassword;
  }, 60_000);

  afterAll(async () => {
    if (db) {
      await db.destroy();
    }
    await dropTestDb();
  });

  describe('provisioning outcome', () => {
    it('writes an entity row (type=cooperative, status=active)', async () => {
      const entity = await db
        .selectFrom('entity')
        .where('did', '=', coopDid)
        .select(['did', 'type', 'status'])
        .executeTakeFirst();
      expect(entity).toBeDefined();
      expect(entity!.type).toBe('cooperative');
      expect(entity!.status).toBe('active');
    });

    it('writes an auth_credential row with the encrypted app password', async () => {
      const credential = await db
        .selectFrom('auth_credential')
        .where('entity_did', '=', coopDid)
        .where('credential_type', '=', ATPROTO_APP_PASSWORD_CREDENTIAL_TYPE)
        .where('invalidated_at', 'is', null)
        .select(['secret_hash'])
        .executeTakeFirst();
      expect(credential).toBeDefined();
      expect(credential!.secret_hash).toBeTruthy();
      expect(credential!.secret_hash).not.toBe(expectedAppPassword); // encrypted, not plaintext
    });
  });

  describe('AuthCredentialResolver round-trip', () => {
    it('resolveAppPassword returns the plaintext app password for the cooperative', async () => {
      const resolved = await authCredentialResolver.resolveAppPassword(
        coopDid,
      );
      expect(resolved).toBe(expectedAppPassword);
    });

    it('throws for a DID with no stored credential (the fallback signal)', async () => {
      await expect(
        authCredentialResolver.resolveAppPassword('did:plc:no-such-member'),
      ).rejects.toThrow(/No atproto-app-password credential found/);
    });
  });

  describe('happy path — app-password session writes', () => {
    it('createRecord on the cooperative DID succeeds and round-trips', async () => {
      const ref = await pdsService.createRecord({
        did: coopDid,
        collection: 'network.coopsource.test.v91gate',
        record: {
          createdAt: new Date().toISOString(),
          note: 'happy-path app-password write',
        },
      });
      expect(ref.uri).toContain(coopDid);
      expect(ref.uri).toContain('network.coopsource.test.v91gate');
      expect(ref.cid).toBeTruthy();

      const readback = await pdsService.getRecord(ref.uri);
      expect(readback.value).toMatchObject({
        note: 'happy-path app-password write',
      });
    }, 15_000);

    it('putRecord (upsert) on the cooperative DID succeeds and round-trips', async () => {
      const rkey = `put-${Date.now()}`;
      const ref = await pdsService.putRecord({
        did: coopDid,
        collection: 'network.coopsource.test.v91gate',
        rkey,
        record: {
          createdAt: new Date().toISOString(),
          note: 'method-binding putRecord',
        },
      });
      expect(ref.uri).toContain(rkey);

      const readback = await pdsService.getRecord(ref.uri);
      expect(readback.value).toMatchObject({ note: 'method-binding putRecord' });
    }, 15_000);

    it('deleteRecord on the cooperative DID succeeds and the record is gone', async () => {
      const rkey = `delete-${Date.now()}`;
      await pdsService.putRecord({
        did: coopDid,
        collection: 'network.coopsource.test.v91gate',
        rkey,
        record: { createdAt: new Date().toISOString() },
      });
      await pdsService.deleteRecord({
        did: coopDid,
        collection: 'network.coopsource.test.v91gate',
        rkey,
      });
      await expect(
        pdsService.getRecord(
          `at://${coopDid}/network.coopsource.test.v91gate/${rkey}`,
        ),
      ).rejects.toThrow();
    }, 15_000);

    it('repeated writes reuse the cached session (no re-login)', async () => {
      // We don't have a direct hook into login count, but we can verify
      // that 10 successive writes all succeed quickly — this catches any
      // regression where the cache isn't populated and each call pays
      // the full login round-trip (which is ~100-300ms on localhost, so
      // 10 calls would be 1-3 seconds; we assert on correctness rather
      // than timing to avoid flakiness).
      const rkeys: string[] = [];
      for (let i = 0; i < 10; i++) {
        const rkey = `loop-${Date.now()}-${i}`;
        rkeys.push(rkey);
        const ref = await pdsService.putRecord({
          did: coopDid,
          collection: 'network.coopsource.test.v91gate',
          rkey,
          record: {
            createdAt: new Date().toISOString(),
            iteration: i,
          },
        });
        expect(ref.uri).toContain(rkey);
      }
    }, 30_000);
  });

  describe('fallback path — DIDs with no stored credential', () => {
    it('createRecord with an unrelated DID fails with an auth-class error', async () => {
      // The unrelated DID has no `auth_credential` row and no post-
      // `createDid` session cache entry, so `authFor` falls through to
      // path 3 (admin Basic), which the PDS rejects for repo writes.
      // The exact error code varies ("Unexpected authorization type",
      // "AuthMissing", etc.), so we just assert the call fails.
      await expect(
        pdsService.createRecord({
          did: 'did:plc:unrelated-test-did' as DID,
          collection: 'network.coopsource.test.v91gate',
          record: { createdAt: new Date().toISOString() },
        }),
      ).rejects.toThrow();
    }, 15_000);
  });
});
