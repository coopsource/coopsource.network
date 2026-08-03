/**
 * Federation integration tests — cross-instance.
 *
 * Tests run against live Docker instances started by `make dev-federation`:
 *   - hub:    http://localhost:3001
 *   - coop-a: http://localhost:3002
 *   - coop-b: http://localhost:3003
 *
 * Each instance has its own database and INSTANCE_ROLE configuration.
 * Tests exercise both public GET endpoints and signed POST endpoints.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
// `JsonWebKey` is not a global under `lib: ["ES2022"]`; @types/node exposes it
// on the `webcrypto` namespace rather than as a top-level `node:crypto` export.
import type { webcrypto } from 'node:crypto';
import pg from 'pg';
import { Kysely, PostgresDialect } from 'kysely';
import type { Database } from '@coopsource/db';
import { signRequest } from '@coopsource/federation/http';
import {
  calculateCid,
  decryptKey,
  type JwkKey,
} from '@coopsource/federation/local';

const MEMBER_CONSENT_COLLECTION = 'network.coopsource.org.memberConsent';

// ── Instance configuration ──

const INSTANCES = {
  hub: {
    url: 'http://localhost:3001',
    dbUrl: 'postgresql://coopsource:dev_password@localhost:55432/coopsource_hub',
    keyEncKey: 'SZ2Y6jswJawz0b4ZNil0gQhZZ1SRNPFXgDGn6/MlOIk=',
    role: 'hub',
  },
  coopA: {
    url: 'http://localhost:3002',
    dbUrl:
      'postgresql://coopsource:dev_password@localhost:55432/coopsource_coop_a',
    keyEncKey: 'CpdEFK7O9eH6xNv6F6Y90HvssdPGeLkzUKENgR4EBF8=',
    role: 'coop',
  },
  coopB: {
    url: 'http://localhost:3003',
    dbUrl:
      'postgresql://coopsource:dev_password@localhost:55432/coopsource_coop_b',
    keyEncKey: 'KpkXbpKPhezRK5E0onAhVCL7ayL8oNuEdPtTOUsgC4k=',
    role: 'coop',
  },
} as const;

// ── Helpers ──

function createDb(connectionString: string): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({ connectionString, max: 2 }),
    }),
  });
}

async function resolveSigningKey(
  db: Kysely<Database>,
  entityDid: string,
  keyEncKey: string,
): Promise<{ privateKey: CryptoKey; keyId: string }> {
  const row = await db
    .selectFrom('entity_key')
    .where('entity_did', '=', entityDid)
    .where('key_purpose', '=', 'signing')
    .where('invalidated_at', 'is', null)
    .select('private_key_enc')
    .executeTakeFirstOrThrow();
  const privateJwk = JSON.parse(
    await decryptKey(row.private_key_enc, keyEncKey),
  ) as JwkKey;
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    privateJwk as webcrypto.JsonWebKey,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  return { privateKey, keyId: `${entityDid}#atproto` };
}

async function setupInstance(
  baseUrl: string,
  opts: {
    cooperativeName: string;
    adminDisplayName: string;
    adminEmail: string;
    adminPassword: string;
  },
): Promise<{ coopDid: string; adminDid: string }> {
  const res = await fetch(`${baseUrl}/api/v1/setup/initialize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Setup failed for ${baseUrl}: ${res.status} ${body}`);
  }
  return res.json() as Promise<{ coopDid: string; adminDid: string }>;
}

async function signedFetch(
  url: string,
  method: string,
  body: Record<string, unknown> | null,
  signingKey: CryptoKey,
  keyId: string,
): Promise<Response> {
  const bodyStr = body ? JSON.stringify(body) : null;
  const headers: Record<string, string> = { accept: 'application/json' };
  if (bodyStr) {
    headers['content-type'] = 'application/json';
  }

  const sigHeaders = await signRequest(
    method,
    url,
    headers,
    bodyStr,
    signingKey,
    keyId,
  );
  headers['signature-input'] = sigHeaders['Signature-Input'];
  headers.signature = sigHeaders.Signature;
  if (sigHeaders['Content-Digest']) {
    headers['content-digest'] = sigHeaders['Content-Digest'];
  }

  return fetch(url, { method, headers, body: bodyStr ?? undefined });
}

async function writeReplicatedConsentRecord(
  db: Kysely<Database>,
  args: {
    authorDid: string;
    cooperativeDid: string;
    consentType: 'joinRequest' | 'invitationAcceptance' | 'networkJoin';
    rkey: string;
  },
): Promise<{ uri: string; cid: string }> {
  const record = {
    $type: MEMBER_CONSENT_COLLECTION,
    cooperative: args.cooperativeDid,
    consentType: args.consentType,
    createdAt: new Date().toISOString(),
  };
  const cid = await calculateCid(record);
  const uri = `at://${args.authorDid}/${MEMBER_CONSENT_COLLECTION}/${args.rkey}`;
  const now = new Date();

  await db
    .insertInto('pds_record')
    .values({
      uri,
      did: args.authorDid,
      collection: MEMBER_CONSENT_COLLECTION,
      rkey: args.rkey,
      cid,
      content: record,
      created_at: now,
      indexed_at: now,
      deleted_at: null,
    })
    .onConflict((oc) =>
      oc.column('uri').doUpdateSet({
        cid,
        content: record,
        indexed_at: now,
        deleted_at: null,
      }),
    )
    .execute();

  return { uri, cid };
}

async function writeReplicatedEntityProjection(
  sourceDb: Kysely<Database>,
  targetDb: Kysely<Database>,
  did: string,
): Promise<void> {
  const entity = await sourceDb
    .selectFrom('entity')
    .where('did', '=', did)
    .select([
      'did',
      'type',
      'handle',
      'display_name',
      'description',
      'avatar_cid',
      'status',
      'created_at',
      'created_by',
      'invalidated_at',
      'invalidated_by',
      'indexed_at',
    ])
    .executeTakeFirstOrThrow();

  await targetDb
    .insertInto('entity')
    .values(entity)
    .onConflict((oc) =>
      oc.column('did').doUpdateSet({
        type: entity.type,
        handle: entity.handle,
        display_name: entity.display_name,
        description: entity.description,
        avatar_cid: entity.avatar_cid,
        status: entity.status,
        invalidated_at: entity.invalidated_at,
        invalidated_by: entity.invalidated_by,
        indexed_at: entity.indexed_at,
      }),
    )
    .execute();
}

// ── Tests ──

describe('Cross-Instance Federation', () => {
  const dbs: Kysely<Database>[] = [];
  let hubCoopDid: string;
  let coopACoopDid: string;
  let coopBCoopDid: string;

  beforeAll(async () => {
    // Verify all instances are healthy
    for (const [name, inst] of Object.entries(INSTANCES)) {
      const res = await fetch(`${inst.url}/health`);
      if (!res.ok) {
        throw new Error(
          `Instance ${name} at ${inst.url} is not healthy (${res.status}). ` +
            'Run `make dev-federation` first.',
        );
      }
    }

    // Initialize each instance
    const hubResult = await setupInstance(INSTANCES.hub.url, {
      cooperativeName: 'Co-op Source Network',
      adminDisplayName: 'Hub Admin',
      adminEmail: 'admin@hub.test',
      adminPassword: 'password123',
    });
    hubCoopDid = hubResult.coopDid;

    const coopAResult = await setupInstance(INSTANCES.coopA.url, {
      cooperativeName: 'Alpha Co-op',
      adminDisplayName: 'Alpha Admin',
      adminEmail: 'admin@alpha.test',
      adminPassword: 'password123',
    });
    coopACoopDid = coopAResult.coopDid;

    const coopBResult = await setupInstance(INSTANCES.coopB.url, {
      cooperativeName: 'Beta Co-op',
      adminDisplayName: 'Beta Admin',
      adminEmail: 'admin@beta.test',
      adminPassword: 'password123',
    });
    coopBCoopDid = coopBResult.coopDid;
  });

  afterAll(async () => {
    await Promise.all(dbs.splice(0).map((db) => db.destroy()));
  });

  // ─── 1. Health checks ────────────────────────────────────────────

  it('all instances respond to health check', async () => {
    for (const [_name, inst] of Object.entries(INSTANCES)) {
      const res = await fetch(`${inst.url}/health`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('status', 'ok');
      expect(body).toHaveProperty('database', 'connected');
    }
  });

  // ─── 2. DID document resolution ──────────────────────────────────

  it('each instance serves a DID document at /.well-known/did.json', async () => {
    for (const [_name, inst] of Object.entries(INSTANCES)) {
      const res = await fetch(`${inst.url}/.well-known/did.json`);
      expect(res.status).toBe(200);
      const doc = (await res.json()) as Record<string, unknown>;
      expect(doc).toHaveProperty('id');
      expect(doc).toHaveProperty('verificationMethod');
      expect(doc).toHaveProperty('service');
    }
  });

  // ─── 3. Public federation endpoints ──────────────────────────────

  it('hub can look up coop-a entity via federation endpoint', async () => {
    const encodedDid = encodeURIComponent(coopACoopDid);
    const res = await fetch(
      `${INSTANCES.coopA.url}/api/v1/federation/entity/${encodedDid}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty('did', coopACoopDid);
    expect(body).toHaveProperty('displayName', 'Alpha Co-op');
    expect(body).toHaveProperty('type', 'cooperative');
  });

  it('hub can look up coop-b profile via federation endpoint', async () => {
    const encodedDid = encodeURIComponent(coopBCoopDid);
    const res = await fetch(
      `${INSTANCES.coopB.url}/api/v1/federation/coop/${encodedDid}/profile`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty('did', coopBCoopDid);
    expect(body).toHaveProperty('displayName', 'Beta Co-op');
    expect(body).toHaveProperty('cooperativeType', 'worker');
    expect(body).toHaveProperty('memberCount');
  });

  // ─── 4. Signed cross-instance membership request ─────────────────

  it('coop-a can request membership on coop-b via signed federation call', async () => {
    const db = createDb(INSTANCES.coopA.dbUrl);
    const targetDb = createDb(INSTANCES.coopB.dbUrl);
    dbs.push(db);
    dbs.push(targetDb);
    const { privateKey, keyId } = await resolveSigningKey(
      db,
      coopACoopDid,
      INSTANCES.coopA.keyEncKey,
    );
    await writeReplicatedEntityProjection(db, targetDb, coopACoopDid);
    const consent = await writeReplicatedConsentRecord(targetDb, {
      authorDid: coopACoopDid,
      cooperativeDid: coopBCoopDid,
      consentType: 'joinRequest',
      rkey: 'request',
    });

    // Request membership: coop-a's cooperative entity wants to join coop-b
    const url = `${INSTANCES.coopB.url}/api/v1/federation/membership/request`;
    const body = {
      memberDid: coopACoopDid,
      cooperativeDid: coopBCoopDid,
      consentRecordUri: consent.uri,
      consentRecordCid: consent.cid,
    };

    const res = await signedFetch(url, 'POST', body, privateKey, keyId);
    expect(res.status).toBe(201);
    const result = (await res.json()) as Record<string, unknown>;
    expect(result).toHaveProperty('consentRecordUri', body.consentRecordUri);
    expect(result).toHaveProperty('consentRecordCid', body.consentRecordCid);

    await db.destroy();
    await targetDb.destroy();
    dbs.pop();
    dbs.pop();
  });

  it('coop-b can approve membership for coop-a via signed federation call', async () => {
    const db = createDb(INSTANCES.coopB.dbUrl);
    const sourceDb = createDb(INSTANCES.coopA.dbUrl);
    dbs.push(db);
    dbs.push(sourceDb);
    const { privateKey, keyId } = await resolveSigningKey(
      db,
      coopBCoopDid,
      INSTANCES.coopB.keyEncKey,
    );
    await writeReplicatedEntityProjection(sourceDb, db, coopACoopDid);
    const consent = await writeReplicatedConsentRecord(db, {
      authorDid: coopACoopDid,
      cooperativeDid: coopBCoopDid,
      consentType: 'joinRequest',
      rkey: 'approve',
    });

    // Approve membership: coop-b approves coop-a
    const url = `${INSTANCES.coopB.url}/api/v1/federation/membership/approve`;
    const body = {
      cooperativeDid: coopBCoopDid,
      memberDid: coopACoopDid,
      consentRecordUri: consent.uri,
      consentRecordCid: consent.cid,
      roles: ['member'],
    };

    const res = await signedFetch(url, 'POST', body, privateKey, keyId);
    expect(res.status).toBe(201);
    const result = (await res.json()) as Record<string, unknown>;
    expect(result).toHaveProperty('ok', true);
    expect(result).toHaveProperty('changed');
    expect(result).toHaveProperty('auditEventId');

    await db.destroy();
    await sourceDb.destroy();
    dbs.pop();
    dbs.pop();
  });

  // ─── 5. Cross-instance entity lookup after membership ────────────

  it('returns 404 for non-existent entity on federation endpoint', async () => {
    const res = await fetch(
      `${INSTANCES.hub.url}/api/v1/federation/entity/${encodeURIComponent('did:web:nonexistent.example.com')}`,
    );
    expect(res.status).toBe(404);
  });
});
