# ARCHITECTURE-V12 — Co-op Source Network

**Status:** Active canonical specification. Supersedes ARCHITECTURE-V11.md + CLAUDE-CODE-PROMPT-V11.md (both archived in `docs/archive/`). When CLAUDE.md and this document disagree, **this document wins**.

**Updated:** 2026-07-11. Grounded in `docs/plans/2026-07-04-atproto-shared-spaces-research.md` plus the July 5 code/proposal reconciliation in `docs/plans/2026-07-05-v12-replan-after-code-deep-dive.md`. Current code audit target: `feature/v12-phase-5-governance-command-boundaries` after the Phase 4 live-XRPC harness checkpoint.

V12 is a **documentation-and-alignment revision, not a design pivot.** The four-layer architecture, the ten-plugin contract, the authority axes, and the recursive cooperative model are all carried from V11 unchanged. What changed is the upstream reality V11 was betting on — and the bet aged well.

---

## 1. Δ from V11 — what moved, what held

**Upstream changes since the V11 docs froze (May 22, 2026):**

| Area                     | V11 assumption (May)           | V12 reality (July)                                                                                                                          | Impact                                                                                                                             |
| ------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Permissioned data status | Sketch proposal + diaries      | **Proposal 0016 merged** into `bluesky-social/proposals`; impl PR `atproto#5187` is a 74-commit draft (`@atproto/space` pkg, PDS endpoints) | Substrate has a real spec + reference to target                                                                                    |
| URI scheme               | "probably `ats://`" (70–80%)   | **`at://` reused** with a `/space/` segment: `at://{spaceDid}/space/{spaceType}/{skey}/{authorDid}/{collection}/{rkey}`                     | Pitfall held: scheme was never baked → helper-only change                                                                          |
| Commit digest            | ECMH                           | **LtHash** (lattice-based, quantum-secure)                                                                                                  | Verification belongs inside the `PermissionedRepoPort` sync boundary; a concrete adapter may add an internal LtHash verifier later |
| OAuth-spaces seam        | Open (~50%, the one real risk) | **Three-token credential flow** (delegation token → client attestation → space credential) + client allow/deny lists (Diary 6, June 5)      | Seam now known-but-unshipped; maps 1:1 to our three failure modes                                                                  |
| Arbiter                  | "two weeks old"                | **16 draft `town.muni.arbiter.*` lexicons** (`resolveSpaceMembers`, `createDid`, …) + Rego policy prototype + WASM simulator                | Wire contract to converge on; identity/authorization split                                                                         |
| Community modeling       | (implicit)                     | Holmgren (June 2): **many typed spaces under one community DID**, against "universal spaces"                                                | Directly validates our role-space design                                                                                           |
| OAuth scopes             | shipping                       | **Shipped + normative** (`repo:`/`rpc:`/`blob:`/`account:`/`identity:`/`include:`); permission sets are lexicons anyone can publish         | Axis 1 rests on documented protocol surface                                                                                        |
| HappyView                | experimental behind flag       | **2.10 (June 30)**: `com.atproto.space.*`/`com.atproto.simplespace.*`, LtHash, `listRepoOps`, `registerNotify`/`notifyWrite`                | Candidate dev/test harness (build-vs-use §10)                                                                                      |

**What did NOT change (carried from V11):** the four layers; the ten-plugin `GovernancePluginSet`; the five authority axes; the recursive cooperative model; the three data tiers; fail-closed cross-checking; DIDs authoritative + `did_rotation_history` aliasing; Tier 3 optional (Germ still iOS-only). The May addendum's own forecast scored 7/9 (see the research report §III).

---

## 2. The four-layer architecture

```
Layer 4: CoopView        network.coopsource.*          cooperative-specific
Layer 3: GovernanceView  community.lexicon.governance.*  generic governance
Layer 2: Arbiter         town.muni.arbiter.* (draft)     group/role/space mgmt
Layer 1: Spaces          at://…/space/… (proposal 0016)  protocol primitives
```

**Placement rule:** push a feature down a layer unless doing so dilutes its generality. Test: _would Roomy (or another non-cooperative group app) use this unmodified?_ If yes, it belongs in Layer 3 or lower.

