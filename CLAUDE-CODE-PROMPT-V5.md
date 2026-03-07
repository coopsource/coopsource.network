# CLAUDE-CODE-PROMPT-V5.md — Implementation Guide for Co-op Source Network

> **For**: Claude Code / Claude agents working on the Co-op Source Network codebase
> **Architecture reference**: ARCHITECTURE-V5.md
> **Date**: March 6, 2026
> **Status**: Active

---

## Your Role

You are implementing the Co-op Source Network — a federated cooperative management platform built on ATProto. The project is transitioning from V3 (pattern-aligned ATProto with custom federation) to V5 (full ATProto ecosystem citizen with comprehensive cooperative lifecycle). The codebase is a working monorepo with ~26,500 lines across ~280 files, 11 services, 50+ database tables, 22 lexicons, and a complete SvelteKit frontend.

**Your primary reference is ARCHITECTURE-V5.md.** Read it thoroughly before making any architectural decisions. When in doubt, the architecture document is authoritative.

---

## Critical Constraints (Non-Negotiable)

These technology choices and design principles cannot be changed:

### Technology Stack
- **TypeScript strict mode** — no `any`, no unsafe casts
- **Express 5** — not Fastify, Hono, or others
- **Kysely 0.28+** — not Prisma, Drizzle, or TypeORM
- **SvelteKit 2** with **Svelte 5 runes** (`$state`, `$derived`, `$effect`, `$props`)
- **Vite 7** — Tailwind CSS 4 plugin MUST come BEFORE `sveltekit()` in vite.config.ts
- **pnpm 10+** workspace with **Turborepo 2+**
- **Vitest 4** for all tests
- **Zod 4** for validation
- **Node.js 24 LTS** runtime
- **PostgreSQL 16+** via Kysely

### Design Principles
- **Bilateral membership is non-negotiable** — status = `active` ONLY when BOTH `membership` record (member's repo) AND `memberApproval` record (cooperative's repo) exist
- **Role authority is ONLY in memberApproval** — never in the membership record, never self-declared
- **DIDs are authoritative identifiers** — never use handles for security decisions
- **Records of authority live in PDS repos** — PostgreSQL is a materialized index for queries
- **Tier 2 private data NEVER touches the firehose** — stored in `private_record` table only
- **Cross-cooperative public data flows through ATProto** — the network IS the federation bus
- **Retain RFC 9421 HTTP signing ONLY for Tier 2 private data exchange** between closed cooperatives

### Git Workflow
- **All work on feature branches** — never commit directly to `main`
- **Never merge to `main` without explicit user approval**
- **Never delete branches** — keep as historical record

---

## Architecture Overview

### The V3→V5 Transition

V3 built a parallel federation stack (custom HTTP signatures, federation outbox, saga coordinators, LocalPdsService with fake CIDs) alongside ATProto patterns. V5 eliminates that parallel stack:

- **LocalPdsService** → retired, replaced by real `@atproto/pds` via `AtprotoPdsService`
- **LocalPlcClient** → retired, replaced by real `PlcClient` for plc.directory
- **HttpFederationClient** → retired for public data (ATProto firehose handles it); retained ONLY for Tier 2 private exchange
- **LocalFederationClient** → retired (direct PDS writes + Tap consumption)
- **Federation outbox** → retired (PDS handles write reliability, Tap handles sync)
- **Saga coordinator** → retired (ATProto's eventually-consistent model)
- **`pg_notify('pds_firehose')`** → retired (Tap's WebSocket from real relay)

### The Three-Tier Data Model

**Tier 1 (Public ATProto)**: Cooperative profiles, public proposals, vote tallies, ratified agreements, membership directories. In PDS repos, on the firehose.

**Tier 2 (Private PostgreSQL)**: Closed deliberations, draft proposals, private membership details, financial records. In `private_record` table. Modeled as typed records by collection matching ATProto semantics for future Bucket migration.

**Tier 3 (E2EE)**: Board confidential discussions, salary records, personnel matters. Via Germ DM / MLS protocol. Platform facilitates but never handles content.

### Record Ownership

Members write to their own PDS: `membership`, `vote`, `delegation`, `signature`, `pledge`
Cooperatives write to their own PDS: `memberApproval`, `proposal`, `master agreement`, `legal.document`, `admin.officer`, `campaign`

---

## Implementation Phases

Follow these phases in order. Each phase has clear deliverables and should be implemented on a feature branch.

### Phase 0: Foundation (PDS + Identity)

**Branch**: `feature/phase-0-pds-identity`

**Tasks**:
1. Create `infrastructure/docker-compose.pds.yml` for self-hosted `@atproto/pds` alongside existing services
2. Activate `PlcClient` in `apps/api/src/container.ts` — set `PLC_URL=https://plc.directory`
3. Build cooperative provisioning script in `scripts/`:
   - Create DID via PlcClient
   - Configure PDS account via admin API
   - Set domain-as-handle via DNS TXT record
   - Generate and securely store rotation keys
4. Set `PDS_URL` in config → activates `AtprotoPdsService` (already exists, gated behind env var)
5. Add new config keys to `apps/api/src/config.ts`:
   ```
   COOP_PDS_URL, COOP_PDS_ADMIN_PASSWORD, COOP_DID, COOP_OPERATORS
   ```
6. Verify: cooperative's profile record appears at `https://bsky.app/profile/{handle}`

**Key files to modify**:
- `apps/api/src/container.ts` — wire PlcClient, activate AtprotoPdsService
- `apps/api/src/config.ts` — add new config keys
- `infrastructure/` — new PDS docker compose

**Key files to reference**:
- `packages/federation/atproto/atproto-pds-service.ts` — already implements IPdsService via XRPC
- `packages/federation/local/plc-client.ts` — HTTP client for plc.directory, already exists

### Phase 1: Member Identity and OAuth

**Branch**: `feature/phase-1-member-oauth`

**Tasks**:
1. Build **member write proxy service** (`apps/api/src/services/member-write-proxy.ts`):
   - Accept write requests from frontend
   - Resolve member's PDS from DID document
   - Proxy `createRecord`/`putRecord`/`deleteRecord` using stored OAuth token
   - Verify DPoP binding on every request
2. Modify **membership flow**: member's `network.coopsource.org.membership` written to MEMBER's PDS
3. Modify **vote flow**: `governance.vote` written to VOTER's PDS
4. Modify **signature flow**: `agreement.signature` written to SIGNER's PDS
5. Build **multi-user auth proxy** for cooperative operator access:
   - Authenticate operators via existing auth system
   - ACL check (admin, board-member, staff)
   - Proxy authorized writes to cooperative's PDS
   - Audit log tracks which human authored each operation
6. Add `private_record` table via Kysely migration:
   ```sql
   CREATE TABLE private_record (
       did TEXT NOT NULL,
       collection TEXT NOT NULL,
       rkey TEXT NOT NULL,
       record JSONB NOT NULL,
       created_at TIMESTAMPTZ NOT NULL,
       updated_at TIMESTAMPTZ NOT NULL,
       PRIMARY KEY (did, collection, rkey)
   );
   ```

**Key files to modify**:
- `apps/api/src/services/membership-service.ts` — route writes to member PDS
- `apps/api/src/services/proposal-service.ts` — route votes to member PDS
- `apps/api/src/services/agreement-service.ts` — route signatures to member PDS
- `apps/api/src/auth/oauth-client.ts` — token management for member sessions
- `packages/db/src/migrations/` — new migration for private_record

### Phase 2: Tap-Based AppView

**Branch**: `feature/phase-2-tap-appview`

**Tasks**:
1. Deploy **Tap binary** alongside AppView:
   - `TAP_SIGNAL_COLLECTION=network.coopsource.org.membership`
   - `TAP_COLLECTION_FILTERS=network.coopsource.*,community.lexicon.calendar.*`
2. Build **Tap consumer service** (`apps/api/src/appview/tap-consumer.ts`):
   - Connect to Tap's WebSocket/webhook output
   - Adapt events to existing indexer dispatch interface
   - Track cursor for resumption
   - Verify commit signatures on membership-relevant records
3. Retire `appview/loop.ts` pg_notify subscription (keep as feature-flag fallback `USE_LOCAL_FIREHOSE=true`)
4. Add **ecosystem record indexers**:
   - `community.lexicon.calendar.rsvp` for meeting attendance
   - `app.bsky.graph.list` sync for membership lists
5. Implement **AppView state machine** for bilateral membership:
   ```
   On membership create: index → check for matching approval → active or pending_member
   On memberApproval create: index → check for matching membership → active or pending_approval
   On either delete: transition to revoked state
   ```
6. Implement **commit signature verification** on all membership-relevant records

**Key files to modify**:
- `apps/api/src/appview/loop.ts` — add feature flag, eventually retire
- `apps/api/src/appview/indexers/membership-indexer.ts` — adapt to Tap events
- `apps/api/src/container.ts` — inject Tap consumer

### Phase 3: Ecosystem Composability + Ozone

**Branch**: `feature/phase-3-ecosystem`

**Tasks**:
1. Add optional fields to proposal lexicon: `meetingEvent`, `fullDocument`, `discussionThread`
2. Build **Smoke Signal integration**: create calendar events for governance meetings
3. Build **Frontpage cross-posting**: create link submissions for public proposals
4. Deploy **Ozone instance** with governance label definitions:
   - `proposal-active`, `proposal-approved`, `proposal-rejected`, `proposal-archived`
   - `member-suspended`, `agreement-ratified`
5. Build **automated labeler** (`apps/api/src/services/governance-labeler.ts`):
   - Vote tally → emit label when quorum reached
   - Proposal status → emit label on state transitions
   - Implement `com.atproto.label.subscribeLabels` and `queryLabels`
6. Build **Starter Pack generation** for cooperative onboarding
7. Retire public-data federation components:
   - Remove `IFederationClient` for public data paths
   - Remove `LocalFederationClient`
   - Remove `federation_peer`, `federation_outbox` tables
   - Keep `HttpFederationClient` + RFC 9421 signing for Tier 2 private exchange only

### Phase 4: Legal and Administrative Lifecycle

**Branch**: `feature/phase-4-legal-admin`

**Tasks**:
1. Create new lexicon schemas in `packages/lexicons/`:
   - `network.coopsource.legal.document`
   - `network.coopsource.legal.meetingRecord`
   - `network.coopsource.admin.officer`
   - `network.coopsource.admin.complianceItem`
   - `network.coopsource.admin.memberNotice`
   - `network.coopsource.admin.fiscalPeriod`
2. Build **legal document service** (`apps/api/src/services/legal-document-service.ts`):
   - Versioning via chain of strong references
   - Tier 1 public documents with full content
   - Tier 2 private documents with public hash commitments
   - Amendment tracking with full audit trail
3. Build **compliance calendar service**:
   - State-specific deadlines and filing status
   - Automatic notifications for upcoming deadlines
   - Filing status tracking
4. Build **officer record service**:
   - Election/appointment tracking with terms
   - Responsibility mapping per bylaws
   - History of holders via commit diffs
5. Build **meeting record service**:
   - Resolution tracking with vote counts
   - Quorum calculation and verification
   - Secretary certification workflow
6. Add frontend routes for legal/admin features

### Phase 5: Private Data and Closed Cooperatives

**Branch**: `feature/phase-5-private-data`

**Tasks**:
1. Build **private record service** (`apps/api/src/services/private-record-service.ts`):
   - CRUD for Tier 2 data in `private_record` table
   - ACL enforcement (cooperative operators + authorized members)
   - Collection-based access control
2. Implement **visibility routing** in write proxy:
   - Check cooperative's `governanceVisibility` setting
   - Route writes to Tier 1 (PDS) or Tier 2 (private_record) based on visibility
   - Per-record visibility override for mixed-mode cooperatives
3. Build **private governance UI** in SvelteKit:
   - Private proposals, votes, deliberations
   - Reads from private_record table instead of AppView
4. Add **Germ DM integration**:
   - Detect `com.germnetwork.declaration` records for board members
   - Surface "Start secure discussion" deep-links
5. Forward-compatible data modeling:
   - Private records use same schemas as public records
   - Stored in `(did, collection, rkey, record_json)` format ready for Bucket migration

### Phase 6: Financial Tools

**Branch**: `feature/phase-6-financial`

**Tasks**:
1. Build **patronage calculation engine** (`apps/api/src/services/patronage-service.ts`):
   - Configurable per cooperative type (worker, consumer, producer, multi-stakeholder)
   - Worker: hours worked, salary, or combined metric
   - Consumer: purchase volume
   - Producer: supply volume
   - Calculation runs per fiscal period
2. Build **capital account service** (`apps/api/src/services/capital-account-service.ts`):
   - Track initial equity contributions
   - Allocated retained patronage per member
   - Revolving fund mechanics (redeem older allocations)
   - Member equity dashboard data
3. Implement **1099-PATR workflow**:
   - Generate forms for members with patronage dividends ≥ $10
   - Track qualified vs. non-qualified patronage dividends
   - Cash distribution deadline tracking (20% within 8.5 months)
4. Build **fiscal period tracking** service
5. Integrate patronage cash distributions with **Stripe**

### Phase 7: Onboarding and Advanced Features

**Branch**: `feature/phase-7-onboarding-advanced`

**Tasks**:
1. Build **onboarding workflow engine**:
   - Probationary period tracking with milestones
   - Training completion verification
   - Buy-in process automation
   - Buddy system assignment
   - Automatic notifications for milestones
2. Implement **delegation-based voting**:
   - `network.coopsource.governance.delegation` records in delegator's repo
   - AppView verifies delegation chain
   - Vote weight transfer
3. Build **governance feed generator**:
   - Custom feed of proposals needing votes
   - Upcoming meetings
   - Recent outcomes
4. Implement **multi-stakeholder weighted voting**:
   - Multiple member classes with configurable vote weights
   - Per-class quorum requirements
   - Board seat allocation per class
5. Build **inter-cooperative connection flows**:
   - `network.coopsource.connection.link` records
   - Cross-cooperative discovery via firehose

---

## Security Requirements

Implement these throughout all phases:

### AppView Validation (Every Record)
1. Verify commit signature against DID document signing key
2. Independently resolve DIDs (don't trust cached data for security)
3. Validate record against lexicon schema
4. Verify record authored by expected DID
5. Bilateral match check before activating membership
6. Per-DID rate limiting (max 100 operations/hour in cooperative namespaces)
7. Reject implausible timestamps
8. Audit log every state transition with commit CID, rev, signature

### Identity Security
- Cooperatives MUST self-manage rotation keys with higher priority than PDS key
- Monitor PLC directory for unexpected key rotations on all indexed cooperative DIDs
- Display verified handle + DID together in UI
- Never expose pending/unmatched memberships in member lists

### Data Security
- Tier 2 data NEVER stored in ATProto repo (would be broadcast on firehose)
- Tier 3 data: only ciphertext on any server
- Batch public record updates to reduce timing correlation
- Randomized delays for non-time-sensitive public record creation

---

## Testing Strategy

### Unit Tests
- Every service method has unit tests
- Every indexer has tests for both record orderings (member-first, approval-first)
- Every security validation has tests for attack scenarios
- Use `MockClock` for time-dependent tests

### Integration Tests
- Full bilateral membership flow (create, approve, revoke)
- OAuth proxy writes to real PDS (test environment)
- Tap consumer processing real firehose events
- Private record CRUD with ACL enforcement

### E2E Tests
- Complete member journey: discover → join → vote → sign agreement
- Cooperative provisioning: create DID → set handle → deploy PDS
- Cross-cooperative interaction via firehose

---

## Common Patterns

### Adding a New Lexicon
1. Create JSON schema in `packages/lexicons/src/lexicons/network/coopsource/`
2. Run `pnpm --filter @coopsource/lexicons lex:generate`
3. Add indexer in `apps/api/src/appview/indexers/`
4. Register indexer in Tap consumer dispatch
5. Add service methods
6. Add API routes
7. Add frontend routes and components

### Adding a New Service
1. Create service class in `apps/api/src/services/`
2. Add to DI container in `container.ts`
3. Create routes in `apps/api/src/routes/`
4. Mount routes in `index.ts`
5. Add API client methods in `apps/web/src/lib/api/client.ts`
6. Create frontend routes in `apps/web/src/routes/`

### Writing to Member's PDS (via OAuth)
```typescript
// 1. Get member's stored OAuth session
const session = await oauthClient.restore(memberDid);
// 2. Create agent with session
const agent = new AtpAgent(session);
// 3. Write record to member's repo
await agent.com.atproto.repo.createRecord({
  repo: memberDid,
  collection: 'network.coopsource.org.membership',
  record: { $type: 'network.coopsource.org.membership', ... }
});
```

### Writing to Cooperative's PDS (via admin auth)
```typescript
// 1. Get cooperative's PDS admin agent
const agent = new AtpAgent({ service: config.COOP_PDS_URL });
await agent.login({ identifier: config.COOP_DID, password: config.COOP_PDS_ADMIN_PASSWORD });
// 2. Write record to cooperative's repo
await agent.com.atproto.repo.createRecord({
  repo: config.COOP_DID,
  collection: 'network.coopsource.org.memberApproval',
  record: { $type: 'network.coopsource.org.memberApproval', ... }
});
```

### Querying Private Records (Tier 2)
```typescript
const records = await db
  .selectFrom('private_record')
  .where('did', '=', cooperativeDid)
  .where('collection', '=', 'network.coopsource.governance.deliberation')
  .orderBy('created_at', 'desc')
  .execute();
```

---

## Key Dependencies and Versions

| Package | Version | Purpose |
|---------|---------|---------|
| `@atproto/api` | latest | ATProto XRPC client |
| `@atproto/oauth-client-node` | latest | OAuth with DPoP |
| `@atproto/pds` | 0.4.212+ | Self-hosted PDS |
| `@atproto/sync` | latest | Firehose consumption, MST verification |
| `express` | ^5.2 | HTTP server |
| `kysely` | ^0.28 | Database |
| `svelte` | ^5.53 | Frontend framework |
| `@sveltejs/kit` | ^2.53 | Frontend meta-framework |
| `vite` | ^7.3 | Build tool |
| `tailwindcss` | ^4.2 | CSS |
| `vitest` | ^4.0 | Testing |
| `zod` | ^4.3 | Validation |
| `pino` | ^10.3 | Logging |
| `typescript` | ^5.9 | Language |
| `stripe` | latest | Payments |

---

## Pitfalls to Avoid

1. **Never generate fake DIDs** — use real `did:plc` via PlcClient for production, `did:web` for local dev
2. **Never store Tier 2 data in ATProto repos** — it would be broadcast on the firehose
3. **Never trust handles for security** — handles are mutable; DIDs are persistent
4. **Never skip commit signature verification** on membership-relevant records
5. **Never count votes without verifying active bilateral membership**
6. **Never use Jetstream for security-critical data** — it strips cryptographic proofs
7. **Never expose pending/unmatched memberships** in UI member lists
8. **Build federation package after changes**: `pnpm --filter @coopsource/federation build`
9. **PostgreSQL bigint returns string** — use `Number()` conversion
10. **Tailwind plugin order** — `tailwindcss()` MUST come before `sveltekit()`
11. **AT URI as PK for PDS tables; UUID for app tables** — don't mix
12. **Cursor-based pagination everywhere** — not offset-based
13. **Don't add `role` to membership lexicon** — roles are ONLY in memberApproval
14. **Don't rely on Auth Scopes being available** — they're partially rolled out; use `transition:generic` for now
15. **Don't rely on Buckets** — still in design; use Tier 2 PostgreSQL for private data
16. **Don't run your own relay** — use `bsky.network`; running a relay costs $150+/mo

---

## Quick Reference: File Locations

```
apps/api/src/
├── container.ts              # DI container — start here for wiring
├── config.ts                 # Zod-validated config — add new env vars here
├── index.ts                  # Express app setup
├── appview/
│   ├── loop.ts               # Current firehose loop (to be replaced by Tap)
│   └── indexers/              # Collection-specific indexers
├── auth/
│   ├── oauth-client.ts       # ATProto OAuth — key for member writes
│   └── oauth-stores.ts       # PostgreSQL session/state stores
├── services/                  # Domain services (11 currently)
├── routes/                    # API routes (27+ endpoints)
├── middleware/                # Auth, error handling, federation-auth
├── payment/                   # Stripe integration
└── ai/                        # Agent framework, MCP client

packages/federation/src/
├── interfaces/                # IPdsService, IFederationClient, etc.
├── local/                     # LocalPdsService, LocalPlcClient, PlcClient
├── atproto/                   # AtprotoPdsService, firehose-decoder
├── http/                      # HttpFederationClient, RFC 9421 signing
└── outbox/                    # Federation outbox processor

packages/db/src/migrations/    # Kysely migrations (29 currently)
packages/lexicons/             # ATProto lexicon JSON schemas (22)
packages/common/               # Shared types, errors, validation
apps/web/src/                  # SvelteKit frontend (92 files)
infrastructure/                # Docker Compose files
```

---

*This prompt provides the complete context needed to implement the Co-op Source Network V5 architecture. Always reference ARCHITECTURE-V5.md for detailed specifications. Ask the user before making any architectural decisions not covered by this document.*
