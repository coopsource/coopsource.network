# CLAUDE.md - Co-op Source Network

## Project Overview

Co-op Source Network is a federated cooperative governance platform built on ATProtocol. The core design principle is the **recursive cooperative model**: everything is an entity (person or cooperative), and a network is just a cooperative whose members are other cooperatives. The same membership, governance, and agreement machinery works at every level.

This monorepo is deployed (in principle) to `coopsource.network`. CSN is a proof-of-concept project — no users, no production deployment, design-first posture.

**Active architecture: V11.**

- **[ARCHITECTURE-V11.md](./ARCHITECTURE-V11.md)** — canonical architectural specification (four-layer: Spaces → Arbiter → GovernanceView → CoopView)
- **[CLAUDE-CODE-PROMPT-V11.md](./CLAUDE-CODE-PROMPT-V11.md)** — operational implementation guide for Claude Code agents
- **`docs/plans/2026-05-08-csn-architectural-direction.md`** — research foundation behind V11's design decisions
- **`docs/plans/2026-05-11-csn-research-addendum.md`** — May 2026 ecosystem scan with two-week refresh cadence

V9 (the most recent shipped architecture) and V10 (designed April 16, 2026 but never implemented) are archived in `docs/archive/` alongside V3, V5, V6, V7, V8. **V11 supersedes both.** When this CLAUDE.md and ARCHITECTURE-V11.md disagree, ARCHITECTURE-V11.md wins.

## Working with Claude (Opus 4.7)

- Claude Opus 4.7 follows instructions literally. If a rule in this file is load-bearing, state it imperatively ("Never X", "All Y must Z") — do not soften with "please" or "try to".
- Default effort is `max` at session start. Override per-session with `/effort medium` for exploratory work or `/effort low` for trivial edits.
- Claude tends to reason more and call tools less often than on 4.6. Don't pad instructions with "use tools liberally" — if more tool use is needed, raise effort or state the specific operation explicitly.
- The 4.7 tokenizer produces ~1.35× more tokens than 4.6; monitor the statusline context percentage accordingly.
- Do not add scaffolding like "summarize progress after each tool call" — 4.7 generates better interim updates unprompted.

## Git Workflow

- **All work must be done on feature branches**, never directly on `main`.
- **Branch naming for V11 work**: `feature/v11-stage-N-<short-description>` (matches the nine stages in ARCHITECTURE-V11.md §16).
- **Never merge to `main` without explicit user approval.**
- **Clean up merged branches** after they've been merged to `main`.

## Critical Constraints (V11)

### Technology stack (non-negotiable)

- **TypeScript strict mode** — no `any`, no unsafe casts
- **Express 5** for backend (standard Express routes; `@atproto/xrpc-server` is NOT used in this codebase)
- **Kysely 0.28+** for database (PostgreSQL 16+). NOT Prisma, NOT Drizzle, NOT TypeORM
- **SvelteKit 2** with **Svelte 5** runes (`$state`, `$derived`, `$effect`, `$props`)
- **Vite 8** with **@sveltejs/vite-plugin-svelte 7**
- **Tailwind CSS 4** via `@tailwindcss/vite` — MUST come BEFORE `sveltekit()` in vite.config.ts
- **pnpm 10+** workspace with **Turborepo 2+**
- **Vitest 4** for all tests
- **Zod 4** for validation
- **ATProtocol only** for federation — no cross-protocol bridges
- **Node.js 24 LTS** runtime

### V11 design principles (non-negotiable)

