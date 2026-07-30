# ATProto Permissioned Spaces Ecosystem Research Report

- **Date:** 2026-07-29
- **Research cutoff:** 2026-07-29 23:59 America/Los_Angeles
- **Purpose:** Refresh the V12 evidence base after Proposal 0016, Permissioned
  Data Diary 7, recent HappyView releases, Roomy's launch and devlogs,
  Blacksky's private-post launch, and current Atmosphere forum discussion.

## Executive Findings

1. **Proposal 0016 is a serious implementation target, not a stable
   specification.** It merged on July 3, but the linked atproto implementation
   remains a 74-commit draft PR and no `@atproto/space` package has been
   published. The proposal directory has not changed since July 3 even though
   Diary 7 and HappyView have already moved some details.
2. **The core protocol no longer has a member-list abstraction.** A space
   authority decides whether to issue credentials. `SimpleSpace` is one
   optional policy package with a member list; application records, an Arbiter,
   an organization host, or another managing app can define richer policy.
3. **Roomy is the closest architectural peer, but it is not yet a Proposal 0016
   implementation.** Its released private product uses custom AppView/SQLite
   storage. Its current migration direction is a community DID/PDS plus a
   portable Rego-controlled XRPC proxy, record-shaped Roomy data, and eventual
   HappyView testing.
4. **Deployed projects validate multiple custody models.** Blacksky submits
   full private posts to its AppView and writes public-repo stubs. Habitat is
   prototyping organization-managed identities and an organization data server.
   Roomy wants a community account/host with advanced ACLs. Proposal 0016 starts
   with per-user permissioned repositories. No single custody model has won.
5. **HappyView is the fastest-moving executable harness.** Stable `2.11.8`
   includes fixes after CSN's `2.11.4` spike; `2.12.0-dev.1` and `.2` follow
   Diary 7 and repair CID/CBOR behavior. Its current HMAC-only commit change
   differs from the literal Proposal 0016 and atproto draft implementation,
   which still include a signed context. It is useful for differential testing,
   not as the protocol oracle.
6. **CSN's architecture direction remains valid.** Separating spaces,
   group/authority policy, generic governance, and cooperative policy matches
   the community's emerging separation of protocol, group authority,
   governance, and application semantics. The current custom AppView decision
   is reinforced by Roomy and Blacksky, not weakened.
7. **The next CSN risk is implementation, not another conceptual redesign.**
   The missing capability is a real credentialed notification/pull/LtHash/CAR
   recovery pipeline and one end-to-end projected governance record flow.

## Evidence And Maturity

This report uses four evidence levels:

| Level               | Meaning                                                                   | Examples                                 |
| ------------------- | ------------------------------------------------------------------------- | ---------------------------------------- |
| Published proposal  | The current published design target, still subject to change              | Proposal 0016                            |
| Executable draft    | Code that can be tested but is not released as a stable protocol contract | atproto PR #5187, HappyView `2.12.0-dev` |
| Deployed product    | Working user-facing behavior, possibly off-protocol                       | Roomy, Blacksky-only posts               |
| Community direction | Design discussion or experiment, useful but non-binding                   | forum threads, Bluesky posts, OpenSocial |

Marketing language such as "shipped" is treated as publication of a proposal,
not final standardization or production availability in the reference PDS.

## Upstream Protocol Status

### Proposal 0016

