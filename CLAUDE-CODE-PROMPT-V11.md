# CLAUDE-CODE-PROMPT-V11.md — Implementation Guide for Co-op Source Network

> **For**: Claude Code / Claude agents working on the Co-op Source Network codebase
> **Architecture reference**: ARCHITECTURE-V11.md (primary), `docs/plans/2026-05-08-csn-architectural-direction.md` (deep rationale), `docs/plans/2026-05-11-csn-research-addendum.md` (May ecosystem scan)
> **Date**: May 11, 2026
> **Updated**: May 22, 2026 — aligned with draft `town.muni.arbiter.*` lexicons and V11 Stage 2D memberConsent work
> **Status**: Active — V11 implementation in early stages

---

## Your Role

You are implementing the Co-op Source Network V11 — a federated cooperative governance platform built on ATProto's permissioned-spaces primitives. The project is transitioning from V9 (shipped, ATProto-native with workarounds for absent protocol primitives) to V11 (ATProto-native using primitives that landed in early 2026). V10 was designed (April 16, 2026) but never implemented; it is archived. The codebase is a working monorepo with 594 source files, 47 lexicons, 100 database tables, 60+ services, and 75 frontend pages.

**Your primary reference is `ARCHITECTURE-V11.md`.** Read it thoroughly before making any architectural decisions. When the architecture document conflicts with anything else (including this prompt), the architecture document wins. For deep rationale on *why* V11 makes the choices it does, the direction document at `docs/plans/2026-05-08-csn-architectural-direction.md` is the research foundation.

**Default working posture**: V11 is in early-stage implementation. Many upstream protocol details (URI scheme finalization, OAuth-spaces seam, controlled-DID API surface) are still in flux. When you encounter a decision that depends on upstream resolution, surface the dependency rather than guessing. The architecture document's §17 lists what is committed; §18 lists what is still open.

**PoC velocity rule**: CSN has never been in production and has no external production contract. Do not preserve old code shapes through version-suffixed artifacts or parallel old/new APIs. Replace canonical names and types in place. Use `SpaceRef` with the current semantics and update callers directly when that shape changes.

---

## Critical Constraints (Non-Negotiable)

These technology choices and design principles cannot be changed without explicit user approval and an architecture document update.

### Technology Stack

- **TypeScript strict mode** — no `any`, no unsafe casts
- **Express 5** — `@atproto/xrpc-server` is NOT used in this codebase
- **Kysely 0.28+** — not Prisma, not Drizzle, not TypeORM
- **PostgreSQL 16+**
- **SvelteKit 2** with **Svelte 5 runes** (`$state`, `$derived`, `$effect`, `$props`)
- **Vite 8** with **@sveltejs/vite-plugin-svelte 7**
- **Tailwind CSS 4** via `@tailwindcss/vite` — MUST come BEFORE `sveltekit()` in vite.config.ts
- **pnpm 10+** workspace with **Turborepo 2+**
- **Vitest 4** for all tests
- **Zod 4** for validation
- **Node.js 24 LTS** runtime
- **ATProtocol only** for federation — no cross-protocol bridges

### V11 Design Principles

- **DIDs are authoritative identifiers** — never use handles for security decisions.
- **Cooperatives own their DIDs.** Rotation keys held offline by cooperative governance; CSN holds signing key only.
- **Authority is decomposed into distinct axes** — OAuth, spaces, application logic, labels, service-auth — not flattened into a single ACL. At every write checkpoint, identify which axes apply and route failure modes correctly.
- **Group Directory / Arbiter spaces are the membership substrate.** The cooperative's `members` space is the single source of truth for membership. Role-spaces (`roles/board`, `roles/treasurer`, `roles/officers`, member classes) carry role authority. The generic directory answers *who is who*; mutation authorization and access policy are implementation-specific.
- **GovernanceView and CoopView are separate layers.** Generic governance primitives live in GovernanceView (`community.lexicon.governance.*`). Cooperative-specific concerns live in CoopView (`network.coopsource.*`). The plugin set (§9 of arch doc) is the contract between them.
- **Records of authority live in PDS repos or arbiter-managed spaces** — PostgreSQL is a materialized projection cache for queries.
- **Tier 2 data NEVER touches the public firehose.** It lives in members' permissioned repos for the appropriate space.
- **No bilateral membership.** The bilateral membership pattern from V9 (`network.coopsource.org.membership` + `network.coopsource.org.memberApproval`) retires entirely. Both lexicons retire.
- **No `VisibilityRouter`, no `private_record` six-tier ACL.** The V10 design that deepened these workarounds was never implemented. Per-space placement at write time replaces visibility routing.
- **No custom labeler service.** Governance labels live under cooperative-controlled Arbiter/community-repo policy. `$labeler` is a preferred implementation convention when supported; CSN does not run a separate labeler DID.
- **No RFC 9421 HTTP signatures.** Spaces with cross-arbiter space-as-member relationships subsume the closed-coop-to-closed-coop private exchange use case.
- **No baking `ats://` as a constant.** Upstream has not finalized the URI scheme. URI handling goes through helpers. Group-directory APIs use `SpaceRef = { arbiterDid: DID, spaceKey: string, expectedSpaceType?: NSID }`. Replace older triple-field space identity code paths in place.
- **No founder-DID-rooted cooperatives.** Cooperatives are minted with their own DIDs at provisioning; never accumulate state under a personal DID.

### Git Workflow

- **All work on feature branches** — never commit directly to `main`.
- **Never merge to `main` without explicit user approval.**
- **Branch naming**: `feature/v11-stage-N-<short-description>` (e.g., `feature/v11-stage-1-spaces-consumer`).
- **Clean up merged branches** after merge.

