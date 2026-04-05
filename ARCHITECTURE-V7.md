# ARCHITECTURE-V7.md — Production Deployment & Ecosystem Integration

> **Prerequisite**: V6 federation migration (complete, all 4 phases merged March 26, 2026)
> **Design reference**: ARCHITECTURE-V5.md (cooperative lifecycle, security model, lexicon schemas)
> **Federation reference**: ARCHITECTURE-V6.md (ATProto integration design)
> **ATProto guidance**: https://atproto.com/guides/going-to-production, https://atproto.com/guides/self-hosting
> **Date**: April 2, 2026
> **Status**: Planning

---

## Executive Summary

V6 delivered real ATProto federation. V7 gets it production-ready by aligning with the official ATProto deployment guidance and leveraging existing ecosystem tools to reduce custom code.

**Key simplifications from ATProto ecosystem review (April 2026):**

1. **Use the official PDS install script** (`installer.sh`) instead of our own Docker PDS setup — it handles Docker, Caddy TLS, and account management out of the box
2. **Use Tap with `@atproto/tap` TypeScript client** instead of our custom `relay-consumer.ts` — Tap handles firehose connections, crypto verification, backfill, filtering, and cursor management. Our relay consumer reimplements all of this
3. **Don't run our own relay for public mode** — use `bsky.network`. For private networks, use the Go relay from `bluesky-social/indigo`
4. **Domain separation is mandatory** — PDS and AppView MUST be on different domains (not subdomains). This is a security requirement for blob serving and OAuth

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

### Phase P1: Replace Custom Firehose Code with Tap + `@atproto/tap`

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

### Phase P2: Production PDS Setup

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

### Phase P3: Private Network Mode

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

### Phase P4: Ozone Governance Labeler

**Goal**: Make governance labels visible across the ATProto network.

**Tasks:**
1. Deploy Ozone container (separate from PDS, as recommended by ATProto docs)
2. Wire `GovernanceLabeler` to push labels to Ozone API
3. Ozone's `subscribeLabel` firehose makes labels available to other AppViews

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
- `apps/api/src/services/governance-labeler.ts` — add Ozone API client
- `infrastructure/docker-compose.prod.yml` — add Ozone service
- Run separate Ozone instances for PDS-level and AppView-level moderation (per ATProto guidance)

### Phase P5: Cleanup

**Goal**: Remove deprecated V3 code and resolve testing gaps.

**Tasks:**
1. Gate V3 table drop behind `DROP_V3_TABLES=true` env var; run in production
2. Implement per-DID reindex endpoint (`apps/api/src/routes/admin.ts:41` TODO)
3. Add E2E test for Tier 2 private record exchange between cooperatives
4. Resolve hub registration stub (501 in cross-instance test)
5. Consider S3-compatible blob storage for production (ATProto recommends against local disk at scale)

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

---

## 7. Success Criteria

- [ ] Tap binary consuming firehose and feeding our AppView indexers
- [ ] Custom `relay-consumer.ts` and `tap-consumer.ts` deleted
- [ ] PDS deployment documented using official install script
- [ ] Domain separation enforced (PDS ≠ AppView domain)
- [ ] Private network docker-compose stack functional
- [ ] Governance labels visible via Ozone
- [ ] V3 tables dropped in production
- [ ] Tier 2 private data E2E test passing

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
