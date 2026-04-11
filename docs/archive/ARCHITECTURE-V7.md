# ARCHITECTURE-V7.md — Production Deployment & Ecosystem Integration

> **Prerequisite**: V6 federation migration (complete, all 4 phases merged March 26, 2026)
> **Design reference**: ARCHITECTURE-V5.md (cooperative lifecycle, security model, lexicon schemas)
> **Federation reference**: ARCHITECTURE-V6.md (ATProto integration design)
> **ATProto guidance**: https://atproto.com/guides/going-to-production, https://atproto.com/guides/self-hosting
> **Date**: April 2, 2026 (updated April 5, 2026 — P4-P9 complete)
> **Status**: All phases complete (P1-P9)

---

## Executive Summary

V6 delivered real ATProto federation. V7 gets it production-ready and extensible:

- **P1-P3 (complete)**: Production deployment — Tap firehose, PDS setup, private network mode
- **P4-P5 (complete)**: Native ATProto label service, V3 cleanup
- **P6-P9 (complete)**: Unified hook pipeline, declarative indexers, cooperative scripting engine, MCP tools

**Key simplifications from ATProto ecosystem review (April 2026):**

1. **Use the official PDS install script** (`installer.sh`) instead of our own Docker PDS setup — it handles Docker, Caddy TLS, and account management out of the box
2. **Use Tap with `@atproto/tap` TypeScript client** instead of our custom `relay-consumer.ts` — Tap handles firehose connections, crypto verification, backfill, filtering, and cursor management. Our relay consumer reimplements all of this
3. **Don't run our own relay for public mode** — use `bsky.network`. For private networks, use the Go relay from `bluesky-social/indigo`
4. **Domain separation is mandatory** — PDS and AppView MUST be on different domains (not subdomains). This is a security requirement for blob serving and OAuth

**Key insights from Quickslice/Happyview research (April 2026):**

5. **Unified hook pipeline** — Replace our hard-coded 18-case switch statement with a registry of hooks. `pds_record` (generic JSONB) becomes the source of truth; hooks build materialized views in domain tables.
6. **Declarative indexers** — 12 of 18 indexers are simple field mappings that can be expressed as JSON config instead of TypeScript code. External lexicons can be registered at runtime without code changes.
7. **Cooperative scripting** — Per-cooperative TypeScript automation via Worker Thread sandboxes. Scripts are Tier 2 private data (not on the firehose). Triggered by record events or domain events.

**Two deployment modes:**

| Mode | Use case | Infrastructure |
|------|----------|---------------|
| **Public** | Cooperatives visible on Bluesky, interoperable with the ATProto ecosystem | PDS via install script, Tap consuming `bsky.network`, our AppView |
| **Private** | Closed network of cooperatives, no connection to public ATProto | Self-hosted PLC + relay + PDS instances, Tap consuming private relay |

---

## 1. Architecture (Simplified)

### What we run

| Component | Purpose | Implementation |
|-----------|---------|----------------|
| **Co-op Source AppView** | Index `network.coopsource.*` records, serve API | Our Express app (`apps/api/`) |
| **SvelteKit frontend** | Web UI | Our SvelteKit app (`apps/web/`) |
| **Tap** | Firehose sync + backfill | Official Go binary (`ghcr.io/bluesky-social/indigo/tap`) |
| **PostgreSQL** | AppView index + Tier 2 private data | Existing |
| **Redis** | Session cache | Existing |

### What we DON'T run (public mode)

| Component | Who provides it | Why |
|-----------|----------------|-----|
| PDS | Each cooperative self-hosts via official install script | PDS is the cooperative's data home; we're the AppView, not the PDS host |
| Relay | Bluesky (`bsky.network`) | Running a full relay costs significant bandwidth; use the shared one |
| PLC directory | Bluesky (`plc.directory`) | Global DID registry; self-hosting fragments identity |

### What we additionally run (private mode)

