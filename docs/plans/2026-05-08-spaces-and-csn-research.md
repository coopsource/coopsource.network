# RESEARCH: ATProto Permissioned Data / Spaces and CSN — Design Direction

> **Date**: May 8, 2026 (rewritten to reflect the project's no-schedule, design-first posture)
> **Triggered by**: Permissioned Data Diary 5 (today), HappyView 2.5.0 experimental spaces (May 5), Arbiter design (April 18), HappyView 2.0 release (April 24)
> **Reads**: ARCHITECTURE-V10.md (April 16, 2026), CLAUDE.md, current schema and services in `apps/api`, `packages/db`, `packages/lexicons`
> **For**: Decision on the correct CSN architecture given the current state of permissioned data on ATProto

---

## TL;DR

CSN is a proof-of-concept with no users and no deployment, optimizing for "model the problem and solutions correctly without compromise at the design level." Under that constraint:

- **The Arbiter pattern is the cleanest existing model for a cooperative on ATProto.** Cooperative = Arbiter. Roles, board, officers, members = spaces. Recursive cooperatives = spaces nested in spaces. Cross-cooperative trust = space delegation. The Arbiter primitive is "everything is a space, members can be users or other spaces," and that recursion is exactly the recursive cooperative model expressed as protocol structure. This is a much better fit than V10's PostgreSQL six-tier ACL, which exists in V10 only because permissioned data didn't ship yet.

- **Three of V10's design choices were workarounds for absent protocol primitives, and lose their reason for existing under spaces.** The six-tier PostgreSQL ACL exists because protocol-level access control didn't exist; role-spaces replace it. Bilateral membership is a CSN invention compensating for absent group semantics; the space member list as authority replaces it. The anchor+sidecar pattern survives, but the sidecar moves from PostgreSQL to a permissioned space — same shape, different storage.

- **V10.4 (content wrappers) and V10.5 (transparency logs) are independent of spaces** and can be implemented in their current form whenever they're useful.

- **The recommendation is to commit to building CSN as a spaces + Arbiter-pattern application, contributing to both the spaces and Arbiter designs as they evolve, and accepting code churn as the cost of being early.** That is the direction. There is no parallel track, no sandbox, no "ship now and migrate later." Stripping the workarounds away makes CSN simpler, not harder, because it lets the protocol carry the load CSN was carrying alone.

---

## 1. State of permissioned data on ATProto (May 8, 2026)

### 1.1 What's locked in

Five design decisions have moved from "argued" to "decided":

**No E2EE for permissioned data.** Diary #1 established this; nothing has changed. E2EE is reserved for DMs. Permissioned data is access-controlled but not cryptographically confidential. CSN's existing Tier 3 (Germ DM / MLS) is still the right primitive for content that must remain encrypted from the platform — board executive sessions, salary records, personnel matters.

**The primitive is "permission spaces" (or "spaces").** "Buckets" was retired in February. Spaces are network-wide access and sync boundaries representing a shared social context. A space has an owner DID, a type (NSID), a key (skey), and a single member list. Each member has their own *permissioned repo* per space, hosted on their own PDS, holding their records for that space.

**Spaces have their own DIDs and those DIDs are transferable.** This is the load-bearing decision from Diary #5. A space owner is *usually* a dedicated DID, not the creator's user DID, because communities change hands and embedding ownership in the creator's identity makes handoffs break every backlink. This implies a "controlled DID" system on the PDS so user accounts can manage and transfer space DIDs. CSN already accepts this argument — cooperative DIDs in CSN are deliberately separate from the human DIDs of the people who provision them.

**The URI structure is six-component.** From Diary #5: `ats://{space_did}/{space_type}/{skey}/{author_did}/{collection}/{rkey}`. Space owner DID, space type NSID, space key, author DID, collection NSID, record key. The space DID is the URI authority because the user's authority to write into the space is downstream of the space granting them membership. The scheme is *probably* `ats://` (Holmgren is taking suggestions); it is *not* `at://`.

**Sync uses ECMH commits, not MSTs.** Permissioned repos use Elliptic Curve Multiset Hash — a set hash where adding/removing an element is a single point operation. Lower-overhead than MSTs but doesn't support partial sync or single-record proofs, so consumers fall back to a full repo resync if their oplog falls behind. Sync is pull-based: PDSes notify the space owner of writes, the space owner notifies syncing services, services pull from each member PDS. Member-list authority is the space owner. Write enforcement is performed by readers, not by member PDSes — any user can write any record claiming any space membership on their own PDS, but readers compare incoming records against the authoritative member list and discard what doesn't match.

### 1.2 What's still open

**Access control beyond `(DID, read|write)`.** Diary #4 says member lists are single tuples of `(DID, read|write)`, with write inclusive of read. There is no role semantics in the protocol. Zicklag's Arbiter (April 18) takes the opposite tack — collapse roles into spaces themselves, "roles are groups are spaces" — and adds 8 access levels at the *arbiter* layer that govern member-list management, not record content. The community trend appears to be "keep the protocol minimal, push richer ACLs into management services like the Arbiter."

**App allow/deny semantics.** Diary #4 sketches `default-allow` vs `default-deny` flags with allowlist/denylist of application client IDs, but the OAuth flow for app-scoped space access is still being detailed.

**Whether the implementation matches the design.** Holmgren has committed sketch code to the `permissioned-data` branch and explicitly says "please don't over-index on it." The spec and the implementation are co-developing.

**The scheme name.** `ats://` is the leading candidate but not final.

### 1.3 Reference implementations and ecosystem traction

In rough order of maturity:

- **HappyView 2.5.0 — "The Permissioned Data Release" (May 5, 2026).** Ships experimental permissioned-spaces support behind a feature flag. First public AppView with a working space implementation. HappyView 2 itself (April 24) is a dramatic simplification: single binary that absorbs Tap and AIP, SQLite default, native DPoP-bound OAuth, WASM plugin system. This is genuinely usable today.

- **`bluesky-social/atproto` `permissioned-data` branch.** Active, sketch-stage. Worth tracking for protocol shape.

- **Zicklag's Arbiter design (April 18, 2026).** A specification (not yet shipping) for an interoperable group/role/space management service that sits *on top of* permissioned data. Each community gets its own DID. Every role and group is a space. Spaces can be members of other spaces — enabling cross-arbiter delegation and "federated channels." Detailed below in §3.

- **Roomy / Muni Town.** Have committed to going ATProto-native using permissioned data. Roadmap: private spaces + invites, permissioned channels + roles, AppView+XRPC refactor, push notifications. Building the Arbiter in parallel.

- **NorthSky, Blacksky, Habitat.** Mentioned in the Spring 2026 Roadmap as teams "working in parallel to implement extensions to the protocol for non-public data." Their approaches differ from spaces — interim solutions using server-filtered visibility or domain-as-privacy-boundary. They may or may not converge.

### 1.4 Bluesky's posture

The AT Protocol Spring 2026 Roadmap (March 24) is unambiguous: permissioned data is the major Bluesky protocol team focus through the summer. Public-data work is in maintenance mode and moving to the IETF working group (chartered in late March). "Shipping Permissioned Data will require updates to PDS implementations, SDKs, written specifications, moderation tooling, and more."

The window for influencing the design is open right now and will probably close as the spec stabilizes. CSN's recursive cooperative model is a useful test case that the protocol team would benefit from hearing about.

---

## 2. State of CSN (May 8, 2026)

### 2.1 What's shipped (V9.1–V9.3)

V9 made CSN a composable governance service. The application layer is complete: 594 source files, 47 lexicons, 100 database tables, 60+ services, 75 frontend pages, full ATProto federation (V6 — `@atproto/pds`, `did:plc`, real relay/Tap consumers, governance labeler, starter packs).

Key V9 components for this analysis:

- **Bilateral membership.** Member writes `network.coopsource.org.membership` to their own PDS; cooperative writes `network.coopsource.org.memberApproval` to the cooperative's PDS. Status is `active` only when both records exist. Role authority lives only in `memberApproval`. Out-of-order arrival handled by the state machine in `MembershipService`.
- **Three-tier data model.** Tier 1 (public ATProto repos), Tier 2 (private PostgreSQL `private_record` table), Tier 3 (E2EE via Germ DM / MLS).
- **`VisibilityRouter`.** Routes writes to Tier 1 or Tier 2 based on cooperative `governance_visibility` (`open` / `mixed` / `closed`).
- **`OperatorWriteProxy` + `MemberWriteProxy`.** Audit-logged operator writes to cooperative PDS; DPoP-bound member writes via OAuth.
- **Hook pipeline.** Pre- and post-storage hooks at `apps/api/src/appview/hooks/`. The integration point for derived records and indexing.
- **Custom AppView.** Express 5 + Kysely 0.28 + PostgreSQL 16. Not HappyView.
- **Governance labeler.** Custom lightweight labeler emitting governance labels.

### 2.2 V10 designed (April 16, 2026), unimplemented

V10 is a privacy and access-control work program. The architecture document is committed; **none of the eight phases have shipped**. Current `private_record` has no `visibility_tier` or `owner_did` columns. Current `cooperative_profile` has no `membership_public` or `vote_visibility`. The `visibility-tier.ts` file in `apps/api/src/services/` is V8.1 request-time auth-tier resolution, not V10's data-storage tier.

V10 was designed when permissioned data was a sketch with no working implementation and no clear timeline. Three of its eight phases were workarounds for that uncertainty:

- **V10.1** (six-tier PostgreSQL ACL) is access control implemented in CSN because the protocol didn't have access control.
- **V10.2** (membership anchor + sidecar) is a privacy workaround because membership records leak member DIDs to the firehose.
- **V10.3** (vote privacy + aggregate tally anchor) is a privacy workaround because vote records leak voter DIDs to the firehose.

Two phases are independent of permissioned data:

- **V10.4** (content wrapper pattern) — Gerakines Community Manager pattern. Public records, no privacy dimension.
- **V10.5** (transparency logs) — Merkle-tree append-only log of governance events. Independent of where records live.

Three phases were already deferred:

- **V10.6** (opensocial.community bridge) — pending cross-app adoption.
- **V10.7** (Lexicon Community engagement) — ongoing community work.
- **V10.8** (permission spaces migration path) — explicit deferral until spaces shipped.

The new posture inverts V10.8's logic: rather than "build the workarounds first and migrate to spaces later," the design-first project posture means "build on spaces now if that's the right model, even if the spaces design and implementation are still evolving."

---

## 3. The Arbiter pattern as a cooperative model

### 3.1 What the Arbiter is

Zicklag's design (April 18, 2026): an interoperable group management service that hosts permissioned spaces and provides a standardized XRPC API for membership management.

**Core primitives:**

- An *arbiter* is a service that hosts spaces and represents a community/organization boundary. When you create one, it generates a DID that is the root of authority for that community. The community DID is separate from any individual user DID.

- Every *role*, *group*, and *space* is the same primitive: a space. The arbiter doesn't distinguish them. A `general` channel, a `team` role, a `moderator` role, an `officers` group — all are spaces with member lists.

- Each arbiter has a special `$admin` space that always exists, can never be deleted, and grants access to every other space. Members of `$admin` can also be granted permission to create new spaces.

- Spaces can have *member lists that include other spaces*. A `moderator` space being a member of a `team` space means anyone in `moderator` is also in `team`. The arbiter resolves member lists transitively.

- *Spaces from different arbiters can be members of each other.* This enables federated channels and cross-community trust. The Roomy general channel can include the Muni Town `members` space as a member, so any Muni Town member automatically has access.

- An *invite service* (separate, optional) handles invite links by being added as a member of a space with Add Members access.

- An optional `$publish` space, if present, allows members with Configure Space access to write records to the arbiter's *public* repo.

- An optional `$labeler` space, if present, allows members with Configure Space access to create labels.

**Access levels** at the arbiter (8 levels, from Read Member List through Owner) govern *member-list management*, not record-content access. Application-level concepts (what `moderator` means in a chat app) are up to the app to define and enforce.

### 3.2 The mapping to a cooperative

This is the cleanest existing protocol-level fit for CSN's recursive cooperative model:

| CSN concept | Arbiter primitive |
|-------------|-------------------|
| Cooperative | Arbiter instance + cooperative DID |
| Cooperative's PDS-managed identity | Arbiter's controlled DID, rotation key custody |
| `members` (active member roster) | A space whose member list is the active membership |
| `board`, `officers`, `treasurer`, `secretary` | Each is a space; members are the holders of that role |
| Custom roles (per `role_definition`) | Each becomes a space; permission inheritance becomes nested space membership |
| Probationary members | A `probationary` space; transition to `members` on completion |
| Member classes (worker, consumer, investor) | Each class is a space, all are members of `members`, weighted-voting handled at app layer |
| Cooperative operators (`OperatorWriteProxy`) | Members of `$admin` with Configure Space access |
| Operator audit log | Built-in to the arbiter via `$admin` Configure Space writes |
| Network of cooperatives | An arbiter whose `members` space contains other cooperative DIDs (which are themselves arbiter DIDs — recursive) |
| Cross-cooperative trust / federated channels | Cooperative A's space includes cooperative B's `members` space as a member |
| Public cooperative profile, public proposals | Records written to the arbiter's `$publish` space (in the cooperative's public repo) |
| Closed-governance proposals, deliberations | Records in members' permissioned repos for the cooperative's `members` space |
| Board-only deliberations | Records in board members' permissioned repos for the `board` space |
| Officer-only data (compliance, financial detail) | Records in officers' permissioned repos for `officers` |
| Governance labeler | Either runs as a service member of `$labeler` space, or stays as a CSN-owned labeler emitting against arbiter-derived state |

