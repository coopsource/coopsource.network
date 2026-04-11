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
import type { ServiceAuthClient } from './service-auth-client.js';
import type { SigningKeyResolver } from '../http/signing-key-resolver.js';
import { resolvePdsServiceDid } from './pds-did-resolver.js';

/**
 * Stage 2: Wraps @atproto/api to talk to a real ATProto PDS via XRPC.
 *
 * Each entity (person/cooperative) has its own account on the PDS. Writes
 * go through `authFor(did, lxm)`, which picks an auth header in this order:
 *
 * 1. **Service-auth JWT (V9.1 — the target path)**: if a `SigningKeyResolver`
 *    and `ServiceAuthClient` are wired and the target DID has an
 *    `atproto-signing` key in `entity_key` (written by the provisioning or
 *    migration scripts once CSN controls the cooperative's PLC
 *    `verificationMethods.atproto` key), mint a short-lived ES256 JWT bound
 *    to the XRPC method and attach it as `Authorization: Bearer <jwt>`. A
 *    fresh JWT is minted per operation; no caching.
 *
 * 2. **Post-createDid session cache (V6 legacy, narrow scope)**: if a write
 *    happens immediately after `createDid()` in the same process, use the
 *    account-session-bearing `AtpAgent` we cached at that point. This is
 *    what the V6 implementation always relied on for freshly-provisioned
 *    cooperatives — it's the only pre-V9.1 path that actually worked for
 *    `com.atproto.repo.*` methods.
 *
 * 3. **Admin Basic fallback (broken for repo writes, kept for back-compat)**:
 *    attach `Authorization: Basic admin:<password>`. This is what the V6
 *    code advertised as the universal fallback, but empirically a real
 *    `@atproto/pds` rejects admin Basic for `com.atproto.repo.*` methods
 *    ("Unexpected authorization type"). This branch is kept for
 *    non-repo methods (admin endpoints, identity updates) and for DIDs
 *    that don't exist in either the cache or `entity_key` — the call
 *    will fail if it's a repo write, and the failure is the right
 *    operator signal to run the migration script.
 *
 * V9.1's operational goal is to make path 1 the dominant one for every
 * cooperative write. Path 2 stays as a narrow in-process optimization for
 * test ergonomics. Path 3 is legacy and will fail loudly on real repo
 * writes — which is the correct signal.
 */
export class AtprotoPdsService implements IPdsService {
  private adminAgent: AtpAgent;
  private plcUrl: string;
  private adminAuthHeader: string;
  private signingKeyResolver?: SigningKeyResolver;
  private serviceAuthClient?: ServiceAuthClient;

  /**
   * Cache of session-bearing `AtpAgent` instances from `createDid()`.
   * Narrow-scope: only populated by `createDid` for freshly-provisioned
   * DIDs in the current process. Not a general-purpose auth cache; not a
   * JWT cache; JWTs are always minted fresh in `authFor()`.
   */
  private sessionCache = new Map<string, AtpAgent>();

  constructor(
    private pdsUrl: string,
    private adminPassword: string,
    plcUrl?: string,
    signingKeyResolver?: SigningKeyResolver,
    serviceAuthClient?: ServiceAuthClient,
  ) {
    this.adminAgent = new AtpAgent({ service: pdsUrl });
    this.plcUrl = plcUrl ?? 'https://plc.directory';
    // PDS admin API uses HTTP Basic auth: admin:<password>
    this.adminAuthHeader = 'Basic ' + Buffer.from(`admin:${adminPassword}`).toString('base64');
    this.signingKeyResolver = signingKeyResolver;
    this.serviceAuthClient = serviceAuthClient;
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
    const agent = await this.authFor(params.did, 'com.atproto.repo.createRecord');
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
  }

  async putRecord(params: PutRecordParams): Promise<RecordRef> {
    const agent = await this.authFor(params.did, 'com.atproto.repo.putRecord');
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
  }

  async deleteRecord(params: DeleteRecordParams): Promise<void> {
    const agent = await this.authFor(params.did, 'com.atproto.repo.deleteRecord');
    await agent.api.com.atproto.repo.deleteRecord({
      repo: params.did,
      collection: params.collection,
      rkey: params.rkey,
    });
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
   * given `did` + XRPC method. Decision order:
   *
   *  1. Service-auth JWT (V9.1 target) — if `SigningKeyResolver` and
   *     `ServiceAuthClient` are wired AND `resolveRawBytes(did,
   *     'atproto-signing')` returns a key, mint a fresh JWT and return
   *     a **new** `AtpAgent` with `Authorization: Bearer <jwt>`. Never
   *     cached.
   *  2. Post-createDid session cache — if the DID was provisioned in
   *     this process, return the cached session-bearing agent.
   *  3. Admin Basic fallback — a new agent with `Authorization: Basic
   *     admin:<password>`. Works for admin-only endpoints; empirically
   *     rejected by the PDS for `com.atproto.repo.*` methods. The
   *     rejection is the right operator signal to migrate the
   *     cooperative's signing key (see scripts/migrate-coop-signing-key.ts).
   */
  private async authFor(did: DID, lxm: string): Promise<AtpAgent> {
    // Path 1: service-auth JWT.
    const jwtAgent = await this.tryMintJwtAgent(did, lxm);
    if (jwtAgent) return jwtAgent;

    // Path 2: cached session from createDid in this process.
    const cached = this.sessionCache.get(did);
    if (cached) return cached;

    // Path 3: admin Basic fallback (broken for repo writes — see class doc).
    return this.newAgentWithAuth(this.adminAuthHeader);
  }

  /**
   * Attempt to mint a service-auth JWT for the (`did`, `lxm`) pair and
   * return a fresh agent bearing it. Returns `undefined` if the JWT path
   * is unavailable (missing deps, or `resolveRawBytes` throws because no
   * `atproto-signing` key exists for this DID). Isolated as its own method
   * so the tryable/catchable shape is explicit at the call site.
   */
  private async tryMintJwtAgent(
    did: DID,
    lxm: string,
  ): Promise<AtpAgent | undefined> {
    if (!this.signingKeyResolver || !this.serviceAuthClient) return undefined;

    let signingKey: Uint8Array;
    try {
      signingKey = await this.signingKeyResolver.resolveRawBytes(
        did,
        'atproto-signing',
      );
    } catch {
      // No atproto-signing key — member DIDs, unmigrated cooperatives,
      // the standalone instance DID, etc. Fall through to cache/admin.
      return undefined;
    }

    const audienceDid = await resolvePdsServiceDid(this.pdsUrl);
    const jwt = await this.serviceAuthClient.createServiceAuth({
      issuerDid: did,
      audienceDid,
      lxm,
      signingKey,
    });
    return this.newAgentWithAuth(`Bearer ${jwt}`);
  }

  /**
   * Construct a fresh `AtpAgent` whose outbound fetch attaches the given
   * `Authorization` header on every request. The agent is disposable —
   * every call to `authFor` returns one — so header identity is entirely
   * determined by the caller.
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
