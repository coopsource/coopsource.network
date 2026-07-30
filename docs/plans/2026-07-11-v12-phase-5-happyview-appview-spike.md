# V12 Phase 5 HappyView AppView Substrate Spike

**Date:** 2026-07-11
**Decision:** Keep the custom `apps/api` AppView. Use HappyView as a
permissioned-spaces reference/harness and lexicon compatibility smoke target,
not as CSN's application substrate.

## July 30 Update

The July 11 decision still holds. Stable HappyView moved through `2.11.8`, and
`2.12.0-dev.1`/`.2` followed Permissioned Data Diary 7 with real CID, CBOR,
attestation, and backfill changes. The dev line also removed the signed-commit
field while pinned Proposal 0016 and atproto PR #5187 still use a signed
context plus HMAC. HappyView is therefore more valuable as an independent
differential target, but less suitable as the sole protocol oracle.

The announced HappyView v3 TypeScript/Rust/Lua plugin model may improve future
extension fit. No released v3 contract currently supplies CSN's query
semantics, typed governance plugin composition, transactional projections, or
fail-closed acceptance gates. Revisit only against a released, exercisable
plugin API.

For current release details and source links, see
`docs/plans/2026-07-29-atproto-permissioned-spaces-research-report.md`.

## Question

Can current HappyView replace CSN's TypeScript/Express AppView without moving
cooperative policy below the `GovernancePluginSet` boundary or rewriting the
existing Postgres projection and application-service model?

The Phase 5 spike tested the newest release available on the test date:

