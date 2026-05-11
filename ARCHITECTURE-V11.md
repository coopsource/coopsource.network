# ARCHITECTURE-V11.md — Spaces, Arbiter, GovernanceView, and CoopView

> **Date**: May 11, 2026
> **Status**: Active architectural specification
> **Supersedes**: V9 (`docs/archive/ARCHITECTURE-V9.md`), V10 (`docs/archive/ARCHITECTURE-V10.md`)
> **Research foundation**: `docs/plans/2026-05-08-csn-architectural-direction.md` (deep rationale, design analysis), `docs/plans/2026-05-11-csn-research-addendum.md` (May ecosystem scan)
> **Earlier architecture history**: V3, V5, V6, V7, V8 in `docs/archive/`

---

## 0. Executive Summary

V11 is the architectural shift from "ATProto-native with workarounds for absent primitives" to "ATProto-native using the primitives that have now landed." V9 built a working cooperative platform on ATProto using three workarounds — bilateral membership records, a `VisibilityRouter` with three storage tiers, and custom federation primitives — because the protocol did not yet have group semantics, permissioned data, or cross-organization identity. V10 was designed (April 16, 2026) to deepen those workarounds but was never implemented. V11 replaces the workarounds with the protocol primitives now available: **permissioned spaces** (Holmgren's permissioned-data work, Diaries 1–5), **the Arbiter pattern** (Meri and Zicklag's group-management service, April 2026), and the **GovernanceView/CoopView layered architecture** that CSN contributes back to the ecosystem.

**Five architectural commitments shape V11:**

1. **CSN treats authority as a small set of distinct axes, not a single ACL.** OAuth scopes govern app-to-user authority. Spaces govern user-to-user authority. Application logic governs user-to-action authority. Labels and service-auth JWTs sit alongside as adjacent axes. Separating them in code is what distinguishes a debuggable authorization model from V9's tangled one.

2. **CSN adopts the Arbiter pattern as its group-management substrate.** A cooperative is an arbiter instance. Roles (board, officers, treasurer, member classes, custom roles) are spaces. Networks of cooperatives are arbiters whose `members` space contains other cooperative DIDs — the recursive cooperative model expressed at the protocol level.

3. **CSN builds a generic governance layer that other ATProto projects can use.** **GovernanceView** is a standalone service providing generic governance primitives — proposals, votes, deliberations, anchor records, transparency logs, vote-tally aggregation, role-state derivation — on top of Arbiter spaces. Its lexicons live in `community.lexicon.governance.*`.

4. **CSN's distinctive cooperative semantics live in CoopView, layered on GovernanceView.** Cooperative-specific concerns — Subchapter T compliance, patronage allocation, capital accounts, multi-stakeholder weighted voting, ICA principle adherence, financial period tracking, 1099-PATR generation, agreement lifecycle — are extensions of GovernanceView rather than the substance of it. CoopView's lexicons stay in `network.coopsource.*`.

5. **CSN keeps the application substance from V9.** Governance, agreements, legal, finance, operations, commerce, alignment, agents — these are cooperative semantics that can't be commoditized into a generic governance layer. They survive into V11. What changes is what they sit on: a Spaces + Arbiter + GovernanceView foundation rather than a PostgreSQL bilateral-membership + six-tier-ACL foundation.

**What changes from V9:** the bilateral membership state machine retires; the `VisibilityRouter` retires; `private_record`'s six-tier model retires (V10's design never shipped); custom federation primitives retire. **What stays from V9:** the application-layer services (60+), the SvelteKit frontend (75 pages), the OAuth client, the AppView hook pipeline (lifted into GovernanceView), the lexicon-driven indexer dispatch, the recursive cooperative model.

---

## Table of Contents

