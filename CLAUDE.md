# CLAUDE.md - Co-op Source Network

## Project Overview

Co-op Source Network is a federated collaboration platform built on ATProtocol. The core design principle is the **recursive cooperative model**: everything is an entity (person or cooperative), and a network is just a cooperative whose members are other cooperatives. The same membership, governance, and agreement machinery works at every level.

This monorepo is deployed to `coopsource.network`.

**For the full architecture, federation design, dependency upgrade plan, and implementation phases, see [ARCHITECTURE-V3.md](./ARCHITECTURE-V3.md).**

## Git Workflow Rules

- **All work must be done on feature branches**, never directly on `main`
- **Never merge to `main` without explicit user approval** — ask first
- **Never delete branches** — keep them as a historical record

## Critical Constraints

Non-negotiable technology choices:

- **TypeScript strict mode** for all application code
- **Express 5** for backend (standard Express routes; `@atproto/xrpc-server` is NOT used in our codebase)
- **Kysely 0.28+** for database (PostgreSQL 16+). NOT Prisma, NOT Drizzle
- **SvelteKit 2** with **Svelte 5** runes (`$state`, `$derived`, `$effect`, `$props`)
- **Vite 7** with **@sveltejs/vite-plugin-svelte 6**
- **Tailwind CSS 4** via `@tailwindcss/vite` — MUST come BEFORE `sveltekit()` in vite.config.ts
- **pnpm 10+** workspace with **Turborepo 2+**
- **Vitest 4** for all tests
- **Zod 4** for validation
- **ATProtocol only** for federation. No cross-protocol bridges
- **Node.js 24 LTS** runtime
- **Federated from day one** — cross-co-op operations always go through `IFederationClient`, never direct DB access across co-op boundaries (see ARCHITECTURE-V3.md §3)

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
├── ARCHITECTURE-V3.md      # Full architecture document
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

See ARCHITECTURE-V3.md §7 for the full upgrade matrix and phased migration plan.

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

## Federation Architecture

The platform is federated from day one. See ARCHITECTURE-V3.md for complete details.

### Core Abstractions

- **`IFederationClient`** — interface for all cross-co-op operations, with two implementations:
  - `LocalFederationClient`: dispatches locally (standalone mode)
  - `HttpFederationClient`: makes signed HTTP calls (federated mode)
- **`IPdsService`** — interface for PDS operations, with two implementations:
  - `LocalPdsService`: PostgreSQL-backed PDS (our primary implementation)
  - `AtprotoPdsService`: real ATProto XRPC (future, via rsky-pds)
- **`DidWebResolver`** — resolves `did:web` identifiers via HTTP GET to `/.well-known/did.json`

### Instance Roles

Controlled by `INSTANCE_ROLE` env var:

| Mode | What it runs | Use case |
|------|-------------|----------|
| `standalone` | Hub + Co-op + AppView in one process, one DB | Development, demos |
| `hub` | Network directory, cross-co-op AppView | coopsource.network in production |
| `coop` | Single co-op's API, PDS, local AppView | Individual co-op server |

### Identity: did:web

Entities use `did:web` identifiers resolved via `/.well-known/did.json`. This works with `localhost:PORT` in dev and custom domains in production. No external PLC directory dependency.

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
network.coopsource.alignment.*   — interests, outcomes, maps (future)
```

### PDS Record Pattern

Records of authority live in user PDS instances. PostgreSQL is a **materialized index**.

```typescript
// LocalPdsService creates records and emits firehose events via pg NOTIFY
// AppView loop subscribes and indexes into PostgreSQL for fast queries
```

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

`apps/api/src/container.ts` instantiates:
- `db` (Kysely), `pdsService` (LocalPdsService), `blobStore` (LocalBlobStore)
- `federationClient` (LocalFederationClient or HttpFederationClient, based on INSTANCE_ROLE)
- `didResolver` (DidWebResolver)
- `clock` (SystemClock), `emailService` (DevEmailService)
- `authService`, `entityService`, `membershipService`
- `postService`, `proposalService`, `agreementService`
- `networkService`, `fundingService`, `alignmentService`, `connectionService`

## Pitfalls

1. **Never generate fake DIDs.** Use real `did:web` format derived from instance URL
2. **Bilateral membership is non-negotiable.** Both member PDS record AND co-op approval record must exist
3. **Role authority is ONLY in memberApproval**, never in the membership record
4. **Cross-co-op operations always go through IFederationClient**, never direct DB access across boundaries
5. **Build federation package after changes:** `pnpm --filter @coopsource/federation build`
6. **PostgreSQL bigint returns string.** Use `Number()` conversion
7. **Tailwind CSS 4 plugin order:** `tailwindcss()` MUST come before `sveltekit()` in vite.config.ts
8. **AT URI as PK for PDS tables; UUID for app tables.** Don't mix these
9. **Cursor-based pagination everywhere.** Not offset-based
10. **Don't add `role` to membership lexicon.** Self-declared role is semantically wrong

## Troubleshooting

- Tailwind styles not applying → Check vite plugin order
- CORS errors in dev → API allows `http://localhost:5173` in dev
- Session cookies not sent → `sameSite: 'lax'`, both on localhost
- Federation build errors → `pnpm --filter @coopsource/federation build` before API