### 3.3 Why this is structurally better than V10's six-tier ACL

V10.1 designed a six-tier ordered ACL (`public` < `all_member` < `officer` < `board` < `individual`/`individual_strict`) implemented in PostgreSQL with a `visibility_tier` enum and an `owner_did` column for individual-tier records. The model is well-thought-out but has three structural weaknesses, all of which dissolve under the Arbiter pattern:

**The tiers are role-shaped but expressed as enum values.** "Officer" and "board" are tiers because they correspond to roles in CSN's role vocabulary. The Arbiter pattern surfaces the underlying truth: these are membership in different groups. Tier ordering is incidental to that. A cooperative that wanted a `finance-committee` tier between `officer` and `board` couldn't add one without modifying the enum and the access-check utility. Under the Arbiter, it's just another space.

**Custom roles need second-class extension via `role_definition.permissions`.** V10.1 has to consult a `role_definition` table for any role outside the standard vocabulary, with `grants:officer_access` and `grants:board_access` permission strings as escalation flags. This is an ad-hoc extension point. Under the Arbiter, every custom role is a first-class space with the same membership semantics as built-in roles.

**Cross-cooperative role delegation has no story.** V10's tier model is per-cooperative; there's no concept of "members of cooperative A's `treasurer` role have access to cooperative B's financial space." The recursive-cooperative model implies this should be possible. Under the Arbiter, "spaces can be members of spaces (across arbiters)" makes it native.

