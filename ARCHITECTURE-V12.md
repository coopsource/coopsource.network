# ARCHITECTURE-V12 — Co-op Source Network

**Status:** Active canonical specification. Supersedes ARCHITECTURE-V11.md + CLAUDE-CODE-PROMPT-V11.md (both archived in `docs/archive/`). When CLAUDE.md and this document disagree, **this document wins**.

**Updated:** 2026-08-20. Grounded in the July 29 ecosystem research plus the
Phase 4 conformance/consumer/lifecycle checkpoints, amended for the
**2026-08-20 upstream Spaces alpha release**
(`docs/plans/2026-08-20-spaces-alpha-impact-analysis.md` is the full analysis;
§5/§9/§10/§12 below carry the corrections). Current code audit target: `main`
after audit tranches 1–3 (`adcaf17`).

V12 is a **documentation-and-alignment revision, not a design pivot.** The four-layer architecture, the ten-plugin contract, the authority axes, and the recursive cooperative model are all carried from V11 unchanged. What changed is the upstream reality V11 was betting on — and the bet aged well.

---

## 1. Δ from V11 — what moved, what held

**Upstream changes since the V11 docs froze (May 22, 2026):**

| Area                     | V11 assumption (May)           | V12 reality (July)                                                                                                                          | Impact                                                                                                                             |
| ------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Permissioned data status | Sketch proposal + diaries      | **Proposal 0016 is a published draft**, not a final specification; impl PR `atproto#5187` remains a 74-commit draft and `@atproto/space` is unpublished | Pin proposal and implementation commits; do not treat either as a stable dependency                                               |
| URI scheme               | "probably `ats://`" (70–80%)   | **`at://` reused** with a `/space/` segment: `at://{spaceDid}/space/{spaceType}/{skey}/{authorDid}/{collection}/{rkey}`                     | Pitfall held: scheme was never baked → helper-only change                                                                          |
| Commit digest            | ECMH                           | **LtHash** (lattice-based, quantum-secure)                                                                                                  | Verification belongs inside the `PermissionedRepoPort` sync boundary; a concrete adapter may add an internal LtHash verifier later |
| OAuth-spaces seam        | Open (~50%, the one real risk) | Delegation token → space credential, with a client attestation only when app identity is gated; SimpleSpace adds member-list/managing-app policy | Shape is executable but draft; CSN keeps signing, exchange, and policy behind ports                                               |
| Arbiter                  | "two weeks old"                | Roomy's current direction is a portable Rego-controlled XRPC proxy; the 16 `town.muni.arbiter.*` lexicons are useful prior art, not a stable wire contract | Preserve authority ports and keep Rego below GovernanceView                                                                        |
| Community modeling       | (implicit)                     | Holmgren (June 2): **many typed spaces under one community DID**, against "universal spaces"                                                | Directly validates our role-space design                                                                                           |
| OAuth scopes             | shipping                       | **Shipped + normative** (`repo:`/`rpc:`/`blob:`/`account:`/`identity:`/`include:`); permission sets are lexicons anyone can publish         | Axis 1 rests on documented protocol surface                                                                                        |
| HappyView                | experimental behind flag       | Stable **2.11.8** plus `2.12.0-dev.2`; dev releases follow Diary 7 and currently diverge from Proposal 0016 on signed commits               | Use for differential tests, not as the protocol oracle or CSN AppView substrate                                                    |

**2026-08-20 amendment:** the Spaces **alpha** shipped — `@atproto/space` is
published (npm `alpha` dist-tag, snapshot `0.0.0-spaces-alpha-20260818163953`),
Proposal 0016 was updated in place (DPoP-bound credentials being the one
change requiring a CSN refactor), and a spaces-enabled PDS distribution
(`ghcr.io/bluesky-social/atproto:pds-spaces-alpha` + hosted alpha) and the
Bulletin sample app exist. The July rows above stand as history; current
deltas and the Phase 4A work package live in
`docs/plans/2026-08-20-spaces-alpha-impact-analysis.md`.

