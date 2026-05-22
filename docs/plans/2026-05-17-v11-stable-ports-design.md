# V11 Stable Ports Design

> **Date:** May 17, 2026  
> **Purpose:** Explain the "smaller set of stable ports" recommendation and how it differs from the current Claude V11 / Stage 1 shape.

## Short Version

The recommendation is not to replace V11's four-layer model. Keep:

```text
Spaces -> Arbiter -> GovernanceView -> CoopView
```

The adjustment is to make CSN code depend on internal capability ports rather than guessed external protocol mechanics. A port should be named after what CSN needs, not after the upstream service or wire detail expected to provide it.

Primary references:

- AT Protocol Permissions: `https://atproto.com/specs/permission`
- AT URI Scheme: `https://atproto.com/specs/at-uri-scheme`
- AT Protocol Repository: `https://atproto.com/specs/repository`
- Permissioned Data Diary 4: `https://dholms.leaflet.pub/3mhj6bcqats2o`
- Permissioned Data Diary 5: `https://dholms.leaflet.pub/3mlegohgtps2k`

## Current Claude V11 Shape

Claude's V11 design is layered well, but Stage 1 starts exposing interfaces around expected implementation details:

- `NotificationSubscriber`: assumes a notification-centered sync shape.
- `RepoPuller`: assumes pull happens per member repo with a `since` cursor.
- `EcmhVerifier`: assumes digest verification over the pulled batch.
- `ArbiterMemberList`: assumes member-list reads are complete list calls.
- `PulledRecord.uri: AtUri`: assumes a public AT URI-shaped record location.

These are good sketches, but several of those details are still unsettled upstream. If they become stable public package interfaces, later protocol changes will force churn through the rest of CSN.

## Proposed Stable Ports

### `GroupDirectoryPort`

Purpose: answer group, role, and recursive membership questions through direct and resolved membership snapshots.

It hides whether authority comes from Arbiter XRPC, direct spaces APIs, a temporary CSN implementation, or a later standard.

Expected responsibilities:

- List spaces and read space config without exposing draft XRPC details.
- Read direct members without assuming all members are DIDs.
- Resolve nested space membership and cross-arbiter membership.
- Return revision or snapshot markers for audit and historical reads.
- Surface partial, stale, or missing-space resolution so governance-critical callers fail closed.

This replaces direct dependency on `ArbiterMemberList` as the long-term application boundary. `ArbiterMemberList` can remain a Stage 1 sketch behind this port.

### `PermissionedRepoPort`

Purpose: sync verified permissioned-space records.

It hides notification shape, cursor shape, digest/commit strategy, and permissioned URI scheme.

Expected responsibilities:

- Subscribe or poll for changes through whatever upstream protocol supports.
- Pull or replay records for a `SpaceRef`.
- Verify permissioned repo state before returning accepted records.
- Trigger full resync when cursor/oplog/commit verification fails.
- Return opaque cursors controlled by the adapter, not by application logic.

This replaces exposing `NotificationSubscriber`, `RepoPuller`, and `EcmhVerifier` as the application-facing shape. Those can still exist internally inside a Stage 1 adapter.

### `GovernanceRecordPort`

Purpose: write and read canonical generic governance records.

It should use `community.lexicon.governance.*` records when ecosystem interoperability is a goal.

Expected responsibilities:

- Create proposals, votes, deliberations, elections, summaries, and log heads in the generic namespace.
- Return strong refs that CoopView sidecars can attach to.
- Keep generic governance usable by non-CSN indexers without requiring them to understand `network.coopsource.*`.

This differs from wrapping generic governance inside CSN records. Wrapping is still acceptable for CSN-only workflows, but should not be the generic ecosystem path.

### `CoopExtensionPort`

Purpose: attach cooperative-specific semantics to generic governance or cooperative workflows.

Expected responsibilities:

- Write `network.coopsource.*` sidecars that reference canonical generic records.
- Store vote weight evidence, member class, patronage context, fiscal period, Subchapter T annotations, and cooperative-specific agreement state.
- Keep cooperative semantics out of the protocol and out of generic GovernanceView records.

This preserves the GovernanceView / CoopView separation while improving ecosystem indexing.

### `ConsentEvidencePort`

Purpose: store durable member-authored evidence that a member intended to join or agree to cooperative terms.

Expected responsibilities:

- Store member-authored join/application records.
- Store signatures or agreement acceptance records.
- Link consent evidence to the authoritative group membership event.
- Keep active membership authority in the Group Directory / Arbiter substrate.

This avoids reviving V9 bilateral membership as the active state machine, while fixing the audit weakness of treating OAuth consent as membership consent.

## How This Changes Stage 1

Current Stage 1 flow:

```text
NotificationSubscriber -> RepoPuller -> EcmhVerifier -> onAccepted(record)
```

Suggested long-term boundary:

```text
PermissionedRepoPort.sync(spaceRef) -> VerifiedPermissionedChanges
```

Internally, the adapter may still use notifications, pulling, and ECMH verification. The difference is that GovernanceView, CoopView, and API services do not learn those details.

Current Stage 1 membership check:

```text
ArbiterMemberList.list(space) -> DID[]
ArbiterMemberList.isMember(space, did) -> boolean
```

Suggested long-term boundary:

```text
GroupDirectoryPort.getDirectSpaceMembers(space) -> DirectSpaceMember[]
GroupDirectoryPort.resolveSpaceMembers(space, options) -> ResolvedMembers
```

The returned values should preserve direct and resolved members separately and include resolver depth, stale/projection flags, partial resolution, and missing spaces.

## Comparison Table

| Concern | Claude V11 / Stage 1 | Stable Port Alternative | Practical Benefit |
|---|---|---|---|
| Membership authority | Arbiter-shaped member-list interface | `GroupDirectoryPort` | Arbiter can change without changing app logic. |
| Permissioned sync | Notification + puller + ECMH verifier | `PermissionedRepoPort` | Sync protocol changes stay inside one adapter. |
| Cursors | Per-member rev strings | Opaque adapter-owned cursors | Supports space-level, repo-level, or oplog cursors later. |
| URI type | `AtUri` reused for pulled records | Structured permissioned location or `PermissionedUri` | Avoids baking `at://` into permissioned data. |
| Generic governance | Wrapped inside `network.coopsource.*` | Canonical `community.lexicon.governance.*` plus sidecars | Generic apps can index records directly. |
| Membership consent | OAuth grant as consent evidence | Member-authored consent records | Better audit trail without bilateral membership authority. |
| Finance records | Personal spaces as canonical | Coop-owned ledger plus member projections | Clearer legal/accounting ownership. |

## What Should Stay From Claude V11

- The four-layer model.
- `SpaceRef = { arbiterDid, spaceKey, expectedSpaceType? }` as the internal space identity.
- Fail-closed sketch implementations.
- GovernanceView / CoopView separation.
- Plugin-based cooperative-specific rules.
- PostgreSQL as projection cache, not authority.
- Tier 2 data never touching the public firehose.

## Implementation Guidance

Do not rewrite Stage 1 from scratch. Instead:

- Keep existing sketches as internal adapter pieces.
- Add or evolve toward the five stable ports as the public package/API boundary.
- Rename verifier concepts away from "ECMH batch digest" unless upstream confirms that exact shape.
- Add distinct permissioned record location types before real data flows.
- Keep examples honest: mark OAuth-space write grammar, Arbiter XRPC, and URI scheme as unsettled.
