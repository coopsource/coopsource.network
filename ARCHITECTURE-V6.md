# ARCHITECTURE-V6.md — ATProto Federation Migration

> **Supersedes**: ARCHITECTURE-V5.md §14-15 (migration phases only)
> **Design reference**: ARCHITECTURE-V5.md (cooperative lifecycle, security model, lexicon schemas remain authoritative)
> **Date**: March 25, 2026
> **Status**: Pre-implementation
> **Baseline**: Git tag `v3-final` (commit f849509)

---

## Executive Summary

The Co-op Source Network application layer is complete: 594 source files, 75 pages, 44 services, 99 database tables, 279 E2E tests, and a full SvelteKit frontend covering governance, agreements, legal, finance, operations, commerce, integrations, AI agents, and alignment discovery.

**All of this runs on V3 federation plumbing** — a custom `LocalPdsService` that stores ATProto-shaped records in PostgreSQL and emits firehose events via `pg_notify`. This was always scaffolding. The application logic is sound, but the federation is simulated.

**V6 replaces the simulation with real ATProto infrastructure**: a self-hosted `@atproto/pds`, `did:plc` identities via plc.directory, firehose consumption via Tap, and DPoP-bound OAuth for member writes. After V6, cooperatives are genuine ATProto accounts visible on bsky.app, and governance records flow through the real relay network alongside Bluesky posts, Tangled commits, and WhiteWind blog entries.

---

## Table of Contents

