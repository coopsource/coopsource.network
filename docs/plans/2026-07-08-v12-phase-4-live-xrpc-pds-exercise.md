# V12 Phase 4 Live Draft-XRPC/PDS Exercise

**Date:** 2026-07-08
**Status:** Initial executable harness added. No runtime default changed.

## Purpose

Exercise the non-default `PERMISSIONED_RECORD_WRITER_MODE=draft-xrpc` path
against a real space-enabled PDS or HappyView-compatible prototype. This slice
does not make draft XRPC the default writer, does not replace CSN-DB as the
default group-directory adapter, and does not start Phase 6 retirement work.

The current upstream draft branch exposes the required live surfaces as:

- `com.atproto.simplespace.createSpace`
- `com.atproto.simplespace.addMember`
- `com.atproto.space.getDelegationToken`
- `com.atproto.space.getSpaceCredential`
- `com.atproto.space.createRecord`
- `com.atproto.space.putRecord`
- `com.atproto.space.deleteRecord`

## Command

```bash
PERMISSIONED_RECORD_WRITER_MODE=draft-xrpc \
LIVE_XRPC_COOP_DID=did:plc:... \
LIVE_XRPC_OWNER_DID=did:plc:... \
LIVE_XRPC_AUTHOR_DID=did:plc:... \
LIVE_XRPC_PDS_URL=https://pds.example \
SPACE_MANAGING_SESSION_DIDS=did:plc:... \
pnpm --filter @coopsource/api exercise:draft-xrpc-pds
```

`LIVE_XRPC_OWNER_DID` defaults to `LIVE_XRPC_COOP_DID`. The default space is
the canonical CSN members space:

```text
network.coopsource.org.spaceType.members / members
```

Use `LIVE_XRPC_SPACE_TYPE` and `LIVE_XRPC_SPACE_KEY` only when testing an
explicit alternate space. The currently advertised draft OAuth scopes are most
likely to cover the default members space.

## Prerequisites

1. Start the API once with `PERMISSIONED_RECORD_WRITER_MODE=draft-xrpc` so its
   OAuth client metadata advertises the draft `space:` read/write scopes.
2. Complete real OAuth consent for:
   - the space owner DID, used for `simplespace.createSpace/addMember`;
   - the author DID, used for create/update/delete writes;
   - every DID listed in `SPACE_MANAGING_SESSION_DIDS`, used for background
     credential renewal.
3. Ensure each managing DID is also locally authorized through the CSN
   membership read seam for `private.manage`; the selector intentionally does
   not borrow arbitrary member sessions.
4. Point `LIVE_XRPC_PDS_URL`, `COOP_PDS_URL`, or `PDS_URL` at the
   space-authority PDS.

## What It Exercises

The command runs:

1. create or reuse the space with simplespace `member-list` policy;
2. add the author and explicit managing-session DIDs to the space member list;
3. obtain a delegation token through the selected managing OAuth session;
4. exchange it with the authority PDS for a short-lived space credential;
5. create a `network.coopsource.governance.vote` record in the space;
6. update that same record through `com.atproto.space.putRecord`;
7. delete it through `com.atproto.space.deleteRecord`.

## Failure Mapping

The live command reports typed local errors:

- `PermissionedRecordWriteError.kind`: `auth`, `not-member`,
  `invalid-space`, `conflict`, `not-found`, `protocol`, `unavailable`
- `SpaceCredentialError.kind`: `auth`, `not-member`, `client-policy`,
  `invalid-space`, `protocol`, `unavailable`
- `XrpcSimpleSpaceManagementError.kind`: `auth`, `not-owner`,
  `invalid-space`, `conflict`, `protocol`, `unavailable`

These preserve the Phase 4 axis split: OAuth/session failures, space-membership
failures, app/client policy failures, and upstream availability problems do not
collapse into one generic authorization error.

## Defaults Preserved

- `PERMISSIONED_RECORD_WRITER_MODE` remains `private-record` by default.
- CSN-DB remains the default group-directory and group-mutation adapter.
- Private governance anchors remain disabled unless their existing explicit
  policy flags allow them.
- Background sync uses only `SPACE_MANAGING_SESSION_DIDS`.
