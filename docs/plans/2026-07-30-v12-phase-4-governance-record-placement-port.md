# V12 Phase 4 Governance Record Placement Port

**Date:** 2026-07-30
**Status:** Implemented checkpoint; runtime defaults unchanged

## Purpose

Separate the policy decision about where a governance record belongs from the
mechanism that writes it. Proposal and vote creation previously called a
numeric `VisibilityRouter` directly and then interpreted Tier 1 or Tier 2
inside `ProposalService`.

The replacement is `GovernanceRecordPlacementPort`. It returns one of two
named destinations:

- `public-repo`;
- `permissioned-space` with a complete `SpaceRef`.

`ProposalService` consumes that result and delegates the physical write to the
existing public PDS path or `PermissionedRecordWritePort`. It no longer owns
numeric tier interpretation or permissioned-space derivation.

## Preserved Behavior

`CsnDbGovernanceRecordPlacementPort` is the default API adapter. It deliberately
preserves the current CSN policy:

| Governance visibility | Placement |
| --- | --- |
| `open` | Public repository |
| `mixed`, no override | Public repository |
| `mixed`, private override | Permissioned members space |
| `closed` | Permissioned members space |
| Any mode, public override | Public repository |

The adapter still derives CSN space placement from the Lexicon package and
requires an explicit `SpaceRef` for collections assigned to role, class, or
personal spaces.

The `private-record` implementation remains the default
`PermissionedRecordWritePort`. Draft XRPC writing stays opt-in. This checkpoint
does not migrate storage, change API response shapes, or activate a production
space host.

## Verification

Focused API tests cover:

- public, closed, mixed, and explicit-override placement;
- injected placement policy for both proposal and vote writes;
- existing closed-governance proposal/vote persistence behavior;
- default and draft-XRPC writer composition.

Verification completed before merge:

- API package build passed.
- Focused placement and writer-composition tests passed: 2 files, 21 tests.
- Repository build passed: 10/10 tasks.
- Repository tests passed: 17/17 tasks, including API 102 files/988 tests,
  spaces-consumer 20 files/115 tests, and Docker federation 17 files/122 tests.

## Open Decisions

This port creates a stable policy boundary but does not settle:

- managing-app authorization or `checkUserAccess`;
- cooperative host/operator and key custody;
- retention, correction, deletion, or re-homing policy;
- migration, rollback, or changing the default writer.

Those remain governed by V12-S01, V12-S02, V12-S03, and V12-S05 in
`docs/plans/2026-07-30-v12-signoff-register.md`.

## Next Work

1. Define the smallest CSN managing-app policy needed for
   `checkUserAccess`, behind an explicit port.
2. Add migration and rollback tooling only after the real read/recovery path
   can prove parity against the default writer.
3. Keep `private_record` authoritative until the evidence and signoffs required
   by V12-S05 exist.
