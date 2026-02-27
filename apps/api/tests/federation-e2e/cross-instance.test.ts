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
import { describe, it, expect, beforeAll } from 'vitest';
import pg from 'pg';
import { Kysely, PostgresDialect } from 'kysely';
import type { Database } from '@coopsource/db';
import { SigningKeyResolver, signRequest } from '@coopsource/federation/http';

// ── Instance configuration ──

const INSTANCES = {
  hub: {
    url: 'http://localhost:3001',
    dbUrl: 'postgresql://coopsource:dev_password@localhost:5432/coopsource_hub',
    keyEncKey: 'aHViLWRldi1rZXktZW5jLWtleS0zMi1ieXRlcw==',
    role: 'hub',
  },
  coopA: {
    url: 'http://localhost:3002',
    dbUrl: 'postgresql://coopsource:dev_password@localhost:5432/coopsource_coop_a',
    keyEncKey: 'Y29vcC1hLWRldi1rZXktZW5jLWtleS0zMg==',
    role: 'coop',
  },
  coopB: {
    url: 'http://localhost:3003',
    dbUrl: 'postgresql://coopsource:dev_password@localhost:5432/coopsource_coop_b',
    keyEncKey: 'Y29vcC1iLWRldi1rZXktZW5jLWtleS0zMg==',
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

  const sigHeaders = await signRequest(method, url, headers, bodyStr, signingKey, keyId);
  Object.assign(headers, sigHeaders);

  return fetch(url, { method, headers, body: bodyStr ?? undefined });
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
      const doc = await res.json() as Record<string, unknown>;
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
    const body = await res.json() as Record<string, unknown>;
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
    const body = await res.json() as Record<string, unknown>;
    expect(body).toHaveProperty('did', coopBCoopDid);
    expect(body).toHaveProperty('displayName', 'Beta Co-op');
    expect(body).toHaveProperty('cooperativeType', 'worker');
    expect(body).toHaveProperty('memberCount');
  });

  // ─── 4. Signed hub registration ──────────────────────────────────

  it('coop-a can register with hub using signed request', async () => {
    const db = createDb(INSTANCES.coopA.dbUrl);
    dbs.push(db);
    const resolver = new SigningKeyResolver(db as Kysely<Database>, INSTANCES.coopA.keyEncKey);
    const { privateKey, keyId } = await resolver.resolve(coopACoopDid);

    const url = `${INSTANCES.hub.url}/api/v1/federation/hub/register`;
    const body = {
      cooperativeDid: coopACoopDid,
      hubUrl: INSTANCES.hub.url,
      metadata: {
        displayName: 'Alpha Co-op',
        description: 'A test cooperative',
        cooperativeType: 'worker',
      },
    };

    const res = await signedFetch(url, 'POST', body, privateKey, keyId);
    expect(res.status).toBe(201);
    const result = await res.json() as Record<string, unknown>;
    expect(result).toHaveProperty('registered', true);

    await db.destroy();
    dbs.pop();
  });

  // ─── 5. Signed cross-instance membership request ─────────────────

  it('coop-a can request membership on coop-b via signed federation call', async () => {
    const db = createDb(INSTANCES.coopA.dbUrl);
    dbs.push(db);
    const resolver = new SigningKeyResolver(db as Kysely<Database>, INSTANCES.coopA.keyEncKey);
    const { privateKey, keyId } = await resolver.resolve(coopACoopDid);

    // Request membership: coop-a's cooperative entity wants to join coop-b
    const url = `${INSTANCES.coopB.url}/api/v1/federation/membership/request`;
    const body = {
      memberDid: coopACoopDid,
      cooperativeDid: coopBCoopDid,
      message: 'Alpha Co-op wants to join Beta Co-op',
    };

    const res = await signedFetch(url, 'POST', body, privateKey, keyId);
    expect(res.status).toBe(201);
    const result = await res.json() as Record<string, unknown>;
    expect(result).toHaveProperty('memberRecordUri');
    expect(result).toHaveProperty('memberRecordCid');

    await db.destroy();
    dbs.pop();
  });

  it('coop-b can approve membership for coop-a via signed federation call', async () => {
    const db = createDb(INSTANCES.coopB.dbUrl);
    dbs.push(db);
    const resolver = new SigningKeyResolver(db as Kysely<Database>, INSTANCES.coopB.keyEncKey);
    const { privateKey, keyId } = await resolver.resolve(coopBCoopDid);

    // Approve membership: coop-b approves coop-a
    const url = `${INSTANCES.coopB.url}/api/v1/federation/membership/approve`;
    const body = {
      cooperativeDid: coopBCoopDid,
      memberDid: coopACoopDid,
      roles: ['member'],
    };

    const res = await signedFetch(url, 'POST', body, privateKey, keyId);
    expect(res.status).toBe(201);
    const result = await res.json() as Record<string, unknown>;
    expect(result).toHaveProperty('approvalRecordUri');
    expect(result).toHaveProperty('approvalRecordCid');

    await db.destroy();
    dbs.pop();
  });

  // ─── 6. Cross-instance entity lookup after membership ────────────

  it('returns 404 for non-existent entity on federation endpoint', async () => {
    const res = await fetch(
      `${INSTANCES.hub.url}/api/v1/federation/entity/${encodeURIComponent('did:web:nonexistent.example.com')}`,
    );
    expect(res.status).toBe(404);
  });
});
