# V12 Signoff Register

**Date:** 2026-07-30
**Status:** Open decisions parked without blocking implementation

## Operating Rule

Engineering may complete code behind disabled defaults, replaceable ports, or
explicit feature gates while these decisions are open. It must not activate an
irreversible migration, production trust relationship, or external
communication without the listed signoff.

When individual and cooperative interests conflict, the interim design favors
the cooperative's legitimate governance, continuity, and audit obligations.
That preference never overrides human rights, privacy and due-process rights,
anti-discrimination protections, statutory deletion/correction rights, or
other legal protections. Collect and retain only what is necessary for a
legitimate cooperative purpose.

## Open Signoffs

| ID | Decision | Interim implementation posture | Activation/signoff gate |
| --- | --- | --- | --- |
| V12-S01 | Governance record custody, retention, re-homing, correction, and deletion | Once lawfully accepted into a cooperative governance process, preserve a cooperative-controlled canonical audit record. Represent ordinary withdrawal/correction with append-only superseding state instead of silent history rewriting. Do not implement irreversible retention or denial of a legal rights request. | User plus qualified legal/privacy review before `private_record` ceases to be authoritative or production retention jobs run |
| V12-S02 | Production space authority and host | The cooperative controls its own DID and offline rotation authority. A host may be operated by CSN or an accountable provider, but not controlled solely by a founder/member or an unaccountable application dependency. Keep host choice behind ports. | User signoff on operator, key custody, recovery, portability, and exit plan |
| V12-S03 | Client-attestation signing key and JWKS | Complete claims/signing ports and tests. Do not ship a static secret or filesystem production key. Prefer a rotatable HSM/KMS-backed ES256 signer with published JWKS and audited access. | Security/operations design plus user signoff before app-gated spaces are enabled |
| V12-S04 | Permissioned commit format | Target pinned Proposal 0016/PR #5187 behind a replaceable verifier. The executable differential confirms HappyView `2.12.0-dev.2` omits `sig`; keep it diagnostic and do not create a CSN hybrid. | Upstream convergence or explicit user approval of a temporary interoperability target |
| V12-S05 | Tier 2 writer migration | Keep `private-record` as the runtime default while draft XRPC writes and real reads are incomplete. The read-only governance audit and disabled copy/verification ledger are implemented. Remote rollback remains blocked because the pinned delete input has no conditional-CID precondition. Do not run a live copy or flip the default. | Read/recovery/deletion/rollback evidence plus user signoff |
| V12-S06 | Private moderation and abuse signals | Keep labels and reports inside the permissioned boundary; minimize metadata and provide operator review and appeal paths. Do not emit public labels that reveal private records or membership. | Moderation policy, legal review where required, and user signoff before production |
| V12-S07 | Generic governance vocabulary | Rename cooperative-shaped inputs to group-neutral vocabulary before any external package or Lexicon publication. Internal refactoring may proceed when coherent. | Package contract review; external publication remains separately gated |
| V12-S08 | External publication and ecosystem outreach | Draft material may be prepared in-repo. Do not publish TSC proposals, forum feedback, protocol claims, or organizational announcements. | Explicit user approval of the exact outward-facing text and venue |
| V12-S09 | Inbound permissioned notification identity and audience | Keep periodic reconciliation as the correctness path. Do not register or expose an inbound notification endpoint while the pinned URL-derived service identity conflicts with CSN's DID-audience service-auth verifier. Do not invent a weaker hybrid. | Upstream contract convergence or explicit user approval of a pinned temporary target plus security review |
| V12-S10 | Managing-app callback activation | Keep `checkUserAccess` unregistered by default. The disabled CSN adapter authorizes only fresh, complete, strictly resolved members of the requested CSN space, binds the verified caller to that space's authority DID, and fails closed. | User signoff on the exact service identifier, trusted authority set, operator/availability posture, authority-key lifecycle, membership correction/appeal handling, and alignment with V12-S02 |
| V12-S11 | Cooperative membership acquisition policy | Keep public discovery read-only and admission invite-only. Do not imply that a person can unilaterally join a cooperative. A request flow may be implemented behind a disabled default with cooperative review, expiry, reason, correction, and appeal seams. | User signoff on invite/request/open modes, reviewer authority, applicant privacy, denial/appeal handling, and legal/anti-discrimination review |
| V12-S12 | Phase 7 information architecture and visual direction | Repair defects, responsiveness, accessibility, contracts, and tests. A parallel route map or theme may be implemented behind a disabled default, but keep the current default until review. | User review of the route map plus representative desktop/mobile screens; explicit selection before default activation |
| V12-S13 | Network governance and agreement authority | Keep the network workspace roster-only and require verified membership by the active cooperative. Do not display the signed-in cooperative's governance or agreements as network records. Target-scoped reads and writes may be implemented behind a disabled default only after the authority seam fails closed. | User signoff on which cooperative actors may represent a network, member-cooperative read/write eligibility, delegation and revocation, visibility, correction/appeal, and alignment with V12-S01/V12-S02 |

## Implemented But Not Activated

- Proposal 0016 source pins and method contracts.
- DID-based authority service/key resolution.
- Client-attestation provider and deterministic signer boundary.
- Narrow SimpleSpace manager scopes.
- Draft XRPC record writer and live exercise.
- Draft XRPC proposal/vote reader, LtHash/commit verification, CAR and blob
  verification, durable replica/checkpoint state, and idempotent API
  projection.
- Public identity/account event ingestion with host-scoped durable account
  state, immediate replica invalidation, and non-destructive unattributed
  event handling.
- Pinned atproto/HappyView differential profiles plus a non-destructive by
  default, abort-aware conformance CLI. Notification registration is the
  explicit mutating opt-in.
- Named governance record placement port for public repositories and
  permissioned spaces. The CSN adapter preserves existing open/mixed/closed
  behavior, and `private-record` remains the default physical writer.
- Generic managing-app access policy port and a disabled-by-default
  service-authenticated `checkUserAccess` route. The CSN adapter uses strict
  group-directory membership and exposes only the draft boolean response.
- Read-only Tier 2 governance migration-readiness audit. It reconciles
  permissioned projection references and private sources without payload
  output, remote writes, local deletion, or a writer-default change.
- Disabled Tier 2 governance copy/verification command and payload-free
  durable ledger. No live copy, projection change, source deletion, remote
  rollback, or writer-default change is approved.

These are engineering checkpoints, not approval of the production authority,
custody, retention, moderation, or migration model.