| Component | Implementation |
|-----------|----------------|
| Self-hosted PLC | `ghcr.io/bluesky-social/did-method-plc` (already in our docker-compose.yml) |
| Self-hosted relay | `ghcr.io/bluesky-social/indigo/relay` (Go binary, PostgreSQL backend) |
| PDS per cooperative | Official install script on each cooperative's server |

---

## 2. Critical Restrictions (from atproto.com)

### Domain Separation (MUST)

> PDS and AppView MUST have different domain names. Cannot use subdomains of the same domain due to security risks with blob serving and OAuth/session management.

**Example:**
- AppView: `coopsource.network`
- PDS: `pds.coopsource.net` (different domain, NOT `pds.coopsource.network`)

**Impact on our setup:** The current `infrastructure/docker-compose.prod.yml` runs PDS and AppView on the same domain. For production, the PDS must be on a separate domain with its own Caddy/TLS.

### PDS Hostname is Permanent

> It is difficult to change a PDS hostname once it has active accounts.

Choose PDS domain carefully. Each cooperative that self-hosts their PDS gets their own domain.

### PLC Rotation Key Security (CRITICAL)

> Secure PLC rotation key in Key Management System or Hardware Security Module.

Our `COOP_ROTATION_KEY_HEX` env var is fine for dev. Production cooperatives should use AWS KMS (`PDS_PLC_ROTATION_KEY_KMS_KEY_ID`) or equivalent.

---

## 3. Phases

### Phase P1: Replace Custom Firehose Code with Tap + `@atproto/tap` ✅

**Goal**: Delete our custom `relay-consumer.ts` and `tap-consumer.ts`, replace with the official Tap binary and `@atproto/tap` TypeScript client. This eliminates ~300 lines of custom firehose code and gets us backfill, crypto verification, cursor management, and reconnection for free.

