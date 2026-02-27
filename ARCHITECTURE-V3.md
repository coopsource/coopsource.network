# Co-op Source Network — Architecture & Research Report (v3)

*Generated February 2026. Federated-from-day-one architecture. Incorporates codebase analysis of github.com/coopsource/coopsource.network and updated ATProto ecosystem research.*

---

## 1. Executive Summary

Co-op Source Network is a federated collaboration platform for technology-focused worker cooperatives. The existing codebase (Stages 0–1) implements the **recursive cooperative model** backed by PostgreSQL, Kysely, ATProto lexicons, bilateral membership, governance, agreements, and an AppView indexer loop.

This document specifies the architecture for **federated-from-day-one**: instead of building for a single server and retrofitting federation later, we introduce federation boundaries immediately while keeping local development simple via Docker Compose and a `standalone` mode.

### Core Design Principle

**Cross-co-op operations are always mediated by a `FederationClient` interface — never by direct database access or local function calls across co-op boundaries.** In `standalone` mode the implementation dispatches locally. In `federated` mode it makes HTTP calls. Business logic is identical either way.

### Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| DID method | `did:web` (primary) | No external PLC dependency; works with localhost in dev; natural for co-ops with custom domains |
| Cross-instance auth | HTTP Message Signatures (RFC 9421) | Keys already in `entity_key`; DID document serves public key; ATProto-aligned |
| PDS strategy | Formalize `LocalPdsService` now; migrate to `rsky-pds` later | PostgreSQL, no SQLite, clean upgrade path via `IPdsService` |
| Dev topology | Docker Compose multi-instance with volume mounts | Hot reload preserved; `make dev` for standalone, `make dev-federation` for multi-instance |
| Instance modes | `standalone` / `hub` / `coop` | Single config flag; standalone = hub + coop in one process |
| Cross-co-op transactions | Saga pattern via `FederationClient` | No shared-DB assumptions; works locally and federated |
| Permissions | Capability-based with role bundles | Orthogonal to federation; same system works at all scales |

---

## 2. Current Codebase Analysis

### 2.1 What Already Exists

```
apps/
  api/          — Express 5 backend, 11 services, DI container,
                  AppView indexer loop, OAuth scaffolding
  web/          — SvelteKit 2 / Svelte 5 frontend (Vite 7)
packages/
  lexicons/     — 22 ATProto lexicon schemas across 6 namespaces
  federation/   — IPdsService interface, LocalPdsService (PG-backed),
                  AtprotoPdsService (real XRPC), LocalPlcClient, firehose
  db/           — Kysely schema (19 migrations), 40+ tables
  common/       — Shared types, errors, validation
  config/       — tsconfig, eslint, prettier
infrastructure/
  docker-compose.yml — PostgreSQL 16, Redis 7, Mailpit, PLC, PDS images
```

**Existing abstractions that enable federation:**

| Abstraction | How It Helps |
|-------------|-------------|
| `IPdsService` interface | Two implementations already (Local + AtprotoXRPC); container switches on `PDS_URL` config |
| Bilateral membership | Member writes `membership`, co-op writes `memberApproval` — naturally two-sided |
| Per-entity signing keys | `entity_key` table stores encrypted ES256 keypairs per DID |
| `LocalPlcClient` | Generates real `did:plc` format identifiers, stored in PostgreSQL |
| Firehose via `pg_notify` | Local equivalent of ATProto's `subscribeRepos` |
| AppView loop | Already indexes from firehose events, cursor-tracked |

### 2.2 What Needs to Change

| Gap | Current | Target |
|-----|---------|--------|
| Cross-co-op operations | `NetworkService` does direct DB writes for both sides | `FederationClient` interface mediates all cross-boundary operations |
| DID resolution | `LocalPlcClient` — local-only | `did:web` — HTTP-resolvable, works in dev and production |
| Server-to-server auth | None | HTTP Message Signatures verified against DID document public keys |
| Instance topology | Single server assumed | `INSTANCE_ROLE` config: `standalone` / `hub` / `coop` |
| Dev environment | Single `pnpm dev` | Docker Compose with volume-mounted hot reload for multi-instance |
| Permissions | String-based roles in `memberApproval.roles[]` | Capability-based permission system with middleware enforcement |

---

## 3. Federation Architecture

### 3.1 The FederationClient Abstraction

This is the central new concept. Every operation that crosses co-op boundaries goes through `IFederationClient`. The pattern mirrors `IPdsService`: an interface with two implementations switched by config.

```typescript
// packages/federation/src/interfaces/federation-client.ts

export interface IFederationClient {
  // --- Identity ---
  resolveEntity(did: string): Promise<EntityInfo>;
  resolveDid(did: string): Promise<DidDocument>;

  // --- Membership ---
  requestMembership(params: {
    memberDid: string;
    cooperativeDid: string;
    message?: string;
  }): Promise<{ memberRecordUri: string; memberRecordCid: string }>;

  approveMembership(params: {
    cooperativeDid: string;
    memberDid: string;
    roles: string[];
  }): Promise<{ approvalRecordUri: string; approvalRecordCid: string }>;

  // --- Agreements ---
  requestSignature(params: {
    agreementUri: string;
    signerDid: string;
    cooperativeDid: string;
  }): Promise<{ acknowledged: boolean }>;

  // --- Network ---
  registerWithHub(params: {
    cooperativeDid: string;
    hubUrl: string;
    metadata: CoopMetadata;
  }): Promise<void>;

  notifyHub(event: FederationEvent): Promise<void>;

  // --- Discovery ---
  fetchCoopProfile(did: string): Promise<CoopProfile | null>;
  searchCoops(query: string): Promise<CoopProfile[]>;
}
```

**Two implementations:**

