# Spaces Alpha, Week 1 — Upstream Assessment (2026-08-26)

**Written:** 2026-08-26 (Wednesday). This performs the weekly watchlist check
(due 2026-08-27) one day early, prompted by the maintainer pointing at the
`createActorAuth` discussion, and expands it to cover the four live WG
threads plus a full pin re-verification. The first weekly Thursday drop is
expected **tomorrow (2026-08-27)** — nothing has shipped since launch.

**Companion to:** `docs/plans/2026-08-20-spaces-alpha-impact-analysis.md`
(the alpha impact analysis; its pins, Phase 4A package, and §12 dispositions
remain the baseline — this document records what moved in the week after).

**Bottom line:** no code, spec, or package drift since our pins; one infra
change (the PDS image now builds from a dedicated deploy branch); and four
upstream discussions, one of which — `com.atproto.server.createActorAuth` —
is the first upstream movement on our recorded "acting for the cooperative"
gaps (§12 items 4 and 12). Nothing changes Phase 4A's items or order. All
impact lands as watchlist/open-question updates plus one provisioning-order
design note.

---

## 1. Upstream state (verified 2026-08-26)

| Source | State vs our pin | Detail |
| --- | --- | --- |
| `proposals` 0016 | **Unchanged** (`54c9cf5`) | zero commits since 2026-08-19 |
| atproto PR #5187 | +1 infra commit | `5fbc9a007` (2026-08-24, dholms): removes the `pds-spaces-alpha` image-tag rule from the PR branch |
| **New: `permissioned-data-alpha` branch** | — | The PDS image now builds from this **deploy branch** (`4c33457af`, 2026-08-24); the tag stays `ghcr.io/bluesky-social/atproto:pds-spaces-alpha`. The branch **force-updates** (observed: forced from `2f77206ff`, the alpha package-publish commit) and tracks the *deployed* weekly snapshot, distinct from the moving PR branch |
| npm alpha train | **Unchanged** | `alpha` = `0.0.0-spaces-alpha-20260818163953`; no new snapshot |
| `bulletin` | +1 trivial | `2e72c14` ("add more calls to action") |
| Announcements thread | Launch post only | `discourse.atmosphere.community/t/atproto-spaces-alpha-updates/1129` (dholms, 2026-08-20): Thursday updates "when possible", breaking changes expected across PDS dist, hosted PDS, and SDKs; feedback via the **WG Private Data** tag |
| Also observed | — | a `permissioned-data-lex-refactor` branch exists upstream (the lex migration continues) |

**Consequence for Phase 4A pins:** the deployed alpha (image + npm snapshot)
comes from `permissioned-data-alpha`, not from PR HEAD. 4A.1 should record
**both** pins — PR head (spec-leading) and the deploy-branch head (what the
oracle and harness actually run) — and 4A.6 must pin the image **by digest**,
since the branch behind the tag force-updates. Recorded in the plan.

## 2. `com.atproto.server.createActorAuth` (t/1140) — the load-bearing thread

