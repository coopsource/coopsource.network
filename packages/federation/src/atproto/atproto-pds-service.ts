import type { AtUri, CID, DID } from '@coopsource/common';
import type {
  IPdsService,
  CreateDidOptions,
  UpdateDidOptions,
  CreateRecordParams,
  PutRecordParams,
  DeleteRecordParams,
} from '../interfaces/pds-service.js';
import type {
  DidDocument,
  FirehoseEvent,
  ListRecordsOptions,
  PdsRecord,
  RecordRef,
} from '../types.js';
import { AtpAgent } from '@atproto/api';
import { decodeFirehoseMessage } from './firehose-decoder.js';
import type { AuthCredentialResolver } from '../http/auth-credential-resolver.js';

/**
 * Stage 2: Wraps @atproto/api to talk to a real ATProto PDS via XRPC.
 *
 * Each entity (person/cooperative) has its own account on the PDS. Writes
 * go through `authFor(did, lxm)`, which picks an auth header in this order:
 *
 * 1. **App-password session (V9.1 — the target path for cooperatives).**
 *    If an `AuthCredentialResolver` is wired and the target DID has a
 *    stored app password in `auth_credential` (written by
 *    `provisionCooperative`), log in as the DID using the decrypted app
 *    password and cache the resulting session-bearing `AtpAgent` per DID.
 *    Subsequent calls reuse the cached agent; `@atproto/api` handles
 *    access-token refresh automatically via the stored `refreshJwt`.
 *
 * 2. **Post-createDid session cache (V6 legacy, narrow scope).** If a
 *    write happens immediately after `createDid()` in the same process,
 *    use the account-session-bearing `AtpAgent` we cached at that point.
 *    This is what the V6 implementation always relied on for
 *    freshly-provisioned cooperatives.
 *
 * 3. **Admin Basic fallback (broken for repo writes, kept for back-compat).**
 *    Attach `Authorization: Basic admin:<password>`. This is what V6
 *    advertised as the universal fallback, but empirically `@atproto/pds`
 *    rejects admin Basic for `com.atproto.repo.*` methods ("Unexpected
 *    authorization type"). This branch is kept for non-repo methods
 *    (admin endpoints, identity updates) and for DIDs that don't exist
 *    in any other path — the call will fail on repo writes and the
 *    failure is the right operator signal.
 *
 * Historical note: V9.1 originally targeted service-auth JWTs for repo
 * writes (signed by the cooperative's PLC-registered key). Verification
 * against `@atproto/pds` main (0.4.218) showed this doesn't work: the
 * `authVerifier.authorization()` function used by
 * `com.atproto.repo.createRecord/putRecord/deleteRecord` routes Bearer
 * tokens to the legacy `access()` verifier (session-only) and DPoP
 * tokens to OAuth; it has no service-auth branch. App-password sessions
 * are the ecosystem-native pattern for server-to-server write auth.
 * `ServiceAuthClient` is retained but only used by
 * `provisionCooperative` for the `createAccount` DID-import flow.
 */
export class AtprotoPdsService implements IPdsService {
  private adminAgent: AtpAgent;
  private plcUrl: string;
  private adminAuthHeader: string;
  private authCredentialResolver?: AuthCredentialResolver;

  /**
   * Per-DID cache of session-bearing `AtpAgent` instances from successful
   * `agent.login({identifier: did, password: appPassword})` calls (Path A
   * in `authFor`). Cooperative writes flow through here. On auth error
   * from a cached agent (expired refresh, revoked app password), the
   * entry is dropped and re-login is attempted once.
   */
  private appPasswordSessionCache = new Map<string, AtpAgent>();

  /**
   * Cache of session-bearing `AtpAgent` instances from `createDid()`.
   * Narrow-scope: only populated by `createDid` for freshly-provisioned
   * DIDs in the current process. Retained as a V6-era optimization for
   * the immediate-post-provisioning write window.
   */
  private sessionCache = new Map<string, AtpAgent>();

  constructor(
    private pdsUrl: string,
    private adminPassword: string,
    plcUrl?: string,
    authCredentialResolver?: AuthCredentialResolver,
  ) {
    this.adminAgent = new AtpAgent({ service: pdsUrl });
    this.plcUrl = plcUrl ?? 'https://plc.directory';
    // PDS admin API uses HTTP Basic auth: admin:<password>
    this.adminAuthHeader = 'Basic ' + Buffer.from(`admin:${adminPassword}`).toString('base64');
    this.authCredentialResolver = authCredentialResolver;
  }

  // ─── DID Operations ──────────────────────────────────────────────────────

