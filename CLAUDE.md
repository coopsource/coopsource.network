# CLAUDE.md — Co-op Source Network

Co-op Source Network is a federated cooperative governance platform on ATProtocol. Core principle — the **recursive cooperative model**: everything is an entity (person or cooperative); a network is just a cooperative whose members are other cooperatives. The same membership, governance, and agreement machinery works at every level. CSN is a design-first proof-of-concept — no users, no production deployment.

## Read these first (canonical)

- **[ARCHITECTURE-V12.md](./ARCHITECTURE-V12.md)** — the canonical spec (four layers, ten-plugin contract, five axes, current code state, phase map, watchlist). **When this file and ARCHITECTURE-V12.md disagree, ARCHITECTURE-V12.md wins.**
- **[docs/plans/2026-07-04-v12-program-plan.md](./docs/plans/2026-07-04-v12-program-plan.md)** — the active phased plan (Phase 0 done).
- **[docs/plans/2026-07-04-atproto-shared-spaces-research.md](./docs/plans/2026-07-04-atproto-shared-spaces-research.md)** — July 2026 ecosystem state behind V12.
- **[docs/plans/2026-07-05-v12-replan-after-code-deep-dive.md](./docs/plans/2026-07-05-v12-replan-after-code-deep-dive.md)** — July 5 code/proposal reconciliation and updated Phase 3 execution order.
- **[docs/plans/2026-07-04-v11-merge-review-findings.md](./docs/plans/2026-07-04-v11-merge-review-findings.md)** — tracked review findings feeding Phases 2–3.
- **[AGENTS.md](./AGENTS.md)** — PoC posture: no backwards-compat artifacts, no `FooV2` names in code; rename canonical types in place.

Prior architectures (V3–V11) are archived in `docs/archive/`. V12 supersedes them.

## Hard rules (imperative — load-bearing)

### Git

- All work on feature branches, never `main`. V12 naming: `feature/v12-phase-N-<desc>`.
- Merges to `main`: `--no-ff`, green `pnpm build && pnpm test` first, tag `v12-phase-N`. (Autonomous execution is authorized for the current program per the plan's decision log; outward-facing/published actions still need review.)
- Clean up merged branches.

### Architecture invariants

- **DIDs are authoritative.** Never use handles for security. Consult `did_rotation_history` on every DID-equality check.
- **Name the authorization axis** on every failure (OAuth / spaces / application / labels / service-auth). See `apps/api/src/routes/federation.ts` `/membership/approve` for the reference Axis-2 gate.
- **Fail closed** on partial/stale membership resolution; discard records from non-members.
- **Tier 2 data never on the public firehose.** Tier 3 (Germ) is optional — never a required path.
- **Don't bake the URI scheme or digest algorithm as constants** — go through helpers/ports (`SpaceRef`, `space-uri.ts`, `PermissionedRepoPort`). Current values (`at://…/space/…`, LtHash) are still substrate.
- **Don't put application logic in the protocol/arbiter layer** — it belongs in the `GovernancePluginSet` (Layer 3/4).
- Bilateral membership is retired; `memberConsent` is non-authoritative evidence. Writes go through `GroupMutationPort`.

### Schema & DB

- **Schema changes edit `packages/db/src/schema.ts` AND regenerate `packages/db/src/migrations/schema.sql`** (`pg_dump --schema-only --no-owner --no-privileges -T 'kysely_migration*' coopsource_dev | grep -v '^\\' > packages/db/src/migrations/schema.sql`). **Never create new migration files** — `0001_v11_baseline.ts` is the permanent bootstrap; archived incrementals in `.archive/` are not executed.
- PostgreSQL bigint returns string → use `Number()`. AT URI as PK for PDS tables, UUID for app tables. Cursor-based pagination everywhere.

### Frontend

- Svelte 5 runes only (`$state`/`$derived`/`$effect`/`$props`). `tailwindcss()` MUST precede `sveltekit()` in `vite.config.ts`.

## Stack (non-negotiable)

TypeScript strict (no `any`, no unsafe casts) · Express 5 (standard routes; `@atproto/xrpc-server` not used) · Kysely 0.28+/PostgreSQL 16 (not Prisma/Drizzle/TypeORM) · SvelteKit 2 + Svelte 5 · Vite 8 + `@sveltejs/vite-plugin-svelte` 7 · Tailwind 4 via `@tailwindcss/vite` · pnpm 10+/Turborepo · Vitest 4 · Zod 4 · Pino 10 · Node 24 LTS · ATProtocol only (no cross-protocol bridges).

Key upstream watch items: `@atproto/space` from `bluesky-social/atproto#5187` is not published as of 2026-07-05; `@atproto/oauth-scopes` current registry version is 0.5.3; `@atproto/pds` current registry version is 0.5.14. This repo does not directly depend on those three packages today, so verify before adding or bumping PDS/OAuth/space dependencies. Existing ATProto packages (`@atproto/api`, `@atproto/oauth-client-node`, `@atproto/sync`) should stay current. **Do not use** `@skyware/labeler` (archived; bootstrap-only), `vm2`, or Node's `vm` for sandboxing.

## Build commands

```bash
pnpm install                              # deps
pnpm build                                # all packages (turbo)
pnpm test                                 # all tests (federation suite needs Docker: docker compose -f infrastructure/docker-compose.yml up -d)
pnpm --filter @coopsource/api dev         # API :3001
pnpm --filter @coopsource/web dev         # Web :5173
pnpm --filter @coopsource/federation build   # after structural changes to federation
make setup                                # first-time local (Homebrew): services, DB, .env, migrate
make dev / make stop / make status / make db-reset
make test:all                             # full suite with real PDS (Docker; resets volumes)
```

## Current code state (one paragraph)

`main` holds the V11 substrate through the Phase 4 live-XRPC harness checkpoint: `packages/spaces-consumer` remains flag-gated behind `SPACES_CONSUMER_ENABLED`, and `PermissionedRepoPort` is the public watch/sync/verification boundary; the real space-enabled PDS exercise still requires external OAuth sessions and infrastructure. `packages/arbiter-client` still uses CSN-Postgres-backed `CsnDbGroupDirectoryPort`/`CsnDbGroupMutationPort` as the default arbiter stand-in. Phase 5 now has concrete `GovernanceView` and `CoopView` package/container registrations plus the ten-plugin composition; `governancePlugins` remains a compatibility alias for existing handlers. The container still has no `spacesConsumer` or `arbiterClient` object registration. Membership writes route through `GroupMutationPort`, and membership reads route through `MembershipReadModel` apart from documented low-level adapters. The application layer (~59 services, 68 routes, 88 web pages, 103 DB tables) survives from V9.

## When upstream isn't settled

ARCHITECTURE-V12 §12 lists what's committed vs open. When a phase gate depends on upstream resolution, surface it before proceeding. Acceptable: build behind interfaces with sketch impls; ship the CSN-internal model resembling the primitive; run against `bluesky-social/atproto#5187` understanding it will evolve. Two-week watchlist cadence (§12); next due 2026-07-18. Direct fetches of known endpoints first; search to discover new venues.
