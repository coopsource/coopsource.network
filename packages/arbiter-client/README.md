# @coopsource/arbiter-client

Stage 2 V11 package for Arbiter-shaped membership authority.

The first implementation is deliberately a CSN-backed compatibility adapter, not a final upstream Arbiter XRPC client. Upstream Arbiter and permissioned-space APIs are still settling, so this package exposes replaceable helpers and adapters behind the stable `GroupAuthorityPort` contract from `@coopsource/spaces-consumer`.

## Public Surface

- `membersSpace(cooperativeDid)`: canonical CSN members space reference.
- `roleSpace(cooperativeDid, role)`: temporary role-space convention.
- `CsnDbGroupAuthorityPort`: reads current CSN `membership` and `membership_role` tables as a temporary authority source.

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