**What Tap gives us that we currently build ourselves:**
- Firehose WebSocket connection with auto-reconnect (our `relay-consumer.ts`)
- Collection prefix filtering (our two-pass decode)
- Cursor persistence and replay (our `pds_firehose_cursor` table)
- Cryptographic verification (our `commit-verifier.ts`)
- Historical backfill (we don't have this — Tap does it automatically)
- Per-repo ordering guarantees

**Tasks:**
1. Add `@atproto/tap` to `apps/api/package.json`
2. Add Tap container to `infrastructure/docker-compose.prod.yml`:
   ```yaml
   tap:
     image: ghcr.io/bluesky-social/indigo/tap:latest
     environment:
       TAP_RELAY_URL: ${RELAY_URL:-https://relay1.us-east.bsky.network}
       TAP_PLC_URL: ${PLC_URL:-https://plc.directory}
       TAP_COLLECTION_FILTERS: network.coopsource.*,community.lexicon.calendar.*
       TAP_DATABASE_URL: sqlite:///data/tap.db
       TAP_BIND: :2480
     volumes:
       - tapdata:/data
   ```
3. Rewrite `apps/api/src/appview/loop.ts` to use `@atproto/tap` client:
   ```typescript
   import { Tap, SimpleIndexer } from '@atproto/tap';
   
   const tap = new Tap(config.tapUrl);
   const indexer = new SimpleIndexer();
   indexer.record(async (evt) => {
     await dispatchFirehoseEvent(db, evt);
   });
   const channel = tap.channel(indexer);
   await channel.start();
   ```
4. Delete `apps/api/src/appview/relay-consumer.ts` (~158 lines)
5. Delete `apps/api/src/appview/tap-consumer.ts` (custom WebSocket client)
6. Delete `packages/federation/src/atproto/firehose-decoder.ts` (CBOR/CAR decoding — Tap handles this)
7. Simplify `apps/api/src/appview/commit-verifier.ts` — Tap verifies signatures; we may not need our own
8. Remove `pds_firehose_cursor` table usage — Tap manages cursors internally
9. Keep `dispatchFirehoseEvent()` and all indexers unchanged — only the event source changes
10. Retain `LocalPdsService` + `pg_notify` fallback for local dev (when `TAP_URL` is not set)

**Key files to modify:**
- `apps/api/src/appview/loop.ts` — rewrite to use `@atproto/tap`
- `apps/api/package.json` — add `@atproto/tap`
- `infrastructure/docker-compose.prod.yml` — add Tap service

**Key files to delete:**
- `apps/api/src/appview/relay-consumer.ts`
- `apps/api/src/appview/tap-consumer.ts`
- `packages/federation/src/atproto/firehose-decoder.ts`

### Phase P2: Production PDS Setup ✅

**Goal**: Document and support the official PDS install script for cooperative PDS deployment. Remove our custom PDS Docker configuration for production use.

The official PDS installer (`installer.sh`) sets up:
- Docker container with the PDS image
- Caddy reverse proxy with automatic TLS
- SQLite databases for repos
- Account management via `goat` CLI
- Only needs: 1 vCPU, 1GB RAM, 20GB SSD (for up to 20 users)

**Tasks:**
1. Document PDS deployment for cooperatives using the official install script:
   ```bash
   curl https://raw.githubusercontent.com/bluesky-social/pds/main/installer.sh > installer.sh
   sudo bash installer.sh
   ```
2. Document DNS requirements (A record + wildcard A record for `*.pds-domain`)
3. Document account creation via `goat`:
   ```bash
   docker exec pds goat pds admin account create \
     --handle coop-name.pds-domain.net \
     --email admin@coop.example \
     --password <secure>
   ```
4. Update `scripts/provision-cooperative.ts` to work with the official PDS installer (it already talks XRPC — should work)
5. Retain `infrastructure/docker-compose.pds.yml` for local dev and private networks only
6. Add domain separation guidance to README

**Key restriction**: PDS domain MUST differ from AppView domain (`coopsource.network`). Each cooperative can use their own PDS domain or a shared PDS can host multiple cooperatives.

### Phase P3: Private Network Mode ✅

**Goal**: Provide a complete docker-compose stack for running a private cooperative network disconnected from public ATProto.

**Architecture for private mode:**

```
┌─────────────────────────────────────────────────┐
│                Private Network                   │
│                                                  │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐    │
│  │ PDS (A)  │   │ PDS (B)  │   │ PDS (C)  │    │
│  └────┬─────┘   └────┬─────┘   └────┬─────┘    │
│       │              │              │            │
│       └──────────┬───┴──────────────┘            │
│                  │                                │
│           ┌──────▼──────┐                        │
│           │ Private     │                        │
│           │ Relay       │                        │
│           └──────┬──────┘                        │
│                  │                                │
│           ┌──────▼──────┐    ┌──────────┐        │
│           │ Tap         │    │ Self-     │        │
│           │ (filter)    │    │ hosted    │        │
│           └──────┬──────┘    │ PLC       │        │
│                  │           └──────────┘         │
│           ┌──────▼──────┐                        │
│           │ Co-op Source │                        │
│           │ AppView     │                        │
│           └─────────────┘                        │
└─────────────────────────────────────────────────┘
```

**Tasks:**
1. Create `infrastructure/docker-compose.private.yml` with:
   - Self-hosted PLC (`ghcr.io/bluesky-social/did-method-plc`)
   - Self-hosted relay (`ghcr.io/bluesky-social/indigo/relay`) with PostgreSQL
   - Tap configured to consume from private relay
   - PDS instances for each cooperative
   - Our AppView (API + Web + Caddy)
2. Create `infrastructure/.env.private.example` with private network defaults
3. Fix hardcoded `plc.directory` in `apps/api/src/appview/commit-verifier.ts:65` — read from `PLC_URL` env var
4. Add Makefile targets: `private-up`, `private-down`, `private-logs`
5. Document the private network setup in README

**Configuration for private mode:**
```env
# Private relay (Go binary from bluesky-social/indigo)
RELAY_URL=ws://relay:7834

# Self-hosted PLC
PLC_URL=http://plc:2582

# Tap connects to private relay
TAP_RELAY_URL=ws://relay:7834
TAP_PLC_URL=http://plc:2582

# PDS instances don't crawl public relay
PDS_CRAWLERS=http://relay:7834
PDS_BSKY_APP_VIEW_URL=http://api:3001
```

### Phase P4: Native ATProto Label Service ✅

**Goal**: Make governance labels visible across the ATProto network via native `com.atproto.label.queryLabels` and `com.atproto.label.subscribeLabels` XRPC endpoints.

**Why native instead of Ozone**: Ozone is heavyweight moderation infrastructure for Bluesky-scale content moderation. Our 6 governance label types are better served by a native labeler that exposes the standard ATProto label subscription protocol directly from our AppView.

**Tasks:**
1. Add `seq BIGSERIAL` to `governance_label` for cursor-based subscription replay
2. `LabelSigner` — signs labels with cooperative's secp256k1 key via DAG-CBOR
3. `LabelSubscriptionManager` — WebSocket subscriber management, cursor replay, DAG-CBOR frame encoding
4. Wire `GovernanceLabeler` to sign labels and notify subscribers after insert
5. `GET /xrpc/com.atproto.label.queryLabels` — ATProto-compliant REST query endpoint
6. WebSocket `/xrpc/com.atproto.label.subscribeLabels` — real-time label stream with cursor replay
7. Add `#atproto_labeler` service entry to cooperative DID documents
8. Admin UI labels page with label counts and table

**Label definitions:**
```
proposal-active      — Proposal is open for voting
proposal-approved    — Proposal passed
proposal-rejected    — Proposal failed
proposal-archived    — Proposal archived
member-suspended     — Member suspended
agreement-ratified   — Agreement fully signed and ratified
```

**Key files:**
- `apps/api/src/services/label-signer.ts` — DAG-CBOR label signing
- `apps/api/src/services/label-subscription.ts` — WebSocket subscription manager
- `apps/api/src/routes/xrpc-labels.ts` — XRPC endpoints
- `apps/api/src/services/governance-labeler.ts` — extended with signer + subscription support

### Phase P5: Cleanup ✅

**Goal**: Remove deprecated V3 code and resolve testing gaps.

**Tasks:**
1. Migration 056: Drop `pds_commit`, `federation_peer`, `federation_outbox`, `plc_operation` (unconditional)
2. Delete stale `scripts/migrations/drop-local-pds-tables.ts` (incorrectly dropped `pds_record`)
3. Hub registration/notify endpoints return 501 NotImplemented (V3 deprecated)
4. Cross-cooperative private record isolation E2E tests (5 tests)
5. Schema type cleanup — removed 4 dropped table interfaces + Database entries
6. `LocalPdsService`/`LocalPlcClient` writes made conditional (resilient to missing tables)
7. S3 blob storage: documented as future consideration (LocalBlobStore fine for current scale)

### Phase P6: Unified Hook Pipeline + Generic Records

**Goal**: Replace the hard-coded 18-case switch statement in `dispatchFirehoseEvent` with a hook pipeline. `pds_record` becomes the source of truth for ALL firehose events. Pre-storage and post-storage hooks. Dead letter queue.

**Inspired by**: Quickslice (Gleam ATProto framework) and Happyview (Rust ATProto AppView) — both use generic JSONB record stores with hooks that build materialized views in real time.

**Architecture**:
```
Firehose Event (from Tap or pg_notify)
  ↓
[Pre-storage hooks] — can transform record, skip storage, or pass through
  ↓                    (on failure → dead letter, store original anyway)
pds_record upsert — generic JSONB storage (source of truth)
  ↓
[Post-storage hooks] — build materialized views in domain tables, emit events
  ↓                     (on failure → dead letter, record safe in pds_record)
Domain tables updated (membership, proposal, vote, etc.)
```

Three hook types, one pipeline:
- **Built-in TypeScript** (in-process, priority 0-99): Complex domain logic — membership bilateral matching, weighted voting, signature tracking
- **Declarative config** (in-process, priority 100-199): JSON field mappings for simple collections — admin, legal, alignment, calendar, frontpage
- **User scripts** (Worker Thread, priority 200+): Per-cooperative TypeScript automation

**Key files**:
- `apps/api/src/appview/hooks/pipeline.ts` — replaces `dispatchFirehoseEvent`
- `apps/api/src/appview/hooks/registry.ts` — hook registration and dispatch
- `apps/api/src/appview/hooks/types.ts` — `HookRegistration`, `HookContext`, `PreStorageResult`
- `apps/api/src/appview/hooks/dead-letter.ts` — dead letter queue management
- `packages/db/src/migrations/052_hook_pipeline.ts` — dead letter table + pds_record indexes

### Phase P7: Declarative Config Hooks + Admin Lexicon Management

**Goal**: Convert 12 simple indexers to declarative JSON config. Admin API for registering external lexicons with optional field mappings at runtime — no code changes needed for new record types.

**Declarative config** replaces hand-written indexers with JSON field mappings:
```typescript
interface DeclarativeHookConfig {
  collection: string;
  targetTable: string;
  writeMode: 'update-only' | 'upsert';
  deleteStrategy: 'soft-delete' | 'hard-delete' | 'ignore';
  fieldMappings: { recordField: string; column: string; transform?: 'json_stringify' | 'date_parse' }[];
}
```

**Collections converted** (12 of 18):
- Admin: officer, complianceItem, memberNotice, fiscalPeriod (update-only, soft-delete)
- Legal: document, meetingRecord (update-only, soft-delete)
- Alignment: interest, outcome, interestMap (update-only, hard-delete, json_stringify)
- External: frontpage.post, calendar.event (upsert, hard-delete), calendar.rsvp (counter)

**Collections remaining as TypeScript** (6 of 18):
- Membership: membership, memberApproval (bilateral state machine)
- Governance: proposal, vote (weighted voting, retract logic)
- Agreement: agreement, signature (cross-table lookup, event emission)

**Admin lexicon API**: Register external lexicons at runtime → auto-creates declarative hooks → records indexed in `pds_record` with optional domain table materialization.

**Tap filter strategy**: Tap has NO runtime API for updating collection filters (verified). Use broad wildcards (`network.coopsource.*`); our pipeline decides what to index.

**Key files**:
- `apps/api/src/appview/hooks/declarative/handler.ts` — generic declarative handler
- `apps/api/src/appview/hooks/declarative/configs.ts` — 12 collection configs
- `apps/api/src/services/lexicon-management-service.ts` — lexicon CRUD + runtime validation
- `apps/api/src/routes/admin-lexicons.ts` — admin API
- `packages/db/src/migrations/053_registered_lexicon.ts`

### Phase P8: Cooperative Scripting Engine

**Goal**: Per-cooperative TypeScript scripting triggered by record events or domain events. Scripts stored as Tier 2 private data. Executed in Worker Thread sandboxes with defense-in-depth isolation.

**Why Tier 2**: Scripts may contain business logic, API endpoints, webhook URLs — cooperatives don't want this on the public firehose.

**Execution model**: Worker Thread (separate V8 heap, `resourceLimits` for memory, `AbortController` for timeouts) → `vm.createContext()` (restricted globals — no `require`, `process`, `fs`) → structured query API (auto-scoped to cooperative). No native dependencies — Worker Threads are built into Node.js.

**Curated API surface** (exposed to scripts as `ctx`):
- `ctx.db.query(collection, filters)` — structured query on `pds_record`, scoped to cooperative
- `ctx.db.get(uri)`, `ctx.db.count(collection)` — scoped reads
- `ctx.http.fetch(url, opts)` — SSRF-protected outbound HTTP
- `ctx.email.send({to, subject, textBody})` — via cooperative's email service
- `ctx.pds.createRecord(collection, record)` — write to cooperative's PDS
- `ctx.emitEvent(type, data)` — fire domain events
- `ctx.log(level, msg)` — structured logging

**Script phases**:
- `pre-storage`: Runs before `pds_record` upsert. Can transform or skip records.
- `post-storage`: Runs after `pds_record` upsert. Builds materialized views, sends notifications.
- `domain-event`: Triggered by `sseEmitter` events (member.joined, proposal.passed, etc.). Cooperative automation — send welcome emails, sync to external systems.

**Key files**:
- `apps/api/src/scripting/worker-pool.ts` — custom Worker Thread pool with MessagePort callbacks
- `apps/api/src/scripting/worker.ts` — worker harness (vm.createContext sandbox)
- `apps/api/src/scripting/script-service.ts` — CRUD, enable/disable, test, startup loading
- `apps/api/src/routes/admin-scripts.ts` — cooperative script management API
- `packages/db/src/migrations/054_cooperative_scripts.ts`

### Phase P9: MCP Server Enhancement

**Goal**: Expand the existing MCP server (4 tools) with generic record access, lexicon introspection, and search. Leverages `pds_record` as unified record store.

**New tools**:
- `query-records` — Query `pds_record` by collection, optional DID/time range
- `get-record` — Single record by AT URI
- `search-records` — JSONB containment or text search
- `list-collections` — Distinct collections with record counts
- `introspect-lexicon` — Lexicon schema JSON (built-in + registered)
- `get-firehose-health` — AppView health stats

**Key files**: `apps/api/src/mcp/server.ts` (extend existing)

### Phase Dependencies

```
P1-P3 (complete) → merged to main
P4 (Native Label Service) ✅ — independent
P5 (Cleanup) ✅ — independent
P6 (Hook Pipeline) ✅ — foundational
 ├── P7 (Declarative Config + Lexicons) ✅
 ├── P8 (Scripting Engine) ✅
 └── P9 (MCP Enhancement) ✅
```

---

## 4. ATProto Proposals to Monitor

| Proposal | Status (April 2026) | Impact | Action |
|----------|---------------------|--------|--------|
| **0013 DID Service Refs** | Expected May 2026 | `aud_svc` field in service auth JWTs | Update JWT handling when shipped |
| **0011 Auth Scopes** | Partially rolled out | Granular permission sets | Replace `transition:generic` when stabilized |
| **0006 Sync v1.1** | Active | `listReposByCollection` for backfill | Tap handles this for us — no custom code needed |

---

## 5. Infrastructure Requirements

### Public Mode

| Component | Resource | Notes |
|-----------|----------|-------|
| Co-op Source AppView | 2-4GB RAM, 2 vCPU | Express API + SvelteKit + PostgreSQL + Redis |
| Tap | ~256MB RAM | Go binary, SQLite or PostgreSQL backend |
| Caddy | ~128MB RAM | Reverse proxy with auto TLS |

PDS, relay, and PLC are provided by the ATProto network (Bluesky infrastructure).

### Private Mode (additional)

| Component | Resource | Notes |
|-----------|----------|-------|
| Self-hosted relay | 1-2GB RAM | Go binary, PostgreSQL. Bandwidth-intensive for large networks |
| Self-hosted PLC | ~256MB RAM | PostgreSQL backend |
| PDS per cooperative | 1GB RAM, 20GB SSD | Official install script. Up to 20 users per instance |

---

## 6. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Domain separation requires infra changes | Current prod compose has PDS on same domain | Move PDS to separate domain before going live |
| Tap is beta software | Potential bugs in sync | Retain `pg_notify` local fallback for dev; Tap community is active |
| Private relay bandwidth | Scales with network size | Start small; relay handles 100M accounts on single server |
| `@atproto/tap` client changes | API surface may evolve | Pin version; client is part of official `@atproto` monorepo |
| Tap has no runtime filter API | Can't dynamically add collection filters | Use broad wildcards; pipeline decides what to index |
| pds_record upsert adds latency | Extra DB write per firehose event | Simple JSONB upsert; benchmark before/after |
| Dead letter queue unbounded growth | Disk usage if hooks fail consistently | Background prune of resolved entries; alert on count > 100 |
| Declarative handler diverges from hand-written indexers | Silent data differences | Comparison tests verify identical output before deleting old code |
| Worker Thread `vm.createContext()` escape | Script sandbox breach | Defense-in-depth: worker isolation + vm restrictions + structured API (no raw SQL) |
| Worker Thread memory leaks | OOM from user scripts | Per-worker `resourceLimits`, idle timeout, max execution time |

---

## 7. Success Criteria

**P1-P3 (complete)**:
- [x] Tap binary consuming firehose and feeding our AppView indexers
- [x] Custom `relay-consumer.ts` and `tap-consumer.ts` deleted
- [x] PDS deployment documented using official install script
- [x] Domain separation enforced (PDS ≠ AppView domain)
- [x] Private network docker-compose stack functional

**P4-P5 (complete)**:
- [x] Governance labels visible via native ATProto label subscription (queryLabels + subscribeLabels)
- [x] Label signing with cooperative secp256k1 key
- [x] V3 tables dropped (pds_commit, federation_peer, federation_outbox, plc_operation)
- [x] Hub registration deprecated (501 NotImplemented)
- [x] Tier 2 private data cross-coop isolation E2E test passing (5 tests)

**P6-P9 (planned)**:
- [ ] Hook pipeline replaces hard-coded switch statement
- [ ] `pds_record` is source of truth for all firehose events (Tap and local)
- [ ] Dead letter queue captures hook failures without data loss
- [ ] 12 simple indexers replaced with declarative JSON configs
- [ ] External lexicons registerable at runtime via admin API
- [ ] Cooperative scripts execute in Worker Thread sandboxes
- [ ] Scripts can trigger on record events and domain events
- [ ] MCP server exposes generic record access and lexicon introspection
- [ ] Admin UI for pipeline health, lexicon management, and script management

---

## References

- **ATProto Production Guide** — https://atproto.com/guides/going-to-production
- **ATProto Self-Hosting** — https://atproto.com/guides/self-hosting
- **ATProto Stack** — https://atproto.com/guides/the-at-stack
- **Official PDS** — https://github.com/bluesky-social/pds (installer script, goat CLI)
- **Indigo (Go tools)** — https://github.com/bluesky-social/indigo (relay, Tap, Rainbow)
- **Tap README** — https://github.com/bluesky-social/indigo/blob/main/cmd/tap/README.md
- **`@atproto/tap`** — TypeScript client for Tap (`SimpleIndexer`, `LexIndexer`)
- **Relay README** — https://github.com/bluesky-social/indigo/blob/main/cmd/relay/README.md
- **Deploy Recipes** — https://github.com/bluesky-social/deploy-recipes
- **Ozone** — https://github.com/bluesky-social/ozone
- **ATProto Proposals** — https://github.com/bluesky-social/proposals
- **Microcosm** — https://www.microcosm.blue (Rust query APIs — alternative to full AppView for simple cases)
- **Quickslice** — https://tangled.org/slices.network/quickslice (Gleam ATProto AppView framework — dynamic lexicon ingestion, GraphQL, MCP)
- **Happyview** — https://github.com/gamesgamesgamesgamesgames/happyview (Rust ATProto AppView — Lua index hooks, materialized views, dynamic lexicons)