The PostgreSQL six-tier ACL is a reasonable workaround for a protocol that lacks group semantics. It is not a model that should outlive the protocol gaining those semantics.

### 3.4 Concerns about adopting the Arbiter pattern

**The Arbiter is two weeks old.** Zicklag explicitly says "some details of this design are new since about… 6 hours ago when I should have been sleeping." The XRPC API, the access levels, the delegation semantics, and the relationship to the underlying spaces protocol are all going to evolve. Building against the spec today means rebuilding when it changes.

**The Arbiter is being designed primarily for Roomy.** Roomy is a chat application. Cooperatives have governance, financial, and compliance requirements that aren't on Roomy's roadmap. CSN has to either contribute the cooperative use case to the Arbiter design (preferred), or accept that the Arbiter may not cover everything CSN needs and supplement at the application layer (acceptable).

**The arbiter-vs-spaces boundary is still being negotiated.** Some things in the Arbiter design (8 access levels, public access settings) may end up in the spaces protocol itself. Other things (role inheritance, cross-arbiter delegation) almost certainly stay in the arbiter layer. Until that settles, CSN's adapter has to be flexible.

These concerns are real but they don't argue for a different model. They argue for engaging with the design while building, not after.

---

## 4. What changes when CSN is rebuilt on spaces + Arbiter

