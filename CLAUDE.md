# CLAUDE.md - Co-op Source Network

## Project Overview

Co-op Source Network is a federated collaboration platform built on ATProtocol. The core design principle is the **recursive cooperative model**: everything is an entity (person or cooperative), and a network is just a cooperative whose members are other cooperatives. The same membership, governance, and agreement machinery works at every level.

This monorepo is deployed to `coopsource.network`.

**For the full architecture, federation design, security model, cooperative lifecycle, and implementation phases, see [ARCHITECTURE-V5.md](./ARCHITECTURE-V5.md).**

**For the phased implementation guide with code patterns and file references, see [CLAUDE-CODE-PROMPT-V5.md](./CLAUDE-CODE-PROMPT-V5.md).**

## Git Workflow Rules

- **All work must be done on feature branches**, never directly on `main`
- **Never merge to `main` without explicit user approval** — ask first
- **Clean up merged branches** — delete feature branches after they've been merged to `main`

## Critical Constraints

Non-negotiable technology choices:

- **TypeScript strict mode** for all application code — no `any`, no unsafe casts
- **Express 5** for backend (standard Express routes; `@atproto/xrpc-server` is NOT used in our codebase)
- **Kysely 0.28+** for database (PostgreSQL 16+). NOT Prisma, NOT Drizzle, NOT TypeORM
- **SvelteKit 2** with **Svelte 5** runes (`$state`, `$derived`, `$effect`, `$props`)
- **Vite 7** with **@sveltejs/vite-plugin-svelte 6**
- **Tailwind CSS 4** via `@tailwindcss/vite` — MUST come BEFORE `sveltekit()` in vite.config.ts
- **pnpm 10+** workspace with **Turborepo 2+**
- **Vitest 4** for all tests
- **Zod 4** for validation
- **ATProtocol only** for federation. No cross-protocol bridges
- **Node.js 24 LTS** runtime
- **Bilateral membership is non-negotiable** — status = `active` ONLY when BOTH `membership` record (member's repo) AND `memberApproval` record (cooperative's repo) exist
- **Role authority is ONLY in memberApproval** — never in the membership record, never self-declared
- **DIDs are authoritative identifiers** — never use handles for security decisions
- **Records of authority live in PDS repos** — PostgreSQL is a materialized index for queries
- **Tier 2 private data NEVER touches the firehose** — stored in `private_record` table only
- **Cross-cooperative public data flows through ATProto** — the network IS the federation bus
- **Retain RFC 9421 HTTP signing ONLY for Tier 2 private data exchange** between closed cooperatives

## Build Commands

```bash
# Install & develop
pnpm install                           # Install all dependencies
pnpm dev                               # Start all dev servers (Turborepo)
pnpm --filter @coopsource/api dev      # Start API only
pnpm --filter @coopsource/web dev      # Start frontend only

# Database
docker compose -f infrastructure/docker-compose.yml up -d  # Start PostgreSQL + Redis + Mailpit
pnpm --filter @coopsource/db migrate   # Run Kysely migrations

# Build & test
pnpm build                             # Build all packages (turbo)
pnpm test                              # Run all tests (Vitest)

# Federation development
make dev                               # Standalone mode (one process, one DB)
make dev-federation                    # Multi-instance mode (Docker Compose: hub + coop-a + coop-b)
make migrate-all                       # Run migrations on all federation databases
make test-federation                   # Run federation integration tests

# Lexicon codegen
pnpm --filter @coopsource/lexicons lex:generate  # Generate TS types from lexicon JSON
```

### Local Development (Homebrew, no Docker)

```bash
make setup      # First-time: install Homebrew services, create DB, copy .env, migrate
make dev        # Start services + pnpm dev (API :3001, Web :5173)
make stop       # Stop PostgreSQL + Redis
make status     # Check infrastructure health
make db-reset   # Drop DB, recreate, and re-migrate
```

## Architecture Overview

### The V3→V5 Transition

The project is transitioning from V3 (pattern-aligned ATProto with custom federation) to V5 (full ATProto ecosystem citizen with comprehensive cooperative lifecycle). The current codebase is V3 — ~26,500 lines across ~280 files, 11 services, 50+ database tables, 22 lexicons, and a complete SvelteKit frontend.

V5 retires the parallel federation stack that V3 built:

- **`LocalPdsService`** → retired, replaced by real `@atproto/pds` via `AtprotoPdsService`
- **`LocalPlcClient`** → retired, replaced by real `PlcClient` for plc.directory
- **`LocalFederationClient`** → retired (direct PDS writes + Tap consumption)
- **`HttpFederationClient`** → retained ONLY for Tier 2 private data exchange
- **Federation outbox** → retired (PDS handles write reliability, Tap handles sync)
- **Saga coordinator** → retired (ATProto's eventually-consistent model)
- **`pg_notify('pds_firehose')`** → retired (Tap's WebSocket from real relay)

See ARCHITECTURE-V5.md §14 for the full gap analysis of what stays, changes, gets retired, and what's new.

### Three-Tier Data Model

**Tier 1 (Public ATProto)**: Cooperative profiles, public proposals, vote tallies, ratified agreements, membership directories. In PDS repos, on the firehose.

**Tier 2 (Private PostgreSQL)**: Closed deliberations, draft proposals, private membership details, financial records. In `private_record` table. Modeled as typed records by collection matching ATProto semantics for future Bucket migration.

**Tier 3 (E2EE)**: Board confidential discussions, salary records, personnel matters. Via Germ DM / MLS protocol. Platform facilitates but never handles content.

### Monorepo Layout

```
coopsource.network/
├── apps/
│   ├── api/          # @coopsource/api — Express backend (AppView + API)
│   └── web/          # @coopsource/web — SvelteKit frontend
├── packages/
│   ├── lexicons/     # @coopsource/lexicons — ATProto lexicon JSON + generated TS
│   ├── federation/   # @coopsource/federation — IPdsService, IFederationClient,
│   │                 #   LocalPdsService, DidWebResolver, HTTP signing, blobs, email
│   ├── db/           # @coopsource/db — Kysely database layer + migrations
│   ├── common/       # @coopsource/common — Shared types, constants, errors, validation
│   └── config/       # @coopsource/config — Shared tsconfig, eslint, prettier
├── infrastructure/
│   ├── docker-compose.yml              # PostgreSQL 16 + Redis 7 + Mailpit (dev)
│   └── docker-compose.federation.yml   # Multi-instance federation dev environment
├── scripts/
│   └── dev-services.sh     # Homebrew-based local dev setup
├── ARCHITECTURE-V5.md      # Full architecture document (replaces V3/V4)
├── CLAUDE-CODE-PROMPT-V5.md # Implementation guide with phased tasks
├── turbo.json
└── pnpm-workspace.yaml
```

### Dependency Layers

```
Layer 1 — Foundation:  config → common → db → lexicons → federation
Layer 2 — Core:        api (auth, entities, membership, governance, agreements, posts)
Layer 3 — Frontend:    web (SvelteKit, design system)
```

### Key Library Versions (Target)

See ARCHITECTURE-V5.md §15 and CLAUDE-CODE-PROMPT-V5.md for the full version matrix.

| Package | Target Version |
|---------|---------------|
| `express` | ^5.2 |
| `kysely` | ^0.28 |
| `svelte` | ^5.53 |
| `@sveltejs/kit` | ^2.53 |
| `vite` | ^7.3 |
| `@sveltejs/vite-plugin-svelte` | ^6.2 |
| `@sveltejs/adapter-auto` | ^7.0 |
| `tailwindcss` | ^4.2 |
| `vitest` | ^4.0 |
| `zod` | ^4.3 |
| `pino` | ^10.3 |
| `pino-http` | ^11.0 |
| `nodemailer` | ^8.0 |
| `typescript` | ^5.9 |
| `@atproto/api` | latest |
| `@atproto/oauth-client-node` | latest |
| `@atproto/pds` | 0.4.212+ |
| `@atproto/sync` | latest |
| `stripe` | latest |
| `pnpm` | 10.30+ |
| `Node.js` | 24 LTS |

## The Recursive Cooperative Model

This is the central design principle. Everything is an entity: `person` or `cooperative`. A network is just a cooperative whose members happen to be other cooperatives. No special type needed.

```
Person -> Cooperative:       Alice is a member of Acme Tech Co-op
Cooperative -> Network:      Acme Tech Co-op is a member of Co-op Source Network (is_network: true)
Person -> Network (direct):  Dave is a member of Co-op Source Network directly
```

Same machinery at every level:
- **Proposal**: An entity creates a record; others in the same co-op cast votes
- **Agreement**: Entities co-sign a record; each signature in the signer's PDS
- **Project**: A cooperative entity with its own membership (projects are mini-co-ops)

V5 extends this by adding legal entity types (cooperative corporation, cooperative LLC, LCA) and compliance workflows that also follow the recursive pattern.

## Federation Architecture

The platform is a full ATProto ecosystem citizen. Cooperatives are genuine ATProto accounts. Members bring their own Bluesky identities. Governance records flow through the real relay network alongside Bluesky posts, Tangled commits, Smoke Signal RSVPs, and WhiteWind blog entries.

See ARCHITECTURE-V5.md for complete details.

### Identity

| Environment | DID Method | Notes |
|-------------|-----------|-------|
| Production | `did:plc` | Portable, recoverable (72-hour rotation window), ecosystem standard |
| Local dev | `did:web` | Resolved via `/.well-known/did.json`, works with `localhost:PORT` |

Cooperatives use domain-as-handle (e.g., `@mycoop.coop`) for branding. Members use their existing ATProto identities (e.g., their Bluesky handle).

### Record Ownership

Members write to their own PDS: `membership`, `vote`, `delegation`, `signature`, `pledge`

Cooperatives write to their own PDS: `memberApproval`, `proposal`, `master agreement`, `legal.document`, `admin.officer`, `campaign`

### Instance Roles

Controlled by `INSTANCE_ROLE` env var:

| Mode | What it runs | Use case |
|------|-------------|----------|
| `standalone` | Hub + Co-op + AppView in one process, one DB | Development, demos |
| `hub` | Network directory, cross-co-op AppView | coopsource.network in production |
| `coop` | Single co-op's API, PDS, local AppView | Individual co-op server |

### Current Federation Abstractions (V3, being retired)

These exist in the codebase but are being replaced as part of V5 migration:

- **`IFederationClient`** — interface for cross-co-op operations (being retired for public data; retained for Tier 2 only)
- **`IPdsService`** — interface for PDS operations
  - `LocalPdsService`: PostgreSQL-backed PDS (being retired → `AtprotoPdsService`)
  - `AtprotoPdsService`: real ATProto XRPC (V5 target, already exists gated behind `PDS_URL` env var)
- **`DidWebResolver`** — resolves `did:web` identifiers (remains for local dev)

### V5 Target Federation

- **Tap** (Go binary): Production firehose sync tool replacing pg_notify, filters by collection
- **Real `@atproto/pds`**: Self-hosted PDS for cooperative accounts
- **`PlcClient`**: HTTP client for real plc.directory (already exists in codebase)
- **DPoP-bound OAuth**: Member writes proxied to member's PDS via OAuth tokens
- **Ozone labeler**: Governance status labels published via ATProto label system

## ATProtocol Patterns

### Bilateral Membership (Non-Negotiable)

Both sides must exist for ACTIVE status:
1. **Member** creates `network.coopsource.org.membership` record in their PDS
2. **Cooperative** creates `network.coopsource.org.memberApproval` record in its PDS
3. AppView indexer checks both records exist → sets status to `active`

**Role authority is ONLY in memberApproval**, never in the membership record.

AppView state machine handles out-of-order arrival:
- On membership create: index → check for matching approval → `active` or `pending_member`
- On memberApproval create: index → check for matching membership → `active` or `pending_approval`
- On either delete: transition to `revoked` state

### Lexicon Namespace

Active and planned lexicons under `network.coopsource.*`:

```
network.coopsource.org.*         — cooperatives, memberships, memberApprovals, teams
network.coopsource.governance.*  — proposals, votes, delegations
network.coopsource.agreement.*   — agreements, signatures, amendments
network.coopsource.legal.*       — foundational documents, meeting records
network.coopsource.admin.*       — officers, compliance items, member notices, fiscal periods
network.coopsource.funding.*     — campaigns, pledges
network.coopsource.alignment.*   — interests, outcomes, maps (future)
```

### PDS Record Pattern

Records of authority live in user PDS instances. PostgreSQL is a **materialized index**.

V3 (current): `LocalPdsService` creates records and emits firehose events via `pg NOTIFY`. AppView loop subscribes and indexes into PostgreSQL for fast queries.

V5 (target): Records written to real `@atproto/pds`. Tap binary consumes firehose from `bsky.network` relay, filtering for `network.coopsource.*` collections. Tap consumer service dispatches events to indexers.

## Security Requirements

Implement these throughout all phases (see ARCHITECTURE-V5.md §8 for full security model):

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

## Database

### Kysely Notes

- `Generated<T>` for auto-generated columns
- `ColumnType<S, I, U>` for different select/insert/update types
- PostgreSQL bigint returns string — use `Number()` conversion, not TypeScript cast
- AT URI as PK for PDS tables; UUID for app tables — don't mix these
- Cursor-based pagination everywhere, not offset-based

## API Routes (Currently Mounted)

All under `/api/v1/`:

| Route | Handler |
|-------|---------|
| Health | `routes/health.ts` |
| Setup | `routes/setup.ts` |
| Auth | `routes/auth.ts` |
| Cooperative | `routes/org/cooperatives.ts` |
| Membership | `routes/org/memberships.ts` |
| Posts | `routes/posts.ts` |
| Proposals | `routes/governance/proposals.ts` |
| Agreements | `routes/agreement/agreements.ts` |
| Networks | `routes/org/networks.ts` |
| Blobs | `routes/blobs.ts` |
| Events (SSE) | `routes/events.ts` |
| Admin | `routes/admin.ts` |
| Federation | `routes/federation.ts` *(server-to-server, signed HTTP)* |

V5 will add: legal documents, compliance calendar, officer records, meeting records, fiscal periods, patronage, capital accounts, onboarding workflows.

## Frontend Patterns

### SvelteKit + Svelte 5

- **Runes only**: `$state`, `$derived`, `$effect`, `$props` — no legacy reactive statements
- Route groups: `(authed)/` for authenticated routes
- Auth guard in `(authed)/+layout.server.ts`
- API client in `src/lib/api/client.ts` — typed fetch wrapper

### Tailwind CSS 4

```typescript
// vite.config.ts — PLUGIN ORDER MATTERS
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
export default defineConfig({
  plugins: [tailwindcss(), sveltekit()], // tailwindcss FIRST
});
```

### Design System (Linear-Inspired)

- Dark sidebar (#0f172a), light content area (#fafafa)
- Primary: Indigo-600, Accent: Violet-500
- 13px base, Inter font, 6px border-radius for cards
- Lucide icons via `@lucide/svelte`

## DI Container

`apps/api/src/container.ts` currently instantiates:
- `db` (Kysely), `pdsService` (LocalPdsService), `blobStore` (LocalBlobStore)
- `federationClient` (LocalFederationClient or HttpFederationClient, based on INSTANCE_ROLE)
- `didResolver` (DidWebResolver)
- `clock` (SystemClock), `emailService` (DevEmailService)
- `authService`, `entityService`, `membershipService`
- `postService`, `proposalService`, `agreementService`
- `networkService`, `fundingService`, `alignmentService`, `connectionService`

V5 will add: `PlcClient`, `AtprotoPdsService` (gated behind `PDS_URL`), `oauthClient`, `memberWriteProxy`, `tapConsumer`, `governanceLabeler`, `legalDocumentService`, `complianceCalendarService`, `officerRecordService`, `patronageService`, `capitalAccountService`, `onboardingService`.

## Implementation Phases

V5 is implemented in seven sequential phases. See CLAUDE-CODE-PROMPT-V5.md for detailed tasks and file references.

| Phase | Branch | Scope |
|-------|--------|-------|
| 0 | `feature/phase-0-pds-identity` | Foundation: self-hosted PDS, did:plc, cooperative provisioning |
| 1 | `feature/phase-1-member-oauth` | Member identity: OAuth proxy, DPoP, write routing, private_record table |
| 2 | `feature/phase-2-tap-appview` | Tap-based AppView: firehose consumption, bilateral state machine |
| 3 | `feature/phase-3-ecosystem` | Ecosystem composability: Ozone labeler, Smoke Signal, retire V3 federation |
| 4 | `feature/phase-4-legal-admin` | Legal lifecycle: documents, compliance, officers, meeting records |
| 5 | `feature/phase-5-private-data` | Private data: Tier 2 CRUD, visibility routing, closed cooperative UI |
| 6 | `feature/phase-6-financial` | Financial tools: patronage calculation, capital accounts, 1099-PATR |
| 7 | `feature/phase-7-onboarding-advanced` | Onboarding workflows, delegation voting, feed generators |

## Pitfalls

1. **Never generate fake DIDs.** Use real `did:plc` via PlcClient for production, `did:web` for local dev
2. **Bilateral membership is non-negotiable.** Both member PDS record AND co-op approval record must exist
3. **Role authority is ONLY in memberApproval**, never in the membership record
4. **Never store Tier 2 data in ATProto repos** — it would be broadcast on the firehose
5. **Never trust handles for security** — handles are mutable; DIDs are persistent
6. **Never skip commit signature verification** on membership-relevant records
7. **Never count votes without verifying active bilateral membership**
8. **Never use Jetstream for security-critical data** — it strips cryptographic proofs
9. **Never expose pending/unmatched memberships** in UI member lists
10. **Build federation package after changes:** `pnpm --filter @coopsource/federation build`
11. **PostgreSQL bigint returns string.** Use `Number()` conversion
12. **Tailwind CSS 4 plugin order:** `tailwindcss()` MUST come before `sveltekit()` in vite.config.ts
13. **AT URI as PK for PDS tables; UUID for app tables.** Don't mix these
14. **Cursor-based pagination everywhere.** Not offset-based
15. **Don't add `role` to membership lexicon.** Roles are ONLY in memberApproval
16. **Don't rely on Auth Scopes being available** — they're partially rolled out; use `transition:generic` for now
17. **Don't rely on Buckets** — still in design; use Tier 2 PostgreSQL for private data
18. **Don't run your own relay** — use `bsky.network`; running a relay costs $150+/mo

## Troubleshooting

- Tailwind styles not applying → Check vite plugin order
- CORS errors in dev → API allows `http://localhost:5173` in dev
- Session cookies not sent → `sameSite: 'lax'`, both on localhost
- Federation build errors → `pnpm --filter @coopsource/federation build` before API