```typescript
// packages/federation/src/local/local-federation-client.ts
// Used in standalone mode — dispatches to local services directly
export class LocalFederationClient implements IFederationClient {
  constructor(
    private db: Kysely<Database>,
    private pdsService: IPdsService,
    private clock: IClock,
  ) {}

  async resolveEntity(did: string): Promise<EntityInfo> {
    // Direct DB lookup — same server
    const entity = await this.db
      .selectFrom('entity')
      .where('did', '=', did)
      .selectAll()
      .executeTakeFirst();
    // ...
  }

  async requestMembership(params) {
    // Write PDS record locally — member is on this server
    const ref = await this.pdsService.createRecord({
      did: params.memberDid as DID,
      collection: 'network.coopsource.org.membership',
      record: { cooperative: params.cooperativeDid, createdAt: this.clock.now().toISOString() },
    });
    return { memberRecordUri: ref.uri, memberRecordCid: ref.cid };
  }
  // ... other methods dispatch locally
}

// packages/federation/src/http/http-federation-client.ts
// Used in federated mode — makes signed HTTP requests to remote co-ops
export class HttpFederationClient implements IFederationClient {
  constructor(
    private signingKeyResolver: SigningKeyResolver,
    private didResolver: DidWebResolver,
  ) {}

  async resolveEntity(did: string): Promise<EntityInfo> {
    // Resolve did:web → get PDS URL → GET /api/v1/federation/entity/:did
    const doc = await this.didResolver.resolve(did);
    const pdsUrl = this.getPdsEndpoint(doc);
    const response = await this.signedFetch(
      `${pdsUrl}/api/v1/federation/entity/${encodeURIComponent(did)}`,
    );
    return response.json();
  }

  async requestMembership(params) {
    // Resolve target co-op's PDS URL, POST signed request
    const doc = await this.didResolver.resolve(params.cooperativeDid);
    const pdsUrl = this.getPdsEndpoint(doc);
    const response = await this.signedFetch(
      `${pdsUrl}/api/v1/federation/membership/request`,
      { method: 'POST', body: JSON.stringify(params) },
    );
    return response.json();
  }
  // ... other methods make signed HTTP calls
}
```

**Container wiring:**

```typescript
// apps/api/src/container.ts (revised)
const federationClient: IFederationClient =
  config.INSTANCE_ROLE === 'standalone'
    ? new LocalFederationClient(db, pdsService, clock)
    : new HttpFederationClient(
        new SigningKeyResolver(db, config.KEY_ENC_KEY),
        new DidWebResolver(),
      );
```

### 3.2 Identity: did:web

**Why did:web over did:plc:**

- `did:web` resolves via HTTP GET to `/.well-known/did.json` — works with `localhost:PORT` in dev
- No external PLC directory service needed
- Natural fit for cooperatives with custom domains
- Can coexist with `did:plc` — entities can have both (use `alsoKnownAs`)
- Migration to `did:plc` later just means registering with `plc.directory` and updating DID document

**DID format:**

```
# Network
did:web:coopsource.network

# Cooperatives (subdomain-based)
did:web:acme.coopsource.network
did:web:workers-guild.coopsource.network

# Cooperatives (custom domain)
did:web:acme.coop

# People (path-based under their co-op)
did:web:acme.coopsource.network:members:alice
did:web:acme.coopsource.network:members:bob

# In local dev
did:web:localhost%3A3001                          # hub
did:web:localhost%3A3002                          # coop-a
did:web:localhost%3A3002:members:alice             # member of coop-a
```

**DID document structure:**

```json
{
  "@context": ["https://www.w3.org/ns/did/v1", "https://w3id.org/security/multikey/v1"],
  "id": "did:web:acme.coopsource.network",
  "alsoKnownAs": ["at://acme.coopsource.network"],
  "verificationMethod": [{
    "id": "did:web:acme.coopsource.network#signingKey",
    "type": "Multikey",
    "controller": "did:web:acme.coopsource.network",
    "publicKeyMultibase": "zDnae..."
  }],
  "service": [{
    "id": "#coopsource",
    "type": "CoopSourcePds",
    "serviceEndpoint": "https://acme.coopsource.network"
  }, {
    "id": "#atprotoPds",
    "type": "AtprotoPersonalDataServer",
    "serviceEndpoint": "https://acme.coopsource.network"
  }]
}
```

**Implementation:**

```
New endpoint: GET /.well-known/did.json
  - Reads entity DID + signing key from database
  - Constructs DID document dynamically
  - Caches with ETag / If-None-Match

New class: DidWebResolver (in packages/federation/)
  - resolve(did: string) → DidDocument
  - Parses did:web → URL → fetches /.well-known/did.json
  - Caches resolved documents (5 min TTL)
  - For did:web:localhost%3A3002 → http://localhost:3002/.well-known/did.json
```

**Migration from LocalPlcClient:**

The `LocalPlcClient` currently generates DIDs as `did:plc:<hash>`. For federated-from-day-one:

1. New entities get `did:web` identifiers (derived from instance URL + entity handle)
2. The `entity_key` table continues storing signing keys
3. The `plc_operation` table is kept for future `did:plc` registration but not actively used
4. `LocalPlcClient` is retained for backward compatibility with existing data
5. `IPdsService.createDid()` returns a `did:web` identifier instead of `did:plc`

### 3.3 Server-to-Server Authentication: HTTP Message Signatures

When Co-op A's API sends a request to Co-op B's API, B needs to verify the request is legitimate.

**Approach:** HTTP Message Signatures (RFC 9421), using the signing key from the sender's DID document.