- **DIDs are authoritative identifiers.** Never use handles for security decisions.
- **Cooperatives own their DIDs.** Rotation keys are held offline by cooperative governance; CSN holds the signing key only.
- **Authority is decomposed into distinct axes.** OAuth scope (Axis 1) governs app-to-user authority. Space membership (Axis 2) governs user-to-user authority. Application logic (Axis 3) governs user-to-action authority. Labels (Axis 4) and service-auth JWTs (Axis 5) are adjacent axes. At every write checkpoint, identify which axis applies and route failure modes correctly.
- **Group Directory / Arbiter spaces are the membership substrate.** The cooperative's `members` space is the single source of truth for membership. Role-spaces (`roles/board`, `roles/treasurer`, `roles/officers`, `classes/<slug>`, `roles/custom/<slug>`) carry role authority.
- **GovernanceView and CoopView are separate layers.** Generic governance primitives live in GovernanceView (`community.lexicon.governance.*`). Cooperative-specific concerns live in CoopView (`network.coopsource.*`). The ten-plugin set (ARCHITECTURE-V11.md §9) is the contract between them.
- **Records of authority live in PDS repos or arbiter-managed spaces.** PostgreSQL is a materialized projection cache for queries.
- **Tier 2 data NEVER touches the public firehose.** It lives in members' permissioned repos for the appropriate space.

### What V11 retires from V9/V10

These were V9/V10 patterns; they are **no longer in force**:

- **Bilateral membership.** `network.coopsource.org.membership` and `network.coopsource.org.memberApproval` lexicons retire. The `members` space replaces both.
- **`VisibilityRouter` and `private_record` six-tier ACL.** V10's design was never implemented. Per-space placement at write time replaces visibility routing.
- **RFC 9421 HTTP signatures.** Spaces with cross-arbiter space-as-member relationships subsume the closed-coop-to-closed-coop private exchange use case.
- **Custom labeler service.** Governance labels live under cooperative-controlled label policy; labeler spaces are an implementation convention when supported.
- **`IFederationClient`, `cooperative_link` table, federation outbox.** Retire in V11 Stage 8.
- **`LocalPdsService`, `LocalPlcClient`, `LocalFederationClient`.** Already retired by V6/V9; any residual references clean up in Stage 8.

### Schema management

- CSN is a PoC with no production data. **Schema changes go directly into `packages/db/src/schema.ts`** — do NOT create new migration files.
- Existing migration files are archived under `packages/db/src/migrations/.archive/`.

## Build Commands

```bash
# Install & develop
pnpm install                           # Install all dependencies
pnpm dev                               # Start all dev servers (Turborepo)
pnpm --filter @coopsource/api dev      # Start API only
pnpm --filter @coopsource/web dev      # Start frontend only

# Database
docker compose -f infrastructure/docker-compose.yml up -d  # Start PostgreSQL + Redis + Mailpit
pnpm --filter @coopsource/db migrate   # Run Kysely migrations (legacy migrations; schema lives in schema.ts)

# Build & test
pnpm build                             # Build all packages (turbo)
pnpm test                              # Run all tests with local PDS fallback
make test:all                          # Full test suite with real PDS (Docker required, resets volumes)

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

### Current state of the codebase

The application layer is complete: 594 source files, 75 pages, 60+ services, 100 database tables, 47 lexicons, 279 E2E tests. All V9 feature development (governance, agreements, legal, finance, operations, commerce, integrations, AI agents, alignment) is built and tested. V6 federation infrastructure (`AtprotoPdsService`, `PlcClient`, `MemberWriteProxy`, `OperatorWriteProxy`, relay/Tap firehose consumers) is in place.

**V11 is in early-stage implementation.** The application substance survives into V11; what changes is what it sits on. ARCHITECTURE-V11.md §15 details the migration plan from V9 to V11.

### The Four-Layer Architecture (V11)

```
Layer 4: CoopView          (network.coopsource.*)
  Cooperative-specific: Subchapter T, patronage, capital accounts,
  multi-stakeholder weighted voting, ICA principles, fiscal periods,
  1099-PATR, agreements, alignment, agents.

Layer 3: GovernanceView    (community.lexicon.governance.*)
  Generic governance: proposals, votes, deliberations, anchor records,
  transparency logs, role-state derivation. Co-designed for ecosystem use.

Layer 2: Arbiter           (Meri + Zicklag, Roomy team)
  Generic group/role/space management: community DIDs, admin/publish/label
  policy conventions, role-spaces, space-as-member-of-space recursion.

Layer 1: ATProto Spaces    (Holmgren, Bluesky protocol)
  Protocol primitives: permissioned repos, ats:// URIs, ECMH commit chains,
  pull-based sync, (DID, read|write) member lists, controlled DIDs.