[Proposal 0016](https://github.com/bluesky-social/proposals/tree/main/0016-permissioned-data)
merged on July 3. Its current design is:

- One permissioned repository per `(user, space)`. The user DID remains the
  repository authority; the space DID is the URI authority.
- Space identity is `(authority DID, type NSID, skey)`.
- The proposed record URI is
  `at://{spaceDid}/space/{spaceType}/{skey}/{authorDid}/{collection}/{rkey}`.
  The proposal still identifies URI design as unsettled.
- OAuth adds `space:` grants for `read`, `read_self`, record
  `create`/`update`/`delete`, and space `manage` operations.
- Credential flow is user OAuth session to
  `com.atproto.space.getDelegationToken`, then authority
  `com.atproto.space.getSpaceCredential`, optionally including a client
  attestation.
- Synchronization is direct pull from writer repo hosts, not relay ingestion.
  `listRepos`, `listRepoOps`, LtHash comparison, and `getRepo` CAR recovery form
  the core path.
- `registerNotify`/`notifyWrite` are best effort. A correct syncer also needs
  periodic `listRepos` sweeps and public identity/account events.
- `listRepos` identifies writers with repositories; it is not a list of all
  readers or group members.
- Whole-space `read` is intentionally all-or-nothing. `read_self` gives a
  writer access only to their own repository and is collection constrained.
- Private moderation labels must themselves be permissioned records to avoid
  leaking metadata on the public labeling network.

The proposal's current commit object carries `ver`, `hash`, `mac`, `ikm`,
`sig`, and `rev`. The signature binds the space, author, and revision context;
the HMAC protects the LtHash state.

### Reference Implementation State

[atproto PR #5187](https://github.com/bluesky-social/atproto/pull/5187) is still
open and marked draft. At the research cutoff it had 74 commits, 9,961
additions, 68 deletions, a `dirty` merge state, and head
`3f6c96d5d2d25438bd40fa89d6ecc37865f8e354`. There had been no PR update since
July 3.

The branch exposes these draft surfaces:

- `com.atproto.space`: record CRUD and `applyWrites`, blobs, delegation and
  space credentials, `getLatestCommit`, `getRepo`, `listRecords`,
  `listRepoOps`, `listRepos`, `listSpaces`, `registerNotify`, `notifyWrite`,
  and space-deletion notification.
- `com.atproto.simplespace`: create/update/delete a space, add/remove/list
  members, and managing-app `checkUserAccess`.

The implementation enforces separate `manage=create|update|delete` OAuth
permissions. `addMember`, `removeMember`, and `listMembers` use
`manage=update`; `checkUserAccess` is service-authenticated.

As of July 29, npm publishes `@atproto/api 0.20.34`,
`@atproto/oauth-client-node 0.4.9`, `@atproto/oauth-scopes 0.5.6`, and
`@atproto/pds 0.5.21`, but no `@atproto/space`. CSN currently uses
`@atproto/api 0.19.0` and `@atproto/oauth-client-node 0.3.17`.

### Diary 7 And Version Skew

[Permissioned Data Diary 7](https://dholms.leaflet.pub/3mqtqvjidqs2p) was
published July 17, after Proposal 0016. It reiterates direct pull, LtHash, and
best-effort notification, removes membership from the core protocol
explanation, and says details are still changing before a final specification.

Diary 7 describes HMAC-based commits without asymmetric signatures on the
data. The current proposal and atproto branch still produce a signed context
plus HMAC. This is unresolved version skew, not a basis for choosing one format
locally.

The official [Spring 2026 roadmap](https://atproto.com/blog/2026-spring-roadmap)
also says significant implementation and experimentation are required before
permissioned-data details are final. The ATP IETF working group's initial
[charter explicitly excludes non-public data and application
schemas](https://atproto.com/blog/kicking-off-the-atp-working-group), so IETF
progress does not make Proposal 0016 normative.

## HappyView Update

[HappyView releases](https://github.com/gamesgamesgamesgamesgames/happyview/releases)
after CSN's July 11 spike are:

| Release         | Date   | Relevant change                                                  |
| --------------- | ------ | ---------------------------------------------------------------- |
| `2.11.6`        | Jul 16 | Added missing space write APIs and enforced `allowedCollections` |
| `2.11.7`        | Jul 17 | Fixed auth inheritance from XRPC scripts to jobs                 |
| `2.11.8` stable | Jul 18 | Added independent job logging                                    |
| `2.12.0-dev.1`  | Jul 21 | Updated spaces to Diary 7; real CIDs; CBOR/attestation fixes     |
| `2.12.0-dev.2`  | Jul 25 | Automatic CID backfill                                           |

HappyView still labels permissioned spaces experimental. Its Diary 7 update
[removed the signed commit
field](https://github.com/gamesgamesgamesgamesgames/happyview/commit/99ee756924c17582341bcd82bc99d182e2bc07b3),
while Proposal 0016 and the atproto draft branch still contain it.

The [HappyView roadmap](https://happyview.dev/blog/looking-ahead-with-happyview)
describes a future v3 plugin model supporting Lua, TypeScript, and Rust,
filesystem-backed imports, per-lexicon tables, and a redesigned dashboard. That
could reduce extension friction, but it does not supply CSN's query semantics,
typed governance plugin composition, 103-table projection model, or fail-closed
validation automatically.

**Conclusion:** Keep the July 11 decision. Retain `apps/api` as the AppView.
Upgrade the separate HappyView harness and use it for compatibility and
differential protocol tests.

## Bluesky And Community Direction

Bluesky [shipped group chats in
June](https://bsky.app/profile/bsky.app/post/3mnzmr7gmxs2y) as an app product
outside Proposal 0016 and has described
[Bluesky Communities](https://bsky.app/profile/bsky.app/post/3mnzmprxpe22y) as
public, invite-based, or private groups with handles/URLs and cross-app
interoperability. Communities are being developed alongside permissioned data
and community working-group activity; they are not a launched Proposal 0016
product.

The current Atmosphere forum is
[discourse.atmosphere.community](https://discourse.atmosphere.community).
Recent threads identify unresolved protocol and product requirements:

- The [Proposal 0016 discussion](https://discourse.atmosphere.community/t/permissioned-data-proposal-discussion/946)
  asks for `unregisterNotify`, nested-space semantics, authorization revocation
  fan-out, and a workable data re-homing story.
- [Early proposal feedback](https://discourse.atmosphere.community/t/early-permissioned-data-proposal-draft-feedback/923)
  calls for multiple interoperable implementations, security/privacy review,
  moderation and anti-abuse design, resource limits, and clearer deletion
  guarantees before stabilization.
- The [terminology correction](https://discourse.atmosphere.community/t/terminology-of-permissioned-data/925)
  is decisive for CSN: the core protocol no longer has a membership list, and
  an application cannot assume it knows every writer from an app-level roster.
- [Blacksky Learn](https://discourse.atmosphere.community/t/blacksky-learn-an-experimental-study-guide-for-permissioned-data/958)
  provides a course based on the initial proposal, reflecting both strong
  implementation interest and the design's density.
- [Atmospheric Group discussion](https://discourse.atmosphere.community/t/what-is-an-atmospheric-group-community/906)
  and the [groups/community working-group
  proposal](https://discourse.atmosphere.community/t/proposal-wg-for-group-community-standards-and-infrastructure-in-atproto/745)
  favor separable identity/discovery, membership, spaces/data, and
  governance/authority primitives instead of one universal community object.

Current Bluesky discussion also contains useful, non-normative pressure:

- An [OAuth-only personal SimpleSpace
  variant](https://bsky.app/profile/jakelazaroff.com/post/3mrlxx34t722z) could
  avoid space credentials for simple personal use.
- [Application-level permissioned
  caches](https://bsky.app/profile/pevohr.bsky.social/post/3mrpqujwd5c23) may
  need to absorb sync and serving load.
- The Rust `atproto-space` experiment was
  [paused](https://bsky.app/profile/ngerakines.me/post/3mrqkyewpl22i) until the
  protocol matures.

These posts are design signals, not contracts.

## Roomy And Arbiter

### What Works Today

[Roomy reached general availability](https://blog.roomy.space/3mplw6vvw4s23)
on July 1. That is evidence of a working permissioned group product, not
Proposal 0016 conformance.

Roomy's [first July devlog](https://blog.roomy.space/3mpyrm7mbik2u) says private
data moved from the earlier Leaf server into a custom AppView and that an
incremental HappyView migration is being considered. Its
[second devlog](https://blog.roomy.space/3mqk45bo5322b) says private messages
currently live in a separate SQLite database alongside the AppView.

The next Roomy substrate plan is:

1. Give each Roomy space a real ATProto DID/PDS account.
2. Put the latest Arbiter in front as a Rego-controlled XRPC proxy.
3. Migrate event-stream/DRISL data toward record-shaped Lexicons.
4. Explore chat Lexicon alignment with Colibri.
5. Test HappyView as pieces become compatible.

### Arbiter Evolution

The April [Arbiter design](https://zicklag.leaflet.pub/3mjrvb5pul224) described
roles as spaces, recursive/federated membership, a dedicated community DID,
admin conventions, and read/write levels. It is valuable prior art, but it
predates the removal of core protocol membership and should not be treated as a
stable wire contract.

The current direction is a smaller, portable policy proxy:

- The June prototype [embeds Rego
  policy](https://bsky.app/profile/zicklag.dev/post/3mnb2pub5mc2a).
- Roomy demonstrated a [delegated organization
  post](https://bsky.app/profile/zicklag.dev/post/3mns3oper322v).
- The Arbiter is a [custom XRPC
  proxy](https://bsky.app/profile/zicklag.dev/post/3mncuiow3a22n).
- July discussion says it should be
  [portable into alternative hosts and
  HappyView](https://bsky.app/profile/zicklag.dev/post/3mrfu5oblj42u).
- Zicklag distinguishes applications such as Roomy that need an
  [advanced-ACL host](https://bsky.app/profile/zicklag.dev/post/3mrfu5obkju2u)
  from simpler groups that can use a smaller host.

**Implication for CSN:** Roomy validates the Layer 2 port boundary and keeping
Rego below GovernanceView. It does not validate binding CSN to the old
`town.muni.arbiter.*` drafts, recursive-member-list semantics, or a particular
host. CSN should preserve its group-directory and mutation ports while
refreshing the expected adapters.

## Other Permissioned-Space Projects

### Blacksky

[Blacksky-only posts launched July
8](https://opencollective.com/blacksky/updates/blacksky-only-posts-are-now-live).
The current
[client](https://github.com/blacksky-algorithms/blacksky.community/blob/137e4d0a97e53dfbf2028d09e1e5d697f7e1976d/src/lib/api/community.ts)
submits full content to custom authenticated XRPC methods and then writes a
`community.blacksky.feed.post` stub to the user's PDS.

The current
[server handler](https://github.com/blacksky-algorithms/atproto/blob/3e6892f93a13491086084b38d08e4325b7c91424/packages/bsky/src/api/community/blacksky/feed/submitPost.ts)
checks Blacksky membership and stores the full post through its data plane.
Read and delete handlers repeat the membership gate; deletion is restricted to
the creator.

Blacksky is strong evidence for real membership, moderation, deletion, and
private-serving requirements. It is a deployed custom AppView design, not a
Proposal 0016 implementation.

### Habitat

Habitat's [Calendar architecture](https://habitat.leaflet.pub/3mgsbpsledc23)
uses its own permission-enforcing repository, `pear`, with direct,
client-oriented access and no required AppView. More recent
[organization-model discussion](https://discourse.atmosphere.community/t/modeling-communities-on-permissioned-data/887)
describes organization-managed user identities, an organization data server,
administrator-granted app access, and permission state represented as
migratable records.

Habitat exposes a question that CSN must answer explicitly: when a member
leaves, does the cooperative retain canonical governance data, or can the
member's per-user authority remove it? Proposal 0016 alone does not settle
organizational custody and retention.

### Northsky / Stratos

[Northsky's public updates](https://connectedplaces.online/reports/fr155-where-does-community-live-updates/)
focus on safety-critical communities, trusted operators, and stronger privacy
expectations. Public technical detail remains limited. It is requirements
evidence, not a conformance target.

### atproto-crates

The Rust
[`atproto-space` alpha](https://tangled.org/ngerakines.me/atproto-crates/blob/main/CHANGELOG.md)
implemented Proposal 0016-era LtHash, space scopes, and SimpleSpace behavior.
Its author paused further work pending protocol maturity. It remains useful as
an independent source of fixtures and differential behavior, not a production
dependency.

### OpenSocial And Atmospheric Groups

[OpenSocial](https://brittanyellich.com/on-atproto-and-atmospheric-groups-jqdept6/)
is an exploratory group application and design probe. Its DID-per-group and
shared group-contract direction supports composable group primitives and
cross-app discovery. It is not a standard or mature permissioned-data server.

### Colibri, plyr.fm, And Blebbit

Colibri is exploring chat Lexicons and has discussed alignment with Roomy, but
is waiting on the substrate. `plyr.fm` and Blebbit provide smaller experiments
or older forks. They broaden the use-case set but do not currently offer a more
current Proposal 0016 target than the atproto branch, HappyView, or
atproto-crates.

## Comparative Matrix

| Project          | Working state                           | Current custody model                    | Permission model                                   | Proposal 0016 status               | CSN relevance                        |
| ---------------- | --------------------------------------- | ---------------------------------------- | -------------------------------------------------- | ---------------------------------- | ------------------------------------ |
| atproto PR #5187 | Executable draft                        | Per-user repo per space                  | Authority-issued credentials; optional SimpleSpace | Closest reference                  | Pin fixtures and test against it     |
| HappyView        | Stable product plus experimental spaces | HappyView-hosted/indexed                 | SimpleSpace and scripts                            | Fast-moving partial implementation | Harness and differential target      |
| Roomy            | GA group app                            | Custom AppView plus private SQLite       | Rego/XRPC Arbiter direction                        | Migration planned                  | Closest Layer 2/product peer         |
| Blacksky         | Private posts live                      | Full content in custom AppView; PDS stub | Blacksky membership and moderation                 | Off-protocol                       | Deployed privacy/moderation evidence |
| Habitat          | Prototype/research                      | Organization data server / custom repo   | Organization policy records                        | Exploring alignment                | Custody and retention challenge      |
| Northsky         | Product/research                        | Trusted community operator               | Safety-critical, stronger privacy                  | Unclear                            | Threat-model evidence                |
| atproto-crates   | Paused alpha                            | Proposal-shaped                          | SimpleSpace                                        | Independent early implementation   | Fixtures/differential tests          |
| OpenSocial       | Proof of concept                        | Group DID/AppView                        | Group contract exploration                         | Conceptual                         | Cross-app group semantics            |
| Colibri          | Early chat work                         | App-specific                             | Emerging chat/group semantics                      | Waiting                            | Possible Lexicon alignment later     |

## Implications For V12

### Confirmed

- Keep the four layers.
- Keep group/authority adapters behind ports.
- Keep cooperative quorum, membership, eligibility, visibility, and retention
  policy out of the generic spaces layer.
- Keep `apps/api`; use HappyView as a harness.
- Keep community governance Lexicons non-canonical while working-group
  contracts evolve.
- Continue using URI helpers because URI shape is still debated.

### Invalidated Or Weakened

- Core permissioned data cannot be described as having one protocol member
  list.
- `listRepos` cannot stand in for membership or reader enumeration.
- Membership change cannot be treated as a protocol-defined universal
  credential-rotation event.
- The April Arbiter Lexicons and recursive role-spaces are not stable enough to
  be the expected wire contract.
- Diary 7 has shipped; it is no longer a future gate.
- Stable HappyView `2.11.4` is no longer the latest compatibility baseline.

### Still Open

- Signed-context plus HMAC versus HMAC-only commit format.
- Final permissioned URI format.
- Revocation and notification unregistration.
- Organizational retention, author deletion, and data re-homing.
- Private moderation and abuse-signal interoperability.
- Nested or recursively governed spaces.
- Which authority/host model CSN will operate in production.

## Research Conclusion

CSN should not pivot to Roomy, HappyView, Blacksky, or Habitat's current
storage model. It should use them to test the boundaries already present in
V12:

- Proposal 0016 for the Layer 1 protocol baseline.
- Roomy/Arbiter and Habitat for replaceable Layer 2 authority models.
- Blacksky and Northsky for privacy, moderation, and operational requirements.
- HappyView and atproto-crates for independent conformance checks.
- Atmospheric Groups for future cross-app identity/discovery contracts.

The immediate work should be a pinned conformance baseline followed by one
real, recovery-capable proposal/vote ingestion slice. The companion
[gap analysis](./2026-07-29-v12-permissioned-spaces-gap-analysis.md) maps that
work to the current repository.
