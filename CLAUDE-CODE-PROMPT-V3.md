# Claude Code Implementation Prompt (Federated from Day One)

Copy this prompt into Claude Code when working in the coopsource.network repository.

---

## Prompt

```
Read the file ARCHITECTURE-V3.md in the project root. This is the comprehensive architecture document for Co-op Source Network's federated-from-day-one approach, produced by analyzing this codebase in detail plus ATProto ecosystem research as of February 2026.

CURRENT STATE (February 2026):
- Phases 0-9 of Stage 2 are COMPLETE and merged to main.
- 207 API integration tests + 46 federation package tests + 13 Playwright E2E spec files, all passing.
- 23 database migrations implemented (001-023).
- Workspace routing: /coop/[handle]/ and /net/[handle]/ with scoped sidebars.
- Federation: All 8 endpoints fully implemented + 3 new agreement signing endpoints + GET /me/signature-requests.
- Phase 9 added: federation_peer registry, signature_request lifecycle, SagaCoordinator, federation_outbox.

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

REMAINING STAGE 2 GAPS (next work):
- Federation stubs: agreement/sign-request, agreement/signature, hub/register, hub/notify
- Missing migrations: 021 (did_web_support), 022 (federation_peer), 023 (cross_coop_outbox), 024 (public_profile_fields)
- SagaCoordinator (packages/federation/src/saga.ts) — designed in §3.8 but not implemented
- Federation peer registry, outbox pattern, public visibility flags

STAGE 3 (future):
- Automation, AI agents, MCP integration
- CLI auth, OIDC
- Stripe payment processing for funding campaigns
- Cross-instance alignment sharing

SERVICES LAYER (apps/api/src/services/):
- authService — register, login, getSessionActor
- entityService — entity CRUD, getCooperativeByHandle
- membershipService — membership lifecycle, invitation acceptance
- networkService — network CRUD, join/leave
- postService — threads and posts
- proposalService — governance proposals, voting
- agreementService — agreement lifecycle, signing (federationClient injected but unused)
- agreementTemplateService — reusable agreement templates
- fundingService — campaigns, pledges
- alignmentService — interests, outcomes, maps (local-only, no federation)
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

Start by reading ARCHITECTURE-V3.md sections 9-10 to understand remaining gaps, then ask what to work on.
```

---

## Quick Reference: What to Work On Next

| Priority | Work Item | Scope |
|----------|-----------|-------|
| **1** | Federation endpoint stubs → real implementations | `apps/api/src/routes/federation.ts` |
| **2** | Migrations 021-024 | `packages/db/src/migrations/` |
| **3** | SagaCoordinator implementation | `packages/federation/src/saga.ts` |
| **4** | Federate AgreementService signing flow | `apps/api/src/services/agreement-service.ts` |
| **5** | Stage 3 features (AI, Stripe, OIDC) | New services + routes |

## Key Files to Read First

Before implementing, have Claude Code read:
1. `ARCHITECTURE-V3.md` — full architecture (especially §3.6 API routes, §9 remaining gaps, §10 undocumented features)
2. `CLAUDE.md` — project conventions and constraints
3. `packages/federation/src/interfaces/pds-service.ts` — the interface pattern to follow
4. `packages/federation/src/http/http-federation-client.ts` — current HttpFederationClient
5. `apps/api/src/container.ts` — how DI works
6. `apps/api/src/routes/federation.ts` — existing endpoints (4 real + 4 stubs)
7. `apps/web/tests/e2e/helpers.ts` — E2E test infrastructure
8. `apps/web/src/lib/utils/workspace.ts` — workspace context utilities