**What did NOT change (carried from V11):** the four layers; the ten-plugin `GovernancePluginSet`; the five authority axes; the recursive cooperative model; the three data tiers; fail-closed cross-checking; DIDs authoritative + `did_rotation_history` aliasing; Tier 3 optional (Germ still iOS-only). The May addendum's own forecast scored 7/9 (see the research report §III).

---

## 2. The four-layer architecture

```
Layer 4: CoopView        network.coopsource.*          cooperative-specific
Layer 3: GovernanceView  community.lexicon.governance.*  generic governance
Layer 2: Group policy    adapters behind stable ports     authority/acceptance
Layer 1: Spaces          at://…/space/… (proposal 0016)  protocol primitives
```

**Placement rule:** push a feature down a layer unless doing so dilutes its generality. Test: _would Roomy (or another non-cooperative group app) use this unmodified?_ If yes, it belongs in Layer 3 or lower.

- **Layer 1 — Spaces** (Holmgren / Bluesky). A space is `(authority: DID, type: NSID, skey: string)`, where the type is a lexicon-resolved `"type": "space"` declaration. The protocol carries a writer set, not an application member or reader roster. Repo hosts enforce OAuth write authority; syncers verify signed/HMAC commits, LtHash state, CIDs, identity, and schema. CSN applies cooperative acceptance policy above that verified stream. Sync is pull-based (`listRepoOps` plus `getRepo` CAR recovery), with best-effort notifications and periodic `listRepos` reconciliation. _"space authority" ≙ our `arbiterDid`._
- **Layer 2 — Group/authority policy** (CSN adapters, SimpleSpace, Roomy/Arbiter-style hosts). Decides who may obtain a credential and which verified records the application accepts. CSN consumes it behind `GroupDirectoryPort` and `GroupMutationPort`. Recursive role-space and old Arbiter lexicon models remain possible adapters, not protocol facts.
- **Layer 3 — GovernanceView** (`community.lexicon.governance.*`). Generic proposals, votes, deliberations, anchor records, transparency logs, role-state derivation. Co-designed for ecosystem reuse. Accepts a `GovernancePluginSet` (§6). Initial package/default interfaces exist; service extraction remains Phase 5.
- **Layer 4 — CoopView** (`network.coopsource.*`). Subchapter T, patronage, capital accounts, multi-stakeholder weighted voting, ICA principles, 1099-PATR, agreements, alignment, agents. Provides the plugin implementations. Initial package adapters exist; broad application-service rewrite remains Phase 5.

---

## 3. The five authority axes

At every write checkpoint, identify which axis applies and route failures so the error **names the axis** (the difference between debuggable and tangled):

1. **OAuth scope** (app→user) — the user's PDS granted the client the scope. Now: typed-prefix scopes + permission sets.
2. **Group/authority policy** (user→group) — credential issuance and CSN record-acceptance policy; fail closed on partial/stale authority data.
3. **Application logic** (user→action) — eligibility, quorum, weighted voting (the plugin set).
4. **Labels** — governance labels via cooperative-controlled policy (no separate labeler service).
5. **Service-auth JWTs** — cross-arbiter trust; audience-bound, short-lived, verified against the DID doc.

**The OAuth-spaces seam** (Axis 1 ↔ Axis 2) shipped in the 2026-08-20 alpha: a **delegation token** minted by the user's PDS is exchanged for a **space credential** issued by the authority — since 2026-08-14 a **DPoP-bound** credential (`cnf.jkt` at mint, per-request proofs; §9) — with a short-lived **client attestation** only when the space gates on application identity (`appAccess: allowList`). Proposal 0016 distinguishes whole-space `read` from `read_self`; `read_self` is all-or-nothing at the space boundary (its `collection` parameter is now ignored), and only `read` supports full-space background sync. Keep scope denial, user-policy denial, and application-policy denial distinct.

_Reference implementation of the gate:_ see `apps/api/src/routes/federation.ts` `/membership/approve` — the Axis 2 authority check runs before any mutation and returns 403 naming `axis: 'spaces'`. Authority is the **`member.approve` permission**, not a role list: the caller must be the cooperative's own DID or hold that permission through a role, so a `coordinator` qualifies alongside `admin`/`owner` (since `0c86a5f`; `apps/api/tests/federation.test.ts:223` pins the coordinator case). Since `37a0081` the check is the shared `requireCoopAuthority` helper in that file, and the five agreement federation endpoints carry their own gates through it and through its Axis 5 sibling `requireSelfActingCaller` — "the caller must *be* the DID the body says is acting", returning `axis: 'service-auth'` (audit C-04).

