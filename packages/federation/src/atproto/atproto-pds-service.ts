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

/**
 * Stage 2: Wraps @atproto/api to talk to a real ATProto PDS via XRPC.
 *
 * Each entity (person/cooperative) has its own account on the PDS.
 * The API server authenticates as the PDS admin to create accounts,
 * and uses per-entity session tokens for record operations.
 */
export class AtprotoPdsService implements IPdsService {
  private adminAgent: AtpAgent;
  private plcUrl: string;
  private sessionCache = new Map<string, AtpAgent>();
  private adminAuthHeader: string;

  constructor(
    private pdsUrl: string,
    private adminPassword: string,
    plcUrl?: string,
  ) {
    this.adminAgent = new AtpAgent({ service: pdsUrl });
    this.plcUrl = plcUrl ?? 'https://plc.directory';
    // PDS admin API uses HTTP Basic auth: admin:<password>
    this.adminAuthHeader = 'Basic ' + Buffer.from(`admin:${adminPassword}`).toString('base64');
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

    // Cache the session for future record operations
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
      const agent = await this.getAgentForDid(did);
      await agent.api.com.atproto.identity.updateHandle({
        handle: _updates.handle,
      });
    }
    return this.resolveDid(did);
  }

  // ─── Record Operations ───────────────────────────────────────────────────

  async createRecord(params: CreateRecordParams): Promise<RecordRef> {
    const agent = await this.getAgentForDid(params.did);
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
    const agent = await this.getAgentForDid(params.did);
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
    const agent = await this.getAgentForDid(params.did);
    await agent.api.com.atproto.repo.deleteRecord({
      repo: params.did,
      collection: params.collection,
      rkey: params.rkey,
    });
  }

  async getRecord(uri: string): Promise<PdsRecord> {
    const { did, collection, rkey } = parseAtUri(uri);
    const agent = await this.getAgentForDid(did as DID);
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
    const agent = await this.getAgentForDid(did);
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

  private async getAgentForDid(did: DID): Promise<AtpAgent> {
    const cached = this.sessionCache.get(did);
    if (cached) return cached;

    // No cached session — use admin auth to operate on the repo.
    // PDS admin can perform repo operations on any account.
    // Inject admin Basic auth via the AtpAgent's fetch handler.
    const adminAuth = this.adminAuthHeader;
    const agent = new AtpAgent({
      service: this.pdsUrl,
      fetch: async (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set('Authorization', adminAuth);
        return globalThis.fetch(input, { ...init, headers });
      },
    });
    this.sessionCache.set(did, agent);
    return agent;
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