- **Layer 1 — Spaces** (Holmgren / Bluesky). A space is `(authority: DID, type: NSID, skey: string)`, where the type is a lexicon-resolved `"type": "space"` declaration and the protocol does **not** carry an application member roster. Space credentials are issued by policy above the protocol; CSN resolves membership through Layer 2. **Writes are enforced by readers** at the application layer. Sync is pull-based (oplog `listRepoOps` + CAR fallback), digest is LtHash. _"space authority" ≙ our `arbiterDid`._
- **Layer 2 — Arbiter** (Meri + Zicklag / Muni Town). Generic group/role/space management: community DID minting, member-list resolution, role-spaces, space-as-member-of-space recursion. Separates **identity/membership** ("who is in what group") from **authorization** ("who can do what", via uploadable Rego policy). CSN consumes it behind ports.
- **Layer 3 — GovernanceView** (`community.lexicon.governance.*`). Generic proposals, votes, deliberations, anchor records, transparency logs, role-state derivation. Co-designed for ecosystem reuse. Accepts a `GovernancePluginSet` (§6). Initial package/default interfaces exist; service extraction remains Phase 5.
- **Layer 4 — CoopView** (`network.coopsource.*`). Subchapter T, patronage, capital accounts, multi-stakeholder weighted voting, ICA principles, 1099-PATR, agreements, alignment, agents. Provides the plugin implementations. Initial package adapters exist; broad application-service rewrite remains Phase 5.

---

## 3. The five authority axes

At every write checkpoint, identify which axis applies and route failures so the error **names the axis** (the difference between debuggable and tangled):

1. **OAuth scope** (app→user) — the user's PDS granted the client the scope. Now: typed-prefix scopes + permission sets.
2. **Space membership** (user→user) — resolved group-directory membership; fail closed on partial/stale.
3. **Application logic** (user→action) — eligibility, quorum, weighted voting (the plugin set).
4. **Labels** — governance labels via cooperative-controlled policy (no separate labeler service).
5. **Service-auth JWTs** — cross-arbiter trust; audience-bound, short-lived, verified against the DID doc.

