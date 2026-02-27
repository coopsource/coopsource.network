# Claude Code Implementation Prompt (Federated from Day One)

Copy this prompt into Claude Code when working in the coopsource.network repository.

---

## Prompt

```
Read the file ARCHITECTURE-V3.md in the project root. This is the comprehensive architecture document for Co-op Source Network's federated-from-day-one approach, produced by analyzing this codebase in detail plus ATProto ecosystem research as of February 2026.

CRITICAL CONTEXT:
- This is a pnpm monorepo with Turborepo. Express API, SvelteKit frontend, Kysely/PostgreSQL.
- The project uses ATProto patterns (bilateral membership, PDS records, lexicons) but operates independently.
- The LocalPdsService (PostgreSQL-backed) is our PDS. We are NOT embedding @atproto/pds or using SQLite.
- The core architectural principle: cross-co-op operations are ALWAYS mediated by IFederationClient, never by direct DB access across co-op boundaries.

There are TWO key new abstractions:

1. IFederationClient — interface with two implementations:
   - LocalFederationClient: dispatches locally (standalone mode)
   - HttpFederationClient: makes signed HTTP calls (federated mode)
   Container switches on INSTANCE_ROLE config ('standalone' | 'hub' | 'coop')
   This mirrors the existing IPdsService pattern exactly.

2. DidWebResolver — resolves did:web identifiers via HTTP GET to /.well-known/did.json.
   In standalone mode, checks local DB first. In federated mode, makes HTTP calls.

The architecture document (ARCHITECTURE-V3.md) has detailed code examples for both. Read sections 3.1-3.6 carefully before implementing.

IMPLEMENTATION PHASES (do them in this order):

### Phase 0: Dependency Upgrades (do FIRST)

See ARCHITECTURE-V3.md section 7 for the full version matrix and upgrade notes.

Phase 0a — Fix anomalous pins + auto-resolve minors:
  - Fix cborg pin (^4.5.8 doesn't exist → ^4.3.2)
  - Verify @lucide/svelte pin (0.575.0 may not exist → use ^0.574.0 or latest)
  - Verify @atproto/xrpc pin (^0.7.7 → check npm, latest may be 0.7.6)
  - Run pnpm update to pick up all in-range updates
  - Run pnpm test to verify nothing broke

Phase 0b — Coordinated Vite cascade (these three MUST be upgraded together):
  - vite ^6 → ^7.3
  - @sveltejs/vite-plugin-svelte ^5 → ^6.2
  - @sveltejs/adapter-auto ^4 → ^7.0
  - Tailwind CSS vite plugin order is unchanged: @tailwindcss/vite BEFORE sveltekit()
  - Run full frontend test suite

Phase 0c — Backend stack:
  - express ^4.21 → ^5.2 (migration guide at expressjs.com; app.del()→app.delete(), req.acceptsCharset()→req.acceptsCharsets(), async error handling improved)
  - pino ^9 → ^10.3 AND pino-http ^10 → ^11.0 (upgrade together)
  - nodemailer ^6 → ^8.0 (error codes changed: 'NoAuth' → 'ENOAUTH')
  - bcrypt ^5 → ^6.0 (or switch to bcryptjs ^3.0 for pure JS)

Phase 0d — Build tooling:
  - pnpm 9 → 10 (update packageManager field, config moves from .npmrc to pnpm-workspace.yaml)
  - vitest ^3 → ^4.0 (check vitest.dev/blog/vitest-4 migration guide)

Phase 0e — Schema and data (highest risk, do last):
  - zod ^3.23 → ^4.3 (MAJOR rewrite — .superRefine() deprecated, .email() → z.email(), .record() requires 2 args. The config.ts envSchema uses .superRefine() heavily and must be rewritten. VERIFY @atproto/oauth-client-node works with Zod 4 first.)
  - kysely ^0.27 → ^0.28 (review changelog for breaking query builder changes)
  - @atproto/api ^0.18.21 → ^0.19.0 (manual bump, ^0.18 won't auto-resolve)

Phase 0f — Node.js runtime (do after all deps are upgraded):
  - Update engines.node to >=24 in root package.json
  - Update Dockerfile base images to node:24-alpine
  - Node 22 is Maintenance LTS (EOL April 2027); Node 24 is Active LTS

IMPORTANT: After each sub-phase, run pnpm test and pnpm build. Do NOT batch all upgrades together. Ask me before proceeding past Phase 0c if anything breaks.

### Phase 1: Federation Foundation

Start here after Phase 0 is complete.

1.1 did:web support:
  - Add did:web parsing utilities to packages/common/src/did-web.ts
    (parse did:web → URL, URL → did:web, validate format)
  - Implement DidWebResolver class in packages/federation/src/http/did-web-resolver.ts
    (resolve did:web → DidDocument, cache with 5min TTL, local DB fast-path)
  - Add GET /.well-known/did.json Express endpoint
    (reads entity DID + public key from entity_key table, constructs DID document)
  - Update LocalPdsService.createDid() to generate did:web identifiers
    based on INSTANCE_URL config (keep LocalPlcClient for backward compat)

1.2 IFederationClient interface + LocalFederationClient:
  - Define IFederationClient interface in packages/federation/src/interfaces/federation-client.ts
    (see ARCHITECTURE-V3.md section 3.1 for the full interface)
  - Implement LocalFederationClient in packages/federation/src/local/local-federation-client.ts
    (dispatches to local DB + PDS — used in standalone mode)
  - Add INSTANCE_ROLE and HUB_URL to config.ts (with zod validation)
  - Wire IFederationClient into Container (standalone → LocalFederationClient)
  - Write tests for LocalFederationClient

1.3 Refactor services to use IFederationClient:
  - Inject IFederationClient into NetworkService, MembershipService, AgreementService
  - Refactor NetworkService.joinNetwork() to use federationClient.approveMembership()
    instead of directly writing PDS records for the remote side
    (see ARCHITECTURE-V3.md section 3.6 for before/after code)
  - Refactor MembershipService.approveInvitation() similarly
  - Ensure all existing tests pass with LocalFederationClient (behavior should be identical)

Ask me before proceeding to Phase 2.

### Phase 2: HTTP Federation (only after Phase 1 works)

2.1 HTTP Message Signatures:
  - Implement signRequest() in packages/federation/src/http/signing.ts
    (signs HTTP requests with ES256 key per RFC 9421)
  - Implement verifyRequest() that resolves signer DID, gets public key, verifies
  - Create requireFederationAuth middleware for Express
  - Write round-trip tests (sign → verify)

2.2 HttpFederationClient:
  - Implement HttpFederationClient in packages/federation/src/http/http-federation-client.ts
    (makes signed HTTP calls using signRequest + DidWebResolver)
  - Update Container to use HttpFederationClient when INSTANCE_ROLE !== 'standalone'

2.3 Federation API endpoints:
  - POST /api/v1/federation/membership/request
  - POST /api/v1/federation/membership/approve
  - GET  /api/v1/federation/entity/:did
  - POST /api/v1/federation/hub/register
  - POST /api/v1/federation/hub/notify
  - All endpoints use requireFederationAuth middleware
  - These are the "receiving side" of HttpFederationClient calls

Ask me before proceeding to Phase 3.

### Phase 3: Permissions

3.1 Permission types:
  - Define Permission type and PERMISSIONS map in packages/common/src/permissions.ts
  - Define BUILT_IN_ROLES in packages/common/src/roles.ts
  - Create migration 020_role_definitions.ts (role_definition table)
  - Seed built-in roles when a cooperative is created

3.2 Permission middleware:
  - Implement hasPermission() and requirePermission() in apps/api/src/middleware/permissions.ts
  - Wire requirePermission() into all mutating route handlers
  - Test permission enforcement

Ask me before proceeding to Phase 4.

### Phase 4: Docker Compose Federation

4.1 Infrastructure files:
  - Create infrastructure/docker-compose.federation.yml (hub + coop-a + coop-b)
  - Create infrastructure/Dockerfile.dev (volume-mount friendly)
  - Create infrastructure/init-federation-dbs.sql
  - Add Makefile targets: dev, dev-federation, migrate-all, test-federation

4.2 Federation integration tests:
  - Test cross-instance membership flow (member on coop-a joins coop-b)
  - Test hub registration (coop-a registers with hub)
  - Test DID resolution across instances

### Phase 5: Public Discovery + UX

5.1 Public API: GET /api/v1/explore/cooperatives, GET /api/v1/explore/cooperatives/:handle
5.2 SvelteKit routes: /explore, /explore/:handle, /dashboard, /c/:handle/

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
- Use Vitest 4 for all tests
- Mock IFederationClient in unit tests (same as you'd mock IPdsService)
- Integration tests use LocalFederationClient (standalone mode)
- Federation tests use Docker Compose + HttpFederationClient

Start with Phase 0a (fix anomalous pins + pnpm update).
```

---

## Quick Reference: Which Phase to Start With

| If you're working on... | Start with... |
|------------------------|---------------|
| Fresh start | Phase 0 (dependency upgrades) |
| Core federation infrastructure | Phase 1 (did:web + IFederationClient) |
| Just permissions/roles | Phase 3 (independent of federation) |
| Just frontend/UX | Phase 5 (needs API endpoints from Phase 1) |
| Docker/CI setup | Phase 4 (needs working federation from Phase 1-2) |

## Key Files to Read First

Before implementing, have Claude Code read:
1. `ARCHITECTURE-V3.md` — the full architecture document (especially section 7 for upgrades)
2. `CLAUDE.md` — project conventions and constraints
3. `packages/federation/src/interfaces/pds-service.ts` — the pattern to follow
4. `apps/api/src/container.ts` — how DI works
5. `apps/api/src/services/network-service.ts` — the service to refactor first