1. [Current State: What Exists Today](#1-current-state)
2. [Target State: What V6 Delivers](#2-target-state)
3. [Migration Inventory](#3-migration-inventory)
4. [Migration Phases](#4-migration-phases)
5. [Infrastructure Requirements](#5-infrastructure-requirements)
6. [Risk and Rollback Strategy](#6-risk-and-rollback-strategy)

---

## 1. Current State

### V3 Federation Plumbing (to be retired)

| Component | Location | What it does |
|-----------|----------|-------------|
| `LocalPdsService` | `packages/federation/src/local/` | Stores records in PostgreSQL `pds_record`/`pds_commit` tables, emits `pg_notify('pds_firehose')` |
| `LocalPlcClient` | `packages/federation/src/local/` | Generates `did:web` identifiers resolved via `/.well-known/did.json` |
| `LocalFederationClient` | `packages/federation/src/local/` | Routes cross-co-op operations locally (standalone mode) |
| `HttpFederationClient` | `packages/federation/src/http/` | RFC 9421 signed HTTP for server-to-server. **Retained for Tier 2 only** |
| `appview/loop.ts` | `apps/api/src/appview/` | Subscribes to `pg_notify` and dispatches to indexers |
| Federation outbox | `packages/federation/src/outbox/` | Queues and retries outbound federation messages |
| `pds_record`, `pds_commit` tables | `packages/db/` | Store ATProto-shaped records locally |
| `federation_peer`, `federation_outbox` tables | `packages/db/` | Track federation peers and outbound queue |

### Scaffolding That Exists But Is Inactive

| Component | Location | Status |
|-----------|----------|--------|
| `AtprotoPdsService` | `packages/federation/src/atproto/` | Exists, gated behind `PDS_URL` env var — falls back to `LocalPdsService` when unset |
| `PlcClient` | `packages/federation/src/local/` | HTTP client for plc.directory — exists but `PLC_URL=local` in dev bypasses it |
| `oauth-client.ts` | `apps/api/src/auth/` | ATProto OAuth client exists — used for login but not for proxied member writes |

### Application Layer (complete, not changing)

- **44 services** in the DI container covering all domain logic
- **75 SvelteKit pages** with full UI for all features
- **99 database tables** across 51 migrations
- **279 E2E tests** across 34 test files
- **44 lexicon schemas** under `network.coopsource.*`
- AI agent framework, Stripe integration, connector/webhook system, reporting

---

## 2. Target State

After V6, the system runs on real ATProto infrastructure:

| Concern | Current (V3) | After V6 |
|---------|-------------|----------|
| **Cooperative identity** | `did:web` via LocalPlcClient | `did:plc` via plc.directory, domain-as-handle |
| **Record storage** | PostgreSQL `pds_record` table | Self-hosted `@atproto/pds` instance |
| **Firehose** | `pg_notify('pds_firehose')` | Tap binary consuming `bsky.network` relay |
| **Member writes** | Internal API → LocalPdsService | DPoP-bound OAuth proxy → member's own PDS |
| **Cross-co-op discovery** | LocalFederationClient | Firehose (Tap filters `network.coopsource.*` collections) |
| **Private data (Tier 2)** | Mixed in with public tables | Dedicated `private_record` table, never in PDS repos |
| **Governance labels** | None | Ozone labeler publishes ATProto labels |
| **Cooperative visibility** | Only within the app | Visible on bsky.app, interoperable with Bluesky/Tangled/WhiteWind |

---

## 3. Migration Inventory

### Components to Retire

| Component | Replacement | Phase |
|-----------|-------------|-------|
| `LocalPdsService` | `AtprotoPdsService` (activate existing) | F4 |
| `LocalPlcClient` | `PlcClient` (activate existing) | F1 |
| `LocalFederationClient` | Direct PDS writes + Tap consumption | F4 |
| Federation outbox + processor | PDS handles write reliability; Tap handles sync | F4 |
| `appview/loop.ts` (pg_notify consumer) | Tap WebSocket consumer | F3 |
| `pds_record`, `pds_commit` tables | Real PDS stores records; AppView indexes from Tap | F3 |
| `federation_peer`, `federation_outbox` tables | No outbound federation needed; discovery via firehose | F4 |
| Saga coordinator | ATProto's eventually-consistent model | F4 |

### Components to Activate / Build

| Component | Status | Work Required | Phase |
|-----------|--------|--------------|-------|
| `AtprotoPdsService` | Exists, gated | Set `PDS_URL`, verify XRPC calls | F1 |
| `PlcClient` | Exists, unused | Set `PLC_URL=https://plc.directory`, implement PLC operation signing with rotation keys | F1 |
| Cooperative provisioning script | Does not exist | Create DID, configure PDS, set domain handle, write initial profile | F1 |
| PDS deployment config | Partial (`docker-compose.yml` has PDS entry) | Finalize for production, add to Makefile | F1 |
| Member write proxy | Does not exist | OAuth-proxied writes to member's PDS for membership/vote/signature/delegation/pledge | F2 |
| `private_record` table | Does not exist | Tier 2 CRUD with collection-based ACL, visibility routing | F2 |
| Multi-user auth proxy | Does not exist | Operator auth for cooperative PDS writes (multiple admins writing as the co-op) | F2 |
| Tap consumer service | Does not exist | WebSocket consumer replacing `loop.ts`, filters by `network.coopsource.*` collections | F3 |
| Tap event dispatcher | Does not exist | Adapts Tap events to existing indexer dispatch (indexers stay, source changes) | F3 |
| Ozone governance labeler | Does not exist | Automated labels for governance status (proposal active/passed/failed, membership active/revoked) | F4 |
| Ecosystem record indexers | Does not exist | Index Smoke Signal RSVPs, Bluesky lists for membership display | F4 |
| Admin reindex endpoint | Does not exist | Trigger full re-index from PDS/firehose for recovery | F4 |

### Components Unchanged

- All 44 domain services (reads from PostgreSQL AppView tables — source changes, query layer doesn't)
- All SvelteKit pages and UI components
- All E2E tests (they test through the API layer, which stays stable)
- Kysely database layer and existing AppView tables
- AI agent framework, Stripe, connectors, webhooks, reporting
- RFC 9421 HTTP signing (retained for Tier 2 private data exchange between closed cooperatives)
- Bilateral membership logic (pattern preserved — data source changes from LocalPdsService to Tap events)

---

## 4. Migration Phases

Each phase is a feature branch. Each must pass all 279 E2E tests before merging to `main`.

### Phase F1: PDS + Identity (Foundation)

**Branch**: `feature/f1-pds-identity`

**Goal**: Deploy a real `@atproto/pds`, create the cooperative's `did:plc` identity, and verify the cooperative is visible on bsky.app.

**Tasks**:
1. Finalize `infrastructure/docker-compose.yml` PDS configuration for production
2. Implement PLC operation signing with cooperative's rotation key (currently stubbed)
3. Build cooperative provisioning script: create DID → configure PDS → set domain handle → write profile record
4. Activate `PlcClient` in `container.ts` (`PLC_URL=https://plc.directory`)
5. Activate `AtprotoPdsService` in `container.ts` (`PDS_URL=https://pds.instance.net`)
6. Add `make pds-provision` target
7. Verify: cooperative profile appears on bsky.app, DID resolves via plc.directory

**Config changes**:
```
PDS_URL=https://pds.mycoop.net
PLC_URL=https://plc.directory
INSTANCE_DID=did:plc:<created>
COOP_PDS_ADMIN_PASSWORD=<generated>
```

**Key files**: `packages/federation/src/local/plc-client.ts`, `packages/federation/src/atproto/atproto-pds-service.ts`, `apps/api/src/container.ts`, `infrastructure/docker-compose.yml`, `scripts/provision-cooperative.ts`

### Phase F2: Member OAuth + Private Data

**Branch**: `feature/f2-member-oauth`

**Goal**: Members authenticate with their ATProto identities and write governance records to their own PDS. Private data is stored in Tier 2.

**Tasks**:
1. Build member write proxy service: intercepts membership/vote/signature/delegation/pledge writes, proxies to member's PDS via DPoP-bound OAuth tokens
2. Implement multi-user auth proxy for cooperative operators (multiple admins writing as the co-op's DID)
3. Create `private_record` table and service for Tier 2 data (closed deliberations, drafts, financials)
4. Implement visibility routing: public records → PDS, private records → `private_record` table
5. Modify service layer write paths to use proxy (reads unchanged — still from AppView tables)
6. Upgrade OAuth scopes from `transition:generic` to granular when available

**Key files**: `apps/api/src/services/` (write paths), `apps/api/src/auth/oauth-client.ts`, `packages/db/src/migrations/` (new migration for `private_record`)

### Phase F3: Tap-Based AppView

**Branch**: `feature/f3-tap-appview`

**Goal**: Replace the local `pg_notify` firehose with real network firehose consumption via Tap.

**Tasks**:
1. Deploy Tap binary with filter config for `network.coopsource.*` collections
2. Build Tap WebSocket consumer service (replaces `appview/loop.ts`)
3. Build event dispatcher adapting Tap events to existing indexer dispatch (indexers stay unchanged)
4. Implement bilateral membership state machine on real firehose events (handles out-of-order arrival from different PDS instances)
5. Add commit signature verification on incoming records
6. Feature-flag: keep `pg_notify` loop as fallback for local dev without Tap
7. Drop `pds_record` and `pds_commit` tables after Tap consumer is stable

**Key files**: `apps/api/src/appview/loop.ts` (replace), `apps/api/src/appview/indexers/` (unchanged), `apps/api/src/container.ts`

### Phase F4: Ecosystem Integration + V3 Cleanup

**Branch**: `feature/f4-ecosystem-cleanup`

**Goal**: Add ecosystem integrations, deploy Ozone labeler, and retire all V3 federation components.

**Tasks**:
1. Deploy Ozone with governance label definitions (proposal status, membership status)
2. Build automated labeler service for governance state transitions
3. Add Smoke Signal event integration (cooperative meetings as ATProto calendar events)
4. Add ecosystem record indexers (Bluesky lists, Starter Pack sync)
5. Build admin reindex endpoint for recovery scenarios
6. Retire `LocalPdsService`, `LocalFederationClient`, federation outbox, saga coordinator
7. Drop `federation_peer`, `federation_outbox` tables
8. Update `INSTANCE_ROLE` env var handling for production topology

**Key files**: `packages/federation/src/local/` (retire), `packages/federation/src/outbox/` (retire), `apps/api/src/container.ts`, `packages/db/src/migrations/` (drop tables)

---

## 5. Infrastructure Requirements

### Production Deployment

| Component | Resource | Notes |
|-----------|----------|-------|
| `@atproto/pds` | Docker container, ~512MB RAM | Self-hosted, stores cooperative's ATProto repo |
| Tap | Go binary, ~128MB RAM | Filters firehose from `bsky.network` relay |
| PostgreSQL 16 | Existing | AppView tables + `private_record` table |
| Redis 7 | Existing | Session store, rate limiting |
| Application (API + Web) | Existing | Express + SvelteKit |

### Local Development

Local dev continues to work without PDS/Tap via feature flags:
- `PDS_URL` unset → falls back to `LocalPdsService` (existing behavior)
- `PLC_URL=local` → falls back to `did:web` (existing behavior)
- `TAP_URL` unset → falls back to `pg_notify` loop (Phase F3 adds this flag)

---

## 6. Risk and Rollback Strategy

### Key Risks

| Risk | Mitigation |
|------|-----------|
| PDS instability | Feature-flag PDS writes; LocalPdsService remains until F4 |
| Tap downtime | pg_notify fallback stays until F3 is stable |
| OAuth scope limitations | Use `transition:generic` until granular scopes available |
| PLC operation signing complexity | Rotation key management is critical — test thoroughly in F1 |
| Breaking existing E2E tests | Each phase must pass all 279 tests before merge |

### Rollback

Each phase is an independent feature branch. If a phase causes issues after merge:
1. The previous phase (or `v3-final` tag) is a known-good state
2. Feature flags allow disabling new infrastructure without code rollback
3. `LocalPdsService` and `pg_notify` loop are not deleted until F4 — they remain as fallbacks through F1-F3

---

## References

- **ARCHITECTURE-V5.md** — Cooperative lifecycle design, security model (§8), bilateral membership protocol (§4), lexicon schemas (§13), three-tier data model (§5)
- **ARCHITECTURE-V5.md §14** — Original codebase gap analysis (V6 phases are derived from this)
- **Git tag `v3-final`** — Last commit before V6 migration work begins
