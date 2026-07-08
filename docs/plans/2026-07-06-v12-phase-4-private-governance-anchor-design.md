# V12 Phase 4 Private Governance Public Anchor Design

**Date:** 2026-07-06
**Status:** Initial runtime path implemented. The lexicon, service seam,
projection table, opt-in policy flags, proposal lifecycle wiring, anchor-target
labels, and public `listProposalAnchors` XRPC read are in place. Public
aggregate tallies remain intentionally absent.

## Purpose

Closed-governance proposals and votes now write through
`PermissionedRecordWritePort` and resolve to permissioned-space record URIs.
That is the correct privacy default, but it leaves external observers, bridges,
and label consumers with no public subject to reference.

This document defines the optional public-anchor surface that must exist before
CSN emits public governance labels for private proposals. Until that surface is
implemented and explicitly enabled, private proposal labels and anchors remain
forbidden.

## Decision

Use a separate public anchor record for closed/private governance summaries.
Do not label a permissioned proposal URI directly, and do not copy the private
proposal record into the public repo.

Recommended draft collection:

```text
network.coopsource.governance.proposalAnchor
```

The anchor is written to the cooperative's public repo, or to a future
public-read / publish space if upstream settles that convention. The private
proposal remains in the cooperative members space.

Publication is opt-in:

- Default for closed governance: no anchor, no public label.
- Default for mixed governance: no private anchor unless the specific proposal
  is routed private and anchor publication is enabled.
- Policy flags: `public_governance_anchors` controls anchor existence/status
  publication; `public_governance_anchor_outcomes` separately controls outcome
  publication and outcome labels.
- Earliest publication point: proposal open. Draft private proposals must never
  create public anchors.

## Privacy Contract

The anchor may contain:

- cooperative DID
- app-layer proposal UUID
- lifecycle status after draft (`open`, `closed`, `resolved`, `withdrawn`,
  `archived`)
- non-identifying timestamps (`openedAt`, `closedAt`, `resolvedAt`)
- final outcome after resolution (`passed`, `failed`, `no_quorum`,
  `class_quorum_not_met`, `archived`)
- optional aggregate tally only when a later explicit tally policy allows it

The anchor must not contain:

- private proposal URI, rkey, CID, title, body, options, tags, or attachments
- author DID
- voter DIDs, vote rationales, delegated-from DIDs, or member classes
- quorum thresholds or class-quorum rules when those reveal membership shape
- free-form text copied from the private record

Aggregate tally is not part of the first implementation. If added later, it
must have a separate policy gate and minimum-size rule for small cooperatives.

## Draft Record Shape

This is intentionally a design target, not generated code yet:

```ts
interface ProposalAnchorRecord {
  $type: 'network.coopsource.governance.proposalAnchor';
  cooperativeDid: string; // DID
  proposalId: string; // app-layer UUID
  status: 'open' | 'closed' | 'resolved' | 'withdrawn' | 'archived';
  outcome?:
    | 'passed'
    | 'failed'
    | 'no_quorum'
    | 'class_quorum_not_met'
    | 'archived';
  openedAt?: string; // datetime
  closedAt?: string; // datetime
  resolvedAt?: string; // datetime
  updatedAt: string; // datetime
  anchorVersion: 1;
}
```

Use the app-layer proposal UUID as the stable cross-tier identifier because a
private proposal URI is intentionally not public. The anchor service should keep
the public anchor URI in local projection state once a real write path exists.

## Label Policy

Public governance labels for private proposals attach only to the public anchor
URI.

Rules:

- If no anchor exists, emit no label.
- If anchor publication is disabled, emit no label.
- If an anchor exists, label the anchor URI with the same public status label
  family already used for public proposals.
- Never emit `proposal-approved`, `proposal-rejected`, or
  `proposal-archived` against a permissioned-space proposal URI.

The current `ProposalService` suppression for permissioned-space proposal URIs
is therefore correct and remains the fail-closed default.

## GovernanceView Hook

`GovernancePluginSet.anchorSummary` is the right generic hook. Its default
behavior already returns `null`, which preserves the private-by-default
contract.

Future CSN wiring should provide a CoopView adapter that:

1. evaluates the cooperative anchor policy,
2. builds a `ProposalAnchorRecord` value from local proposal projection fields,
3. refuses to include private record payload fields, and
4. returns `null` when the policy, proposal state, or minimum-size rules do not
   allow publication.

## Implementation Slices

1. [x] Add the `proposalAnchor` lexicon and generated types.
2. [x] Add a local `PublicGovernanceAnchorService` with an in-memory/write-port test
   seam before touching `ProposalService`.
3. [x] Add a schema migration for the cooperative-level opt-in flag and anchor URI
   projection, defaulting to disabled.
4. [x] Wire proposal open/close/resolve to upsert anchors only when policy is
   enabled.
5. [x] Change private-proposal label emission to target the anchor URI only when
   an anchor exists and outcome publication is enabled.
6. [x] Add public API/XRPC reads that expose anchors without exposing private
   proposal records.

## Tests Required

- Closed governance without opt-in creates no anchor and emits no public label.
- Opted-in closed governance creates an anchor only after the proposal opens.
- The anchor record excludes title, body, options, author DID, private URI, and
  vote details.
- Resolution labels target the anchor URI, never the permissioned proposal URI.
- Aggregate tally remains absent until an explicit tally policy is enabled.
- Disabling the policy prevents new anchor updates without exposing previously
  private data.

## Policy Choices

The current implementation chooses the conservative defaults:

1. Public anchors are cooperative-level opt-in only for now. Per-proposal
   confirmation can be added later if the UI needs finer control.
2. Final outcomes require the separate
   `public_governance_anchor_outcomes` opt-in. Without it, anchors may show
   existence/status but no outcome labels are emitted.
3. Aggregate tallies remain unpublished. The service seam can enforce a minimum
   member-count policy later, but no tally policy is exposed yet.
