# Claude Code Implementation Prompt (Federated from Day One)

Copy this prompt into Claude Code when working in the coopsource.network repository.

---

## Prompt

```
Read the file ARCHITECTURE-V3.md in the project root. This is the comprehensive architecture document for Co-op Source Network's federated-from-day-one approach, produced by analyzing this codebase in detail plus ATProto ecosystem research as of February 2026.

CURRENT STATE (February 2026):
- Phases 0-10 of Stage 2 are COMPLETE and merged to main.
- 210+ API integration tests + 46 federation package tests + 13 Playwright E2E spec files, all passing.
- 24 database migrations implemented (001-024).
- Workspace routing: /coop/[handle]/ and /net/[handle]/ with scoped sidebars.
- Federation: All 8 endpoints fully implemented + 5 agreement signing endpoints + GET /me/signature-requests.
- Phase 9 added: federation_peer registry, signature_request lifecycle, SagaCoordinator, federation_outbox.
- Phase 10 added: public profile visibility flags (migration 024), all services wired to federationClient, OutboxProcessor startup for federated mode.

CRITICAL CONTEXT:
- This is a pnpm monorepo with Turborepo. Express API, SvelteKit frontend, Kysely/PostgreSQL.
- The project uses ATProto patterns (bilateral membership, PDS records, lexicons) but operates independently.
- The LocalPdsService (PostgreSQL-backed) is our PDS. We are NOT embedding @atproto/pds or using SQLite.
- The core architectural principle: cross-co-op operations are ALWAYS mediated by IFederationClient, never by direct DB access across co-op boundaries.

KEY ABSTRACTIONS:

1. IFederationClient — interface with two implementations:
   - LocalFederationClient: dispatches locally (standalone mode)
   - HttpFederationClient: makes signed HTTP calls (federated mode)
   Container switches on INSTANCE_ROLE config ('standalone' | 'hub' | 'coop')
   This mirrors the existing IPdsService pattern exactly.

2. DidWebResolver — resolves did:web identifiers via HTTP GET to /.well-known/did.json.
   In standalone mode, checks local DB first. In federated mode, makes HTTP calls.

3. WorkspaceContext — SvelteKit workspace routing context:
   - workspacePrefix derived store provides /coop/{handle} or /net/{handle}
   - AppShell, Sidebar, Navbar parameterized with workspace prop
   - Dashboard is workspace picker (no sidebar), workspace pages have scoped sidebar

WHAT'S NEXT — STAGE 3:
- Automation, AI agents, MCP integration
- CLI auth, OIDC
- Stripe payment processing for funding campaigns
- Cross-instance alignment sharing

SERVICES LAYER (apps/api/src/services/):
- authService — register, login, getSessionActor
- entityService — entity CRUD, getCooperativeByHandle
- membershipService — membership lifecycle, invitation acceptance (federationClient wired)
- networkService — network CRUD, join/leave (federationClient wired, notifyHub on departure)
- postService — threads and posts
- proposalService — governance proposals, voting
- agreementService — agreement lifecycle, signing (federationClient wired: submitSignature, retractSignature)
- agreementTemplateService — reusable agreement templates
- fundingService — campaigns, pledges (federationClient wired: notifyHub on campaign activate, pledge create)
- alignmentService — interests, outcomes, maps (federationClient wired: notifyHub on submit/create/support/generate)
- connectionService — external OAuth connections

CRITICAL CONSTRAINTS (from CLAUDE.md and ARCHITECTURE-V3.md):
- TypeScript strict mode everywhere
- Express 5, Kysely 0.28+, PostgreSQL 16+
- SvelteKit 2 with Svelte 5 runes ONLY (no $: reactive, no onMount stores)
- Tailwind CSS 4 via @tailwindcss/vite (BEFORE sveltekit() in vite.config)
- pnpm 10+ workspace with Turborepo 2+
- Vite 7 with @sveltejs/vite-plugin-svelte 6
- Node.js 24 LTS
- Bilateral membership: member writes membership, co-op writes memberApproval
- Role authority is ONLY in memberApproval, never in membership
- AT URI as PK for PDS tables, UUID for app tables
- Cursor-based pagination everywhere
- Never generate fake DIDs — use real did:web format

TESTING:
- Use Vitest 4 for all API tests
- Playwright for E2E tests (apps/web/tests/e2e/)
- E2E helpers: setupCooperative(), loginAs(), registerAs(), resetDatabase() in helpers.ts
- wp() helper builds workspace paths: wp('/governance') → /coop/e2e-test-coop/governance
- Mock IFederationClient in unit tests (same as you'd mock IPdsService)
- Integration tests use LocalFederationClient (standalone mode)
- Federation tests use Docker Compose + HttpFederationClient

Start by reading ARCHITECTURE-V3.md to understand the full architecture, then ask what to work on.
```

---

## Quick Reference: What to Work On Next

| Priority | Work Item | Scope |
|----------|-----------|-------|
| **1** | Stage 3: Stripe integration for funding | `apps/api/src/routes/funding/`, new Stripe service |
| **2** | Stage 3: OIDC provider | New service + routes |
| **3** | Stage 3: AI agent framework | New service + MCP integration |
| **4** | Stage 3: Automation workflows | Workflow engine + trigger system |
| **5** | Frontend polish: settings UI for visibility flags | `apps/web/src/routes/(authed)/coop/[handle]/settings/` |

## Key Files to Read First

Before implementing, have Claude Code read:
1. `ARCHITECTURE-V3.md` — full architecture
2. `CLAUDE.md` — project conventions and constraints
3. `packages/federation/src/interfaces/pds-service.ts` — the interface pattern to follow
4. `packages/federation/src/interfaces/federation-client.ts` — IFederationClient interface
5. `apps/api/src/container.ts` — how DI works
6. `apps/api/src/routes/federation.ts` — federation endpoints
7. `apps/web/tests/e2e/helpers.ts` — E2E test infrastructure
8. `apps/web/src/lib/utils/workspace.ts` — workspace context utilities