---

## 4. Group-authority integration — port ↔ adapter mapping

CSN operates group/authority policy behind two ports so the wire contract can evolve. Today
both are backed by CSN's own Postgres (`Csn*` adapters). Phase 3 added a
non-default XRPC group-directory adapter against the current draft substrate
shape (`com.atproto.space.*` / `com.atproto.simplespace.*`) while keeping CSN-DB
as the runtime default. The following `town.muni.arbiter.*` correspondence is
historical, provisional prior art and not a convergence target:

| CSN port method                                       | Draft `town.muni.arbiter.*`          | Notes                          |
| ----------------------------------------------------- | ------------------------------------ | ------------------------------ |
| `GroupDirectoryPort.resolveSpaceMembers`              | `resolveSpaceMembers`                | verbatim name match            |
| `GroupDirectoryPort.listSpaces`                       | `listSpaces`                         |                                |
| `GroupDirectoryPort.getSpaceConfig`                   | `getSpaceConfig` / `getSpaceMembers` |                                |
| `GroupMutationPort.addMember` / `addRoleMember`       | `createSpace`/`setSpaceMemberAccess` | space-as-role model            |
| `GroupMutationPort.removeMember` / `removeRoleMember` | `removeSpaceMember`                  |                                |
| `DidProvisioningPort`                                 | `createDid` / `updateDidDoc`         | controlled-DID ops for Stage 3 |

Roomy's current Arbiter direction still validates the boundary: portable Rego
may enforce host-side XRPC authorization, while CSN's Axis-3
`GovernancePluginSet` remains above it. Do not push cooperative quorum,
eligibility, retention, or legal policy into generic host Rego.

`SpaceRef = { arbiterDid: DID, spaceKey: string, expectedSpaceType?: NSID }` — URI-scheme-independent. Current CSN space types are constants in `packages/arbiter-client/src/space-ref.ts` (`membersSpace`, `roleSpace`, `MEMBERS_SPACE_TYPE`, …) with draft Proposal 0016 declarations under `packages/lexicons/network/coopsource/org/spaceType/` and typed exports from `@coopsource/lexicons`. The declarations stay outside generated record schemas for now because the installed atproto lex tooling rejects `"type": "space"` (the alpha `@atproto/lex` accepts both `"type": "space"` and the new `"type": "permission-set"`; the exclusion lifts when Phase 4A adopts the pinned alpha tooling). Before real `space:` scopes are requested, Phase 4 must decide whether the current `network.coopsource.org.spaceType.*` namespace is the publication namespace or an internal draft to remap — this fires at Phase 4A items 6/9, the first real scope requests.

---

## 5. Spaces substrate (Layer 1 detail)

