# V11 Substrate Pre-Merge Review — Findings

**Date:** 2026-07-04
**Scope:** `git diff main...codex/v11-atproto-alignment-planning` (116 files: new `packages/spaces-consumer` + `packages/arbiter-client`, `apps/api` membership rewiring, consent-evidence verifier, DB baseline).
**Method:** 8 independent finder angles → dedup to 12 candidates → 1 adversarial verifier each (3-state). Plus a second line-scan pass (4 unverified candidates). This review gated the Phase 0 merge to `main`.

## Verdict tally

12 verified candidates: **7 CONFIRMED, 4 PLAUSIBLE, 1 REFUTED**. Two fixed before merge; the rest are tracked (below) into the V12 plan phases because they are flag-gated-off substrate, intended consequences of the V11 migration, or membership-completion work — none is a live exploit except the one fixed.

## Fixed before merge

| ID | Severity | Finding | Fix (commit) |
|---|---|---|---|
| **V1** | **Critical (live)** | `/api/v1/federation/membership/approve` verified member consent but never bound the caller to authority over the target cooperative. `fedAuth` skips signature checks when a local session exists; the handler ignored `federationSender`/`session.did` and hardcoded `actorDid` to the body's `cooperativeDid`. **Working exploit:** any self-registered member (role `member`) could POST approve and grant themselves `roles/board`+`roles/treasurer` in any cooperative. | `5724b75` — Axis-2 gate before any mutation: caller (verified peer signer or session subject, never a body field) must be the coop DID itself or hold active owner/admin; else 403 naming the axis. Regression test added (403 for non-owner, existing owner-approves 201 preserved). |
| **A2-3** | Low (data integrity) | add-member audit `newValue.directoryVisible` defaulted to `true` while the insert defaults to `false` → immutable `fact_log` misrecorded a new member's visibility. Adjacent to the `f28ac29` opt-in default fix. | `d1ee942` — align the audit fallback to `false`. |

Also fixed earlier in Phase 0 (green-build gate, pre-review): DDL bootstrap (`bff93bd`), nested-transaction crash + directory-visible opt-in default (`f28ac29`), api/federation test serialization (`39dd21d`).

## Tracked — not merge blockers (mapped to V12 phases)

### Membership-completion work → **Phase 3**