```

When deciding where a feature belongs, push it down a layer if doing so doesn't dilute its general-ness. The test: would Roomy or another non-cooperative group app use this feature without modification?

### The Plugin Set is the Layer 3 / Layer 4 Contract

GovernanceView accepts a `GovernancePluginSet` (ten typed interfaces) at construction. CoopView provides cooperative-specific implementations. All async, returning `Promise<T>`. Inputs are plain values, not service handles. Defaults are no-ops. The plugin interfaces stay stable as upstream protocol details change — this is V11's most important insulation property.

| Field | Purpose |
|---|---|
| `voteWeight` | Compute per-voter vote weight (multi-stakeholder class, patronage share) |
| `eligibility` | Check whether a voter may vote on a proposal |
| `quorum` | Check quorum from collected votes |
| `actionAuthorizer` | Authorize a governance action (propose, amend, suspend, etc.) |
| `anchorSummary` | Build non-identifying public summary extensions for anchor records |
| `historicalState` | Read/record arbiter member-list snapshots at cadence boundaries |
| `patronageAllocator` | Compute per-member patronage allocations for a fiscal period |
| `surplusDistributor` | Compute qualified vs. non-qualified, cash vs. equity surplus distribution |
| `meetingMinutes` | Canonicalize deliberation threads into formal minutes |
| `delegateChains` | Resolve vote delegation chains for proposal voting |

Full type signatures in ARCHITECTURE-V11.md §9.

### Monorepo Layout

```
coopsource.network/
├── apps/
│   ├── api/                  # @coopsource/api — Express backend (AppView + API)
│   └── web/                  # @coopsource/web — SvelteKit frontend
├── packages/
│   ├── lexicons/             # @coopsource/lexicons — ATProto lexicon JSON + generated TS
│   ├── federation/           # @coopsource/federation — IPdsService, AtprotoPdsService,
│   │                         #   PlcClient, firehose decoder, HTTP signing
│   │                         #   (RFC 9421 + outbox retire in Stage 8)
│   ├── db/                   # @coopsource/db — Kysely schema + materialized projections
│   ├── common/               # @coopsource/common — Shared types, errors, validation
│   └── config/               # @coopsource/config — Shared tsconfig, eslint, prettier
│
│   # New V11 packages (added in stages):
│   ├── spaces-consumer/      # Stage 1: pull-based consumer over permissioned repos
│   ├── arbiter-client/       # Stage 2: XRPC wrapper around the Arbiter
│   ├── governance-view/      # Stage 6: Layer 3 generic governance
│   └── coop-view/            # Stage 7: Layer 4 cooperative-specific
│
├── infrastructure/           # Docker Compose for dev environments
├── docs/
│   ├── plans/                # Active research and architecture-direction docs
│   │   ├── 2026-05-08-csn-architectural-direction.md
│   │   └── 2026-05-11-csn-research-addendum.md
│   └── archive/              # Earlier architecture versions (V3, V5, V6, V7, V8, V9, V10)
├── scripts/
├── ARCHITECTURE-V11.md       # Active architectural specification
├── CLAUDE-CODE-PROMPT-V11.md # Operational implementation guide
├── CLAUDE.md                 # This file
├── turbo.json
└── pnpm-workspace.yaml
```

### Dependency Layers

```
Layer 1 — Foundation:  config → common → db → lexicons → federation
Layer 2 — V11 substrate: spaces-consumer, arbiter-client → governance-view → coop-view
Layer 3 — Core:        api (auth, entities, membership, governance, agreements, posts, ...)
Layer 4 — Frontend:    web (SvelteKit, design system)
```

### Key Library Versions

| Package | Target Version |
|---------|---------------|
| `express` | ^5.2 |
| `kysely` | ^0.28 |
| `svelte` | ^5.53 |
| `@sveltejs/kit` | ^2.53 |
| `vite` | ^8.0 |
| `@sveltejs/vite-plugin-svelte` | ^7.0 |
| `tailwindcss` | ^4.2 |
| `vitest` | ^4.0 |
| `zod` | ^4.3 |
| `pino` | ^10.3 |
| `typescript` | ^5.9 |
| `@atproto/api` | latest |
| `@atproto/oauth-client-node` | latest |
| `@atproto/oauth-scopes` | latest (watch version bumps for granular scope support) |
| `@atproto/pds` | 0.4.212+ |
| `@atproto/sync` | latest |
| `stripe` | latest |
| `pnpm` | 10.30+ |
| `Node.js` | 24 LTS |

**Do not use**: `@skyware/labeler` (archived Feb 2026; acceptable only for one-time DID bootstrapping); `vm2` (unfixable CVEs); Node's built-in `vm` module for sandboxing (insecure).

## The Recursive Cooperative Model

This is the central design principle. Everything is an entity: `person` or `cooperative`. A network is just a cooperative whose members happen to be other cooperatives. No special type needed.

```
Person -> Cooperative:       Alice is a member of Acme Tech Co-op
Cooperative -> Network:      Acme Tech Co-op is a member of Co-op Source Network
Person -> Network (direct):  Dave is a member of Co-op Source Network directly
```

Same machinery at every level:
- **Proposal**: An entity creates a record; eligible voters cast votes
- **Agreement**: Entities co-sign a record; each signature lives with the signer
- **Project**: A cooperative entity with its own membership (projects are mini-co-ops)

Under V11, the recursive model gets a protocol-level expression: a network of cooperatives is an arbiter whose `members` space contains other cooperative DIDs. Cross-cooperative trust is expressed by including one cooperative's `members` space as a member of another cooperative's space. The recursion is free, not invented.

## V11 Federation Architecture

Cooperatives are genuine ATProto accounts with their own DIDs. Members bring their own ATProto identities. Public governance records flow through the relay firehose alongside Bluesky posts, Tangled commits, Smoke Signal RSVPs, and WhiteWind blog entries. **Private governance records live in members' permissioned repos** for the appropriate cooperative space, synced via pull-based notifications from the cooperative's arbiter.

### Identity

| Environment | DID Method | Notes |
|-------------|-----------|-------|
| Production | `did:plc` (controlled DID under cooperative's arbiter) | Cooperatives own rotation keys offline |
| Local dev | `did:web` | Resolved via `/.well-known/did.json`, works with `localhost:PORT` |

Cooperatives use domain-as-handle (e.g., `@mycoop.coop`). Members use their existing ATProto identities.

**DID rotation aliasing**: V11 introduces `did_rotation_history` table; all DID-comparing code consults it. When a `did:plc` rotates, references to the old DID resolve transparently to the new one.

### Membership via Group Directory / Arbiter Spaces (replaces bilateral membership)

V9's bilateral membership pattern retires. The cooperative's `members` space is the single source of truth. Membership operations go through the Arbiter's XRPC API.

```
Member joins:
  1. Member authenticates via OAuth, consents to be added to the cooperative's space
  2. Authorized group-policy operator adds member to cooperative's `members`
     space through the Group Mutation / Arbiter boundary
  3. Spaces consumer observes the direct/resolved membership change
  4. PostgreSQL `membership` table is updated as projection cache
  5. Member can now write into space-permissioned repos
