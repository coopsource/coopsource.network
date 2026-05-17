# V11 Stage 1 ATProto Design Review

> **Date:** May 11, 2026  
> **Scope:** Review of V11 architecture and the Stage 1 spaces-consumer branch at `7a08d79`  
> **Context:** This review was performed from the workspace after the Stage 1 branch had been merged into local `main`. It therefore reviewed the Stage 1 implementation as present at merged HEAD, not a clean pre-Stage-1 main checkout.

## Summary

The V11 direction is broadly right: remove V9/V10 workarounds, keep authority in DIDs and ATProto records, use spaces/Arbiter-style membership as the access substrate, and isolate cooperative-specific rules above a generic governance layer.

The main concern is that the design currently treats several still-unsettled permissioned-data details as if they were current atproto interfaces. Stage 1 should keep the abstraction boundaries, but avoid committing public types or examples that assume final OAuth scope grammar, permissioned URI scheme, digest shape, or Arbiter XRPC behavior.

Primary references:

- AT Protocol Permissions: `https://atproto.com/specs/permission`
- AT URI Scheme: `https://atproto.com/specs/at-uri-scheme`
- AT Protocol Repository: `https://atproto.com/specs/repository`
- AT Protocol Spring 2026 Roadmap: `https://atproto.com/blog/2026-spring-roadmap`
- Permissioned Data Diary 4: `https://dholms.leaflet.pub/3mhj6bcqats2o`
- Permissioned Data Diary 5: `https://dholms.leaflet.pub/3mlegohgtps2k`

## Critical Feedback

1. **Do not model permissioned-space writes as current `repo:*` OAuth scope writes.**

   `ARCHITECTURE-V11.md` uses examples like `repo:network.coopsource.governance.vote?action=create` for votes in permissioned spaces. Current atproto permission docs describe `repo` as public repository write access. The permissioned-spaces OAuth seam is still a design topic. Stage 1 and Stage 2 should describe this as a pending space-permission resource shape, not as settled `repo:*` syntax.

   Recommended change: replace examples that imply `repo:*` writes to permissioned repos with placeholder `space:` or `permissions:{nsid}` examples clearly labeled speculative, and keep code errors generic: OAuth scope missing, space membership missing, app not authorized for space.

2. **Be careful with `network.coopsource.auth.*` permission sets.**

   The architecture proposes CSN permission sets such as `network.coopsource.auth.member`, while generic governance is under `community.lexicon.governance.*`. Atproto permission sets are namespace-scoped. A `network.coopsource.*` permission set should not be assumed to authorize `community.lexicon.*` records.

   Recommended change: plan for separate permission sets per namespace, or explicit multi-scope OAuth requests. Do not make a CSN permission set the generic GovernanceView authorization contract.

3. **Wrapped generic governance records are not fully ecosystem-native records.**

   V11 proposes `network.coopsource.governance.vote` containing a `generic` object that conforms to `community.lexicon.governance.vote`. That is useful for CSN, but generic indexers looking for records in the `community.lexicon.governance.vote` collection will not naturally see wrapped CSN records as first-class generic governance records.

   Recommended change: when ecosystem indexing matters, make `community.lexicon.governance.*` the canonical record collection and attach cooperative-specific sidecars by strong ref. Use wrapped CSN records only when the intended audience is CSN-specific.

4. **OAuth consent should not replace durable member-authored join evidence.**

   The architecture says OAuth consent is equivalent to the old member-side membership record for consent capture. OAuth grants app-to-user authority; they are not durable member-to-cooperative agreements and may not be available to external auditors or future AppViews.

   Recommended change: keep the Arbiter `members` space as the active membership authority, but add member-authored join/application/agreement records as evidence. This does not revive bilateral membership as state authority; it restores user-authored consent as a record.