1. [Philosophical Foundation](#1-philosophical-foundation)
2. [The Four-Layer Architecture](#2-the-four-layer-architecture)
3. [The Three Axes of Authority](#3-the-three-axes-of-authority)
4. [Cooperative Identity](#4-cooperative-identity)
5. [Membership via Arbiter Spaces](#5-membership-via-arbiter-spaces)
6. [The Spaces-Backed Privacy Model](#6-the-spaces-backed-privacy-model)
7. [GovernanceView](#7-governanceview)
8. [CoopView](#8-coopview)
9. [The Plugin Set: Layer 3 / Layer 4 Boundary](#9-the-plugin-set-layer-3--layer-4-boundary)
10. [Ecosystem Composability](#10-ecosystem-composability)
11. [Infrastructure Architecture](#11-infrastructure-architecture)
12. [Security Model](#12-security-model)
13. [Lexicon Design](#13-lexicon-design)
14. [Cooperative Lifecycle: Legal, Financial, Operational](#14-cooperative-lifecycle-legal-financial-operational)
15. [Codebase Migration from V9](#15-codebase-migration-from-v9)
16. [Phased Transition Plan](#16-phased-transition-plan)
17. [Design Commitments](#17-design-commitments)
18. [Open Questions and Ecosystem Engagement](#18-open-questions-and-ecosystem-engagement)
19. [Appendix: Key Resources](#19-appendix-key-resources)

---

## 1. Philosophical Foundation

### 1.1 CSN's posture

CSN is a proof-of-concept project with no users, no deployment, no commercial deadlines, and an explicit design goal of *"model the problem and solutions correctly without compromise at the design level."* The corollary is that V11 should be an architecture CSN believes in for years, not a workaround for protocol gaps that are about to close. The protocol gaps closed in early 2026; V11 is the architecture that uses what landed.

### 1.2 The recursive cooperative model (preserved)

The recursive cooperative model remains the central design principle: everything is an entity (person or cooperative), and a network is just a cooperative whose members are other cooperatives. No special type needed. Same membership, governance, and agreement machinery works at every level.

V11 gives this principle a protocol-level expression. Under V9 the recursive model was a CSN-specific abstraction; under V11 it is the Arbiter pattern's natural shape — *"spaces can have member lists that include other spaces, and spaces from different arbiters can be members of each other."* A cooperative's `members` space can include another cooperative's `members` space (cross-organizational trust). A network of cooperatives is an arbiter whose `members` space contains other arbiter DIDs (recursion). The model becomes free, not invented.

### 1.3 ICA principles map onto ATProto's architecture

The ICA's seven cooperative principles map naturally onto ATProto's primitives, more cleanly under V11 than V9:

- **Voluntary membership** becomes portable identity — a member can leave one cooperative and join another without losing their history; their personal-space records (preferences, history) travel with them.
- **Democratic control** becomes governance records and votes in members' permissioned repos, with arbiter-backed authorization.
- **Member economic participation** becomes auditable patronage records in members' personal spaces with cryptographic integrity.
- **Autonomy** becomes self-hosted PDS instances under cooperative-controlled DIDs.
- **Education and training** becomes discoverable onboarding content and training records.
- **Cooperation among cooperatives** becomes cross-arbiter space-as-member relationships — the recursive cooperative model as protocol primitive.
- **Concern for community** becomes transparent public governance visible to the entire network through anchor records.

### 1.4 Cooperatives are protocol-level citizens

V11 sharpens V9's "cooperatives are ATProto citizens" stance. Under V9 a cooperative was a DID with a PDS; under V11 a cooperative is an arbiter instance with a controlled DID, multiple skey-distinguished spaces (members, board, officers, treasurer, member classes, etc.), and standard XRPC API surfaces for membership management. Other ATProto applications (Roomy, opensocial.community, Tangled) can compose with cooperatives because both sides speak the same arbiter protocol.

---

## 2. The Four-Layer Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Layer 4: CoopView                                                │
│   Cooperative-specific governance: Subchapter T, patronage,      │
│   capital accounts, multi-stakeholder weighted voting, ICA       │
│   principle adherence, financial period tracking, 1099-PATR,     │
│   agreement lifecycle, alignment, agents.                        │
│   Lexicons: network.coopsource.*                                 │
│   Consumer: CSN, future cooperative platforms                    │
├─────────────────────────────────────────────────────────────────┤
│ Layer 3: GovernanceView                                          │
│   Generic governance primitives: proposals, votes,               │
│   deliberations, anchor records, transparency logs, vote         │
│   tally aggregation, role-state derivation, member directory     │
│   indexing.                                                      │
│   Lexicons: community.lexicon.governance.*                       │
│   Consumer: CSN, Roomy, opensocial.community, any group-shaped   │
│   ATProto application.                                           │
├─────────────────────────────────────────────────────────────────┤
│ Layer 2: Arbiter                                                 │
│   Generic group/role/space management: community DIDs,           │
│   $admin, role-spaces, space-as-member-of-space recursion,       │
│   $publish, $labeler.                                            │
│   Authors: Meri and Zicklag (Roomy team)                         │
│   Consumer: GovernanceView, Roomy, any community-shaped app      │
├─────────────────────────────────────────────────────────────────┤
│ Layer 1: ATProto Spaces                                          │
│   Protocol primitives: permissioned repos, ats:// URIs,          │
│   ECMH commit chains, pull-based sync, (DID, read|write)         │
│   member lists, controlled DIDs.                                 │
│   Author: Holmgren / Bluesky protocol team                       │
│   Consumer: Arbiter, NorthSky, Habitat, anyone                   │
└─────────────────────────────────────────────────────────────────┘
```

### 2.1 Why this layering

The layering falls out of three observations:

**Spaces and the Arbiter are general-purpose.** They serve any community-shaped ATProto application. CSN doesn't reinvent them and doesn't compete with them. Whatever CSN builds at Layers 1–2 is either a contribution to existing efforts or a thin adapter.

**Generic governance is more than chat-channel governance.** Roomy's roadmap mentions "permissioned channels + roles" but stops short of proposals, votes, deliberations, transparency logs, and the anchor pattern. CSN's V9/V10 work product (anchor + sidecar pattern, transparency log lexicon, privacy-by-default thinking) is genuinely useful beyond cooperatives. Any group-shaped application needing collective decision-making wants proposals, voting, and an audit trail.

**Cooperatives are governance plus a lot of cooperative-specific stuff.** Patronage allocation, capital accounts, Subchapter T compliance, ICA principles, multi-stakeholder voting weights, fiscal period tracking, 1099-PATR generation, member onboarding — these are cooperative semantics, not generic governance primitives. They belong in CoopView, separate from GovernanceView.

### 2.2 Layer-boundary tests

Where does a feature belong?

- **Layer 1 (Spaces):** Is this a protocol-level primitive about access and storage? Lives in spaces.
- **Layer 2 (Arbiter):** Is this generic group/role management that any community-shaped app would want? Lives in the Arbiter.
- **Layer 3 (GovernanceView):** Is this a generic governance primitive — a proposal, a vote, a deliberation, an audit log entry, a derived role-state record — that any group-shaped app might want for collective decision-making? Lives in GovernanceView.
- **Layer 4 (CoopView):** Is this cooperative-specific — Subchapter T, patronage, ICA principles, capital accounts, multi-stakeholder weights? Lives in CoopView.

When in doubt, push the feature down a layer. A feature that belongs in Layer 4 but could plausibly live in Layer 3 should live in Layer 3 if doing so doesn't dilute the generic-ness. The test for "doesn't dilute the generic-ness" is whether Roomy or another non-cooperative app would use the feature without modification.

### 2.3 The plugin set is the Layer 3 / Layer 4 contract

GovernanceView accepts a `GovernancePluginSet` in its constructor. CoopView provides cooperative-specific implementations of the plugin interfaces; GovernanceView calls them at well-defined points. The plugin set is the single most important insulation property V11 has: if upstream protocol details change, only GovernanceView's internals change; the plugin interfaces stay stable; CoopView is unaffected. See §9 for the full specification.

---

## 3. The Three Axes of Authority

Authority in V11 is not a single ACL. It is a small set of distinct axes that interact at write checkpoints. Separating them in code is what distinguishes a debuggable authorization model from V9's tangled one.

### 3.1 Axis 1: OAuth — app-to-user authority

OAuth governs which applications can act on behalf of a given user, scoped to which lexicons and which XRPC methods. The user's PDS is the authorization server; CSN authenticates with the user's PDS, requests scopes, gets DPoP-bound access tokens.

The granular scope grammar that landed in 2025 and is now shipping in `@atproto/oauth-scopes`:

```
atproto                                                  # required for any atproto OAuth session
repo:network.coopsource.org.membership?action=create     # write specific lexicon
rpc:network.coopsource.governance.castVote?aud=did:web:csn.example  # call XRPC
blob:image/*                                             # upload blobs of MIME type
account, identity                                        # account and identity operations
include:network.coopsource.authMember                    # include another permission set
```

CSN ships its own permission sets: `network.coopsource.auth.member`, `network.coopsource.auth.officer`, `network.coopsource.auth.board`, etc.

### 3.2 Axis 2: Spaces — user-to-user authority within a permissioned context

Spaces govern which users can read and write within a permissioned context. This is independent of which app is acting on the user's behalf. A user is a member of a space or they are not. The space owner (the arbiter) controls the member list. A user's permissioned repo for a space accepts writes only if the user is in the space's member list, and only if the writing app has the appropriate OAuth scope (Axis 1).

When CSN's cooperative's `members` space includes Alice's DID:

- Alice's permissioned repo for that space accepts writes she initiates.
- *Whether Alice can write through CSN specifically* depends on Alice having granted CSN the OAuth scope `repo:network.coopsource.governance.vote?action=create`.

If Alice is removed from the `members` space, her votes can no longer be written into the space's repo. If Alice grants the scope but isn't in the space, CSN can't write on her behalf. Both axes are checked.

### 3.3 Axis 3: Application logic — user-to-action authority

Application logic governs whether a particular user, in the appropriate space, may perform a particular *governance action*. This is the cooperative-specific layer. "Alice is a member; CSN has scope to write votes — but is Alice eligible to vote on this proposal?" Answers depend on cooperative rules: the proposal's eligibility criteria, quorum rules, voting period, delegation chains, multi-stakeholder weights.

This axis lives entirely in CSN's application code — specifically in CoopView's plugin implementations. Neither OAuth nor spaces enforce it.

### 3.4 The OAuth-spaces seam

Per Diary 4, a space can declare which apps are permitted to operate on it (`default-allow` vs `default-deny` with allowlists/denylists of application client IDs). An OAuth client gets a token from the user's PDS, but writes to a space's permissioned repo are only accepted if the space's app policy allows that client.

This is the seam V11 must track most closely. CSN's design is agnostic about the specific mechanism — whether `permissions:{nsid}` scopes, service-auth JWTs issued by the space owner, or space-policy lookups at write time. The integration point is the same regardless: when CSN tries to write into a space's permissioned repo, the failure modes are *"OAuth scope not granted,"* *"user not in space,"* and *"app not authorized for this space."* Code distinguishes all three.

### 3.5 Two more axes: labels and service-auth

**Labels (Axis 4).** Labeler-emitted moderation labels (Ozone, CSN's own governance labeler, third-party labelers) aren't strictly authority but materially affect what CSN does. A `member-suspended` label gates voting eligibility, even though the user is still in the space. A `proposal-archived` label changes rendering. Labels are public, signed records emitted by labeler DIDs.

**Service-to-service authentication (Axis 5).** Service-auth JWTs (`com.atproto.server.getServiceAuth`) are how AppViews authenticate to each other and to PDSes, separate from user OAuth. Different lifetime, key, and scope semantics. Cross-arbiter operations (CSN reading state from another cooperative's arbiter), federation operations, and labeler operations use this path.

### 3.6 The axes are not strictly orthogonal

At every write checkpoint, OAuth scope (Axis 1) and space membership (Axis 2) are *both* checked, in different places, by different services. A write that satisfies both can still fail if the space's app allow/deny policy rejects this particular OAuth client. A read that satisfies Axis 2 doesn't bypass Axis 3 application rules. Axis 4 (labels) feeds into Axis 3 logic. Axis 5 sometimes substitutes for Axis 1 when one CSN service calls another.

The code's job is to identify, at each checkpoint, *which* axes apply and route the failure mode correctly. The taxonomy is for debuggability: when authorization fails, knowing which axis failed is the difference between fixing in five minutes and fixing in three days.

---

## 4. Cooperative Identity

### 4.1 Cooperatives own their DIDs

Every cooperative is provisioned with a controlled DID (`did:plc`) at creation time. The cooperative's PDS owns the controlled DID. **Rotation keys are held offline by cooperative governance**, never by CSN. CSN as hosting provider holds the signing key only — never the rotation key. This is documented explicitly in the cooperative onboarding flow and the bylaws templates. If CSN ceases operation, the cooperative can rotate to a new PDS without CSN's cooperation.

| Component | Choice | Rationale |
|---|---|---|
| DID method | `did:plc` | Portable, recoverable, ecosystem standard |
| Handle | Domain-as-handle (e.g., `@mycoop.coop`) | Professional, verifiable, ties identity to web domain |
| PDS | Self-hosted `@atproto/pds` | Full control over organizational data |
| Signing key (CSN holds) | ECDSA P-256 | Standard atproto signing key |
| Rotation key (cooperative holds) | ECDSA P-256, offline custody | Higher priority than signing key in did:plc rotation list |
| Controlled-DID API | Diary 5's lightweight model | Minimal; transfer + rotation only |

### 4.2 DID rotation aliasing

V11 includes a `did_rotation_history` table that maps old DIDs to new ones, updated when CSN observes a `did:plc` rotation. All DID-comparing code in CSN consults this table; references to rotated DIDs resolve to current DIDs transparently. This covers member-list entries, federation links, anchor records, and labels.

### 4.3 No founder-DID-rooted cooperatives

Cooperatives never accumulate state under a founder's personal DID. The cooperative DID is minted at provisioning time, distinct from any human DID. This sidesteps the (currently unsolved) personal-to-community DID transition problem in the upstream protocol. A worker-co-op founder creates the cooperative DID first; personal records (if any are needed) live under their own personal DID in personal spaces, never under cooperative spaces.

### 4.4 Multi-user access via the Arbiter's `$admin` space

A cooperative is not a single person. Multiple operators need to write records under the cooperative's DID. V9 solved this via the `OperatorWriteProxy`; V11 expresses it via the Arbiter pattern. Operators are members of the cooperative's `$admin` space with Configure Space access (one of the eight Arbiter access levels). The `$admin` audit trail is built into the arbiter: every operation on `$admin` is itself a record.

---

## 5. Membership via Arbiter Spaces

### 5.1 No more bilateral membership

V9's bilateral membership pattern — the member writes `network.coopsource.org.membership`, the cooperative writes `network.coopsource.org.memberApproval`, status is `active` only when both exist — was a workaround for ATProto lacking protocol-level group semantics. V11 retires it entirely. The cooperative's `members` space is the single source of truth.

Both V9 lexicons retire:

- `network.coopsource.org.membership` retires. (If member-side preferences are wanted later, they get a new lexicon `network.coopsource.org.memberPreferences` stored in the member's personal space.)
- `network.coopsource.org.memberApproval` retires. Role authority moves to role-space membership.

### 5.2 The `members` space pattern

A cooperative's `members` space has an authoritative member list. A member is in the list or they are not. The space owner (the cooperative's arbiter, ultimately backed by the cooperative's PDS) controls the list.

The CSN-side concerns the bilateral pattern was getting at — membership requires cooperative consent, role authority is centralized — are preserved natively. The cooperative consents by adding the member to the `members` space. Role authority is centralized at the arbiter (members can't self-add to the `treasurer` space; only members with appropriate Configure Space access on the role-space can).

**Out-of-band consent capture.** V9 used the bilateral pattern partly to enforce that members had explicitly agreed to join. Under V11, the OAuth flow provides equivalent consent capture — when a member signs into CSN with their ATProto identity and authorizes CSN to add them to the cooperative's `members` space, that's explicit consent, recorded in the OAuth grant and the OAuth provider's session store.

### 5.3 Roles as spaces

Roles live as separate spaces under the cooperative DID, distinguished by skey:

| Role | Space (`did:plc:coop / nsid / skey`) |
|---|---|
| Active member roster | `network.coopsource.org.cooperative / members` |
| Board | `network.coopsource.org.cooperative / board` |
| Treasurer | `network.coopsource.org.cooperative / treasurer` |
| Secretary | `network.coopsource.org.cooperative / secretary` |
| Officers (collective) | `network.coopsource.org.cooperative / officers` |
| Probationary members | `network.coopsource.org.cooperative / probationary` |
| Worker class | `network.coopsource.org.cooperative / class-worker` |
| Consumer class | `network.coopsource.org.cooperative / class-consumer` |
| Custom roles | `network.coopsource.org.cooperative / <slug>` |

V9's `membership_role` table retires (authority moves to space membership). `role_definition.permissions` retires (access semantics become space membership). `role_definition` may stay as a UI-facing description (human-readable role name, description) but stops being load-bearing for access control.

### 5.4 Nested spaces and multi-stakeholder cooperatives

Multi-stakeholder cooperatives express their structure naturally: each member class is a space, all class spaces are members of the cooperative's `members` space (so any class member is automatically a member). Per-class quorum rules, voting weights, and board seat allocations are CoopView's `vote-weight-calculator` and `quorum-checker` plugins consulting class membership.

This generalizes to cooperatives with five, ten, or more stakeholder classes without architectural work — every class is just another space.

### 5.5 Cross-cooperative trust via space-as-member-of-space

When cooperative A's space includes cooperative B's `members` space as a member, every member of B is a member of A's space (transitively, via the Arbiter's resolution). This expresses inter-cooperative trust delegation without CSN-specific federation primitives. Federations of cooperatives use this pattern recursively: a federation's `members` space contains cooperative DIDs; each cooperative is itself an arbiter; the federation's governance proposals are voted on by member cooperatives.

---

## 6. The Spaces-Backed Privacy Model

### 6.1 Three tiers, reframed

V9's three tiers (Tier 1 public, Tier 2 PostgreSQL, Tier 3 E2EE) are reframed in V11:

**Tier 1 — Public ATProto records.** Cooperative profiles, public proposals (those a cooperative chooses to publish), vote tallies (aggregate), ratified agreements, public membership directories. In the cooperative's public repo (or its `$publish` space — either works because `$publish` writes to the public repo).

**Tier 2 — Permissioned-space records.** Closed governance deliberations, draft proposals, private votes, confidential agreements, private member directories, financial records. In members' permissioned repos for the appropriate space (`members`, `officers`, `board`). Access is enforced at the protocol level by arbiter membership.

**Tier 3 — E2EE communications.** Board-level confidential discussions, mediation proceedings, sensitive personnel matters, legal consultations, salary records. Via Germ DM / MLS. The platform never handles content.

V9's `private_record` table and `VisibilityRouter` retire. The visibility decision moves from a binary `governance_visibility` flag to per-space placement — each record is written to the space whose access semantics match the desired visibility. A cooperative's `governance_visibility: closed` becomes "this cooperative writes its proposals into the `members` space rather than the public repo."

### 6.2 Personal spaces for individual records

Per Diary 5, each member has a personal space per cooperative they belong to. The space is provisioned by the cooperative when a member joins. The space type might be `network.coopsource.org.memberPersonal` with skey = the cooperative's slug.

Individual-tier records live here: patronage allocations, capital account balances, 1099-PATR forms, personal contact info, election preferences, ZK-ballot identity commitments.

Access tiers within personal spaces:

- **`individual_strict` records** (capital account balances): only the member is on the space's member list.
- **`individual` records** (patronage allocations): the cooperative's `treasurer` and other financial-officer spaces are added to the personal space's member list. Spaces can include other spaces — Arbiter pattern.

Cost optimization is deferred (§17). A 5,000-member cooperative has 5,000 personal spaces under this model. Whether that scales depends on the controlled-DID system's per-space costs, which aren't fully specified yet. V11 ships the cleaner abstraction now and optimizes once the end-to-end system is running.

### 6.3 Anchor + sidecar pattern (V10.4 survives)

V10.4's anchor pattern survives because its purpose is sound: external observers need a non-identifying public summary. Implementation simplifies:

- The anchor record stays in the cooperative's public repo (or its `$publish` space). Lexicon shape unchanged from V10.
- The sidecar moves from the `private_record` PostgreSQL table to the cooperative's `members` space. Actual membership lives in the space's member list.
- The post-storage hook triggers off arbiter member-list changes and updates the anchor's count.

Same pattern applies to other cooperative state: `cooperativeProfileSummary` for a public summary of which roles exist (without revealing role-holders), `governanceFeedSummary` for recent governance activity (without revealing details of private proposals).

### 6.4 Transparency log (V10.5 survives)

V10.5's transparency log pattern survives, generalized as a GovernanceView primitive. A Merkle-tree append-only log over governance events. Lexicon (`community.lexicon.governance.logHead`) carries STH (signed tree head) records published periodically. Inclusion proofs and consistency proofs available via XRPC.

---

## 7. GovernanceView

### 7.1 What GovernanceView is

GovernanceView is a generic governance system for any group-shaped ATProto application. It provides primitives for collective decision-making — proposals, votes, deliberations, transparent audit logs — on top of Arbiter spaces. Lexicons live in `community.lexicon.governance.*`.

GovernanceView is co-designed with Roomy and any other group-shaped ATProto application that needs governance. It is a CSN contribution to the ecosystem, not a CSN-specific service.

### 7.2 GovernanceView's responsibilities

**Proposal management.** Generic proposal lexicon covering: proposer DID, target arbiter, proposal type, title, summary, optional rich content, voting period, eligibility criteria reference, proposed actions reference. Indexer materializes proposal state.

**Vote casting.** Generic vote lexicon covering: voter DID, proposal reference, choice, optional voter rationale, optional weight evidence (extension point — applications fill in patronage data, multi-stakeholder class, etc.). Indexer aggregates votes per proposal.

**Deliberation threads.** Generic deliberation lexicon for threaded discussion attached to a proposal. Visibility-tier-aware (lives in the appropriate space).

**Anchor pattern.** Generic anchor record lexicon for non-identifying public summaries.

**Transparency log.** Generic Merkle-tree append-only log over governance events.

**Role-state derivation.** Generic indexer that materializes arbiter member-list state into queryable role projections. *"Who is currently in the `treasurer` space?"* returns a list with a snapshot timestamp.

**Member directory indexing.** Generic indexer that materializes the `members` space into a query-friendly member directory.

### 7.3 What GovernanceView does not do

- Patronage calculation, capital accounts, 1099-PATR, fiscal periods (CoopView).
- Multi-stakeholder weighted-vote computation (CoopView, via the plugin set).
- Subchapter T statutory enforcement (CoopView).
- ICA principle adherence checks (CoopView).
- Any cooperative-specific terminology (lexicons use "members" and "proposals," not "cooperators" and "ballots").

### 7.4 Indexing and consistency model

GovernanceView's projection of space state into queryable form is fundamentally different from V9's firehose-based indexing.

**Sync source.** Sync is pull-based and notifications route through the space owner. CSN's spaces consumer subscribes to write notifications from each arbiter the cooperative is connected to. The notification is a lightweight *"this space changed"* event; the consumer then pulls the changed records from the relevant member PDS.

**Trust anchor.** Records pulled from a member PDS are *claimed* records until cross-checked against the space's authoritative member list (per Zicklag's Arbiter post: *"write enforcement is reader-side"*). The consumer fetches the arbiter's current member list before accepting records; records from DIDs not on the list are discarded.

**Consistency.** Eventually consistent. Staleness is bounded by pull cadence (target: under 5 seconds at p95 for active cooperatives) plus space-owner notification latency. Callers needing strict consistency read through to the arbiter directly via XRPC.

**ECMH digest verification.** Permissioned repos use Elliptic Curve Multiset Hash for commits. ECMH commits don't support single-record proofs. After each pull batch, the consumer recomputes the ECMH digest and compares against the arbiter's reported digest. Mismatch → full-repo resync.

**Dropped-notification recovery.** Periodic full-resync on a slow timer (every N hours; tune to cost) plus on-demand resync triggered by digest mismatch. CSN's existing dead-letter pipeline handles pull failures.

**Space credentials.** Per Zicklag's Arbiter post, the arbiter issues each member a temporary space credential they present to the space host to read data. CSN's consumer holds a credential per (cooperative, space). Lifetime, rotation, revocation policy abstracted behind a `SpaceCredentialStore` interface.

### 7.5 Deployment shapes

GovernanceView ships in three shapes from the same code:

**Embedded in `apps/api`.** CSN's deployment. GovernanceView and CoopView share a process; CoopView extends GovernanceView via the plugin registry, lexicon extension, and hook pipeline composition.

**Standalone binary.** A future deployment shape — GovernanceView as a single binary (similar to HappyView 2's packaging) for projects that want generic governance without CSN-specific code.

**Library.** GovernanceView as a TypeScript library (`@coopsource/governance-view`) that CoopView, Roomy, or any other application includes.

The three deployment shapes share the same code, lexicons, and XRPC API.

---

## 8. CoopView

### 8.1 What CoopView is

CoopView is CSN's cooperative-specific extension of GovernanceView. Lexicons live in `network.coopsource.*`. CoopView depends on GovernanceView; it does not replace it.

### 8.2 CoopView's responsibilities

**Cooperative profile.** `network.coopsource.org.cooperative` — the public profile record. ICA principle declarations, cooperative type (worker, consumer, producer, multi-stakeholder, platform, federation), legal entity type, governance visibility, discoverable status.

**Multi-stakeholder member classes.** `network.coopsource.org.memberClass` for class declarations; each class is also a space (Arbiter pattern).

**Patronage system.** `network.coopsource.finance.patronageConfig`, `patronageRecord`, `patronageAllocation`. Records live in personal spaces.

**Capital accounts.** `network.coopsource.finance.capitalAccount`. In personal spaces. Equity tracking, contributions, allocations, redemptions, revolving fund mechanics.

**Subchapter T compliance.** Cooperative-type-aware enforcement of democratic control rules, subordination of capital, cash distribution requirements (20% within 8.5 months for qualified dividends), separate tracking of patronage-sourced vs. non-patronage-sourced income, 1099-PATR generation, Form 1120-C filing support.

**Fiscal periods.** `network.coopsource.admin.fiscalPeriod`. Fiscal year tracking, audit status, allocation deadlines.

**Officer records and compliance.** `network.coopsource.admin.officer`, `complianceItem`, `memberNotice`. Officer terms expressed via the `officer` role-spaces; these lexicons capture officer history, compliance calendar, required notices.

**Legal documents and meeting records.** `network.coopsource.legal.document`, `meetingRecord`. Foundational documents, meeting minutes, resolutions, certifications.

**Agreements.** `network.coopsource.agreement.*` (master agreements, signatures, stakeholder terms, ratifications, amendments).

**Member onboarding.** `network.coopsource.onboarding.*` (probation, training, buy-in, milestones, buddy assignment, reviews).

**Alignment.** `network.coopsource.alignment.*` (stakeholder interests, desired outcomes, interest mapping).

**Funding campaigns.** `network.coopsource.funding.*` (campaigns, pledges, payment integration).

**Agents.** `network.coopsource.agents.*` (AI agent configuration, sessions, automation triggers).

### 8.3 CoopView lexicon extension of GovernanceView

GovernanceView's `community.lexicon.governance.vote` is the substrate. CoopView's `network.coopsource.governance.vote` extends it via wrapping:

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

GovernanceView's indexer reads the `generic` field and ignores the rest; CoopView's indexer reads everything. Any consumer speaking only `community.lexicon.governance.vote` can extract the generic field from a CSN vote and treat it as a generic vote.

The alternative — flat extension via lexicon's open-record semantics — is on the table if the Lexicon Community settles a different convention.

---

## 9. The Plugin Set: Layer 3 / Layer 4 Boundary

The plugin set is the load-bearing surface for Layer 3 / Layer 4 separation. CoopView's cooperative-specific logic lives entirely in implementations of these interfaces; GovernanceView calls them at well-defined points.

### 9.1 Ten plugin interfaces

```ts
// packages/governance-view/src/plugins/types.ts

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
  authorize(args: {
    actorDid: DID;
    cooperativeDid: DID;
    action: string;
    target?: ProposalRef | SpaceRef;
  }): Promise<boolean>;
}

export interface AnchorSummaryBuilder {
  buildExtensions(args: {
    cooperativeDid: DID;
    summaryKind: 'membership' | 'governance-feed' | 'cooperative-profile';
  }): Promise<Record<string, unknown>>;
}

export interface HistoricalStateReader {
  readAt(args: { space: SpaceRef; at: Date }): Promise<RoleSnapshot | null>;
  recordSnapshot(snapshot: RoleSnapshot): Promise<void>;
}

export interface PatronageAllocator {
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
  canonicalize(args: {
    cooperativeDid: DID;
    deliberationUri: string;
    proposalRefs: ProposalRef[];
  }): Promise<{ minutesUri: string; minutesCid: string }>;
}

export interface DelegateChainResolver {
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

### 9.2 Design properties

- **All async, returning `Promise<T>`.** Matches existing service style.
- **All inputs are plain values (DIDs, refs, snapshots), not service handles.** A plugin doesn't get a reference to GovernanceView or to other plugins. The call graph is one-way: GovernanceView calls plugins; plugins don't call back.
- **Defaults are no-ops, not errors.** A Roomy deployment passes no plugins; everything uses defaults. The no-op behaviors give a working one-member-one-vote system out of the box.
- **`HistoricalStateReader` is the only plugin GovernanceView *writes* to.** GovernanceView records snapshots at cadence boundaries; CoopView reads them. Load-bearing primitive for Subchapter T patronage allocation (membership-as-of-fiscal-period, not membership-as-of-now).
- **`SpaceRef` is `{ arbiter: DID, type: string, skey: string }`** — independent of URI scheme decisions. Survives `ats://` becoming something else.

### 9.3 The plugin boundary as protocol-pivot insulation

The ten plugin interfaces are CSN's contract with itself; upstream space mechanics are implementation details behind them. If Bluesky changes how spaces work, only GovernanceView's internals change; the plugin interfaces stay stable; CoopView is unaffected. **This is the single most important insulation property V11 has.**

### 9.4 Lexicon extension and the cooperative use case

Meri's April 10 post on permissioned spaces asked whether the `(DID, read|write)` ACL primitive could be expanded — *"perhaps a lexicon that accompanies the space type NSID"* — to express richer permissions. V11's plugin set is the cooperative use case's affirmative answer: the space-type NSID is paired with a typed plugin contract that resolves the fine-grained ACL/authority/eligibility/weighting questions the bare member-list primitive doesn't address. NSID-as-substrate plus typed-plugin-as-superstructure is what makes a single arbiter mechanism work for chat moderation, cooperative governance, federated trust networks, and anything else without putting application logic into the protocol layer.

### 9.5 Hook composition

GovernanceView exposes its hook registry. CoopView registers hooks at construction time. The priority bands from V9's existing hook pipeline (builtin 0–99, declarative 100–199, script 200+) carry forward; CoopView's hooks register at priority 100–199, leaving 0–99 for GovernanceView's own builtin hooks.

Per-cooperative runtime extensibility (cooperative-authored scripts) goes through `apps/api/src/scripting/` — the existing substrate, unchanged. Typed plugins are for co-developer extensibility; scripts are for user-of-CSN extensibility.

---

## 10. Ecosystem Composability

### 10.1 Smoke Signal (calendar)

Cooperatives schedule governance meetings as `community.lexicon.calendar.event` records written via the cooperative's `$publish` space. Members RSVP via Smoke Signal. CSN's AppView indexes RSVPs for quorum calculation. Proposals cross-reference meeting events via AT-URI.

### 10.2 WhiteWind (long-form content)

Detailed proposal rationale, annual reports, and policy documents published as `com.whtwnd.blog.entry` records (up to 100,000 characters of Markdown). Proposals link to WhiteWind entries via `fullDocument` AT-URI field.

### 10.3 Germ DM / MLS (Tier 3)

Board members with `com.germnetwork.declaration` records can conduct E2EE deliberations. CSN's UI detects Germ DM availability and surfaces "Start secure discussion" actions. The platform never handles message content. For platforms not supported by Germ, affected flows either disable or fall back to the Germ web UI.

### 10.4 Frontpage (public discussion)

Public proposals cross-posted as `fyi.unravel.frontpage.post` records for community discussion. Discussion on Frontpage becomes visible governance deliberation indexed by CSN's AppView.

### 10.5 Bluesky Lists and Starter Packs

The cooperative maintains an `app.bsky.graph.list` of members, auto-updated when membership status changes. Starter Packs combine membership lists with governance activity feeds for onboarding.

### 10.6 Lexicon Lenses

The Lexicon Community's Lexicon Lenses project enables transformations between record types. When stable, implement lenses from `network.coopsource.governance.proposal` to generic feed types for visibility in any feed viewer.

### 10.7 opensocial.community (Brittany Ellich)

Brittany Ellich's opensocial.community model — groups as ATProto accounts with portable data, multi-admin management, labeler-based moderation — is the closest existing implementation to the Arbiter pattern. CSN engages on the service-auth JWT pattern she foregrounds and on cross-app group composability.

---

## 11. Infrastructure Architecture

### 11.1 Deployment topology

```
┌─────────────────────────────────────────────────────┐
│  Cooperative Infrastructure ($20-50/mo VPS)         │
│                                                     │
│  ┌──────────────┐   ┌──────────────────────────┐   │
│  │  PDS         │   │  AppView (apps/api)      │   │
│  │  @atproto/pds│   │  + Spaces consumer       │   │
│  │              │   │  + Tap (public firehose) │   │
│  │              │   │  + GovernanceView        │   │
│  │              │   │  + CoopView              │   │
│  │              │   │  + PostgreSQL            │   │
│  └──────┬───────┘   └────────┬─────────────────┘   │
│         │                    │                      │
│  ┌──────┴────────────────────┴────────────────┐    │
│  │  SvelteKit Frontend                        │    │
│  └────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
         │                          │
         ▼                          ▼
  ┌──────────────┐         ┌──────────────────┐
  │ plc.directory│         │  bsky.network    │
  │              │         │  (Relay)         │
  └──────────────┘         └──────────────────┘
                                   │
                            ┌──────┴──────┐
                            │  Tap        │
                            │  Spaces     │
                            │  consumer   │
                            └─────────────┘
```

### 11.2 Component recommendations

**Self-hosted PDS** (`@atproto/pds` v0.4.212+):
- Hosts cooperative's ATProto account and controlled DID
- Deploy via Docker on separate domain from AppView
- Key management: rotation key offline (cooperative governance); signing key in PDS

**Spaces consumer** (new in V11):
- Subscribes to write notifications from each cooperative's arbiter
- Pulls records from member PDSes
- Verifies ECMH digests; falls back to full-repo resync on mismatch
- Cross-checks records against arbiter member lists before accepting

**Tap** (Bluesky's Go sync tool):
- Continues to handle public firehose for public records
- Public records flow into the same `pds_record` table (or sibling `space_record` table)

**Arbiter integration** (new in V11):
- Thin wrapper around the Arbiter's XRPC API
- Provisioning, role-space management, membership operations
- Behind interface that lets it slide between *"this is a protocol primitive"* and *"this is an arbiter XRPC call"* as the boundary moves

**HappyView v2.5+** (reference, not substrate):
- First public AppView with experimental permissioned-spaces support
- Use as a reference implementation for development and validation
- Do not migrate `apps/api`'s 14k+ lines of cooperative-specific TypeScript onto HappyView's Lua + WASM model

### 11.3 Cost estimates

| Scale | PDS | VPS (AppView + consumers) | Blob storage | Total |
|---|---|---|---|---|
| Small (< 50 members) | $10/mo | $20/mo | $5/mo | ~$35/mo |
| Medium (< 500 members) | $20/mo | $50/mo | $15/mo | ~$85/mo |
| Large (< 5,000 members) | $40/mo | $100/mo | $40/mo | ~$180/mo |

### 11.4 Relay strategy

V11 Stages 1–7 use `bsky.network` as the public-firehose relay. Running a cooperative-owned relay is real cooperative-ecosystem infrastructure and is a Stage 9 consideration, deferred to keep V11 substrate work focused.

**Why running our own relay is on the roadmap.** Laurens Hof's POSIWID argument applies: depending on `bsky.network` means CSN's resilience is shaped by Bluesky PBC's operational and political choices. ICA Principle 6 (cooperation among cooperatives) reads as a directive to build cooperative-owned infrastructure where it matters; the relay layer is one of those places. Blacksky's `atproto.africa` (running rsky in Rust, indexing at 10,000+ records/sec) demonstrates this is technically and economically viable for ecosystem-scale operators. A cooperative-focused relay also provides bandwidth efficiency for subscribers who only care about cooperative-ecosystem records — dramatically cheaper than filtering all of `bsky.network`.

**What we are not building: access-controlled relays.** Relays are public-firehose infrastructure by protocol design; their purpose is to aggregate commits from many PDSes and broadcast them to many consumers. Access control at the relay layer would defeat the transparency property cooperative governance requires — ratified outcomes, public proposals, and vote tallies must be visible to external observers (auditors, regulators, the public). Private data uses permissioned spaces, which don't flow through relays. The "who can read what" question is answered at:

- **Space layer (Layer 1)** for private data — protocol-level permissioning, no relay involvement.
- **AppView layer (Layer 3/4)** for query-time filtering and gated access to indexed projections.

**What we might build in Stage 9.** Two distinct things, often conflated:

1. **A curated public relay.** Aggregates only `network.coopsource.*`, `community.lexicon.governance.*`, and adjacent cooperative-ecosystem records from a known set of cooperative DIDs. Records remain public; the value is bandwidth efficiency for subscribers (member apps, archivers, transparency-log monitors, federation observers). Could be run by a cooperative federation rather than per-cooperative.

2. **An access-controlled AppView/feed service.** A layer above the relay that indexes cooperative data and gates queries by authenticated cooperative membership. This is privacy-via-query-gating, not privacy-via-network-isolation — an important distinction. The underlying records are still public (or live in spaces); the AppView just refuses to surface them to unauthenticated queries.

Neither requires running a relay to ship; either can be added as a federation-level service while individual cooperatives continue to use `bsky.network` for raw firehose consumption.

**Stage 9 gate.** Revisit when Stages 1–8 are stable. The question is not *"can we run a relay"* (yes, technically feasible) but *"is the cooperative ecosystem at the scale where running one provides value beyond the operational cost?"* That decision is appropriately made when there are actual cooperatives operating on the platform.

---

## 12. Security Model

The shift to spaces introduces new threats V9 didn't address.

### 12.1 Identity attacks

**Cooperative impersonation.** AppView must treat DID (not handle) as authoritative identifier. All records reference DIDs, never handles.

**DID takeover.** If an attacker obtains the rotation key, they steal the identity. Mitigation: cooperatives self-manage rotation keys offline, with higher priority than the PDS's signing key. Monitor PLC directory for unexpected key rotations on all indexed cooperative DIDs.

**Malicious PDS operator forgery.** PDS operator holds signing keys for hosted accounts. Mitigation: cooperatives self-manage rotation keys. Compromising a cooperative requires compromising both the PDS and the rotation-key custody.

### 12.2 Space-credential management

Space credentials are bearer tokens with no built-in proof of possession at the request layer. If leaked, the holder can read every record in the space until revocation.

**Mitigations:**
- Short credential lifetimes (target: ≤ 1 hour, refresh on each batch)
- Least-privilege per-space credentials (one per (cooperative, space), not a master credential)
- Audit logging of credential issuance and use
- Rotation on member-list changes

Credential lifecycle is abstracted behind a `SpaceCredentialStore` interface; whether the arbiter standardizes credential format is TBD.

### 12.3 Cross-arbiter trust verification

When cooperative A's `members` space includes cooperative B's `members` space as a member, reading B's member list requires authenticating to B's arbiter as A. Trust path: A's arbiter DID is on B's allowlist; A's service-auth JWT authenticates to B; A receives B's member list. Forged JWTs would let an attacker impersonate A; mitigations are standard (signed JWTs with B's verification of A's signing key from the DID document, short JWT lifetimes, audience binding).

### 12.4 Replay protection in recursive cooperatives

When a child cooperative's officer change triggers writes in the parent cooperative's space, the parent verifies:
1. The write is signed by the child's arbiter DID.
2. The write hasn't been seen before (nonce or timestamp + freshness window).
3. The child is still a member of the parent's `members` space at the moment of write.

The freshness check on (3) is the load-bearing mitigation against stale state from former member cooperatives.

### 12.5 Trust-anchor poisoning

If an attacker compromises the arbiter (e.g., by getting Owner access to `$admin`), they can write arbitrary member-list state.

**Mitigations:**
- Arbiter rotation keys held offline by cooperative governance
- Multi-signature requirements for Owner-level operations (an Arbiter feature CSN advocates for)
- Transparency-log of arbiter operations for after-the-fact detection

### 12.6 Tier 3 caveats

Tier 3 remains the right primitive for content that must be cryptographically confidential. However, Germ DM is currently iOS-only via App Clip. **Production cooperative governance flows that depend on Tier 3 require Android and desktop parity that does not yet exist.** Until cross-platform E2EE substrate is available, CSN ships governance flows where Tier 3 is one option among others, not a required path.

### 12.7 AppView validation checklist

Every membership-relevant record must pass:

1. Cryptographic verification of commit signature against DID document
2. Independent DID resolution (don't trust cached data for security decisions)
3. Schema validation against lexicon
4. Authorization check (record authored by expected DID)
5. Cross-check against arbiter's authoritative member list
6. Per-DID rate limiting
7. Reject implausible timestamps
8. Audit log every state transition with commit CID, rev, signature

---

## 13. Lexicon Design

### 13.1 community.lexicon.governance.* (new in V11)

GovernanceView's lexicons proposed as a Lexicon Community namespace. CSN designs against the namespace; in parallel, the proposal is filed with the Lexicon Community via Discussion thread (per the precedent established by Profile Lexicon #9, Social Graph #10, Polite Goshawk WG).

- `community.lexicon.governance.proposal`
- `community.lexicon.governance.vote`
- `community.lexicon.governance.deliberation`
- `community.lexicon.governance.summary` (anchor records)
- `community.lexicon.governance.logHead` (transparency-log signed tree heads)
- `community.lexicon.governance.election` (vote-to-fill-a-position)

If the Lexicon Community rejects or significantly reshapes the proposal, CSN ships under `network.coopsource.governance.*` with the same API.

### 13.2 network.coopsource.* (preserved with refinements)

Most V9 lexicons carry forward unchanged:

- **Cooperative profile:** `network.coopsource.org.cooperative`, `network.coopsource.org.cooperativeProfileSummary`
- **Legal:** `network.coopsource.legal.document`, `legal.meetingRecord`
- **Admin:** `network.coopsource.admin.officer`, `admin.complianceItem`, `admin.memberNotice`, `admin.fiscalPeriod`
- **Agreements:** `network.coopsource.agreement.master`, `agreement.signature`, `agreement.stakeholderTerm`, `agreement.amendment`
- **Finance:** `network.coopsource.finance.patronageConfig`, `finance.patronageRecord`, `finance.patronageAllocation`, `finance.capitalAccount`, `finance.tax1099Patr`
- **Onboarding:** `network.coopsource.onboarding.config`, `onboarding.progress`, `onboarding.review`
- **Alignment:** `network.coopsource.alignment.interest`, `alignment.outcome`
- **Funding:** `network.coopsource.funding.campaign`, `funding.pledge`
- **Member class:** `network.coopsource.org.memberClass`
- **Member personal:** `network.coopsource.org.memberPersonal` (new — personal space type)

CSN-specific extensions of GovernanceView lexicons:

- `network.coopsource.governance.proposal` (extends `community.lexicon.governance.proposal` with cooperative-specific fields)
- `network.coopsource.governance.vote` (extends `community.lexicon.governance.vote` with patronage share, member class, fiscal period)
- `network.coopsource.governance.deliberation`
- `network.coopsource.governance.summary`

### 13.3 Retiring lexicons

- `network.coopsource.org.membership` — retires (replaced by space membership)
- `network.coopsource.org.memberApproval` — retires (role authority moves to role-space membership)

### 13.4 Lexicon extension pattern

Wrapping (chosen for V11): CSN lexicons contain a `generic` field that conforms to the community lexicon, plus CSN-specific fields alongside. GovernanceView's indexer reads the `generic` field and ignores the rest; CoopView's indexer reads everything. The V11 document revisits this if the Lexicon Community settles a different convention.

---

## 14. Cooperative Lifecycle: Legal, Financial, Operational

These domains are largely preserved from V9. What changes is what they sit on (space-backed projections rather than `private_record`) and where the lexicons live (CoopView rather than the root namespace).

### 14.1 Cooperative types

V11 accommodates six primary types: worker cooperatives, consumer cooperatives, producer cooperatives, multi-stakeholder cooperatives, platform cooperatives, cooperative federations.

### 14.2 US legal structures

Three primary formation paths: cooperative corporations, cooperative LLCs, Limited Cooperative Associations (LCAs). Each with distinct statutory requirements documented in the cooperative onboarding flow.

### 14.3 Foundational documents

| Document | Where it lives |
|----------|---------------|
| Articles of Incorporation | Public repo (Tier 1) |
| Bylaws (ratified) | Public repo or `members` space (per cooperative preference) |
| Operating agreement | `members` space or `officers` space (contains financial terms) |
| Membership agreement template | Public repo |
| Signed membership agreements | Member's personal space |
| Meeting minutes | `members` space or `board` space (per visibility) |
| Officer records | Public repo (transparency about leadership) |
| Compliance tracking | `officers` space |
| Patronage allocations | Member's personal space (Tier 2/3) |
| Capital account balances | Member's personal space (Tier 3, member-only) |

### 14.4 Compliance calendar

State-specific deadlines tracked via `network.coopsource.admin.complianceItem`:

- Annual meeting requirements (10–60 days notice, state-dependent)
- Annual report filings to Secretary of State
- IRS Form 1120-C filing
- 1099-PATR distribution (patronage dividends ≥ $10)
- Registered agent renewals
- Business license renewals
- Patronage allocation deadlines (20% cash within 8.5 months of fiscal year-end)

### 14.5 Patronage and capital accounts

**Patronage calculation engine** runs per cooperative type. Records live in members' personal spaces. CoopView's `PatronageAllocator` plugin computes per-member allocations for a fiscal period. Subchapter T-specific: separates patronage-sourced from non-patronage-sourced income.

**Capital account service** tracks initial equity contributions, allocated retained patronage, revolving fund mechanics, and unallocated equity. Records live in members' personal spaces (Tier 3 access).

**Subchapter T compliance** enforced via CoopView plugins. Specific requirements: democratic control, subordination of capital, ≥20% qualified patronage dividends in cash within 8.5 months, separate tracking of patronage vs. non-patronage income, Form 1120-C filing, Form 1099-PATR generation.

**Canonical record-of-truth.** ATProto-native records via the `patronage-allocator` and `1099-PATR` plugin contracts are the primary canonical source. External accounting ledger may be added later as a foreign-key link if legal counsel requires it; the ATProto record carries the primary state.

### 14.6 Digital signatures and legal enforceability

The ESIGN Act (2000) and UETA (49 states + DC) establish that electronic signatures are legally valid for corporate governance. Each signature record captures signer DID, timestamp, authentication method, document hash (strong reference to CID), and authority attestation. ATProto's commit-level signatures provide a robust audit trail.

### 14.7 Member onboarding and lifecycle

**Onboarding workflow:**
1. Discovery (via Bluesky, Starter Pack, or direct URL)
2. Application (ATProto OAuth → consent to be added to cooperative's `probationary` space)
3. Probationary period (configurable, 2 months to 1+ year)
4. Education (training completion tracking, cooperative principles orientation)
5. Buy-in (capital contribution via Stripe)
6. Full membership (board approval → moved from `probationary` to `members` space)
7. Ongoing participation (governance rights, patronage accumulation)

**Member lifecycle states:**
```
applicant → probationary → active → [suspended | resigned | removed]
                                  → emeritus (optional)
```

Each state transition is a change in space membership, observed by GovernanceView's indexer.

---

## 15. Codebase Migration from V9

V11 is a substantial refactor of V9 (594 source files, 47 lexicons, 100 database tables, 60+ services, 75 frontend pages). The migration plan addresses code, schema, lexicons, and tests.

### 15.1 What stays unchanged

- **SvelteKit frontend** (75 pages, 92 files) — frontend OAuth flow, UI components, cooperative configuration screens. The substrate change is invisible to the frontend.
- **DI container pattern** (`apps/api/src/container.ts`) — extended to inject GovernanceView and CoopView.
- **Kysely database layer** — table additions and removals; pattern stays.
- **ATProto OAuth client** (`oauth-client.ts`) — extended with granular scope support.
- **Generated validators** — regenerated as lexicons evolve.
- **AI agent framework** (`packages/ai/`) — unchanged; orthogonal to access-control.
- **Stripe integration** — unchanged.
- **Notification system** — trigger sources expand to include spaces-consumer events.
- **Config** — additions; deprecations.
- **Tap consumer** (public firehose) — continues to handle public records.

### 15.2 What changes

| Component | V9 | V11 |
|---|---|---|
| AppView firehose source | Tap + `pg_notify` | Tap (public) + spaces consumer (permissioned) |
| Membership state machine | Bilateral two-record machine | Thin reader over arbiter's `members` space |
| Role authority | `membership_role` + `role_definition.permissions` | Role-space membership |
| Visibility decisions | `VisibilityRouter` consulting `governance_visibility` enum | Per-space placement at write time |
| Private data storage | `private_record` PostgreSQL table | Permissioned repos for the appropriate space |
| Operator authority | `OperatorWriteProxy` + audit log table | `$admin` space membership; arbiter audit |
| Public-record path | Direct PDS writes via `OperatorWriteProxy` | `$publish` space writes via arbiter |
| Governance labels | Custom labeler (standalone DID) | Cooperative arbiter's `$labeler` space |
| Cross-cooperative federation | `cooperative_link` table + RFC 9421 signatures | Space-as-member-of-space via arbiters |

### 15.3 What retires

- `LocalPdsService`, `LocalPlcClient`, `LocalFederationClient` (already retired by V6/V9; cleanup remaining)
- Bilateral membership state machine in `MembershipService`
- `VisibilityRouter`
- `private-record-service.ts`'s ACL paths (data path repurposed as projection cache)
- `IFederationClient` for public data paths
- `cooperative_link` table
- RFC 9421 HTTP signatures (no remaining edge case justifies retaining them in V11)
- Federation outbox
- `pg_notify('pds_firehose')`
- Custom labeler service (cooperative's `$labeler` space replaces it)

### 15.4 Schema changes

**New tables:**
- `gv_proposal`, `gv_vote`, `gv_deliberation`, `gv_anchor`, `gv_log_head`, `gv_role_snapshot`, `gv_election` (GovernanceView projections)
- `did_rotation_history` (DID rotation aliasing)
- `space_credential` (per (cooperative, space) credential cache)

**Modified tables:**
- `membership` — keeps schema; `member_record_uri` and `approval_record_uri` columns become historical evidence
- `private_record` — repurposed as projection cache (or eventually retired entirely)

**Retired tables:**
- `membership_role`, `role_definition.permissions` columns
- `cooperative_link`
- Federation outbox tables

### 15.5 Lexicon migrations

- 30+ `network.coopsource.*` lexicons carry through (agreements, finance, legal, alignment, commerce, funding, onboarding)
- 2 lexicons retire (`membership`, `memberApproval`)
- 6+ new lexicons in `community.lexicon.governance.*`
- 4 CSN-specific extensions in `network.coopsource.governance.*`
- Anchor record lexicons (`community.lexicon.governance.summary`)
- Transparency-log lexicon (`community.lexicon.governance.logHead`)

### 15.6 Test strategy

- Service-layer tests for surviving services (60–70% of suite) carry through unchanged
- Tests for retiring services deleted alongside the code
- New tests for spaces consumer, arbiter integration, GovernanceView plugin contracts, OAuth-spaces seam
- V9 integration-test fixtures re-run against V11 substrate as smoke tests
- GovernanceView ships a conformance test suite; CoopView and other consumers run it against their integration

---

## 16. Phased Transition Plan

No schedule. Work proceeds when the design is right. The sequencing below is logical order of concerns — what depends on what, what should be settled before what — not a calendar.

### Stage 1 — Spaces consumer

**Branch:** `feature/v11-stage-1-spaces-consumer`
**Gate:** None; safe to start now against sketch implementation.

A spaces-aware consumer in `apps/api` that pulls records from cooperative-scoped permissioned repos. Prerequisite for everything else. Either consume from HappyView 2.5+ running alongside as a reference, or implement the consumer directly against the `bluesky-social/atproto` `permissioned-data` branch.

### Stage 2 — Arbiter integration

**Branch:** `feature/v11-stage-2-arbiter-integration`
**Gate:** Arbiter XRPC API reaches a 0.x reference implementation in a usable form.

A thin wrapper around the Arbiter's XRPC API, used by `apps/api` to provision cooperative arbiters, manage role spaces, and do membership operations. Contributions to the Arbiter design happen in parallel (§18). May be CSN's own implementation if Zicklag/Meri's lags or pivots.

### Stage 3 — Membership and roles to spaces

**Branch:** `feature/v11-stage-3-membership-roles`
**Gate:** (a) Controlled-DID system reference implementation, (b) URI scheme decision finalized, (c) `ats://` vs `at://` resolution path settled.

The `members` space, role-spaces (`board`, `officers`, `treasurer`, member classes, custom roles) become the authority. `MembershipService` becomes a thin wrapper around arbiter membership operations. Bilateral membership state machine retires. Until all gates pass, V11 builds a CSN-internal model that *resembles* spaces but doesn't commit to wire format.

### Stage 4 — Votes, proposals, deliberations to spaces

**Branch:** `feature/v11-stage-4-governance-to-spaces`
**Gate:** Stage 3 plus OAuth-spaces seam settling.

Public proposals move to `$publish`; private proposals, votes, deliberations move to permissioned repos in the appropriate space (`members` / `officers` / `board`). Anchor pattern lifts from V10's design directly into GovernanceView. Aggregate tally anchors stay.

### Stage 5 — Individual records to personal spaces

**Branch:** `feature/v11-stage-5-personal-spaces`
**Gate:** Stage 4 done.

Patronage allocations, capital account balances, 1099-PATR forms, personal contact info move from `private_record` to per-(coop, member) personal spaces. Cost optimization deliberately deferred per §17.

### Stage 6 — Extract GovernanceView

**Branch:** `feature/v11-stage-6-extract-governance-view`
**Gate:** Not blocked on Lexicon Community ratification.

Pull generic governance code out of `apps/api` into a `@coopsource/governance-view` package. Make it standalone-deployable. Publish lexicons under `community.lexicon.governance.*`. The Lexicon Community Discussion thread (§18) runs in parallel.

### Stage 7 — Codify CoopView

**Branch:** `feature/v11-stage-7-coop-view`
**Gate:** Stage 6.

Pull cooperative-specific code into a `@coopsource/coop-view` package. Register CoopView's plugins with GovernanceView. Lexicons stay in `network.coopsource.*`.

### Stage 8 — Retire V8/V9 federation primitives

**Branch:** `feature/v11-stage-8-retire-federation`
**Gate:** None; pure cleanup after Stages 3–7 stabilize.

`IFederationClient`, RFC 9421 HTTP signatures, federation outbox, `cooperative_link` table.

### Stage 9 — Future capabilities

Stages 1–8 establish the substrate. Stage 9 is open-ended capability development on top of it: recursive cooperatives, trust networks, cross-cooperative role delegation, multi-stakeholder governance, lifecycle events (merge/split/dissolution), personal portability, credential issuance, cooperative-owned relay infrastructure (per §11.4).

---

## 17. Design Commitments

### 17.1 Architectural commitments

**Per-(coop, member) personal spaces, with cost optimization deferred.** Ship the cleaner abstraction now; optimize once the end-to-end system is running and the actual cost shape is visible.

**Membership lexicons retire.** Both V9 membership lexicons retire entirely. The `members` space is the single source of truth.

**Binary `governance_visibility` retires.** Per-space placement replaces the open/mixed/closed flag.

**Governance labels via `$labeler` space.** CSN does not run a separate labeler service. The cooperative arbiter owns its labels.

**RFC 9421 HTTP signatures retire.** Spaces with cross-arbiter space-as-member relationships subsume V9's closed-coop-to-closed-coop private exchange use case.

**Single custom AppView.** CSN runs one AppView (`apps/api` extended with a spaces consumer). HappyView 2.5+ is a reference implementation, not production substrate.

**`community.lexicon.governance.*` namespace.** Designed against; the Lexicon Community Discussion thread runs in parallel.

### 17.2 Cooperative DID lifecycle

**Cooperatives own their DIDs.** Rotation keys offline with cooperative governance; CSN holds signing key only.

**DID rotation aliasing.** `did_rotation_history` table; all DID-comparing code consults it.

### 17.3 Bluesky design pivot policy

If Bluesky ships permissioned data with significant deviations from Diaries 4 and 5, CSN treats the following as *load-bearing* (would force replanning):

- The *semantic distinction* between permissioned and public URI resolution. The specific scheme token (`ats://` is the leading candidate but Holmgren is explicit it's not yet decided) is substrate; the *fact* that permissioned URIs resolve through a different protocol is load-bearing.
- `(DID, read|write)` ACL minimality as the protocol-layer access model.
- Cooperative-DID-as-distinct-from-user-DID.

Everything else is *substrate*, abstracted behind ports.

### 17.4 Tier 3 integration

CSN's UI detects Germ DM availability and surfaces "Start secure conversation" actions; platform never handles content. Tier 3 is an *optional secondary channel*, not a required path.

### 17.5 Subchapter T canonical record-of-truth

ATProto-native records via plugin contracts as primary canonical source. External ledger added later as foreign-key link if legal counsel requires.

### 17.6 Historical-state retention

GovernanceView retains snapshots of arbiter member-list state at well-defined cadences: per fiscal-period close, per role-space change, periodic (baseline daily). CoopView's `HistoricalStateReader` plugin consumes them.

---

## 18. Open Questions and Ecosystem Engagement

### 18.1 Items still genuinely open

- **The full OAuth-spaces seam mechanism** (§3.4). Sketchable now; details settle as Diary 6+ and OAuth granular-scopes work cross-pollinate. CSN's seam writeup explicitly identifies which parts are sketchable today vs. which await protocol resolution.
- **Lexicon Community response to `community.lexicon.governance.*`.** Discussion thread starts the conversation; CSN proceeds in parallel.
- **Subchapter T legal counsel consultation.** Whether ATProto-native records alone satisfy IRS audit expectations.
- **URI scheme token finalization.** `ats://` is the leading candidate but not committed. CSN's URI helpers abstract the scheme.
- **URI authority semantics.** Diary 5 settled SPACE-first/space-DID-authority; Meri's user-DID argument is real but not unanimous. CSN's `SpaceRef` and plugin interfaces don't depend on URI authority semantics.

### 18.2 Engagement plan

**Arbiter cooperative use case document.** CSN writes a parallel design document framing the cooperative use case for the Arbiter pattern. Posted to whatever venue Meri and Zicklag prefer. Includes the plugin set as the cooperative use case's affirmative answer to the fine-grained-ACL question Meri raised in her April 10 post.

**Lexicon Community engagement.** Discussion thread for `community.lexicon.governance.*` per the Lexicon Community's established process (precedent: Profile Lexicon #9, Social Graph #10, Polite Goshawk WG).

**Diary feedback.** Substantive feedback on Diary 6+ via comments. Agenda: OAuth-spaces seam, cooperative DID lifecycle events, recursive arbiter pattern, per-(coop, member) personal spaces.

**Private Data WG participation.** Join the `discourse.atprotocol.community` Private Data WG as participant, not passive observer. Surface cooperative use case as stress test on the spaces design.

**Coordination with other implementers.** opensocial.community (Brittany Ellich), NorthSky, Habitat, Blacksky. Each surfaces design pressure CSN doesn't see from cooperatives alone.

### 18.3 Refresh cadence

Two-week refresh cadence on the ecosystem watchlist:

- `dholms.leaflet.pub` (Holmgren's diaries)
- `zicklag.leaflet.pub` (Zicklag's posts)
- `meri.leaflet.pub` (Meri's posts)
- `happyview.dev`
- `tangled.org/gamesgamesgamesgames.games/happyview`
- `github.com/bluesky-social/atproto/compare/permissioned-data`
- Discourse Private Data WG
- `@atproto/oauth-scopes` npm version
- `blog.muni.town` (Roomy roadmap)

Direct URL fetches of known endpoints, not search-driven discovery. The architecture document only changes when a refresh surfaces something load-bearing.

---

## 19. Appendix: Key Resources

### Primary protocol sources (as of May 2026)

- Holmgren, "Permissioned Data Diary 5: What's in a Name?", May 8, 2026 — `https://dholms.leaflet.pub/3mlegohgtps2k`
- Holmgren, "Permissioned Data Diary 4: The Big Picture", March 20, 2026 — `https://dholms.leaflet.pub/3mhj6bcqats2o`
- Holmgren, "Permissioned Data Diary 2: Buckets", February 26, 2026 — `https://dholms.leaflet.pub/3mfrsbcn2gk2a`
- AT Protocol Roadmap (Spring 2026), Bluesky Protocol Team, March 24, 2026 — `https://atproto.com/blog/2026-spring-roadmap`
- AT Protocol OAuth Specification — `https://atproto.com/specs/oauth`
- AT Protocol Permission Sets Guide — `https://atproto.com/guides/permission-sets`
- `@atproto/oauth-scopes` reference implementation — `https://www.npmjs.com/package/@atproto/oauth-scopes`
- `bluesky-social/atproto` permissioned-data branch — `https://github.com/bluesky-social/atproto/compare/permissioned-data`

### Ecosystem sources

- Meri, "Evaluating permissioned spaces for community contexts", April 10, 2026 — `https://meri.leaflet.pub/3mj4qwvypq22a` (architectural critique that motivated the Arbiter design; co-authored with Zicklag)
- Zicklag, "The Arbiter — Group Management for Permissioned Spaces and Beyond", April 18, 2026 — `https://zicklag.leaflet.pub/3mjrvb5pul224`
- Zicklag, "Making Roomy More ATProto-Native", March 13, 2026 — `https://zicklag.leaflet.pub/3mgy2sbswl22f`
- Trezy, "Releasing HappyView 2 Into the Wild", April 24, 2026 — `https://trezy.com/blog/releasing-happyview-2-into-the-wild`
- HappyView v2.5.0 — "The Permissioned Data Release", May 5, 2026 — `https://github.com/gamesgamesgamesgamesgames/happyview/releases/tag/v2.5.0`

### CSN context

- `docs/plans/2026-05-08-csn-architectural-direction.md` — research foundation (this document's analytical basis)
- `docs/plans/2026-05-11-csn-research-addendum.md` — May ecosystem scan
- `docs/archive/ARCHITECTURE-V9.md` — most recent shipped architecture (superseded by V11)
- `docs/archive/ARCHITECTURE-V10.md` — designed April 16, 2026; never implemented (superseded by V11)
- `docs/archive/` — earlier architecture versions (V3, V5, V6, V7, V8)

### Cooperative resources

- ICA Principles: `https://ica.coop/en/cooperatives/cooperative-identity`
- Platform Cooperativism Consortium: `https://platform.coop`
- SELC Templates: `https://theselc.org`
- DAWI Resources: `https://institute.coop`
- USDA Cooperative Tools: `https://rd.usda.gov/about-rd/agencies/rural-business-cooperative-service`

### Community organizations

- opensocial.community — Brittany Ellich's group-as-DID model
- Roomy / Muni Town — Meri and Zicklag, building the Arbiter
- NorthSky — worker-owned PDS hosting
- Free Our Feeds — public-interest funding

---

*V11 is the architecture CSN believes in for years, not a workaround for protocol gaps. The protocol gaps closed in early 2026; this is what CSN builds on what landed.*