**The OAuth-spaces seam** (Axis 1 ↔ Axis 2) now has a concrete but unshipped shape: **delegation token** (minted by the user's PDS) → **client attestation** (signed by the app) → **space credential** (issued by the space authority), plus per-space client allow/deny lists. Proposal 0016 distinguishes `space:...#read` from `space:...#read_self`; only `read` can support full-space background sync. The three distinct failure modes map directly: _scope not granted_ (Axis 1) / _not in space_ (Axis 2) / _app not authorized for this space_ (client-policy). Code must keep them distinct.

_Reference implementation of the gate:_ see `apps/api/src/routes/federation.ts` `/membership/approve` — Axis 2 authority check (caller must be the coop DID or an active owner/admin) runs before any mutation and returns 403 naming `axis: 'spaces'`.

---

## 4. Arbiter integration — port ↔ lexicon mapping

CSN operates the Arbiter behind two ports so the wire contract can evolve. Today
both are backed by CSN's own Postgres (`Csn*` adapters). Phase 3 added a
non-default XRPC group-directory adapter against the current draft substrate
shape (`com.atproto.space.*` / `com.atproto.simplespace.*`) while keeping CSN-DB
as the runtime default. The longer-term `town.muni.arbiter.*` method
correspondence is already close:

| CSN port method                                       | Draft `town.muni.arbiter.*`          | Notes                          |
| ----------------------------------------------------- | ------------------------------------ | ------------------------------ |
| `GroupDirectoryPort.resolveSpaceMembers`              | `resolveSpaceMembers`                | verbatim name match            |
| `GroupDirectoryPort.listSpaces`                       | `listSpaces`                         |                                |
| `GroupDirectoryPort.getSpaceConfig`                   | `getSpaceConfig` / `getSpaceMembers` |                                |
| `GroupMutationPort.addMember` / `addRoleMember`       | `createSpace`/`setSpaceMemberAccess` | space-as-role model            |
| `GroupMutationPort.removeMember` / `removeRoleMember` | `removeSpaceMember`                  |                                |
| `DidProvisioningPort`                                 | `createDid` / `updateDidDoc`         | controlled-DID ops for Stage 3 |

The Arbiter's **identity-vs-authorization split** aligns with our axes: its membership layer answers Axis 2; its uploadable Rego policy is the arbiter's _server-side_ authorization, distinct from CSN's Axis-3 `GovernancePluginSet` which sits **above** the arbiter boundary. Do not push cooperative governance logic down into arbiter policy.

`SpaceRef = { arbiterDid: DID, spaceKey: string, expectedSpaceType?: NSID }` — URI-scheme-independent. Current CSN space types are constants in `packages/arbiter-client/src/space-ref.ts` (`membersSpace`, `roleSpace`, `MEMBERS_SPACE_TYPE`, …) with draft Proposal 0016 declarations under `packages/lexicons/network/coopsource/org/spaceType/` and typed exports from `@coopsource/lexicons`. The declarations stay outside generated record schemas for now because the installed atproto lex tooling rejects `"type": "space"`. Before real `space:` scopes are requested, Phase 4 must decide whether the current `network.coopsource.org.spaceType.*` namespace is the publication namespace or an internal draft to remap.

---

## 5. Spaces substrate (Layer 1 detail)

- **URI:** `at://{spaceDid}/space/{spaceType}/{skey}/{authorDid}/{collection}/{rkey}` — parse/emit only through helpers (`packages/spaces-consumer/src/space-uri.ts`, Phase 2). Still marked "likely to change" upstream; keep behind helpers.
- **Digest and sync verification:** LtHash is the proposal's current digest algorithm. In current code, digest/commit verification is folded into `PermissionedRepoPort.sync(...)`, which returns a `verification` status and fails closed through `FailClosedPermissionedRepoPort`. No package-root `CommitDigestVerifier` exists; a real adapter may introduce an internal LtHash verifier when `@atproto/space` or equivalent primitives become consumable.
- **Sync:** pull-based. The spaces consumer subscribes to arbiter write-notifications, pulls changed records from member PDSes, cross-checks each record's `authorDid` against the resolved member list, verifies the digest, and projects into Postgres. **Records from non-members are discarded; resolution that is partial or stale fails closed.** This reader-side enforcement is not a stopgap — it is _the_ write-enforcement mechanism per Diary 6.
- **Trust anchor:** pulled records are _claimed_ until cross-checked against the authoritative member list.
- **Current state:** flag-gated off (`SPACES_CONSUMER_ENABLED=false`), starts with `spaces:[]`, handlers log-only. The real notification/pull/verify loop lands in Phase 3.

---

## 6. GovernanceView & the ten-plugin `GovernancePluginSet`

**The single most important insulation property.** GovernanceView (Layer 3) accepts a `GovernancePluginSet` at construction; CoopView (Layer 4) provides cooperative-specific implementations. All async (`Promise<T>`), inputs are plain values (one-way call graph, no service handles), defaults are no-ops (so a plain group app gets one-member-one-vote free). The interfaces stay stable as upstream protocol details change.

| Field                | Purpose                                                                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `voteWeight`         | per-voter weight (multi-stakeholder class, patronage share)                                                                                    |
| `eligibility`        | may this voter vote on this proposal                                                                                                           |
| `quorum`             | quorum from collected votes                                                                                                                    |
| `actionAuthorizer`   | authorize a governance action (propose, amend, suspend…)                                                                                       |
| `anchorSummary`      | non-identifying public summary for anchor records                                                                                              |
| `historicalState`    | read/record arbiter member-list snapshots at cadence boundaries — **the only plugin GovernanceView writes to** (as-of-fiscal-period patronage) |
| `patronageAllocator` | per-member patronage allocation for a fiscal period                                                                                            |
| `surplusDistributor` | qualified vs non-qualified, cash vs equity distribution                                                                                        |
| `meetingMinutes`     | canonicalize deliberation threads into minutes                                                                                                 |
| `delegateChains`     | resolve vote-delegation chains                                                                                                                 |

Diary 6's deliberately minimal protocol auth (one member list, reader-enforced writes, no protocol roles) **confirms** this design: all cooperative governance semantics live in the plugin set, above the substrate. Phase 5 extracts the generic logic from `proposal-service`/`delegation-voting-service` into `packages/governance-view` and wires the CSN plugins from existing services (member classes → `voteWeight`; patronage service → `patronageAllocator`/`surplusDistributor`; meeting records → `meetingMinutes`).

---

## 7. CoopView (Layer 4)

Cooperative-specific concerns: Subchapter T patronage & capital accounts, multi-stakeholder weighted voting, ICA principles, fiscal periods, 1099-PATR, agreements/signatures/amendments, legal documents, alignment, onboarding, AI agents, commerce. The application substance already exists across ~59 `apps/api` services; Phase 5 codifies it as `packages/coop-view` registering plugin implementations. ATProto-native records are canonical for Subchapter T; Postgres is a projection cache.

---

## 8. Data tiers

- **Tier 1 (Public ATProto):** cooperative profiles, public proposals, vote tallies, ratified agreements. Public repo / publish-space.
- **Tier 2 (Permissioned-space):** closed deliberations, draft proposals, private votes, confidential agreements, private member directories, financials. Members' permissioned repos for the appropriate space. **Never on the public firehose.** No `private_record` as authoritative storage (it persists as a projection cache during transition; retires in Phase 6).
- **Tier 3 (E2EE):** board-confidential, salary, personnel. Germ DM / MLS. **Optional secondary channel only** — Germ is iOS-only (July 2026). Governance flows must not require Tier 3.

---

## 9. Security requirements

AppView validation for every record: (1) commit-signature verification against the DID doc; (2) independent DID resolution (never trust cache for security); (3) schema validation; (4) author == expected DID; (5) cross-check against resolved group-directory membership (discard non-members; fail closed on partial/stale); (6) per-DID rate limiting; (7) reject implausible timestamps; (8) audit every state transition with commit CID, rev, signature.

Identity: cooperatives self-manage rotation keys offline (higher priority than the PDS signing key, which CSN holds); monitor PLC for unexpected rotations; DID equality must resolve through `did_rotation_history` before any spaces consumer activation. The table exists today, but writer/reader plumbing is incomplete. Space credentials are bearer tokens — short lifetimes (≤1h, refresh per batch), least-privilege per-(coop, space), rotate on member-list changes, behind `SpaceCredentialStore`. Replay protection in recursive coops: signed write + freshness window + **child-still-a-member-at-write-time** check (the load-bearing mitigation against stale former-member state).

Digest algorithm is LtHash per proposal 0016; current public code exposes the verification outcome through `PermissionedRepoPort`, not a separate digest-verifier port.

---

## 10. Implementation playbook

### Current code state (audit of `feature/v12-phase-3-doc-reality-reconcile`, 2026-07-07)

| Layer            | Package                    | State                                                                                                                                                                                                                                                                    |
| ---------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 Spaces         | `packages/spaces-consumer` | Real skeleton, **flag-gated off**. `SpaceRef`, `SpacesConsumer`, `GroupDirectoryPort`, `SpaceCredentialStore` with Kysely-backed `space_credential` persistence, Kysely checkpoint store, tests. `PermissionedRepoPort` is the public watch/sync/verification boundary; in-memory and fail-closed repo ports are sketches. |
| 2 Arbiter        | `packages/arbiter-client`  | Real code, **CSN-Postgres-backed stand-in** for a real arbiter. `CsnDbGroupDirectoryPort`, `CsnDbGroupMutationPort`, `DidProvisioningPort`, `space-ref`, and non-default/mock-server-tested `XrpcGroupDirectoryPort`. Runtime default remains CSN-DB.                    |
| 3 GovernanceView | `packages/governance-view` | Concrete `GovernanceView` registration owns the generic tally/outcome facade and complete ten-plugin set; `ProposalService` consumes it. Phase 5 still owns further generic service extraction.                                                                            |
| 4 CoopView       | `packages/coop-view`       | Concrete `CoopView` registration composes CSN vote, eligibility, quorum, authorization, delegation, patronage, and distribution plugins with defaults for the remaining interfaces. Broad service rewrites remain Phase 5 work.                                            |

Membership: bilateral lexicons retired; `memberConsent` is non-authoritative evidence; **writes** route through `GroupMutationPort`; **reads** route through the API-layer `MembershipReadModel`, which composes strict `GroupDirectoryPort` authority checks with local projection data. Direct `membership`/`membership_role` access is limited to the read seam, mutation/projection writers, admin reset SQL, and low-level tests/helpers. Container exposes `groupMutations`, `groupDirectory`, `membershipReadModel`, consent evidence verification, and Phase 5 governance/coop-view adapters where already extracted; the consumer starts via `startSpacesConsumer` behind the flag.

DB: `packages/db/src/migrations/0001_v11_baseline.ts` + `schema.sql` is the **permanent bootstrap** (a `pg_dump` of the 63-migration archive chain + V11 tables). Schema changes edit `schema.ts` **and** regenerate `schema.sql`; no new migration files. Archived incrementals live in `.archive/` (not executed).

### Phase/stage map (see `docs/plans/2026-07-04-v12-program-plan.md`)

| Phase | Gate           | Content                                                                                                                                                               |
| ----- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 ✅  | done           | Repo cleanup, V11 merge, review fixes                                                                                                                                 |
| 1     | none           | Docs sweep, this doc, slim CLAUDE.md                                                                                                                                  |
| 2     | none           | Drift alignment: stale ECMH ports removed/folded into `PermissionedRepoPort`, URI helpers, dep checks, port↔lexicon JSDoc, review cleanup                             |
| 3     | soft           | Arbiter convergence + membership read seam design/migration + review carry-ins (suspension, lifecycle events, consent-overwrite, roster-`partial`, DID rotation gate) |
| 4     | Stage 3 + seam | Governance→spaces, credential seam, personal spaces                                                                                                                   |
| 5     | none           | GovernanceView + CoopView + the ten plugins (parallelizable with 3–4)                                                                                                 |
| 6     | 3–5 stable     | Retire V9 surface (visibilityRouter, privateRecordService, governanceLabeler, `private_record`, RFC 9421, HttpFederationClient, `local/*`)                            |
| 7     | 3–4 merged     | Full UX overhaul                                                                                                                                                      |

Branch naming: `feature/v12-phase-N-<desc>`. Merges to `main`: `--no-ff`, green build+tests first, tag `v12-phase-N`.

### Build-vs-use register

| Capability                                                       | Default                                                                  | Decide at     |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------- |
| AppView substrate (custom `apps/api` vs **HappyView 2.10+**)     | Build                                                                    | Phase 5 spike |
| Spaces dev/test harness (fixtures vs **HappyView 2.10**)         | Use                                                                      | Phase 3       |
| Spaces primitives (extend vs **`@atproto/space`** from PR #5187) | Use when published; as of 2026-07-05 it does not appear published on npm | each sweep    |
| Arbiter server (CSN-DB vs **Muni Town arbiter**)                 | Build interim, use when real                                             | Phase 3       |
| Axis-3 policy (TS plugin set vs Rego/OPA)                        | Build                                                                    | firm          |
| Tier 3 E2EE (Germ/MLS)                                           | Use, optional-only                                                       | parity news   |

---

## 11. Design commitments (committed)

Per-(coop, member) personal spaces; both V9 membership lexicons retire; binary `governance_visibility` retires; governance labels via cooperative-controlled policy (no separate labeler service); RFC 9421 retires; single custom AppView (HappyView reference only unless the Phase 5 spike says otherwise); the `community.lexicon.governance.*` namespace; cooperatives own DIDs (rotation keys offline, CSN holds signing key only); `did_rotation_history` aliasing; ATProto-native records canonical for Subchapter T; historical-state snapshots at cadence boundaries.

**Load-bearing (do not casually revisit):** the semantic distinction between permissioned and public URI resolution (the token is substrate); `(DID, read|write)` member-list minimality; cooperative DID distinct from any founder's personal DID. Everything else — URI scheme token, digest algorithm, sync wire format, exact permission-set spellings — is substrate behind ports and is _expected_ to drift.

---

## 12. Open questions & ecosystem watchlist

**Open (§17/§18 carried, updated):**

1. Full credential-seam mechanics — known shape (three tokens plus `space:` scopes), unshipped; firm up in Phase 4 against the proposal branch, HappyView 2.10, and `@atproto/space` if/when published. Local background-sync posture is decided: cooperative-designated managing session pool, no arbitrary member-session pooling, no `read_self` fallback for AppView sync.
2. Lexicon Community response to `community.lexicon.governance.*` — no governance namespace exists yet; the process is TSC-sponsored (gated, slow). Start sponsorship outreach early; Phase 5 does not wait on ratification.
3. Subchapter T legal-counsel consultation.
4. Arbiter hosting (user PDS vs per-app vs independent) — unresolved upstream (Holmgren June 2).
5. Cross-modality notification routing for community-router apps — unresolved upstream.
6. `$publish`/`$labeler` conventions — not formalized (arbiter uses open unions).
7. Diary 7 (sync protocol / "what an app does with a space credential") — promised; feeds Phase 4's gate.

**Watchlist (two-week cadence; next due 2026-07-18, IETF 126 week):** direct fetches of `dholms.leaflet.pub`, `zicklag.leaflet.pub`, `meri.leaflet.pub`, `happyview.dev` + `github.com/gamesgamesgamesgamesgames/happyview` (reactivated — the old "use Tangled" note is stale), `github.com/bluesky-social/proposals` + PR `atproto#5187`, `discourse.atprotocol.community` Private Data WG (thread t/750), `@atproto/oauth-scopes` npm (0.5.3), `@atproto/pds` npm (0.5.x), `blog.muni.town`, `lexicon.garden/browse/town.muni.arbiter`. Search is permitted to discover _new_ venues (proposal 0016's merge was found by search). Track whether HappyView 2.10's `read_self` access level and `com.atproto.space.*` NSIDs get confirmed in PR #5187 — implementation sightings, not yet upstream-normative.

The IETF ATP working group is chartered but its charter **excludes non-public data** — spaces standardization stays in `bluesky-social/proposals` + community venues for now. (IETF 126 is Vienna, July 18–24; the V11 docs' "IETF 125" was wrong.)

---

## Pitfalls (carried, corrected)

1. Don't use bilateral membership — the `members` space / `GroupMutationPort` is the write path; `memberConsent` is non-authoritative evidence.
2. Don't six-tier ACL — per-space placement replaces it.
3. Don't bake the URI scheme or digest algorithm as constants — helpers/ports only. (`at://…/space/…` and LtHash are current values; sync verification is surfaced through `PermissionedRepoPort`.)
4. HappyView is a reference/harness — the build-vs-use decision (§10) defaults to _build_ our own AppView; re-evaluate at Phase 5, don't migrate onto its Lua/WASM model by default.
5. Don't run a separate labeler service — cooperative-controlled label policy.
6. Don't use `@skyware/labeler` at runtime (archived; bootstrap-only).
7. Don't put application logic in the protocol/arbiter layer — the plugin set is the seam.
8. Don't conflate axes — name the axis on every authorization failure.
9. Don't trust handles for security — DIDs only.
10. Don't skip the `did_rotation_history` lookup on DID equality.
11. Don't trust records from non-members — cross-check; fail closed on partial/stale.
12. Don't generate fake DIDs — real `did:plc` via PlcClient.
13. Don't put Tier 2 data on the public firehose.
14. Don't make Tier 3 (Germ) a required path.
15. Don't run our own relay yet (Phase 9); access-controlled relays don't exist — access control belongs at the space or AppView layer.
16. Don't create new migration files — edit `schema.ts` + regenerate `schema.sql`.
17. Don't add fields to `community.lexicon.governance.*` unilaterally — CSN extensions wrap, don't modify.
18. Build `@coopsource/federation` after structural changes.
19. PostgreSQL bigint → `Number()`.
20. Tailwind 4 plugin order: `tailwindcss()` before `sveltekit()`.
21. AT URI as PK for PDS tables; UUID for app tables.
22. Cursor-based pagination everywhere.