5. **Personal spaces are too broad as the canonical store for cooperative finance.**

   The architecture places patronage allocations, capital accounts, 1099-PATR forms, and related data in per-(coop, member) personal spaces. That blurs record ownership. A capital account or patronage allocation is a cooperative ledger fact about a member, not purely a member-owned personal record.

   Recommended change: make coop-owned officer/finance ledger records canonical, publish member-visible projections or notices into member spaces, and keep public non-identifying anchors for auditability.

6. **Stage 1 digest verification should avoid assuming notification-batch digests.**

   `SpaceNotification.digest` and `EcmhVerifier.verify({ records, expectedDigest })` currently frame the digest as a digest over records announced by a notification. The permissioned-data diaries frame ECMH as a permissioned repo commitment, with full-repo resync when oplog state falls behind. The exact wire shape is not final.

   Recommended change: rename and shape the verifier around repo-state verification, for example `CommitVerifier` or `PermissionedRepoVerifier`, with inputs that can support current-rev, previous-rev, full repo state, or oplog replay. Avoid encoding "notification batch digest" into the public interface.

7. **Permissioned-space records need a type distinct from `AtUri`.**

   `PulledRecord.uri` currently uses `AtUri`, and common types define `AtUri` as `at://did/collection/rkey`. Diary 5 is explicit that permissioned URIs should not be `at://`, with `ats://` only a leading candidate.

   Recommended change: introduce `PermissionedUri` or `SpaceUri`, or keep the record location structured as `{ space, authorDid, collection, rkey }` until the scheme is finalized. Do not reuse `AtUri` for permissioned data.

8. **Public Bluesky member lists should be opt-in.**

   The architecture suggests maintaining `app.bsky.graph.list` member lists. That conflicts with the privacy goal of moving membership to permissioned spaces.

   Recommended change: only maintain public member lists for cooperatives that explicitly choose public membership. For closed or mixed-membership cooperatives, publish only aggregate anchors.

## Stage 1 Implementation Notes

- `SpaceRef = { arbiter, type, skey }` is the right internal substrate. Keep it.
- The fail-closed sketches are good. They prevent accidental production data flow before real upstream adapters exist.
- The `ArbiterMemberList` interface is useful, but it should eventually support pagination, snapshots, and membership proofs or revision markers. A full `list(space): DID[]` is fine for tests, but probably not enough as the real adapter boundary.
- The cursor model currently assumes per-member rev ordering. That may survive, but the real protocol may expose space-level revs, member-repo revs, or oplog cursors. Keep cursor storage opaque and avoid relying on lexicographic string comparison outside the sketch implementation.
- The current README is clear about sketches versus real implementations. Keep that clarity in Stage 2.

## Recommended Alternative Shape

Use a smaller set of stable ports:

- `GroupAuthorityPort`: abstracts Arbiter/spaces membership, role spaces, recursive membership, member-list snapshots, and strict reads.
- `PermissionedRepoPort`: abstracts pull/resync/verify for permissioned repos without exposing ECMH or notification assumptions to application code.
- `GovernanceRecordPort`: writes and reads canonical `community.lexicon.governance.*` records when ecosystem interoperability is desired.
- `CoopExtensionPort`: writes CSN sidecars and cooperative-specific records under `network.coopsource.*`.
- `ConsentEvidencePort`: stores member-authored join, signature, and agreement evidence separately from active membership authority.

This keeps V11 aligned with atproto while allowing Arbiter, URI scheme, OAuth-spaces auth, and sync mechanics to change underneath.

## Documentation Cleanup Before Moving Forward

Several docs described V9 behavior and needed explicit V11 framing:

- `README.md` centered bilateral membership and PostgreSQL `private_record`.
- `packages/lexicons/LEXICONS.md` described V9 record ownership, `VisibilityRouter`, and bilateral membership.

This branch updates `README.md` with V11 status/target framing and marks `packages/lexicons/LEXICONS.md` as a V9-era snapshot. A full V11 lexicon reference remains future work after the governance/community lexicon strategy settles.