```
Co-op A wants to POST /api/v1/federation/membership/request to Co-op B:

1. A constructs the HTTP request
2. A signs it with its ES256 private key (from entity_key table)
3. A includes headers:
   - Signature-Input: sig=("@method" "@target-uri" "content-type" "content-digest");
                      keyid="did:web:coop-a.coopsource.network#signingKey";
                      alg="ecdsa-p256-sha256";
                      created=1709000000
   - Signature: sig=:base64-encoded-signature:
   - Content-Digest: sha-256=:hash-of-body:
4. B receives the request
5. B extracts the keyid from Signature-Input
6. B resolves did:web:coop-a.coopsource.network → gets public key
7. B verifies the signature against the request components
8. B checks the DID is authorized for the claimed operation
9. B processes the request
```

**Implementation:**

```typescript
// packages/federation/src/http/signing.ts

export async function signRequest(
  request: Request,
  signingKey: CryptoKey,
  keyId: string,  // e.g. "did:web:coop-a.coopsource.network#signingKey"
): Promise<Request> {
  // Sign per RFC 9421 with covered components:
  // "@method", "@target-uri", "content-type", "content-digest"
  // ...
}

export async function verifyRequest(
  request: Request,
  didResolver: DidWebResolver,
): Promise<{ verified: boolean; signerDid: string }> {
  // Extract keyid from Signature-Input
  // Resolve DID → get public key
  // Verify signature
  // ...
}

// apps/api/src/middleware/federation-auth.ts

export function requireFederationAuth(didResolver: DidWebResolver) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip if request is from local user session (not server-to-server)
    if (req.session?.did) return next();

    const result = await verifyRequest(req, didResolver);
    if (!result.verified) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    req.federationSender = result.signerDid;
    next();
  };
}
```

**In standalone mode:** Server-to-server auth is skipped because all requests are local. The `LocalFederationClient` calls service methods directly without HTTP.

### 3.4 Instance Roles and the Container

**Three modes via `INSTANCE_ROLE` env var:**

| Mode | What it runs | Use case |
|------|-------------|----------|
| `standalone` | Hub + Co-op + AppView in one process, one DB | Development, demos, small deployments |
| `hub` | Network directory, cross-co-op AppView, OAuth provider | coopsource.network in production |
| `coop` | Single co-op's API, PDS, local AppView | Individual co-op server in production |

**What changes per mode:**

```typescript
// apps/api/src/container.ts

function createContainer(config: AppConfig): Container {
  const db = createDb({ connectionString: config.DATABASE_URL! });
  const clock = new SystemClock();

  // PDS is always local in our architecture (formalized LocalPdsService)
  const pdsService = new LocalPdsService(db, { ... }, clock);

  // Federation client switches on instance role
  const federationClient: IFederationClient =
    config.INSTANCE_ROLE === 'standalone'
      ? new LocalFederationClient(db, pdsService, clock)
      : new HttpFederationClient(
          new SigningKeyResolver(db, config.KEY_ENC_KEY),
          new DidWebResolver(),
        );

  // DID resolver — local cache + HTTP fallback
  const didResolver = new DidWebResolver({
    localDb: db,  // check local DB first (fast path)
    cacheTtlMs: 5 * 60 * 1000,
  });

  // Hub-specific: network AppView (indexes events from remote co-ops)
  const networkAppView = (config.INSTANCE_ROLE === 'hub' || config.INSTANCE_ROLE === 'standalone')
    ? new NetworkAppView(db, federationClient, didResolver)
    : null;

  // Services receive federationClient instead of (or in addition to) direct DB access
  const networkService = new NetworkService(db, pdsService, federationClient, clock);
  const membershipService = new MembershipService(db, pdsService, federationClient, emailService, clock);
  const agreementService = new AgreementService(db, pdsService, federationClient, clock);

  return { db, pdsService, federationClient, didResolver, networkAppView, ... };
}
```

**Config additions:**

```typescript
// apps/api/src/config.ts (additions)
INSTANCE_ROLE: z.enum(['standalone', 'hub', 'coop']).default('standalone'),
INSTANCE_DID: z.string().optional(),   // Override auto-derived DID
HUB_URL: z.string().url().optional(),  // Hub URL for co-op instances to register with
```

### 3.5 Federation API Endpoints

New route group for server-to-server communication:

```
POST /api/v1/federation/membership/request
  — Remote member requests to join this co-op
  — Signed by member's co-op or by the member themselves
  — Creates pending membership record

POST /api/v1/federation/membership/approve
  — Remote co-op approves a member (writes memberApproval)
  — Signed by the co-op's DID

POST /api/v1/federation/agreement/sign-request
  — Remote co-op requests a signature on an agreement
  — Signed by the originating co-op

POST /api/v1/federation/agreement/signature
  — Remote member submits a signature
  — Signed by the member's DID

GET  /api/v1/federation/entity/:did
  — Fetch entity info (public profile, membership status)
  — No auth required (public endpoint)

GET  /api/v1/federation/coop/:did/profile
  — Fetch co-op profile for discovery
  — No auth required (public endpoint)

POST /api/v1/federation/hub/register
  — Co-op registers with the network hub
  — Signed by the co-op's DID
  — Hub-only endpoint

POST /api/v1/federation/hub/notify
  — Co-op notifies hub of events (new proposal, agreement, etc.)
  — Hub indexes for network-level discovery
```

**All federation endpoints accept HTTP Message Signatures.** In standalone mode, these endpoints exist but are never called externally — the `LocalFederationClient` bypasses them.

### 3.6 Service Refactoring

Services that currently do cross-co-op operations need to use `FederationClient` instead of direct DB access for the "other side" of bilateral operations.

**NetworkService.joinNetwork() — before:**

```typescript
// Current: directly writes PDS records for both sides
async joinNetwork(params) {
  // 1. PDS membership record in cooperative's PDS (this is the co-op's own record — OK)
  const memberRef = await this.pdsService.createRecord({
    did: params.cooperativeDid as DID,
    collection: 'network.coopsource.org.membership',
    record: { cooperative: params.networkDid, ... },
  });

  // 2. PDS memberApproval record in network's PDS ← CROSS-BOUNDARY!
  const approvalRef = await this.pdsService.createRecord({
    did: params.networkDid as DID,
    collection: 'network.coopsource.org.memberApproval',
    record: { member: params.cooperativeDid, roles: ['member'], ... },
  });

  // 3+4. DB writes in transaction ← assumes shared DB
  await this.db.transaction().execute(async (trx) => { ... });
}
```

