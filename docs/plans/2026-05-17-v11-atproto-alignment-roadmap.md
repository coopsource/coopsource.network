# V11 ATProto Alignment Roadmap

> **Date:** May 17, 2026  
> **Branch:** `codex/v11-atproto-alignment-planning`  
> **Purpose:** Working roadmap for reconciling V11 and Stage 1 with current ATProto ecosystem constraints before moving Stage 1 forward again.

## Context

V11's overall direction is sound: retire V9/V10 workarounds, express membership and roles through spaces/Arbiter-shaped group authority, keep records of authority in ATProto repos or permissioned spaces, and separate generic governance from cooperative-specific semantics.

The risk is that Stage 1 and the architecture documents currently encode several upstream assumptions too early: permissioned-space OAuth scope grammar, permissioned URI scheme, Arbiter XRPC shape, sync/digest mechanics, and the exact way generic governance records should compose with CSN-specific records.

This roadmap treats V11 as directionally right, but tightens its adapter boundaries before more implementation lands.

Primary references:

- AT Protocol Permissions: `https://atproto.com/specs/permission`
- AT URI Scheme: `https://atproto.com/specs/at-uri-scheme`
- AT Protocol Repository: `https://atproto.com/specs/repository`
- AT Protocol Spring 2026 Roadmap: `https://atproto.com/blog/2026-spring-roadmap`
- Permissioned Data Diary 4: `https://dholms.leaflet.pub/3mhj6bcqats2o`
- Permissioned Data Diary 5: `https://dholms.leaflet.pub/3mlegohgtps2k`

## Desired End State

- CSN application code depends on stable internal capabilities, not on unsettled upstream wire details.
- Stage 1 exposes a permissioned-repo sync boundary that can survive changes to notification, cursor, digest, and URI mechanics.
- GovernanceView uses truly generic `community.lexicon.governance.*` records when ecosystem interoperability matters.
- CoopView stores cooperative-specific extensions under `network.coopsource.*` without hiding generic governance data from generic indexers.
- Membership authority remains space/Arbiter-based, but durable member-authored consent evidence is restored.
- Cooperative finance and tax records have a clear canonical owner: cooperative ledger first, member-visible projections second.

## Workstreams

### 1. Architecture Document Alignment

Update V11 docs to distinguish durable commitments from speculative protocol surface:

- Replace `repo:*` examples for permissioned-space writes with clearly speculative examples or neutral language.
- Clarify that `network.coopsource.auth.*` permission sets cannot be assumed to authorize `community.lexicon.*` records.
- Treat permissioned URI scheme and URI type as unsettled; avoid `AtUri` for permissioned-space records.
- Make public Bluesky member lists opt-in and only for cooperatives with public membership.
- Add member-authored consent evidence records as audit evidence, not active membership authority.
- Rework personal-space finance language so cooperative ledgers are canonical and member spaces receive notices/projections.

### 2. Stage 1 Interface Cleanup

Keep the fail-closed Stage 1 package, but reshape its public contracts away from guessed protocol mechanics:

- Replace notification-batch digest assumptions with a repo-state verification abstraction.
- Keep cursors opaque; do not require per-member lexicographic rev ordering outside sketch implementations.
- Add a permissioned URI/location type distinct from `AtUri`, or use structured location fields until upstream finalizes the scheme.
- Prepare the member-list boundary for pagination, snapshots, and revision markers.

### 3. Governance And Coop Record Strategy

Decide when records are generic first versus CSN-specific first:

- For ecosystem-visible governance, write canonical `community.lexicon.governance.*` records.
- Attach CSN-specific fields through `network.coopsource.*` sidecar records by strong ref.
- Keep wrapping as an option only for CSN-private workflows where generic indexability is not a goal.

### 4. Membership, Consent, And Finance Semantics

Separate authority from evidence and ledger state from member-visible copies:

- Active membership authority: `members` space / group-authority adapter.
- Consent evidence: member-authored join/application/signature records.
- Cooperative ledger authority: coop-owned finance/officer records.
- Member visibility: member-space projections, notices, and tax-form delivery artifacts.

### 5. Stale Documentation Cleanup

Before Stage 1 is merged forward again:

- Update `README.md` or mark it as V9-era where it describes bilateral membership and `private_record`.
- Update `packages/lexicons/LEXICONS.md` or mark it as a V9 lexicon snapshot.
- Ensure agent-facing docs do not direct future work back toward retired V9/V10 patterns.

Status on this branch: `README.md` now has V11 target framing, and `packages/lexicons/LEXICONS.md` is explicitly marked as a V9-era snapshot. A full V11 lexicon reference should wait until GovernanceView sidecars and consent evidence lexicons are specified.

## Suggested Sequencing

1. Land this planning branch as a discussion artifact or keep it as a working branch.
2. Update the V11 architecture docs with the high-confidence corrections: OAuth wording, URI typing, public lists opt-in, consent evidence, and finance canonicality.
3. Adjust Stage 1 public interfaces to use stable ports and opaque cursors before adding real upstream adapters.
4. Revisit the Stage 1 merge once docs and interfaces agree.
5. Start Stage 2 through a CSN-backed `GroupAuthorityPort` adapter while upstream Arbiter XRPC remains unsettled.

Status on this branch: Stage 2A has started in `@coopsource/arbiter-client` with `CsnDbGroupAuthorityPort`, `membersSpace()`, and a temporary `roleSpace()` convention. API dispatch now uses that adapter when the spaces consumer is explicitly enabled.

## Acceptance Criteria

- Stage 1 can run with fail-closed sketches without implying final protocol mechanics.
- No public Stage 1 type requires `ats://`, notification-batch digests, or final Arbiter XRPC shape.
- Docs clearly state which atproto dependencies are settled and which are pending upstream.
- Generic governance interoperability is not dependent on consumers unpacking `network.coopsource.*` wrapper records.
- Membership consent and cooperative finance have durable, audit-friendly records with clear ownership.