- **URI:** `at://{spaceDid}/space/{spaceType}/{skey}/{authorDid}/{collection}/{rkey}` — parse/emit only through helpers (`packages/spaces-consumer/src/space-uri.ts`, Phase 2). Still marked "likely to change" upstream; keep behind helpers.
- **Digest and sync verification:** the commit format is signed-context+HMAC+LtHash (`ver: 1`; settled for the alpha baseline 2026-08-20, §12 q7 — HappyView's HMAC-only shape lost and is a secondary diagnostic only). `PermissionedRepoPort.sync(...)` exposes verification status; the concrete adapter must select a verifier by pinned conformance target rather than inventing a local hybrid.
- **Sync:** repo hosts send best-effort `notifyWrite` events to the authority, which forwards them to registered syncers. Correctness comes from periodic authority `listRepos` sweeps, per-repo `listRepoOps`, commit/LtHash comparison, and `getRepo` CAR recovery when history is missing or state diverges. Public DID/account events are another reconciliation input.
- **Application acceptance:** only after protocol verification does CSN resolve cooperative policy and decide whether to project a writer's record. A partial or stale group result fails the CSN acceptance step closed. `listRepos` is a writer-discovery list, never a membership or reader list.
- **Current state:** flag-gated off by default
  (`SPACES_CONSUMER_ENABLED=false`,
  `PERMISSIONED_REPO_READER_MODE=fail-closed`) with `spaces:[]`. The draft
  reader implements periodic/notification-driven inventory and oplog pulls,
  pinned LtHash/commit/CID verification, CAR/blob recovery, durable replica
  checkpoints, writer removal, public identity/account reconciliation with
  host-scoped durable invalidation, and idempotent proposal/vote projection. A
  pinned differential probe records atproto PR #5187 versus HappyView
  `2.12.0-dev.2` request, commit, CAR, credential, and notification behavior.
  Inbound notification endpoint activation, production lifecycle-source
  selection, and a deployed authenticated cross-service probe remain parked.
  As of the 2026-08-20 alpha, upstream PR #5187 **implements `getRepo`**, and
  the spec resolved the commit format to signed-context+HMAC — HappyView's
  HMAC-only CAR is now a known nonconformance (secondary diagnostic only).
  Space credentials became **DPoP-bound** (`cnf.jkt` + per-request proofs);
  the consumer's credential path predates this and is Phase 4A item 2. The
  CAR index moved to canonical DAG-CBOR ordering (Phase 4A item 4).

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
| `historicalState`    | read/record group-authority snapshots at cadence boundaries — **the only plugin GovernanceView writes to** (as-of-fiscal-period patronage) |
| `patronageAllocator` | per-member patronage allocation for a fiscal period                                                                                            |
| `surplusDistributor` | qualified vs non-qualified, cash vs equity distribution                                                                                        |
| `meetingMinutes`     | canonicalize deliberation threads into minutes                                                                                                 |
| `delegateChains`     | resolve vote-delegation chains                                                                                                                 |

Diary 7's removal of membership from the core protocol reinforces this design:
all cooperative governance semantics and CSN acceptance policy live above the
substrate. GovernanceView now owns generic tally/outcome and proposal lifecycle
policy; further extraction is limited to pure, persistence-independent logic
with an existing contract.

---

## 7. CoopView (Layer 4)

Cooperative-specific concerns: Subchapter T patronage & capital accounts, multi-stakeholder weighted voting, ICA principles, fiscal periods, 1099-PATR, agreements/signatures/amendments, legal documents, alignment, onboarding, AI agents, commerce. The application substance already exists across ~59 `apps/api` services; Phase 5 codifies it as `packages/coop-view` registering plugin implementations. ATProto-native records are canonical for Subchapter T; Postgres is a projection cache.

---

## 8. Data tiers

- **Tier 1 (Public ATProto):** cooperative profiles, public proposals, vote tallies, ratified agreements. Public repo / publish-space.
- **Tier 2 (Permissioned-space):** closed deliberations, draft proposals, private votes, confidential agreements, private member directories, financials. Members' permissioned repos for the appropriate space. **Never on the public firehose.** No `private_record` as authoritative storage (it persists as a projection cache during transition; retires in Phase 6). A read-only governance migration audit and disabled copy/verification ledger now reconcile retained sources with semantic targets. The writer default, authority change, cutover, and remote rollback remain gated; the pinned delete contract has no conditional-CID protection.
- **Tier 3 (E2EE):** board-confidential, salary, personnel. Germ DM / MLS. **Optional secondary channel only** — Germ is iOS-only (July 2026). Governance flows must not require Tier 3.

---

## 9. Security requirements

AppView processing has two explicit gates. **Protocol verification:** verify the
pinned commit format against fresh DID material, compare LtHash state, validate
CIDs/CAR structure, schema, author identity, and plausible timestamps.
**Application acceptance:** resolve the relevant cooperative/group policy,
fail closed on partial or stale authority data, apply moderation and retention
rules, then project transactionally. Checkpoints advance only after projection
commits. Audit both gate outcomes without publishing private metadata.

Identity: cooperatives self-manage rotation keys offline (higher priority than
the PDS signing key, which CSN holds); monitor PLC for unexpected rotations;
DID equality must resolve through `did_rotation_history` before consumer
activation. Space credentials are DPoP-bound proof-of-possession tokens (alpha,
2026-08-14): each credential is bound at issuance to an application-held key
(`cnf.jkt`) and every presentation carries a per-request proof, so the
keypair's lifetime equals the credential's. Keep credentials short-lived,
least-privilege per space, and refresh per batch behind
`SpaceCredentialStore`. A local membership change invalidates CSN's credential
cache as defense in depth; it is not a protocol-defined global revocation
mechanism.

Digest algorithm is LtHash per proposal 0016; current public code exposes the verification outcome through `PermissionedRepoPort`, not a separate digest-verifier port.

---

## 10. Implementation playbook

### Current code state (audit of the Phase 4 P1 checkpoint, 2026-07-30; amended 2026-08-20)

| Layer            | Package                    | State                                                                                                                                                                                                                                                                                                                      |
| ---------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Spaces         | `packages/spaces-consumer` | Flag-gated concrete draft reader/writer: DID-resolved authority and writer hosts/keys, credential refresh, `listRepos`/`listRepoOps`, periodic sweeps, pinned LtHash/signed-commit/CID verification, CAR/blob recovery, persisted replica/registration/account state, writer removal, public lifecycle reconciliation, and post-projection checkpoints. Inbound notification activation and production lifecycle-source selection remain parked. |
| 2 Group policy   | `packages/arbiter-client`  | CSN-Postgres remains the runtime authority. Mock-tested SimpleSpace directory/management clients, Proposal 0016 DID service provisioning, and a disabled managing-app access policy adapter sit behind ports; Roomy/Rego remains a possible future host adapter. |
| 3 GovernanceView | `packages/governance-view` | Concrete `GovernanceView` registration owns generic tally/outcome and proposal-lifecycle policy plus the complete ten-plugin set; production governance consumers use it. Non-canonical community governance draft lexicons live outside the runtime schema set. Phase 5 still owns further generic service extraction.    |
| 4 CoopView       | `packages/coop-view`       | Concrete `CoopView` registration composes CSN vote, eligibility, quorum, authorization, delegation, patronage, and distribution plugins with defaults for the remaining interfaces. Broad service rewrites remain Phase 5 work.                                                                                            |

Membership: bilateral lexicons retired; `memberConsent` is non-authoritative evidence; **writes** route through `GroupMutationPort`; **reads** route through the API-layer `MembershipReadModel`, which composes strict `GroupDirectoryPort` authority checks with local projection data. Direct `membership`/`membership_role` access is limited to the read seam, mutation/projection writers, admin reset SQL, and low-level tests/helpers. Container exposes `groupMutations`, `groupDirectory`, `membershipReadModel`, `spaceCredentialStore`, `permissionedRecordWriter` (wired unconditionally; `private-record` default), `managingAppAccessPolicy` (mode-gated), consent evidence verification, and Phase 5 governance/coop-view adapters where already extracted; the consumer starts via `startSpacesConsumer` behind the flag and can select the concrete reader with `PERMISSIONED_REPO_READER_MODE=draft-xrpc`.

DB: `packages/db/src/migrations/0001_v11_baseline.ts` + `schema.sql` is the **permanent bootstrap** (a `pg_dump` of the 63-migration archive chain + V11 tables). Schema changes edit `schema.ts` **and** regenerate `schema.sql`; no new migration files. Archived incrementals live in `.archive/` (not executed).

### Phase/stage map (see `docs/plans/2026-07-04-v12-program-plan.md`)

| Phase | Gate           | Content                                                                                                                                                               |
| ----- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 ✅  | done           | Repo cleanup, V11 merge, review fixes                                                                                                                                 |
| 1 ✅  | none           | Docs sweep, this doc, slim CLAUDE.md (tagged `v12-phase-1`)                                                                                                           |
| 2 ✅  | none           | Drift alignment: stale ECMH ports removed/folded into `PermissionedRepoPort`, URI helpers, dep checks, port↔lexicon JSDoc, review cleanup (tagged `v12-phase-2`)      |
| 3 ✅  | soft           | Arbiter convergence + membership read seam design/migration + review carry-ins (suspension, lifecycle events, consent-overwrite, roster-`partial`, DID rotation gate) (tagged `v12-phase-3`) |
| 4 ⏳  | Stage 3 + seam | Governance→spaces, credential seam, personal spaces — checkpoints merged through 2026-07-30; **Phase 4A spaces-alpha alignment** added 2026-08-20 (see program plan)   |
| 5 ⏳  | none           | GovernanceView + CoopView + the ten plugins — substantially done 2026-07-30; `anchorSummary`/`historicalState`/`meetingMinutes` deliberately unwired pending contracts |
| 6 ⏳  | 3–5 stable     | Retire or reclassify remaining V9 surface (`private_record`, governance labels, inbound RFC 9421 routes, cooperative links, `local/*`); first checkpoints merged; remaining removals have runtime consumers or signoff gates |
| 7 ⏳  | 3–4 merged     | Full UX overhaul — 7.1 audit complete; IA/theme activation gated by V12-S12                                                                                            |

Branch naming: phase work `feature/v12-phase-N-<desc>`; parallel tracks keep their own descriptive prefixes (`feature/audit-tranche-N-<desc>`, `feature/v12-ecosystem-<desc>`, `docs/<desc>`). Merges to `main`: `--no-ff`, green build+tests first; tag `v12-phase-N` at **phase completion** (mid-phase checkpoints and track merges are untagged).

### Build-vs-use register

| Capability                                                       | Default                                                                                                                                                                                                                                                                                            | Decide at   |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| AppView substrate (custom `apps/api` vs **HappyView 2.10+**)     | **Build confirmed.** The 2026-07-11 HappyView 2.11.4 spike loaded all 58 canonical/draft documents, but all 8 CSN queries need custom semantics; Lua/WASM cannot host the typed plugin and projection model without a rewrite. See `docs/plans/2026-07-11-v12-phase-5-happyview-appview-spike.md`. | decided     |
| Spaces dev/test harness (fixtures vs **HappyView**)              | **Implemented:** pinned PR #5187 and HappyView 2.12-dev profiles, abort-aware HTTP probe, CAR inspection, and upstream executable-suite evidence. 2026-08-20: the `pds-spaces-alpha` Docker image becomes the primary oracle (Phase 4A item 6); HappyView is secondary/diagnostic.                     | decided     |
| Spaces primitives (extend vs **`@atproto/space`** from PR #5187) | **Published 2026-08-18** (`alpha` dist-tag, 0.0.0 snapshots): adopt as a pinned differential oracle now; swap runtime internals at upstream stability (Phase 4A item 7)                                                                                                                              | each sweep  |
| Group authority (CSN-DB vs SimpleSpace vs Roomy-style Arbiter)   | Keep adapters; CSN-DB remains default. A disabled `checkUserAccess` adapter now proves the managing-app boundary, but production activation still requires the host, service identity, trust set, and operating-policy decisions in V12-S02/V12-S10.                                                   | Phase 4/P2  |
| Axis-3 policy (TS plugin set vs Rego/OPA)                        | Build                                                                                                                                                                                                                                                                                              | firm        |
| Tier 3 E2EE (Germ/MLS)                                           | Use, optional-only                                                                                                                                                                                                                                                                                 | parity news |

---

## 11. Design commitments (committed)

Per-(coop, member) personal spaces; both V9 membership lexicons retire; binary `governance_visibility` retires; governance labels via cooperative-controlled policy (no separate labeler service); RFC 9421 retires; single custom AppView (HappyView remains a spaces/reference harness per the completed Phase 5 spike); the `community.lexicon.governance.*` namespace; cooperatives own DIDs (rotation keys offline, CSN holds signing key only); `did_rotation_history` aliasing; ATProto-native records canonical for Subchapter T; historical-state snapshots at cadence boundaries.

**Load-bearing (do not casually revisit):** the semantic distinction between
permissioned and public data; protocol verification separated from application
acceptance policy; cooperative DID distinct from any founder's personal DID;
cooperative policy remains above generic host/protocol adapters. URI shape,
commit format, sync wire details, and exact permission spellings remain behind
ports and are expected to drift.

---

## 12. Open questions & ecosystem watchlist

**Open (§17/§18 carried; dispositions updated 2026-08-20 — full mapping in
`docs/plans/2026-08-20-spaces-alpha-impact-analysis.md` §6):**

1. Client-attestation key custody/JWKS publication — **narrowed:** attestation
   is required only for `appAccess: allowList` spaces; defer custody decisions
   until CSN gates a space on app identity. The signer port stands.
2. Lexicon Community response to `community.lexicon.governance.*` — no
   governance namespace exists yet. (Correction per the audit record: working
   groups are self-formed since 2026-07-26 — no TSC gate. Start outreach
   early; Phase 5 does not wait on ratification.)
3. Subchapter T legal-counsel consultation.
4. Production authority hosting — **enriched by the alpha:** a supported
   near-term combination is a stock spaces PDS running `simplespace` with
   `policy: managing-app` pointing at CSN (mint-time callback; upstream fails
   closed if the managing app is unreachable); a bespoke cooperative space
   host (own management namespace on a dedicated space service) is the
   spec-blessed long-term shape. Activation carries the security
   preconditions in the impact analysis §4-5 (inbound-surface hardening incl.
   S-08 before any new DID-resolving endpoint, membership-oracle `iss`
   binding, integrity blast radius), not only the availability edge.
   Framing signal (WG t/1140, week-1 assessment §2): Holmgren models the
   group host as **one service** — spaces + repos + internal role logic +
   its own OAuth issuance — while the community argues for protocol-level
   delegation (`createActorAuth`); either outcome stays behind CSN's ports,
   but the one-service framing would add an OAuth authorization-server
   component to the eventual bespoke cooperative host.
5. Cross-modality notification routing for community-router apps — unresolved upstream.
6. `$publish`/`$labeler` conventions — not formalized (arbiter uses open unions).
7. Commit format — **settled for the alpha baseline** (2026-08-20): the alpha
   ships signed-context+HMAC (`ver: 1`, `atproto-space-v1`); CSN's pinned
   verifier is conformant, including the HKDF-Expand-only MAC. HappyView's
   HMAC-only shape lost — secondary diagnostic only. The spec header's
   "likely to change" disclaimer still applies; `ver` is the compat seam and
   the weekly watch covers it.
8. Cooperative retention, re-homing, deletion, and private moderation policy;
   see the July 30 signoff register. The alpha adds concrete deletion
   semantics (syncers must drop copies **and derived state**; `SpaceDeleted`
   at credential renewal) — Phase 4A item 5.
9. Inbound notification service identity/audience — **answered upstream
   2026-08-20; CSN adoption open** (Phase 4A item 8 / V12-S09): audiences are
   DID service fragments (`did#fragment`); `registerNotify` subscribes a
   service identifier resolved via the DID document, matching CSN's
   DID-audience verifier. CSN still has no endpoint, service entry, or
   renewal scheduler; periodic reconciliation remains authoritative until
   they land.
10. Production public lifecycle-source topology and source-switch procedure.
    Raw host-attributed invalidation is implemented; unattributed Tap events
    remain intentionally non-destructive.
11. Managing-app callback activation — **mechanics now answered** (service
    identifier form, `checkUserAccess` contract, fail-closed upstream on an
    unreachable app); remaining decisions are the trusted authority set,
    operator availability, key lifecycle, and correction/appeal policy
    (V12-S10).
12. Standing-service credential sourcing (2026-08-20) — no service-identity
    delegation path exists upstream (even Bulletin borrows end-user OAuth
    sessions to mint sync credentials); CSN's managing-session-pool posture
    stands. **First upstream movement (2026-08-26):** the
    `com.atproto.server.createActorAuth` sketch (WG t/1140) — attributed
    (`act` claim), request-hash-bound, ≤60 s single-use tokens for acting
    as another identity, policy-checked at issuance. Contested (Holmgren's
    null hypothesis: group-host-internal OAuth suffices), per-request not
    standing-sync, no PR yet. Watch it, the `delegated:` scope sketch, and
    zicklag's per-account delegated verification-method idea
    (`#acting`-style keys) — the latter could narrow CSN's cooperative key
    custody from holding `#atproto` outright to holding a delegated key.
    See `docs/plans/2026-08-26-spaces-alpha-week1-upstream-assessment.md` §2.
13. **New (2026-08-20):** the `@atproto/api` → `@atproto/lex-*` client-stack
    generation shift (space bindings exist only as `lex build` codegen), and
    the scaffolded-but-unexposed `swapCid` compare-and-swap (bears on the
    Tier-2 copy-ledger delete contract).
14. **New (2026-08-26):** in-protocol invitation/bootstrap gap — space hosts
    silently drop `notifyWrite` from non-authorized identities (WG t/1157),
    so invitations cannot be delivered in-protocol; unresolved upstream
    (buffering is a spam vector). CSN's off-protocol addressed single-use
    invites are the durable design, and provisioning must create spaces and
    add members **before** writers write (state in the Phase 4A.0 task
    plan).

**Watchlist (weekly during the alpha — upstream ships Thursday updates; last
deep sweep 2026-08-20; light check 2026-08-26, no drift — see the week-1
assessment; next due 2026-08-27, the first weekly drop itself; revert to the
two-week cadence after upstream's full launch):** the atproto.com blog and
the announcements thread
`discourse.atmosphere.community/t/atproto-spaces-alpha-updates/1129` + the
WG Private Data tag (primary alpha venues; live threads: `createActorAuth`
t/1140, unauthorized write notifications t/1157, fine-grained
permissioning/ReBAC t/1161 incl. "OpenSocial Groups", authority t/1123);
Proposal 0016 and `atproto#5187` (pins: proposal `54c9cf5`, impl
`89deb9fac`; **deploy branch `permissioned-data-alpha` @ `4c33457af`** —
force-updates, builds the image and npm lineage; a
`permissioned-data-lex-refactor` branch also exists; npm snapshot train
`0.0.0-spaces-alpha-20260818163953`,
`ghcr.io/bluesky-social/atproto:pds-spaces-alpha` — pin by digest); Holmgren's
permissioned-data diary (quiet since Jul 17); HappyView stable/dev (secondary
diagnostic); Roomy devlogs and Arbiter/Rego work; Habitat, Blacksky,
Northsky, Colibri, ZDS, atproto-crates, and rsky (community PDS
implementations named in the announcement); released ATProto OAuth/PDS
packages (`pds` 0.5.29, `oauth-scopes` 0.5.9 stable as of 2026-08-20). Record
source commit or release pins and distinguish proposals, executable drafts,
and deployed products. The weekly check is a **light pass** — read the
announcements thread, diff the pins, note deltas — minutes, not a sweep;
escalate to a deep sweep only on a breaking drop or a spec-level change
(commit format, credential model, sync methods).

The IETF ATP working group is chartered but its charter **excludes non-public data** — spaces standardization stays in `bluesky-social/proposals` + community venues for now. (IETF 126 is Vienna, July 18–24; the V11 docs' "IETF 125" was wrong.)

---

## Pitfalls (carried, corrected)

1. Don't use bilateral membership — the `members` space / `GroupMutationPort` is the write path; `memberConsent` is non-authoritative evidence.
2. Don't six-tier ACL — per-space placement replaces it.
3. Don't bake the URI scheme or digest algorithm as constants — helpers/ports only. (`at://…/space/…` and LtHash are current values; sync verification is surfaced through `PermissionedRepoPort`.)
4. HappyView is a reference/harness — the completed Phase 5 spike confirms building our own AppView. Use HappyView for spaces and lexicon compatibility exercises; do not migrate CSN's typed plugin/projection model onto trigger-scoped Lua or the external-auth WASM ABI.
5. Don't run a separate labeler service — cooperative-controlled label policy.
6. Don't use `@skyware/labeler` at runtime (archived; bootstrap-only).
7. Don't put application logic in the protocol/arbiter layer — the plugin set is the seam.
8. Don't conflate axes — name the axis on every authorization failure.
9. Don't trust handles for security — DIDs only.
10. Don't skip the `did_rotation_history` lookup on DID equality.
11. Don't conflate protocol verification with cooperative acceptance — verify
    first, then apply membership/policy; fail the acceptance gate closed on
    partial or stale authority data.
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
