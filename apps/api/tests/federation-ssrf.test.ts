import { describe, it, expect, beforeEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createContentDigest } from '@coopsource/federation/http';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';
import { trackTestServer } from './helpers/test-http-servers.js';

/**
 * Audit S-08 — an unauthenticated caller must not be able to steer the API's
 * outbound fetches.
 *
 * `verifyRequest` resolves the signer's DID before it can check the signature,
 * because the key it needs is inside the document. Everything it checks first
 * — the component list, the algorithm, a fresh timestamp, and a digest of the
 * caller's own body — is computable by the caller, so reaching the resolver
 * needs no credentials at all. Measured before the fix: this request made the
 * API issue `GET /.well-known/did.json` against the chosen port.
 */
async function listener(): Promise<{ server: Server; port: number; hits: string[] }> {
  const hits: string[] = [];
  const server = createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id: 'did:web:x', verificationMethod: [] }));
  });
  trackTestServer(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: (server.address() as AddressInfo).port, hits };
}

describe('Federation DID resolution is not an SSRF oracle (S-08)', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  it('does not fetch a loopback port named by an unauthenticated keyid', async () => {
    const { port, hits } = await listener();
    const testApp = createTestApp();
    const payload = { anything: true };

    const res = await testApp.agent
      .post('/api/v1/federation/agreement/sign-request')
      .set(
        'signature-input',
        `sig=("@method" "@target-uri" "content-digest");` +
          `keyid="did:web:127.0.0.1%3A${port}#k";alg="ecdsa-p256-sha256";` +
          `created=${Math.floor(Date.now() / 1000)}`,
      )
      .set('signature', 'sig=:AAAA:')
      .set('content-digest', await createContentDigest(JSON.stringify(payload)))
      .send(payload);

    expect(res.status).toBe(401);
    expect(hits, 'the API must not have dialled the chosen port').toEqual([]);
  });

  it('does not fetch the cloud metadata address named by a keyid', async () => {
    const testApp = createTestApp();
    const payload = { anything: true };

    // 169.254.169.254 has no listener here; the assertion that matters is that
    // the request is refused promptly rather than hanging on a connect attempt.
    const started = Date.now();
    const res = await testApp.agent
      .post('/api/v1/federation/agreement/sign-request')
      .set(
        'signature-input',
        `sig=("@method" "@target-uri" "content-digest");` +
          `keyid="did:web:169.254.169.254#k";alg="ecdsa-p256-sha256";` +
          `created=${Math.floor(Date.now() / 1000)}`,
      )
      .set('signature', 'sig=:AAAA:')
      .set('content-digest', await createContentDigest(JSON.stringify(payload)))
      .send(payload);

    expect(res.status).toBe(401);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