### 4.1 V10.1 (six-tier PostgreSQL ACL) is dropped

Under the Arbiter pattern, access is membership in the appropriate role-space. The six-tier enum, `visibility_tier` column, `owner_did` column, `checkVisibilityAccess` utility, custom-role escalation logic — none of it is needed.

What replaces it:

- The arbiter's member list for each role-space is the access-control authority.
- Reads of records in a space require a space credential, which the space owner (the cooperative's PDS) issues only to members of the appropriate space.
- Application-level role meanings (what `treasurer` can do in CSN's UI) are still enforced in `apps/api`, but they're enforced *against arbiter membership lookups*, not against a PostgreSQL role table.

The `role_definition` table can stay as a UI-facing description ("here are the roles in this cooperative, here are their human-readable descriptions and permissions") but its `permissions` array stops being load-bearing for access control. Or it gets replaced by space metadata stored in the arbiter's `$admin`-written records.

### 4.2 Bilateral membership is replaced

Bilateral membership was a CSN invention to compensate for ATProto not having proper group semantics. It says: a member is "active" only when both the member's `membership` record and the cooperative's `memberApproval` record exist, with role authority living only in `memberApproval`.

Under spaces, the cooperative's `members` space has an authoritative member list. A member is in or out — there is no two-record state machine. The space owner (the cooperative's PDS) controls the list. Adding a member to the list grants them a permissioned repo for the space. There is no "out-of-order arrival" problem because there is only one record: the member-list entry.

Role authority moves from `memberApproval.roles[]` to membership in the appropriate role-space. The `treasurer` space's member list is the authoritative source for who the treasurer is.

The CSN-side semantics that bilateral membership *was* getting at — that membership requires cooperative consent and that role authority is centralized rather than self-declared — are preserved natively by spaces, just expressed differently.

### 4.3 V10.2 (membership anchor + sidecar) reshapes but survives

The anchor+sidecar pattern's purpose is: publish a non-identifying public summary, keep identifying detail private. This is still useful under spaces, because:

- Discovery: an external app crawling the public firehose should be able to learn "this cooperative exists, has N members, has policy X" without learning who the members are.
- Bridging: the opensocial.community bridge or any other external integration needs a public anchor to link to.
- Federation: a parent network's AppView indexing its member cooperatives wants public counts, not private rosters.

Under spaces, the anchor record stays in the cooperative's *public* repo (or its `$publish` space). The sidecar moves from the `private_record` PostgreSQL table to the cooperative's `members` space — the actual membership lives in the space's member list and the per-member permissioned repos for the space.

The post-storage hook that maintains the anchor's count still runs, just against arbiter state instead of the `membership` table.

This is the V10 phase that survives most intact. The lexicon shape (`network.coopsource.org.membershipSummary` with `activeMemberCount`, `pendingCount`, `membershipPolicy`, `membershipPublic`) is still correct.

### 4.4 V10.3 (private votes) reshapes more substantially

Today: votes are records on the voter's public PDS, leaking who voted and how. V10.3 routed them to `private_record` with `visibility_tier: 'all_member'` and `owner_did: voterDid`.

Under spaces: votes go in the voter's *permissioned repo* for the cooperative's `voting` space (or `members` space, depending on how granular CSN wants the space topology). Fellow members of the space can read each other's votes — same accountability story as V10.3, but enforced at the protocol level.

The aggregate tally anchor still makes sense for external observers: a public proposal record gets a `publicTally` field updated by a post-storage hook, computed from the space's records. The anchor lexicon doesn't change.

Deliberations follow the same pattern, with the deliberation-visibility setting choosing which space the deliberation lives in (`members`, `officers`, or `board` spaces).

### 4.5 V10.4 (content wrappers) is independent

The Gerakines Community Manager pattern is about cooperatives publicly curating member content via strong references. It has no privacy dimension. The `network.coopsource.org.curatedContent` lexicon, the service, the indexer can all be implemented at any time without spaces dependencies. Whether to do this work now or later is a feature-prioritization question, not a design question.

### 4.6 V10.5 (transparency logs) is independent

Merkle-tree append-only log of governance events. The log entries are derived from records in spaces (or in the public repo); the log itself is independent of where the records live. The lexicon (`network.coopsource.governance.logHead`), the service, the XRPC endpoints can be implemented at any time. The privacy adjustments V10 specified (events for private-vote coops log aggregate tallies; events for private-membership coops use internal UUIDs instead of member DIDs) still apply, just sourced from arbiter state.

### 4.7 Open: where individual-tier records live

V10's `individual` and `individual_strict` tiers covered patronage allocations, capital account balances, 1099-PATR forms, personal contact info, and future ZK-ballot identity commitments. These are records about an individual member, accessible only to that member (and, for `individual`, financial officers).

Spaces are *group-shaped*. A space implies a member list with shared access. An individual-record concept ("this record belongs to one person") is not really a spaces primitive.

Three options:

1. **Individual records stay in PostgreSQL.** They never move. Individuals are not groups; spaces don't need to model individual-shaped data. The cooperative's app keeps the individual-record store, with access checks against the member's identity (and, for `individual` records, against financial-officer membership in the appropriate role-space).

2. **One-member spaces.** Each individual record gets its own space whose member list is the owner (and, for `individual`, the financial officers). This is technically possible but heavy — thousands of spaces per cooperative, mostly with one or two members.

3. **A "personal" space type per cooperative-member pair.** Each member has a single permissioned repo per cooperative whose contents are the individual records for that member. Read access via the cooperative's `treasurer` space (or whatever financial-officer space is configured) for the `individual` tier; sole owner access for `individual_strict`.

Option 3 is the most space-native. Option 1 is the most pragmatic. The choice depends on how the spaces design handles "personal" spaces — Diary 5 mentions personal spaces (bookmarks, mutes, private posts, newsletters) as a clear use case, so option 3 is probably reasonable. This is a question to put to Holmgren.

### 4.8 What stays in CSN, what moves to the protocol

| Concern | Today | After rebuild |
|---------|-------|---------------|
| What records exist in a cooperative | CSN lexicons | CSN lexicons (still) |
| Who can read them | CSN's `VisibilityRouter` + `private_record` ACL + V10.1 enum | Space membership |
| Who can write them | `MemberWriteProxy` + `OperatorWriteProxy` | Spaces protocol (member writes to their own permissioned repo) |
| Member roster | `membership` table + bilateral records | Cooperative's `members` space member list (with `membership` table as a CSN-side index for fast queries) |
| Roles | `membership_role` + `role_definition` | Role-spaces (with `role_definition` reduced to UI metadata) |
| Operator authority | `OperatorWriteProxy` + audit log | `$admin` space membership + arbiter audit |
| Public profile, public proposals | Cooperative's PDS public repo | Same — or `$publish` space |
| Aggregate firehose-visible summary | V10.2 anchor record | V10.2 anchor record (unchanged shape) |
| Governance labels | CSN governance labeler | Either CSN labeler against arbiter state, or `$labeler` space |
| Cross-coop trust | `cooperative_link` table + ad-hoc | Space delegation, recursive |
| Federation discovery | Tap consumer + `bsky.network` | Same for public records; space-credentialed pulls for permissioned data |
| Hook pipeline | Pre/post-storage hooks on indexing | Same — runs against records as they're indexed regardless of source |
| Custom AppView (apps/api) | Express + Kysely + PostgreSQL | Same — gains a spaces consumer alongside the existing relay/Tap consumer |

CSN keeps its custom AppView. CSN keeps its lexicons. CSN keeps the hook pipeline. CSN keeps PostgreSQL as a query index. What changes is that authority for membership and access control moves out of CSN's PostgreSQL tables and into spaces, with CSN's tables reduced to materialized indexes derived from arbiter state.

The benefit: things CSN was inventing (bilateral membership, six-tier ACL, custom role escalation) are no longer CSN's invention. They're implementations of protocol primitives.

---

## 5. Options

### Option 1 — Continue V10 as designed

Implement V10.1 → V10.5 as specified in ARCHITECTURE-V10.md. PostgreSQL six-tier ACL, anchor+sidecar to `private_record`, private vote routing, content wrappers, transparency logs.

This locks CSN's privacy and access-control model into a shape that's about to be obsoleted by protocol primitives. Under the project's "model the problem and solutions correctly without compromise at the design level" posture, this is the wrong direction. V10's workarounds were defensible when spaces were vaporware. They are no longer the cleanest model.

The only thing this option recommends is preserving V10.4 (content wrappers) and V10.5 (transparency logs), both of which are space-independent.

### Option 2 — Pause, watch, and wait

Stop building anything related to privacy and access control. Wait for the spaces spec to stabilize, the SDK to ship, and the Arbiter to mature. Re-engage when the design is settled.

This is defensible — it avoids churn. But it gives up CSN's chance to shape the design while it's still malleable. CSN's recursive cooperative model is a useful test case that the protocol team would benefit from hearing about. Holmgren is explicitly soliciting feedback. So is Zicklag. Pausing means missing a window that won't reopen.

### Option 3 — Rebuild on spaces + Arbiter, contributing as the design evolves

Commit to the spaces + Arbiter direction. Engage with both Holmgren and Zicklag on the design conversations that are happening right now. Build CSN's privacy and access-control model on the protocol's primitives. Use HappyView 2.5+ where its spaces support is useful (probably as a reference implementation to read from rather than as production infrastructure). Extend `apps/api` with a spaces consumer and an arbiter-state index. Retire V10.1 (PostgreSQL ACL), retire bilateral membership, reshape V10.2 and V10.3, ship V10.4 and V10.5 independently. Expect the URI scheme to change at least once. Expect the Arbiter API to change. Expect to throw away code.

This is the option that fits the project's stated posture.

---

## 6. Recommendation

**Adopt Option 3.** Build CSN as a spaces + Arbiter-pattern application. Concrete moves:

1. **Stop V10.1 (PostgreSQL six-tier ACL) before it starts.** It exists only because the protocol didn't have group-based access control. The protocol now does, in sketch form. Implementing the workaround commits CSN to a model that's structurally wrong even if it works.

2. **Retire bilateral membership in favor of arbiter membership.** The cooperative's `members` space member list becomes the authority. The `membership` PostgreSQL table stays as a fast-query index, kept consistent with arbiter state via an indexer. The `memberApproval` lexicon stops carrying role authority — roles move to role-space membership. The `membership` lexicon either disappears (because the space's member list replaces it) or shrinks to a member-side preferences record (member's display preferences for their participation in this cooperative, which is genuinely member-side data).

3. **Reshape V10.2 and V10.3 around spaces-native storage.** The anchor lexicon (`membershipSummary`) keeps its shape; the sidecar moves from `private_record` to the cooperative's `members` space. Votes move from voter-PDS public records (or `private_record`) to voter permissioned repos for a `voting` space. Aggregate tally anchors on the public proposal record stay.

4. **Treat V10.4 (content wrappers) and V10.5 (transparency logs) as orthogonal.** Implement them independently of the spaces work, on whatever timeline makes sense for their own merits.

5. **Engage with Holmgren on the spaces design.** CSN's recursive cooperative model is a strong test case. The personal-spaces question (where individual-tier data lives) is worth raising explicitly. The bilateral semantics question (whether the protocol's `(DID, read|write)` is sufficient for cooperatives or whether some richer auth flow belongs in the protocol) deserves a written CSN perspective. Comment on Diary 5+ as new entries arrive.