```

Roles live as separate spaces under the cooperative DID, distinguished by `spaceKey`:

| Role | Space key |
|---|---|
| Active member roster | `members` |
| Board | `roles/board` |
| Treasurer | `roles/treasurer` |
| Probationary | `roles/probationary` |
| Worker class | `classes/worker` |
| Custom roles | `roles/custom/<slug>` |

`SpaceRef = { arbiterDid: DID, spaceKey: string, expectedSpaceType?: NSID }` — independent of URI scheme decisions.

### The Three-Tier Data Model (V11 reframing)

**Tier 1 (Public ATProto)**: Cooperative profiles, public proposals, vote tallies, ratified agreements. In the cooperative's public repo or supported publish-space convention.

**Tier 2 (Permissioned-space records)**: Closed deliberations, draft proposals, private votes, confidential agreements, private member directories, financial records. In members' **permissioned repos** for the appropriate space (`members`, `officers`, `board`). Access enforced at the protocol level by arbiter membership. **No more `private_record` table as authoritative storage** — it may persist as projection cache during transition or retire entirely.

**Tier 3 (E2EE)**: Board confidential discussions, salary records, personnel matters. Via Germ DM / MLS. Platform never handles content. **Treat Tier 3 as optional secondary channel only** — Germ DM is iOS-only via App Clip as of May 2026; governance flows must not require Tier 3 until cross-platform substrate exists.

### Lexicon Namespace

| Namespace | Layer | Notes |
|-----------|-------|-------|
| `community.lexicon.governance.*` | Layer 3 (new in V11) | Proposed to Lexicon Community in parallel |
| `network.coopsource.org.*` | Layer 4 | Cooperatives, teams, member classes (NOT `membership`/`memberApproval` — those retire) |
| `network.coopsource.governance.*` | Layer 4 | CSN-specific wrappers around community lexicons |
| `network.coopsource.agreement.*` | Layer 4 | Agreements, signatures, amendments |
| `network.coopsource.legal.*` | Layer 4 | Foundational documents, meeting records |
| `network.coopsource.admin.*` | Layer 4 | Officers, compliance, notices, fiscal periods |
| `network.coopsource.finance.*` | Layer 4 | Patronage config/records/allocations, capital accounts, 1099-PATR |
| `network.coopsource.funding.*` | Layer 4 | Campaigns, pledges |
| `network.coopsource.alignment.*` | Layer 4 | Interests, outcomes |
| `network.coopsource.onboarding.*` | Layer 4 | Probation, training, milestones |

### Instance Roles

Controlled by `INSTANCE_ROLE` env var:

| Mode | What it runs | Use case |
|------|-------------|----------|
| `standalone` | API + AppView + consumers in one process, one DB | Development, demos |
| `hub` | Network directory, cross-coop AppView | coopsource.network in production |
| `coop` | Single co-op's API, PDS, local AppView | Individual co-op server |

## ATProtocol Patterns (V11)

### Three axes of authorization at every checkpoint

At every write checkpoint, **OAuth scope (Axis 1)** and **resolved group-directory membership (Axis 2)** are both checked, by different services. **Application logic (Axis 3)** is the cooperative-specific layer that gates governance actions (eligibility, quorum, weighted voting). Labels (Axis 4) and service-auth JWTs (Axis 5) are adjacent axes.

When authorization fails, return errors that **name the axis** — that distinction is the difference between debuggable and tangled.

```typescript
async function castVote(actor: DID, proposal: ProposalRef): Promise<Result<void, VoteError>> {
  // Axis 1: OAuth scope (handled by oauth middleware before this function)
  // Axis 2: resolved space membership
  const resolution = await groupDirectory.resolveSpaceMembers({
    arbiterDid: coop,
    spaceKey: 'members',
    expectedSpaceType: 'network.coopsource.org.spaceType.members',
    resolverDepth: 4,
  });
  if (!resolution.ok || resolution.partial || resolution.stale || resolution.missingSpaces.length > 0) {
    return err({ kind: 'membership_unresolved', axis: 'spaces' });
  }
  const inSpace = resolution.members.some((member) => member.did === actor);
  if (!inSpace) return err({ kind: 'not_member', axis: 'spaces' });
  // Axis 3: application eligibility
  const eligible = await plugins.eligibility.checkEligibility({ ... });
  if (!eligible.ok) return err({ kind: 'not_eligible', axis: 'application', reason: eligible.reason });
  // Axis 4: labels
  const labels = await labelService.labelsFor(actor);
  if (labels.has('member-suspended')) return err({ kind: 'suspended', axis: 'labels' });
  // ... proceed
}
```

### The OAuth-spaces seam

A space declares which apps are permitted to operate on it (per Diary 4). An OAuth client gets a token from the user's PDS, but writes to a space's permissioned repo are only accepted if the space's app policy allows that client. **CSN's design is agnostic** about the specific mechanism (`permissions:{nsid}` scopes vs. service-auth JWTs vs. space-policy lookups) — the integration point is the same regardless. Code distinguishes all three failure modes: "OAuth scope not granted," "user not in space," "app not authorized for this space."

### Spaces consumer indexing

V11 sync is **pull-based**, not firehose-based. The spaces consumer subscribes to write notifications from each arbiter the cooperative is connected to. The notification is a lightweight "this space changed" event; the consumer then pulls the changed records from the relevant member PDS, cross-checks against the arbiter's member list, verifies ECMH digests, and projects into PostgreSQL.

**Trust anchor**: records pulled from a member PDS are *claimed* until cross-checked against the space's authoritative member list. Records from DIDs not on the list are discarded.

Public records continue to flow through Tap (the existing firehose consumer) alongside the spaces consumer.

## Security Requirements

### AppView validation (every record)
1. Cryptographic verification of commit signature against DID document
2. Independent DID resolution — don't trust cached data for security decisions
3. Schema validation against lexicon
4. Authorization check — record authored by expected DID
5. Cross-check against resolved group-directory membership (records from non-members or partial resolution discarded)
6. Per-DID rate limiting
7. Reject implausible timestamps
8. Audit log every state transition with commit CID, rev, signature

### Identity security
- Cooperatives self-manage rotation keys offline, with higher priority than the PDS's signing key
- Monitor PLC directory for unexpected key rotations on all indexed cooperative DIDs
- All DID-comparing code consults `did_rotation_history`

### Space-credential management
- Space credentials are bearer tokens; treat as sensitive
- Short credential lifetimes (target: ≤ 1 hour; refresh on each batch)
- Least-privilege per-(cooperative, space) credentials — never a master credential
- Audit logging of credential issuance and use
- Rotation on member-list changes
- Lifecycle behind `SpaceCredentialStore` interface

### Cross-arbiter trust verification
- Service-auth JWTs signed by reading arbiter's DID
- Audience binding; short lifetimes
- Verified against DID document's signing key

### Replay protection in recursive cooperatives
1. Write signed by child arbiter's DID
2. Nonce or timestamp + freshness window
3. Child still a member of parent's `members` space at moment of write (the load-bearing mitigation against stale state from former member cooperatives)

### Data security
- Tier 2 data NEVER in public repos (would broadcast on firehose)
- Tier 3 data: only ciphertext on any server
- Tier 3 is **optional**, not required — current platform support is iOS-only

## Database

### Kysely Notes

- `Generated<T>` for auto-generated columns
- `ColumnType<S, I, U>` for different select/insert/update types
- **PostgreSQL bigint returns string** — use `Number()` conversion, not TypeScript cast
- **AT URI as PK for PDS tables; UUID for app tables** — don't mix
- **Cursor-based pagination everywhere**, not offset-based
- **Schema changes go into `packages/db/src/schema.ts`**, NOT new migration files (CSN is PoC, no production data; existing migrations archived under `.archive/`)

## API Routes

All under `/api/v1/`. 60+ route files covering: health, setup, auth, cooperatives, memberships, posts, proposals, agreements, networks, blobs, events (SSE), admin (officers, compliance, notices, fiscal periods), federation, legal (documents, meetings), finance (patronage, capital accounts, tax forms, expenses, revenue), operations (tasks, time tracking, schedules), commerce (listings, needs, procurement, shared resources, bookings), connectors, webhooks, reports, notifications, mentions, agents, alignment, onboarding, member classes, cooperative links, and AI providers/payments settings.

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

`apps/api/src/container.ts` instantiates 60+ services. The application-layer services survive into V11 unchanged. V11 adds the substrate consumers and layer wirings:

**Substrate (new in V11)**:
- `spacesConsumer` (Stage 1) — pull-based consumer over permissioned repos
- `arbiterClient` (Stage 2) — XRPC wrapper around the Arbiter
- `governanceView` (Stage 6) — Layer 3 facade composing generic governance primitives
- `coopView` (Stage 7) — Layer 4 facade registering cooperative-specific plugins

**Surviving from V9**:
- Infrastructure: `db`, `pdsService` (AtprotoPdsService when `PDS_URL` set), `blobStore`, `didResolver`, `clock`, `emailService`
- Core: `authService`, `entityService`, `membershipService` (rewired to read from spacesConsumer's projection), `postService`, `proposalService`, `agreementService`, `networkService`
- Legal/Admin: `legalDocumentService`, `meetingRecordService`, `officerRecordService`, `complianceCalendarService`, `memberNoticeService`, `fiscalPeriodService`
- Finance: `patronageService`, `capitalAccountService`, `tax1099Service`, `expenseService`, `revenueService`
- Operations: `taskService`, `timeTrackingService`, `scheduleService`
- Commerce: `commerceListingService`, `commerceNeedService`, `procurementService`, `sharedResourceService`, `intercoopAgreementService`
- Platform: `agentService`, `connectorRegistryService`, `eventBusService`, `webhookService`, `reportingService`, `dashboardService`, `mentionService`, `onboardingService`, `alignmentService`, `fundingService`, `connectionService`, `delegationVotingService`, `governanceFeedService`, `cooperativeLinkService` (retires in Stage 8), `memberClassService`, `starterPackService`, `collaborativeProjectService`
- OAuth: `oauthClient`, `memberWriteProxy`, `operatorWriteProxy` (the proxies survive as the OAuth surface; the bilateral state machine inside them retires)

**Retiring across V11 stages**:
- `visibilityRouter`, `privateRecordService` (ACL paths) — Stages 4–5
- `governanceLabeler` (custom labeler service) — Stage 3 (replaced by cooperative label policy / supported labeler convention)
- `IFederationClient`, RFC 9421 HTTP signature paths, federation outbox — Stage 8

## V11 Implementation Stages

Nine stages, sequenced logically (not by calendar). Full task lists in CLAUDE-CODE-PROMPT-V11.md and ARCHITECTURE-V11.md §16.

| Stage | Branch prefix | Gate |
|---|---|---|
| 1 | `feature/v11-stage-1-spaces-consumer` | None — safe to start now |
| 2 | `feature/v11-stage-2-arbiter-integration` | Arbiter XRPC reference impl |
| 3 | `feature/v11-stage-3-membership-roles` | Controlled-DID + URI decisions |
| 4 | `feature/v11-stage-4-governance-to-spaces` | Stage 3 + OAuth-spaces seam |
| 5 | `feature/v11-stage-5-personal-spaces` | Stage 4 |
| 6 | `feature/v11-stage-6-extract-governance-view` | None |
| 7 | `feature/v11-stage-7-coop-view` | Stage 6 |
| 8 | `feature/v11-stage-8-retire-federation` | Cleanup after 3–7 stabilize |
| 9 | (open-ended capabilities) | — |

## Pitfalls

1. **Don't use bilateral membership.** V9's `membership` + `memberApproval` pattern retires entirely. The cooperative's `members` space is the single source of truth.
2. **Don't six-tier ACL.** V10's `private_record` six-tier model was never implemented and should not be revived. Per-space placement replaces it.
3. **Don't bake `ats://` as a constant.** Upstream has not finalized the URI scheme. URI handling goes through helpers. The substrate is `SpaceRef = { arbiterDid: DID, spaceKey: string, expectedSpaceType?: NSID }`, not a URI string.
4. **Don't migrate `apps/api` onto HappyView's Lua + WASM model.** HappyView v2.5+ is a reference implementation for development and validation, not a substrate to migrate onto.
5. **Don't run a separate labeler service.** Governance labels live under cooperative-controlled label policy; labeler spaces are a convention only when the selected server supports them.
6. **Don't use `@skyware/labeler` as a runtime dependency.** Archived February 2026. Acceptable only for one-time DID bootstrapping if needed.
7. **Don't put application logic in the protocol layer.** The plugin set is what makes single-protocol-mechanism plus multiple-application-semantics work. Resist pushing cooperative-specific logic down into Arbiter or Spaces.
8. **Don't conflate axes.** OAuth scope, space membership, and application eligibility are distinct. At every checkpoint, identify which axis applies. When authorization fails, return errors that name the axis.
9. **Don't trust handles for security.** Handles are mutable; DIDs are persistent. All security decisions use DIDs.
10. **Don't skip the `did_rotation_history` lookup.** DID equality checks must consult the rotation history table.
11. **Don't trust records from non-members.** The spaces consumer cross-checks records against resolved group-directory membership before accepting them and fails closed on partial or stale resolution.
12. **Don't generate fake DIDs.** Use real `did:plc` via PlcClient.
13. **Don't put Tier 2 data in the public firehose.** Use permissioned repos for the appropriate space.
14. **Don't make Tier 3 (Germ DM) a required path** for governance flows until cross-platform E2EE substrate exists.
15. **Don't run our own relay yet, but plan for it.** Use `bsky.network` for V11 Stages 1–7. Running a cooperative-owned relay is real ecosystem infrastructure (independence from Bluesky PBC per Hof's POSIWID argument, member-owned, bandwidth efficiency for cooperative-focused subscribers, resilience against deplatforming) but it's a distraction from getting Spaces/Arbiter/GovernanceView/CoopView right. Revisit in Stage 9 — see ARCHITECTURE-V11.md §11.4. **Access-controlled relays don't exist** — relays are public-firehose infrastructure by protocol design; access control belongs at the space layer (private data) or the AppView layer (filtered cooperative-ecosystem feeds).
16. **Don't create new migration files.** CSN is a PoC with no production data; schema changes go into `packages/db/src/schema.ts`.
17. **Don't add fields to `community.lexicon.governance.*` lexicons unilaterally.** CSN's extensions wrap community lexicons; they do not modify them in place.
18. **Build federation package after structural changes:** `pnpm --filter @coopsource/federation build`.
19. **PostgreSQL bigint returns string.** Use `Number()` conversion.
20. **Tailwind CSS 4 plugin order:** `tailwindcss()` MUST come before `sveltekit()` in vite.config.ts.
21. **AT URI as PK for PDS tables; UUID for app tables.** Don't mix.
22. **Cursor-based pagination everywhere.** Not offset-based.
23. **Don't hedge in CLAUDE.md or memory files.** 4.7 reads instructions literally. "please" and "try to" are noise. State rules as imperatives.