- HappyView `2.11.4`, release commit
  [`a3233cca`](https://github.com/gamesgamesgamesgamesgames/happyview/tree/a3233cca5e80a52f2a49261bbb3ee0a1f3d3e9f9)
- Published multi-architecture image
  `ghcr.io/gamesgamesgamesgamesgames/happyview:2.11.4`
- Image digest
  `sha256:5ae02e2905a961f4f88542d4dee95af79f38a2100b8bf23aec79b9366ae2b2e1`

This exceeds the program plan's HappyView 2.10+ decision gate.

## Exercise

A clean local HappyView instance ran on SQLite with historical backfill
disabled. A temporary, scoped admin API key was seeded after HappyView's normal
migrations so the non-interactive exercise could use the same
`POST /admin/lexicons` handler as the dashboard. No HappyView dependency or
configuration was added to CSN.

The upload set contained:

| Lexicon kind      | Canonical | Community draft | Uploaded |
| ----------------- | --------: | --------------: | -------: |
| Record            |        41 |               6 |       47 |
| Query             |         8 |               0 |        8 |
| Space declaration |         3 |               0 |        3 |
| **Total**         |    **52** |           **6** |   **58** |

All 58 documents returned `201 Created`. This is useful compatibility evidence
for HappyView's lexicon registry and confirms that its current parser accepts
CSN's three Proposal 0016-style `type: space` declarations. It is not evidence
that the generated endpoints implement CSN semantics: HappyView's registry
parser classifies `defs.main.type` and preserves the raw document but does not
fully validate every schema constraint during upload.

The eight query lexicons initially loaded without HappyView-specific
`target_collection` metadata. A live request to
`network.coopsource.governance.listProposals` then returned:

```text
400 network.coopsource.governance.listProposals has no target_collection configured for list queries
```

After each query was re-uploaded with a plausible backing collection, all eight
routes were active. Four representative requests returned `200` with the same
generic body:

```json
{ "records": [] }
```

That body violates the uploaded output contracts. For example,
`listProposals` requires `proposals`, `getProposal` requires a hydrated proposal
and tally, `getVoteEligibility` requires `eligible`, `weight`, and `hasVoted`,
and `listMembers` requires `members`. The default query handler also only gives
special meaning to `uri`, `did`, `limit`, and `cursor`; CSN parameters such as
`cooperative`, `id`, and `proposal` need custom logic.

## Extension Fit

HappyView provides two extension mechanisms, but neither is a drop-in host for
the ten-plugin contract.

### Lua

[Lua XRPC scripts](https://github.com/gamesgamesgamesgamesgames/happyview/blob/a3233cca5e80a52f2a49261bbb3ee0a1f3d3e9f9/packages/docs/content/docs/guides/lua-scripting.md)
can replace one query or procedure route at a time. Record and job triggers can
also maintain projections or run background work. The ten plugin fields would
therefore be distributed approximately as follows:

| Plugin concern                                          | HappyView placement required                                                                               |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `voteWeight`, `eligibility`, `quorum`, `delegateChains` | Repeated XRPC scripts plus shared custom tables or HTTP calls                                              |
| `actionAuthorizer`                                      | Repeated procedure/query scripts; it would not automatically cover CSN's non-XRPC route and service guards |
| `anchorSummary`, `meetingMinutes`                       | Record scripts and/or query scripts                                                                        |
| `historicalState`                                       | Record/job scripts plus durable custom storage                                                             |
| `patronageAllocator`, `surplusDistributor`              | Procedure/job scripts plus fiscal and capital-account projections                                          |

That is a rewrite of the typed, shared TypeScript policy boundary, not an
adapter. Keeping the current API as an HTTP sidecar called from Lua would retain
the API while adding another routing, authentication, deployment, and failure
boundary; it would not replace the substrate.

There is also a security mismatch. HappyView's incoming record path checks that
a claimed CID matches record content, but it stores tracked records without
automatic full lexicon validation. Validation can be scripted, yet the
[record-script runner](https://github.com/gamesgamesgamesgamesgames/happyview/blob/a3233cca5e80a52f2a49261bbb3ee0a1f3d3e9f9/src/lua/scripts.rs#L325)
retries and then deliberately fails open by indexing the original record. CSN
requires fail-closed schema, identity, author, and group-membership checks at
the AppView boundary.

### WASM

HappyView's current
[WASM plugin ABI](https://github.com/gamesgamesgamesgamesgames/happyview/blob/a3233cca5e80a52f2a49261bbb3ee0a1f3d3e9f9/packages/docs/content/docs/guides/developing-plugins.md)
is an external-account authentication and synchronization API. Its required
exports are authorization, callback, token refresh, profile, and account sync
functions. It is not an arbitrary XRPC, record-indexing, authorization, or
application-service plugin ABI, so the ten-plugin set cannot live there without
forking HappyView.

## Decision

Keep `apps/api` as the CSN AppView substrate.

1. The 58-schema load confirms HappyView is a useful compatibility target.
2. Generated route existence does not provide CSN query semantics or output
   contracts; eight of eight queries require custom behavior.
3. The cooperative plugin set, command services, and 103-table
   application/projection schema would need to be rewritten into trigger-scoped
   Lua and custom storage.
4. HappyView's current WASM ABI does not host application policy.
5. Its default/fail-open record indexing posture cannot satisfy CSN's
   fail-closed AppView requirements without a material fork.

Continue using HappyView 2.10+ for the separate spaces harness decision. Its
experimental `com.atproto.space.*` / `com.atproto.simplespace.*` implementation,
space declarations, LtHash state, oplog, credentials, and notifications remain
valuable for the outstanding live Phase 4 exercise. This spike did not complete
that OAuth-dependent end-to-end space exercise.

## Cleanup And Reproduction Notes

The test container, temporary SQLite volume, and scoped key were removed after
the exercise. Reproduction requires an interactive first-admin OAuth login or
an equivalent disposable-instance bootstrap before calling the documented
admin API. Upload record and space lexicons with `backfill: false`; query
lexicons additionally need HappyView-specific `target_collection` values.

Primary references:

- [HappyView 2.11.4 release](https://github.com/gamesgamesgamesgamesgames/happyview/releases/tag/v2.11.4)
- [Lexicon behavior](https://github.com/gamesgamesgamesgamesgames/happyview/blob/a3233cca5e80a52f2a49261bbb3ee0a1f3d3e9f9/packages/docs/content/docs/guides/lexicons.md)
- [Permissioned spaces](https://github.com/gamesgamesgamesgamesgames/happyview/blob/a3233cca5e80a52f2a49261bbb3ee0a1f3d3e9f9/packages/docs/content/docs/experimental/spaces/index.md)