6. **Engage with Zicklag on the Arbiter design.** The cooperative use case is a genuine stress test for the Arbiter. Cross-cooperative role delegation, multi-stakeholder member classes, probationary states, term-limited officer positions — all of these will surface design questions the chat-app use case won't. Contributing now shapes the design; commenting later just receives it.

7. **Use HappyView 2.5+ as a working reference, not as production substrate.** The CSN AppView in `apps/api` does too much CSN-specific work to translate to HappyView's Lua + WASM model cheaply. But HappyView's experimental spaces implementation is the most concrete spaces code in the world today. Read it. Run it. Use it to validate that an `apps/api` spaces consumer behaves correctly. Don't build on top of it.

8. **Plan to rebuild `private_record` consumers.** The `private_record` table currently holds Tier 2 data with no structure beyond `(did, collection, rkey)`. Under the rebuild, most of what's in there moves to permissioned spaces. The table either disappears or gets repurposed (likely as a CSN-side index of records pulled from spaces, similar to how `pds_record` currently indexes public records). The `VisibilityRouter` retires; reads and writes route to spaces with role-space credentials.

9. **Don't introduce a sandbox, parallel track, or "experimental branch."** The project has no production. Every branch is experimental. The work is the work.

10. **Expect the URI scheme to change.** Don't write `ats://` strings as constants in lexicons. Build a URI helper that abstracts the scheme. When the scheme finalizes, change the helper.