**NetworkService.joinNetwork() — after:**

```typescript
// Refactored: uses FederationClient for the remote side
async joinNetwork(params) {
  // Step 1: Local operation — co-op writes its own membership record
  const memberRef = await this.pdsService.createRecord({
    did: params.cooperativeDid as DID,
    collection: 'network.coopsource.org.membership',
    record: { cooperative: params.networkDid, ... },
  });

  // Step 2: Cross-boundary — request approval from the network
  // In standalone mode: LocalFederationClient dispatches locally
  // In federated mode:  HttpFederationClient POSTs to the network's API
  const approvalRef = await this.federationClient.approveMembership({
    cooperativeDid: params.networkDid,
    memberDid: params.cooperativeDid,
    roles: ['member'],
  });

  // Step 3: Local operation — record the membership in our DB
  await this.db.transaction().execute(async (trx) => {
    await trx.insertInto('membership').values({
      member_did: params.cooperativeDid,
      cooperative_did: params.networkDid,
      status: 'active',
      member_record_uri: memberRef.uri,
      member_record_cid: memberRef.cid,
      approval_record_uri: approvalRef.approvalRecordUri,
      approval_record_cid: approvalRef.approvalRecordCid,
      ...
    }).execute();
  });
}
```

**The same pattern applies to:**
- `MembershipService.approveInvitation()` — approval is a cross-boundary write
- `AgreementService` — cross-co-op signing
- `ConnectionService` — external connections are inherently cross-boundary

### 3.7 Saga Coordinator

For multi-step cross-boundary operations that need compensating transactions:

```typescript
// packages/federation/src/saga.ts

export interface SagaStep<TContext> {
  name: string;
  execute: (ctx: TContext) => Promise<void>;
  compensate: (ctx: TContext) => Promise<void>;
}

export class SagaCoordinator<TContext> {
  private steps: SagaStep<TContext>[] = [];

  addStep(step: SagaStep<TContext>): this {
    this.steps.push(step);
    return this;
  }

  async run(ctx: TContext, logger: Logger): Promise<void> {
    const executed: SagaStep<TContext>[] = [];

    for (const step of this.steps) {
      try {
        logger.info({ step: step.name }, 'Saga step executing');
        await step.execute(ctx);
        executed.push(step);
      } catch (err) {
        logger.error({ err, step: step.name }, 'Saga step failed, compensating');

        for (const completed of [...executed].reverse()) {
          try {
            await completed.compensate(ctx);
            logger.info({ step: completed.name }, 'Saga step compensated');
          } catch (compensateErr) {
            logger.error({
              err: compensateErr,
              step: completed.name,
            }, 'Saga compensation failed — manual intervention needed');
          }
        }
        throw err;
      }
    }
  }
}
```

**Used for operations like cross-co-op agreement signing:**

```
Saga: Cross-Co-op Agreement
  Step 1: Create agreement record (local)       | Compensate: delete agreement record
  Step 2: Request signature (federation client)  | Compensate: cancel signature request
  Step 3: Record agreement in local DB           | Compensate: mark agreement as failed
```

Most operations in Stage 2 are two-step (write local + notify remote), so the Saga is simple. It becomes more valuable as operations grow more complex.

---

## 4. Development Environment

### 4.1 Standalone Mode (Default)

For day-to-day development, standalone mode works exactly like today:

```bash
# Start infrastructure (PG, Redis, Mailpit)
cd infrastructure && docker compose up -d

# Run API + frontend with hot reload
pnpm dev
```

Everything runs in one process, one database. The `LocalFederationClient` dispatches cross-co-op calls locally. This is the fastest iteration loop and works for building UI, testing governance flows, etc.

### 4.2 Federation Mode (Multi-Instance)

For testing actual federation, Docker Compose runs multiple API instances:

```yaml
# infrastructure/docker-compose.federation.yml

services:
  postgres:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: coopsource
      POSTGRES_PASSWORD: dev_password
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./init-federation-dbs.sql:/docker-entrypoint-initdb.d/init.sql
    # init-federation-dbs.sql creates:
    #   coopsource_hub, coopsource_coop_a, coopsource_coop_b

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  mailpit:
    image: axllent/mailpit:latest
    ports:
      - "1025:1025"
      - "8025:8025"

  hub:
    build:
      context: ..
      dockerfile: infrastructure/Dockerfile.dev
    command: pnpm --filter @coopsource/api dev
    volumes:
      - ../apps/api/src:/app/apps/api/src
      - ../packages:/app/packages
    environment:
      DATABASE_URL: postgresql://coopsource:dev_password@postgres:5432/coopsource_hub
      INSTANCE_URL: http://hub:3001
      INSTANCE_ROLE: hub
      PORT: 3001
      SESSION_SECRET: dev-hub-session-secret-32chars!!!
      KEY_ENC_KEY: aHViLWRldi1rZXktZW5jLWtleS0zMi1ieXRlcw==
      REDIS_URL: redis://redis:6379
      SMTP_HOST: mailpit
      SMTP_PORT: 1025
    ports:
      - "3001:3001"
    depends_on:
      - postgres
      - redis

  coop-a:
    build:
      context: ..
      dockerfile: infrastructure/Dockerfile.dev
    command: pnpm --filter @coopsource/api dev
    volumes:
      - ../apps/api/src:/app/apps/api/src
      - ../packages:/app/packages
    environment:
      DATABASE_URL: postgresql://coopsource:dev_password@postgres:5432/coopsource_coop_a
      INSTANCE_URL: http://coop-a:3002
      INSTANCE_ROLE: coop
      HUB_URL: http://hub:3001
      PORT: 3002
      SESSION_SECRET: dev-coop-a-session-secret-32chars!
      KEY_ENC_KEY: Y29vcC1hLWRldi1rZXktZW5jLWtleS0zMg==
      REDIS_URL: redis://redis:6379
      SMTP_HOST: mailpit
      SMTP_PORT: 1025
    ports:
      - "3002:3002"
    depends_on:
      - postgres
      - redis

  coop-b:
    build:
      context: ..
      dockerfile: infrastructure/Dockerfile.dev
    command: pnpm --filter @coopsource/api dev
    volumes:
      - ../apps/api/src:/app/apps/api/src
      - ../packages:/app/packages
    environment:
      DATABASE_URL: postgresql://coopsource:dev_password@postgres:5432/coopsource_coop_b
      INSTANCE_URL: http://coop-b:3003
      INSTANCE_ROLE: coop
      HUB_URL: http://hub:3001
      PORT: 3003
      SESSION_SECRET: dev-coop-b-session-secret-32chars!
      KEY_ENC_KEY: Y29vcC1iLWRldi1rZXktZW5jLWtleS0zMg==
      REDIS_URL: redis://redis:6379
      SMTP_HOST: mailpit
      SMTP_PORT: 1025
    ports:
      - "3003:3003"
    depends_on:
      - postgres
      - redis

  web:
    build:
      context: ..
      dockerfile: infrastructure/Dockerfile.dev
    command: pnpm --filter @coopsource/web dev -- --host 0.0.0.0
    volumes:
      - ../apps/web/src:/app/apps/web/src
    environment:
      PUBLIC_API_URL: http://localhost:3001
    ports:
      - "5173:5173"

volumes:
  pgdata:
```

```sql
-- infrastructure/init-federation-dbs.sql
CREATE DATABASE coopsource_hub;
CREATE DATABASE coopsource_coop_a;
CREATE DATABASE coopsource_coop_b;
```

```dockerfile
# infrastructure/Dockerfile.dev
FROM node:22-alpine
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/common/package.json packages/common/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/federation/package.json packages/federation/
COPY packages/lexicons/package.json packages/lexicons/
RUN pnpm install --frozen-lockfile
# Source code is volume-mounted, not copied — enables hot reload
```

**Makefile targets:**

```makefile
# Makefile
.PHONY: dev dev-federation migrate migrate-all test test-federation

dev:
	cd infrastructure && docker compose up -d postgres redis mailpit
	pnpm dev

dev-federation:
	cd infrastructure && docker compose -f docker-compose.federation.yml up --build

migrate:
	pnpm --filter @coopsource/db migrate:latest

migrate-all:
	DATABASE_URL=postgresql://coopsource:dev_password@localhost:5432/coopsource_hub pnpm --filter @coopsource/db migrate:latest
	DATABASE_URL=postgresql://coopsource:dev_password@localhost:5432/coopsource_coop_a pnpm --filter @coopsource/db migrate:latest
	DATABASE_URL=postgresql://coopsource:dev_password@localhost:5432/coopsource_coop_b pnpm --filter @coopsource/db migrate:latest

test:
	pnpm test

test-federation:
	cd infrastructure && docker compose -f docker-compose.federation.yml up -d
	sleep 5
	pnpm --filter @coopsource/api test:federation
	cd infrastructure && docker compose -f docker-compose.federation.yml down
```

### 4.3 Development Workflow

**Day-to-day (standalone):**
```
pnpm dev → save file → ~1s hot reload → test in browser
```
Same as today. No containers for the API — just PG/Redis/Mailpit in Docker.

**Testing federation:**
```
make dev-federation → save file → ~2s container file watcher → test cross-instance calls
```
Volume mounts mean you edit source locally and the containers pick up changes. The three API instances share the same source code but have separate databases and different `INSTANCE_ROLE` / `INSTANCE_URL` values.

**Integration tests:**
```
make test-federation → spins up all instances → runs federation test suite → tears down
```