  async createDid(options: CreateDidOptions): Promise<DidDocument> {
    // Create account on PDS via admin invite flow
    const handle =
      options.handle ?? `${options.entityType}-${Date.now()}.test`;
    const password = `auto-${crypto.randomUUID()}`;
    const email = `${handle.replace(/\./g, '-')}@coopsource.local`;

    // Create invite code via PDS admin API (Basic auth)
    const inviteRes = await fetch(`${this.pdsUrl}/xrpc/com.atproto.server.createInviteCode`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.adminAuthHeader,
      },
      body: JSON.stringify({ useCount: 1 }),
    });
    if (!inviteRes.ok) {
      const text = await inviteRes.text().catch(() => 'unknown');
      throw new Error(`Failed to create invite code (${inviteRes.status}): ${text}`);
    }
    const invite = (await inviteRes.json()) as { code: string };

    // Create a fresh agent for the new account.
    // Pin all requests to pdsUrl — the PDS DID doc may advertise an internal
    // hostname (e.g., localhost:3000 inside Docker) that isn't reachable from
    // the host. This fetch wrapper rewrites XRPC URLs to the configured pdsUrl.
    const pdsUrl = this.pdsUrl;
    const agent = new AtpAgent({
      service: pdsUrl,
      fetch: async (input: string | URL | Request, init?: RequestInit) => {
        let url: string;
        if (typeof input === 'string') {
          url = input;
        } else if (input instanceof URL) {
          url = input.toString();
        } else if (input instanceof Request) {
          url = input.url;
        } else {
          url = String(input);
        }
        // Rewrite any /xrpc/ URL to use the configured PDS URL
        const xrpcIdx = url.indexOf('/xrpc/');
        if (xrpcIdx !== -1) {
          url = pdsUrl + url.slice(xrpcIdx);
        }
        // Preserve method/body/headers from Request objects
        if (input instanceof Request && !init) {
          return globalThis.fetch(new Request(url, input));
        }
        return globalThis.fetch(url, init);
      },
    });
    const result = await agent.createAccount({
      handle,
      email,
      password,
      inviteCode: invite.code,
    });

    const did = result.data.did as DID;

    // Cache the session-bearing agent from createAccount. `authFor(did, lxm)`
    // checks this cache AFTER trying the service-auth JWT path — so when a
    // migrated cooperative has an atproto-signing key in `entity_key`, the
    // JWT takes precedence. The cache is only useful for freshly-provisioned
    // DIDs whose keys haven't been written yet, and for non-repo methods
    // where admin Basic is still accepted.
    this.sessionCache.set(did, agent);

    return this.resolveDid(did);
  }

  async resolveDid(did: DID): Promise<DidDocument> {
    // Resolve via PLC directory HTTP endpoint
    const res = await fetch(`${this.plcUrl}/${did}`);
    if (!res.ok) {
      throw new Error(`Failed to resolve DID ${did}: ${res.status}`);
    }
    return (await res.json()) as DidDocument;
  }

  async updateDidDocument(
    did: DID,
    _updates: UpdateDidOptions,
  ): Promise<DidDocument> {
    // DID document updates on a real PDS are done via the PDS admin or
    // the account holder's rotation key. For now, we only support handle updates.
    if (_updates.handle) {
      const agent = await this.authFor(did, 'com.atproto.identity.updateHandle');
      await agent.api.com.atproto.identity.updateHandle({
        handle: _updates.handle,
      });
    }
    return this.resolveDid(did);
  }

  // ─── Record Operations ───────────────────────────────────────────────────

  async createRecord(params: CreateRecordParams): Promise<RecordRef> {
    return this.withAuthForCoop(
      params.did,
      'com.atproto.repo.createRecord',
      async (agent) => {
        const result = await agent.api.com.atproto.repo.createRecord({
          repo: params.did,
          collection: params.collection,
          rkey: params.rkey,
          record: {
            $type: params.collection,
            ...params.record,
          },
        });
        return {
          uri: result.data.uri as AtUri,
          cid: result.data.cid as CID,
        };
      },
    );
  }

  async putRecord(params: PutRecordParams): Promise<RecordRef> {
    return this.withAuthForCoop(
      params.did,
      'com.atproto.repo.putRecord',
      async (agent) => {
        const result = await agent.api.com.atproto.repo.putRecord({
          repo: params.did,
          collection: params.collection,
          rkey: params.rkey,
          record: {
            $type: params.collection,
            ...params.record,
          },
        });
        return {
          uri: result.data.uri as AtUri,
          cid: result.data.cid as CID,
        };
      },
    );
  }

  async deleteRecord(params: DeleteRecordParams): Promise<void> {
    await this.withAuthForCoop(
      params.did,
      'com.atproto.repo.deleteRecord',
      async (agent) => {
        await agent.api.com.atproto.repo.deleteRecord({
          repo: params.did,
          collection: params.collection,
          rkey: params.rkey,
        });
      },
    );
  }

  async getRecord(uri: string): Promise<PdsRecord> {
    const { did, collection, rkey } = parseAtUri(uri);
    const agent = await this.authFor(did as DID, 'com.atproto.repo.getRecord');
    const result = await agent.api.com.atproto.repo.getRecord({
      repo: did,
      collection,
      rkey,
    });
    return {
      uri: result.data.uri as AtUri,
      cid: (result.data.cid ?? '') as CID,
      value: result.data.value as Record<string, unknown>,
      indexedAt: new Date().toISOString(),
    };
  }

  async listRecords(
    did: DID,
    collection: string,
    options?: ListRecordsOptions,
  ): Promise<PdsRecord[]> {
    const agent = await this.authFor(did, 'com.atproto.repo.listRecords');
    const result = await agent.api.com.atproto.repo.listRecords({
      repo: did,
      collection,
      limit: options?.limit ?? 50,
      cursor: options?.cursor,
      reverse: options?.reverse,
    });
    return result.data.records.map((r) => ({
      uri: r.uri as AtUri,
      cid: r.cid as CID,
      value: r.value as Record<string, unknown>,
      indexedAt: new Date().toISOString(),
    }));
  }

  // ─── Firehose ────────────────────────────────────────────────────────────

  async *subscribeRepos(cursor?: number): AsyncIterable<FirehoseEvent> {
    const wsUrl = this.pdsUrl.replace(/^http/, 'ws');
    const endpoint = `${wsUrl}/xrpc/com.atproto.sync.subscribeRepos${
      cursor != null ? `?cursor=${cursor}` : ''
    }`;

    let backoff = 1000;
    const MAX_BACKOFF = 30_000;

    while (true) {
      try {
        const events = connectFirehoseWebSocket(endpoint);
        for await (const event of events) {
          yield event;
          backoff = 1000; // reset on success
        }
      } catch {
        // WebSocket closed or errored — reconnect with backoff
        await new Promise((resolve) => setTimeout(resolve, backoff));
        backoff = Math.min(backoff * 2, MAX_BACKOFF);
      }
    }
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  /**
   * Return an `AtpAgent` configured to authenticate to the PDS for the
   * given `did`. `lxm` is accepted for future use (logging, telemetry,
   * possible future scope-aware auth) but is not used by the current
   * decision logic — all repo methods share the same session.
   *
   * Decision order (also documented on the class):
   *  1. App-password session (Path A, the V9.1 cooperative write path)
   *  2. Post-`createDid` in-process session cache (V6 legacy)
   *  3. Admin Basic fallback (terminal — works for admin endpoints, fails
   *     loudly on repo writes)
   */
  private async authFor(did: DID, _lxm: string): Promise<AtpAgent> {
    // Path 1: app-password session.
    const sessionAgent = await this.tryAppPasswordSession(did);
    if (sessionAgent) return sessionAgent;

    // Path 2: cached session from createDid in this process.
    const cached = this.sessionCache.get(did);
    if (cached) return cached;

    // Path 3: admin Basic fallback (broken for repo writes — see class doc).
    return this.newAgentWithAuth(this.adminAuthHeader);
  }

  /**
   * Look up the DID's stored app password and either return a cached
   * session-bearing agent or open a new one via `agent.login`. Returns
   * `undefined` if no credential resolver is wired, if the resolver
   * throws (no `auth_credential` row), or if login fails — callers fall
   * through to path 2 (the post-`createDid` session cache) and
   * eventually path 3 (admin Basic).
   *
   * The cached agent holds the decrypted app password only inside its
   * session manager (via `@atproto/api`'s internal `CredentialSession`)
   * — the plaintext is not stored anywhere else in the service. Per the
   * design decision: re-decrypt on each re-login rather than holding a
   * long-lived plaintext.
   */
  private async tryAppPasswordSession(
    did: DID,
  ): Promise<AtpAgent | undefined> {
    if (!this.authCredentialResolver) return undefined;

    const cached = this.appPasswordSessionCache.get(did);
    if (cached) return cached;

    let appPassword: string;
    try {
      appPassword = await this.authCredentialResolver.resolveAppPassword(did);
    } catch {
      return undefined;
    }

    const agent = new AtpAgent({ service: this.pdsUrl });
    try {
      await agent.login({ identifier: did, password: appPassword });
    } catch {
      // Login failed (wrong password, account suspended, etc.) — don't
      // cache; fall through so the caller can try path 2 or 3. The
      // caller gets a clearer error from the subsequent path's failure.
      return undefined;
    }
    this.appPasswordSessionCache.set(did, agent);
    return agent;
  }

  /**
   * Drop the cached app-password session for a DID so the next
   * `authFor(did, ...)` call will re-login via the stored credential.
   * Called from `withAuthForCoop` on retry-once after an auth error.
   */
  private invalidateAppPasswordSession(did: DID): void {
    this.appPasswordSessionCache.delete(did);
  }

  /**
   * Wrap a repo method call with "retry once on auth failure." If the
   * first attempt throws an auth-class error AND the call was using a
   * cached app-password session, drop the session, re-resolve the
   * credential, and retry once before propagating. Handles the rare case
   * where the cached agent's refresh token has been revoked or expired
   * out-of-band.
   *
   * For calls that take paths 2 or 3 (no app-password session), auth
   * errors propagate immediately — there's nothing to invalidate and
   * retry against.
   */
  private async withAuthForCoop<T>(
    did: DID,
    lxm: string,
    fn: (agent: AtpAgent) => Promise<T>,
  ): Promise<T> {
    const agent = await this.authFor(did, lxm);
    try {
      return await fn(agent);
    } catch (err) {
      if (
        isAuthErrorClass(err) &&
        this.appPasswordSessionCache.get(did) === agent
      ) {
        this.invalidateAppPasswordSession(did);
        const freshAgent = await this.authFor(did, lxm);
        return await fn(freshAgent);
      }
      throw err;
    }
  }

  /**
   * Construct a fresh `AtpAgent` whose outbound fetch attaches the given
   * `Authorization` header on every request. Used for paths 3 (admin
   * Basic) — the agent is disposable, header identity is entirely
   * caller-determined.
   */
  private newAgentWithAuth(authHeader: string): AtpAgent {
    return new AtpAgent({
      service: this.pdsUrl,
      fetch: async (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set('Authorization', authHeader);
        return globalThis.fetch(input, { ...init, headers });
      },
    });
  }
}

