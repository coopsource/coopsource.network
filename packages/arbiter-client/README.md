# @coopsource/arbiter-client

Stage 2 V11 package for Group Directory / Arbiter adapters.

The first implementation is deliberately a CSN-backed temporary adapter, not a final upstream Arbiter XRPC client. Upstream Arbiter and permissioned-space APIs are still settling, so this package exposes replaceable helpers and adapters behind the stable `GroupDirectoryPort` and `GroupMutationPort` contracts.

## Public Surface

- `membersSpace(cooperativeDid)`: canonical CSN members space reference.
- `roleSpace(cooperativeDid, role)`: canonical `roles/<slug>`, `roles/custom/<slug>`, or `classes/<slug>` space reference.
- `CsnDbGroupDirectoryPort`: reads current CSN `membership` and `membership_role` tables as a temporary directory source.
- `GroupMutationPort`: write-side boundary for cooperative provisioning, member changes, role changes, and audit reads.
- `CsnDbGroupMutationPort`: writes the current CSN tables behind that boundary until Arbiter XRPC semantics are available.
- `DidProvisioningPort`: binds DID service entries such as `#space_host`.

## Temporary Space Conventions

```ts
membersSpace(cooperativeDid)
// { arbiterDid: cooperativeDid, spaceKey: 'members', expectedSpaceType: 'network.coopsource.org.spaceType.members' }

roleSpace(cooperativeDid, 'treasurer')
// { arbiterDid: cooperativeDid, spaceKey: 'roles/treasurer', expectedSpaceType: 'network.coopsource.org.spaceType.role' }
```

`spaceKey` is the stable identity. `expectedSpaceType` is validation/config metadata.

## Adapter Semantics

`CsnDbGroupDirectoryPort` treats active, non-invalidated `membership` rows as direct DID members of the `members` space. Role spaces require both active membership and a matching `membership_role` row. Class spaces resolve active memberships with matching `member_class`.

Unknown space shapes fail closed as partial/stale resolved membership.

`CsnDbGroupMutationPort` is the temporary write-side companion. It provisions the cooperative DID as its own placeholder arbiter DID, treats role-space creation as a validated no-op, mutates `membership` and `membership_role` in transactions, and records changed commands in `fact_log` with `entity_type = 'v11.groupMutation'`.

The mutation port does not create V9 cooperative-owned `memberApproval` records. Migrated API paths pass member-authored `network.coopsource.org.memberConsent` records only as consent evidence while active membership authority moves behind this package. The temporary CSN adapter still stores consent URI/CID in the existing `membership.member_record_uri/member_record_cid` projection columns until Stage 3 schema cleanup.

Changed commands write structured old/new values to `fact_log`. Invitation acceptance records the inviter as the authority actor; the accepting member's record is evidence only.