The cost is throwing away V10's PostgreSQL ACL design, V10.1's `checkVisibilityAccess` utility, the six-tier enum, the custom-role escalation table, and the bilateral membership state machine — none of which has been implemented yet, but all of which exists as written design. The benefit is a cooperative platform whose access-control model is the protocol's, not CSN's invention.

---

## 7. Open design questions

These are decisions that benefit from explicit answers before implementation work starts:

1. **Where do individual-tier records live?** §4.7 lists three options: PostgreSQL only, one-member spaces, or per-(coop, member) personal spaces. Option 3 is the most spaces-native. Worth raising with Holmgren given his Diary 5 mention of personal spaces as a use case.

2. **What does "cooperative DID" mean under the controlled-DID system?** Diary 5 says space DIDs are managed via a "lightweight controlled DID system on the PDS." CSN already provisions cooperative DIDs as separate from human DIDs, but the *mechanism* is currently bespoke (PlcClient + admin password). Under spaces, this mechanism becomes the protocol's controlled-DID story. Worth understanding the differences before CSN's provisioning code commits to either path.

3. **Does CSN's `apps/api` extend with a spaces consumer, or does CSN run a HappyView 2 alongside?** Both are workable. The first preserves the existing custom AppView and adds a new event source. The second introduces an architectural seam between two AppViews. The first is probably right because CSN's hook pipeline is built into `apps/api` and shouldn't fork.

