# V12 Phase 4 Permissioned Conformance Differential

**Date:** 2026-07-30
**Status:** Implemented checkpoint; runtime defaults unchanged

## Purpose

Make the permissioned-reader compatibility boundary executable against two
named targets without treating either draft as a production standard:

- `bluesky-social/atproto` PR #5187, the Proposal 0016 implementation pin;
- HappyView `2.12.0-dev.2`, the current alternative executable
  interpretation.

The production reader remains pinned to Proposal 0016/PR #5187. The
differential runner is diagnostic. It does not create a hybrid verifier or
silently adapt the production path to HappyView.

## Verified Pins

| Target | Ref | Commit |
| --- | --- | --- |
| atproto PR #5187 | `refs/pull/5187/head` | `3f6c96d5d2d25438bd40fa89d6ecc37865f8e354` |
| HappyView | `v2.12.0-dev.2` | `bf4517c6121839189a2466dd48ec4639364f3b63` |

`git ls-remote` on 2026-07-30 confirmed that both checked-in pins still match
their remote refs. HappyView stable remains `2.11.8`; `2.12.0-dev.2` is the
latest dev tag.

## Differential Findings

| Area | Proposal 0016 / PR #5187 | HappyView 2.12.0-dev.2 | CSN impact |
| --- | --- | --- | --- |
| Repo selector | `repo` | `did` | Target-specific diagnostic request profile required |
| Oplog cursor | `since` revision | opaque `cursor` | HappyView cannot use CSN's current incremental request unchanged |
| Commit | `ver`, `hash`, `mac`, `ikm`, `sig`, `rev` | same except no `sig` | Current verifier correctly fails HappyView closed; V12-S04 remains open |
| `getRepo` | Lexicon exists; handler throws `MethodNotImplemented` | working two-root CAR v1 with unsigned commit root | Neither target currently provides the full Proposal 0016 recovery contract |
| Credential auth on canonical routes | Bearer space credential | the pinned middleware recognizes Bearer space credentials only on legacy `dev.happyview.space.*` routes | Canonical HappyView read calls fail with CSN's current credential |
| Credential exchange | `token` output; bearer delegation token plus `{space, clientAttestation?}` | `delegationToken` output; authenticated call plus `{grant}` | Current CSN issuer is not a HappyView adapter |
| `registerNotify` | `{space, endpoint}` -> `{expiresAt}` | `{space, serviceDid, endpoint}` -> `{id}` | Registration persistence/renewal needs a target adapter |
| `notifyWrite` | `{space, repo, rev, hash}` | `{space, did, collection, rkey, cid}` | Different wake-up and reconciliation semantics |

The HappyView CAR is useful executable evidence for the container structure,
but its unsigned commit cannot be accepted by the Proposal 0016 verifier.
Conversely, PR #5187 supplies the signed commit and notification semantics CSN
targets but cannot yet serve a recovery CAR.

## Implemented Runner

`runPermissionedConformanceProbe` in `@coopsource/spaces-consumer`:

1. calls `listRepos`;
2. calls `listRepoOps` using the selected target's native selector;
3. calls `getLatestCommit`;
4. downloads and inspects `getRepo` as CAR v1;
5. optionally registers notifications.

Requests are sequential and abort-aware. Reports contain target/ref/commit,
HTTP outcomes, media types, observed deviations, and a summary. Authorization
material is never copied into the report. Notification registration is
skipped unless explicitly configured because it mutates target state.

The API CLI is:

```sh
PERMISSIONED_CONFORMANCE_TARGET=atproto-pr-5187 \
PERMISSIONED_CONFORMANCE_SERVICE_URL=https://pds.example \
PERMISSIONED_CONFORMANCE_SPACE_URI=at://did:plc:coop/space/network.coopsource.org.spaceType.members/members \
PERMISSIONED_CONFORMANCE_REPO_DID=did:plc:writer \
PERMISSIONED_CONFORMANCE_AUTHORIZATION='Bearer <credential>' \
pnpm --filter @coopsource/api probe:permissioned-conformance
```

For HappyView, use target `happyview-2.12.0-dev.2` and an exact DPoP
authorization value from a pre-provisioned test session. Enabling registration
also requires
`PERMISSIONED_CONFORMANCE_NOTIFICATION_ENDPOINT` and, for HappyView,
`PERMISSIONED_CONFORMANCE_NOTIFICATION_SERVICE_DID`.

## Executable Evidence

CSN focused verification:

- `@coopsource/spaces-consumer`: 20 files, 115 tests passed.
- `@coopsource/api`: 102 files, 987 tests passed.

Pinned upstream verification:

- HappyView `spaces_repo_state`: 7/7 passed, including
  `commit_has_no_asymmetric_signature`, `get_repo_returns_car_after_write`,
  oplog pagination, and bundled commit tests.
- HappyView `spaces_notify_auth`: 3/3 passed.
- atproto PDS `spaces.test.ts`: 23/23 passed.

These upstream suites execute the checked-out pins in-process. They are
stronger evidence than source inspection, but they are not a deployed,
cross-service OAuth/DPoP exercise. The CLI is ready for that exercise once a
pre-provisioned target, written repo, and short-lived authorization session
exist. No credential is stored in the repository.

## Decisions And Next Work

1. Keep Proposal 0016/PR #5187 as the production reader target and retain
   fail-closed CAR recovery while its `getRepo` handler is unimplemented.
2. Keep HappyView as a differential harness. Do not add a production
   HappyView compatibility adapter without V12-S04 signoff on the unsigned
   commit trust model.
3. Run the authenticated HTTP CLI against both deployed fixtures when
   disposable OAuth/DPoP sessions are provisioned.
4. Do not expose or register CSN's inbound notification endpoint until
   V12-S09 resolves service identity and audience.
5. Continue to managing-app, custody, retention, and migration decisions
   without changing reader or writer defaults.
