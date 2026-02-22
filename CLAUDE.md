# CLAUDE.md - Co-op Source Network

## Project Overview

Co-op Source Network is a federated collaboration platform built on ATProtocol. The core design principle is the **recursive cooperative model**: everything is an entity (person or cooperative), and a network is just a cooperative whose members are other cooperatives. The same membership, governance, and agreement machinery works at every level.

This monorepo is deployed to `coopsource.network`.

## Critical Constraints

Non-negotiable technology choices:

- **TypeScript strict mode** for all application code
- **Express 4** for backend (standard Express routes; `@atproto/xrpc-server` is NOT used in our codebase)
- **Kysely 0.27+** for database (PostgreSQL 16). NOT Prisma, NOT Drizzle
- **SvelteKit 2.20+** with **Svelte 5.19+** runes (`$state`, `$derived`, `$effect`, `$props`)
- **Tailwind CSS 4** via `@tailwindcss/vite` — MUST come BEFORE `sveltekit()` in vite.config.ts
- **pnpm 9+** workspace with **Turborepo 2+**
- **ATProtocol only** for federation. No cross-protocol bridges
- Node.js 22 LTS runtime

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

### Monorepo Layout

```
coopsource.network/
├── apps/
│   ├── api/          # @coopsource/api — Express backend (AppView + API)
│   └── web/          # @coopsource/web — SvelteKit frontend
├── packages/
│   ├── lexicons/     # @coopsource/lexicons — ATProto lexicon JSON + generated TS
│   ├── federation/   # @coopsource/federation — LocalPdsService, LocalPlcClient, blobs, email
│   ├── db/           # @coopsource/db — Kysely database layer + migrations
│   ├── common/       # @coopsource/common — Shared types, constants, errors, validation
│   └── config/       # @coopsource/config — Shared tsconfig, eslint, prettier
├── infrastructure/
│   └── docker-compose.yml  # PostgreSQL 16 + Redis 7 + Mailpit (dev)
├── scripts/
│   └── dev-services.sh     # Homebrew-based local dev setup
├── turbo.json
└── pnpm-workspace.yaml
```

### Dependency Layers

```
Layer 1 — Foundation:  config → common → db → lexicons → federation
Layer 2 — Core:        api (auth, entities, membership, governance, agreements, posts)
Layer 3 — Frontend:    web (SvelteKit, design system)
```

### Key Library Versions

| Package | Version |
|---------|---------|
| `express` | ^4.21 |
| `kysely` | ^0.27 |
| `svelte` | ^5.19 |
| `@sveltejs/kit` | ^2.20 |
| `tailwindcss` | ^4 |
| `vitest` | ^3 |
| `zod` | ^3.23 |
| `typescript` | ^5.7 |

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

## ATProtocol Patterns

### Bilateral Membership (Non-Negotiable)

Both sides must exist for ACTIVE status:
1. **Member** creates `network.coopsource.org.membership` record in their PDS
2. **Cooperative** creates `network.coopsource.org.memberApproval` record in its PDS
3. AppView indexer checks both records exist → sets status to `active`

**Role authority is ONLY in memberApproval**, never in the membership record.

### Lexicon Namespace

Active lexicons under `network.coopsource.*`:

```
network.coopsource.org.*         — cooperatives, memberships, memberApprovals, teams
network.coopsource.governance.*  — proposals, votes, delegations
network.coopsource.agreement.*   — agreements, signatures, amendments
network.coopsource.alignment.*   — interests, outcomes, maps (Stage 3)
```

### PDS Record Pattern

Records of authority live in user PDS instances. PostgreSQL is a **materialized index**.

```typescript
// LocalPdsService creates records and emits firehose events via pg NOTIFY
// AppView loop subscribes and indexes into PostgreSQL for fast queries
```

## Database

### Migrations (11 total)

| # | Name | Tables |
|---|------|--------|
| 001 | foundation | Core setup |
| 002 | entities | `entity`, `cooperative_profile` |
| 003 | auth | `auth_credential`, `session` |
| 004 | pds_store | `pds_record`, `signing_key`, `blob` |
| 005 | membership | `membership`, `membership_role`, `invitation` |
| 006 | posts | `post`, `thread` |
| 007 | governance | `proposal`, `vote` |
| 008 | agreements | `agreement`, `agreement_party`, `agreement_signature` |
| 009 | plc_store | `plc_operation` |
| 010 | decouple_entity_key | Entity key management |
| 011 | fix_indexes | Partial unique indexes for votes/sigs, perf indexes |
| 012 | decouple_pds_fks | Drop PDS record/commit FK constraints to entity |

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
- Lucide icons via `lucide-svelte`

## DI Container

`apps/api/src/container.ts` instantiates:
- `db` (Kysely), `pdsService` (LocalPdsService), `blobStore` (LocalBlobStore)
- `clock` (SystemClock), `emailService` (DevEmailService)
- `authService`, `entityService`, `membershipService`
- `postService`, `proposalService`, `agreementService`

## ATProtocol Pitfalls

1. **Never generate fake DIDs.** LocalPlcClient uses real SHA-256 + base32 matching plc.directory
2. **Bilateral membership is non-negotiable.** Both member PDS record AND co-op approval record must exist
3. **Role authority is ONLY in memberApproval**, never in the membership record
4. **Build federation package after changes:** `pnpm --filter @coopsource/federation build`
5. **PostgreSQL bigint returns string.** Use `Number()` conversion
6. **Tailwind CSS 4 plugin order:** `tailwindcss()` MUST come before `sveltekit()` in vite.config.ts
7. **AT URI as PK for PDS tables; UUID for app tables.** Don't mix these
8. **Cursor-based pagination everywhere.** Not offset-based
9. **Don't add `role` to membership lexicon.** Self-declared role is semantically wrong
10. **Run PDS as separate service (Stage 2).** Don't embed xrpc-server

## Implementation Stages

| Stage | Focus |
|-------|-------|
| **0: Bootstrap** | Repo setup, backend cleanup, design system, landing page, auth, dashboard |
| **1: Co-op MVP** | Governance UI, agreements UI, posts, network membership API, E2E tests |
| **2: Network** | Real ATProto PDS, ATProto OAuth, network discovery, cross-coop firehose |
| **3: Differentiators** | Alignment discovery, enhanced agreements, crowdfunding, AI agents |

## Troubleshooting

- Tailwind styles not applying → Check vite plugin order
- CORS errors in dev → API allows `http://localhost:5173` in dev
- Session cookies not sent → `sameSite: 'lax'`, both on localhost
- Federation build errors → `pnpm --filter @coopsource/federation build` before API
