# ATProto Spaces Alpha (2026-08-20) — Impact Analysis for CSN

**Written:** 2026-08-20, the day of the upstream announcement. This document is
the ecosystem-track deep sweep that was due 2026-08-12, expanded to a full
impact analysis because the event is the largest upstream change since V12
froze its conformance baseline.

**Revised:** 2026-08-20 (same day) after an adversarial three-reviewer pass —
fact-check against primary sources, cross-doc consistency against the code,
and a judgment red-team. Corrections are folded in place; the substantive
ones: the A2A version history was wrong (v1.0 is March 2026; the extension
mechanism predates 1.0), the "richer `notifyWrite` payload" delta was false
(the old pin already required all four fields), Phase 4A gained the DPoP
key-custody scope and an execution-order fix (oracle before DPoP), and the
managing-app recommendation now carries explicit security preconditions.

**Follow-up:** week-1 upstream assessment (2026-08-26 — no drift; deploy
branch for the PDS image; four WG threads incl. `createActorAuth`):
`docs/plans/2026-08-26-spaces-alpha-week1-upstream-assessment.md`.

**Event:** Bluesky released the **Atproto Spaces alpha** —
[announcement](https://atproto.com/blog/atproto-spaces-alpha) — comprising an
updated Proposal 0016, published alpha SDK packages, a spaces-enabled PDS
distribution (hosted + Docker image), and an official sample app (Bulletin).
Upstream will push **weekly updates (Thursdays)** to the hosted PDS and SDKs
during the alpha, announced on the atmosphere.community announcements thread,
targeting full launch later in 2026. Alpha caveats are explicit: no security
review yet, breaking changes and destructive migrations expected, the hosted
PDS will be deleted after the alpha.

**Source pins for this analysis** (all inspected locally under
`~/projects/utm/vmshared/bluesky/bluesky-social/`):

| Source | Pin | Date |
| --- | --- | --- |
| `bluesky-social/proposals` 0016 | `54c9cf5` (HEAD) vs our baseline `1caad93` | 2026-08-19 vs 2026-07-02 |
| `bluesky-social/atproto` PR #5187 (`permissioned-data`) | `89deb9fac` | 2026-08-20 |
| `bluesky-social/bulletin` | `ccca73d` | 2026-08-20 |
| npm alpha train | `0.0.0-spaces-alpha-20260818163953` (`@atproto/space`, `oauth-scopes`, `oauth-client-node`, `sync`, `lex-*`, …) | published 2026-08-18 |
| npm stable lines | `@atproto/pds` 0.5.29, `@atproto/oauth-scopes` 0.5.9 | 2026-08-20 |
| Bulletin's vendored lexicon pin | atproto `2f77206ff80` (the alpha-package publish commit) | — |
| CSN baseline audited | `main` @ `adcaf17`, plus direct file verification | 2026-08-20 |

---

## 0. TL;DR

**The V12 bets aged very well.** The URI scheme, the LtHash digest, the
signed-context+HMAC deniable commit, the pull-based sync model, the
writer-set-is-not-membership rule, the two-gate (protocol verification →
cooperative acceptance) design, the four-layer placement of space management
above the protocol, and the managing-app adapter shape are all now **confirmed
by shipped reference code**, not just by a draft. Spec drift since our
2026-07-02 pin is only +105/−37 lines across 4 commits.

Five things changed or became newly concrete:

1. **Space credentials are DPoP-bound proof-of-possession tokens, not bearer
   tokens** (`cnf.jkt` + per-request proofs). This is the one real refactor in
   our consumer stack, and ARCHITECTURE-V12 §9's "bearer tokens" sentence was
   wrong as of 2026-08-14.
2. **`@atproto/space` is published** (alpha dist-tag) with exactly the
   primitives our ports were designed to swap in (`verifyCommit`,
   `verifyRepoCarFull`, `RepoCommit`, `LtHash`, `createDpopProof`). Build-vs-use
   register row 3's trigger ("use when published") has fired — recommended
   posture below is *differential first, swap later* because of weekly alpha
   breakage.
3. **The live-PDS *infrastructure* blocker dissolves**: `ghcr.io/bluesky-social/atproto:pds-spaces-alpha`
   plus the branch's multi-PDS dev-env harness make a fully local
   create-space → addMember → write → sync → verify loop possible. What
   remains is CSN-side: audit finding A-06 (re-graded in the register:
   "gates any real-PDS exercise") and automating the OAuth flow against the
   local PDS — though dev/legacy access JWTs verifiably drive the full
   credential two-hop in the reference handlers, so a non-OAuth harness path
   exists today.
4. **Two long-standing open questions answered upstream**: §12-q7 (commit
   format) went *our* way — signed-context+HMAC won over HappyView's
   HMAC-only shape, settled for the alpha baseline (`ver: 1`) — and §12-q9
   (notification identity) landed on DID service-fragment audiences, matching
   CSN's DID-audience verifier design; the July pin's URL-derived audience is
   gone. The CSN side of q9 (the endpoint itself) is still ours to build
   (Phase 4A item 8).
5. **A handful of small interop fixes** are needed: `com.atproto.space.getSpace`
   was removed (moved to `simplespace.getSpace`), the CAR index moved to
   canonical DAG-CBOR ordering (we sort with `localeCompare`), `read_self` now
   ignores `collection`, new `listBlobs`/`unregisterNotify` methods, and space
   deletion got concrete semantics (`SpaceDeleted` on credential renewal;
   syncers must drop copies **and derived state**).

Direct conformance checks performed today: our MAC construction
(`HKDF-Expand`-only) and LtHash are **conformant** with the alpha's clarified
spec; the CAR index ordering is the one confirmed nonconformity in what we
have built (minor). The DPoP gap (point 1) is a missing mechanism rather than
a nonconformity — and it, not the ordering fix, is the real interop break.

Also per the user's direction, an **A2A (Agent2Agent) protocol investigation**
has been added to the program plan as an unscheduled research track (§8).

---

## 1. What shipped upstream

- **Spec** — `proposals/0016-permissioned-data` updated in place; it remains
  "a proposal, not the final specification". Changes since our pin are §2.2.
- **Reference implementation** — PR #5187 (`permissioned-data` branch), now
  199 files / +16.6k lines over `main`: one **new package** (`packages/space` →
  `@atproto/space`, in-repo version 0.0.1), 29 new lexicons (20
  `com.atproto.space.*` + 9 `com.atproto.simplespace.*`), 67 changed files in
  `packages/pds` (25 XRPC handlers — 18 `space.*` + 7 `simplespace.*` —, an
  actor-store `space/` reader+transactor with 9 new tables, a
  `SimpleSpaceManager`, client-attestation verifier), `space:` scope support
  through the OAuth stack, and space AT-URI grammar in `@atproto/syntax`
  (`SpaceRef`, `AtUri.makeSpace`, DIDs-only enforced). Not touched: `bsky`
  AppView, ozone, relay/firehose, `@atproto/sync`, `@atproto/api`.
- **Topology** — the PDS plays both **repo host** (each member's per-space repo
  lives in their own actor store) and **space host** (the authority's PDS mints
  credentials, tracks the writer set, fans out notifications). A dedicated
  non-PDS space host is anticipated by the protocol (`#atproto_space` /
  `#atproto_space_host` DID-document entries with `#atproto`/`#atproto_pds`
  fallbacks) but not shipped. Permissioned repos have **no MST** — flat record
  set + oplog; the CAR is (signed commit, flat path→CID index, record blocks);
  the verification unit is the whole index.
- **SDK surface** — typed bindings for space XRPC are **generated per project**
  (`lex build` from `@atproto/lex`); `@atproto/api` has no space support and
  Bulletin dropped it entirely in favor of the `@atproto/lex-*` client stack.
  This generational shift is a new watch item in its own right.
- **Sample app** — Bulletin (bulletin.my): one Next.js process that is
  simultaneously a mini-AppView (SQLite cache), the **managing app** (policy
  delegate answering `checkUserAccess`), and a registered syncer. It
  demonstrates the full intended consumption loop, including LtHash/commit
  verification and CAR recovery fallback — verification is table stakes even in
  the minimal sample.
- **Infra** — hosted alpha PDS (invite-gated) and
  `ghcr.io/bluesky-social/atproto:pds-spaces-alpha`, compatible with the
  reference PDS distribution.

## 2. Assumption audit

### 2.1 Held — V12 assumptions now confirmed by shipped code

| V12 assumption (ARCHITECTURE-V12) | Alpha reality | Notes |
| --- | --- | --- |
| URI `at://{spaceDid}/space/{spaceType}/{skey}/{authorDid}/{collection}/{rkey}` (§5) | **Exact**, DIDs-only enforced in `@atproto/syntax` | `space-uri.ts` helpers remain correct |
| Space = `(authority DID, type NSID, skey)` (§2) | Exact; `skey` ≤ 512 bytes, rkey syntax | `SpaceRef` mapping holds; `arbiterDid` ≙ space authority |
| LtHash digest (§5, §9) | Exact: 1024×u16 lanes, BLAKE3-XOF expansion, element `{collection}/{rkey}/{cid}`, commit hash `sha256(state)` | Our `Proposal0016LtHash` verified conformant |
| Signed-context+HMAC deniable commit (open q7) | **Won.** `ctx = "atproto-space-v1"‖…`, `sig = sign(ctx)`, `mac = HMAC-SHA256(HKDF-Expand(ikm, ctx, 32), hash)`, `ver: 1` | Our `Proposal0016CommitVerifier` uses `expand()` — conformant with the clarified KDF ([permissioned-sync.ts:151](../../packages/spaces-consumer/src/permissioned-sync.ts)) |
| Pull sync: `listRepoOps` + `getRepo` CAR recovery + periodic `listRepos` sweeps + best-effort notifications (§5) | Exact; oplog is a compactable transport optimization with no history guarantee (resets on migration); values inlined by default with `excludeValues` opt-out; `signedCommit` attached at head | `XrpcPermissionedRepoPort`'s reconcile-on-wakeup design matches the reference consumer loop nearly 1:1 |
| `listRepos` is writer discovery, never membership (§5) | Verbatim in spec and lexicon descriptions; readers never enumerated at protocol level | Fail-closed membership cross-check above verification remains exactly right |
| Two gates: protocol verification then application acceptance (§9) | Bulletin (the official sample) implements the same double enforcement: protocol protects sources; the app re-filters per-viewer in front of its member-credentialed cache | Sanctioned pattern for AppViews |
| No relay; Tier 2 never on firehose; firehose still needed for `#account`/`#identity` (§5, §8) | Exact; a slimmed identity-only subscription is flagged as future work upstream | Public lifecycle reconciliation validated |
| Space management sits *above* the protocol (§2, four layers) | Spec: management implementations are identified by their own lexicon namespace; `simplespace` is the required PDS baseline; bespoke implementations are "full protocol participants … hosted on bespoke space services" | The protocol now names the extension point the arbiter concept was betting on |
| Managing-app adapter shape (Phase 4 checkpoint) | `checkUserAccess` served by the managing app; authority calls with itself as `iss`, managing app's service id as `aud`; **unreachable managing app fails closed** upstream | Our disabled `CsnGroupDirectoryManagingAppAccessPolicy` matches; Bulletin proves the pattern in production |
| Credential lifecycle: short-lived, refresh-per-batch, member-change invalidation as defense-in-depth (§9) | Credentials are 2 h, per-application (renewable via any one member session; app loses access when it loses all sessions); mint-time-only policy evaluation | `SpaceCredentialManager` semantics consistent; local invalidation remains CSN-side defense-in-depth, not protocol revocation |
| E2EE out of scope; Tier 3 optional (§8) | Spec: "access control, not confidentiality"; E2EE explicitly layerable above, out of scope | Germ-optional stance validated |
| Moderation via labels inside the access boundary, no separate labeler (§11 commitments) | Spec (non-normative): labelers are "just another reader"; publish labels **as records in a permissioned repo within the space**, not via public `subscribeLabels` | Refines our cooperative-controlled label policy with a concrete placement |
| Space type declarations (`"type": "space"` lexicons) (§4) | Shipped, plus a second new lexicon kind `"type": "permission-set"`; alpha `@atproto/lex` tooling accepts both | Unblocks our excluded `network.coopsource.org.spaceType.*` declarations when we adopt alpha tooling |

Also held: personal spaces as own-DID authorities (zero DID-doc changes needed);
`applyWrites` atomic batches sharing a `rev`; account-lifecycle semantics
(migration enumerates `listSpaces`; deactivation/deletion as public).

### 2.2 Changed — spec drift since our 2026-07-02 pin

Only four substantive commits; in descending impact:

1. **DPoP-bound space credentials** (2026-08-14). Rationale: a bearer
   credential is a shared secret any repo host could replay against every other
   host in the space. Now: the app generates a keypair per credential, sends a
   DPoP proof at `getSpaceCredential` (no `ath`), the authority mints with
   `cnf.jkt`, and **every** read/sync request carries
   `Authorization: DPoP <credential>` plus a fresh proof (`ath` = hash of
   credential, `htu`/`htm` per host, `jti` replay-checked).
   *Affected CSN code:* `TwoStepSpaceCredentialIssuer` (mint-side proof),
   `SpaceCredentialStore`/`KyselySpaceCredentialStore` + `SpaceCredentialManager`
   (a credential is now credential+keypair; key lifetime = credential lifetime),
   `CredentialedPermissionedRepoPort`, `XrpcPermissionedSyncClient`, CAR
   recovery, blob verifier, and `registerNotify` calls (presentation-side
   proofs). *Affected docs:* ARCHITECTURE-V12 §9 ("bearer tokens" → corrected in
   this change). `@atproto/space` ships `createDpopProof`/`dpopJktForKey`.
2. **`com.atproto.space.getSpace` removed** (2026-08-19) — space configuration
   reads are now `com.atproto.simplespace.getSpace`, accepting an OAuth
   `read_self` grant **or** a space credential; `listMembers` now needs only
   `read_self` (was `manage`). *Affected:* `XrpcGroupDirectoryPort` (calls the
   old method), `permissioned-data-draft.ts` method registry, conformance
   probe.
3. **Interop precision fixes** (2026-08-19): MAC KDF pinned to
   `HKDF-Expand(ikm, ctx, 32)` (we already conform); **CAR index ordering
   changed** from lexicographic to canonical DAG-CBOR map order (shortest key
   first, then bytewise), with record blocks required in index order. Our
   [car-permissioned-repo-recovery.ts:203](../../packages/spaces-consumer/src/car-permissioned-repo-recovery.ts)
   sorts decoded entries with `localeCompare` — order-insensitive for digest
   correctness (LtHash is commutative) but non-canonical and locale-dependent;
   small fix.
4. **Method/semantics adjustments** (2026-08-13/19): permission-set entries may
   now carry `manage`; `read_self` ignores `collection` (read is uniformly
   all-or-nothing at the space boundary); new `com.atproto.space.listBlobs` and
   `unregisterNotify`; the spec text now states `notifyWrite` carries
   `{space, repo, rev, hash}` (the implementation already required all four
   fields at our July pin — a spec-text catch-up, not a wire change);
   `notifySpaceDeleted` goes to registered syncers only; **repo hosts are not
   notified on space deletion** (a member's records are their own; they simply
   become unreadable to others); syncers that miss the notification learn via
   an explicit `SpaceDeleted` error at credential renewal — any other renewal
   failure says nothing and the copy is retained.

Proposals **0013/0014/0015 are untouched** since our pin — the service-auth
spec basis of audit tranche 3 is intact. 0015 (JSON subscriptions) is unrelated
to spaces sync: spaces remain pull + service-auth webhook, no event stream.

### 2.3 New facts CSN must now handle

- **Notification identity resolved (V12-S09)**: `registerNotify` subscribes a
  **service identifier** (`did#fragment`); delivery is resolved via the DID
  document and service-auth'd with `aud` = that service id, `lxm`-bound;
  delegation-token `aud` is `{spaceDid}#atproto_space_host`. The July pin's
  URL-derived audience is gone; CSN's DID-audience verifier design is the
  correct target. Registrations expire (TTL ~1 day in the reference PDS) and
  need renewal scheduling; to receive push at all, CSN must publish a service
  entry in its own DID document and expose a service-auth-verified
  `notifyWrite`/`notifySpaceDeleted` endpoint (Bulletin: `did:web:bulletin.my#bulletin`).
  Periodic sweeps remain the correctness backstop either way.
- **Space-deletion obligation**: on `notifySpaceDeleted` or `SpaceDeleted` at
  renewal, a syncer must delete its copies **and derived state**. Our consumer
  has writer-removal handling but no whole-space deletion path → new work item
  (replica rows, checkpoints, credential rows, and projections for that space).
- **Standing-service credential sourcing is still unsolved upstream**: even
  Bulletin mints sync credentials by borrowing end-user OAuth sessions
  (authority's, else any stored follower's). There is no service-identity
  delegation path. CSN's documented posture — a cooperative-designated managing
  session pool (`SPACE_MANAGING_SESSION_DIDS`) — remains necessary and is the
  only shape upstream currently supports; note the accountability cost
  (standing sync runs under an individual member's authority) and keep the
  upstream gap on the watchlist.
- **Client attestation is enforceable but optional**: only `appAccess: allowList`
  spaces require it (verified against the OAuth client's published JWKS);
  `#open` spaces work with public clients. Our deterministic signer port stays;
  production key custody (§12-q1) is only needed if/when CSN gates spaces on
  app identity.
- **Alpha instability is a design input**: weekly breaking changes, DB schema
  resets, hosted PDS deleted post-alpha, `@atproto/space` at 0.0.1. Pin exact
  snapshot versions and Docker digests; never couple CI to the hosted PDS.
- **`swapCid` compare-and-swap is scaffolded** in the PDS space transactor but
  not yet exposed by any lexicon — directly relevant to the Tier-2 copy-ledger
  limitation (no conditional-CID delete). Watch; do not build around its
  absence permanently.

## 3. Conformance status of CSN's pinned implementation

Verified today, directly or via the inventory agents:

| Area | Status | Evidence |
| --- | --- | --- |
| LtHash construction | **Conformant** | `Proposal0016LtHash` matches lanes/expansion/digest exactly |
| Commit context + MAC | **Conformant** (including the `HKDF-Expand`-only clarification) | [permissioned-sync.ts:151-152](../../packages/spaces-consumer/src/permissioned-sync.ts) uses `expand(sha256, ikm, ctx, 32)` |
| Commit signature verification | Conformant shape (`@atproto/crypto` against repo signing key); re-verify `kid` handling (`#atproto_space` fallback chain) against alpha | `Proposal0016CommitVerifier` |
| CAR two-root parse + index fold | Functionally compatible; **index ordering non-canonical** (`localeCompare`), and we don't enforce block order | [car-permissioned-repo-recovery.ts:203](../../packages/spaces-consumer/src/car-permissioned-repo-recovery.ts) |
| Credential flow | Two-step flow correct; **missing DPoP** end-to-end | §2.2-1 |
| XRPC method registry | Stale: includes removed `space.getSpace`; missing `listBlobs`, `unregisterNotify`, `simplespace.getSpace`/`deleteSpace`/`updateSpace` coverage | `packages/lexicons/src/permissioned-data-draft.ts` (pin `3f6c96d5`; closeout item 12 already queued a repin, now superseded by the alpha pin) |
| Upstream `getRepo` | Now **implemented** upstream — our differential probe's "PR #5187 lacks getRepo" expectation is obsolete; full-recovery can be exercised against the reference | probe profiles in `permissioned-conformance.ts` |
| HappyView differential target | Demoted: the spec resolved **against** its HMAC-only commit shape; keep as a secondary diagnostic only | spike doc + §2.1 |

## 4. Simplification opportunities

1. **Adopt `@atproto/space` as a differential oracle now; swap runtime
   internals at beta.** Our primitives are conformant today and behind ports;
   the alpha package will break weekly. So: add the alpha packages (pinned
   exact snapshot) as dev-dependencies, add a conformance test asserting our
   verifier/digest agree with `verifyCommit`/`RepoCommit`/`verifyRepoCarFull`
   on shared vectors, and schedule the runtime swap for upstream's first
   stable, **security-reviewed** release — the alpha's own "no security review
   yet" caveat is part of the swap trigger, not just API stability. This
   converts build-vs-use row 3 from "build" to "use-pending, differential in
   place" with near-zero risk. A side benefit of keeping our conformant
   primitives meanwhile: two independent implementations of security-critical
   verification code have assurance value while upstream's is unreviewed.
2. **Replace the external-infrastructure harness blocker with the alpha PDS.**
   `pds-spaces-alpha` (Docker) + the branch's `TestNetworkNoAppView`
   multi-PDS dev-env give us a fully local space-enabled network. The Phase 4
   live-XRPC exercise (`exercise-draft-xrpc-pds.ts`) currently demands
   pre-existing restorable OAuth sessions; against a local alpha PDS we can
   mint real sessions — or drive the whole flow with dev/legacy access JWTs,
   which the reference handlers verifiably accept end-to-end (`assertSpaceScope`
   passes non-OAuth credentials through, bounded by `repo == caller` on repo
   operations; the credential exchange authenticates its second hop by
   delegation token + DPoP alone) — and run
   create → addMember → write → sync → verify end-to-end in CI-shaped tooling.
   Note the A-06 finding (missing `repo:` scope request) **gates the
   real-OAuth path** — the audit register re-graded it: member writes will be
   rejected by a released PDS until it closes. The dev-JWT path is the interim.
3. **Re-baseline the conformance probe on the alpha PDS as primary oracle.**
   `atproto-pr-5187` profile → repin to `89deb9fac`/the weekly image;
   `happyview-2.12.0-dev.2` becomes secondary/diagnostic. Expectations updated
   for implemented `getRepo`, DPoP headers, and `simplespace.getSpace`.
4. **Watchlist consolidation.** Published packages + a single announcements
   venue collapse several watch items; the Muni-Town-arbiter urgency drops
   (simplespace-required + bespoke-space-service is the blessed shape; a
   Roomy-style host is now just one candidate adapter). See §6.
5. **A near-term production shape without a bespoke space host.** Cooperative
   spaces can run on a stock spaces PDS with `policy: managing-app` pointing at
   CSN (the adapter exists and is mode-gated); membership authority stays in
   CSN's `GroupDirectoryPort` while the PDS enforces at mint time, failing
   closed if CSN is unreachable. The bespoke cooperative space host (own
   management namespace) remains the long-term direction, but is no longer a
   prerequisite for real permissioned governance data. **Activation
   preconditions** — V12-S10 must weigh these, not only the availability edge
   of the mint-time synchronous dependency on CSN: (a) `checkUserAccess` is a
   new pre-credential inbound surface on `apps/api`; it does not activate
   while N-16/N-17 (token path) and the unreviewed `apps/api/src/ai/` surface
   are open on the same app, and its service-auth verification resolves the
   caller's DID document (for `did:web` authorities through
   `packages/common/src/did-web.ts`, the S-08 SSRF root), so S-08 closes
   first — the same applies to the Phase 4A item-8 notification endpoint;
   (b) the endpoint is a membership oracle over Tier 2 data — `iss` must bind
   to the specific authority DID CSN already trusts for that cooperative, not
   any resolvable DID; (c) with mint-time delegation, a CSN compromise
   becomes protocol-level credential issuance for every delegating space — an
   integrity blast radius, not only an availability edge.

One question this section deliberately leaves open: what the alpha lets us
*delete*. No removals identified yet — the HappyView probe profile's carry
cost and the hand-rolled SimpleSpace client scaffolding (versus generated
`lex` bindings) are the first candidates; revisit after Phase 4A items 3
and 7.

## 5. Proposed work package — "Phase 4A: spaces-alpha alignment"

Added to the program plan under Phase 4 as checkbox tasks (4A.1–4A.9).
Numbered here; the suggested execution order is in §9. One reviewed commit per
item where feasible — 4A.2 and 4A.5 may split (mint-side/presentation-side;
deletion/renewal). TDD per repo practice.

**Alpha-churn rule:** items are built against the 4A.1 pin. If a Thursday
drop lands mid-package, finish in-flight items against the existing pin and
batch the repin as its own follow-up commit — do not chase. Expect DPoP
*details* to drift (the mechanism was six days old at pin time; server-nonce
hardening is a plausible follow-up): keep proof construction behind one
helper so drift is a one-site change.

1. **Repin the conformance baseline** (S): `permissioned-data-draft.ts` →
   proposal `54c9cf5` + atproto `89deb9fac` (record the npm snapshot version
   and Docker image digest alongside). Registry updates: −`space.getSpace`,
   +`space.listBlobs`, +`space.unregisterNotify`,
   +`simplespace.getSpace`/`deleteSpace`/`updateSpace`, `listMembers` auth
   `manage`→`read_self`; `notifyWrite`'s `rev`+`hash` were already required
   at our pin — verify only. Update the conformance-probe profiles
   (`getRepo` becomes *required* for the atproto profile, DPoP headers,
   `simplespace.getSpace`) and re-verify the commit `kid`
   `#atproto_space`→`#atproto` fallback chain. Supersedes closeout item 12's
   `3f6c96d5 → c5962d7` repin. No consumer schema change is implied —
   `listRepos` rev/hash are already consumed.
2. **DPoP end-to-end** (M, may split): per-credential ES256 keypair; proof at
   mint (no `ath`); proofs on every presentation (`ath`, per-host `htu`).
   For the proof helpers, an **explicit carve-out from the differential-first
   posture**: use `createDpopProof`/`dpopJktForKey` from `@atproto/space` as
   a regular pinned *runtime* dependency (there is no existing CSN
   implementation to preserve, so nothing is given up), or implement to
   RFC 9449 with the oracle's proofs as fixtures — either way, land 4A.7
   first. Includes the **key-at-rest custody decision**:
   `KyselySpaceCredentialStore` persists credentials in Postgres to survive
   restarts, and under DPoP the stored unit becomes credential+private key —
   choose encrypt-at-rest, in-memory-only keys accepting re-mint on restart,
   or external key storage. Also: the `space_credential` schema change routed
   per the hard rule (edit `schema.ts` and regenerate `schema.sql`), and
   sweep the now-stale bearer-token JSDoc in `credential-store.ts`. The
   writer path is excluded — `XrpcPermissionedRecordWritePort` authenticates
   with the author's OAuth session, whose DPoP is the OAuth stack's concern.
3. **`simplespace.getSpace` migration** (S): `XrpcGroupDirectoryPort` +
   probe. Note the reference impl's OAuth path to `getSpace`/`listMembers`
   additionally requires caller == space authority, so the directory adapter
   can only enumerate members of spaces whose authority session CSN holds
   (the managing session pool) — or must present a space credential where
   accepted (`getSpace` yes, `listMembers` no).
4. **CAR canonical ordering** (S): replace `localeCompare` with
   length-then-bytewise canonical DAG-CBOR ordering and verify received order
   fail-closed (the spec now MUSTs index and block order).
5. **Space-deletion handling** (M, may split): consumer path for
   `notifySpaceDeleted` + `SpaceDeleted`-at-renewal → drop
   replica/checkpoint/credential state and projections for the space;
   audit-log the drop without leaking Tier 2 metadata. Prerequisite detail:
   the exchange client currently conflates `SpaceDeleted` with
   `SpaceNotFound` into one `'invalid-space'` error kind
   (`oauth-space-credential-exchange-client.ts`), but the alpha requires
   opposite behaviors (deleted → drop copies; any *other* renewal failure →
   retain) — `SpaceCredentialErrorKind` needs a distinct kind.
6. **Local alpha-PDS harness** (M): docker-compose profile for
   `pds-spaces-alpha` (pinned digest); rewire the live-XRPC exercise to it;
   promote to a CI-optional integration suite like the federation suite.
   A-06 gates the real-OAuth path (per the register's re-grade); the verified
   dev-JWT path drives the loop until it closes.
7. **Differential adoption of `@atproto/space`** (S): pinned dev-dependency +
   agreement tests for digest/commit/CAR (see §4-1). Land before 4A.2 — its
   `createDpopProof` output is the fixture generator DPoP needs.
8. **Notification endpoint activation design** (M, design-first): CSN service
   DID + service entry, service-auth verification (`aud` = CSN's service id,
   `lxm`-bound, `iss` bound to the space authority), registration renewal
   scheduling; resolves the CSN side of V12-S09 with the now-known upstream
   contract. Carries the same inbound-surface preconditions as §4-5 (S-08
   closes first). Implementation can trail; sweeps remain correctness.
9. **Scope revalidation** (S): check our requested grants
   (`manage=create,update`, collection defaults, `read` vs `read_self`)
   against alpha `ScopePermissions` — CSN's collection-qualified `read_self`
   requests are now ignored by the grammar. The §4 namespace decision
   (`network.coopsource.org.spaceType.*` as publication namespace vs internal
   draft to remap) fires here and at 4A.6 — the first real `space:` scope
   requests. Publishing CSN permission-set lexicons for Bulletin-style
   `include:` scopes is *not* required for raw `space:` scopes — deferred.

Explicitly *not* in the package: adopting `@atproto/lex-*`/codegen as the
client stack (watch; revisit when the generation shift stabilizes), building a
bespoke space host, migrating runtime digest/commit internals onto
`@atproto/space` (differential-first per §4-1; the DPoP-helper carve-out in
4A.2 is the deliberate exception), `space.applyWrites` batching (no CSN call
site needs multi-record atomicity yet), and any Tier-2 cutover decisions
(still gated by V12-S01/S05 signoffs).

## 6. Open questions & watchlist — dispositions applied to ARCHITECTURE-V12 §12

| Item | Disposition |
| --- | --- |
| q7 commit format (signed-ctx+HMAC vs HMAC-only) | **Settled for the alpha baseline** (`ver: 1`) — alpha ships signed-ctx+HMAC; HappyView's shape lost, demoted to secondary diagnostic. The spec's "likely to change" disclaimer still applies; `ver` is the compat seam and the weekly watch covers it |
| q9 notification identity/audience | **Answered upstream** — DID service-fragment audiences; the CSN side (endpoint, service entry, renewal) stays open as Phase 4A item 8 / V12-S09 |
| q11 managing-app activation | **Mechanics answered** (service identifier form, callback contract, fail-closed on unreachable app); remaining: trust set, operator, appeal policy, and the §4-5 security preconditions (V12-S10) |
| q4 production authority hosting | **Enriched** — supported combination now concrete: stock PDS `simplespace` + `managing-app` policy near-term (with §4-5's activation preconditions); bespoke space service long-term |
| q1 client-attestation custody | Narrowed — needed only for `allowList` spaces; defer until CSN gates on app identity |
| q2 Lexicon Community | Process correction applied to §12 (working groups self-form since 2026-07-26 — no TSC gate, per the audit record); substance unchanged |
| q5 cross-modality routing, q6 `$publish`/`$labeler`, q3 Subchapter T, q8 retention/re-homing, q10 lifecycle topology | Unchanged |
| **New**: standing-service credential sourcing | Upstream gap; CSN managing-session-pool posture stands |
| **New**: `@atproto/api` → `@atproto/lex-*` generation shift | Watch; affects future SDK adoption |
| **New**: `swapCid` CAS | Watch for the Tier-2 copy-ledger delete contract |

Watchlist changes: primary venues are now the atproto.com blog, the
atmosphere.community **announcements thread** (weekly Thursday alpha updates),
PR #5187, and the 0016 file itself. **Cadence: weekly during the alpha**
(align to upstream Thursdays; next check 2026-08-27), reverting to two-week
after launch. The weekly check is a **light pass** — read the announcements
thread, diff the four pins, note deltas in the watchlist — minutes, not a
sweep; escalate to a deep sweep only on a breaking drop or a spec-level
change (commit format, credential model, sync methods). Diary quiet since
Jul 17. Registry pins refreshed (`pds` 0.5.29, `oauth-scopes` 0.5.9, the
alpha snapshot train).

## 7. Documentation state

Applied in this change (surgical, dated):

- **ARCHITECTURE-V12.md**: header note; §1 alpha amendment; §3 seam update
  (shipped + DPoP + `read_self` all-or-nothing); §5 current-state corrections
  (upstream `getRepo` now implemented; DPoP; commit format settled); §9
  bearer→DPoP correction; §10 build-vs-use rows 2/3, phase-map status column
  (phases 1–3 tagged; 4–7 checkpoints merged), and container-registration
  sentence; §12 rewritten per §6 above.
- **CLAUDE.md**: stack watch paragraph (published alpha packages, corrected
  registry pins), watchlist date, current-state paragraph corrections (counts:
  **108** DB tables, **86** web pages, routes 68 confirmed; container sentence
  updated — ~10 spaces/arbiter objects *are* container-registered, only the
  consumer orchestrator is module state), pointer to this document.
- **Program plan**: dated header note; ongoing-track sweep recorded; Phase 4A
  as checkbox tasks with an expansion-first task per plan convention (§5); A2A
  research track (§8); the build-vs-use register copy marked as a frozen
  snapshot (live register in ARCHITECTURE-V12 §10); TSC-gate references
  corrected to self-formed working groups; sequencing-summary cadence line
  fixed.

The same-day adversarial review pass produced this revision: corrected A2A
version history, the false `notifyWrite` delta, and two counts; restructured
Phase 4A; added the managing-app security preconditions and the DPoP
key-custody scope; and propagated the §12 corrections into ARCHITECTURE-V12
§3/§5 and the plan's stale references.

Known remaining doc debt, deliberately *not* done here: the broad stale-docs
repair is already on the adopted audit program as **Phase 8 item 7 /
finding M-26** ("active docs contain no broken commands or architecture
claims"), and the program plan's own Phase 1 checkboxes were never ticked
despite execution. Also noted for the audit/housekeeping track: all 34
non-main local branches are merged but undeleted, and phase tags lapsed after
`v12-phase-3`.

## 8. A2A protocol investigation (added to the program plan)

Per the maintainer's direction (2026-08-20): investigate the **A2A
(Agent2Agent) protocol** as a channel for connecting cooperatives to
coordinate activities, agreements, and inter-coop workflows. Status: v1.0
(**March 2026**), v1.0.1 patch (May 2026); the protocol's extension mechanism
predates 1.0 (added in v0.2.2); Linux Foundation governance, 150+ supporting
organizations, first-party support across major cloud agent platforms.

**Why it belongs on the plan**: the Spaces alpha draws ATProto's boundary
sharply — access control without confidentiality, records-of-fact without
transactional coordination, no service-task semantics, moderation-visible
data. Inter-cooperative *coordination* (negotiating an agreement draft,
scheduling joint activities, delegating work to a cooperative's agent,
requesting quotes/capacity) is task-shaped and often ephemeral — a better fit
for an agent-task protocol than for permissioned records. Not everything needs
to be ATProtocol; ATProto remains the **system of record** (identities,
memberships, ratified agreements, governance outcomes), while A2A would carry
the *conversations between cooperatives' agents* that produce those records.

**Investigation scope** (deliverable: a dated research doc + a build-vs-use
register row): **classify candidate task/artifact payloads against the §8
data tiers first** — agreement-*draft* negotiation content is Tier 2 by that
table's own definition ("draft proposals", "confidential agreements"), so the
investigation must either scope the non-goal precisely to "no data already
inside a space is re-exported" and state the confidentiality/retention story
for negotiation payloads that would live on both agents' infrastructure, or
drop those flows. Then: map the surviving inter-coop flows to A2A
tasks/artifacts; the identity bridge (cooperative DIDs ↔ A2A AgentCards —
discovery from, or attestation by, the cooperative's DID document) plus
**AgentCard discovery integrity** (spoofing/substitution, not just
attestation); trust and authorization model versus CSN's five axes (a sixth
axis, or an Axis-5 sibling?); **inbound tasks treated as untrusted
cross-organization input** — a prompt-injection surface terminating on
`apps/api/src/ai`, which the audit has not yet reviewed; **provenance
anchoring** of negotiation transcripts, so ratified outcomes keep an evidence
trail; where task outcomes anchor back into ATProto records; and **a
comparison against the incumbent channels** (the surviving inbound federation
routes and spaces records) so one workflow does not accrete three transports.
**Non-goals**: replacing ATProto records as the system of record, federated
governance over A2A, and re-exporting data already inside a space.

**Priority**: explicitly after spaces-spec support (Phase 4A); unscheduled
research track.

## 9. Sequencing recommendation

The audit remediation program remains the in-flight track (next:
C-06 + N-3 + N-4 money bugs, per the 2026-08-17 handover), and nothing here
requires preempting it. Phase 4A is the next *substrate* package and is
independent of the audit backlog except for two touchpoints: A-06 (`repo:`
scope) gates the real-OAuth path of the local harness (item 6), and the
Tier-2 delete contract should watch `swapCid`. Suggested order when spaces
work resumes: **4A.1 (repin), then 4A.7 (the oracle — its proofs are DPoP's
fixtures), then 4A.2–4A.4, then 4A.6, then 4A.5, 4A.8, 4A.9**. Re-run the
ecosystem check weekly (Thursdays) during the alpha — a light pass per §6,
cheap now that venues are consolidated.

---

*Research inputs: four parallel deep-read agents (0016 diff, PR #5187
inventory, Bulletin analysis, CSN ground truth) over the locally cloned
upstream repos, plus direct verification of CSN's digest/MAC/CAR code paths
and npm registry state. Full agent evidence retained in the session
transcript; every load-bearing claim above carries its pin or file reference.*