**What it is** (sketch by ngerakines, out of a Working Groups call,
2026-08-21; revised through 2026-08-26): a delegated counterpart to
`getServiceAuth` — an authorized *actor* (e.g. a community moderator) obtains
a short-lived token to perform **one** XRPC request **as** another identity
(e.g. the community account). Mechanics: the authorizing service (whoever
controls the represented identity's `#atproto` key) policy-checks the full
request at issuance, then mints a JWT (`typ: actor-request+jwt`) signed with
the represented identity's key — claims `iss` (represented DID), **`act`
(the true actor, for attribution)**, `aud`, `lxm`, `jti` (one-time), ≤60 s
expiry, and SHA-256 bindings of the query string, body, and content type.
It is never presented alone: it rides inside the actor's own inter-service
auth (an `arq` claim), and the receiver must check outer `iss` == embedded
`act`. Required headers (`atproto-identity`, `atproto-aud`) and the
presentation binding were firmed up during the thread.

**The contested core** — and it matters to us: **Holmgren pushed back** with
the "null hypothesis": in the Atmospheric Groups model the group host *is*
the repo host, one service, so a plain OAuth credential issued and verified
by the group host suffices — no new protocol mechanism. **zicklag** (the
Roomy/Arbiter author) argues the protocol mechanism is needed anyway:
without it, acting-for-a-community across apps degrades to per-community
re-authentication, app-side allow-lists, or one dangerous unrestricted
"delegated accounts" OAuth grant — versus today's public-data UX where one
login with scopes covers everything. A `delegated:` scope prefix (e.g.
`delegated:repo:app.bsky.feed.post?action=create`) was sketched for
consent-screen presentation. Status: **sketch, contested, no PR, no
lexicon** — treated as a working draft in the Community Standards WG.

**Impact on CSN** — this thread is upstream arriving at our problem space:

1. **§12 item 12 (standing-service credential sourcing): adjacent movement,
   not the answer.** createActorAuth is per-request (60 s, single-use,
   request-hash-bound) — it does not solve standing sync credentials. But
   the surrounding discussion ("login as community" OAuth flows,
   `delegated:` scopes) is the first upstream traffic on the
   acting-for-a-community territory our managing-session-pool posture
   works around. Watch; no posture change.
2. **The `act` claim is the attribution mechanism we flagged as missing.**
   The impact analysis noted the accountability cost of standing sync
   running under an individual member's authority, and that space
   credentials carry no holder identity. If actor-request semantics land,
   CSN's write paths should adopt them for exactly that reason.
3. **"Policy-checked at issuance, with the full request content visible to
   the policy engine" is our Layer 2/3 seam, verbatim.** Whichever design
   wins, the policy engine evaluating "may this member do this as the
   cooperative" is CSN's membership/roles/governance machinery
   (`MembershipReadModel`, `GovernancePluginSet`). Both outcomes are
   absorbable behind `GroupMutationPort`/ports — the wire mechanics differ,
   the policy seam does not. This is the insulation property working as
   designed; no refactor implied.
4. **Key custody could get better.** zicklag's proposal: instead of an
   external authorizing service sharing the account's `#atproto` private
   key, the PDS recognizes a per-account **additional verification method**
   (e.g. `#acting`) controlled by the external service. Holmgren's own
   co-discussant called it "much nicer". For CSN — which today holds
   cooperatives' `#atproto` signing keys outright — a delegated
   `#acting`-style key would narrow the blast radius of a CSN compromise
   and move CSN toward holding only delegated authority. **New watch item**
   with real architectural upside; nothing to build yet.
5. **Signal about the bespoke-host long-term shape** (§12 item 4):
   Holmgren's stance implies an Atmospheric Groups host is *one service*
   that hosts the spaces, hosts the repos, runs role/access logic
   internally, and issues OAuth credentials itself. If that framing wins,
   CSN's eventual bespoke cooperative space host grows an OAuth
   authorization-server component. If the protocol path wins, CSN's AppView
   can stay an external authorizing service. Either way the port boundary
   holds; recorded under item 4.

## 3. "Spaces — unauthorized write notifications" (t/1157)

**What it is** (rochebit, 2026-08-25; replies through 08-26): a design gap,
not a vulnerability. Space hosts **silently drop `notifyWrite` from
identities not currently authorized** — correct fail-closed behavior, but it
means there is no in-protocol way to deliver an *invitation* into a space
the recipient hasn't created or joined yet (race: the invite can't arrive
until the recipient already participates). Options aired: accept the
limitation; buffer non-member notifications (spam vector); move invites
off-protocol; auto-provisioned "inbox" spaces. No fix chosen.

**Impact on CSN:** validating, with one design note.
- CSN's invitation flow is **already off-protocol by design** (addressed,
  single-use, DID-bound invite links — the Phase 3 work). This thread
  confirms in-protocol invite delivery is unresolved upstream: our flow is
  the durable design, not a stopgap. No change.