/**
 * Heuristic for "this thrown error indicates auth failure that may be
 * fixed by re-logging-in." We match against the error codes
 * `@atproto/xrpc` uses for session-expired / auth-required responses.
 * Any other error shape propagates untouched.
 */
function isAuthErrorClass(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { error?: unknown; status?: unknown };
  if (typeof e.error === 'string') {
    if (
      e.error === 'ExpiredToken' ||
      e.error === 'InvalidToken' ||
      e.error === 'AuthRequiredError' ||
      e.error === 'AuthMissing' ||
      e.error === 'AuthenticationRequired'
    ) {
      return true;
    }
  }
  if (e.status === 401) return true;
  return false;
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function parseAtUri(uri: string): {
  did: string;
  collection: string;
  rkey: string;
} {
  // at://did:plc:xxx/collection/rkey
  const withoutScheme = uri.replace('at://', '');
  const parts = withoutScheme.split('/');
  return {
    did: parts[0]!,
    collection: parts[1]!,
    rkey: parts[2]!,
  };
}

async function* connectFirehoseWebSocket(
  endpoint: string,
): AsyncIterable<FirehoseEvent> {
  const ws = new WebSocket(endpoint);

  const queue: FirehoseEvent[] = [];
  let resolve: (() => void) | null = null;
  let closed = false;
  let error: Error | null = null;

  ws.binaryType = 'arraybuffer';

  ws.addEventListener('message', (msg) => {
    try {
      const events = decodeFirehoseMessage(
        new Uint8Array(msg.data as ArrayBuffer),
      );
      for (const event of events) {
        queue.push(event);
      }
      resolve?.();
      resolve = null;
    } catch {
      // Skip malformed messages
    }
  });

  ws.addEventListener('close', () => {
    closed = true;
    resolve?.();
    resolve = null;
  });

  ws.addEventListener('error', (e) => {
    error = new Error(`WebSocket error: ${String(e)}`);
    closed = true;
    resolve?.();
    resolve = null;
  });

  // Wait for connection to open
  await new Promise<void>((res, rej) => {
    ws.addEventListener('open', () => res());
    ws.addEventListener('error', () =>
      rej(new Error('WebSocket connection failed')),
    );
  });

  try {
    while (!closed || queue.length > 0) {
      if (queue.length > 0) {
        yield queue.shift()!;
      } else if (!closed) {
        await new Promise<void>((r) => {
          resolve = r;
        });
      }
    }
    if (error) throw error;
  } finally {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  }
}