**Rule of thumb:** Develop in standalone, test in federation periodically (same as you'd develop locally and test in staging).

---

## 5. Permissions System

*(Orthogonal to federation — works identically in all modes.)*

### 5.1 Capability-Based Permissions

```typescript
// packages/common/src/permissions.ts

export const PERMISSIONS = {
  'member.invite': 'Invite new members',
  'member.approve': 'Approve membership requests',
  'member.remove': 'Remove members',
  'member.roles.assign': 'Assign roles to members',
  'proposal.create': 'Create governance proposals',
  'proposal.open': 'Open proposals for voting',
  'proposal.close': 'Close voting on proposals',
  'proposal.resolve': 'Resolve proposal outcomes',
  'vote.cast': 'Cast votes on proposals',
  'agreement.create': 'Create agreements',
  'agreement.sign': 'Sign agreements',
  'agreement.amend': 'Amend existing agreements',
  'post.create': 'Create discussion posts',
  'post.moderate': 'Moderate posts',
  'project.create': 'Create projects',
  'project.manage': 'Manage project settings',
  'coop.settings.edit': 'Edit cooperative settings',
  'coop.roles.manage': 'Manage role definitions',
  'coop.billing.manage': 'Manage billing and subscriptions',
  'network.coop.approve': 'Approve cooperatives joining network',
  'network.coop.remove': 'Remove cooperatives from network',
} as const;

export type Permission = keyof typeof PERMISSIONS;
```

### 5.2 Built-in Roles

```typescript
export const BUILT_IN_ROLES: Record<string, { permissions: Permission[]; inherits?: string[] }> = {
  member: {
    permissions: [
      'proposal.create', 'vote.cast', 'agreement.sign',
      'post.create', 'project.create',
    ],
  },
  coordinator: {
    permissions: [
      'member.invite', 'member.approve', 'member.roles.assign',
      'proposal.open', 'proposal.close', 'proposal.resolve',
      'agreement.create', 'agreement.amend',
      'post.moderate', 'project.manage',
      'coop.settings.edit', 'coop.roles.manage',
    ],
    inherits: ['member'],
  },
  admin: {
    permissions: ['*' as Permission],
  },
  observer: {
    permissions: ['vote.cast'],
  },
};
```

### 5.3 Database Schema

```sql
-- Migration 020_role_definitions.ts
CREATE TABLE role_definition (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_did TEXT NOT NULL REFERENCES entity(did),
  name TEXT NOT NULL,
  permissions TEXT[] NOT NULL DEFAULT '{}',
  inherits TEXT[] NOT NULL DEFAULT '{}',
  is_builtin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(cooperative_did, name)
);
```

### 5.4 Permission Middleware

```typescript
// apps/api/src/middleware/permissions.ts

export function requirePermission(permission: Permission) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userDid = req.session?.did;
    const cooperativeDid = req.params.cooperativeDid || req.params.did;

    if (!userDid || !cooperativeDid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const allowed = await hasPermission(req.container.db, userDid, cooperativeDid, permission);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden', required: permission });
    }

    next();
  };
}

async function hasPermission(
  db: Kysely<Database>,
  userDid: string,
  cooperativeDid: string,
  permission: Permission,
): Promise<boolean> {
  // 1. Get user's roles in this co-op
  const roles = await db
    .selectFrom('membership')
    .innerJoin('membership_role', 'membership_role.membership_id', 'membership.id')
    .where('membership.member_did', '=', userDid)
    .where('membership.cooperative_did', '=', cooperativeDid)
    .where('membership.status', '=', 'active')
    .where('membership.invalidated_at', 'is', null)
    .select('membership_role.role')
    .execute();

  const roleNames = roles.map(r => r.role);
  if (roleNames.includes('admin')) return true;

  // 2. Resolve role definitions with inheritance
  const allPerms = await resolvePermissions(db, cooperativeDid, roleNames);
  return allPerms.has(permission) || allPerms.has('*');
}

async function resolvePermissions(
  db: Kysely<Database>,
  cooperativeDid: string,
  roleNames: string[],
): Promise<Set<string>> {
  const roleDefs = await db
    .selectFrom('role_definition')
    .where('cooperative_did', '=', cooperativeDid)
    .selectAll()
    .execute();

  const perms = new Set<string>();
  const visited = new Set<string>();

  function resolve(name: string) {
    if (visited.has(name)) return;
    visited.add(name);
    const def = roleDefs.find(d => d.name === name);
    if (!def) return;
    for (const p of def.permissions) perms.add(p);
    for (const parent of def.inherits ?? []) resolve(parent);
  }

  for (const name of roleNames) resolve(name);
  return perms;
}
```

---

## 6. Site Architecture: Contextual UX

**Single SvelteKit app with role-based routing:**

```
coopsource.network/                     — Public landing page
coopsource.network/explore              — Public directory of co-ops and networks
coopsource.network/explore/:handle      — Public co-op profile page
coopsource.network/join                 — Sign up / create co-op flow
coopsource.network/login                — Auth flow

coopsource.network/dashboard            — User's personal dashboard
  ├── My co-ops
  ├── My networks
  └── Invitations

coopsource.network/c/:handle/           — Co-op workspace (authed)
  ├── members
  ├── governance
  ├── agreements
  ├── posts
  ├── projects
  └── settings

coopsource.network/n/:handle/           — Network workspace (authed)
  ├── cooperatives
  ├── governance
  └── agreements
```

The `/c/` and `/n/` routes share components — a network IS a cooperative. The recursive model means the same governance/agreement/membership components render at both levels.

---

## 7. Dependency Upgrades

An audit of all 32 npm dependencies (February 2026) found **12 major version bumps** and a Node.js LTS transition. The upgrades should be done in coordinated phases before or alongside the federation implementation work to avoid compounding migration debt.

### 7.1 Version Matrix (Current → Target)

| Package | Current | Target | Breaking? |
|---------|---------|--------|-----------|
| **express** | ^4.21 | **^5.2** | ✅ Major (4→5) |
| **vite** | ^6 | **^7.3** | ✅ Major (6→7) |
| **@sveltejs/vite-plugin-svelte** | ^5 | **^6.2** | ✅ Major (5→6, peers on Vite 7) |
| **@sveltejs/adapter-auto** | ^4 | **^7.0** | ✅ Major (4→7) |
| **zod** | ^3.23 | **^4.3** | ✅ Major (3→4) |
| **pnpm** | 9.15.4 | **10.30.2** | ✅ Major (9→10) |
| **vitest** | ^3 | **^4.0** | ✅ Major (3→4) |
| **pino** | ^9 | **^10.3** | ✅ Major (9→10) |
| **pino-http** | ^10 | **^11.0** | ✅ Major (10→11) |
| **nodemailer** | ^6 | **^8.0** | ✅ Major (6→8) |
| **bcrypt** | ^5 | **^6.0** | ✅ Major (5→6) |
| **kysely** | ^0.27 | **^0.28** | ⚠️ 0.x minor (likely breaking) |
| **@atproto/api** | ^0.18.21 | **^0.19.0** | ⚠️ 0.x minor (won't auto-resolve) |
| **typescript** | ^5.7 | ^5.9 | Minor (auto-resolves) |
| **@sveltejs/kit** | ^2.20 | ^2.53 | Minor (auto-resolves) |
| **svelte** | ^5.19 | ^5.53 | Minor (auto-resolves) |
| **tailwindcss** | ^4 | ^4.2 | Minor (auto-resolves) |
| **turbo** | ^2.3 | ^2.8 | Minor (auto-resolves) |
| **Node.js** | 22 LTS | **24 LTS** | ✅ LTS transition |

**Anomalous pins to fix immediately:**
- `cborg: ^4.5.8` — version 4.5.8 does not exist on npm (latest is 4.3.2). Change to `^4.3.2`.
- `@lucide/svelte: 0.575.0` — this exact version may not exist. Unpin to `^0.574.0` (latest published).
- `@atproto/xrpc: ^0.7.7` — verify this version exists; latest published appears to be 0.7.6.

### 7.2 Upgrade Phases (Phase 0)

These upgrades should be done **before** the federation implementation phases. They're numbered 0a–0f to indicate they precede Phase 1.

**Phase 0a — Fix anomalous pins + auto-resolve minors (no risk)**

Run `pnpm update` to pick up all packages within existing `^` ranges (TypeScript 5.9, SvelteKit 2.53, Svelte 5.53, Tailwind 4.2, turbo 2.8, tsx 4.21, pg 8.19, Prettier 3.8, Helmet 8.1, Stripe 20.4, Playwright 1.58, svelte-check 4.4). Fix the cborg, @lucide/svelte, and @atproto/xrpc pins. Run tests.

**Phase 0b — Coordinated Vite cascade**

Upgrade together (these three are interdependent — vite-plugin-svelte v6 requires Vite 7 as a peer):
- `vite` ^6 → ^7.3
- `@sveltejs/vite-plugin-svelte` ^5 → ^6.2
- `@sveltejs/adapter-auto` ^4 → ^7.0

Run full frontend test suite after. Note: `@tailwindcss/vite` must still come BEFORE `sveltekit()` in vite.config.ts (unchanged).

**Phase 0c — Backend stack**

Upgrade together:
- `express` ^4.21 → ^5.2 — migration guide at expressjs.com; main changes: removed `app.del()`, pluralized `req.acceptsCharset()` → `req.acceptsCharsets()`, Node.js 18+ required. Route handler errors are now forwarded to error middleware automatically (no need for try/catch + next(err) in async handlers).
- `pino` ^9 → ^10.3 + `pino-http` ^10 → ^11.0 — upgrade together, pino-http 11 peers on Pino 10. Pino 10 bumps `pino-abstract-transport` to v3 and `thread-stream` to v4 with hardened transport loading.
- `nodemailer` ^6 → ^8.0 — error codes changed (e.g., `'NoAuth'` → `'ENOAUTH'`), improved socket cleanup. License changed to MIT No Attribution.
- `bcrypt` ^5 → ^6.0 — or switch to `bcryptjs ^3.0` (pure JS, no native compilation, ~30% slower per hash but zero node-gyp issues in Docker/CI).

**Phase 0d — Build tooling**

- `pnpm` 9 → 10 — pure ESM package, config migrates from `.npmrc` to `pnpm-workspace.yaml`, `allowBuilds` replaces `onlyBuiltDependencies`/`neverBuiltDependencies`. Update `packageManager` field in root package.json.
- `vitest` ^3 → ^4.0 — deprecated `vitest/*` entry points, updated SSR environment runner. Check vitest.dev/blog/vitest-4 migration guide.

**Phase 0e — Schema and data libraries (highest risk, do last)**

- `zod` ^3.23 → ^4.3 — ground-up redesign. String format validators moved to top-level (`z.string().email()` → `z.email()`), error customization rebuilt (`message` → `error`), `.record()` requires two arguments, `.superRefine()` deprecated. Your `config.ts` envSchema heavily uses `.superRefine()` — will need rewriting. **Verify @atproto/oauth-client-node compatibility with Zod 4 before upgrading.** Zod 4 supports incremental migration via `import { z } from "zod/v4"` subpath.
- `kysely` ^0.27 → ^0.28 — 0.x minor but likely has breaking query builder API changes. Review changelog carefully.
- `@atproto/api` ^0.18.21 → ^0.19.0 — pre-1.0, so `^0.18.x` won't auto-resolve. Manual bump required.

**Phase 0f — Node.js runtime**

- Node.js 22 (Maintenance LTS, EOL April 2027) → Node.js 24 (Active LTS, latest 24.13.1).
- Update `engines.node` in root package.json, Dockerfile base images, and CI config.
- Do this last once all dependencies are confirmed compatible with Node 24.

---

## 8. Implementation Plan

### Phase 1: Federation Foundation (2-3 weeks)

```
1.1 did:web support
  ├── Implement DidWebResolver in packages/federation/src/http/
  ├── Add GET /.well-known/did.json endpoint to Express API
  ├── Update LocalPdsService.createDid() to generate did:web identifiers
  ├── Add did:web parsing utilities to @coopsource/common
  └── Keep LocalPlcClient for backward compatibility

1.2 IFederationClient interface + implementations
  ├── Define IFederationClient in packages/federation/src/interfaces/
  ├── Implement LocalFederationClient (dispatches locally)
  ├── Implement HttpFederationClient (signed HTTP calls)
  ├── Add IFederationClient to Container and wire into services
  └── Add INSTANCE_ROLE + HUB_URL to config.ts

1.3 HTTP Message Signatures
  ├── Implement signRequest() + verifyRequest() in packages/federation/src/http/
  ├── Create requireFederationAuth middleware
  ├── Wire into federation API routes
  └── Test signature round-trip

1.4 Federation API endpoints
  ├── POST /api/v1/federation/membership/request
  ├── POST /api/v1/federation/membership/approve
  ├── GET  /api/v1/federation/entity/:did
  ├── POST /api/v1/federation/hub/register
  └── POST /api/v1/federation/hub/notify
```

### Phase 2: Service Refactoring (1-2 weeks)

```
2.1 Refactor NetworkService
  ├── Inject IFederationClient
  ├── Replace direct bilateral PDS writes with FederationClient calls
  ├── Test in standalone mode (LocalFederationClient)
  └── Test in federation mode (HttpFederationClient)

2.2 Refactor MembershipService
  ├── approveInvitation() uses FederationClient for cross-boundary approval
  └── Invitation flow works across instances

2.3 Add SagaCoordinator
  ├── Implement in packages/federation/src/saga.ts
  ├── Use for multi-step cross-boundary operations
  └── Add cross_coop_outbox migration for reliability
```

### Phase 3: Permissions (1-2 weeks)

```
3.1 Permission types and built-in roles
  ├── Define Permission type in @coopsource/common
  ├── Create migration 020_role_definitions.ts
  └── Seed built-in roles on co-op creation

3.2 Permission enforcement
  ├── Implement requirePermission() middleware
  ├── Wire into all existing route handlers
  └── Test permission checks
```

### Phase 4: Development Infrastructure (1 week)

```
4.1 Docker Compose federation setup
  ├── docker-compose.federation.yml
  ├── Dockerfile.dev (volume-mount-friendly)
  ├── init-federation-dbs.sql
  └── Makefile targets (dev, dev-federation, migrate-all)

4.2 Federation integration tests
  ├── Test cross-instance membership flow
  ├── Test cross-instance agreement signing
  ├── Test hub registration and discovery
  └── CI pipeline for federation tests
```

### Phase 5: Public Discovery + UX (2-3 weeks)

```
5.1 Public API endpoints
  ├── GET /api/v1/explore/cooperatives
  ├── GET /api/v1/explore/cooperatives/:handle
  └── GET /api/v1/explore/networks

5.2 SvelteKit routes
  ├── (public)/explore — co-op directory
  ├── (public)/explore/:handle — co-op profile
  ├── (authed)/dashboard — personal dashboard
  └── (workspace)/c/[handle]/ — co-op workspace
```

### Database Migrations

```
020_role_definitions.ts       — role_definition table + built-in role seeding
021_did_web_support.ts        — Add did_web column to entity, update entity_key indices
022_federation_endpoints.ts   — Add federation_peer table (known remote instances)
023_cross_coop_outbox.ts      — Outbox table for cross-co-op operations
024_public_profile_fields.ts  — Add public visibility flags
```

---

## 9. ATProto Ecosystem Context (February 2026)

**Why this architecture aligns with ATProto's direction:**

1. **did:web is a first-class DID method** in ATProto. The protocol supports both `did:plc` and `did:web`. Using `did:web` now means entities can later register with `plc.directory` as an additional identifier without breaking anything.

2. **Auth Scopes (August 2025)** introduced granular permissions to the ATProto ecosystem. Our capability-based permission system is philosophically aligned — when we connect to the wider ecosystem, our permissions map naturally to ATProto auth scopes.

3. **rsky-pds** (Blacksky's Rust/PostgreSQL PDS) is on a roadmap to v1.0 within 12 months. When it's ready, migrating from our formalized `LocalPdsService` means deploying rsky-pds alongside our API and updating the container config — business logic doesn't change.

4. **Sync v1.1** makes relays lightweight ($20-34/month). When we want cross-network visibility beyond our own hub, deploying a relay is cheap.

5. **IETF standardization** (working group chartered January 2026) validates building on ATProto long-term.

---

## 10. Security Considerations

1. **HTTP Message Signatures** — Use ES256 (P-256) keys. Verify `created` timestamp is within 5 minutes to prevent replay. Include `content-digest` for request bodies.

2. **DID document caching** — Cache resolved DID documents for 5 minutes. Invalidate on 404 or signature verification failure. This prevents both excessive resolution traffic and stale key attacks.

3. **Standalone mode security** — In standalone mode, federation auth is skipped because all calls are local. This is fine for development. In production, always use `hub` or `coop` mode.

4. **Entity key management** — Signing keys stored encrypted with AES-GCM in `entity_key`. `KEY_ENC_KEY` must be unique per instance in production.

5. **Cross-co-op authorization** — A valid signature proves identity but not authorization. Federation endpoints must check that the signer DID has the right to perform the operation (e.g., a co-op DID can approve its own members, but not another co-op's members).

6. **Recovery keys** — Each entity's DID document should include a recovery key with higher priority than the operational signing key. This is the "credible exit" guarantee.

---

## 11. Deployment Architecture

### Standalone (Development / Small Deployment)

```
┌──────────────────────────────────────────┐
│           single server                  │
│                                          │
│  ┌──────────────┐  ┌─────────────────┐   │
│  │  Express API │  │  SvelteKit      │   │
│  │  + LocalPDS  │  │  Frontend       │   │
│  │  + AppView   │  │                 │   │
│  │  + LocalFed  │  │                 │   │
│  └──────┬───────┘  └─────────────────┘   │
│         │                                │
│  ┌──────┴───────┐  ┌─────────────────┐   │
│  │ PostgreSQL   │  │  Redis          │   │
│  └──────────────┘  └─────────────────┘   │
└──────────────────────────────────────────┘
```

### Federated (Production)

```
┌──────────────────────┐     ┌──────────────────────┐
│ Co-op A (ROLE=coop)  │     │ Co-op B (ROLE=coop)  │
│  API + LocalPDS + PG │     │  API + LocalPDS + PG │
└──────────┬───────────┘     └───────────┬──────────┘
           │   signed HTTP               │
           └──────────┬──────────────────┘
                      │
           ┌──────────┴──────────┐
           │ Hub (ROLE=hub)      │
           │  API + NetworkAppView│
           │  + PG               │
           │  coopsource.network │
           └─────────────────────┘
```

Each instance is a full copy of the same codebase, differentiated only by environment variables (`INSTANCE_ROLE`, `DATABASE_URL`, `HUB_URL`).