## When upstream protocol details aren't settled

ARCHITECTURE-V11.md §17 lists what is committed; §18 lists what is still open. When a stage gate depends on upstream resolution, **surface the dependency to the user before proceeding**. Acceptable patterns: build behind interfaces with sketch implementations; ship the CSN-internal model that resembles the protocol primitive; run against the `bluesky-social/atproto` `permissioned-data` branch with the understanding that the branch will evolve.

## Ecosystem engagement

V11 is half code and half ecosystem participation. The architecture's quality depends on CSN being a present participant in upstream conversations (Bluesky Diaries, the Arbiter design with Meri and Zicklag, the Lexicon Community for `community.lexicon.governance.*`, the Private Data WG, opensocial.community / NorthSky / Habitat / Blacksky). If you encounter a question that should be settled in those venues, surface it; don't decide unilaterally in code.

Two-week refresh cadence on the ecosystem watchlist:
- `dholms.leaflet.pub` (Holmgren's diaries)
- `zicklag.leaflet.pub`, `meri.leaflet.pub` (Arbiter authors)
- `happyview.dev`, `tangled.org/gamesgamesgamesgames.games/happyview`
- `github.com/bluesky-social/atproto/compare/permissioned-data`
- `discourse.atprotocol.community` Private Data WG
- `@atproto/oauth-scopes` npm version
- `blog.muni.town` (Roomy roadmap)

Direct URL fetches of known endpoints, not search-driven discovery.

## Troubleshooting

- Tailwind styles not applying → Check vite plugin order
- CORS errors in dev → API allows `http://localhost:5173` in dev
- Session cookies not sent → `sameSite: 'lax'`, both on localhost
- Federation build errors → `pnpm --filter @coopsource/federation build` before API
- Spaces consumer not receiving notifications → check `SpaceCredentialStore` cache, verify arbiter notification subscription, fall back to periodic full-resync
- ECMH digest mismatch → consumer triggers full-repo resync; if persistent, investigate the originating PDS
- Authorization failure with unclear axis → check that the failing service returns errors naming Axis 1/2/3/4/5 explicitly
