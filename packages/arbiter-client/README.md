# @coopsource/arbiter-client

Stage 2 V11 package for Arbiter-shaped membership authority.

The first implementation is deliberately a CSN-backed compatibility adapter, not a final upstream Arbiter XRPC client. Upstream Arbiter and permissioned-space APIs are still settling, so this package exposes replaceable helpers and adapters behind the stable `GroupAuthorityPort` contract from `@coopsource/spaces-consumer`.

## Public Surface

- `membersSpace(cooperativeDid)`: canonical CSN members space reference.
- `roleSpace(cooperativeDid, role)`: temporary role-space convention.
- `CsnDbGroupAuthorityPort`: reads current CSN `membership` and `membership_role` tables as a temporary authority source.
- `GroupAuthorityCommandPort`: write-side authority boundary for cooperative provisioning, member changes, role changes, and audit reads.
- `CsnDbGroupAuthorityCommandPort`: writes the current CSN tables behind that boundary until Arbiter XRPC semantics are available.

## Temporary Space Conventions

```ts
membersSpace(cooperativeDid)
// { arbiter: cooperativeDid, type: 'network.coopsource.org.cooperative', skey: 'members' }

roleSpace(cooperativeDid, 'treasurer')
// { arbiter: cooperativeDid, type: 'network.coopsource.org.role', skey: 'treasurer' }
```

`network.coopsource.org.role` is a PoC convention. It is isolated here so a later Arbiter XRPC or finalized role-space type can replace it without changing `SpacesConsumer` or application services.

## Adapter Semantics

`CsnDbGroupAuthorityPort` treats active, non-invalidated `membership` rows as members of the `members` space. Role spaces require both active membership and a matching `membership_role` row.

Unknown space shapes and malformed cursors fail closed. Pagination cursors are opaque and keyset over `membership.indexed_at` plus `membership.id`.

`CsnDbGroupAuthorityCommandPort` is the temporary write-side companion. It provisions the cooperative DID as its own placeholder arbiter DID, treats role-space creation as a validated no-op, mutates `membership` and `membership_role` in transactions, and records changed commands in `fact_log` with `entity_type = 'v11.groupAuthority'`.

The command port does not create V9 cooperative-owned `memberApproval` records. Migrated API paths keep member-authored membership records only as consent evidence while the active membership authority moves behind this package.

Changed commands write structured old/new values to `fact_log`. Invitation acceptance records the inviter as the authority actor; the accepting member's record is evidence only.