4. **What's the contribution channel for the Arbiter?** Zicklag's design is published as Leaflet posts; Roomy is the primary user. CSN should either propose a pull request against whatever Arbiter spec repository emerges, or write a parallel "cooperative use case for the Arbiter" Leaflet post that frames the requirements in language Zicklag can incorporate. The latter is probably the right starting move.

5. **What happens to the V10 architecture document?** It was committed three weeks ago and now describes a direction that's partially being abandoned. The honest move is to write a V11 architecture document that supersedes V10, with V10 archived to `docs/archive/` alongside earlier versions. The V11 doc should be the spaces + Arbiter design fully worked out, with V10's surviving phases (V10.4, V10.5) integrated.

6. **Should CSN propose `community.lexicon.governance.*` now or later?** V10.7 track 4 mentioned proposing the anchor pattern as a community lexicon. The pattern survives the rebuild; the timing question is whether to surface it during the spaces design phase (when the protocol team is actively soliciting feedback) or after CSN has implemented it once. Probably surface it now as part of the "here's how cooperatives think about privacy" conversation with Holmgren.

7. **What does "throw away" actually mean for the existing code?** The V9 application layer (governance, agreements, legal, finance, operations, commerce, agents, alignment) is largely orthogonal to the access-control model. Throwing away the access-control layer doesn't mean throwing away those features. The scope of "throw away" is really `VisibilityRouter`, `private_record` semantics, the V10 design, the `membership_role` access-check paths, and bilateral membership state-machine logic in `MembershipService`. The rest stays. Worth being explicit about scope before starting.