- **Provisioning-order rule made explicit:** because non-member writes and
  notifications are dropped, cooperative and per-(coop,member) personal
  spaces must be **created (and members added) before writers write** —
  CSN's provisioning already runs owner-side (`createSpace` → `addMember`),
  so this is an assumption to state in the Phase 4A.0 task plan, not new
  work.
- For 4A.8: upstream's drop-unauthorized behavior matches the fail-closed
  posture our inbound endpoint will mirror. No change.

## 4. "Spaces — interoperable fine-grained permissioning" (t/1161)

**What it is** (Habitat/arushibandi, 2026-08-25): a proposed
relationship-based access-control layer above spaces — four opinionated
roles (reader/writer/manager/owner), user-sets as DID groups, standardized
as lexicons for cross-app interop. Exploratory; Habitat is prototyping;
replies point at parallel group-primitive efforts (communities WG,
OpenSocial Groups). No core-team position yet.

**Impact on CSN:** placement-rule validation plus a future adapter
candidate. This is now the third independent effort (after `simplespace`
policies and CSN's own role spaces) building roles *above* the protocol —
reconfirming that role semantics stay in Layer 2/3, never the substrate. If
a community role/user-set lexicon stabilizes, CSN's role-space model
(`roles/<slug>`, `classes/<slug>`) would want a port↔lexicon mapping the
same way `town.muni.arbiter.*` was treated as prior art. Watchlist item
(plus the term "OpenSocial Groups"); nothing to build.

## 5. "Authority in atproto spaces" (t/1123)

**What it is** (chrisshank, 2026-08-18): a critique that records are bound
to the space they were created in (no "object permanence" / multi-space
membership) and that space-authority governance "seems implicitly feudal"
when apps anchor spaces on their own DIDs. A reply proposes records
authorized by 0–n spaces. **Holmgren's response: space authority should be
a community-governed DID** — pushing the governance question to community
governance rather than protocol change. Exploratory; no protocol change
proposed.

**Impact on CSN:** Holmgren's answer *is* CSN's §11 commitment — cooperative
DIDs (distinct from any founder's personal DID, rotation keys offline) as
space authorities, governed by the cooperative's own machinery. CSN is the
existence proof for the model he's pointing at. The 0–n-space record idea
would touch our URI helpers and `GovernanceRecordPlacementPort` if it ever
became real; it is speculative — watch only.

## 6. Dispositions

**Phase 4A: unchanged** in items and order. Two pin clarifications added to
the plan (deploy-branch pin in 4A.1; pin-by-digest note in 4A.6) and one
assumption for the 4A.0 task plan (provisioning-order rule, §3 above).

**ARCHITECTURE-V12 §12 updated:** item 4 (group-host framing signal), item
12 (createActorAuth movement + the delegated-verification-method watch),
new item 14 (in-protocol invitation gap; off-protocol invites are the
design), watchlist paragraph (checked 2026-08-26; thread URLs; deploy
branch; lex-refactor branch; next due 2026-08-27 — the first drop itself).

**Handover** (`2026-08-21-session-handover-spaces-alpha.md`): dated addendum
appended; bootstrap prompt unchanged except reading this document.

**Memory:** watchlist and V12 memories updated with the venue URLs, deploy
branch, and thread pointers.

**Not done, deliberately:** no feedback posted to any thread
(outward-facing; needs user review — candidates: CSN implementation
experience with off-protocol invites for t/1157, and the
cooperative-governed-authority experience for t/1123/t/1140).

---

*Venues (record):* announcements
`…/t/atproto-spaces-alpha-updates/1129`; createActorAuth `…/t/1140`;
unauthorized write notifications `…/t/1157`; fine-grained permissioning
`…/t/1161`; authority `…/t/1123` — all under `discourse.atmosphere.community`,
WG Private Data / Community Standards tags.*
