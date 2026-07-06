# ATProto Shared Spaces — Ecosystem & Codebase Research Report

**Date:** 2026-07-04
**Scope:** State of shared/permissioned spaces in ATProtocol as of today, compared against the assumptions recorded in ARCHITECTURE-V11.md and the May 2026 research docs; plus a factual audit of how much of V11 exists in this codebase.
**Method:** Three parallel codebase-analysis agents (substrate packages, surviving V9 surface, architecture docs); direct URL fetches of every §18.3 watchlist endpoint (per the "direct fetches, not search" rule); and a 101-agent deep-research workflow with 3-vote adversarial verification per claim. Where the workflow's diary-based conclusions conflicted with the merged proposal text, the proposal (fetched raw from GitHub `main`) wins and the discrepancy is noted.

> **2026-07-05 correction:** the upstream research remains useful, but the codebase audit sections below were superseded by `docs/plans/2026-07-05-v12-replan-after-code-deep-dive.md`. Current `main` includes V12 Phases 0-2 plus Phase 3 checkpoints, and `packages/spaces-consumer` no longer exposes `EcmhVerifier` or a renamed `CommitDigestVerifier`; the public watch/sync/verification boundary is `PermissionedRepoPort`.

---

## Executive summary

The seven weeks since the codebase's last recorded ecosystem scan (May 8–22, 2026) were the most consequential period yet for this architecture. **The permissioned data design graduated from diary posts to a formal proposal**: Proposal 0016 "Permissioned Data" was merged into `bluesky-social/proposals` (PR #94, opened June 23, review active through July 3), and the implementation PR `bluesky-social/atproto#5187` is a 74-commit draft touched as recently as July 2, adding an `@atproto/space` package, PDS endpoints, and a three-token credential system.

Three of ARCHITECTURE-V11.md §18's five open questions have substantially resolved, and two of them resolved _against_ the May addendum's predictions:

1. **URI scheme (§18 Q4):** Settled — permissioned data **reuses `at://`** with a `/space/` path segment: `at://{spaceDid}/space/{spaceType}/{skey}/{authorDid}/{collection}/{rkey}`. The addendum gave "`ats://` survives" 70–80%; that was wrong. The _decision to not bake the scheme_ (Pitfall #3, `SpaceRef` substrate) was exactly right — the insulation pays off with a one-file change to URI helpers.
2. **Sync digest:** Changed — the commit digest is now **LtHash** (lattice-based homomorphic hash, chosen explicitly for quantum security), not ECMH. The addendum's ~50% "sync substrate changes for post-quantum reasons" prediction was right, for exactly the anticipated reason. July 5 code reconciliation supersedes the original rename recommendation: current code folds verification into `PermissionedRepoPort`.
3. **OAuth-spaces seam (§18 Q1, the doc's own highest residual risk):** Substantially resolved as a **credential flow, not scope spellings** — delegation token (minted by user's PDS) → client attestation (signed by the app) → space credential (issued by the space authority), with per-space client allow/deny lists by client ID (Diary 6). CSN's three-failure-mode distinction ("scope not granted" / "not in space" / "app not authorized for space") maps one-to-one onto the three tokens.

The Arbiter layer also moved: two progress reports (May 13, May 21), a Rego/OPA policy-based prototype, a browser WASM simulator, and — most importantly for CSN — **16 draft `town.muni.arbiter.*` lexicons on lexicon.garden**, including `resolveSpaceMembers`, which matches CSN's `GroupDirectoryPort.resolveSpaceMembers` name exactly. The Stage 2 gate (a working Arbiter XRPC reference implementation) has **still not demonstrably cleared**, but the wire contract now exists in draft form and CSN's temporary CSN-DB adapters have a concrete target to converge on.

On the codebase side: **V11 exists as Stage 1 plus an early Stage 2/3 slice, entirely on unmerged branches** (`main` is docs-only). The spaces consumer is real but flag-gated with a fail-closed sketch verifier; the "Arbiter" is an adapter over CSN's own `membership`/`membership_role` tables; bilateral membership lexicons are genuinely gone (replaced by non-authoritative `memberConsent`); and GovernanceView, CoopView, and the ten-plugin contract are entirely unbuilt. Every V9 retirement target (visibilityRouter, privateRecordService, governanceLabeler, `private_record`, RFC 9421 signing, HttpFederationClient) is still live and wired.

**Bottom line:** V11's bet — commit to the model, insulate the unsettled details behind ports — is aging well. Nothing that landed contradicts a load-bearing commitment (§17.3). What's needed now is a documentation-and-naming refresh (URI helpers, digest verifier, seam mechanics), not a design pivot.

---

## Part I — Upstream ecosystem state, July 4 2026

### 1. Permissioned data / Spaces (Layer 1)

**Proposal 0016 is formal and merged.** `bluesky-social/proposals` PR #94 ("Permissioned data", dholms) was opened June 23, 2026 and merged, with review discussion active through July 3. The proposal README states plainly: _"This is a proposal, not the final specification. Details, terminology, and behaviors are all likely to change."_ Key definitions (verbatim where quoted):

- **Space identity:** a space is identified by a triple — _"space authority: a DID, the root of authority for the space; space type: an NSID describing the modality of the space; space key (skey): a string distinguishing spaces of the same space type under the same space authority."_ This is structurally identical to CSN's `SpaceRef = { arbiterDid, spaceKey, expectedSpaceType? }` (modulo `authority` vs `arbiterDid` naming).
- **URI scheme:** _"Permissioned data reuses the `at://` scheme rather than defining its own."_ Format: `at://{spaceDid}/space/{spaceType}/{skey}/{authorDid}/{collection}/{rkey}`. Space-first authority order held (Diary 5 / Meri dispute resolved in favor of space-DID authority); the `ats://` token did not.
- **Commit digest:** _"The construction is LtHash, a homomorphic hash built on a lattice problem (and thus quantum-secure)"_ — a set hash over the records a repo currently contains. Same design role as the ECMH described in Diary 4 (order-independent, no partial sync/single-record proofs), different algorithm.
- **Credentials:** three token types — **delegation token** (minted by user's PDS), **client attestation** (signed by application), **space credential** (issued by space authority).
- **Sync:** incremental via operation logs (`listRepoOps`) with full-state CAR fallback; write notifications inform syncers. Pull-based, exactly as CSN's spaces consumer assumes.
- **simplespace:** a required baseline of PDS space management — member lists, public access, dynamic policies via managing apps.

**Implementation PR `bluesky-social/atproto#5187`** — draft, ⚠️ WIP, 74 commits, last commits July 2, 2026. Adds `@atproto/space` (core space/repo logic), `@atproto/oauth-provider` credential-flow changes, PDS endpoints, lexicons for space operations, and tables (`space_repo`, `space_member_state`, credential tracking). Space creation currently has policy variants (simplespace/publicspace/managed); reviewer matthieusieben is pushing for a unified creation endpoint with policy parameters. This remains a reference sketch — Holmgren's "don't over-index on it" caveat still applies, but it is far past the single-branch sketch recorded in May.

**Diary 6 "Boring Auth" (June 5)** locked the authorization model:

- Exactly **one member list per space**, controlled by the space authority. On the list → you can read and sync everything in the space.
- **Write access is not encoded in the protocol** — _"writes are enforced by readers"_ at the application layer (the reply-gating analogy). CSN's claimed-until-cross-checked spaces-consumer posture is precisely this pattern.
- **UCAN/capability schemes rejected** (learning curve, revocation complexity, users benefit from authoritatively enumerable access, token size). No "AWS IAM on atproto."
- **Space credentials** are short-lived, asymmetrically signed, scoped to (space, OAuth client). Space owners can maintain client-ID allow/deny lists — this is the app-authorization half of the OAuth-spaces seam.
- Public permissioned spaces (credentials granted to any requester) supported — party-to-party transmission without firehose broadcast.
- Next post promised: the sync protocol / what an app does with a space credential.

**"Modeling communities on permissioned data" (June 2)** — the community-modeling post CSN's Layer 2 sits on:

- **Against universal spaces**: one all-modality community container fails on consent-screen legibility and violates least privilege (an events app would get chat + photos + forums).
- **Proposed shape: multiple typed spaces under a single community DID**, with the community getting a handle (consent reads "read and write all @protocol-nerds.network spaces"). CSN's role-space design (`members`, `roles/board`, `classes/worker` as separate spaces under the coop DID) is a direct instance of this pattern — designed before the post said it.
- Two named open questions: **cross-modality notification routing** for community-router apps, and **arbiter hosting** — should arbiters run on PDSs, in apps, or independently? Directly relevant to CSN's `INSTANCE_ROLE` and Stage 2 posture; unresolved upstream.

**Official posture:** the Spring 2026 roadmap (March 24) named permissioned data "probably a major focus for the Bluesky protocol team through the summer," and the pace since (proposal merged, 74-commit PR, two diaries in June) confirms it. The IETF **ATP working group is chartered** but its initial charter **explicitly excludes non-public data** — spaces standardization is not moving to IETF yet. IETF 126 is July 18–24 in Vienna (the May docs called it IETF 125; the number was wrong, the timing right).

### 2. The Arbiter (Layer 2)

- **Progress Report 1 (May 13)** and the WASM **arbiter simulator** (May 14, runs actual state-machine logic in the browser).
- **Progress Report 2 (May 21):** after discussions with Habitat and Acorn revealed incompatible access-control needs, the design split **identity/membership ("who is in what role/group") from authorization ("who can do what")**. The prototype offloads enforcement to **Rego (Open Policy Agent) policies** that communities upload — enabling e.g. majority-vote-to-remove-owner without hardcoding. The server is "completely generic over the policy."
- **Draft lexicons published:** 16 NSIDs under `town.muni.arbiter.*` on lexicon.garden — `createArbiter`, `createDid`, `createSpace`, `defs`, `deleteArbiter`, `deleteSpace`, `getArbiterConfig`, `getSpaceConfig`, `getSpaceMembers`, `listSpaces`, `removeSpaceMember`, **`resolveSpaceMembers`**, `setArbiterConfig`, `setSpaceConfig`, `setSpaceMemberAccess`, `updateDidDoc`. Open unions for the three config types so different servers can support different access-control mechanisms while sharing a standard listing/resolution API. Note `createDid`/`updateDidDoc` — the controlled-DID operations CSN's Stage 3 needs are in the draft wire contract.
- **Status vs CSN's Stage 2 gate:** a deployed arbiter server was promised "pretty soon" as of May 21; the WG Discourse thread (t/750) shows no June–July activity, and no shipped XRPC reference implementation was found. **The Stage 2 gate has not demonstrably cleared.** However, the draft lexicons mean CSN's `GroupDirectoryPort`/`GroupMutationPort` now have a named upstream contract to align to — and the method-level correspondence (`resolveSpaceMembers`, `listSpaces`, `getSpaceConfig`) is already strong.
- **Roomy reality check** (adversarially verified): Roomy's group data still lives off-protocol on Muni Town's Leaf server; ATProto is used primarily for auth and integrations. Leaf 0.3 independently ships two patterns CSN cares about — per-stream minted DIDs published to plc.directory with creator-held rotation keys, and streams as permissioned community containers. The Arbiter is the convergence plan, not the shipped present. `blog.muni.town` has published nothing since March 25.

### 3. OAuth granular scopes & permission sets (Axis 1) — the shipped piece

- Typed-prefix scope syntax (`repo:`, `rpc:`, `blob:`, `account:`, `identity:`, `include:`) is **normative official documentation** (atproto.com/specs/permission, /guides/permission-sets). The Spring roadmap declared "permissions and permission sets shipped."
- Bluesky's initial permission-set slate (`app.bsky.authFullApp`, `authCreatePosts`, `authManageProfile`, `authViewAll`, `chat.bsky.authFullChat`, etc.) merged December 12, 2025 (PR #4349, discussion #4437); live deployment confirmed March 2026. `com.atproto.*` remains excluded from permission sets, as the addendum recorded.
- **Permission sets are lexicons any namespace owner can publish** (via `goat`, resolved through authenticated lexicon resolution), constrained to resources under their own NSID namespace. CSN can publish `network.coopsource.*` permission sets when Stage 4 needs them; upstream explicitly wants apps requesting _one set per namespace_ (many fine-grained scopes in consent = "bad security UX").
- `@atproto/oauth-scopes`: **0.5.3, published July 1, 2026** — five releases since the May docs (0.4.0 May 19 was a breaking bump; 0.5.0 May 26; 0.5.1–0.5.3 June 16–July 1). Shipped ≠ API-stable; the "watch version bumps" pin in CLAUDE.md remains warranted.
- `@atproto/pds` is now **0.5.14** — a 0.4→0.5 major-line jump since CLAUDE.md's "0.4.212+" pin. Worth a compatibility check before the next PDS-touching stage.

### 4. Lexicon Community (`community.lexicon.governance.*` path)

- **No governance namespace exists** — current directories are `app`, `bookmarks`, `calendar`, `interaction`, `location`, `payments`, `preference`. CSN's lane is open; there is also nothing to conform to.
- The process is formal and gated (verified verbatim from the governance repo): additions require a **TSC-voted working group** — _only TSC members may propose working groups, so non-TSC members must seek sponsorship_ — and merges require an agreed "do not merge before" date plus **≥2 TSC-member approvals**. The process is actively used. Practical implication: if CSN wants `community.lexicon.governance.*` to be community-owned rather than CSN-owned, the critical path starts with **finding a TSC sponsor**, and that path is measured in months. Stage 6 is correctly not gated on this.

### 5. Adjacent signals

- **HappyView** ships **experimental Proposal 0016 support** ("membership-gated data containers with per-user repo state, cross-service credentials, and write notifications") behind a feature flag — still the only public AppView platform with spaces support, still a reference implementation per V11 posture. **Same-day addendum — HappyView 2.10 (June 30, 2026) supersedes this**: the spaces implementation was realigned to the merged proposal with **breaking endpoint migration from `dev.happyview.space.*` to `com.atproto.space.*` (protocol routes) and `com.atproto.simplespace.*` (management routes)** — the first public sighting of the upstream NSID surface. It ships **LtHash commit signatures** (described as _deniable_), the `listRepoOps` oplog, write notifications with concrete names (`registerNotify`, `notifyWrite`, `notifySpaceDeleted` — note: `notifyWrite` matches the refuted gist's vocabulary, so that source was at least partially directionally right on notifications), a redesigned access model (**mint policy**: `member-list` | `public` | `managing-app`; **app access**: `open` | `allowList` — the OAuth-spaces seam's app-policy half, made concrete), a new **`read_self` access level** for member-data isolation (first observed extension beyond the proposal's `(DID, read|write)` minimality — watch whether this becomes convention), authority-DID + creator-DID tracking, and AppView service identity (did:web/did:plc with `atproto-proxy` service proxying). Also: the **GitHub repo (`gamesgamesgamesgamesgames/happyview`) is active and primary again** — v2.10.2, June 30, 202 releases, 873 commits — the May addendum's "GitHub stale at v1.4.3, use Tangled" correction is itself now stale; update the watchlist endpoint.
- **Private Data WG** (discourse thread t/750): active May 14–23 (simulator, identity/authorization split, draft lexicons); quiet in June — the work moved to the proposals/atproto repos and leaflet posts.
- **Germ DM: still iOS-only** (public beta, North America + Europe; no Android announced). Tier 3 remains correctly optional.
- The workflow's adversarial verification **refuted** four claims sourced to a purported April 2026 "Spaces Design Spec" gist (ngerakines): the XOR-SHA256 `SetHash` placeholder, a concrete `ats://<ownerDid>/...` form, and `notifyWrite`/`notifyMembership` push mechanics. Any reasoning that leaned on that gist should be considered unsourced.

---

## Part II — Codebase state (what V11 actually is in code today)

Branch inspected: `codex/v11-atproto-alignment-planning` (33 commits ahead of `main`; `main` is docs-only; only the Stage 1 feature branch exists besides this one, unmerged).

### What exists

| Layer              | Package                    | State                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — Spaces         | `packages/spaces-consumer` | **July 5 correction:** real skeleton, gated off. `SpaceRef`, `SpacesConsumer`, `GroupDirectoryPort.resolveSpaceMembers`, `SpaceCredentialStore`, Kysely checkpoint store, and `PermissionedRepoPort` as the public watch/sync/verification boundary. No `EcmhVerifier`/`CommitDigestVerifier` export exists in current code. Wired via `startSpacesConsumer` behind `SPACES_CONSUMER_ENABLED=false`, starts with `spaces: []`, handlers log-only. |
| 2 — Arbiter        | `packages/arbiter-client`  | **Real code, simulated substrate.** ~1,380–2,217 LOC + 3 test files. `CsnDbGroupDirectoryPort` and `CsnDbGroupMutationPort` (906 LOC) read/write CSN's own `membership`/`membership_role` tables (`source.adapter: 'csn-db'`), audit to `fact_log`; `PdsDidProvisioningPort` sketch. **No XRPC client, no external arbiter, no controlled-DID provisioning against a real service** — explicitly a temporary stand-in per the Stage 2 plan docs.  |
| 3 — GovernanceView | `packages/governance-view` | **Does not exist.** No code, no `GovernancePluginSet`, none of the ten plugin interfaces.                                                                                                                                                                                                                                                                                                                                                         |
| 4 — CoopView       | `packages/coop-view`       | **Does not exist.**                                                                                                                                                                                                                                                                                                                                                                                                                               |

### What genuinely changed (the recent commits on this branch)

- **Bilateral membership is gone at the lexicon level**: `org.membership` and `org.memberApproval` JSON deleted. Replaced by `network.coopsource.org.memberConsent` (consentType: joinRequest / invitationAcceptance / bootstrapOwner / networkJoin), whose own description says active membership authority lives in the Group Directory / Arbiter substrate, _not_ in the record.
- `membershipService`/`networkService`/`authService` now route **writes** through `GroupMutationPort` (the Axis-2 command boundary); a `consentEvidenceVerifier` checks the consent record's URI+CID on join/invite paths (`routes/federation.ts`). **Reads still query the `membership` projection tables directly** — the boundary is write-only so far.
- The old firehose membership indexer is now `indexMemberConsent`, projecting consent records into the same `membership` table.

### What has not changed (all V9 retirement targets still live)

`visibilityRouter` (actively called by `proposal-service.ts:209`), `privateRecordService` + `private_record` table, `governanceLabeler` (injected into ProposalService), `IFederationClient`/`HttpFederationClient`, full RFC 9421 signing stack, federation outbox remnants (only `index.ts:357` notes "Outbox processor retired"), `cooperative-link-service`, and the `local/*` PDS/PLC classes CLAUDE.md describes as already retired. **No Stage 8 annotations exist anywhere in code.** Scale claims hold: 68 route files, ~59 services / 68 container instantiations, 103 DB tables (incl. `did_rotation_history`, `spaces_consumer_cursor`), 88 web pages, 163 test files.

### Documentation gaps found

- CLAUDE.md describes container registrations (`spacesConsumer`, `arbiterClient`, `governanceView`, `coopView`) that don't exist — reality is `groupMutations` + `consentEvidenceVerifier` in the container plus a free-function consumer bootstrap.
- CLAUDE.md's former example `expectedSpaceType: 'network.coopsource.org.spaceType.members'` referred to lexicons that did not exist. July 5 follow-up: Proposal 0016 now makes space types lexicon-resolved `"type": "space"` declarations, and CSN has draft declarations under `packages/lexicons/network/coopsource/org/spaceType/` exported outside generated record schemas until atproto tooling supports the new type.
- The docs' recorded ecosystem picture is frozen at May 8–22; the two-week watchlist cadence (§18.3) has been missed twice (due ~June 5 and ~June 19).

---

## Part III — Gap analysis: May assumptions vs July reality

### Grading the addendum's own forecast (2026-05-11, §6.4)

| Open question                         | Predicted (confidence)             | Outcome                                                                                                                                           | Verdict                                                 |
| ------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| URI scheme                            | `ats://` survives (70–80%)         | **`at://` reused** with `/space/` segment                                                                                                         | ❌ Wrong — but hedged correctly by Pitfall #3           |
| URI order                             | SPACE-first (80–85%)               | Space-first: `at://{spaceDid}/space/...`                                                                                                          | ✅ Right                                                |
| URI authority                         | space-DID (65–70%)                 | Space authority DID is the URI root                                                                                                               | ✅ Right                                                |
| Controlled-DID API scope              | minimal (85%)                      | Arbiter draft has just `createDid`/`updateDidDoc`; proposal defers richer lifecycle                                                               | ✅ Right so far                                         |
| Personal→community DID transition     | no upstream solution in 12mo (80%) | Nothing landed; June 2 post leaves community-DID provisioning to arbiters                                                                         | ✅ Holding                                              |
| Fine-grained ACL expansion            | 50/50 in 18mo                      | Diary 6 chose the _boring_ model — one list, reader-side writes, no protocol roles                                                                | ✅ On the "no expansion" side; plugin-set answer intact |
| Sync substrate changes (post-quantum) | ~50%                               | **ECMH → LtHash, explicitly for quantum security**                                                                                                | ✅ Right, for the anticipated reason                    |
| `$publish`/`$labeler` formalization   | ~70%                               | Not formalized; arbiter lexicons use open unions instead                                                                                          | ⏳ Open, leaning against                                |
| **OAuth-spaces seam**                 | ~50% in 6mo (the one Medium risk)  | **Substantially resolved in ~1 month**: three-token credential flow + client allow/deny lists (Diary 6 + proposal + PR #5187 oauth-provider work) | ✅ Resolved faster than predicted                       |

Seven of nine graded predictions were right or holding. The one clean miss (`ats://`) is precisely the detail the architecture refused to depend on. This is strong evidence the §17.3 design-pivot policy — commit to semantics, treat tokens/algorithms/wire formats as substrate behind ports — is calibrated correctly.

### Concrete drift items (codebase ← upstream)

1. **Digest verification boundary corrected July 5.** The digest is LtHash. The original report recommended renaming `EcmhVerifier`; current code instead exposes verification through `PermissionedRepoPort.sync(...)`. Keep LtHash implementation details inside concrete repo adapters until a separate verifier boundary is proven necessary.
2. **URI helpers can firm up.** `at://{spaceDid}/space/{spaceType}/{skey}/{authorDid}/{collection}/{rkey}` is the current proposal text. Still marked "likely to change," so keep it in helpers — but the helpers can now parse/emit this shape instead of remaining agnostic placeholders. `SpaceRef` needs zero changes; consider documenting `arbiterDid` ≙ proposal's "space authority."
3. **The OAuth-spaces seam has a shape.** Plan Stage 4 around the three-token flow: Axis-1 failure = delegation-token/scope problem; Axis-2 failure = not on member list (no space credential); app-not-authorized = client attestation rejected by the space's client-ID policy. `SpaceCredentialStore`'s short-lifetime/refresh-per-batch design matches Diary 6's short-lived space credentials.
4. **Arbiter alignment target now exists.** Map `GroupDirectoryPort`/`GroupMutationPort` methods to `town.muni.arbiter.*` NSIDs (resolveSpaceMembers/listSpaces/getSpaceConfig are near-verbatim matches; mutations map to createSpace/removeSpaceMember/setSpaceMemberAccess). The identity-vs-authorization split (Rego policies) rhymes with CSN's Axis 2 vs Axis 3 separation — CSN's plugin set operates above the arbiter's policy layer, as designed. Stage 2's gate remains uncleared: keep the CSN-DB adapters, but track the draft lexicons for the wire contract.
5. **Role-spaces validated.** June 2's "multiple typed spaces under a single community DID" is CSN's `members` + `roles/*` + `classes/*` design. No change needed; worth citing in ARCHITECTURE-V11 as upstream convergence.
6. **Reader-side write enforcement validated.** Diary 6 confirms the protocol will never gate writes — CSN's AppView cross-check (Security Requirements step 5) is not a stopgap, it is _the_ mechanism. The spaces consumer's fail-closed posture on partial/stale resolution is the right default permanently.
7. **Version pins:** `@atproto/oauth-scopes` 0.5.3 (breaking 0.4.0 in May — check usage before upgrading); `@atproto/pds` 0.5.x line (CLAUDE.md pins 0.4.212+; verify compatibility before the next PDS-dependent stage).
8. **IETF correction:** the ATP WG charter excludes non-public data; spaces standardization stays in bluesky-social/proposals + community venues for now. The docs' "IETF 125 Vienna July" should read IETF 126 (July 18–24).

### Stage-gate implications

| Stage                         | Gate status as of today                                                                                                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 (spaces consumer)           | Ungated; skeleton built. Real digest verification + repo pull should target proposal 0016 / `@atproto/space` when consumable, behind `PermissionedRepoPort`.                                  |
| 2 (arbiter integration)       | **Gate not cleared** (no shipped XRPC reference impl), but materially closer: draft lexicons + simulator exist. CSN-DB adapters remain the right interim.                                     |
| 3 (membership/roles)          | Controlled-DID ops exist in draft arbiter lexicons (`createDid`/`updateDidDoc`) and PR #5187's managed spaces. URI decision effectively made (`at://`+segment). Gate substantially de-risked. |
| 4 (governance→spaces)         | OAuth-spaces seam now has a concrete mechanism (three tokens + client policy). The gate is moving from "unknown mechanism" to "unshipped mechanism."                                          |
| 6–7 (GovernanceView/CoopView) | Ungated and unstarted — now the largest purely-CSN-controlled gap. Diary 6's minimal protocol auth confirms the plugin set carries all cooperative semantics, as designed.                    |

### Recommended actions (not yet done)

1. Refresh ARCHITECTURE-V11.md §17/§18 and the CLAUDE.md ecosystem sections with this report's findings (per the standing rule: sync architecture docs before implementing). Fix the container-registration and spaceType-lexicon claims in CLAUDE.md that no longer match code, and the IETF meeting number.
2. Keep the public digest/sync seam on `PermissionedRepoPort`; note LtHash as the current upstream target and implement it inside a real adapter when primitives are available.
3. Point URI helpers at the `at://…/space/…` shape (still behind helpers).
4. Draft the `GroupDirectoryPort` ↔ `town.muni.arbiter.*` mapping table as the Stage 2 convergence plan; consider engaging in the WG thread (t/750) — the arbiter authors are actively soliciting lexicon feedback, and `resolveSpaceMembers` semantics (depth, partial results, staleness) is exactly where CSN has implementation experience to contribute.
5. Begin the Lexicon Community TSC-sponsorship conversation early if community ownership of `community.lexicon.governance.*` is still the goal — the process is gated and slow; Stage 6 rightly doesn't wait for it.
6. Reinstate the two-week watchlist cadence (last recorded scan May 22; two cycles missed). The volume of June change justifies it.

---

## Sources

**Upstream primary:**

- Proposal 0016 "Permissioned Data" — [proposal text](https://github.com/bluesky-social/proposals/tree/main/0016-permissioned-data) · [PR #94 (merged; opened Jun 23, active through Jul 3)](https://github.com/bluesky-social/proposals/pull/94)
- Implementation: [bluesky-social/atproto#5187 (74-commit draft, last commits Jul 2)](https://github.com/bluesky-social/atproto/pull/5187)
- Holmgren diaries: [Diary 6 "Boring Auth" (Jun 5)](https://dholms.leaflet.pub/3mnkrxp7rt22i) · ["Modeling communities on permissioned data" (Jun 2)](https://dholms.leaflet.pub/3mndhk7ihsc2g) · [index](https://dholms.leaflet.pub)
- Arbiter: [Progress Report 2 (May 21)](https://zicklag.leaflet.pub/3mmepk7yics26) · [Progress Report 1 (May 13)](https://zicklag.leaflet.pub/3mlqx45sxjk2a) · [draft lexicons](https://lexicon.garden/browse/town.muni.arbiter) · [WG thread t/750](https://discourse.atprotocol.community/t/750)
- Official: [Spring 2026 roadmap (Mar 24)](https://atproto.com/blog/2026-spring-roadmap) · [permission-sets guide](https://atproto.com/guides/permission-sets) · [permissions spec](https://atproto.com/specs/permission) · [ATP WG at IETF](https://datatracker.ietf.org/group/atproto/about/) · [kickoff post](https://atproto.com/blog/kicking-off-the-atp-working-group)
- Permission sets: [discussion #4437 (Dec 10 2025)](https://github.com/bluesky-social/atproto/discussions/4437)
- Lexicon Community: [org](https://github.com/lexicon-community) · [lexicon repo](https://github.com/lexicon-community/lexicon) · [governance](https://github.com/lexicon-community/governance)
- npm: `@atproto/oauth-scopes` 0.5.3 (2026-07-01), `@atproto/pds` 0.5.14 (registry, fetched today)
- Ecosystem: [happyview.dev](https://happyview.dev) · [HappyView 2.10 release (Jun 30)](https://happyview.dev/blog/happyview-2.10) · [github.com/gamesgamesgamesgamesgames/happyview (v2.10.2, active)](https://github.com/gamesgamesgamesgamesgames/happyview) · [blog.muni.town](https://blog.muni.town) (nothing since Mar 25) · [Leaf 0.3](https://blog.muni.town/leaf-0-3-the-server-behind-roomy/) · Germ DM iOS-only: [TechCrunch (Feb 18)](https://techcrunch.com/2026/02/18/a-startup-called-germ-becomes-the-first-private-messenger-that-launches-directly-from-blueskys-app/), [WebProNews](https://www.webpronews.com/germ-launches-ios-app-for-encrypted-bluesky-messaging-with-mls/)
- Meri: [Evaluating permissioned spaces (Apr 10)](https://meri.leaflet.pub) — no newer Arbiter posts

**Verification:** deep-research workflow, 101 agents / 724 tool calls; 3-vote adversarial verification per claim; refuted-source note: the "ngerakines Spaces Design Spec" gist claims (SetHash placeholder, concrete `ats://` form, push-notification mechanics) failed verification and are excluded. Where the workflow's diary-derived conclusions (ECMH, "probably not at://… ats:// likely") conflicted with the merged proposal text fetched today, the proposal text is authoritative in this report.

**Codebase:** three Explore agents over `codex/v11-atproto-alignment-planning`; key paths: `packages/spaces-consumer/src/`, `packages/arbiter-client/src/`, `apps/api/src/container.ts`, `apps/api/src/appview/spaces-consumer-dispatch.ts`, `packages/lexicons/network/coopsource/org/memberConsent.json`, `ARCHITECTURE-V11.md` §9/§15–§18, `docs/plans/2026-05-08…2026-05-17` series.
