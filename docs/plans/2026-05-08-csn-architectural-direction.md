# CSN Architectural Direction: Spaces, the Arbiter, GovernanceView, and CoopView

> **Date**: May 8, 2026
> **Status**: Research report intended to guide CSN's design direction going forward; informs the eventual V11 architecture document
> **Supersedes**: Earlier research report at `2026-05-08-spaces-and-csn-research.md` (which framed the work as "rebuild on spaces")
> **Reads**: ARCHITECTURE-V9.md, ARCHITECTURE-V10.md, current schema and services in `apps/api`, `packages/db`, `packages/lexicons`, all permissioned-data diaries, the Arbiter design, current ATProto OAuth specification (`atproto.com/specs/oauth`), the proposed `0011-auth-scopes` proposal, the `@atproto/oauth-scopes` reference implementation, and HappyView 2's release notes

---

## 0. Executive Summary

CSN has the unusual privilege of being a proof-of-concept project with no users, no deployment, no commercial deadlines, and an explicit design goal of "model the problem and solutions correctly without compromise at the design level." The corollary is that whatever architecture survives this phase should be one CSN believes in for years, not a workaround for protocol gaps that are about to close.

The protocol gaps are closing now. Permissioned data ("spaces") have moved from sketch to design to first experimental implementation in roughly fifteen weeks. ATProto OAuth's granular permission system has shipped a working scope grammar (`repo:`, `rpc:`, `blob:`, `account`, `identity`, plus lexicon-defined permission sets). HappyView 2 has demonstrated that the AppView layer can be a single binary with native OAuth and pluggable indexing. The Arbiter design has shown how generic group/role management can sit on top of spaces in a way that's interoperable across applications.

Five architectural commitments fall out of this analysis:

1. **CSN treats authority as a small set of distinct axes rather than a single ACL.** OAuth scopes govern *app-to-user* authority (which apps can act on a user's behalf for which lexicons). Spaces govern *user-to-user* authority (which users can read or write within a permissioned context). Application logic governs *user-to-action* authority (whether a particular user, in the appropriate space, may perform a particular governance action). Labels and service-auth JWTs sit alongside as adjacent axes. The axes are not strictly orthogonal — they interact at write checkpoints — but separating them in code is what distinguishes a debuggable authorization model from V9's tangled one.

2. **CSN adopts the Arbiter pattern as its group-management substrate.** A cooperative is an arbiter. Roles (board, officers, treasurer, member classes, custom roles) are spaces. Networks of cooperatives are arbiters whose `members` space contains other arbiter DIDs (recursion), giving the recursive cooperative model a protocol-level expression. CSN stops inventing access control; it expresses cooperative governance in terms of arbiter primitives.

3. **CSN builds a generic governance layer that other ATProto projects can use.** GovernanceView is a standalone service providing generic governance primitives — proposals, votes, deliberations, anchor records, transparency logs, vote-tally aggregation, role-state derivation — on top of Arbiter spaces. It is co-designed with Roomy and any other group-shaped ATProto application that needs governance. Its lexicons live in `community.lexicon.governance.*`.

4. **CSN's distinctive cooperative semantics live in CoopView, layered on GovernanceView.** Cooperative-specific concerns — Subchapter T compliance, patronage allocation, capital accounts, multi-stakeholder weighted voting, ICA principle adherence, financial period tracking, 1099-PATR generation, agreement lifecycle — are extensions of GovernanceView rather than the substance of it. CoopView's lexicons stay in `network.coopsource.*`.

5. **CSN keeps the application substance from V9.** Governance, agreements, legal, finance, operations, commerce, alignment, agents — these are the cooperative semantics that can't be commoditized into a generic governance layer because they're cooperative-specific. They survive into V11. What changes is what they sit on: a Spaces + Arbiter + GovernanceView foundation rather than a PostgreSQL bilateral-membership + six-tier-ACL foundation.

This report works the design through in detail. Section 1 sets background context from V9. Sections 2 through 4 describe the current state of the ecosystem, focusing on the three authority axes. Sections 5 and 6 work out the layered architecture and the concept-by-concept mapping from V9 patterns to spaces-native patterns. Sections 7 and 8 specify GovernanceView and CoopView. Section 9 elaborates on future CSN capabilities the layered architecture enables. Section 10 sketches a transition plan (no schedule, just sequencing). Section 11 lays out the ecosystem engagement plan. Section 12 records the design decisions. Section 13 is a strawman for the Layer 3 / Layer 4 interface boundary.

---

## 1. Background: where V9 got CSN

### 1.1 V9's posture and what it got right

V9 was the architecture that turned CSN from "a cooperative platform happening to be on ATProto" into "a composable governance service that's a real ATProto ecosystem citizen." V9 (March–April 2026) was the third major refactor: V5 brought CSN's lexicons and AppView into a coherent shape, V6 retired the parallel federation stack and committed to real `@atproto/pds` + `did:plc` + the bsky.network relay, and V9 separated the application layer (governance, agreements, legal, finance, operations, commerce, alignment, agents) from the network and the platform.

The V9 architecture has held up well. Its load-bearing decisions were sound:

- Cooperatives are real ATProto accounts with their own DIDs and self-hosted PDSes.
- Members bring their own ATProto identities. CSN never asks a user to create a CSN-specific account.
- Records of authority live in PDSes; PostgreSQL is a materialized index for query.
- The application code in `apps/api` is structured around domain services (`MembershipService`, `ProposalService`, `AgreementService`, `LegalDocumentService`, `PatronageService`, `CapitalAccountService`, `AlignmentService`, etc.) that compose ATProto record operations rather than fighting the protocol.
- The AppView indexer dispatch is by NSID; the hook pipeline (pre-storage, post-storage, dead-letter) gives clean integration points for derived state.
- The custom AppView is built on Express 5, Kysely 0.28, PostgreSQL 16, with TypeScript strict mode end-to-end.

These decisions transfer to V11 essentially unchanged. The application code is largely orthogonal to the access-control model and survives the migration.

### 1.2 V9's three workarounds for absent protocol primitives

Three V9 patterns exist as workarounds for ATProto not yet having the primitives CSN needs:

**Bilateral membership.** Membership status is `active` only when both the member's `network.coopsource.org.membership` record (in the member's PDS) and the cooperative's `network.coopsource.org.memberApproval` record (in the cooperative's PDS) exist. Role authority lives only in `memberApproval`. This invention compensates for ATProto not having protocol-level group semantics — the bilateral pattern is CSN's way of saying "membership requires both member intent and cooperative consent, and roles are centralized." Both of those properties are real and important. The bilateral two-record state machine is a way of expressing them in a protocol that lacks groups.

**The three-tier data model + `VisibilityRouter`.** Tier 1 (public ATProto records on the firehose), Tier 2 (private PostgreSQL `private_record` table), Tier 3 (E2EE via Germ DM / MLS). The `VisibilityRouter` decides which tier a write goes to based on the cooperative's `governance_visibility` (`open` / `mixed` / `closed`). This is CSN doing access control because the protocol doesn't.

**Custom federation primitives for cross-cooperative concerns.** The `cooperative_link` table, the V8 RFC 9421 HTTP signatures retained for closed-cooperative-to-closed-cooperative private exchange, network-level governance modeled as cooperatives whose members are cooperatives — these are CSN inventing inter-organizational affordances that the protocol has no concept of.

V10 (April 16, 2026) was a privacy and access-control work program designed to deepen these workarounds. V10.1 introduced a six-tier ordered visibility model (`public` < `all_member` < `officer` < `board` < `individual` / `individual_strict`) implemented via a `visibility_tier` enum on `private_record`, with a `checkVisibilityAccess` utility consulting both fixed tiers and a `role_definition` permissions table for custom roles. V10.2 introduced the anchor + sidecar pattern: a public `membershipSummary` record commits to membership existence, while the actual `memberApproval` records move to private storage. V10.3 made vote privacy default with aggregate tally anchors.

V10's diagnosis was correct. Three lexicons (`memberApproval`, `governance.vote`, `governance.proposal`) leaked member-identifying data to the public firehose, and that was a structural problem requiring a privacy-by-default fix. The anchor pattern was a good design choice. But V10 was designed when permissioned data was a sketch with no working implementation and no clear timeline. The six-tier PostgreSQL ACL was specifically a workaround for the protocol not having group-based access control.

### 1.3 Where V9 / V10 stand today (May 8, 2026)

V9.1–V9.3 are shipped: 594 source files, 47 lexicons, 100 database tables, 60+ services, 75 frontend pages. V10 was committed as design (`ARCHITECTURE-V10.md`, April 16, 2026) but **none of its eight phases have been implemented**. Current `private_record` has neither `visibility_tier` nor `owner_did` columns. Current `cooperative_profile` has neither `membership_public` nor `vote_visibility`. The `visibility-tier.ts` file in `apps/api/src/services/` is V8.1's request-time auth-tier resolution, which is unrelated to V10's data-storage tier. None of the lexicons V10 specified have been added.

This is a fortunate state. V10 was thoughtful design that turned out to anticipate the wrong shape of solution. Not having implemented it means there is no V10 code to migrate or to maintain in a transition. The discarded design exists only as ideas, and the ideas that remain useful (privacy-by-default, the anchor + sidecar pattern, transparency logs, content wrappers) are reincorporated into V11 at their proper level of abstraction.

---

## 2. The current state of permissioned data

### 2.1 Five decisions now locked in

Permissioned Data Diaries 1 through 5 (February through May 2026) have moved five design decisions from "argued" to "decided." These set the baseline for any V11 architecture.

**No E2EE for permissioned data.** Diary 1 established this. E2EE breaks search, notifications, trending, moderation, and recommendations. Group E2EE (MLS) scales only to ~2–10K members. E2EE is reserved for DMs specifically. Permissioned data uses access control as the privacy primitive, not cryptographic confidentiality. This is good news for CSN — it means cooperatives can do federated search, rich AppView indexing, and moderation on permissioned governance data without losing the privacy properties that closed cooperatives need. The trade is that CSN's hosting infrastructure still has access to the data; if a cooperative needs cryptographic confidentiality (board executive sessions, salary records, personnel matters), the existing Tier 3 path via Germ DM / MLS remains the right primitive.

**The primitive is "spaces."** A space is a network-wide access and sync boundary representing a shared social context. A space has an owner DID, a type (NSID), a key (skey), and a single member list. Each member has their own *permissioned repo* per space, hosted on their own PDS, holding their records for that space. The "buckets" name was retired in February.

**Spaces have their own DIDs and those DIDs are transferable.** This is the load-bearing decision from Diary 5 (May 8, 2026 — today). A space owner is *usually* a dedicated DID, not the creator's user DID, because communities change hands and embedding ownership in the creator's identity makes handoffs break every backlink. Holmgren is explicit that this implies "a lightweight controlled DID system on the PDS so user accounts can manage (and transfer!) space DIDs."

This is exactly the design CSN already accepts. CSN's cooperative DIDs are deliberately separate from the human DIDs of the people who provision them, for the same reason. The argument generalizes: any community resource whose ownership might transfer should be a separate DID.

**The URI structure is six-component.** From Diary 5: `ats://{space_did}/{space_type}/{skey}/{author_did}/{collection}/{rkey}`. The six pieces are space owner DID, space type NSID, space key, author DID, collection NSID, and record key. The space DID is the URI authority because the user's authority to write into the space is downstream of the space granting them membership. The scheme is *probably* `ats://`; Holmgren is taking suggestions. It is *not* `at://` — permissioned data resolves through a different protocol from public data and gets a different scheme to avoid leaking permissioned URIs into public contexts.

**Sync uses ECMH commits, not MSTs.** Permissioned repos use Elliptic Curve Multiset Hash — a set hash where adding/removing an element is a single point operation. Lower overhead than MSTs, but with a real limitation: ECMH commitments **do not support partial sync or single-record proofs**. Any consumer that falls behind on its oplog must fall back to a full-repo resync and verify the whole-repo digest. This shapes CSN's indexer design (see §7).

Sync is pull-based: PDSes notify the space owner of writes, the space owner notifies syncing services, services pull from each member PDS. Member-list authority is the space owner. Write enforcement is performed by readers, not by member PDSes — any user can write any record claiming any space membership on their own PDS, but readers compare incoming records against the authoritative member list and discard what doesn't match. Zicklag's Arbiter post puts this directly: "any user, at any time, can write records to a space in their own permissioned repo. We can't stop them, it's on their PDS."

### 2.2 What's still open

Several decisions remain unresolved and could affect a CSN adapter:

**Access control beyond `(DID, read|write)`.** Diary 4 says member lists are single tuples of `(DID, read|write)`, with write inclusive of read. There is no role semantics in the protocol. The Arbiter (Section 3) takes the opposite tack — collapse roles into spaces themselves — and adds 8 access levels at the *arbiter* layer that govern member-list management, not record content. The community trend appears to be "keep the protocol minimal, push richer ACLs into management services like the Arbiter." CSN endorses this direction: protocol minimality plus richer arbiter semantics matches CSN's needs.

**App allow/deny semantics within a space.** Diary 4 sketches `default-allow` vs `default-deny` flags with allowlist/denylist of application client IDs, but the OAuth flow for app-scoped space access is still being detailed. This is the seam where spaces and OAuth meet; Section 4 returns to it.

**The scheme name.** `ats://` is the leading candidate but not final. CSN should not bake `ats://` into lexicons or protocol-facing code as a constant; URI helpers should abstract the scheme.

**The controlled-DID system is future, not present.** Diary 5 defers it: "This does imply that we'll need a lightweight 'controlled DID' system on the PDS so user accounts can manage (and transfer!) space DIDs. For expediency's sake, we want to keep that scoped as tightly as possible and resist the pull toward building a generic managed-account system. But again, that's a topic for another post." This is a hard dependency for CSN — cooperative DIDs, role-space DIDs, and personal-space DIDs all need it — and it is not yet specified. Treat as a future capability when planning.

**Whether the implementation matches the design.** Holmgren has committed sketch code to the `permissioned-data` branch in `bluesky-social/atproto`. Diary 5 closes with: "I have some very rough sketches of an implementation on a public branch in the atproto repo. Please don't over-index on it!" The spec and the implementation are co-developing; treat the branch as evidence of feasibility, not as an interface contract.

**Sync protocol details may shift.** Diary 5 ends with Holmgren saying he thought sync was settled but is reconsidering as the cryptographic landscape evolves. CSN should treat the ECMH choice and the pull-based notification topology as the current best understanding, not as load-bearing assumptions. The shape of CSN's indexer (pull from member PDSes, verify digests, fall back to full resync) survives whatever Bluesky picks; the specific commitment scheme does not.

### 2.3 Reference implementations

In rough order of maturity, what's running today:

- **HappyView 2.5.0 — "The Permissioned Data Release" (May 5, 2026).** First public AppView with experimental permissioned-spaces support behind a feature flag. HappyView 2 itself (April 24) is a single binary that absorbs Tap and AIP, ships SQLite as default, includes native DPoP-bound OAuth, and offers a WASM plugin system with Lua scripting for custom indexer hooks. This is the most concrete spaces code in the world today. CSN should treat it as a reference implementation worth running and reading, even if not as production substrate (Section 5).

- **`bluesky-social/atproto` `permissioned-data` branch.** Active, sketch-stage. Worth tracking for protocol shape.

- **Zicklag's Arbiter (April 18, 2026).** Specification, not yet shipping. Detailed in Section 3.

- **Roomy / Muni Town.** Have committed to going ATProto-native using permissioned data. Roomy spaces will be a special kind of community PDS repo. Their roadmap: private spaces + invites, permissioned channels + roles, AppView+XRPC refactor, push notifications. Building the Arbiter in parallel.

- **NorthSky, Blacksky, Habitat.** Per the Spring 2026 Roadmap, "working in parallel to implement extensions to the protocol for non-public data." Their approaches differ from spaces — interim solutions using server-filtered visibility or domain-as-privacy-boundary.

### 2.4 Bluesky's posture

The AT Protocol Spring 2026 Roadmap (March 24) is unambiguous: permissioned data is the major Bluesky protocol team focus through the summer. Public-data work is in maintenance mode and moving to the IETF working group (chartered in late March; IETF 125 in Vienna in July). The window for influencing the design is open right now and will close as the spec stabilizes. CSN's recursive cooperative model is a useful test case the protocol team would benefit from hearing about.

---

## 3. The Arbiter pattern

### 3.1 What the Arbiter is

The Arbiter (Zicklag, April 18, 2026) is an interoperable group management service that hosts permissioned spaces and provides a standardized XRPC API for membership management. It sits *above* the spaces protocol — spaces are the storage and access primitive, the Arbiter is how an application community manages spaces.

Five primitives:

**The arbiter and its DID.** When you create an arbiter, it generates a DID that is the root of authority for the community. The community DID is separate from any individual user DID. The arbiter is the entity that owns spaces and controls space member lists. (This is exactly CSN's cooperative-as-DID model with rotation-key custody.)

**Spaces (everything).** Every role, group, channel, organizational unit is a space. The arbiter doesn't distinguish them. A `general` channel is a space. A `moderator` role is a space. An `officers` group is a space. They're all spaces with member lists.

**The `$admin` space.** A special space that always exists, can never be deleted, and grants access to every other space. Members of `$admin` can also be granted permission to create new spaces. (This is exactly CSN's `OperatorWriteProxy` + audit-log pattern, expressed as a protocol primitive.)

**Spaces can have member lists that include other spaces.** This is the bombshell. A `moderator` space being a member of a `team` space means anyone in `moderator` is also in `team`. The arbiter resolves member lists transitively. Combined with the ability for *spaces from different arbiters to be members of each other*, this enables federated channels and cross-community trust. The Roomy general channel can include the Muni Town `members` space, so any Muni Town member automatically has access. (For CSN, this *is* the recursive cooperative model: a network's `members` space contains other cooperative DIDs, which are themselves arbiter DIDs.)

**Eight access levels for member-list management.** The Arbiter defines an ordered ladder (each level builds on the ones below): Read Member List, Member, Add Members, Remove Members, Configure Space, Create Spaces (only meaningful in `$admin`), Remove Space, Owner. These govern *member-list management*, not record-content access. Application-level concepts (what `moderator` means in a chat app, what `treasurer` means in a cooperative) are up to the app to define and enforce — this is precisely the orthogonality CSN wants. Note that several of these levels (Read Member List, Member) are about whether you appear in the protocol's space member list at all; the higher levels are about who can modify it.

**Optional infrastructure spaces (addendum).** Zicklag's main post commits to `$admin`; an addendum to the same post (from discussion with `@flo-bit.dev`) proposes optional spaces that arbiter implementations may or may not support:

- `$publish` — if present, members with Configure Space access can write records to the arbiter's *public* repo. Requires the arbiter to have public-repo capabilities; not all implementations will.
- `$labeler` — if present, members with Configure Space access can create labels under the arbiter's identity.
- "Adopt an existing DID" — an arbiter can take over an existing PDS account via app password and use that PDS's public and permissioned repos rather than implementing PDS features itself. This is a deployment pattern, not a primitive.

CSN should treat `$publish` and `$labeler` as proposed and probably-coming-but-not-guaranteed. If they ship as standardized, CSN uses them. If they don't, CSN runs its own labeler and publishes public records directly to the cooperative's PDS — §6.8 and §6.9 cover both paths.

A further structural fact from the Arbiter post that shapes CSN's design: **write enforcement is reader-side**. The space owner can *list* who is authoritatively a member, but cannot prevent any user from writing claimed-membership records to their own PDS. Readers compare incoming records against the arbiter's authoritative member list and discard non-matches. This means CSN's indexer must always treat raw permissioned-repo records as unauthenticated until cross-checked against the arbiter; the membership list is the trust anchor, not the records themselves.

### 3.2 The Arbiter's relationship to the spaces protocol

The Arbiter is *not* a fork of spaces. It's an XRPC service that uses spaces as its underlying storage. The boundary:

- The protocol gives you: spaces with `(DID, read|write)` member lists, owned by space DIDs, with permissioned per-user-per-space repos.
- The Arbiter adds: a service that owns a community DID, manages many spaces under that DID, exposes an XRPC API for membership management, allows space-as-member-of-space recursion, and provides standardized public-record and labeler entry points.
- An application (Roomy, CSN) adds: meaning to particular spaces (`board` means these things, `treasurer` is one person who can do these things).

This three-layer separation is what makes the Arbiter pattern interoperable. Two arbiters from different applications can recognize each other's spaces because both speak the same XRPC API. A Roomy chat channel can include a CSN cooperative's `members` space because both arbiters speak the same protocol for resolving member lists.

### 3.3 The mapping from CSN concepts to Arbiter primitives

This is the cleanest existing protocol-level model for a cooperative on ATProto. The mapping is dense:

| CSN concept | Arbiter primitive |
|-------------|-------------------|
| Cooperative | Arbiter instance + cooperative DID |
| Cooperative's PDS-managed identity | Controlled DID, rotation key custody (Diary 5 mechanism) |
| Active member roster | The cooperative's `members` space; member list is the active membership |
| `board`, `officers`, `treasurer`, `secretary` | Each is a space; member list is the role's holders |
| Custom roles (per V9 `role_definition`) | Each becomes a space; permission inheritance becomes nested space membership |
| Probationary members | A `probationary` space; transition to `members` on completion |
| Member classes (worker, consumer, investor, multi-stakeholder) | Each class is a space; all are members of `members`; weighted-voting handled at GovernanceView/CoopView layer |
| Cooperative operators | Members of `$admin` with Configure Space access |
| Operator audit log | Built-in to the arbiter via `$admin` Configure Space writes |
| Network of cooperatives | An arbiter whose `members` space contains other cooperative DIDs (which are themselves arbiter DIDs). Recursive. |
| Cross-cooperative trust / federated channels | Cooperative A's space includes cooperative B's `members` space as a member |
| Public cooperative profile, public proposals, public reports | Records written via the `$publish` space to the arbiter's public repo |
| Closed-governance proposals, deliberations | Records in members' permissioned repos for the cooperative's `members` space |
| Board-only deliberations | Records in board members' permissioned repos for the `board` space |
| Officer-only data (compliance, financial detail) | Records in officers' permissioned repos for `officers` |
| Governance labels | Either via `$labeler` space, or CSN-owned labeler emitting against arbiter-derived state |
| Individual member records (patronage, capital accounts) | Per-(coop, member) personal space (Diary 5 mention) — Section 6.6 |

### 3.4 Why the Arbiter is structurally better than V10's six-tier ACL

V10.1 designed a six-tier ordered ACL implemented in PostgreSQL. The model is well-thought-out but has three structural weaknesses, all of which dissolve under the Arbiter pattern:

**The tiers are role-shaped but expressed as enum values.** "Officer" and "board" are tiers because they correspond to roles in CSN's role vocabulary. The Arbiter pattern surfaces the underlying truth: these are membership in different groups. Tier ordering is incidental. A cooperative wanting a `finance-committee` tier between `officer` and `board` would need to modify the enum and the access-check utility. Under the Arbiter, it's just another space.

**Custom roles need second-class extension.** V10.1 consults a `role_definition.permissions` table for any role outside the standard vocabulary, with `grants:officer_access` and `grants:board_access` permission strings as escalation flags. Ad-hoc extension. Under the Arbiter, every custom role is a first-class space with the same membership semantics as built-in roles.

**Cross-cooperative role delegation has no story.** V10's tier model is per-cooperative; there's no concept of "members of cooperative A's `treasurer` role have access to cooperative B's financial space." Under the Arbiter, "spaces can be members of spaces (across arbiters)" makes this native.

The PostgreSQL six-tier ACL is a reasonable workaround for a protocol that lacks group semantics. It is not a model that should outlive the protocol gaining those semantics.

### 3.5 Honest concerns about the Arbiter's maturity

The Arbiter is two weeks old. Zicklag's published design says "some details of this design are new since about… 6 hours ago when I should have been sleeping." The XRPC API, the access levels, the delegation semantics, and the relationship to the underlying spaces protocol will all evolve. Building against the spec today means rebuilding when it changes. The cooperative use case provides a non-chat stress test that will surface design pressure the Roomy use case doesn't — see §11.

The Arbiter is being designed primarily for Roomy. Roomy is a chat application. Cooperatives have governance, financial, and compliance requirements that aren't on Roomy's roadmap. CSN must either contribute the cooperative use case to the Arbiter design (the engagement plan in §11), or accept that the Arbiter may not cover everything CSN needs and supplement at the GovernanceView / CoopView layer (acceptable; that's the layered architecture's purpose).

The arbiter-vs-spaces boundary is still being negotiated. Some things in the Arbiter design (the 8 access levels, public access settings) may end up in the spaces protocol itself. Other things (role inheritance, cross-arbiter delegation) almost certainly stay in the arbiter layer. Until that settles, CSN's GovernanceView code has to be flexible about which layer it's calling. Concretely: the Arbiter integration (§6.7) should live behind an interface that lets it slide between "this is a protocol primitive" and "this is an arbiter XRPC call" as the boundary moves.

**Failure-mode scenarios.** If the Arbiter design pivots significantly, CSN either vendors the Arbiter behind the same interface or implements the Arbiter pattern internally and accepts diverging from whatever standard ships. Either is recoverable because CSN's mapping in §3.3 is to *primitives* (community DID, role-as-space, recursive membership) that any conceivable arbiter design will preserve. If Zicklag abandons the Arbiter entirely, CSN ships the same pattern under its own namespace. If the Arbiter ships unchanged, CSN integrates as a first consumer beyond Roomy.

These concerns are real but they don't argue for a different model. They argue for engaging with the design while building, not after.

---

## 4. The three axes of authority — and how they interact

### 4.1 OAuth is not redundant with spaces

This was settled by Holmgren in Diary 2: *"we can't just riff off of OAuth; our mechanism needs to be programmatically expressible at the protocol layer."* OAuth and spaces govern different things. They are orthogonal axes, both required, and the seam between them is one of the most important architectural surfaces in any ATProto application.

CSN's V9 architecture already has both axes implicitly (OAuth for member writes via `MemberWriteProxy`, custom ACL for access decisions), but didn't make their orthogonality explicit. V10 muddied this by trying to express access control in PostgreSQL when it should have lived elsewhere. V11 makes the three axes explicit from the start.

**Axis 1: OAuth — app-to-user authority.**

OAuth governs which applications can act on behalf of a given user, scoped to which lexicons and which XRPC methods. This is the relationship between a user and the apps the user authorizes. The user's PDS is the authorization server; CSN (as a client) authenticates with the user's PDS, requests scopes, and gets DPoP-bound access tokens.

The granular scope grammar that landed in 2025 ('proposal 0011') and is now shipping in `@atproto/oauth-scopes`:

```
atproto                             # required for any atproto OAuth session
repo:network.coopsource.org.membership?action=create  # write specific lexicon
rpc:network.coopsource.governance.castVote?aud=did:web:csn.example  # call XRPC
blob:image/*                        # upload blobs of MIME type
account, identity                   # account and identity operations
include:network.coopsource.authMember  # include another permission set
```

Permission sets are themselves lexicons (with `permission-set` schema type and `auth*` naming convention) that bundle multiple scopes with a human-readable description. Bluesky has shipped permission sets for `app.bsky.*`, `chat.bsky.*`, `tools.ozone.*`. CSN should ship `network.coopsource.auth.member`, `network.coopsource.auth.officer`, `network.coopsource.auth.board`, etc.

OAuth scopes are negotiated at session creation and attach to access tokens. Every write CSN makes on behalf of a member carries the DPoP-bound token. The PDS verifies the scope on every request.

**Axis 2: Spaces — user-to-user authority within a permissioned context.**

Spaces govern which users can read and write within a permissioned context. This is independent of which app is acting on the user's behalf. A user is a member of a space or they are not. The space owner (the arbiter, in the Arbiter pattern) controls the member list. PDSes hosting permissioned repos for a space accept writes from a user only if the user's app has OAuth scope to write that lexicon (Axis 1) *and* the user is in the space's member list (Axis 2).

When a CSN cooperative's `members` space includes Alice's DID:
- Alice's permissioned repo for that space accepts writes she initiates (governed by the user-to-user authority of being on the member list).
- *Whether Alice can write through CSN specifically* depends on Alice having granted CSN the OAuth scope `repo:network.coopsource.governance.vote?action=create`.

If Alice grants CSN the scope but the cooperative removes her from the `members` space, her votes can no longer be written into the space's repo because she's no longer authorized at the space level. If Alice is in the `members` space but hasn't granted CSN the scope, CSN can't write on her behalf. Both axes are checked.

**Axis 3: Application logic — user-to-action authority.**

Application logic governs whether a particular user, in the appropriate space, may perform a particular *governance action*. This is the cooperative-specific layer. "Alice is a member of the `members` space; CSN has scope to write votes on her behalf — but is Alice eligible to vote on this proposal?" Answers depend on application rules: the proposal's eligibility criteria (Active members only? Class A members only? Members in good standing? Probation completed?), quorum rules, voting period, delegation chains, multi-stakeholder weights.

This axis lives entirely in CSN's application code (`apps/api`'s services). Neither OAuth nor spaces enforce it. Spaces tell you "Alice can write to this space"; application logic tells you "but this particular vote on this particular proposal has rules Alice doesn't meet."

### 4.2 The seam between OAuth and spaces

The Diary 4 sketch of `default-allow` vs `default-deny` flags with app allowlists/denylists is the protocol-level expression of the OAuth/spaces seam. A space can declare which apps are permitted to operate on it. An OAuth client (CSN's web app, a third-party tool) gets a token from the user's PDS, but writes to a space's permissioned repo are only accepted if the space's app policy allows that client.

This is a real seam, and it's the one place CSN must track closely. The current state of the design:

- OAuth scope grammar is shipping and includes record-collection scopes (`repo:{nsid}`).
- Permission sets are lexicon-defined bundles with human-readable descriptions.
- Spaces' app allow/deny is sketched in Diary 4 but hasn't been fully detailed.
- It is unclear whether app authorization for writing to a space is governed by the space's policy alone, by a `permissions:{nsid}` scope on the OAuth token, by a service-auth JWT issued by the space owner, or by some combination.

CSN's design should be agnostic about which mechanism wins. The integration point is the same regardless: when CSN tries to write a vote into a space's permissioned repo on a member's behalf, the failure modes are "OAuth scope not granted," "user not in space," and "app not authorized for this space." Code should distinguish all three and surface the appropriate error.

### 4.3 Two more axes that matter, with caveats

The three axes above are the load-bearing ones. Two more sit alongside them and shouldn't be ignored, even though they don't appear in every operation:

**Axis 4: Labeler-emitted moderation labels.** Subjective judgments from labelers (Ozone, CSN's own governance labeler, third-party labelers) aren't strictly authority but materially affect what CSN does. A label like `member-suspended` gates a member from voting eligibility, even though Axis 2 says they're still in the space. A `proposal-archived` label changes how a proposal renders. Labels are public, signed records emitted by labeler DIDs and consumed by clients (and CSN's indexers). They interact with Axes 1–3: CSN's labeler emits labels based on governance state (Axis 3 inputs), the labels affect application behavior (Axis 3 outputs), and the labeler itself is an actor whose writes are governed by OAuth (Axis 1).

**Axis 5: Service-to-service authentication.** Service-auth JWTs (`com.atproto.server.getServiceAuth`) are the path AppViews use to authenticate to each other and to PDSes, separately from user-OAuth flow. They have different lifetime, key, and scope semantics from user tokens. Cross-arbiter operations (CSN's AppView reading state from another cooperative's arbiter), federation operations, and labeler operations all use this path. Brittany Ellich's opensocial.community writeup foregrounds it. CSN's V11 design must allocate it a real seat at the table; conflating it with user OAuth (Axis 1) produces broken auth boundaries.

### 4.4 The axes are not strictly orthogonal

The "three axes" framing is useful as scaffolding but it understates the interaction. At every write checkpoint, OAuth scope (Axis 1) and space membership (Axis 2) are *both* checked, in different places, by different services. A write that satisfies Axis 1 (app has the scope) and Axis 2 (user is in the space) can still fail if the space's app allow/deny policy rejects this particular OAuth client; that's the seam from §4.2. A read that satisfies Axis 2 (user is in the space) doesn't bypass Axis 3 application rules (eligibility, quorum, voting period). Axis 4 (labels) feeds into Axis 3 logic. Axis 5 (service auth) sometimes substitutes for Axis 1 when one CSN service calls another.

The code's job isn't to enforce orthogonality. The code's job is to identify, at each checkpoint, *which* axes apply and route the failure mode correctly. The taxonomy is for debuggability: when authorization fails, knowing which axis failed is the difference between fixing in five minutes and fixing in three days. The V9 codebase tangles these together; V11 separates them explicitly.

### 4.5 What CSN gains from making the axes explicit

The V9 codebase has authorization concerns scattered across `MemberWriteProxy` (OAuth-flavored), `OperatorWriteProxy` (operator auth), `VisibilityRouter` (custom ACL), `private-record-service.ts` (Tier 2 ACL), and various service-level role checks. This is fine but it tangles three different concerns.

V11 separates them:

```
OAuth scopes (Axis 1)              ← handled by @atproto/oauth-client + scope checking
       ⊥
Space membership (Axis 2)          ← handled by Arbiter / GovernanceView lookup
       ⊥
Application authorization (Axis 3) ← handled by CoopView in apps/api
```

Every CSN read or write operation passes through all three checks. Each check has a clear failure mode. Authorization failures are categorized correctly, which makes them debuggable. Adding a new lexicon means thinking about scope (Axis 1), space placement (Axis 2), and application rules (Axis 3) as separate questions, not as one tangled access-check method.

---

## 5. The layered architecture: Spaces → Arbiter → GovernanceView → CoopView

### 5.1 The four layers

CSN's architecture is a four-layer cake. Each layer has a clear responsibility, a clear consumer, and a clear contribution path back to the ecosystem.

```
┌───────────────────────────────────────────────────────────────┐
│ Layer 4: CoopView                                             │
│   Cooperative-specific governance: Subchapter T, patronage,   │
│   capital accounts, multi-stakeholder weighted voting, ICA    │
│   principle adherence, financial period tracking, 1099-PATR,  │
│   agreement lifecycle, alignment, agents.                     │
│   Lexicons: network.coopsource.*                              │
│   Consumer: CSN, future cooperative platforms                 │
├───────────────────────────────────────────────────────────────┤
│ Layer 3: GovernanceView                                       │
│   Generic governance primitives: proposals, votes,            │
│   deliberations, anchor records, transparency logs, vote      │
│   tally aggregation, role-state derivation, member directory  │
│   indexing.                                                   │
│   Lexicons: community.lexicon.governance.*                    │
│   Consumer: CSN, Roomy (channel governance), opensocial.      │
│   community, any group-shaped ATProto application.            │
├───────────────────────────────────────────────────────────────┤
│ Layer 2: Arbiter                                              │
│   Generic group/role/space management: community DIDs,        │
│   $admin, role-spaces, space-as-member-of-space recursion,    │
│   $publish, $labeler.                                         │
│   Author: Zicklag (with CSN, Roomy, Muni Town as users)       │
│   Consumer: GovernanceView, Roomy, any community-shaped app   │
├───────────────────────────────────────────────────────────────┤
│ Layer 1: ATProto Spaces                                       │
│   Protocol primitives: permissioned repos, ats:// URI,        │
│   ECMH commit chains, pull-based sync, (DID, read|write)      │
│   member lists, controlled DIDs.                              │
│   Author: Holmgren / Bluesky protocol team                    │
│   Consumer: Arbiter, NorthSky, Habitat, anyone                │
└───────────────────────────────────────────────────────────────┘
```

### 5.2 Why this layering

The layering is not invented for elegance; it falls out of three observations:

**Observation 1: Spaces and the Arbiter are general-purpose.** They serve any community-shaped ATProto application. CSN doesn't need to reinvent them and shouldn't compete with them. Whatever CSN builds at this layer should be either a contribution to the existing efforts or a thin adapter.

**Observation 2: Generic governance is more than chat-channel governance.** Roomy's roadmap explicitly mentions "permissioned channels + roles" but stops short of proposals, votes, deliberations, transparency logs, and the anchor pattern. CSN's V10 work product (the anchor + sidecar pattern, the transparency log lexicon, the privacy-by-default thinking) is genuinely useful beyond cooperatives. Any group-shaped application that needs members to make collective decisions wants proposals, voting, and a transparent audit trail. There is room — and need — for a generic governance layer that's not cooperative-flavored.

**Observation 3: Cooperatives are governance plus a lot of cooperative-specific stuff.** Patronage allocation, capital accounts, Subchapter T compliance, ICA principles, multi-stakeholder voting weights, fiscal period tracking, 1099-PATR generation, member onboarding — these aren't generic governance primitives. They're cooperative semantics. Anything generic enough to belong in GovernanceView (a vote is a vote) should be there. Anything cooperative-specific (a vote weighted by member-class share of patronage) belongs in CoopView.

### 5.3 Layer boundaries — the test for which layer something belongs in

The test for which layer a feature belongs in:

- **Layer 1 (Spaces):** Is this a protocol-level primitive about access and storage? Lives in spaces.
- **Layer 2 (Arbiter):** Is this generic group/role management that any community-shaped app would want? Lives in the Arbiter.
- **Layer 3 (GovernanceView):** Is this a generic governance primitive — a proposal, a vote, a deliberation, an audit log entry, a derived role-state record — that any group-shaped app might want for collective decision-making? Lives in GovernanceView.
- **Layer 4 (CoopView):** Is this cooperative-specific — Subchapter T, patronage, ICA principles, capital accounts, multi-stakeholder weights? Lives in CoopView.

When in doubt, push it down a layer. A feature that belongs in Layer 4 but could plausibly live in Layer 3 should live in Layer 3 if doing so doesn't dilute the generic-ness. The test for "doesn't dilute the generic-ness" is whether Roomy or another non-cooperative app would use the feature without modification.

Example: vote tally aggregation. The mechanic is generic — count votes, possibly weight them. *Whether* to weight by patronage share is cooperative-specific. So Layer 3 ships generic tally aggregation that supports per-vote-weight; Layer 4 supplies the patronage-aware weight computation as a CoopView extension.

Example: officer election. The mechanic of a vote-to-fill-a-position is generic. Whether the position has a Subchapter T statutory requirement (treasurer, secretary) is cooperative-specific. Layer 3 ships position spaces and election proposals; Layer 4 enforces the cooperative-specific statutory rules.

### 5.4 Packaging GovernanceView

GovernanceView should be packaged so that:

- It can be deployed standalone (own binary, own database) for projects like Roomy that want generic governance primitives without CSN-specific code.
- It can be embedded in CSN's `apps/api` so CoopView extends it in the same process.
- Both deployment shapes share the same lexicons and the same XRPC API.

Concretely, a workspace package layout:

```
packages/
  governance-view/        ← Layer 3 (publishable as @govview/core or similar)
    lexicons/             ← community.lexicon.governance.* schemas
    indexers/             ← Tap consumers for governance lexicons
    services/             ← Proposal, Vote, Deliberation, AnchorRecord, etc.
    transparency-log/     ← Merkle-tree append-only log
    plugins/              ← extension-point types and registry
    xrpc/                 ← generic governance XRPC endpoints
  coop-view/              ← Layer 4 (CSN-specific)
    lexicons/             ← network.coopsource.* schemas
    services/             ← Patronage, CapitalAccount, Agreement, Legal, etc.
    plugins/              ← GovernanceView plugins (e.g., patronage-weighted vote)
    xrpc/                 ← CSN-specific XRPC endpoints
apps/
  api/                    ← assembles GovernanceView + CoopView + Express bindings
```

The GovernanceView package has no dependency on CoopView. CoopView depends on GovernanceView. A future Roomy fork could pull in the GovernanceView package without CoopView. CSN's API binary pulls in both.

### 5.5 Extension points in GovernanceView

GovernanceView needs three extension mechanisms so CoopView can layer on without forking:

**Plugin registration.** A typed plugin interface where CoopView registers handlers for specific governance events. Conceptually:

```
governanceView.registerPlugin('vote-weight-resolver', {
  resolveWeight: async (voterDid, proposalRef, ctx) => {
    // CoopView's patronage-weighted resolver
    return await coopView.computePatronageWeight(voterDid, proposalRef);
  }
});
```

This is the cleanest extension model and the one to lead with.

**Lexicon extension.** GovernanceView's generic vote lexicon (`community.lexicon.governance.vote`) is the substrate; CSN extends with a richer cooperative-specific vote lexicon (`network.coopsource.governance.vote`) that includes patronage-weight evidence, multi-stakeholder class identifiers, and so on. The generic indexer indexes both; CoopView's enriched indexer adds CSN-specific projections.

**Hook pipeline composition.** GovernanceView exposes its hook pipeline (pre-storage, post-storage, dead-letter); CoopView composes its own hooks into the generic pipeline. CoopView hooks can transform records, derive additional state, write to CoopView's CSN-specific tables, all without modifying GovernanceView's code.

These three mechanisms are deliberately layered for *in-process composition between GovernanceView and CoopView*. They are not GovernanceView's only extension story.

**CSN already has runtime scripting for cooperative-defined hooks.** `apps/api/src/scripting/` (script-service, transpiler, worker, worker-pool) runs cooperative-authored scripts in a sandboxed worker pool, registered against the hook pipeline at `apps/api/src/appview/hooks/`. Phases: `pre-storage`, `post-storage`, `domain-event`. Per-script `cooperativeDid`, collection patterns, event types, timeout. This is the right substrate for *user-of-CSN extensibility* (a cooperative writing a custom proposal-eligibility rule), and it survives into V11. Typed plugins are the right substrate for *co-developer extensibility* (CoopView extending GovernanceView, in the same TypeScript codebase).

The HappyView analogy applies here as a developer-experience aspiration, not a deployment model: HappyView ships WASM + Lua because its extender audience is unknown third parties. GovernanceView's two extender audiences are CoopView (typed plugins, in-process, co-developed) and per-cooperative scripts (sandboxed at the existing scripting layer). When the GovernanceView interface stabilizes enough to expose to *external* third parties (different TypeScript projects, or non-TypeScript implementers), CSN can add a WASM-shaped extension story. That's not a V11 commitment.

### 5.6 Where CSN's existing AppView sits

The existing custom AppView in `apps/api` does not need to be replaced. It evolves into "the assembly point that wires GovernanceView and CoopView together with Express, Kysely, the Tap consumer, and the spaces consumer."

Concretely:

- The existing `apps/api/src/appview/` directory contains the indexer dispatch and hook pipeline. This becomes GovernanceView's indexer dispatch (extracted to the package) and CoopView's hook extensions (in `coop-view`).
- The existing services in `apps/api/src/services/` split: generic governance services (`ProposalService`, `VoteService`, parts of `AnchorRecordService`) move to `governance-view`; cooperative-specific services (`PatronageService`, `CapitalAccountService`, `AgreementService`, `LegalDocumentService`, `AlignmentService`, `AgentService`) stay in `apps/api` or move to `coop-view`.
- The existing `MembershipService` becomes a thin wrapper around Arbiter membership lookups, with the bilateral state machine retired.
- The existing OAuth client and `MemberWriteProxy` become the OAuth axis (Axis 1) implementation, used by both GovernanceView and CoopView.
- The existing Tap consumer continues handling public records; a new spaces consumer handles permissioned-repo events.

**HappyView 2.5+ as a reference, not as substrate.** HappyView's experimental spaces support is the most concrete spaces code today. CSN should run an instance to read records, validate behavior, and stress-test the design. CSN should not migrate `apps/api`'s 14k+ lines of cooperative-specific TypeScript onto HappyView's Lua + WASM model — the translation cost vastly exceeds the benefit, and CSN already has its own sandboxed-script substrate (§5.5) for the case where cooperatives need late-bound logic. Use HappyView as a reference implementation for spaces protocol behavior; keep the custom AppView as production substrate.

---

## 6. Concept-by-concept mapping from V9 to V11

This section walks through the V9 patterns and shows what each becomes under the layered V11 architecture.

### 6.1 Cooperative DID under the controlled-DID system

**V9 today:** A cooperative is provisioned with a `did:plc` via CSN's `PlcClient`, a self-hosted PDS, an admin password, and a domain-as-handle. The cooperative's signing key is held by the cooperative's PDS. CSN does not have a transfer or rotation story beyond the underlying did:plc rotation key mechanism.

**V11 direction:** Cooperative DIDs become controlled DIDs in the protocol's controlled-DID system (Diary 5). The cooperative's PDS owns the controlled DID and provides the lightweight management/transfer mechanism. CSN's provisioning code calls protocol APIs rather than wrapping `did:plc` directly, with the result that:

- Cooperative DIDs gain a first-class transfer mechanism — when a cooperative reorganizes, splits, merges, or hands over operational responsibility, the protocol provides the rails.
- CSN's bespoke `PlcClient` wrapper retires in favor of the protocol's controlled-DID API.
- The cooperative's rotation key custody arrangement becomes whatever the protocol settles on (likely: the user/cooperative holds the rotation key, the PDS holds the signing key, transfers are signed operations).
- Diary 5 explicitly mentions personal spaces as a reasonable thing the controlled-DID system enables. CSN should validate that cooperative-scoped spaces work the same way and raise edge cases in feedback to Holmgren.

**What's preserved:** The principle that cooperative DIDs are separate from human DIDs. The principle that cooperatives have rotation-key custody and can recover from PDS compromise. The provisioning experience (administrators can create cooperatives via CSN's UI without leaving the platform).

**What changes:** The mechanism. CSN's provisioning code becomes shorter because the protocol does more.

### 6.2 Roles as spaces

**V9 today:** Roles live in `membership_role` (per-member-per-cooperative role assignments) and `role_definition` (custom role definitions with permission arrays). Role authority is centralized in `memberApproval` records on the cooperative's PDS. Custom roles are extended by adding entries to `role_definition` with permission strings like `grants:officer_access`.

**V11 direction:** Roles are spaces (Arbiter pattern). The cooperative's `board` space's member list is who's on the board. The `treasurer` space's member list (typically one member) is who the treasurer is. Custom roles are first-class spaces with the same membership semantics as built-in roles.

**Tables that retire or repurpose:**
- `membership_role` retires entirely. Authority lives in the arbiter's space member lists.
- `role_definition.permissions` retires; the access semantics it expressed are now space membership.
- `role_definition` may stay as a UI-facing description (human-readable role name, description, intended permissions for display purposes) but stops being load-bearing for access control.

**Indexer:** A CoopView indexer pulls arbiter member-list state into a `cooperative_roles` projection table, kept consistent with arbiter state via the spaces consumer. This is the equivalent of how the existing `pds_record` table indexes public records — a fast-query materialization of authoritative arbiter state.

**Application checks:** Code that today says `if (user has role "treasurer")` becomes `if (arbiterMembership.contains(user.did, treasurerSpaceId))`. The check moves from a PostgreSQL JOIN to an arbiter-state lookup, which is also backed by a PostgreSQL projection table for fast querying.

### 6.3 Membership replacing bilateral

**V9 today:** Bilateral membership. The member writes `network.coopsource.org.membership` (only `cooperative` + `createdAt`) to their PDS; the cooperative writes `network.coopsource.org.memberApproval` (`member`, `roles`, `createdAt`) to its PDS; status is `active` only when both exist. CSN's `membership` table already materializes this as a clean projection: every row has both `member_record_uri` and `approval_record_uri` columns (currently nullable while one side or the other lands), plus `member_record_cid` and `approval_record_cid` for content-addressed pinning, plus `status`, `joined_at`, `member_class`, `directory_visible`. The `MembershipService` state machine handles out-of-order arrival.

**V11 direction:** Membership is space membership. The cooperative's `members` space has an authoritative member list. A member is in or out — no two-record state machine, no out-of-order arrival problem. The space owner (the cooperative's arbiter, ultimately backed by the cooperative's PDS) controls the list.

**Lexicon changes:**

- `network.coopsource.org.memberApproval` retires entirely. Its role authority moves to role-space membership.
- `network.coopsource.org.membership` currently carries only `cooperative` + `createdAt` — nothing worth preserving on the member side. It can retire entirely. If member-side preferences are wanted later (display-name override, contact preferences, opt-in flags), they get a new lexicon (`network.coopsource.org.memberPreferences`) stored in the member's personal space (§6.6), not on the cooperative's record-of-truth path.

**The schema migration is concrete.** Because the V9 `membership` table already tracks both records as columns (not via JOIN), the migration to arbiter-backed membership is mechanical:

1. The spaces consumer subscribes to the cooperative's `members` space and writes membership state into the existing `membership` table.
2. `member_record_uri` and `approval_record_uri` columns become historical evidence — nullable, populated for migrated records, NULL for arbiter-native ones.
3. The `MembershipService` state machine drops its "wait for both records" branch and becomes a thin projection over arbiter state.
4. Out-of-band consent is captured via the OAuth flow that authorizes the cooperative to add the member to the `members` space (see below).

**The CSN-side concerns the bilateral pattern was getting at — membership requires cooperative consent, role authority is centralized — are preserved natively by spaces.** The cooperative consents by adding the member to the `members` space. Role authority is centralized at the arbiter (you can't self-add yourself to the `treasurer` space; only members with appropriate Configure Space access on the role-space can).

**Indexer:** A CoopView indexer pulls `members` space membership into the `membership` table as before. The existing `MembershipService` continues to read from this table; its callers don't notice the substrate change.

**Out-of-band consent capture.** V9 used the bilateral pattern partly to enforce that members had explicitly agreed to join (the act of writing the `membership` record was the consent signal). Under spaces, the equivalent is the OAuth flow — when a member signs into CSN with their ATProto identity and authorizes CSN to add them to the cooperative's `members` space, that's explicit consent, captured in the OAuth grant and recorded in the OAuth provider's session store. The consent is *more* explicit than V9's pattern, not less.

### 6.4 The anchor + sidecar pattern reshaping

**V10's design:** A public `network.coopsource.org.membershipSummary` record on the cooperative's PDS with `activeMemberCount`, `pendingCount`, `membershipPolicy`, `membershipPublic`. A private `memberApproval` sidecar in `private_record` with the actual member DIDs and roles. A post-storage hook keeps the anchor in sync.

**V11 direction:** The anchor pattern survives because its purpose is sound: external observers (the public firehose, the opensocial.community bridge, parent-network indexers, search) need a non-identifying public summary. The change is where the sidecar lives.

- The anchor record stays in the cooperative's *public* repo (or its `$publish` space — either works because `$publish` writes to the public repo). Lexicon shape unchanged.
- The sidecar moves from the `private_record` PostgreSQL table to the cooperative's `members` space — actual membership lives in the space's member list and the per-member permissioned repos for the space.
- The post-storage hook still runs — but it triggers off arbiter member-list changes rather than off `private_record` writes, and it updates the anchor's count to match.

**This is the V10 component that survives most intact**, in lexicon terms. The implementation gets simpler, not more complex, because the sidecar's storage is no longer CSN's responsibility. The hook becomes a few lines of "on member-list change, recompute counts, update anchor record."

The same anchor pattern applies to other cooperative state: `cooperativeProfileSummary` for a public summary of which roles exist (without revealing role-holders), `governanceFeedSummary` for a public summary of recent governance activity (without revealing details of private proposals), and so on. Section 7 (GovernanceView) treats this as a generic primitive.

### 6.5 Votes, proposals, deliberations

**V9 today:** Votes are records on the voter's public PDS. Proposals are public records on the cooperative's PDS. Deliberations are not yet implemented.

**V10's design:** Routed votes to `private_record` with `visibility_tier: 'all_member'`. Public proposals get an `aggregateTallyAnchor` updated by a post-storage hook. Deliberations get the same private routing.

**V11 direction:**
- Public proposals stay in the cooperative's public repo — under spaces, they're written via `$publish`. Lexicon shape unchanged from V10's design.
- Private proposals (closed cooperatives) move to permissioned repos in the cooperative's `members` space (or a more specific `governance` sub-space if CSN wants finer granularity).
- Votes move to voter permissioned repos for the appropriate space (`members` for cooperative-wide votes, `board` for board votes, etc.). Fellow members of that space see each other's votes — same accountability story as V10.3, enforced at the protocol level rather than via PostgreSQL ACL.
- Aggregate tally anchors on public proposals stay. The tally is still computed by a post-storage hook; the source of vote records is now the appropriate space's permissioned repos rather than `private_record`.
- Deliberations follow the same pattern, with the visibility setting choosing which space the deliberation lives in (`members`, `officers`, or `board`).

**What CoopView adds beyond GovernanceView's generic vote primitives:**
- Patronage-weighted tally computation (CoopView plugin into GovernanceView's tally aggregator).
- Multi-stakeholder vote class weighting.
- Eligibility checks that consult cooperative-specific state (member in good standing, probation completed, fiscal-period membership).
- Subchapter T-compliant "one member, one vote" enforcement when statutorily required.
- 1099-PATR-relevant vote data capture (for cooperatives that link patronage entitlement to governance participation).

### 6.6 Individual records: per-(coop, member) personal spaces

**V10's design:** Individual-tier records (patronage allocations, capital account balances, 1099-PATR forms, personal contact info) had their own visibility tier (`individual` and `individual_strict`) implemented as `private_record` rows with `owner_did` set to the affected member.

**V11 direction:** Each member has a personal space per cooperative they belong to. The personal space's member list is just the member (for `individual_strict`) or the member plus financial officers (for `individual`). The member's permissioned repo for the personal space holds all the individual records: patronage, capital account, 1099-PATR forms, personal contact info, election preferences, ZK-ballot identity commitments.

**Why personal spaces.** Diary 5 explicitly mentions personal spaces (bookmarks, mutes, private posts, newsletters) as a use case. The mechanism is the same primitive applied to individual-shaped data. It generalizes naturally:

- The cooperative provisions a personal space when a member joins. The space type might be `network.coopsource.org.memberPersonal` with skey = the cooperative's slug.
- The member's permissioned repo for that space is where their individual records live.
- For `individual_strict` records (capital account balances), only the member is on the space's member list.
- For `individual` records (patronage allocation), the cooperative's `treasurer` and other financial-officer spaces are added to the personal space's member list. (Spaces can include other spaces — Arbiter pattern.)

**The benefit over V10's `private_record + owner_did` approach:** Access control is delegated to the protocol. The existing `PatronageService` and `CapitalAccountService` no longer have to enforce "officer can read this if they're in the financial-officer role"; the space membership does it for free.

**Cost optimization is deferred.** A 5,000-member cooperative has 5,000 personal spaces under this model. Whether that scales depends on the controlled-DID system's per-space costs, which aren't fully specified yet. CSN ships the cleaner abstraction now and optimizes later — once the end-to-end system is running and the actual cost shape is visible, alternative models (a single user-personal-DID with multiple cooperative-scoped permissioned repos under it; a per-cooperative shared `individual-records` space with cooperative-side filtering) become tractable engineering choices rather than speculative design alternatives. §12.1 records the decision.

### 6.7 Operator authority via $admin

**V9 today:** Cooperative operators write to the cooperative's PDS via the `OperatorWriteProxy`, which authenticates operators through CSN's auth system, applies internal ACL checks (admin, board-member, staff, member), proxies authorized writes using the cooperative's admin credentials, and audit-logs every operation.

**V11 direction:** Operators become members of the cooperative's `$admin` space. Configure Space access in the Arbiter pattern grants the right to write records under the cooperative's account. The audit log is built into the arbiter (every `$admin` operation is recorded by the arbiter as a record under the cooperative's account).

**What changes for CSN:**
- `OperatorWriteProxy` simplifies: operator auth is checked, then the proxy calls the arbiter's XRPC API (or writes a record into a space the operator has Configure Space access for).
- The audit log is no longer CSN's invention; it's standardized arbiter audit and other tools that speak the Arbiter API can consume it.
- Multi-user cooperative access (multiple humans operating the same cooperative DID) is no longer a CSN-specific architectural concern; it's the Arbiter's responsibility.

### 6.8 Public records via $publish

**V9 today:** The cooperative's public profile, public proposals, and other public records are written directly to the cooperative's PDS public repo via the `OperatorWriteProxy`.

**V11 direction:** Public records are written via the cooperative's `$publish` space. Members with Configure Space access for `$publish` can write records to the arbiter's public repo. This consolidates the public-record path through the Arbiter abstraction.

For most cooperatives, the only members of `$publish` are operators in `$admin`, so this is the same set of writers as today. The benefit is conceptual cleanness — *all* writes go through some space, and the public repo is just "the space called `$publish`" rather than a special-cased path.

### 6.9 Governance labels

**V9 today:** A custom lightweight labeler emits governance labels (`csn-proposal-active`, `csn-proposal-approved`, `csn-member-suspended`, etc.) via `subscribeLabels` and `queryLabels`.

**V11 direction:** Labels are emitted via the cooperative arbiter's `$labeler` space. The arbiter is already the cooperative's root of authority; making it the cooperative's labeler avoids an unnecessary parallel service with its own identity, audit trail, and operational surface. Members with Configure Space access on `$labeler` can emit labels under the arbiter's DID. Governance state changes (proposal status, member status, agreement ratification) trigger labels through hooks on GovernanceView's projection tables; the hook writes to `$labeler` rather than to a separate labeler service.

**If the Arbiter spec for `$labeler` isn't ready.** `$labeler` is in the Arbiter addendum, not the core (§3.1). If the addendum hasn't been formalized by the time CSN reaches the labeler implementation stage, CSN does the standardization work: defines what `$labeler` means concretely, contributes the design back to Zicklag, and ships its own implementation as a reference. The principle is to avoid coupling CSN's release cadence to Zicklag's, not to be precious about whose name is on the spec. An expert protocol engineer in CSN's position would design the `$labeler` semantics that any arbiter could adopt, build CSN's implementation against that, and propose the design upstream — not wait.

**For network-level governance labels** (federation-level proposals, cross-cooperative trust signals), the network's arbiter has its own `$labeler` space. Recursive cooperatives compose naturally.

**What this retires.** V9's custom labeler implementation — a standalone DID with `subscribeLabels` and `queryLabels` endpoints and a lightweight PostgreSQL backing — retires. CSN doesn't run a separate labeler service.

### 6.10 What stays in CSN's V9 application layer

Critically, none of the V9 application layer is forced to change by the transition to spaces. These domains stay:

- **Governance** beyond proposals/votes (escalation, mediation, mediator selection, decision rights, decision rules) — extends GovernanceView with cooperative-specific rules.
- **Agreements** (master agreements, signatures, ratification, amendment) — CoopView with optional contribution back to GovernanceView for "agreements with members" as a generic primitive.
- **Legal** (articles of incorporation, bylaws, operating agreements, foundational documents, meeting records, officer terms, compliance items, member notices, fiscal periods) — CoopView, mostly cooperative-specific.
- **Finance** (patronage, capital accounts, fiscal periods, tax forms, member equity statements) — CoopView, entirely cooperative-specific.
- **Operations** (member onboarding, training records, probation reviews) — CoopView with onboarding generalizable to GovernanceView's "member admission workflows."
- **Commerce** (Stripe integration, payment configuration, funding campaigns, pledges) — CoopView, partially cooperative-specific but commercially standard.
- **Alignment** (stakeholder interests, desired outcomes, interest mapping) — CoopView, cooperative-flavored governance.
- **Agents** (AI agent framework, MCP, governance/facilitator/coordinator agents) — CoopView, sits orthogonal to the access-control layer.

Where these domains touch identity, membership, or access control, they call into Arbiter / GovernanceView APIs. Where they implement cooperative-specific logic, they stay where they are.

---

## 7. GovernanceView design

### 7.1 What GovernanceView is

GovernanceView is a generic governance system for any group-shaped ATProto application. It provides primitives for collective decision-making — proposals, votes, deliberations, transparent audit logs — on top of Arbiter spaces. Lexicons live in `community.lexicon.governance.*`; lifted from CSN's V9/V10 work and generalized.

### 7.2 GovernanceView's responsibilities

**Proposal management.** Generic proposal lexicon (`community.lexicon.governance.proposal`) covering: proposer DID, target arbiter, proposal type (free-text, with applications interpreting types), title, summary, optional rich content via `community.lexicon.markdown` or `com.whtwnd.blog.entry`, voting period, eligibility criteria reference (an optional pluggable rule), proposed actions reference. Indexer materializes proposal state.

**Vote casting.** Generic vote lexicon (`community.lexicon.governance.vote`) covering: voter DID, proposal reference, choice (yes/no/abstain or arbitrary token from a proposal-defined set), optional voter rationale, optional weight evidence (extension point: applications fill in patronage data, multi-stakeholder class, etc.). Indexer aggregates votes per proposal.

**Deliberation threads.** Generic deliberation lexicon for threaded discussion attached to a proposal. Visibility-tier-aware (lives in the appropriate space).

**Anchor pattern.** Generic anchor record lexicon (`community.lexicon.governance.summary`) for non-identifying public summaries. Anchor records carry proposal counts, member counts (without DIDs), aggregate tallies (without voter identification), recent-activity timestamps. Hooks keep anchors fresh.

**Transparency log.** Generic Merkle-tree append-only log over governance events. Lexicon (`community.lexicon.governance.logHead`) carries STH (signed tree head) records published periodically. Inclusion proofs and consistency proofs available via XRPC. Adapted from V10.5 design, generalized.

**Role-state derivation.** Generic indexer that materializes arbiter member-list state into queryable role projections. "Who is currently in the `treasurer` space?" returns a list with a snapshot timestamp.

**Member directory indexing.** Generic indexer that materializes the `members` space into a query-friendly member directory, with anchor records driving public visibility.

### 7.3 What GovernanceView does *not* do

- Patronage calculation, capital accounts, 1099-PATR, fiscal periods (CoopView).
- Multi-stakeholder weighted-vote computation that consults cooperative-specific economic state (CoopView, via the vote-weight-resolver plugin).
- Subchapter T statutory enforcement (CoopView).
- ICA principle adherence checks (CoopView).
- Any cooperative-specific terminology (the GovernanceView lexicon uses "members" and "proposals," not "cooperators" and "ballots").

### 7.4 GovernanceView as a contribution to the ecosystem

GovernanceView is designed to be useful to:

- **Roomy.** Roomy needs proposals and votes for community decisions (channel renaming, moderation policy changes, banning, member admission). Roomy's roadmap mentions "permissioned channels + roles" but doesn't extend to formal voting mechanisms. GovernanceView fills the gap.
- **opensocial.community.** Brittany Ellich's group-as-DID model has the same need.
- **Tangled (decentralized code hosting).** Decisions about repository policies, contribution acceptance, governance.
- **Cooperative platforms beyond CSN.** Other cooperative software efforts could build on GovernanceView with their own CoopView equivalents.
- **NorthSky and other community-cooperative ATProto projects.** Community decision-making.

The contribution path is through the Lexicon Community (`community.lexicon.*`). Section 11 develops this.

### 7.5 GovernanceView's deployment shapes

**Embedded in `apps/api`.** This is CSN's deployment. GovernanceView and CoopView share a process; CoopView extends GovernanceView via the plugin registry, the lexicon extension, and the hook pipeline composition.

**Standalone binary.** A future deployment shape: GovernanceView as a single binary (similar to HappyView 2's packaging) for projects that want generic governance without CSN's cooperative-specific code. SQLite-backed for small deployments, PostgreSQL-backed for larger ones. The standalone binary publishes the same lexicons and the same XRPC API as the embedded mode.

**Library.** GovernanceView as a TypeScript library (`@govview/core` or similar) that CoopView, Roomy, or any other application includes. This is what CSN does today (in spirit — the code is in `apps/api/src/appview` rather than a separate package, and gets extracted as part of V11).

The three deployment shapes share the same code. Implementing once enables all three.

### 7.6 Indexing and consistency model

GovernanceView's projection of space state into queryable form is fundamentally different from V9's firehose-based indexing. V9 subscribes to the public ATProto firehose (or Tap) and writes records into `pds_record` plus per-NSID projection tables; ordering is the firehose's sequence number, consistency is at-least-once delivery, and recovery from gaps replays from a cursor. For permissioned spaces, none of this applies.

**Sync source.** Per Diary 4, sync is pull-based and write notifications route through the space owner. CSN's spaces consumer (a new component alongside `apps/api/src/appview/loop.ts`) subscribes to write notifications from each arbiter the cooperative is connected to. The notification is a lightweight "this space changed" event; the consumer then pulls the changed records from the relevant member PDS.

**Trust anchor.** Records pulled from a member PDS are *claimed* records until cross-checked against the space's authoritative member list (§3.1, "write enforcement is reader-side"). The consumer fetches the arbiter's current member list before accepting records; records from DIDs not on the list are discarded. The arbiter's member list is the trust anchor.

**Consistency.** Eventually consistent. Staleness is bounded by pull cadence (target: under 5 seconds at p95 for active cooperatives, longer for idle ones) plus space-owner notification latency. ATProto's protocol-level guarantees don't extend to GovernanceView's projection tables; callers needing strict consistency must read through to the arbiter directly via XRPC, not the projection.

**ECMH digest verification.** Per §2.1, ECMH commits don't support single-record proofs. After each pull batch, the consumer recomputes the ECMH digest of the received record set and compares against the arbiter's reported digest. Mismatch → the consumer falls back to a full-repo resync of that member's permissioned repo for that space. This is the cost of ECMH; it is significant for catching up after long downtime and negligible for steady-state operation.

**Dropped-notification recovery.** Notifications can be dropped (the space owner is offline, network partition, CSN's consumer is down). Recovery is periodic full-resync on a slow timer (every N hours; tune to cost) plus on-demand resync triggered by digest mismatch. CSN's existing dead-letter pipeline (`apps/api/src/appview/hooks/dead-letter.ts`) extends naturally to capture pull failures.

**Space credentials.** Per Zicklag's Arbiter post, the arbiter issues each member a temporary space credential they present to the space host to read data. CSN's consumer holds a credential per (cooperative, space). Lifetime, rotation, revocation policy are TBD pending Diary 6+ — see §12. The consumer must handle credential expiration by re-requesting; it must handle revocation by halting reads from that space until a fresh credential is obtained.

**Composability with the existing Tap consumer.** The Tap consumer continues to handle the public firehose for public records. The spaces consumer is a new, parallel pipeline that writes into the same `pds_record` (or a sibling `space_record`) table. The hook pipeline at `apps/api/src/appview/hooks/` is the integration point: both consumers emit through the same pipeline, so post-storage hooks (anchor updates, tally aggregation, label emission) run regardless of source.

### 7.7 Security model

The shift to spaces introduces new threats the V9 security model didn't address:

**Space-credential management.** Credentials are bearer tokens with no built-in proof of possession at the request layer. If leaked, the holder can read every record in the space until revocation. CSN's mitigations: short credential lifetimes (target: ≤ 1 hour, refresh on each batch), least-privilege per-space credentials (one credential per (cooperative, space) rather than a master credential), audit logging of credential issuance and use, rotation on member-list changes. Whether the arbiter standardizes credential format and rotation is TBD; CSN's design abstracts the lifecycle behind a `SpaceCredentialStore` interface.

**Cross-arbiter trust verification.** When cooperative A's `members` space includes cooperative B's `members` space as a member (federated channels, recursive cooperatives, §9.1), reading B's member list requires authenticating to B's arbiter as A. The trust path is: A's arbiter DID is on B's `members` space allowlist; A's service-auth JWT (Axis 5, §4.3) authenticates to B; A receives B's member list. Forged JWTs would let an attacker impersonate A to B; mitigations are standard (signed JWTs with B's verification of A's signing key from the DID document, short JWT lifetimes, audience binding).

**Replay protection in recursive cooperatives.** When a child cooperative's officer change triggers writes in the parent cooperative's space (e.g., a federation requires member cooperatives to publish anchor records on officer rotation), the parent must verify (a) the write is signed by the child's arbiter DID, (b) the write hasn't been seen before (nonce or timestamp + freshness window), (c) the child is still a member of the parent's `members` space at the moment of write. Replay attacks would let stale state from a former member-cooperative pollute the parent's view; the freshness check on (c) is the load-bearing mitigation.

**Trust-anchor poisoning.** If an attacker compromises the arbiter (e.g., by getting Owner access to `$admin`), they can write arbitrary member-list state. Mitigations: arbiter rotation keys held offline by cooperative governance; multi-signature requirements for Owner-level operations (an arbiter feature CSN should push for); transparency-log of arbiter operations (§7.2) for after-the-fact detection.

**Tier 3 still in scope, with caveats.** Tier 3 (E2EE via Germ DM / MLS) remains the right primitive for content that must be cryptographically confidential (board executive sessions, salary records, personnel matters, mediation proceedings, legal consultations). However, Germ DM is currently iOS-only via App Clip. **Production cooperative governance flows that depend on Tier 3 require Android and desktop parity that does not yet exist.** Until cross-platform E2EE substrate is available, CSN must not ship governance flows that *require* Tier 3 — only flows where Tier 3 is one option among others. Tier 3 is also the only path that's truly orthogonal to spaces; permissioned spaces give CSN's hosting infrastructure access to content, so anything that must be cryptographically opaque to CSN itself needs Tier 3.

---

## 8. CoopView design

### 8.1 What CoopView is

CoopView is CSN's cooperative-specific extension of GovernanceView. Lexicons live in `network.coopsource.*`. CoopView depends on GovernanceView; it does not replace it.

### 8.2 CoopView's responsibilities

**Cooperative profile.** `network.coopsource.org.cooperative` lexicon — the public profile record for a cooperative. Includes ICA principle declarations, cooperative type (worker, consumer, producer, multi-stakeholder, platform, federation), legal entity type (cooperative corporation, LLC, LCA), governance visibility, discoverable status. Anchor record summarizing public-facing state.

**Multi-stakeholder member classes.** `network.coopsource.org.memberClass` lexicon and CoopView service for managing classes (worker, consumer, investor, etc.). Each class is itself a space (Arbiter pattern); the `memberClass` lexicon is the cooperative's declaration of which classes exist and their voting weights / governance entitlements.

**Patronage system.** `network.coopsource.finance.patronageConfig`, `network.coopsource.finance.patronageRecord`, `network.coopsource.finance.patronageAllocation` lexicons. Patronage records live in personal spaces (per Section 6.6). Allocations are CoopView-specific aggregations.

**Capital accounts.** `network.coopsource.finance.capitalAccount` lexicon, in personal spaces. Equity tracking, contributions, allocations, redemptions, revolving fund mechanics.

**Subchapter T compliance.** Cooperative-type-aware enforcement of:
- Democratic control rules (one-member-one-vote where statutorily required).
- Subordination of capital.
- Patronage cash distribution requirements (20% within 8.5 months for qualified dividends).
- Separate tracking of patronage-sourced vs. non-patronage-sourced income.
- 1099-PATR generation for members with patronage dividends ≥ $10.
- Form 1120-C filing support.

**Fiscal periods.** `network.coopsource.admin.fiscalPeriod` lexicon. Fiscal year tracking, audit status, allocation deadlines.

**Officer records and compliance.** `network.coopsource.admin.officer`, `network.coopsource.admin.complianceItem`, `network.coopsource.admin.memberNotice`. Officer terms are now expressed via the `officer` role-spaces (Section 6.2); these lexicons capture the cooperative's officer history, compliance calendar, and required notices.

**Legal documents and meeting records.** `network.coopsource.legal.document`, `network.coopsource.legal.meetingRecord`. Foundational documents, meeting minutes, resolutions, certifications.

**Agreements.** `network.coopsource.agreement.*` (master agreements, signatures, stakeholder terms, ratifications, amendments).

**Member onboarding.** `network.coopsource.onboarding.*` (probation, training, buy-in, milestones, buddy assignment, reviews).

**Alignment.** `network.coopsource.alignment.*` (stakeholder interests, desired outcomes, interest mapping).

**Funding campaigns.** `network.coopsource.funding.*` (campaigns, pledges, payment integration).

**Connection links.** `network.coopsource.connection.*` (inter-cooperative links — but increasingly expressed as space-as-member-of-space relationships via the Arbiter).

**Agents.** `network.coopsource.agents.*` (AI agent configuration, sessions, automation triggers).

### 8.3 CoopView extension points into GovernanceView

CoopView implements the following GovernanceView plugins:

- **`vote-weight-calculator`.** Calculates vote weight from voter DID + proposal context. CoopView's calculator consults patronage history, member class, multi-stakeholder weights, and cooperative-specific rules.
- **`proposal-eligibility-checker`.** Determines whether a member is eligible to vote on a given proposal. CoopView checks probation completion, member-class restrictions, fiscal-period membership, and good-standing status.
- **`quorum-checker`.** Checks whether quorum has been met. CoopView applies multi-stakeholder per-class quorum rules, patronage-weighted minimums, and statutory requirements.
- **`action-authorizer`.** Translates application-level permission queries ("can this user create proposals about bylaws?") into role-space membership lookups, with cooperative-specific composition.
- **`anchor-summary-builder`.** Adds cooperative-specific fields to GovernanceView's anchor records (cooperative type, ICA principle declarations).
- **`historical-state-reader`.** Returns governance state as of a given timestamp — "who was a member of the `members` space on the fiscal-year close?", "what was the role-space composition at the time of this proposal?". Subchapter T patronage allocation and 1099-PATR generation both require snapshot semantics: patronage is computed against the membership-as-of-fiscal-period, not membership-as-of-now. GovernanceView retains time-series snapshots (§12.6); CoopView's reader consumes them. §13.3 defines the interface shape.
- **`patronage-allocator`.** Computes per-member patronage allocations for a fiscal period. Subchapter T-specific: separates patronage-sourced from non-patronage-sourced income, applies the cooperative's patronage allocation policy (per-unit-of-business, weighted-by-class, etc.), produces a per-member allocation record that gets written to each member's personal space.
- **`surplus-distributor`.** Distributes cooperative surplus per cooperative-type rules. Distinct from patronage in some cooperative forms; required for Subchapter T qualified vs. non-qualified notices. May produce both cash distributions (within 8.5 months for qualified-dividend treatment) and equity allocations (capital account credits).
- **`meeting-minutes-canonicalizer`.** Produces canonical, signed meeting-minute records that satisfy legal record-keeping requirements (presence quorum, motions, votes, resolutions). Input is the raw deliberation thread; output is a `network.coopsource.legal.meetingRecord`.
- **`delegate-chain-resolver`.** Resolves proxy votes and delegation chains. For representative-democracy modes (large cooperatives, federations of cooperatives), a member may delegate voting authority to a representative; the resolver computes effective vote weight after delegation, detects delegation cycles, and applies cooperative-specific delegation limits.

Each plugin is a typed TypeScript interface; CoopView registers concrete implementations at process startup.

### 8.4 CoopView lexicon extension of GovernanceView

GovernanceView's `community.lexicon.governance.vote` is the substrate. CoopView's `network.coopsource.governance.vote` extends it (or wraps it, depending on what the lexicon community settles on as the right pattern):

```json
// community.lexicon.governance.vote (GovernanceView, generic)
{
  "voterDid": "did:plc:...",
  "proposalRef": "ats://...",
  "choice": "yes",
  "rationale": "...",
  "weight": { "type": "single" }  // generic, app-extended
}

// network.coopsource.governance.vote (CoopView, cooperative-specific)
{
  "voterDid": "did:plc:...",
  "proposalRef": "ats://...",
  "choice": "yes",
  "rationale": "...",
  "weight": {
    "type": "cooperative",
    "memberClass": "worker",
    "patronageShare": 0.0234,
    "fiscalPeriod": "2026"
  }
}
```

The GovernanceView indexer handles the generic shape; CoopView's indexer adds the cooperative-specific fields to the projection. Both lexicons are valid; CSN uses CoopView's; a Roomy or NorthSky deployment uses GovernanceView's.

---

## 9. Future capabilities the layered architecture enables

The layered architecture is not just a refactor of V9/V10. It opens up a class of future capabilities that the V9 architecture either couldn't express or would have required significant new invention to support. This section walks through several.

### 9.1 Recursive cooperative networks

A network of cooperatives is a cooperative whose members are cooperatives. In V9, this required CSN-specific federation primitives: the `cooperative_link` table, the `IFederationClient` interface, RFC 9421 HTTP signatures for closed-cooperative-to-closed-cooperative exchange.

In V11, recursive cooperatives are expressed natively: a network's `members` space contains cooperative DIDs (which are themselves arbiter DIDs). The Arbiter resolves the recursion transitively. A network can host its own governance (proposals, votes among member cooperatives) using the same GovernanceView primitives that individual cooperatives use. The recursive cooperative model — "everything is an entity, networks are cooperatives whose members are cooperatives" — becomes a *protocol pattern*, not a CSN-specific concept.

This unlocks:

- **Multi-level federations.** Federations of federations of cooperatives. Each level is just another arbiter. The recursion is bounded only by the protocol's recursion depth (which is unbounded at the spec level; the Arbiter design recommends practical depth limits).
- **Cross-cooperative role delegation.** "Members of cooperative A's `treasurer` space have access to the federation's `financial-committee` space" is a natural arbiter expression: the federation's financial-committee space includes A's treasurer space as a member.
- **Federated compliance.** A federation can require member cooperatives to publish certain anchor records (membership counts, fiscal-period completion) and verify them via the public firehose.

### 9.2 Inter-cooperative trust networks

CSN's existing trust-network research (the document on trust networks for cooperative governance, the integration of TrustNet, ZK voting, and verifiable credentials) becomes much easier to implement on top of the layered architecture.

- **Trust attestations** become records in a `trust` space scoped to the relevant arbiter (per-cooperative or per-network). Tier 1 vouches are public records; Tier 2 computed scores are private records in the appropriate space.
- **Trust-based access control** composes with arbiter membership: "this space is open to anyone with composite trust score > T from cooperative A's perspective" becomes a membership rule the arbiter can enforce.
- **Cross-cooperative trust scoring** becomes natural: the arbiter's space-as-member-of-space pattern lets cooperative B inherit a portion of cooperative A's trust state when A endorses B.
- **ZK voting** (Semaphore-based anonymous voting) integrates with GovernanceView as a vote-recording plugin. The proposal lives in the public space; the vote-recording plugin verifies ZK proofs and records anonymous vote tallies via aggregate-tally anchor records.
- **Verifiable credentials** (SD-JWT membership credentials) are issued by the cooperative's arbiter against members in the appropriate role-space. A cooperative can issue "Active Member as of YYYY-MM-DD" credentials with selective disclosure, useful for cross-cooperative interactions.

### 9.3 Lexicon Community engagement

The layered architecture makes CSN's contributions to the Lexicon Community much more focused. CSN's reusable lexicon work is in GovernanceView, not in CSN-specific cooperative semantics. The proposed `community.lexicon.governance.*` namespace becomes:

- `community.lexicon.governance.proposal`
- `community.lexicon.governance.vote`
- `community.lexicon.governance.deliberation`
- `community.lexicon.governance.summary` (anchor records)
- `community.lexicon.governance.logHead` (transparency-log signed tree heads)
- `community.lexicon.governance.election` (vote-to-fill-a-position)
- `community.lexicon.governance.member` (generic membership record, optional — depending on whether the Arbiter pattern entirely subsumes it)

These are immediately useful to Roomy, opensocial.community, NorthSky, Tangled, and any other group-shaped ATProto application. CSN proposes them now during the spaces design phase, while the Lexicon Community is actively shaping community-namespace lexicons, and frames them as part of the conversation about how cooperatives think about privacy and governance on permissioned data.

### 9.4 Multi-stakeholder governance

Multi-stakeholder cooperatives (multiple member classes with differentiated voting weights) were always architecturally awkward in V9 because the bilateral membership pattern flattened all members into the same role hierarchy. V11 expresses multi-stakeholder structure cleanly:

- Each member class is a space (`workers`, `consumers`, `investors`, `community-members`).
- All class spaces are members of the cooperative's `members` space (so any class member is a member). This is the Arbiter's space-as-member recursion.
- Per-class quorum rules, voting weights, and board seat allocations are CoopView's `vote-weight-resolver` and `quorum-resolver` plugins consulting class membership.
- Class-specific governance (e.g., "investors elect their own board representatives in their own elections") uses class-scoped proposals filtered to a single class space.

This generalizes to cooperatives with five, ten, or more stakeholder classes without requiring any new architectural work — every class is just another space.

### 9.5 Cross-app composability

V9 already integrates with Smoke Signal (calendar events for governance meetings), WhiteWind (long-form proposal rationale), Frontpage (cross-posting public proposals), Bluesky Lists (auto-maintained membership lists), and Starter Packs (onboarding flows).

V11 makes cross-app composability natural at every layer:

- A cooperative's governance meeting can be a `community.lexicon.calendar.event` record (Smoke Signal lexicon) written via the cooperative's `$publish` space. Smoke Signal's AppView indexes it; CSN's AppView indexes it. Both apps treat the same record as authoritative.
- A proposal's full document can be a `com.whtwnd.blog.entry` record (WhiteWind) cross-referenced from the proposal record via AT-URI. The proposal lives in CSN's namespace; the rationale lives in WhiteWind's. Either app can render either.
- A cooperative's member directory can be exposed as a `community.lexicon.profile` record set (community profile lexicon) so other apps can render member directories without needing CSN-specific code.
- A federation's cross-cooperative trust state can be exposed via Ozone labels emitted from the federation's `$labeler` space — any ATProto client subscribing to the federation's labeler sees trust labels.

### 9.6 Cooperative DID transfers and lifecycle events

Cooperatives reorganize, merge, split, and dissolve. V9 had no story for any of these. V11, via the controlled-DID system, has natural expressions:

- **Reorganization.** The cooperative's controlled DID transfers from one PDS to another (e.g., from a hosted PDS to a self-hosted one) without changing the cooperative's identity. All records, all spaces, all relationships persist.
- **Merger.** Two cooperatives become one. The merged cooperative's `members` space includes both predecessors' `members` spaces. Records from both histories remain valid; new records are written under the merged cooperative's DID.
- **Split.** A cooperative divides into successors. Each successor's `members` space includes a designated subset of the predecessor's `members` space. The original cooperative's DID may continue to exist as a wrapper or be retired.
- **Dissolution.** A cooperative dissolves. Its DID is marked dissolved. Its records remain accessible (member equity claims, historical governance) but the arbiter rejects new operations.

These are real cooperative lifecycle events and V9 had no architectural support for them. V11 supports them naturally because they're already what the controlled-DID system is for.

### 9.7 Personal cooperative-membership portability

A member who joins multiple cooperatives accumulates membership records across multiple `members` spaces. V11's structure makes membership portability natural:

- A member's view of "the cooperatives I belong to" is "the spaces whose member lists include my DID, where the space type is `network.coopsource.org.cooperative`."
- A query against the public firehose (or a member's personal AppView) returns the member's full cooperative portfolio without contacting any specific cooperative.
- Cooperative discovery, "people with similar cooperative portfolios," and inter-cooperative recommendations become natural queries.
- A member can choose to publish their cooperative portfolio publicly (via personal-space anchor records) for social signaling or keep it private.

V9's bilateral membership pattern made this awkward because the membership records weren't reliably retrievable across cooperatives without CSN-specific federation. V11's protocol-native structure makes it free.

### 9.8 Trust and verification credentials issued by cooperatives

Cooperatives are well-positioned to issue verifiable credentials. A worker cooperative can attest to a member's employment history. A producer cooperative can attest to a producer's supply contributions. A consumer cooperative can attest to a member's purchase history. These attestations are commercially valuable and personally important.

V11's structure makes credential issuance natural: the cooperative's arbiter, via the `$publish` space, writes a credential record (SD-JWT or W3C VC format) into the member's personal space. The credential is signed by the cooperative's controlled DID. A relying party verifies the signature and the cooperative's standing in the broader network. Selective disclosure (member proves "I am a member of a worker cooperative" without revealing which one) is possible via SD-JWT's standard features.

This composes with inter-cooperative trust networks (Section 9.2): trust-weighted credentials, cross-cooperative endorsements, federation-level credentials.

---

## 10. Transition direction

There is no schedule. The work proceeds when the design is right. The sequencing below is a logical order of concerns — what depends on what, what should be settled before what — not a calendar.

### 10.1 Concerns to settle before substantial implementation

Most of the concerns from earlier in this report have been resolved (§12). Two items moved from "concerns" to "strawmen":

- **Layer 3 vs Layer 4 boundaries in code.** Decision: produce a strawman set of interfaces now (§13) rather than wait for the V11 architecture document to invent them in isolation. The strawman outlines the shape; the V11 document refines it.
- **GovernanceView as a separate package.** Decision: extract it now, even before the boundary is fully validated. Reasoning: accidental coupling between Layer 3 and Layer 4 is harder to remove later than it is to avoid upfront. The cost of a slightly-wrong-interface that gets refined is lower than the cost of CoopView reaching into GovernanceView internals because they share a directory tree.

The decisions captured in §12 — personal spaces, membership lexicon retirement, `governance_visibility` retirement, `$labeler` space adoption, RFC 9421 retirement, single AppView, the `community.lexicon.governance.*` namespace, cooperative DID rotation, Tier 3 platform handling, Subchapter T canonical source, historical-state-resolver shape — are commitments. They don't need re-litigation; they need implementation.

### 10.2 Logical sequencing of work

Once the above are settled, the work has a natural order. Stages, not steps — each stage gated by protocol-readiness conditions, not calendar dates. CSN's no-schedule posture means later stages wait for earlier protocol decisions to land.

**Stage 1. Get the spaces consumer running.** A spaces-aware consumer in `apps/api` that pulls records from cooperative-scoped permissioned repos (or, equivalently, runs HappyView 2.5+ alongside and queries it). This is the prerequisite for everything else, because it's how `apps/api` learns about state in spaces. *No gate*; safe to start now against the sketch implementation.

**Stage 2. Implement an Arbiter integration.** A thin wrapper around the Arbiter's XRPC API, used by `apps/api` to provision cooperative arbiters, manage role spaces, and do membership operations. Contributions to the Arbiter design happen in parallel (§11). *Gated by:* Arbiter XRPC API reaching a 0.x reference implementation in a usable form. May be CSN's own implementation if Zicklag's lags or pivots; see §3.5.

**Stage 3. Migrate membership and roles to spaces.** The `members` space, role-spaces (`board`, `officers`, `treasurer`, member classes, custom roles) become the authority. The `MembershipService` becomes a thin wrapper around arbiter membership operations. The bilateral membership state machine retires. *Gated by:* (a) controlled-DID system reference implementation, (b) URI scheme decision finalized (so lexicons that reference space URIs don't need rewrites), (c) `ats://` vs `at://` resolution path settled. Until all three, V11 builds a CSN-internal model that *resembles* spaces but doesn't commit to wire format.

**Stage 4. Migrate votes, proposals, deliberations.** These move to the appropriate spaces (public proposals via `$publish`; private proposals, votes, deliberations in `members` / `officers` / `board` spaces). The anchor pattern lifts from V10's design directly into GovernanceView. Aggregate tally anchors stay. *Gated by:* Stage 3 plus the OAuth-spaces seam settling (§4.2) — we need to know how CSN's writes into permissioned spaces are authorized at write time before generating real cooperative governance records under the new model.

**Stage 5. Migrate individual records to personal spaces.** Patronage allocations, capital account balances, 1099-PATR forms, personal contact info move from `private_record` to per-(coop, member) personal spaces. *Gated by:* Stage 4 done. Cost optimization is deliberately deferred (§12.1); the model ships as-designed and is optimized later if measurements show the need.

**Stage 6. Extract GovernanceView.** Pull the generic governance code out of `apps/api` into a `governance-view` package. Make it standalone-deployable (binary + SQLite mode) for Roomy and other consumers. Publish lexicons under `community.lexicon.governance.*`. *Not gated on Lexicon Community ratification* — CSN proceeds against the namespace; the forum post (§11.2) runs in parallel. If the community responds with substantive reshape requests, CSN incorporates; if rejected outright, the package ships under `network.coopsource.governance.*` with the same API.

**Stage 7. Codify CoopView.** Pull the cooperative-specific code into a `coop-view` package. Register CoopView's plugins with GovernanceView. Lexicons stay in `network.coopsource.*`. *Gated by:* Stage 6.

**Stage 8. Retire V8 / V9 federation primitives that the layered architecture replaces.** `IFederationClient`, RFC 9421 HTTP signatures (except where genuinely needed for Tier 3 / closed-coop-to-closed-coop edge cases that spaces don't cover), federation outbox. *No gate*; pure cleanup after Stages 3–7 stabilize.

**Stage 9. Implement future capabilities (§9) as they become independently valuable.** Recursive cooperatives, trust networks, cross-cooperative role delegation, multi-stakeholder governance, lifecycle events, personal portability, credential issuance. Each is its own design + implementation effort, but each builds on the layered foundation.

Stages 1–2 establish the substrate. Stages 3–5 migrate the existing CSN data model onto it. Stages 6–7 do the architectural refactor that produces GovernanceView and CoopView as named layers. Stage 8 cleans up. Stage 9 is the open-ended capability development.

### 10.3 V9 → V11 migration plan

There is no production data. There is, however, a substantial V9 codebase (594 source files, 47 lexicons, 100 database tables, 60+ services, 75 frontend pages) plus an associated test suite. The migration plan addresses code, schema, lexicons, and tests:

**Schema.** The 100 V9 tables fall into three categories:

- *Keep as-is.* The 60+ tables that materialize cooperative state for fast query — `proposal`, `vote`, `agreement`, `agreement_signature`, `funding_campaign`, `patronage_*`, `capital_account_*`, `fiscal_period`, `legal_document`, `meeting_record`, `officer_record`, etc. These don't change shape; they change *source*. Records flow into them from the spaces consumer or the Tap consumer (or both).
- *Repurpose.* `membership` keeps its schema but `member_record_uri` and `approval_record_uri` columns become historical evidence rather than primary state (§6.3). `private_record` keeps its schema but is repopulated from spaces rather than directly written; eventually becomes a cache layer.
- *Retire.* `membership_role` (authority moves to role-space membership). `role_definition.permissions` (semantics move to space-as-member-of-space). `cooperative_link` (replaced by space-as-member relationships). Anything tied to RFC 9421 federation outbox.

The retiring happens in Stages 3 and 8. No data migration is required because there is no production data; schemas just change.

**Services.** The 60+ services split four ways:

- *Survive unchanged.* `AgreementService`, `LegalDocumentService`, `PatronageService`, `CapitalAccountService`, `AlignmentService`, `MeetingRecordService`, `FiscalPeriodService`, `FundingService`, `Tax1099Service`, and similar cooperative-specific services. They consume materialized state and produce cooperative-specific outputs. They don't know about spaces; they don't need to.
- *Become thin wrappers.* `MembershipService` becomes a thin reader of arbiter-backed `members` space state (§6.3). `OperatorWriteProxy` becomes a thin wrapper around `$admin` space writes (§6.7). The internal logic retires; the external API stays.
- *Move to GovernanceView package.* `ProposalService`, `VoteService`, the parts of various services that handle generic governance lifecycle, the hook pipeline at `appview/hooks/`.
- *Retire.* `VisibilityRouter` (per-record placement replaces binary visibility). Parts of `private-record-service.ts` that aren't needed as a cache layer.

**Lexicons.** Of the 47 V9 lexicons:

- *Most carry through.* The 30+ `network.coopsource.*` lexicons for agreements, finance, legal, alignment, commerce, funding, onboarding, etc. They're cooperative-specific and stay in CoopView.
- *Retire.* `network.coopsource.org.membership`, `network.coopsource.org.memberApproval` (replaced by space membership).
- *Move into `community.lexicon.governance.*`.* Generic governance lexicons (proposal, vote, deliberation, summary, logHead, election). CSN's `network.coopsource.governance.*` becomes thin extensions or wrappers (§8.4).
- *New.* Anchor record lexicons (`community.lexicon.governance.summary`), transparency-log signed-tree-head lexicon (`community.lexicon.governance.logHead`), optional `network.coopsource.org.memberPreferences` for member-side preferences if wanted (§6.3).

**Tests.** V9's test suite is largely unit and integration tests against the service layer. Strategy:

- Service-layer tests for surviving services (≈60–70% of suite) carry through unchanged; the substrate change is invisible to them.
- Tests for retiring services (`VisibilityRouter`, parts of `MembershipService`'s state machine, `private-record-service`'s ACL paths) get deleted alongside the code.
- New tests for the spaces consumer, arbiter integration, GovernanceView plugin contracts, and the seam where OAuth/spaces/application-logic interact.
- The V9 integration-test fixtures (cooperatives, members, proposals, votes) re-run against the V11 substrate as smoke tests — if a V9 governance scenario doesn't work under V11, the architecture has a hole.
- GovernanceView ships a conformance test suite; CoopView and any other consumer runs it against their integration.

**Frontend.** The 75-page SvelteKit frontend carries through. The migration happens behind the API surface; the frontend's ATProto OAuth flows, the CSN-specific UI components, the cooperative configuration and management screens all keep working as the substrate changes. The exception is anything that surfaces V9's visibility-router-driven "open/mixed/closed" choice prominently — if §12 retires that binary, the corresponding UI moves to per-record placement controls.

---

## 11. Engagement plan

Building V11 is half code and half ecosystem participation. CSN's design choices land in the right place only if CSN is actively in the conversations where the relevant decisions are made. Three concrete deliverables follow.

### 11.1 The Arbiter cooperative use case document

CSN should write a parallel design document framed as "the cooperative use case for the Arbiter pattern." This is a separate Leaflet post (or whatever venue Zicklag prefers) that frames CSN's needs in language Zicklag can incorporate into the Arbiter design.

The document should cover:

- Cooperatives as arbiter instances; the recursive cooperative model.
- Multi-stakeholder member classes as space-as-member-of-space recursion.
- Cooperative lifecycle events (reorganization, merger, split, dissolution) and what the Arbiter design implies for each.
- Cooperative-specific access patterns: officer terms (time-bounded role-space membership), probationary members, member-class restrictions on space creation.
- Inter-cooperative trust delegation requirements (sections 9.1, 9.2 above).
- Concrete questions: how arbiter access levels (8 levels) compose with cooperative role meanings; how `$admin` fits with cooperative bylaws-mandated officer authority; whether arbiter audit logging is sufficient for cooperative compliance requirements.
- Open questions that are uniquely visible from the cooperative use case (e.g., what happens to space ownership when a cooperative dissolves).

This document is a contribution, not a critique. It frames the cooperative use case as a generalization the Arbiter benefits from supporting, not as a divergence the Arbiter needs to accommodate. Zicklag is building the Arbiter for Roomy; the cooperative use case helps Zicklag see how the Arbiter generalizes to harder use cases.

### 11.2 Lexicon Community engagement: `community.lexicon.governance.*`

CSN should propose `community.lexicon.governance.*` as a community lexicon namespace, framed as part of the conversation about how cooperatives think about privacy and governance on permissioned data.

The proposal includes:

- The generic governance lexicons (proposal, vote, deliberation, summary, logHead, election).
- The anchor pattern as a generic primitive.
- The transparency-log pattern as a generic primitive.
- An honest discussion of the cooperative-derived motivation: "These lexicons emerged from CSN's work on cooperative governance, but they generalize; here's how Roomy / opensocial.community / NorthSky could use them."

**Process the Lexicon Community uses.** Per the `lexicon-community/lexicon` repo's established practice:

1. **Open a Discussion thread first.** Precedent: the Profile Lexicon Discussion (#9) and Social Graph Discussion (#10) on `github.com/lexicon-community/lexicon`. Frame the discussion as "here's what we're seeing, here are the lexicons we propose, here's how we think they fit together." Get rough community feedback before drafting PRs.
2. **Form a working group if scope warrants.** Precedent: the Polite Goshawk Lexicon Lenses WG. Governance lexicons may be scope-large enough that a small WG of CSN, Roomy, and one or two other interested parties produces better designs than a single proposer.
3. **Submit PRs to `lexicon-community/lexicon`** after the Discussion converges on shape. The PRs include the lexicon JSON, a description doc, and at least one consumer implementation (CSN's own indexer is sufficient evidence of a consumer).
4. **Iterate on TSC review.** The Lexicon Community has a TSC that reviews substantive proposals; expect revision rounds.

**Fallback.** If the Lexicon Community rejects or significantly reshapes `community.lexicon.governance.*`, CSN ships under `network.coopsource.governance.*` with the same API. The package is still reusable by Roomy or others; it's just CSN-namespaced. Stage 6 of §10.2 accepts either outcome.

**Who posts.** Alan posts the Discussion thread to the Lexicon Community forum. CSN proceeds in parallel — designing against `community.lexicon.governance.*` as the working namespace — without waiting for community response. If reshape requests come back, CSN incorporates; if rejection comes back, CSN falls back per above.

The proposal should land *during the spaces design phase*, not after. The protocol team is actively soliciting feedback on permissioned data, and the generic governance vocabulary is exactly the kind of higher-level pattern that would benefit from being shaped in concert with the protocol primitives.

### 11.3 Direct feedback to Holmgren via Diary comments

Each new Diary entry (Diary 6+) should get CSN's substantive feedback. The feedback agenda:

- The OAuth-spaces seam: how app authorization within spaces composes with OAuth scopes (§4.2).
- Cooperative DID lifecycle events: what the controlled-DID system implies for transfers, merges, splits (§9.6).
- The recursive arbiter pattern: whether the protocol or the Arbiter handles space-as-member-of-space recursion, and whether the protocol's approach to recursion has practical depth limits CSN should care about.
- Whether per-(coop, member) personal spaces fit the personal-space use case Holmgren mentions in Diary 5 or require something different in shape (not in cost — cost is deferred per §12.1).

### 11.4 AT Protocol Private Data Working Group

The `discourse.atprotocol.community/t/introductions-and-kick-off/37` thread is the kickoff for the Private Data WG — a venue for cross-implementation coordination on permissioned-data design. CSN should join as a participant, not a passive observer. The WG is the right place to:

- Raise the cooperative use case as a stress test on the spaces design (recursive cooperatives, multi-stakeholder member classes, fiscal-period snapshot semantics).
- Coordinate with other implementers (NorthSky, Habitat, Blacksky) whose permissioned-data approaches will need to interoperate with CSN's eventually.
- Surface the OAuth-spaces seam questions (§4.2) that affect every consumer.
- Argue for the controlled-DID system being scoped to also cover per-(coop, member) personal spaces, not just community spaces.

Frequency of engagement: lurk weekly, comment when a thread touches CSN's concerns, post substantive material monthly. Don't dominate; do show up.

### 11.5 opensocial.community, NorthSky, Habitat

- **opensocial.community / Brittany Ellich.** Building "groups as a service" in ATProto with a service-auth JWT model that overlaps with CSN's Axis 5 (§4.3). Worth a coordination meeting; CSN's recursive cooperative model and opensocial.community's group model are related abstractions with different vocabularies. Either GovernanceView is interesting to her or CSN should learn from her group model — probably both.
- **NorthSky.** Per the Spring 2026 Roadmap, working on permissioned-data extensions. Their interim approach is different from spaces (server-filtered visibility) but they'll converge on the spaces design as it ships. Engage on the WG forum.
- **Habitat, Blacksky.** Same. Each has its own use case; each will surface design pressure CSN doesn't see from cooperatives alone.

The pattern across all of these is the same: CSN's posture is *one ecosystem participant among many*, not a privileged convener. The Arbiter is Zicklag's. The protocol is Holmgren's. The Lexicon Community has its own TSC. CSN contributes the cooperative use case and accepts what the ecosystem produces.

---

## 12. Design decisions

The design questions surfaced through this report have been resolved. This section records the decisions; the V11 architecture document carries them forward as commitments. The framing flipped from "open questions" to "commitments with rationale" deliberately — these don't need re-litigation, they need implementation.

### 12.1 Architectural commitments

**Per-(coop, member) personal spaces, with cost optimization deferred.** CSN ships per-(coop, member) personal spaces as the model for individual records (patronage, capital accounts, 1099-PATR forms, personal contact info). A 5,000-member cooperative would have 5,000 personal spaces. Whether that scales depends on the controlled-DID system's per-space cost shape, which isn't fully specified yet. The decision is to ship the cleaner abstraction now and optimize once the end-to-end system is running. Speculative cost simulation against an unspecified protocol would produce worse decisions than measurements against the real one.

**Membership lexicons retire.** Both `network.coopsource.org.membership` and `network.coopsource.org.memberApproval` retire entirely. The cooperative's `members` space is the single source of truth. If member-side preferences are wanted later, they get a new lexicon (`network.coopsource.org.memberPreferences`) stored in the member's personal space, not on the cooperative's record-of-truth path.

**Binary `governance_visibility` retires.** V9's `open` / `mixed` / `closed` flag retires entirely. Per-record placement (which space a record lives in) is the visibility mechanism. The simplicity gain of the binary switch wasn't worth the loss of expressiveness.

**Governance labels via `$labeler` space.** CSN does not run a separate labeler service. The cooperative arbiter owns its labels through the `$labeler` space (§6.9). If the Arbiter spec for `$labeler` hasn't been formalized by the time CSN reaches implementation, CSN does the standardization work rather than waiting on Roomy's roadmap. The principle is to avoid unnecessary coupling between CSN and a separate labeler service; the arbiter is the natural authority for cooperative labels because it's already the authority for everything else.

**RFC 9421 HTTP signatures retire.** V8's HTTP signatures retire in V11 unless a specific edge case emerges that spaces don't cover. Spaces with cross-arbiter space-as-member relationships subsume the closed-cooperative-to-closed-cooperative private exchange use case.

**Single custom AppView.** CSN runs one AppView (`apps/api` extended with a spaces consumer), not multiple. HappyView 2.5+ is used as a reference implementation for development and validation, not as production substrate.

**`community.lexicon.governance.*` namespace.** CSN proceeds as if this is the namespace for generic governance lexicons. Alan posts the Discussion thread to the Lexicon Community forum (§11.2); CSN designs against the namespace without waiting for community ratification. If the community rejects or significantly reshapes the proposal, CSN falls back to `network.coopsource.governance.*` with the same API.

### 12.2 Cooperative DID lifecycle

**Cooperatives own their DIDs.** The cooperative owns its DID with rotation keys held offline by cooperative governance. CSN as hosting provider holds the signing key only — never the rotation key. This is documented explicitly in the cooperative onboarding flow and the bylaws templates. If CSN ceases operation, the cooperative can rotate to a new PDS without CSN's cooperation.

**DID rotation aliasing.** V11 includes a `did_rotation_history` table that maps old DIDs to new ones, updated when CSN observes a `did:plc` rotation. All DID-comparing code in CSN consults this table; references to rotated DIDs resolve to current DIDs transparently. This covers member-list entries, federation links, anchor records, and labels.

### 12.3 Bluesky design pivot policy

If Bluesky ships permissioned data with significant deviations from Diaries 4 and 5, CSN treats the following as *load-bearing* (would force replanning):

- `ats://`-vs-`at://` URI semantics (or whatever URI scheme replaces it),
- `(DID, read|write)` ACL minimality as the protocol-layer access model,
- Cooperative-DID-as-distinct-from-user-DID.

Everything else is *substrate*, abstracted behind ports. ECMH commits, pull-based sync, notification topology, specific credential lifetimes — all can change without forcing CSN to replan. The abstraction in code is "did this read/write succeed?" with the answer composed from whatever the protocol settles on.

### 12.4 Tier 3 (E2EE) integration

CSN's UI detects Germ DM availability for relevant members and surfaces "start secure conversation" actions; the platform never handles message content. For platforms not supported by Germ (currently anything outside iOS via App Clip), affected flows either disable or fall back to the Germ web UI if available. The V11 architecture treats Tier 3 as an *optional secondary channel* rather than a required path. Cooperatives that need Tier 3 confidentiality (board executive sessions, salary records, personnel matters) are limited to whatever Germ supports until cross-platform parity exists.

### 12.5 Subchapter T canonical record-of-truth

CSN commits to ATProto-native records via the `patronage-allocator` and `1099-PATR` plugin contracts (§8.3) as the primary canonical source now. CSN consults cooperative legal counsel in parallel to validate this against IRS audit expectations. If a separate external accounting ledger turns out to be legally required, it is added at a later date as a foreign-key link on the ATProto record (e.g., `ledger_entry_id`). The ATProto record carries the primary state; any external ledger is supplementary, not the source of truth.

### 12.6 Historical-state-resolver

GovernanceView retains snapshots of arbiter member-list state at well-defined cadences:

- Per fiscal-period close (Subchapter T patronage snapshot semantics).
- Per role-space change (officer term boundaries, member admission/removal).
- Periodic (configurable interval; baseline daily).

Storage cost is manageable for cooperatives at CSN's target scale; the cleaner abstraction is worth it. CoopView's `historical-state-resolver` plugin reads from these snapshots. Reaching below GovernanceView into raw arbiter audit-log records is not the path; the snapshot abstraction is.

### 12.7 Immediate work items

The decisions above imply work to do now, in parallel with the rest of V11 design:

- **OAuth-spaces seam writeup.** Per §4.2 and the Diary 4 space-credential exchange sketch, produce a sequence diagram, an interface contract for `MemberWriteProxy`, and the three failure modes. Treat residual ambiguity as the genuinely open part; treat the bulk as solvable now.
- **`community.lexicon.governance.*` forum post.** Alan posts to the Lexicon Community forum. CSN proceeds against the namespace without waiting.
- **Cooperative onboarding / bylaws documentation update.** Document the rotation-key custody model (cooperative governance holds rotation keys; CSN holds signing key only). Update onboarding flows and bylaws templates.
- **`did_rotation_history` schema addition.** Add the table to `packages/db/src/schema.ts`. Add a utility (`resolveCurrentDid(did)`) and refactor DID-comparing code to use it. This is a small, safe change that can ship before the rest of V11.

### 12.8 Items still genuinely open

A few items still wait on signal from outside CSN:

- **The full OAuth-spaces seam mechanism.** §4.2. Protocol choice. The bulk is sketchable now; the residual details (how `permissions:{nsid}` scopes compose with space allow/deny, service-auth JWT roles) settle as Diary 6+ and the OAuth granular-scopes work cross-pollinate. CSN's seam writeup explicitly identifies which parts are sketchable today vs which await protocol resolution.
- **Lexicon Community response to `community.lexicon.governance.*`.** Alan's forum post starts the conversation. CSN proceeds in parallel; if the community comes back with substantive reshape requests, CSN incorporates.
- **Subchapter T legal counsel consultation.** Whether ATProto-native records alone satisfy IRS audit expectations, or whether an external accounting ledger is required for legal sufficiency, awaits counsel. CSN's plugin contracts (`patronage-allocator`, `1099-PATR`) ship in the meantime with the ATProto record as canonical.

### 12.9 V11 architecture document scope

The V11 document inherits V10's surviving phases (V10.4 content wrappers, V10.5 transparency logs) integrated into GovernanceView; archives V10.1 (PostgreSQL six-tier ACL) as a workaround that didn't make the cut; documents the layered architecture from §5; specifies GovernanceView and CoopView; sketches the transition from §10; carries forward the decisions in this section as commitments. V10 moves to `docs/archive/ARCHITECTURE-V10.md` alongside V3, V5, V6, V7, V8.

---

## 13. Strawman: GovernanceView and CoopView interfaces

This section sketches the shape of the Layer 3 / Layer 4 boundary in code. It is a strawman — the V11 architecture document refines the names, splits, and signatures — but it commits enough shape that implementation can begin and the boundary can be enforced from the start. Sketches use TypeScript declaration syntax; bodies are illustrative.

Three commitments shape these interfaces:

1. **`@coopsource/governance-view` extracts now.** Even before the boundary is fully validated, GovernanceView lives in its own package. Accidental coupling between Layer 3 and Layer 4 is harder to remove later than to avoid upfront.
2. **GovernanceView ships its own tables.** A new `gv_*` table family in `@coopsource/db` (or a new `@coopsource/governance-view-db` package). CoopView's `proposal`, `vote`, etc. become CSN-specific projections that join `gv_*` with patronage / class / fiscal-period data. The duplication is intentional: it makes the boundary visible and means Roomy can deploy GovernanceView with just `gv_*` schema, no `network.coopsource.*` tables.
3. **Plugins are constructor-injected.** GovernanceView accepts a `GovernancePluginSet` in its constructor. CSN's assembly point at `apps/api/src/container.ts` wires CoopView's plugin implementations in at startup. Per-cooperative runtime extensibility (user-of-CSN scripts) goes through the existing `apps/api/src/scripting/` substrate — a separate concern from co-developer plugins.

### 13.1 Package layout

```
packages/
  governance-view/                    ← NEW (Layer 3)
    src/
      lexicons/
        proposal.json                 community.lexicon.governance.proposal
        vote.json                     community.lexicon.governance.vote
        deliberation.json             community.lexicon.governance.deliberation
        summary.json                  community.lexicon.governance.summary
        log-head.json                 community.lexicon.governance.logHead
        election.json                 community.lexicon.governance.election
      services/
        proposal-service.ts           generic proposal lifecycle
        vote-service.ts               generic vote casting + tally
        deliberation-service.ts       generic threaded discussion
        anchor-service.ts             generic public-summary anchor records
        log-service.ts                generic transparency-log
      indexers/
        gv-proposal-indexer.ts
        gv-vote-indexer.ts
        gv-role-snapshot-indexer.ts
      hooks/
        types.ts                      hook types (extends apps/api shape)
        registry.ts                   hook registry
        pipeline.ts                   pre/post pipeline
      plugins/
        types.ts                      ALL plugin interfaces (see §13.3)
        defaults.ts                   no-op default implementations
      xrpc/
        community.lexicon.governance.*.ts   XRPC handlers
      index.ts                        public API: GovernanceView class
    package.json                      @coopsource/governance-view
  coop-view/                          ← NEW (Layer 4)
    src/
      lexicons/                       network.coopsource.* (CoopView subset)
      services/                       PatronageService, CapitalAccountService, etc.
      plugins/
        vote-weight.ts                CoopView's VoteWeightCalculator impl
        eligibility.ts                CoopView's ProposalEligibilityChecker impl
        quorum.ts                     CoopView's QuorumChecker impl
        action-authorizer.ts          CoopView's ActionAuthorizer impl
        historical-state.ts           CoopView's HistoricalStateReader impl
        patronage-allocator.ts        CoopView's PatronageAllocator impl
        anchor-summary.ts             CoopView's AnchorSummaryBuilder impl
      indexers/                       CoopView-specific indexers
      xrpc/                           network.coopsource.* XRPC handlers
      index.ts                        public API: CoopView class
    package.json                      @coopsource/coop-view
apps/
  api/                                assembly point (unchanged role)
    src/
      container.ts                    wires GovernanceView + CoopView together
      ...                             existing CSN-specific code
```

### 13.2 The GovernanceView entry point

The package exposes a single `GovernanceView` class that's constructed with its dependencies and plugin set:

```ts
// packages/governance-view/src/index.ts

import type { Kysely } from 'kysely';
import type { GovernanceDatabase } from './db.js';
import type { IArbiterClient } from './arbiter-client.js';
import type { ISpacesConsumer } from './spaces-consumer.js';
import type { IClock, IPdsService } from '@coopsource/federation';
import type { GovernancePluginSet } from './plugins/types.js';
import { defaultPluginSet } from './plugins/defaults.js';
import { ProposalService } from './services/proposal-service.js';
import { VoteService } from './services/vote-service.js';
import { DeliberationService } from './services/deliberation-service.js';
import { AnchorService } from './services/anchor-service.js';
import { LogService } from './services/log-service.js';
import { HookRegistry } from './hooks/registry.js';

export interface GovernanceViewConfig {
  db: Kysely<GovernanceDatabase>;
  arbiter: IArbiterClient;
  spacesConsumer: ISpacesConsumer;
  pdsService: IPdsService;
  clock: IClock;
  plugins?: Partial<GovernancePluginSet>;
}

export class GovernanceView {
  readonly proposals: ProposalService;
  readonly votes: VoteService;
  readonly deliberations: DeliberationService;
  readonly anchors: AnchorService;
  readonly log: LogService;
  readonly hooks: HookRegistry;
  readonly plugins: GovernancePluginSet;

  constructor(cfg: GovernanceViewConfig) {
    this.plugins = { ...defaultPluginSet, ...cfg.plugins };
    this.hooks = new HookRegistry();
    this.proposals = new ProposalService({ ...cfg, plugins: this.plugins });
    this.votes = new VoteService({ ...cfg, plugins: this.plugins, hooks: this.hooks });
    this.deliberations = new DeliberationService(cfg);
    this.anchors = new AnchorService({ ...cfg, plugins: this.plugins });
    this.log = new LogService(cfg);
  }
}

export type { GovernancePluginSet } from './plugins/types.js';
export * from './plugins/types.js';
```

Key shape choices:

- Single class, services exposed as readonly fields. Lets callers do `governanceView.votes.castVote(...)` without DI gymnastics on the consumer side.
- Plugins are partial in the constructor; missing entries fall back to `defaultPluginSet`. A Roomy deployment passes no plugins; everything uses defaults. A CSN deployment passes CoopView's full set.
- `IArbiterClient` and `ISpacesConsumer` are dependency interfaces, not concrete classes. GovernanceView doesn't know whether the arbiter is Zicklag's or CSN's own.
- The hook registry is exposed for CoopView (or any other consumer) to register hooks into the post-storage pipeline.

### 13.3 The plugin interfaces

This is the load-bearing surface for Layer 3 / Layer 4 separation. CoopView's cooperative-specific logic lives entirely in implementations of these interfaces; GovernanceView calls them at well-defined points.

```ts
// packages/governance-view/src/plugins/types.ts

import type { DID } from '@coopsource/common';

/** Reference to a proposal record by AT-URI + CID. */
export interface ProposalRef {
  uri: string;
  cid: string;
}

/** Reference to a space by arbiter DID + space type + skey. */
export interface SpaceRef {
  arbiter: DID;
  type: string;
  skey: string;
}

/** Snapshot of arbiter member-list state at a moment in time. */
export interface RoleSnapshot {
  space: SpaceRef;
  members: DID[];
  takenAt: Date;
  reason: 'fiscal-period-close' | 'role-space-change' | 'periodic' | 'on-demand';
}

/** Result of an eligibility check. */
export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
  /** Optional structured data CoopView wants to surface (e.g., 'probation_until'). */
  metadata?: Record<string, unknown>;
}

/** Result of weight resolution for a single voter on a single proposal. */
export interface VoteWeight {
  weight: number;
  /** Evidence supporting the weight (e.g., patronage share, member class). */
  evidence?: Record<string, unknown>;
}

/** Result of quorum resolution. */
export interface QuorumResult {
  met: boolean;
  reason?: string;
  /** Per-class quorum results, for multi-stakeholder cases. */
  perClass?: Record<string, { met: boolean; required: number; actual: number }>;
}

// ---------- Plugin interfaces ----------

export interface VoteWeightCalculator {
  calculateWeight(args: {
    voterDid: DID;
    proposalRef: ProposalRef;
    cooperativeDid: DID;
  }): Promise<VoteWeight>;
}

export interface ProposalEligibilityChecker {
  checkEligibility(args: {
    voterDid: DID;
    proposalRef: ProposalRef;
    cooperativeDid: DID;
  }): Promise<EligibilityResult>;
}

export interface QuorumChecker {
  checkQuorum(args: {
    proposalRef: ProposalRef;
    cooperativeDid: DID;
    votesAndWeights: Array<{ voter: DID; choice: string; weight: number }>;
  }): Promise<QuorumResult>;
}

export interface ActionAuthorizer {
  /**
   * Translates an application-level permission query to a yes/no.
   * Example: action = 'create-proposal-about-bylaws'.
   */
  authorize(args: {
    actorDid: DID;
    cooperativeDid: DID;
    action: string;
    target?: ProposalRef | SpaceRef;
  }): Promise<boolean>;
}

export interface AnchorSummaryBuilder {
  /**
   * Builds the application-specific fields of an anchor record.
   * GovernanceView fills in the generic fields (member count, proposal count, etc.);
   * the plugin adds cooperative-specific ones (cooperative type, ICA declarations).
   */
  buildExtensions(args: {
    cooperativeDid: DID;
    summaryKind: 'membership' | 'governance-feed' | 'cooperative-profile';
  }): Promise<Record<string, unknown>>;
}

export interface HistoricalStateReader {
  /**
   * Retrieves the snapshot of a role-space's member list as of a given timestamp.
   * Returns the most recent snapshot at-or-before `at`.
   */
  readAt(args: {
    space: SpaceRef;
    at: Date;
  }): Promise<RoleSnapshot | null>;

  /**
   * Records a new snapshot. Called by GovernanceView at well-defined cadences
   * (per fiscal-period close, per role-space change, periodic).
   */
  recordSnapshot(snapshot: RoleSnapshot): Promise<void>;
}

export interface PatronageAllocator {
  /**
   * Computes per-member patronage allocations for a fiscal period.
   * Subchapter T-specific: implementations separate patronage-sourced from non-patronage-sourced income.
   */
  allocate(args: {
    cooperativeDid: DID;
    fiscalPeriodId: string;
    membershipSnapshot: RoleSnapshot;
  }): Promise<Array<{
    memberDid: DID;
    allocation: number;
    qualifiedAmount: number;
    nonQualifiedAmount: number;
    evidence: Record<string, unknown>;
  }>>;
}

export interface SurplusDistributor {
  /**
   * Distributes cooperative surplus per cooperative-type rules.
   * Produces both cash distributions (within 8.5 months for qualified-dividend treatment)
   * and equity allocations (capital account credits).
   */
  distribute(args: {
    cooperativeDid: DID;
    fiscalPeriodId: string;
    surplusAmount: number;
  }): Promise<Array<{
    memberDid: DID;
    cashAmount: number;
    equityAmount: number;
    treatment: 'qualified' | 'non-qualified';
  }>>;
}

export interface MeetingMinutesCanonicalizer {
  /**
   * Produces canonical, signed meeting-minute records from a raw deliberation thread.
   * Output satisfies legal record-keeping requirements (presence quorum, motions,
   * votes, resolutions).
   */
  canonicalize(args: {
    cooperativeDid: DID;
    deliberationUri: string;
    proposalRefs: ProposalRef[];
  }): Promise<{
    minutesUri: string;
    minutesCid: string;
  }>;
}

export interface DelegateChainResolver {
  /**
   * Resolves proxy votes and delegation chains. Computes effective vote weight
   * after delegation, detects delegation cycles, applies cooperative-specific limits.
   */
  resolveChains(args: {
    cooperativeDid: DID;
    proposalRef: ProposalRef;
    explicitVoters: DID[];
  }): Promise<Array<{
    effectiveVoter: DID;
    delegationPath: DID[];
    aggregatedWeight: number;
  }>>;
}

/** The full set of plugins GovernanceView accepts. All optional; defaults are no-ops. */
export interface GovernancePluginSet {
  voteWeight: VoteWeightCalculator;
  eligibility: ProposalEligibilityChecker;
  quorum: QuorumChecker;
  actionAuthorizer: ActionAuthorizer;
  anchorSummary: AnchorSummaryBuilder;
  historicalState: HistoricalStateReader;
  patronageAllocator: PatronageAllocator;
  surplusDistributor: SurplusDistributor;
  meetingMinutes: MeetingMinutesCanonicalizer;
  delegateChains: DelegateChainResolver;
}
```

Design notes on the plugin shape:

- **All async, returning `Promise<T>`.** Matches the existing async style of `ProposalService`, `MembershipService`, etc. CoopView plugin impls usually hit Kysely; making them sync would force awkward in-memory caches.
- **All inputs are plain values (DIDs, refs, snapshots), not service handles.** A plugin doesn't get a reference to GovernanceView or to other plugins. If it needs more data, it gets it from its own injected dependencies (CoopView holds its own `db`, `arbiterClient`, etc.). This keeps the call graph one-way: GovernanceView calls plugins; plugins don't call GovernanceView back.
- **Defaults are no-ops, not errors.** `defaultPluginSet.voteWeight.calculateWeight()` returns `{ weight: 1 }`. `defaultPluginSet.eligibility.checkEligibility()` returns `{ eligible: true }`. `defaultPluginSet.actionAuthorizer.authorize()` returns `true`. This lets Roomy ship GovernanceView without implementing anything; the no-op behaviors give a working one-member-one-vote system out of the box.
- **`HistoricalStateReader` is the only plugin that GovernanceView *writes* to.** GovernanceView records snapshots at cadence boundaries; CoopView reads them. This is the load-bearing primitive for Subchapter T patronage allocation, which has to consume membership-as-of-fiscal-period not membership-as-of-now (§12.6).
- **`SpaceRef` is independent of the URI scheme decision.** `{ arbiter: DID, type: string, skey: string }` survives `ats://` becoming something else; only the URI helpers need rewriting.

### 13.4 Hook composition between layers

GovernanceView exposes its hook registry. CoopView registers its hooks at construction time:

```ts
// packages/coop-view/src/index.ts (illustrative)

import type { GovernanceView } from '@coopsource/governance-view';
import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import { PatronageService } from './services/patronage-service.js';
import { registerCoopHooks } from './hooks/index.js';
import {
  CoopVoteWeightCalculator,
  CoopEligibilityChecker,
  CoopQuorumChecker,
  CoopActionAuthorizer,
  // ... etc
} from './plugins/index.js';

export interface CoopViewConfig {
  governance: GovernanceView;
  db: Kysely<Database>;
  // ... other deps
}

export class CoopView {
  readonly patronage: PatronageService;
  // ... other CSN-specific services

  constructor(cfg: CoopViewConfig) {
    this.patronage = new PatronageService(cfg);
    // ... etc

    // Register CoopView's hooks into GovernanceView's pipeline.
    registerCoopHooks(cfg.governance.hooks, cfg);
  }

  /** Build the GovernancePluginSet that CSN passes to GovernanceView's constructor. */
  static buildPluginSet(cfg: CoopViewConfig): GovernancePluginSet {
    return {
      voteWeight: new CoopVoteWeightCalculator(cfg),
      eligibility: new CoopEligibilityChecker(cfg),
      quorum: new CoopQuorumChecker(cfg),
      actionAuthorizer: new CoopActionAuthorizer(cfg),
      anchorSummary: new CoopAnchorSummaryBuilder(cfg),
      historicalState: new CoopHistoricalStateReader(cfg),
      patronageAllocator: new CoopPatronageAllocator(cfg),
      surplusDistributor: new CoopSurplusDistributor(cfg),
      meetingMinutes: new CoopMeetingMinutesCanonicalizer(cfg),
      delegateChains: new CoopDelegateChainResolver(cfg),
    };
  }
}
```

Wiring at the CSN assembly point:

```ts
// apps/api/src/container.ts (illustrative, abbreviated)

const governance = new GovernanceView({
  db: governanceDb,
  arbiter: arbiterClient,
  spacesConsumer,
  pdsService,
  clock,
  // plugins are filled in below after CoopView is constructed
});

const coopView = new CoopView({
  governance,
  db,
  // ... other deps
});

// Late-binding the plugin set is mildly awkward; in practice we'll either
// (a) construct CoopView first with a stub GovernanceView reference and
// finalize after, or (b) split CoopView into a plugin-set-factory and
// the service-bearing object. The V11 doc picks one.
governance.plugins = CoopView.buildPluginSet({ governance, db, /* ... */ });
```

This circular wiring is the one rough edge in the strawman. The V11 architecture document picks a clean factoring — either lazy plugin resolution (GovernanceView calls `() => coopView.plugins.voteWeight` indirectly) or two-phase construction (CoopView's plugins first, then GovernanceView, then CoopView's services that need GovernanceView). The cleaner factoring is two-phase: plugins are stateless transformers over their injected `db` / `arbiterClient` deps and don't need a `GovernanceView` reference at all.

### 13.5 Lexicon extension

The generic lexicons in `community.lexicon.governance.*` are the substrate; CSN-specific lexicons in `network.coopsource.governance.*` extend them by including richer fields.

Two patterns will be evaluated in the V11 document; the strawman picks one (lexicon wrapping) and notes the alternative:

**Wrapping (chosen for the strawman).** The CSN vote record contains a `generic` field that conforms to `community.lexicon.governance.vote`, plus CSN-specific fields alongside:

```json
// network.coopsource.governance.vote
{
  "$type": "network.coopsource.governance.vote",
  "generic": {
    "voterDid": "did:plc:...",
    "proposalRef": { "uri": "ats://...", "cid": "bafy..." },
    "choice": "yes"
  },
  "memberClass": "worker",
  "patronageShare": 0.0234,
  "fiscalPeriod": "2026"
}
```

GovernanceView's indexer reads the `generic` field and ignores the rest; CoopView's indexer reads everything. Any consumer that speaks only `community.lexicon.governance.vote` can extract the generic field from a CSN vote and treat it as a generic vote.

**Extension (alternative, not chosen).** The CSN vote conforms to the generic schema flatly, with extra fields tolerated via lexicon's open-record semantics. Simpler but loses the explicit nested-typing signal that says "this is a CSN extension of a generic record."

The V11 document revisits this in light of how the Lexicon Community settles the extension pattern for community lexicons in general.

### 13.6 Database table split

GovernanceView's tables in a new `@coopsource/governance-view-db` package (or in `@coopsource/db` under a `gv_` prefix — V11 picks):

```
gv_proposal              — generic proposal projection
gv_vote                  — generic vote projection
gv_deliberation          — generic threaded discussion
gv_anchor                — generic anchor record projection
gv_log_head              — transparency log signed tree heads
gv_role_snapshot         — historical-state snapshots
gv_election              — vote-to-fill-a-position records
```

CoopView's CSN-specific tables stay in `@coopsource/db`:

```
proposal                 — cooperative-specific projection (joins gv_proposal with patronage / class data)
vote                     — cooperative-specific projection (joins gv_vote with member_class)
patronage_record
capital_account
fiscal_period
legal_document
meeting_record
officer_record
agreement
...                      — ~60 CSN-specific tables
```

Indexer pipeline:

1. Spaces consumer pulls a vote record from a member's permissioned repo.
2. GovernanceView's `gv-vote-indexer` writes a row into `gv_vote` keyed by `(proposal_uri, voter_did)`.
3. CoopView's `coop-vote-indexer` (registered as a post-storage hook on the same collection) writes a corresponding row into `vote`, joining the GovernanceView projection with the voter's member_class and patronage share.

The duplication is intentional. Roomy ships only the `gv_*` tables and runs only GovernanceView's indexers; the CoopView indexer doesn't exist in a Roomy deployment.

### 13.7 Hook registry pattern

Reusing the existing hook registry shape from `apps/api/src/appview/hooks/registry.ts`. The registry moves to `@coopsource/governance-view`; CoopView's hooks register into it:

```ts
// packages/coop-view/src/hooks/index.ts (illustrative)

import type { HookRegistry } from '@coopsource/governance-view';
import type { CoopViewConfig } from '../index.js';

export function registerCoopHooks(
  registry: HookRegistry,
  cfg: CoopViewConfig,
): void {
  registry.register({
    id: 'coop-patronage-projection',
    name: 'CoopView patronage projection',
    phase: 'post-storage',
    source: 'builtin',
    collections: ['network.coopsource.governance.vote'],
    priority: 150,
    postHandler: async (ctx) => {
      await projectVoteIntoCoopTable(cfg.db, ctx);
    },
  });

  registry.register({
    id: 'coop-anchor-on-membership-change',
    name: 'CoopView anchor record update on members-space change',
    phase: 'post-storage',
    source: 'builtin',
    collections: ['network.coopsource.org.members.*'],
    priority: 150,
    postHandler: async (ctx) => {
      await refreshMembershipAnchor(cfg, ctx);
    },
  });

  // ... etc
}
```

The priority bands established in the existing `types.ts` (builtin 0–99, declarative 100–199, script 200+) carry forward; CoopView's hooks register at priority 100–199, leaving 0–99 for GovernanceView's own builtin hooks.

### 13.8 What this strawman commits to

The V11 architecture document refines this strawman but treats the following as fixed shapes:

- **GovernanceView is its own package**, with its own database tables (`gv_*`) and its own lexicons (`community.lexicon.governance.*`).
- **Plugins are constructor-injected, not globally registered.** Per-cooperative runtime extensibility goes through `apps/api/src/scripting/`, not through plugins.
- **The ten plugin interfaces in §13.3** are the boundary. New cooperative-specific concerns that aren't covered by an existing plugin interface require adding a new plugin, not reaching around the boundary. The interface names follow a verb-noun convention (`VoteWeightCalculator`, `ProposalEligibilityChecker`, `QuorumChecker`, `ActionAuthorizer`, `AnchorSummaryBuilder`, `HistoricalStateReader`, `PatronageAllocator`, `SurplusDistributor`, `MeetingMinutesCanonicalizer`, `DelegateChainResolver`); names describe what the plugin produces, not what it's plugged into.
- **Hook composition uses the existing registry shape** from `apps/api/src/appview/hooks/`, lifted into GovernanceView.
- **Lexicon extension via wrapping** (`generic` field nested inside CSN-extended record). The alternative (flat extension) is on the table for V11 if the Lexicon Community settles a different convention.

Everything else — specific class names, the exact factoring of late-bound plugin wiring, whether `gv_*` lives in `@coopsource/db` or its own package, whether the `SurplusDistributor` ends up merged with `PatronageAllocator` — is open to refinement in V11.

---

## References

### Primary protocol sources (May 8, 2026)

- Holmgren, "Permissioned Data Diary 5: What's in a Name?", May 8, 2026 — `https://dholms.leaflet.pub/3mlegohgtps2k`
- Holmgren, "Permissioned Data Diary 4: The Big Picture", March 20, 2026 — `https://dholms.leaflet.pub/3mhj6bcqats2o`
- Holmgren, "Permissioned Data Diary 2: Buckets", February 26, 2026 — `https://dholms.leaflet.pub/3mfrsbcn2gk2a`
- AT Protocol Roadmap (Spring 2026), Bluesky Protocol Team, March 24, 2026 — `https://atproto.com/blog/2026-spring-roadmap`
- AT Protocol OAuth Specification — `https://atproto.com/specs/oauth`
- AT Protocol Permission Sets Guide — `https://atproto.com/guides/permission-sets`
- Auth Scopes Proposal (#0011) — `https://github.com/bluesky-social/proposals/tree/main/0011-auth-scopes`
- Updated Auth Scopes Proposal Discussion — `https://github.com/bluesky-social/atproto/discussions/4013`
- Early Permission Sets Discussion — `https://github.com/bluesky-social/atproto/discussions/4437`
- `@atproto/oauth-scopes` reference implementation — `https://www.npmjs.com/package/@atproto/oauth-scopes`
- `bluesky-social/atproto` permissioned-data branch — `https://github.com/bluesky-social/atproto/compare/permissioned-data`

### Ecosystem sources

- Trezy, "Releasing HappyView 2 Into the Wild", April 24, 2026 — `https://trezy.com/blog/releasing-happyview-2-into-the-wild`
- HappyView v2.5.0 — "The Permissioned Data Release", May 5, 2026 — `https://github.com/gamesgamesgamesgamesgames/happyview/releases/tag/v2.5.0`
- Zicklag, "The Arbiter — Group Management for Permissioned Spaces and Beyond", April 18, 2026 — `https://zicklag.leaflet.pub/3mjrvb5pul224`
- Zicklag, "Making Roomy More ATProto-Native", March 13, 2026 — `https://zicklag.leaflet.pub/3mgy2sbswl22f`

### CSN context

- ARCHITECTURE-V9.md, March 2026 (project root) — current shipped architecture
- ARCHITECTURE-V10.md, April 16, 2026 (project root) — designed but not implemented; superseded by V11 in scope
- `docs/plans/2026-05-08-spaces-and-csn-research.md` — earlier research report, now superseded by this document
- `docs/archive/` — earlier architecture versions (V3, V5, V6, V7, V8)
- Trust networks research: `Trust_Networks_for_Cooperative_Governance_on_ATProto__CSN_V5_Protocol_Design_and_Research_Foundations.md`
- Trust integration research: `Integrating_Trust_into_ATProto_Cooperative_Governance__TrustNet__ZK_Voting__and_Verifiable_Credentials_for_CSN_V5.md`
- Ecosystem research: `ATProto_Ecosystem_Research_for_CSN_V5_Architecture_Alignment__Governance__Permissioned_Data__and_Cooperative_Design.md`

### Code references (current state)

- `packages/db/src/schema.ts` — current schema (April 12, 2026)
- `apps/api/src/services/membership-service.ts` — bilateral membership state machine (to retire)
- `apps/api/src/services/visibility-router.ts` — V9 binary public/private gate (to retire)
- `apps/api/src/services/private-record-service.ts` — current Tier 2 storage (to repurpose as personal-space-backed projection cache)
- `apps/api/src/auth/oauth-client.ts` — ATProto OAuth client (to extend with granular scope support)
- `apps/api/src/services/operator-write-proxy.ts` — operator write proxy (to thin into Arbiter $admin wrapper)
- `apps/api/src/appview/hooks/` — hook pipeline (to extract into GovernanceView)
- `packages/lexicons/network/coopsource/` — current 47 lexicons (CoopView lexicons stay; some retire as their concerns move into GovernanceView's generic equivalents)