- **V3 — CONFIRMED — suspension is unreachable.** V9's `indexMemberApproval` delete branch was the only writer of `status='suspended'`; it is now a no-op and `GroupMutationPort` has no suspend op, while `governance-labeler`'s `member-suspended` label and vote-eligibility still assume it. → Phase 3 adds a suspend/reinstate mutation to the port (or formally retires label-based suspension). Functional gap, not a live bug.
- **V5 — CONFIRMED — `member.joined`/`member.departed` (and `member.approved`) have zero emitters** while still advertised in `EVENT_CATALOG` and the web `TriggerPanel`. Webhooks/agent-triggers/SSE dashboards silently never fire on join/depart. → Phase 3 emits lifecycle events from the membership write path (all `addMember`/`removeMember` callers). Real regression; deferred because correct emission spans setup/auth/network/federation call sites and belongs with the read-seam work.
- **V10 — CONFIRMED (scoped) — firehose `indexMemberConsent` overwrites the join-verified consent pointer** with an unverified self-published `memberConsent` record. Bounded to the attacker's own membership rows (`member_did = event.did`) → evidence-integrity defect, not privilege escalation. → Phase 3 verifies consent evidence (or refuses firehose overwrites of a verified pointer) in the indexer.
- **V6 — PLAUSIBLE (cause misattributed) — cross-instance memberships don't materialize in a hub projection.** Real symptom, but it's the documented interim state of the log-only spaces consumer, and the finder's suggested fix (restore the V9 firehose insert) would violate the arbiter-is-source-of-truth pitfall. → resolved naturally when Phase 3 wires the spaces consumer to project cross-checked members.
- **Read-seam is half-drawn (altitude):** writes go through `GroupMutationPort`, ~35 read sites still hit `membership`/`membership_role` directly, and filters already diverge (`listMembers` shows non-active members; `network-service` and the coop-profile count require `status='active'`). → Phase 3 introduces a read port and unifies the active/invalidated filter.
- **A2-1 (unverified) — `indexMemberConsent` delete branch filters `member_record_cid = event.cid`, but the firehose sets `cid=''` on deletes** → the pointer is never cleared, projection goes stale. → Phase 3 indexer hardening (verify against the firehose decoder's delete-op shape).
- **A2-2 (unverified) — dead `event.prevCid` branch** (decoder never populates it); **A2-4 (unverified) — `memberCrossCheckFailures` conflates expected non-member drops with real resolution failures** (breaks alerting). → Phase 3 metric/branch cleanup.
- **V2 — CONFIRMED but likely intended — invitation redemption goes straight to `active`** with the invitation's `intended_roles`, removing V9's pending→approve checkpoint; a leaked token yields an immediately-active member (elevated iff the invite carried elevated roles). Both redemption paths do this, so it reads as deliberate V11 design. → **flagged for user decision** in Phase 3: is the approval checkpoint intentionally gone, or should invited members land pending?

### Substrate correctness (flag-gated off today) → **Phase 3**

- **V4 — CONFIRMED — `CsnDbGroupDirectoryPort.resolveSpaceMembers` truncates at `pageSize` (5000) but hardcodes `partial:false`/`stale:false` and ignores `consistency:'strict'`.** For a >5000-member coop the consumer cross-checks against a silently partial list (member #5001's records rejected as not-member) and the fail-closed-on-partial guard can never trip. Inert now (consumer gated off, `spaces:[]`). → Phase 3: compute `partial` from truncation and honor `strict`. Small, load-bearing.
- **V9 — PLAUSIBLE — the consumer's accept path compares DIDs by raw equality, no `did_rotation_history`** (CLAUDE.md pitfall #10). Deliberately Stage-3-deferred per `schema.ts`, flag-gated off, log-only. → Phase 3 gate before flipping the flag.

### Cleanup → **Phase 2** (drift alignment)

- **V12 — PLAUSIBLE (no bypass) — three divergent AT-URI parsers** (`consent-evidence-verifier` regex, `common/uri.ts`, `federation` split-based). The strict regex gates the consent check before the resolver re-parses, so the authority-DID check is not exploitable — but consolidation is already Phase 2's `space-uri.ts`/canonical-helper task; fold all three onto it. Note `federation`'s `parts[2]!` is a latent crash at other call sites.
- **V11 — PLAUSIBLE (no collision) — orphaned older port set** (`RepoPuller`, `NotificationSubscriber`, `ArbiterMemberList`, `EcmhVerifier`, `KyselyCursorStore`) with zero consumers; two cursor stores write `spaces_consumer_cursor` with disjoint `member_did` conventions (sentinel prevents PK collision). Dead-code cleanliness. → Phase 2 deletes the superseded set (or folds it into the stable ports); pairs with the `EcmhVerifier`→`CommitDigestVerifier` rename.
- **Reuse/simplify (unverified finder candidates):** `consent-evidence-verifier` should take `IClock` not `() => Date`; hand-rolled cursor codecs duplicate `pagination.ts`; dead `indexMemberApproval` stub; unused `GroupMutationContext` re-inlined 7×; `roleResult` positional-boolean tail; `normalizeRoleSpaceKey` dead `custom/` branch; audit-envelope duplication across 5 mutating methods. → Phase 2/3 cleanup as the files are touched.

### Dormant → **Phase 6 (Stage 8 retirement)**

- **V8 — CONFIRMED but dormant — `HttpFederationClient.approveMembership` sends `{cooperativeDid, memberDid, roles}`** but the server schema now requires `consentRecordUri`+`consentRecordCid` (sibling `requestMembership` was updated, approve wasn't). The client is unwired; it 400s only if re-mounted. Retires in Phase 6 anyway; if re-wired sooner, add the consent fields.

### Refuted

- **V7 — REFUTED — role-update 404 regression has no reachable trigger.** `setMemberRoles` requires `status='active'`, but V11 never creates a non-active/non-invalidated membership row (every writer sets active, or departed+invalidated), so the filter is redundant, not divergent. Latent only if a future flow introduces a live non-active state.

## Cross-cutting note

Several findings share one root: the membership authority seam is deliberately half-migrated — writes flow through `GroupMutationPort`, reads and events do not, and consent is verified at some entry points but stored/overwritten unverified at others. V12 Phase 3 ("arbiter convergence + membership reads through the port") is where this converges; this report front-loads its task list. The one thing that could not wait — a caller-authority gate on a mutating federation endpoint — is fixed.