---

## References

### Primary sources, May 8, 2026

- Holmgren, "Permissioned Data Diary 5: What's in a Name?", May 8, 2026 — `https://dholms.leaflet.pub/3mlegohgtps2k`
- Holmgren, "Permissioned Data Diary 4: The Big Picture", March 20, 2026 — `https://dholms.leaflet.pub/3mhj6bcqats2o`
- AT Protocol Roadmap (Spring 2026), Bluesky Protocol Team, March 24, 2026 — `https://atproto.com/blog/2026-spring-roadmap`
- Trezy, "Releasing HappyView 2 Into the Wild", April 24, 2026 — `https://trezy.com/blog/releasing-happyview-2-into-the-wild`
- HappyView v2.5.0 — "The Permissioned Data Release", May 5, 2026 — `https://github.com/gamesgamesgamesgamesgames/happyview/releases/tag/v2.5.0`
- Zicklag, "The Arbiter — Group Management for Permissioned Spaces and Beyond", April 18, 2026 — `https://zicklag.leaflet.pub/3mjrvb5pul224`
- Zicklag, "Making Roomy More ATProto-Native", March 13, 2026 — `https://zicklag.leaflet.pub/3mgy2sbswl22f`
- `bluesky-social/atproto` permissioned-data branch — `https://github.com/bluesky-social/atproto/compare/permissioned-data`

### CSN context

- ARCHITECTURE-V10.md, April 16, 2026 (project root) — to be superseded
- `packages/db/src/schema.ts` (current schema)
- `apps/api/src/services/visibility-router.ts` (V9 binary public/private gate — to retire)
- `apps/api/src/services/visibility-tier.ts` (V8.1 request-time auth tier — *not* a V10 component)
- `apps/api/src/services/private-record-service.ts` (current Tier 2 storage — to repurpose or retire)
- `apps/api/src/services/membership-service.ts` (bilateral state machine — to retire)
