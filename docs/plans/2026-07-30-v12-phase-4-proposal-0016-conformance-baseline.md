# V12 Phase 4 Proposal 0016 Conformance Baseline

**Date:** 2026-07-30
**Status:** Implemented checkpoint; runtime defaults unchanged

## Purpose

Re-establish one executable protocol target before implementing real
permissioned-repo ingestion. Proposal 0016, atproto PR #5187, Diary 7, and
HappyView do not currently agree on every wire detail. CSN must select and
name a target rather than accidentally combining them.

## Pinned Sources

| Source | Pin | Role |
| --- | --- | --- |
| `bluesky-social/proposals/0016-permissioned-data` | `1caad93dbb1f445396f6abf3b97eb4040345e78e` | Protocol proposal baseline |
| `bluesky-social/atproto` PR #5187 branch | `3f6c96d5d2d25438bd40fa89d6ecc37865f8e354` | Executable Lexicon baseline |

The pins are exported from
`packages/lexicons/src/permissioned-data-draft.ts`. They are draft identifiers,
not a CSN protocol version. Any pin change must update that object, its tests,
and this note together.

## Executable Contract

The baseline records required inputs, required outputs, errors, auth class,
and management verb for every draft method currently called by CSN:

- `com.atproto.space.getSpace`
- `com.atproto.space.listSpaces`
- `com.atproto.space.getDelegationToken`
- `com.atproto.space.getSpaceCredential`
- `com.atproto.space.createRecord`
- `com.atproto.space.putRecord`
- `com.atproto.space.deleteRecord`
- `com.atproto.space.listRepos`
- `com.atproto.space.listRepoOps`
- `com.atproto.space.getRepo`
- `com.atproto.space.getLatestCommit`
- `com.atproto.space.getBlob`
- `com.atproto.space.registerNotify`
- `com.atproto.space.notifyWrite`
- `com.atproto.space.notifySpaceDeleted`
- `com.atproto.simplespace.createSpace`
- `com.atproto.simplespace.addMember`
- `com.atproto.simplespace.removeMember`
- `com.atproto.simplespace.listMembers`

The code also pins:

- authority service `#atproto_space_host`, falling back to `#atproto_pds`;
- authority verification method `#atproto_space`, falling back to `#atproto`;
- current commit fields `ver`, `hash`, `mac`, `ikm`, `sig`, and `rev`;
- `manage=create` for SimpleSpace creation;
- `manage=update` for member add, remove, and list operations.

Draft record writes map the pinned `SpaceNotFound` error. They no longer
invent a protocol-level `NotAMember` record-write error.

## Implemented Alignment

- Draft XRPC adapters use centralized method constants.
- OAuth planning includes only `manage=create,update`; it does not request
  `manage=delete`.
- `DidSpaceAuthorityResolver` prefers dedicated space host/key entries,
  supports Proposal 0016 fallbacks, accepts relative or absolute DID URLs, and
  fails closed on mismatched or incomplete DID documents.
- Credential exchange uses DID-resolved authority service URLs. The live
  exercise retains `LIVE_XRPC_PDS_URL` only as an explicit test override.
- `ClientAttestationProvider` is now part of the credential issuer seam.
  `Proposal0016ClientAttestationProvider` constructs exact short-lived ES256
  JWT inputs with a single-use nonce and delegates cryptographic signing.
- DID provisioning binds `#atproto_space_host`. Its `AtprotoSpaceHost` service
  type remains a local convention because the proposal does not fix a
  normative type.

## Verification

Focused package and API builds/tests cover:

- source pins and method maps;
- scope formatting and absence of `manage=delete`;
- authority DID preference, fallback, malformed endpoint, mismatch, and
  resolver-unavailable behavior;
- deterministic attestation headers/claims, audience, nonce, and expiry;
- credential-exchange error mapping;
- SimpleSpace DID provisioning with relative and absolute service ids;
- pinned write error behavior.

Repository verification passed on 2026-07-30:

- `pnpm build`: 10 successful tasks.
- `pnpm test`: 17 successful tasks; the API suite passed 97 files and 968
  tests.

## Non-Goals

- No runtime writer default changes.
- No HTTP/XRPC server or persistence migration.
- No claim that HappyView or PR #5187 is production-ready.
- No local choice between signed-context-plus-HMAC and HMAC-only commits.
- No real notification, oplog, LtHash, CAR, or blob ingestion yet.
- No production attestation signer, key custody, or JWKS publication.

## Next Slice

Implement one proposal/vote read and recovery path behind
`PermissionedRepoPort`: best-effort notifications, periodic `listRepos`,
incremental `listRepoOps`, a replaceable pinned commit verifier, LtHash
comparison, CAR recovery, idempotent projection, and post-verification CSN
membership acceptance. Differential HappyView/PR #5187 runners remain a later
conformance task rather than a condition for this baseline.

**Completed 2026-07-30:** See
`2026-07-30-v12-phase-4-permissioned-proposal-vote-consumer.md`. Runtime
defaults remain unchanged; notification endpoint activation, live upstream
`getRepo`, and public identity/account events remain parked.
