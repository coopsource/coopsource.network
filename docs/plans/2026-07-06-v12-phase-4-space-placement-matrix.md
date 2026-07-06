# V12 Phase 4 Space Placement Matrix

**Date:** 2026-07-06
**Status:** Draft substrate-planning artifact. This does not wire live OAuth or
permissioned-space writes.

## Purpose

Phase 4 should start by deciding where records belong before changing write
paths. Proposal 0016 treats a space type declaration as the OAuth consent label
and collection allow-list, so CSN needs a single placement matrix that connects:

- record collection
- draft CSN space type
- space key pattern
- AppView sync scope (`read`)
- member-self export scope (`read_self`)

The executable source is `CSN_SPACE_PLACEMENT_MATRIX` in
`packages/lexicons/src/space-placement.ts`. This document explains the current
draft choices and their caveats.

## Current Space Types

| Space kind   | Space type NSID                                | Space key pattern       | Meaning                                                  |
| ------------ | ---------------------------------------------- | ----------------------- | -------------------------------------------------------- |
| members      | `network.coopsource.org.spaceType.members`     | `members`               | Records visible to the cooperative's active member set   |
| role         | `network.coopsource.org.spaceType.role`        | `roles/{role}`          | Records visible to holders of a named role               |
| member class | `network.coopsource.org.spaceType.memberClass` | `classes/{memberClass}` | Records visible to members of a cooperative member class |

These names match the existing constants in `@coopsource/arbiter-client` and
the draft space declarations in `@coopsource/lexicons`. Keep
`network.coopsource.org.spaceType.*` as the canonical CSN draft namespace for
this PoC. Rename only if upstream final syntax or tooling makes the current
namespace actively misleading.

## Placement Matrix

| Collection                                      | Space kind   | Space key pattern       | AppView sync scope | Member-self scope | Notes                                                                         |
| ----------------------------------------------- | ------------ | ----------------------- | ------------------ | ----------------- | ----------------------------------------------------------------------------- |
| `network.coopsource.org.memberConsent`          | members      | `members`               | `read`             | `read_self`       | Evidence only; active membership authority remains the Group Directory.       |
| `network.coopsource.governance.proposal`        | members      | `members`               | `read`             | `read_self`       | Closed/private proposals move here; public anchors still need Phase 5 policy. |
| `network.coopsource.governance.vote`            | members      | `members`               | `read`             | `read_self`       | Private votes must not hit the public firehose.                               |
| `network.coopsource.agreement.master`           | members      | `members`               | `read`             | `read_self`       | Member-visible agreement body.                                                |
| `network.coopsource.agreement.signature`        | members      | `members`               | `read`             | `read_self`       | Signer-authored evidence; placement does not replace signature verification.  |
| `network.coopsource.admin.memberNotice`         | role         | `roles/{role}`          | `read`             | `read_self`       | Role-scoped notices such as board/officer communication.                      |
| `network.coopsource.legal.document`             | role         | `roles/{role}`          | `read`             | `read_self`       | Role-scoped legal documents.                                                  |
| `network.coopsource.legal.meetingRecord`        | role         | `roles/{role}`          | `read`             | `read_self`       | Board/officer minutes; Phase 5 maps to `meetingMinutes`.                      |
| `network.coopsource.finance.expense`            | role         | `roles/{role}`          | `read`             | `read_self`       | Financial claims remain Tier 2.                                               |
| `network.coopsource.finance.revenue`            | role         | `roles/{role}`          | `read`             | `read_self`       | Financial revenue records remain Tier 2.                                      |
| `network.coopsource.agreement.stakeholderTerms` | member class | `classes/{memberClass}` | `read`             | `read_self`       | Class-specific agreement terms.                                               |
| `network.coopsource.agreement.contribution`     | member class | `classes/{memberClass}` | `read`             | `read_self`       | Class-specific contribution evidence.                                         |
| `network.coopsource.funding.pledge`             | member class | `classes/{memberClass}` | `read`             | `read_self`       | Class-scoped funding pledge records.                                          |
| `network.coopsource.ops.timeEntry`              | member class | `classes/{memberClass}` | `read`             | `read_self`       | Work-hour records remain Tier 2.                                              |

## Scope Rules

For AppView projection, request collection-narrowed `read` scopes with the
cooperative authority DID and concrete space key:

```text
space:network.coopsource.org.spaceType.members?authority=did%3Aplc%3Acoop&skey=members&collection=network.coopsource.governance.vote&action=read
```

For member-self export or personal-only flows, `read_self` is valid but cannot
replace AppView sync because it cannot mint a space credential for the whole
space:

```text
space:network.coopsource.org.spaceType.members?collection=network.coopsource.governance.vote&action=read_self
```

`formatCsnAppViewReadScopePlan()` and
`formatCsnMemberSelfReadScopePlan()` turn the whole matrix, or an explicit
collection subset, into these draft `space:` OAuth scope strings. The default
planning mode uses `skey=members` for the members space and `skey=*` for role
and member-class spaces because the concrete role or class key is not known at
client-registration time. Use `skeyMode: "omit"` only for pre-consent displays
where the scope is intentionally describing a record placement pattern instead
of a concrete authorization request.

As of the July 2026 upstream check, the permissioned-data spaces proposal is
still described as exploratory PDS implementation work. The upstream
permissioned-data PDS design on the `permissioned-data` branch models spaces as
authorization and sync boundaries, uses `ats://` URIs, and keeps credential,
member-list, sync, notification, and SetHash details open for further spec
decisions. The published auth-scope and permission-set docs currently describe
generic permission strings such as `repo:`, `rpc:`, and `blob:` but not a final
`space:` scope resource. Treat the strings in this document as CSN planning
fixtures until upstream OAuth scope syntax for spaces is finalized.

Reference links:

- Permissioned-data PDS design:
  <https://raw.githubusercontent.com/bluesky-social/atproto/permissioned-data/docs/superpowers/specs/2026-04-22-permissioned-data-pds-design.md>
- Auth scopes proposal:
  <https://github.com/bluesky-social/proposals/blob/main/0011-auth-scopes/README.md>
- Permission sets guide: <https://atproto.com/guides/permission-sets>

## Caveats

- This matrix is a draft target, not a live placement guarantee.
- Record write actions are only partially encoded. `PermissionedRecordWritePort`
  now models create/write placement; update and delete permissions per
  collection still need policy after the credential seam is tested.
- Public governance anchors are a Phase 5 policy concern. This matrix only
  describes Tier 2/private placement.
- Current production writes route closed-governance proposals and votes through
  `PermissionedRecordWritePort`, backed by a legacy Tier 2 `private_record`
  adapter. The semantic record location is now a structured permissioned-space
  URI, but the physical storage is still the local table.
- The local spaces-consumer harness proves credential-gated sync for
  `network.coopsource.governance.vote`, but it is not a live
  permissioned-space writer.
- The current atproto draft exposes direct simplespace member lists, not CSN's
  recursive role/member-class authority model. Runtime placement still depends
  on `GroupDirectoryPort` and the CSN-DB adapter until the external substrate
  stabilizes.

## Next Slice

1. Decide whether proposal public anchors are mandatory, optional, or forbidden
   for closed/private governance.
2. Replace the legacy `private_record` adapter with a real
   `com.atproto.space.*`/permissioned-space writer once upstream write APIs are
   stable enough to target.