---

## Architecture Overview

### The V9 → V11 Transition

V9 built a working cooperative platform on ATProto using three workarounds: bilateral membership records, a `VisibilityRouter` with three storage tiers (Tier 1 public, Tier 2 PostgreSQL, Tier 3 E2EE), and custom federation primitives (`cooperative_link`, RFC 9421 HTTP signatures). These were necessary because ATProto lacked group semantics, permissioned data, and cross-organization identity at the time. The protocol gaps closed in early 2026.

V11 replaces the workarounds with the protocol primitives now available:

- **Permissioned spaces** (Holmgren's permissioned-data work, Diaries 1–5) replace `private_record`.
- **The Arbiter pattern** (Meri and Zicklag's group-management service, April 2026) replaces bilateral membership.
- **GovernanceView/CoopView layered architecture** replaces ad-hoc inline cooperative logic in `apps/api`.

What stays from V9: 60+ application services, the SvelteKit frontend (75 pages), the OAuth client, the AppView hook pipeline (lifted into GovernanceView), the lexicon-driven indexer dispatch, the recursive cooperative model, AI agent framework, Stripe integration, ~30 `network.coopsource.*` lexicons.

### The Four-Layer Architecture

```
Layer 4: CoopView          (network.coopsource.*)
Layer 3: GovernanceView    (community.lexicon.governance.*)
Layer 2: Group Directory / Arbiter (Meri + Zicklag, Roomy team)
Layer 1: Spaces            (Holmgren, Bluesky protocol)
```

When deciding where a feature belongs, push it down a layer if doing so doesn't dilute its general-ness. The test for "doesn't dilute": would Roomy or another non-cooperative group app use this feature without modification? If yes, it belongs in Layer 3 or lower.

### The Three Axes of Authority

At every write checkpoint, both OAuth scope (Axis 1) and space membership (Axis 2) are checked, by different services, with different failure modes. Application logic (Axis 3) is the cooperative-specific layer that gates governance actions — eligibility, quorum, delegation, weighted voting. Labels (Axis 4) and service-auth JWTs (Axis 5) are adjacent axes. **Distinguish failure modes by axis** — that distinction is the difference between a debuggable system and V9's tangled one.

### The Plugin Set is the Layer 3 / Layer 4 Contract

GovernanceView accepts a `GovernancePluginSet` (ten typed interfaces) at construction. CoopView provides cooperative-specific implementations; GovernanceView calls them at well-defined points. The plugin set is the most important insulation property V11 has: if upstream protocol details change, only GovernanceView's internals change; plugin interfaces stay stable; CoopView is unaffected.

Plugin interfaces (full type signatures in ARCHITECTURE-V11.md §9):

| Field on `GovernancePluginSet` | Interface |
|---|---|
| `voteWeight` | `VoteWeightCalculator.calculateWeight()` |
| `eligibility` | `ProposalEligibilityChecker.checkEligibility()` |
| `quorum` | `QuorumChecker.checkQuorum()` |
| `actionAuthorizer` | `ActionAuthorizer.authorize()` |
| `anchorSummary` | `AnchorSummaryBuilder.buildExtensions()` |
| `historicalState` | `HistoricalStateReader.readAt()` / `recordSnapshot()` |
| `patronageAllocator` | `PatronageAllocator.allocate()` |
| `surplusDistributor` | `SurplusDistributor.distribute()` |
| `meetingMinutes` | `MeetingMinutesCanonicalizer.canonicalize()` |
| `delegateChains` | `DelegateChainResolver.resolveChains()` |

All async, all returning `Promise<T>`. Inputs are plain values (DIDs, refs, snapshots), not service handles — plugins do not call back into GovernanceView. Defaults are no-ops, not errors (a Roomy deployment with no plugins gets a working one-member-one-vote system out of the box). `SpaceRef = { arbiterDid: DID, spaceKey: string, expectedSpaceType?: NSID }` — independent of URI scheme decisions. Refactor older triple-field space identity code paths to the canonical shape.

---

## Implementation Stages

V11 follows the nine stages from ARCHITECTURE-V11.md §16. **No schedule. Work proceeds when the design is right.** The sequencing below is logical order of dependencies, not a calendar. Each stage has a branch, gates that must clear before starting, and tasks.

### Stage 1 — Spaces Consumer

**Branch**: `feature/v11-stage-1-spaces-consumer`
**Gate**: None; safe to start now against sketch implementation.

**Tasks**:
1. Build `packages/spaces-consumer/` package — pull-based consumer over permissioned repos.
2. Implement fail-closed sketch adapters for credentials, Group Directory membership, sync, and verification.
3. Keep public package APIs capability-shaped (`GroupDirectoryPort`, `GroupMutationPort`, `PermissionedRepoPort`) rather than protocol-mechanism-shaped where possible.
4. Preserve direct and resolved membership separately; cache resolver depth, source metadata, snapshot time, and `missingSpaces`.
5. Keep cursors opaque; do not expose per-member rev ordering assumptions outside sketch implementations.
6. Use structured permissioned record locations or a distinct permissioned URI type; do not reuse `AtUri` for permissioned-space data.
7. Wire into `apps/api/src/container.ts` as a new consumer alongside existing Tap (public firehose).
8. Either consume from a HappyView v2.5+ instance running alongside as a reference, OR implement directly against the `bluesky-social/atproto` `permissioned-data` branch once protocol details are stable.

**Key files to create**:
- `packages/spaces-consumer/src/index.ts`
- `packages/spaces-consumer/src/credential-store.ts`
- `packages/spaces-consumer/src/permissioned-repo-port.ts`
- `packages/spaces-consumer/src/group-directory-port.ts`
- `apps/api/src/appview/spaces-consumer-dispatch.ts`

**Key files to reference**:
- `apps/api/src/appview/tap-consumer.ts` — analogous pattern for public firehose
- `docs/plans/2026-05-17-v11-spaces-consumer-adapter-architecture.md` — stable-port adapter policy

**Progress (2026-05-17):** Stage 1 substrate has been reshaped behind stable ports on `codex/v11-atproto-alignment-planning`. Package `@coopsource/spaces-consumer` now exposes `GroupDirectoryPort` for direct/resolved membership authority and `PermissionedRepoPort` for watch/sync/verify/checkpoint. The old mechanism sketches (`ArbiterMemberList`, `NotificationSubscriber`, `RepoPuller`, `EcmhVerifier`) remain source-level scaffolding but are not package-root exports. apps/api wires the dispatch behind `SPACES_CONSUMER_ENABLED=false`; when enabled it uses the CSN-backed `CsnDbGroupDirectoryPort` from `@coopsource/arbiter-client`, fail-closed permissioned verification, and `UNSAFE_ACCEPT_UNVERIFIED_PERMISSIONED_DATA=true` as the local-only unsafe dev opt-in. API dispatch tests cover disabled startup, production rejection of unsafe mode, enabled health, and stop/reset behavior. Repo-local ESLint flat-config wiring is present. Real upstream Arbiter and permissioned-data implementations land once protocol details settle.

### Stage 2 — Group Directory / Arbiter Integration

**Branch**: `feature/v11-stage-2-arbiter-integration`
**Gate**: Draft group-directory adapter usable behind ports. The `town.muni.arbiter.*` namespace remains draft and must not leak as a permanent CSN API commitment.

**Tasks**:
1. Build/extend `packages/arbiter-client/` around stable CSN ports. Stage 2A uses a temporary CSN-backed adapter; later Stage 2 adds a thin draft-lexicon adapter.
2. Split cooperative DID provisioning from `createArbiter`: mint/adopt DID first, bind `#space_host`, then call `createArbiter({ arbiterDid, config })` with an open-union config object.
3. Implement `GroupDirectoryPort`: `listSpaces`, `getSpaceConfig`, `getDirectSpaceMembers`, `resolveSpaceMembers`.
4. Implement `GroupMutationPort`: `createSpace`, `deleteSpace`, `setSpaceConfig`, `setSpaceMemberAccess`, `removeSpaceMember`.
5. Model arbiter config, space config, and member access as `UnknownLexiconObject` plus typed CSN validators.
6. Map draft errors into CSN errors: `ErrPermissionDenied`, `ErrRaceCondition`, `ErrUnsupportedConfigLexicon`, `ErrInvalidConfig`, `ErrSpaceNotExists`, `ErrArbiterNotExists`, `ErrMemberNotInSpace`.
7. Keep admin, publish, labeler, and old eight-level Arbiter access vocabulary as implementation conventions, not generic API assumptions.
8. Keep `CsnDbGroupDirectoryPort` / `CsnDbGroupMutationPort` as temporary CSN-backed adapters only; update their public types in place as the canonical model changes.

**Contribution thread**: while Stage 2 is in progress, write the Arbiter cooperative use case document (Leaflet post or Discourse reply for Meri and Zicklag's preferred venue) — see ARCHITECTURE-V11.md §18. Explicitly test `spaceKey` identity vs `spaceType` metadata, direct vs resolved members, partial remote resolution, open-union config/access payloads, and governance-outcome attestations as policy inputs.

**Progress (2026-05-17):** Stage 2A started with `@coopsource/arbiter-client`. It exports `membersSpace()`, `roleSpace()`, and `CsnDbGroupDirectoryPort`, a temporary `GroupDirectoryPort` adapter over CSN `membership` and `membership_role` tables. Role and class spaces use canonical `spaceKey` conventions: `members`, `roles/<slug>`, `roles/custom/<slug>`, and `classes/<slug>`. Because CSN is a PoC, the public API should be updated in place to `SpaceRef = { arbiterDid, spaceKey, expectedSpaceType? }`; do not retain legacy triple-key shapes as a parallel old/new API surface.

**Progress (2026-05-18):** Stage 2B/2C adds `GroupMutationPort` and `CsnDbGroupMutationPort`. The mutation port covers placeholder cooperative provisioning, role-space validation, add/remove member, add/remove role member, exact role replacement, and temporary audit reads while preserving CSN command context (`actorDid`, reason, audit metadata, governance outcome ref, and consent evidence). The CSN-backed implementation writes `membership` and `membership_role` in transactions and writes changed commands to `fact_log` with `entity_type = 'v11.groupMutation'`. `MembershipService` writes, setup bootstrap, public invitation acceptance, `AuthService.register`, federation membership approval, and network join/leave now use this mutation boundary. Migrated paths stop creating cooperative-owned V9 `memberApproval` records, and appview hooks no longer treat `memberApproval` as active authority.

**Progress (2026-05-19):** Stage 2D replaces temporary member-authored `network.coopsource.org.membership` evidence with `network.coopsource.org.memberConsent`. Setup bootstrap, registration, public invitation acceptance, network join, and federation membership request surfaces now speak consent evidence terminology. Federation membership requests carry caller-supplied consent evidence instead of fabricating member-owned records on the receiving instance. `GroupMutationPort` accepts `consentRecordUri` / `consentRecordCid` and still stores them in the existing projection columns until Stage 3. The appview `memberConsent` hook only attaches or clears evidence on an existing command-created membership row; it never creates active authority.

**Progress (2026-05-22):** Stage 2D hardening is implemented: public `memberConsent` no longer has free-text `message`, federation request/approval paths verify consent evidence by AT URI authority DID, collection, CID, cooperative DID, allowed `consentType`, and plausible `createdAt`, and appview delete/update handling clears evidence only when stored URI and CID match the invalidated record.

**Stage 2D hardening required before merge:** verify federation-supplied consent evidence before storing it; deletion/update hooks must clear evidence only when the stored URI/CID matches the deleted or invalidated record; orphan `memberConsent` records must never create membership rows; public `memberConsent` records should avoid free-text private payloads.

### Stage 3 — Membership and Roles to Spaces

**Branch**: `feature/v11-stage-3-membership-roles`
**Gates**: GroupDirectoryPort and GroupMutationPort usable through either the temporary CSN-backed adapter or draft Arbiter adapter; cooperative DID provisioning path exists for real deployments; role graph resolution semantics implemented (depth, partial resolution, cycle rejection). URI-scheme finalization is not a Stage 3 gate.

**Tasks**:
1. Migrate `MembershipService` to read from group-directory `members` space state (via Stage 1 consumer + Stage 2 client).
2. Preserve direct and resolved member state separately; fail closed on `missingSpaces` for governance-critical operations unless an explicit cooperative policy allows degraded resolution.
3. Migrate role authority from `membership_role` table + `role_definition.permissions` to role-space membership.
4. Use `spaceKey` conventions: `members`, `roles/board`, `roles/treasurer`, `roles/officers`, `classes/worker`, `classes/consumer`, `roles/custom/<slug>`.
5. Retire active references to `network.coopsource.org.membership` and `network.coopsource.org.memberApproval`; keep them only as archived V9 concepts.
6. Retire bilateral membership state machine.
7. Add `did_rotation_history` table; update DID-comparing code to consult it.
8. Keep `membership` table schema for projection cache (don't modify column shape yet); `member_record_uri` / `member_record_cid` store `memberConsent` evidence temporarily, and approval evidence columns are historical V9 data.

**Until upstream APIs stabilize**: build a CSN-internal model that resembles spaces but commits only to stable port shapes. Express the model behind the canonical `SpaceRef` and `SpaceMemberRef` names so wire-format choices land in one place. If the shape changes, update those names in place.

### Stage 4 — Governance to Spaces

**Branch**: `feature/v11-stage-4-governance-to-spaces`
**Gate**: Stage 3 done + OAuth-spaces seam (`permissions:{nsid}` scopes vs service-auth JWTs vs space-policy lookups) settled + permissioned-record URI/commit verification details sufficient for adapter implementation.

**Tasks**:
1. Migrate public proposals to the cooperative's public repo, or to a supported `$publish` convention when the selected Arbiter/policy server provides one.
2. Migrate private proposals, votes, deliberations to permissioned repos in the appropriate space (`members` / `roles/officers` / `roles/board`).
3. Retire `VisibilityRouter`; replace with per-space placement at write time.
4. Lift V10.4 anchor + sidecar pattern into GovernanceView.
5. Lift V10.5 transparency log pattern into GovernanceView.
6. Migrate `governance_visibility` enum to per-space placement.

### Stage 5 — Personal Spaces

**Branch**: `feature/v11-stage-5-personal-spaces`
**Gate**: Stage 4 done.

**Tasks**:
1. Provision per-(coop, member) personal spaces at cooperative-join time.
2. Keep cooperative finance ledgers canonical in cooperative-owned finance/officer spaces or records.
3. Write member-visible projections and delivery artifacts (1099-PATR copies, statements, patronage notices, contact data) to personal spaces.
4. Implement `individual_strict` (owner only) and `individual` (owner + financial officers) access tiers via space member list composition.
5. Cost optimization deliberately deferred per arch doc §17.

### Stage 6 — Extract GovernanceView

**Branch**: `feature/v11-stage-6-extract-governance-view`
**Gate**: Not blocked on Lexicon Community ratification.

**Tasks**:
1. Pull generic governance code out of `apps/api` into `packages/governance-view/`.
2. Define `GovernancePluginSet` interface and ten plugin interfaces (per arch doc §9).
3. Make GovernanceView standalone-deployable (binary + library shapes from same code).
4. Publish lexicons under `community.lexicon.governance.*`.
5. Open Lexicon Community Discussion thread in parallel.
6. Build conformance test suite for plugin contracts.

**Lexicons to create** (under `community.lexicon.governance.*`):
- `proposal`
- `vote`
- `deliberation`
- `summary` (anchor records)
- `logHead` (transparency-log signed tree heads)
- `election`

### Stage 7 — Codify CoopView

**Branch**: `feature/v11-stage-7-coop-view`
**Gate**: Stage 6 done.

**Tasks**:
1. Pull cooperative-specific code into `packages/coop-view/`.
2. Implement the ten plugin interfaces from GovernanceView for cooperative semantics.
3. Register CoopView's hooks at priority bands 100–199 (leaving 0–99 for GovernanceView's builtins).
4. Keep lexicons under `network.coopsource.*`.
5. Create CSN-specific sidecar lexicons that reference canonical community lexicons by strong ref (`network.coopsource.governance.proposalContext` references `community.lexicon.governance.proposal`).

### Stage 8 — Retire V8/V9 Federation Primitives

**Branch**: `feature/v11-stage-8-retire-federation`
**Gate**: None; pure cleanup after Stages 3–7 stabilize.

**Tasks**:
1. Remove `IFederationClient` interface and all implementations.
2. Remove RFC 9421 HTTP signature code paths.
3. Remove federation outbox tables and processor.
4. Remove `cooperative_link` table.
5. Remove `private-record-service.ts` ACL paths; either repurpose the data path as projection cache or retire the table entirely.
6. Remove `LocalPdsService`, `LocalPlcClient`, `LocalFederationClient` (already retired in V6/V9 — final cleanup of any residual references).
7. Remove custom labeler service (cooperative-controlled label policy replaces it; `$labeler` is only a convention when the selected server supports it).

### Stage 9 — Future Capabilities

Open-ended capability development on the V11 substrate: recursive cooperative networks, trust networks, cross-cooperative role delegation, multi-stakeholder governance refinements, lifecycle events (merge/split/dissolution), personal portability, credential issuance.

---

## Security Requirements

Implement these throughout all stages. New threats specific to V11 are noted.

### AppView Validation (Every Record)

1. Cryptographic verification of commit signature against DID document.
2. Independent DID resolution — don't trust cached data for security decisions.
3. Schema validation against lexicon.
4. Authorization check (record authored by expected DID).
5. Cross-check against group-directory direct/resolved member state (records from non-members discarded; partial remote resolution fails closed for governance-critical actions).
6. Per-DID rate limiting.
7. Reject implausible timestamps.
8. Audit log every state transition with commit CID, rev, signature.
9. For `memberConsent` evidence, verify that the AT-URI authority DID matches the expected author, the collection is `network.coopsource.org.memberConsent`, the record CID matches when supplied, `record.cooperative` matches the target cooperative/network, `consentType` is allowed for the flow, and `createdAt` is plausible. Delete/update hooks clear evidence only when the stored URI/CID matches the invalidated record.

### Identity Security

- Cooperatives self-manage rotation keys offline, with higher priority than the PDS's signing key.
- Monitor PLC directory for unexpected key rotations on all indexed cooperative DIDs.
- All DID-comparing code consults `did_rotation_history` table.

### Space-Credential Management

Space credentials are bearer tokens. Treat as sensitive:

- Short credential lifetimes (target: ≤ 1 hour; refresh on each batch).
- Least-privilege per-(cooperative, space) credentials — never a master credential.
- Audit logging of credential issuance and use.
- Rotation on member-list changes.
- Lifecycle behind `SpaceCredentialStore` interface; specific credential format may evolve.

### Cross-Arbiter Trust Verification

When cooperative A reads from cooperative B's `members` space:
- A's arbiter DID is on B's allowlist.
- A presents a service-auth JWT signed by A's DID's signing key.
- B verifies signature against A's DID document.
- JWT has short lifetime + audience binding.

### Replay Protection in Recursive Cooperatives

When a child cooperative's officer change triggers writes in the parent cooperative's space:
1. Write is signed by the child's arbiter DID.
2. Write hasn't been seen before (nonce or timestamp + freshness window).
3. Child is still a member of the parent's `members` space at the moment of write (the load-bearing mitigation against stale state from former member cooperatives).

### Group-Resolution Safety

- Resolver-depth limits on every direct/resolved member query and every mutation that consults remote membership.
- Cycle detection and DAG enforcement for CSN-managed role graphs.
- Explicit `complete` / `partial` / `failed` resolution status in projections.
- Fail closed on `missingSpaces` for governance-critical actions unless a cooperative policy explicitly allows degraded resolution.
- Retain source arbiter DID, `spaceKey`, resolver depth, snapshot time, and missing remote spaces for audit.

### Data Security

- Tier 2 data NEVER stored in public repos.
- Tier 3 (E2EE) data: only ciphertext on any server.
- Batch public record updates to reduce timing correlation.

### Tier 3 Caveat

Germ DM is currently iOS-only via App Clip. Until cross-platform E2EE substrate exists, **production governance flows must not require Tier 3**. Tier 3 is an *optional secondary channel*, surfaced when available, never mandatory.

---

## Testing Strategy

### Unit Tests

- Every service method has unit tests.
- Every plugin implementation has tests for the contract behaviors GovernanceView's conformance suite expects.
- Every indexer has tests for member-list cross-check failure modes, direct-vs-resolved semantics, stale deletes, and partial remote resolution.
- Every authorization-axis-check has tests for each failure mode (Axis 1 fail, Axis 2 fail, Axis 3 fail, Axis 4 fail, Axis 5 fail).
- Use `MockClock` for time-dependent tests.

### Integration Tests

- Full membership flow via group directory / arbiter (add to space, observe via consumer, project to `membership` table).
- OAuth-spaces seam: write succeeds when both axes clear; write fails with correct error when either axis denies.
- Permissioned repo verification: deliberately corrupt a record or commit state in the adapter; verify resync triggers and recovers.
- Cross-arbiter trust: A reads B's member list with valid service-auth; rejected with forged JWT; partial remote resolution returns `missingSpaces` and fails closed for governance-critical actions.
- GovernanceView conformance suite (Stage 6+): run against CoopView's plugin implementations.

### E2E Tests

- Complete member journey: discover → join (added to `probationary` space) → train → buy-in → promote (moved to `members` space) → vote → review.
- Cooperative provisioning: create arbiter → mint controlled DID → set domain handle → deploy PDS → publish public profile.
- Recursive cooperative: cooperative A's `members` space includes cooperative B's `members` space; verify B's members can vote on A's proposals.

### V9 Smoke Tests

- V9's integration-test fixtures re-run against V11 substrate as smoke tests — they validate that surviving services (60–70% of suite) still work after the substrate change.

---

## Common Patterns

### Writing to a Member's Permissioned Repo (via OAuth + Space)

```typescript
// Both axes must pass: member has granted CSN the relevant OAuth/space-auth grant
// AND member is in the space. Exact permissioned-space write XRPC is upstream-pending.
const session = await oauthClient.restore(memberDid);
const agent = new AtpAgent(session);

// Capability-shaped write — concrete adapter method follows upstream protocol.
await permissionedRepoPort.createRecord({
  space: { arbiterDid: cooperativeDid, spaceKey: 'members', expectedSpaceType: 'network.coopsource.org.spaceType.members' },
  authorDid: memberDid,
  collection: 'community.lexicon.governance.vote',
  record: { $type: 'community.lexicon.governance.vote', /* ... */ },
  session,
});

// Failure modes to distinguish:
// - OAuthError / SpaceGrantError: member hasn't granted the needed auth (Axis 1)
// - SpaceNotMemberError: member not in the space's member list (Axis 2)
// - SpaceAppPolicyError: space disallows this OAuth client (OAuth-spaces seam)
```

### Mutating Cooperative Group Membership

```typescript
// Operator or governance outcome has authority under the selected Arbiter/policy server.
// `$admin` and concrete access lexicons are implementation conventions, not generic-port assumptions.
await groupMutation.setSpaceMemberAccess({
  space: { arbiterDid: cooperativeDid, spaceKey: 'members', expectedSpaceType: 'network.coopsource.org.spaceType.members' },
  member: { kind: 'did', did: newMemberDid },
  access: { $type: 'network.coopsource.arbiter.memberAccess.basic', role: 'member' },
  resolverDepth: 4,
  actorDid: operatorDid,  // implementation-specific audit context
});
```

### Reading from the Arbiter Member List

```typescript
// Always go through the SpacesConsumer's cached projection unless strict consistency required.
const members = await db
  .selectFrom('membership')
  .where('cooperative_did', '=', cooperativeDid)
  .where('status', '=', 'active')
  .execute();

// For strict consistency, read through to arbiter:
const direct = await groupDirectory.getDirectSpaceMembers({ space: spaceRef });
const resolved = await groupDirectory.resolveSpaceMembers({ ...spaceRef, resolverDepth: 4 });
if (resolved.status !== 'complete') throw new Error('membership resolution incomplete');
```

### Adding a New Plugin (CoopView extension)

```typescript
// packages/coop-view/src/plugins/multi-stakeholder-vote-weight.ts
import type { VoteWeightCalculator } from '@coopsource/governance-view';

export class MultiStakeholderVoteWeight implements VoteWeightCalculator {
  constructor(private memberClassService: MemberClassService) {}

  async calculateWeight(args) {
    const memberClass = await this.memberClassService.classOf(args.voterDid, args.cooperativeDid);
    const proposalConfig = await this.memberClassService.proposalConfig(args.proposalRef);
    return proposalConfig.weightForClass(memberClass);
  }
}

// packages/coop-view/src/wiring.ts — register with GovernanceView
const governanceView = new GovernanceView({
  plugins: {
    voteWeight: new MultiStakeholderVoteWeight(memberClassService),
    // ... other nine plugins
  }
});
```

### Adding a New Lexicon

1. **Generic governance lexicon**: create JSON schema in `packages/lexicons/src/lexicons/community/lexicon/governance/`.
2. **Cooperative-specific lexicon**: create in `packages/lexicons/src/lexicons/network/coopsource/`.
3. **Extending a community lexicon**: prefer canonical `community.lexicon.governance.*` records plus `network.coopsource.*` sidecar records by strong ref. Wrapping a generic object inside `network.coopsource.*` is acceptable only for CSN-private workflows where generic ecosystem indexing is not a goal.
4. Run `pnpm --filter @coopsource/lexicons lex:generate`.
5. Add indexer in `packages/governance-view/src/indexers/` (generic) or `packages/coop-view/src/indexers/` (cooperative-specific).
6. Register with the consumer dispatch.
7. Add service methods, API routes, frontend routes.

### Distinguishing Authorization Failures

```typescript
async function castVote(actor: DID, proposal: ProposalRef): Promise<Result<void, VoteError>> {
  // Axis 1: OAuth scope check (handled by oauth middleware before reaching this function)

  // Axis 2: space membership
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

  // Axis 3: application eligibility (plugin)
  const eligible = await plugins.eligibility.checkEligibility({ voterDid: actor, proposalRef: proposal, cooperativeDid: coop });
  if (!eligible.ok) return err({ kind: 'not_eligible', axis: 'application', reason: eligible.reason });

  // Axis 4: labels
  const labels = await labelService.labelsFor(actor);
  if (labels.has('member-suspended')) return err({ kind: 'suspended', axis: 'labels' });

  // ... proceed
}
```

---

## Key Dependencies and Versions

| Package | Version | Purpose |
|---------|---------|---------|
| `@atproto/api` | latest | ATProto XRPC client |
| `@atproto/oauth-client-node` | latest | OAuth with DPoP |
| `@atproto/oauth-scopes` | latest (watch version bumps) | Granular OAuth scopes |
| `@atproto/pds` | 0.4.212+ | Self-hosted PDS |
| `@atproto/sync` | latest | Firehose consumption, MST verification |
| `express` | ^5.2 | HTTP server |
| `kysely` | ^0.28 | Database |
| `svelte` | ^5.53 | Frontend framework |
| `@sveltejs/kit` | ^2.53 | Frontend meta-framework |
| `vite` | ^8 | Build tool |
| `@sveltejs/vite-plugin-svelte` | ^7 | Vite integration |
| `tailwindcss` | ^4.2 | CSS |
| `vitest` | ^4.0 | Testing |
| `zod` | ^4.3 | Validation |
| `pino` | ^10.3 | Logging |
| `typescript` | ^5.9 | Language |
| `stripe` | latest | Payments |

**Not used**: `@skyware/labeler` (archived February 2026); vm2 (unfixable CVEs); Node's built-in `vm` module for sandboxing (insecure).

---

## Pitfalls to Avoid

1. **Don't use bilateral membership.** V9's `membership` + `memberApproval` pattern retires entirely. The cooperative's `members` space is the single source of truth. `memberConsent` is evidence only.

1a. **Don't assume space identity is `(arbiter, type, skey)`.** The current draft group lexicons operate on `arbiterDid + spaceKey`; `spaceType` is metadata/config. Use the canonical `SpaceRef` shape in active APIs and refactor old call sites in place.

1b. **Don't create versioned code artifacts for PoC refactors.** CSN has no production migration surface. Do not introduce version-suffixed aliases or parallel old/new APIs to preserve obsolete shapes. Replace the canonical type, schema, adapter, and call sites in place.

1c. **Don't hard-code the older eight Arbiter access levels as the generic wire model.** Member access is an open-union object. `$admin`, `$publish`, and `$labeler` are implementation conventions unless the selected server supports them.

1d. **Don't treat direct members and resolved members as equivalent.** Direct members may be DIDs, local spaces, or remote spaces; resolved members are flattened DIDs and may be partial due to `missingSpaces`.

1e. **Don't assume `createArbiter` mints a DID.** Provision/adopt the DID and bind `#space_host` first; then call `createArbiter` with an open-union config.

2. **Don't six-tier ACL.** V10's `private_record` six-tier model was never implemented and should not be revived. Per-space placement replaces it.

3. **Don't bake `ats://` as a constant.** Upstream has not finalized the URI scheme. URI handling goes through helpers. The substrate is `SpaceRef`, not a URI string.

3a. **Don't use `AtUri` for permissioned-space records.** `at://` is the public repository URI scheme. Use structured permissioned locations or a distinct permissioned URI type until upstream finalizes the scheme.

4. **Don't migrate `apps/api` onto HappyView's Lua + WASM model.** HappyView v2.5+ is a reference implementation for development and validation, not a substrate to migrate 14k+ lines of cooperative TypeScript onto.

5. **Don't run a separate labeler service.** Governance labels live under cooperative-controlled Arbiter/community-repo policy. `$labeler` is a convention when supported; CSN does not run a labeler DID.

6. **Don't use `@skyware/labeler` as a runtime dependency.** Archived February 2026. Acceptable only for one-time DID bootstrapping if needed.

7. **Don't put application logic in the protocol layer.** The plugin set (Layer 3/4 boundary) is what makes single-protocol-mechanism + multiple-application-semantics work. Resist the temptation to push cooperative-specific logic down into Arbiter or Spaces.

8. **Don't conflate axes.** OAuth scope, space membership, and application eligibility are distinct. At every checkpoint, identify which axis applies. When authorization fails, return errors that name the axis.

9. **Don't trust handles for security.** Handles are mutable; DIDs are persistent. All security decisions use DIDs.

10. **Don't skip the `did_rotation_history` lookup.** DID equality checks must consult the rotation history table.

11. **Don't trust records from non-members.** The spaces consumer cross-checks records against group-directory resolved membership before accepting them, and fails closed on partial resolution for governance-critical actions.

12. **Don't generate fake DIDs.** Use real `did:plc` via PlcClient.

13. **Don't put Tier 2 data in the public firehose.** Use permissioned repos for the appropriate space.

14. **Don't make Tier 3 (Germ DM) a required path** for governance flows until cross-platform E2EE substrate exists. iOS-only via App Clip as of May 2026.

15. **Don't run our own relay yet, but plan for it.** Use `bsky.network` for V11 Stages 1–7. Running a cooperative-owned relay is real ecosystem infrastructure (independence from Bluesky PBC per Hof's POSIWID argument, member-owned, bandwidth efficiency for cooperative-focused subscribers, resilience against deplatforming) but it's a distraction from getting Spaces/Arbiter/GovernanceView/CoopView right. Revisit in Stage 9 — see ARCHITECTURE-V11.md §11.4. **Access-controlled relays don't exist** — relays are public-firehose infrastructure by protocol design; access control belongs at the space layer (private data) or the AppView layer (filtered cooperative-ecosystem feeds).

16. **Don't migrate to a new database migration file** for V11 schema changes. CSN is a PoC with no production data; schema changes go directly into `packages/db/src/schema.ts`. Existing migration files are archived under `packages/db/src/migrations/.archive/`.

17. **Don't build federation package after every change.** Watch for changes that affect generated outputs and rebuild then: `pnpm --filter @coopsource/federation build`.

18. **PostgreSQL bigint returns string** — use `Number()` conversion.

19. **Tailwind plugin order** — `@tailwindcss/vite` MUST come BEFORE `sveltekit()` in vite.config.ts.

20. **Cursor-based pagination everywhere** — not offset-based.

21. **Don't add fields to `community.lexicon.governance.*` lexicons without going through the Discussion thread.** CSN's extensions use sidecar records by strong ref; they do not modify community lexicons in place.

22. **Don't assume the OAuth-spaces seam.** Whether it lands as `permissions:{nsid}` scopes, service-auth JWTs issued by the space owner, or space-policy lookups at write time, the integration point is the same. Code distinguishes the three failure modes regardless of how the seam ends up wired.

---

## Quick Reference: File Locations

```
apps/api/src/
├── container.ts                       # DI container — wire GovernanceView, CoopView, consumers
├── config.ts                          # Zod-validated config — add new env vars here
├── index.ts                           # Express app setup
├── appview/
│   ├── tap-consumer.ts                # Public firehose consumer (unchanged from V9)
│   ├── spaces-consumer-dispatch.ts    # (new) Spaces consumer dispatch
│   └── indexers/                      # Collection-specific indexers
├── auth/
│   ├── oauth-client.ts                # ATProto OAuth — extended with granular scopes
│   └── oauth-stores.ts                # PostgreSQL session/state stores
├── services/                          # Application services (60+)
├── routes/                            # API routes
├── middleware/                        # Auth, error handling
├── scripting/                         # Per-cooperative runtime extensibility (unchanged)
├── payment/                           # Stripe integration (unchanged)
└── ai/                                # Agent framework, MCP client (unchanged)

packages/governance-view/              # (new in Stage 6) Layer 3
├── src/
│   ├── index.ts                       # Public API
│   ├── plugins/types.ts               # Ten plugin interfaces
│   ├── plugins/defaults.ts            # No-op plugin defaults
│   ├── indexers/                      # Generic governance indexers
│   ├── lexicons/                      # community.lexicon.governance.*
│   └── conformance/                   # Conformance test suite

packages/coop-view/                    # (new in Stage 7) Layer 4
├── src/
│   ├── index.ts                       # Public API
│   ├── plugins/                       # CoopView's ten plugin implementations
│   ├── indexers/                      # Cooperative-specific indexers
│   └── lexicons/                      # network.coopsource.* (CSN-specific)

packages/spaces-consumer/              # (new in Stage 1)
├── src/
│   ├── index.ts
│   ├── credential-store.ts
│   ├── ecmh-verifier.ts
│   └── notification-subscriber.ts

packages/arbiter-client/               # (new in Stage 2)
└── src/
    ├── index.ts                       # CSN ports + optional draft XRPC adapter
    └── types.ts                       # SpaceRef, SpaceMemberRef, DirectSpaceMember, ResolvedMembers, UnknownLexiconObject

packages/db/src/
├── schema.ts                          # Canonical schema (PoC; schema changes go here)
└── migrations/.archive/               # Old migrations (archived; no new files created)

packages/federation/                   # Mostly retired in Stage 8
└── (post-Stage 8: empty or stub for old imports)

packages/lexicons/                     # ATProto lexicon JSON schemas
├── src/lexicons/community/lexicon/governance/  # (new) GovernanceView lexicons
└── src/lexicons/network/coopsource/   # CSN-specific lexicons (~30)

packages/common/                       # Shared types, errors, validation
apps/web/                              # SvelteKit frontend (unchanged from V9)
infrastructure/                        # Docker Compose files
docs/
├── plans/
│   ├── 2026-05-08-csn-architectural-direction.md   # V11 research foundation
│   └── 2026-05-11-csn-research-addendum.md          # May ecosystem scan
└── archive/                           # Earlier architecture versions
    ├── ARCHITECTURE-V3.md
    ├── ARCHITECTURE-V5.md
    ├── ARCHITECTURE-V6.md
    ├── ARCHITECTURE-V7.md
    ├── ARCHITECTURE-V8.md
    ├── ARCHITECTURE-V9.md
    ├── ARCHITECTURE-V10.md
    ├── CLAUDE-CODE-PROMPT-V3.md
    ├── CLAUDE-CODE-PROMPT-V5.md
    ├── CLAUDE-CODE-PROMPT-V9.md
    └── CLAUDE-CODE-PROMPT-V10.md

ARCHITECTURE-V11.md                    # Active architecture spec
CLAUDE-CODE-PROMPT-V11.md              # (this file)
CLAUDE.md                              # Repo-level Claude guidance (V11-aligned as of May 2026)
```

---

## Working With This Codebase

### When to read which document

- **Question is "what does V11 architecturally do?"** → ARCHITECTURE-V11.md
- **Question is "why did V11 choose X over Y?"** → `docs/plans/2026-05-08-csn-architectural-direction.md`
- **Question is "what's the latest ecosystem state?"** → `docs/plans/2026-05-11-csn-research-addendum.md` (with two-week refresh cadence noted in §7)
- **Question is "what did V9 do?"** → `docs/archive/ARCHITECTURE-V9.md`
- **Question is "what was V10's never-shipped design?"** → `docs/archive/ARCHITECTURE-V10.md`
- **Question is "what is the existing code shape?"** → start at `apps/api/src/container.ts` and follow the wiring

### When upstream protocol details aren't settled

The architecture document's §17 lists what is committed; §18 lists what is still open. When a stage gate depends on upstream resolution, surface the dependency to the user before proceeding. Acceptable patterns: build behind interfaces with sketch implementations, ship the CSN-internal model that resembles the protocol primitive, run against the `bluesky-social/atproto` `permissioned-data` branch with the understanding that the branch will evolve.

### When CLAUDE.md disagrees with this prompt

`CLAUDE.md` is V11-aligned. If a discrepancy arises between `CLAUDE.md`, this prompt, and `ARCHITECTURE-V11.md`, `ARCHITECTURE-V11.md` wins. Surface conflicts to the user rather than reconciling unilaterally.

### Ecosystem engagement

V11 is half code and half ecosystem participation. The architecture's quality depends on CSN being a present participant in upstream conversations. The engagement plan in arch doc §18 lists the venues. **If you encounter a question that should be settled in those venues** (URI scheme, fine-grained ACL expansion, OAuth-spaces seam mechanism), surface it; don't decide unilaterally in code.

---

*This prompt provides the operational context for implementing V11. ARCHITECTURE-V11.md is the canonical specification; this prompt is the working guide. Ask the user before making any architectural decisions not covered by these documents.*
