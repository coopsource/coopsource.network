# @coopsource/arbiter-client

V12 package for replaceable group-directory and authority adapters.

The runtime implementation is deliberately CSN-backed, not a final upstream
Arbiter client. Proposal 0016, SimpleSpace, and Roomy's Arbiter direction are
still moving, so this package keeps them behind stable `GroupDirectoryPort`
and `GroupMutationPort` contracts.

Roomy's current Arbiter direction is a portable Rego-controlled XRPC proxy.
The older `town.muni.arbiter.*` lexicons and recursive role-space model remain
useful prior art, not a stable wire contract CSN should bind to.

## Public Surface

- `membersSpace(cooperativeDid)`: canonical CSN members space reference.
- `roleSpace(cooperativeDid, role)`: canonical `roles/<slug>`, `roles/custom/<slug>`, or `classes/<slug>` space reference.
- `CsnDbGroupDirectoryPort`: reads current CSN `membership` and `membership_role` tables as a temporary directory source.
- `XrpcGroupDirectoryPort`: experimental mock-tested adapter for current draft `com.atproto.space.*` + `com.atproto.simplespace.*` endpoints. It is not wired as the default because the upstream implementation is still draft and only exposes direct simplespace membership.
- `GroupMutationPort`: write-side boundary for cooperative provisioning, member changes, role changes, and audit reads.
- `CsnDbGroupMutationPort`: writes the current CSN tables behind that boundary until Arbiter XRPC semantics are available.
- `ManagingAppAccessPolicyPort`: application-policy boundary for the draft
  SimpleSpace `checkUserAccess` callback.
- `CsnGroupDirectoryManagingAppAccessPolicy`: fail-closed CSN adapter that
  authorizes only strict resolved members of the requested CSN space.
- `DidProvisioningPort`: binds the pinned Proposal 0016
  `#atproto_space_host` DID service entry. The current service `type` is a CSN
  convention because the proposal fixes the id but not a normative type.

## Temporary Space Conventions

```ts
membersSpace(cooperativeDid);
// { arbiterDid: cooperativeDid, spaceKey: 'members', expectedSpaceType: 'network.coopsource.org.spaceType.members' }

roleSpace(cooperativeDid, 'treasurer');
// { arbiterDid: cooperativeDid, spaceKey: 'roles/treasurer', expectedSpaceType: 'network.coopsource.org.spaceType.role' }
```

`spaceKey` is the stable identity. `expectedSpaceType` is validation/config
metadata. The current `expectedSpaceType` values have draft Proposal 0016 space
type declarations in `@coopsource/lexicons`
(`packages/lexicons/network/coopsource/org/spaceType/`), but this package keeps
the constants local to avoid coupling the directory adapter to lexicon runtime
exports.

## Adapter Semantics

`CsnDbGroupDirectoryPort` treats active, non-invalidated `membership` rows as direct DID members of the `members` space. Role spaces require both active membership and a matching `membership_role` row. Class spaces resolve active memberships with matching `member_class`.

`XrpcGroupDirectoryPort` maps `SpaceRef` to the current Proposal 0016 URI shape
`at://{authorityDid}/space/{spaceType}/{skey}` and calls:

- `com.atproto.space.listSpaces`
- `com.atproto.space.getSpace`
- `com.atproto.simplespace.listMembers`

The adapter intentionally does not claim a protocol-level recursive
`resolveSpaceMembers` primitive exists. Resolution returns the direct DID set
from the SimpleSpace host-internal member list; pagination under
`consistency: 'strict'` walks
all pages, while `projection-ok` may return `partial: true` after the first
page. Network or malformed upstream responses fail closed as partial/stale
results. This list is application/host policy, not part of the core
permissioned-data protocol. CSN-DB remains the runtime default.

The draft XRPC clients take method names from
`@coopsource/lexicons`' pinned Proposal 0016 baseline. SimpleSpace creation
uses `manage=create`; member add/remove/list operations use `manage=update`.
The service-authenticated `checkUserAccess` callback is a separate
authority-to-managing-app direction and does not use an OAuth `manage` grant.

Unknown space shapes fail closed as partial/stale resolved membership.

`CsnDbGroupMutationPort` is the temporary write-side companion. It provisions the cooperative DID as its own placeholder arbiter DID, treats role-space creation as a validated no-op, mutates `membership` and `membership_role` in transactions, and records changed commands in `fact_log` with `entity_type = 'v11.groupMutation'`.

The mutation port does not create V9 cooperative-owned `memberApproval` records. Migrated API paths pass member-authored `network.coopsource.org.memberConsent` records only as consent evidence while active membership authority moves behind this package. The temporary CSN adapter still stores consent URI/CID in the existing `membership.member_record_uri/member_record_cid` projection columns until Stage 3 schema cleanup.

Changed commands write structured old/new values to `fact_log`. Invitation acceptance records the inviter as the authority actor; the accepting member's record is evidence only.
