# ARCHITECTURE-V5.md — Full ATProto Ecosystem Citizen with Cooperative Lifecycle

> **Replaces**: ARCHITECTURE-V4.md + V4 Addendum
> **Approach**: Full ATProto ecosystem citizen with comprehensive cooperative lifecycle management
> **Date**: March 6, 2026
> **Status**: Implementation-ready
> **Author**: Synthesized from V4 Deep Research, V4 Addendum, independent research, and codebase gap analysis

---

## Executive Summary

Co-op Source Network V5 consolidates V4's ATProto-native architecture with three critical expansions: a fully specified bilateral membership protocol, a comprehensive security model, and complete cooperative legal/administrative lifecycle management. V5 also incorporates independent research findings on cooperative governance software gaps, platform cooperativism infrastructure needs, and federation security best practices.

The V4 vision remains the foundation: every cooperative is a genuine ATProto account, members bring their own Bluesky identities, governance records flow through the real relay network. V5 refines that vision with implementation-grade specificity informed by the actual codebase state (26,500 lines across 280 files, 50+ database tables, 11 services, 22 lexicons) and current ATProto ecosystem maturity as of March 2026.

**What V5 adds beyond V4:**

1. **Implementation-grade bilateral membership protocol** — full OAuth flow, out-of-order record handling, revocation semantics, and AppView state machine specification
2. **Comprehensive security audit** — identity attacks, membership protocol attacks, firehose/relay attacks, governance attacks, private data attacks, with concrete mitigations
3. **Legal and administrative cooperative artifacts** — foundational documents, compliance tracking, officer records, fiscal period management, and digital signatures with legal enforceability
4. **Gap analysis against actual codebase** — identifies exactly what exists, what changes, what gets retired, and what's new, mapped to the real file structure
5. **Expanded cooperative feature set** — onboarding workflows, multi-stakeholder governance, financial tools (patronage calculation, capital accounts), compliance automation
6. **Updated ATProto ecosystem intelligence** — Tap production status, Auth Scopes partial rollout, Buckets still in design, HappyView production-ready, IETF standardization active

---

## Table of Contents

1. [Philosophical Foundation](#1-philosophical-foundation)
2. [Cooperative Identity on ATProto](#2-cooperative-identity-on-atproto)
3. [Members Bring Their Own Identity](#3-members-bring-their-own-identity)
4. [Bilateral Membership Join Protocol](#4-bilateral-membership-join-protocol)
5. [The Public/Private Boundary](#5-the-publicprivate-boundary)
6. [Ecosystem Composability](#6-ecosystem-composability)
7. [Infrastructure Architecture](#7-infrastructure-architecture)
8. [Security Model](#8-security-model)
9. [Legal and Administrative Lifecycle](#9-legal-and-administrative-lifecycle)
10. [Cooperative Financial Tools](#10-cooperative-financial-tools)
11. [Member Onboarding and Lifecycle](#11-member-onboarding-and-lifecycle)
12. [Open vs Closed Cooperative Patterns](#12-open-vs-closed-cooperative-patterns)
13. [Lexicon Design](#13-lexicon-design)
14. [Codebase Gap Analysis](#14-codebase-gap-analysis)
15. [Phased Migration Plan](#15-phased-migration-plan)
16. [Data Sovereignty and Compliance](#16-data-sovereignty-and-compliance)
17. [ATmosphereConf 2026 and Community Strategy](#17-atmosphereconf-2026-and-community-strategy)
18. [Appendix: Key Resources](#appendix-key-resources)

---

## 1. Philosophical Foundation

### From Pattern-Aligned to Ecosystem Citizen

Dan Abramov's "social filesystem" metaphor captures the V5 philosophy: each user's PDS repo is a personal folder in a distributed filesystem, and each ATProto app is a CMS for a subset of that data. When a member votes on a cooperative proposal, that vote lives in their repo alongside their Bluesky posts, Smoke Signal RSVPs, and WhiteWind blog entries. The cooperative's AppView indexes votes from across the network to compute outcomes.

V3 treated ATProto as an implementation detail to wrap in an interface. V4 declared the shift to ecosystem citizen. V5 operationalizes that shift with implementation-grade specifications while expanding scope to the full cooperative lifecycle.

### The Recursive Cooperative Model (Preserved)

The recursive cooperative model remains the central design principle from V3: everything is an entity (person or cooperative), and a network is just a cooperative whose members are other cooperatives. No special type needed. Same membership, governance, and agreement machinery works at every level. V5 extends this by adding legal entity types (cooperative corporation, cooperative LLC, LCA) and compliance workflows that also follow the recursive pattern.

### What Cooperatives Gain from Going All-In on ATProto

The ICA's seven cooperative principles map naturally onto ATProto's architecture:

- **Voluntary membership** becomes portable identity — a member can leave one cooperative and join another without losing their history
- **Democratic control** becomes public governance records verifiable by anyone
- **Member economic participation** becomes auditable patronage records with cryptographic integrity
- **Autonomy** becomes self-hosted PDS instances under the cooperative's domain
- **Education and training** becomes discoverable onboarding content and training records
- **Cooperation among cooperatives** becomes cross-app composability through shared lexicons
- **Concern for community** becomes transparent public governance visible to the entire network

### Platform Cooperativism Alignment

The Platform Cooperativism Consortium's "Solidarity Stack" framework (2025) aligns directly with V5's architecture: cooperative data centers, federated infrastructure, bottom-up governance, and locally anchored but globally linked systems. Co-op Source Network positions itself as the governance layer of this stack — the platform that cooperatives use to manage their organizational lifecycle while participating in the broader ATProto ecosystem.

---

## 2. Cooperative Identity on ATProto

### How Cooperatives Get ATProto Accounts

A cooperative is an ATProto account with a DID, a handle, a signing key, and a PDS that hosts its repo. The cooperative's repo contains its profile, governance records, agreements, and organizational data.

**Recommended identity configuration:**

| Component | Choice | Rationale |
|---|---|---|
| DID method | `did:plc` | Portable, recoverable (72-hour rotation window), ecosystem standard |
| Handle | Domain-as-handle (e.g., `@mycoop.coop`) | Professional, verifiable, ties identity to cooperative's web domain |
| PDS | Self-hosted `@atproto/pds` (v0.4.212+) | Full control over organizational data, key management, multi-user access |
| Signing key | ECDSA P-256 | Already implemented in codebase via `did-manager.ts` |

**Why not did:web for production**: While `did:web:mycoop.coop` ties identity directly to the domain, it lacks recovery mechanisms — if the domain is lost, the identity is gone. `did:plc` with domain-as-handle provides the same branding with the safety net of rotation keys. However, the codebase currently uses `did:web` for standalone development, and this remains correct for local dev.

**Transition strategy**: The existing `LocalPlcClient` generates local DIDs. The existing `PlcClient` is an HTTP client for real `plc.directory`. V5 activates the `PlcClient` for production while preserving `LocalPlcClient` for standalone development.

### Multi-User Access to the Cooperative Account

A cooperative is not a single person. Multiple operators need to write records to the cooperative's repo. Rather than forking `@atproto/pds`, implement a thin auth proxy between the cooperative's web UI and the PDS:

1. Proxy authenticates operators via the cooperative's existing auth system
2. Applies internal ACL checks (admin, board-member, staff, member)
3. Proxies authorized writes to the PDS using the cooperative's admin credentials
4. Internal audit log tracks which human authored each operation
5. The network sees a single identity — the cooperative DID

This maps to the dwddao multi-user auth proposal and Brittany Ellich's opensocial.community pattern.

### Relationship to opensocial.community

Brittany Ellich's opensocial.community implements a working group-as-DID model that validates V5's approach:

- Groups are real ATProto accounts with portable data
- Membership records live in the member's own repo
- Multiple AppViews can interact with group data
- No accept/reject flow — groups use open-join with moderation via labelers

Co-op Source Network extends this model with: bilateral consent (both sides must write records), private governance deliberations, legally binding agreements, role-based authority, and financial operations.

---

## 3. Members Bring Their Own Identity

### The "Write to Your Own PDS" Model

Members use their existing ATProto identities. When a member joins a cooperative, they write a `network.coopsource.org.membership` record to their own PDS. The cooperative's AppView discovers this record via the firehose and indexes it.

**How it works for a member on bsky.social:**

1. Member visits the cooperative's web UI
2. Member authenticates via ATProto OAuth (existing `oauth-client.ts`)
3. DPoP-bound access token grants write access to the member's repo
4. The cooperative's API writes `network.coopsource.org.membership` to the member's repo
5. The record appears in the network firehose within seconds
6. The cooperative's AppView (via Tap) indexes the new membership record
7. A cooperative operator reviews and writes `network.coopsource.org.memberApproval`
8. AppView sees both records → membership status = active

**Critical fact**: The PDS is lexicon-agnostic. It stores any record with a `$type` field. bsky.social-hosted accounts can hold `network.coopsource.*` records alongside `app.bsky.*` records without any special arrangement.

### Auth Scopes Status (March 2026)

ATProto Auth Scopes are partially shipped. Granular permissions are rolling out on bsky.social but final specifications and developer resources are not yet published. The cooperative's OAuth client should:

- **Now**: Request `atproto` + `transition:generic` (broad permissions)
- **When available**: Migrate to collection-level scopes for `network.coopsource.*` only
- **Implementation**: The existing `oauth-client.ts` uses `@atproto/oauth-client-node` with DPoP — upgrade path is straightforward

### Record Ownership Split

| Record type | Written by | Stored in | Rationale |
|---|---|---|---|
| `org.membership` | Member | Member's repo | Member controls their own membership declaration |
| `org.memberApproval` | Cooperative | Cooperative's repo | Cooperative controls role assignments and approval |
| `governance.vote` | Member | Member's repo | Votes are personal acts |
| `governance.proposal` | Proposer | Cooperative's repo | Proposals are organizational records |
| `governance.delegation` | Delegator | Member's repo | Delegation is a personal choice |
| `agreement.signature` | Signer | Member's repo | Signatures must be under signer's control |
| `agreement.master` | Cooperative | Cooperative's repo | Master agreements are organizational records |
| `legal.document` | Cooperative | Cooperative's repo | Legal documents are organizational records |
| `admin.officer` | Cooperative | Cooperative's repo | Officer records are organizational |
| `funding.pledge` | Pledger | Member's repo | Financial commitments are personal |
| `funding.campaign` | Cooperative | Cooperative's repo | Campaigns are organizational |

---

## 4. Bilateral Membership Join Protocol

### Why Bilateral Records Are Unprecedented on ATProto

Every existing graph relationship in Bluesky (follows, blocks, lists, starter packs) is modeled as a single unilateral record. Co-op Source Network's dual-record requirement — where both member and cooperative must independently write matching records for membership to activate — is architecturally novel on ATProto. This mirrors ActivityPub's `Follow` → `Accept` handshake but adapts it to ATProto's shared-heap architecture using paired records rather than message exchange.

### End-to-End Join Sequence

**Phase 1 — Member initiates join:**
1. Member navigates to cooperative's web UI
2. Clicks "Join Cooperative" → ATProto OAuth flow
3. OAuth authorization: PAR request, PKCE, DPoP binding
4. Member authenticates with their PDS, approves scopes
5. Cooperative receives DPoP-bound access token

**Phase 2 — Writing the member's declaration:**
6. Cooperative's backend writes `network.coopsource.org.membership` to member's PDS via OAuth token
7. Member's PDS commits → signed commit → firehose event

**Phase 3 — Cooperative creates approval:**
8. Cooperative admin reviews, writes `network.coopsource.org.memberApproval` to cooperative's PDS
9. Strong reference to member's membership record (AT-URI + CID)

**Phase 4 — AppView discovers and activates:**
10. AppView (via Tap) receives both commit events
11. Matches records: memberApproval.member == membership record's DID
12. Verifies commit signatures against DID documents
13. Membership status transitions to `active`

### AppView State Machine

```
States: none → pending_member → active    (member record first)
        none → pending_approval → active   (approval record first)
        active → revoked_by_member         (member deletes)
        active → revoked_by_coop           (coop deletes)
```

The AppView must handle out-of-order record creation gracefully:

- **Normal flow**: Member declares → pending → cooperative approves → active
- **Pre-approval**: Cooperative approves first → unmatched → member declares → active
- **Simultaneous**: Either order; atomic DB transactions check for matching counterpart

### Firehose Discovery via Tap

The AppView uses Tap for repository synchronization:

- Subscribes to relay at `bsky.network` via WebSocket
- `TAP_COLLECTION_FILTERS=network.coopsource.*` filters to governance-relevant records
- `TAP_SIGNAL_COLLECTION=network.coopsource.org.membership` auto-discovers repos
- Automatic backfill: new repos get complete history before live events
- Self-healing: sequence gaps trigger full resync from authoritative PDS

### OAuth Proxy Writes

The cooperative's web UI acts as an ATProto OAuth client:

- **DPoP binding mandatory**: ES256 keypair per session, proof JWT on every request
- **Server nonces**: Max 5 minutes, rotated periodically, prevent replay
- **Token lifecycle**: Access tokens 5-30 minutes; refresh tokens single-use, rotated; sessions persist up to 180 days via refresh
- **Critical verification**: After token exchange, verify `sub` claim matches expected member DID

### Revocation Semantics

Either party can unilaterally revoke by deleting their record:

- **Member revocation**: Delete membership record → AppView transitions to `revoked_by_member`
- **Cooperative revocation**: Delete memberApproval → AppView transitions to `revoked_by_coop`
- **Re-join**: New records with new TID rkeys; previous history preserved in audit log
- **Important**: ATProto record deletion is real deletion — PDS removes from MST

---

## 5. The Public/Private Boundary

### Three-Tier Data Architecture

**Tier 1 — Public ATProto records** (in repos, on the firehose):
- Cooperative profiles, public proposals, vote tallies, public membership directories
- Open governance proceedings, ratified agreements, published reports
- Connection records for cross-cooperative relationships

**Tier 2 — Private server-side records** (in PostgreSQL, behind API auth):
- Closed governance deliberations, draft proposals, confidential agreements
- Private membership details, financial records, internal communications
- Modeled as CRUD over typed records by collection, matching ATProto semantics

**Tier 3 — End-to-end encrypted communications** (via Germ DM or MLS):
- Board-level confidential discussions, mediation proceedings
- Sensitive personnel matters, legal consultations
- Patronage allocation details, capital account balances, salary records

### Forward-Compatible Private Data Schema

Model Tier 2 data as collections of typed records matching ATProto semantics:

```sql
CREATE TABLE private_record (
    did TEXT NOT NULL,
    collection TEXT NOT NULL,
    rkey TEXT NOT NULL,
    record JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (did, collection, rkey)
);
```

This schema maps directly to a future Buckets migration when Holmgren's design ships (estimated 12+ months).

### Buckets Status (March 2026)

Daniel Holmgren's "Permissioned Data Diary 2: Buckets" remains in active design phase. Buckets would provide protocol-level containers with ACLs where records inherit access control and membership defines the perimeter. A cooperative maps naturally to a bucket. However, Buckets are not shipped and should not be relied upon for MVP. The Tier 2 PostgreSQL approach is the correct near-term strategy.

---

## 6. Ecosystem Composability

### Smoke Signal Integration

Cooperatives schedule governance meetings as `community.lexicon.calendar.event` records. Members RSVP via Smoke Signal. The cooperative's AppView indexes RSVPs for quorum calculation. Proposals cross-reference meeting events via AT-URI.

### WhiteWind Integration

Detailed proposal rationale, annual reports, and policy documents published as `com.whtwnd.blog.entry` records (up to 100,000 characters of Markdown). Proposals link to WhiteWind entries via `fullDocument` AT-URI field.

### Germ DM Integration (Tier 3)

Board members with `com.germnetwork.declaration` records can conduct E2EE deliberations. The cooperative's UI detects Germ DM availability and surfaces "Start secure discussion" actions. The cooperative never handles message content.

### Frontpage Integration

Public proposals cross-posted as `fyi.unravel.frontpage.post` records for community discussion. Discussion on Frontpage becomes visible governance deliberation indexed by the AppView.

### Bluesky Lists and Starter Packs

The cooperative maintains an `app.bsky.graph.list` of members, auto-updated when membership status changes. Starter Packs combine membership lists with governance activity feeds for onboarding.

### Lexicon Lenses

The Lexicon Community's Lexicon Lenses project enables transformations between record types. When the spec stabilizes, implement lenses from `network.coopsource.governance.proposal` to generic feed types for visibility in any feed viewer.

---

## 7. Infrastructure Architecture

### Deployment Topology

```
┌─────────────────────────────────────────────────┐
│  Cooperative Infrastructure ($20-50/mo VPS)      │
│                                                   │
│  ┌──────────────┐  ┌──────────────────────────┐  │
│  │  PDS          │  │  AppView (Express API)   │  │
│  │  @atproto/pds │  │  + Tap consumer          │  │
│  │  Port 2583    │  │  + Ozone labeler         │  │
│  │               │  │  + PostgreSQL             │  │
│  └──────┬───────┘  └────────┬─────────────────┘  │
│         │                    │                     │
│  ┌──────┴────────────────────┴─────────────────┐  │
│  │  SvelteKit Frontend                          │  │
│  │  (unchanged from current codebase)           │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
          │                          │
          ▼                          ▼
  ┌──────────────┐         ┌──────────────────┐
  │  plc.directory│         │  bsky.network    │
  │  (DID         │         │  (Relay)         │
  │   resolution) │         └──────────────────┘
  └──────────────┘                  │
                             ┌──────┴──────┐
                             │  Tap         │
                             │  (Go binary) │
                             │  Backfill +  │
                             │  live sync   │
                             └─────────────┘
```

### Component Recommendations

**Self-hosted PDS** (`@atproto/pds` v0.4.212+):
- Hosts cooperative's ATProto account
- Deploy via Docker on separate domain from AppView (security: blobs on PDS domain could enable credential theft)
- Storage: SQLite-per-user for repos, S3-compatible blob storage
- Key management: PLC rotation key in KMS/HSM
- Cost: $10-20/mo for small cooperative

**Tap** (Bluesky's Go sync tool, production-ready):
- Subscribes to relay, outputs filtered verified events
- Automatic backfill, MST validation, identity verification
- Delivers events via WebSocket or webhook
- Replaces current `appview/loop.ts` pg_notify subscription
- SQLite or PostgreSQL backing store

**Ozone** (labeling/moderation):
- Custom governance labels: `proposal-active`, `proposal-approved`, `member-suspended`, etc.
- Labels published via `com.atproto.label.subscribeLabels`
- Cooperative runs labeler as DID with `#atproto_labeler` service endpoint

**HappyView** (lexicon-driven AppView, production-ready):
- Upload lexicon schemas → get XRPC endpoints, OAuth, sync, write proxying
- Evaluate as secondary AppView for rapid prototyping alongside primary custom AppView
- Zero-downtime lexicon updates

### Cost Estimates

| Scale | PDS | VPS (AppView + Tap) | Blob storage | Total |
|---|---|---|---|---|
| Small (< 50 members) | $10/mo | $20/mo | $5/mo | ~$35/mo |
| Medium (< 500 members) | $20/mo | $50/mo | $15/mo | ~$85/mo |
| Large (< 5,000 members) | $40/mo | $100/mo | $40/mo | ~$180/mo |

---

## 8. Security Model

### 8.1 Identity Attacks

**Cooperative impersonation**: AppView must treat DID (not handle) as authoritative identifier. All records reference DIDs, never handles. Cooperatives should publish their DID prominently.

**Fake membership claims**: A user can write a membership record pointing at any cooperative's DID. The bilateral model is the mitigation — without matching memberApproval, membership never activates. AppView should not expose unmatched memberships.

**Malicious PDS operator forgery**: Most critical identity attack. PDS operator holds signing keys for all hosted accounts and can create cryptographically valid records. Bilateral model requires compromising two independent PDS instances. Mitigation: cooperatives self-manage rotation keys with higher priority than PDS's key.

**DID takeover**: If attacker obtains rotation key, they can steal identity. PLC transparency log (under development) will enable monitoring. AppView should monitor PLC directory for unexpected key rotations.

### 8.2 Membership Protocol Attacks

**Membership spam**: Thousands of fake membership records from sockpuppets. Mitigation: rate-limit pending membership indexing, deprioritize new DIDs without established reputation.

**Race conditions**: Rapid create/delete cycles to confuse AppView. Mitigation: process events sequentially per account (Tap guarantees), implement debouncing.

**Duplicate vote prevention**: Use deterministic rkey derived from proposal identifier. ATProto repos enforce unique paths — second vote with same rkey overwrites first.

### 8.3 Firehose and Relay Attacks

**Malicious relay injection**: Commit events include signed commits and MST proofs. AppView MUST verify commit signatures on all membership-relevant records. Do not rely on Jetstream (strips proofs).

**Firehose flooding**: Per-DID rate limits independent of PDS limits. Suggested: no more than 100 record operations per hour per DID in cooperative namespaces.

**Censorship via event omission**: Subscribe to multiple relay sources. Periodic reconciliation against authoritative PDS instances.

### 8.4 Governance Attacks

**Unauthorized voting**: AppView verifies active bilateral membership before counting any vote.

**Vote manipulation by AppView operator**: All votes are public ATProto records, independently verifiable. Publish complete vote lists alongside outcomes. Cryptographic audit log (hash chain) enables third-party verification.

**Timing attacks**: Use vote `createdAt` as authoritative time, cross-reference with commit rev. Grace period for firehose propagation delay.

**Vote delegation forgery**: Delegation records must be written by the delegating member to their own PDS. AppView verifies authoring DID matches delegator.

### 8.5 Private Data Attacks

**Tier 2 data exposure**: Must be architecturally enforced — Tier 2 data stored in PostgreSQL `private_record` table, never in ATProto repository MST. If stored in repo, it would be broadcast on firehose.

**Metadata leakage**: Timing patterns of public records can reveal private information. Batch updates, randomized delays for non-time-sensitive records.

### 8.6 Sybil Resistance

Drawing from federation security research:

- **Identity anchoring**: Tie federation access to verified cooperative membership
- **Reputation systems**: Weight trust based on account age, activity, and existing cooperative participation
- **Rate limiting**: Per-DID and per-PDS limits on record creation
- **Multi-factor membership**: Require both ATProto identity and out-of-band verification for sensitive cooperatives

### 8.7 AppView Validation Checklist

Every membership-relevant record must pass:

1. Cryptographic verification of commit signature against DID document
2. Independent DID resolution (don't trust cached data for security decisions)
3. Schema validation against lexicon
4. Authorization check (record authored by expected DID)
5. Bilateral match (both records exist and cross-reference correctly)
6. Rate limiting per-DID
7. Timestamp validation (reject implausible timestamps)
8. Audit logging with commit CID, rev, and signature

---

## 9. Legal and Administrative Lifecycle

### Cooperative Types Supported

V5 must accommodate six primary cooperative types:

1. **Worker cooperatives** — owned by employees, patronage by labor contribution
2. **Consumer cooperatives** — owned by customers, patronage by purchase volume
3. **Producer cooperatives** — pool output for marketing/processing
4. **Multi-stakeholder cooperatives** — multiple member classes with differentiated voting
5. **Platform cooperatives** — cooperatively owned digital platforms
6. **Cooperative federations** — cooperatives of cooperatives (recursive model)

### US Legal Structures

Three primary formation paths, each with distinct requirements:

- **Cooperative corporations**: State cooperative statutes, one-member-one-vote mandated
- **Cooperative LLCs**: Maximum flexibility, governance rules contractual
- **Limited Cooperative Associations (LCAs)**: Colorado most popular jurisdiction, permits investor members with capped voting alongside patron members

### Foundational Documents

| Document | Storage Tier | Rationale |
|----------|-------------|-----------|
| Articles of Incorporation | Tier 1 (Public ATProto) | Already a public record |
| Bylaws (ratified) | Tier 1 with Tier 2 option | Transparency vs. privacy preference |
| Operating agreement | Tier 2 (Private) | Contains financial terms |
| Membership agreement template | Tier 1 (Public) | Prospective members should review |
| Signed membership agreements | Tier 2 (Private) | Individual member data |
| Meeting minutes | Tier 2 (Private) | Internal governance |
| Officer records | Tier 1 (Public) | Transparency about leadership |
| Compliance tracking | Tier 2 (Private) | Internal administration |
| Patronage allocations | Tier 3 (E2EE) | Individual financial data |
| Capital account balances | Tier 3 (E2EE) | Individual financial data |

### Compliance Calendar

The platform maintains state-specific deadlines:

- Annual meeting requirements (10-60 days notice, state-dependent)
- Annual report filings to Secretary of State
- IRS Form 1120-C filing
- 1099-PATR distribution (patronage dividends ≥ $10)
- Registered agent renewals
- Business license renewals
- Patronage allocation deadlines (20% cash within 8.5 months of fiscal year-end)

### Digital Signatures and Legal Enforceability

The ESIGN Act (2000) and UETA (49 states + DC) establish that electronic signatures are legally valid for corporate governance. Each signature record captures: signer DID, timestamp, authentication method, document hash (strong reference to CID), and authority attestation. ATProto's commit-level signatures provide a robust audit trail.

---

## 10. Cooperative Financial Tools

### Patronage Calculation Engine

Patronage must be calculated proportional to business patronage (not equal distribution):

- **Worker cooperatives**: Hours worked, salary, or combined metric
- **Consumer cooperatives**: Purchase volume
- **Producer cooperatives**: Supply volume
- **Multi-stakeholder**: Per-class calculation rules

### Capital Account Management

Each member has a capital account tracking:

- **Initial equity contribution**: Fixed or variable buy-in
- **Allocated retained patronage**: Member's share of annual surplus
- **Revolving fund mechanics**: Older allocations redeemed as equity accumulates
- **Unallocated equity**: General reserve fund (collectively owned)

### IRS Subchapter T Compliance

Key requirements the platform must enforce:

- Democratic control (one member, one vote or proportional to patronage)
- Subordination of capital
- At least 20% of qualified patronage dividends paid in cash within 8.5 months
- Separate tracking of patronage-sourced vs. non-patronage-sourced income
- Form 1120-C filing support
- Form 1099-PATR generation for members

### Financial Data Security

All financial records are Tier 2 or Tier 3:

- Patronage calculations: Tier 2 (visible to member and authorized officers)
- Capital account balances: Tier 3 (E2EE, maximum protection)
- Aggregate financial reports: Tier 2 with Tier 1 summaries for transparency

---

## 11. Member Onboarding and Lifecycle

### Onboarding Workflow

1. **Discovery**: Member finds cooperative via Bluesky, Starter Pack, or direct URL
2. **Application**: ATProto OAuth → membership record written to member's repo
3. **Probationary period**: Configurable duration (2 months to 1+ year)
4. **Education**: Training completion tracking, cooperative principles orientation
5. **Buy-in**: Capital contribution processing (integrated with Stripe)
6. **Full membership**: Board approval → memberApproval record with full roles
7. **Ongoing**: Participation tracking, governance rights, patronage accumulation

### Probationary Period Management

- Milestone checkpoints with peer review
- Training completion verification
- Buddy system assignment (experienced member mentoring)
- Clear documentation of membership path
- Automatic notifications for upcoming milestones

### Member Lifecycle States

```
applicant → probationary → active → [suspended | resigned | removed]
                                  → emeritus (optional)
```

Each transition is recorded as ATProto records or private records depending on visibility tier.

---

## 12. Open vs Closed Cooperative Patterns

### Three Architectural Modes

**Open cooperative**: All governance public, discoverable, joinable by anyone. Everything is Tier 1.

**Closed cooperative**: Private deliberations, permissioned membership. Profile is Tier 1 (cooperative exists), governance is Tier 2, board communications are Tier 3.

**Mixed cooperative** (common case): Public profile with selective publishing. Open proposals public (Tier 1), closed proposals private (Tier 2), financial operations private (Tier 2), board E2EE (Tier 3), ratified outcomes published (Tier 1).

### Implementation: Visibility Routing

The cooperative's profile record includes a `governanceVisibility` field (`open`, `closed`, `mixed`). The write proxy routes writes based on this flag and per-record visibility declarations.

### Cross-Cooperative Visibility

- **Open ↔ Open**: Full mutual visibility via firehose
- **Open ↔ Closed**: Open cooperative's records visible; closed shares selectively
- **Closed ↔ Closed**: Bilateral data sharing via Tier 2 private APIs (retain RFC 9421 signing for this specific use case)

---

## 13. Lexicon Design

### Existing Lexicons (22, preserved with refinements)

All existing `network.coopsource.*` lexicons are well-designed and largely ready. Key refinements:

1. **Votes**: Must support member-repo authorship with strong reference to proposal
2. **Membership**: Add `cooperativeProfile` AT-URI field for discovery
3. **Proposals**: Add optional ecosystem cross-reference fields (meetingEvent, fullDocument, discussionThread)
4. **Signatures**: Strong reference to master agreement for tamper evidence

### New Lexicons for V5

**Legal and Administrative:**

- `network.coopsource.legal.document` — Foundational documents with versioning (chain of strong references)
- `network.coopsource.legal.meetingRecord` — Board and member meeting minutes with resolution tracking
- `network.coopsource.admin.officer` — Elected/appointed positions with terms
- `network.coopsource.admin.complianceItem` — Filing deadlines and regulatory tracking
- `network.coopsource.admin.memberNotice` — Legally required communications
- `network.coopsource.admin.fiscalPeriod` — Financial period tracking for Subchapter T

**Member Lifecycle:**

- `network.coopsource.org.onboarding` — Onboarding progress tracking
- `network.coopsource.org.trainingRecord` — Training completion verification
- `network.coopsource.org.probationReview` — Probationary period evaluations

### Lexicon Immutability

ATProto lexicons are immutable once published. Only optional fields can be added. The existing 22 lexicons at `"lexicon": 1` with `"key": "tid"` are correct. New optional fields (meetingEvent, fullDocument, etc.) can be added safely.

### New Lexicon Schemas (Full Specifications)

The following lexicons support the cooperative legal and administrative lifecycle. Each follows ATProto conventions: `lowerCamelCase` fields, `ref` for strong references, `at-uri` for loose references.

#### `network.coopsource.legal.document`

```json
{
  "lexicon": 1,
  "id": "network.coopsource.legal.document",
  "defs": {
    "main": {
      "type": "record",
      "key": "tid",
      "record": {
        "type": "object",
        "required": ["documentType", "title", "version", "status", "createdAt"],
        "properties": {
          "documentType": {
            "type": "string",
            "knownValues": [
              "articlesOfIncorporation", "bylaws", "operatingAgreement",
              "membershipAgreement", "patronagePolicy", "capitalAccountsPolicy",
              "boardPolicy", "amendment"
            ]
          },
          "title": { "type": "string", "maxLength": 500 },
          "version": { "type": "integer", "minimum": 1 },
          "status": {
            "type": "string",
            "knownValues": ["draft", "proposed", "ratified", "superseded", "archived"]
          },
          "contentHash": {
            "type": "string",
            "description": "SHA-256 hash of document content (Tier 1 commitment to Tier 2 documents)"
          },
          "contentBlob": {
            "type": "blob",
            "accept": ["application/pdf", "text/markdown", "text/plain"],
            "maxSize": 10485760,
            "description": "Full document content (Tier 1 public documents only)"
          },
          "previousVersion": {
            "type": "ref",
            "ref": "com.atproto.repo.strongRef",
            "description": "Strong reference to previous version (creates append-only chain)"
          },
          "ratificationProposal": { "type": "string", "format": "at-uri" },
          "effectiveDate": { "type": "string", "format": "datetime" },
          "createdAt": { "type": "string", "format": "datetime" }
        }
      }
    }
  }
}
```

Each new version is a new record (new TID rkey) pointing to its predecessor via `previousVersion`. Previous record's status updated to `superseded`.

#### `network.coopsource.legal.meetingRecord`

```json
{
  "lexicon": 1,
  "id": "network.coopsource.legal.meetingRecord",
  "defs": {
    "main": {
      "type": "record",
      "key": "tid",
      "record": {
        "type": "object",
        "required": ["meetingType", "scheduledDate", "status", "createdAt"],
        "properties": {
          "meetingType": {
            "type": "string",
            "knownValues": ["annualMember", "specialMember", "regularBoard", "specialBoard", "committee"]
          },
          "scheduledDate": { "type": "string", "format": "datetime" },
          "status": {
            "type": "string",
            "knownValues": ["scheduled", "noticesSent", "quorumMet", "inProgress", "completed", "cancelled"]
          },
          "quorumRequired": { "type": "integer" },
          "quorumPresent": { "type": "integer" },
          "attendees": { "type": "array", "items": { "type": "string", "format": "did" } },
          "minutesHash": { "type": "string", "description": "SHA-256 of full minutes (Tier 2)" },
          "resolutions": { "type": "array", "items": { "type": "ref", "ref": "#resolution" }, "maxLength": 50 },
          "certifiedBy": { "type": "string", "format": "did" },
          "createdAt": { "type": "string", "format": "datetime" }
        }
      }
    },
    "resolution": {
      "type": "object",
      "required": ["title", "outcome"],
      "properties": {
        "title": { "type": "string", "maxLength": 500 },
        "outcome": { "type": "string", "knownValues": ["adopted", "defeated", "tabled", "withdrawn"] },
        "votesFor": { "type": "integer" },
        "votesAgainst": { "type": "integer" },
        "abstentions": { "type": "integer" },
        "governanceProposal": { "type": "string", "format": "at-uri" }
      }
    }
  }
}
```

#### `network.coopsource.admin.officer`

```json
{
  "lexicon": 1,
  "id": "network.coopsource.admin.officer",
  "defs": {
    "main": {
      "type": "record",
      "key": "any",
      "description": "Rkey encodes position (e.g., 'president', 'director-seat-1')",
      "record": {
        "type": "object",
        "required": ["position", "holder", "termStart", "createdAt"],
        "properties": {
          "position": {
            "type": "string",
            "knownValues": ["president", "vicePresident", "secretary", "treasurer", "director", "committee-chair"]
          },
          "positionTitle": { "type": "string", "maxLength": 200 },
          "holder": { "type": "string", "format": "did" },
          "termStart": { "type": "string", "format": "datetime" },
          "termEnd": { "type": "string", "format": "datetime" },
          "electionProposal": { "type": "string", "format": "at-uri" },
          "responsibilities": { "type": "string", "maxLength": 5000 },
          "status": { "type": "string", "knownValues": ["active", "resigned", "removed", "termExpired"] },
          "createdAt": { "type": "string", "format": "datetime" }
        }
      }
    }
  }
}
```

Uses `key: "any"` with semantic rkey for deduplication. When officer replaced, record updated in place.

#### `network.coopsource.admin.complianceItem`

```json
{
  "lexicon": 1,
  "id": "network.coopsource.admin.complianceItem",
  "defs": {
    "main": {
      "type": "record",
      "key": "any",
      "description": "Rkey encodes item (e.g., 'annual-report-2026', 'form-1120c-fy2025')",
      "record": {
        "type": "object",
        "required": ["itemType", "jurisdiction", "deadline", "status", "createdAt"],
        "properties": {
          "itemType": {
            "type": "string",
            "knownValues": [
              "annualReport", "taxFiling1120C", "taxFiling1099PATR",
              "registeredAgentRenewal", "businessLicenseRenewal",
              "annualMeetingRequirement", "financialAudit", "stateCoopFiling"
            ]
          },
          "jurisdiction": { "type": "string", "maxLength": 100 },
          "deadline": { "type": "string", "format": "datetime" },
          "status": { "type": "string", "knownValues": ["upcoming", "inProgress", "filed", "overdue", "notApplicable"] },
          "filingReference": { "type": "string", "maxLength": 500 },
          "responsibleOfficer": { "type": "string", "format": "did" },
          "notes": { "type": "string", "maxLength": 2000 },
          "createdAt": { "type": "string", "format": "datetime" }
        }
      }
    }
  }
}
```

#### `network.coopsource.admin.memberNotice`

```json
{
  "lexicon": 1,
  "id": "network.coopsource.admin.memberNotice",
  "defs": {
    "main": {
      "type": "record",
      "key": "tid",
      "record": {
        "type": "object",
        "required": ["noticeType", "subject", "issuedAt", "createdAt"],
        "properties": {
          "noticeType": {
            "type": "string",
            "knownValues": [
              "annualMeetingNotice", "specialMeetingNotice", "electionNotice",
              "bylawAmendmentNotice", "patronageAllocationNotice",
              "memberTerminationNotice", "generalNotice"
            ]
          },
          "subject": { "type": "string", "maxLength": 500 },
          "contentHash": { "type": "string" },
          "issuedAt": { "type": "string", "format": "datetime" },
          "deliveryDeadline": { "type": "string", "format": "datetime" },
          "requiredNoticeDays": { "type": "integer" },
          "relatedMeeting": { "type": "string", "format": "at-uri" },
          "relatedProposal": { "type": "string", "format": "at-uri" },
          "recipients": { "type": "string", "knownValues": ["allMembers", "boardOnly", "committeeMembers", "specificMembers"] },
          "createdAt": { "type": "string", "format": "datetime" }
        }
      }
    }
  }
}
```

#### `network.coopsource.admin.fiscalPeriod`

```json
{
  "lexicon": 1,
  "id": "network.coopsource.admin.fiscalPeriod",
  "defs": {
    "main": {
      "type": "record",
      "key": "any",
      "description": "Rkey encodes fiscal year (e.g., 'fy2025', 'fy2026')",
      "record": {
        "type": "object",
        "required": ["periodStart", "periodEnd", "status", "createdAt"],
        "properties": {
          "periodStart": { "type": "string", "format": "datetime" },
          "periodEnd": { "type": "string", "format": "datetime" },
          "status": {
            "type": "string",
            "knownValues": ["open", "closed", "auditInProgress", "auditComplete", "filingComplete"]
          },
          "patronageAllocated": { "type": "boolean" },
          "patronageAllocationDate": { "type": "string", "format": "datetime" },
          "cashDistributionDeadline": {
            "type": "string", "format": "datetime",
            "description": "8.5 months after period end for qualified patronage dividends"
          },
          "auditStatus": { "type": "string", "knownValues": ["notRequired", "scheduled", "inProgress", "completed"] },
          "taxFilingStatus": { "type": "string", "knownValues": ["notDue", "inProgress", "filed", "extended"] },
          "createdAt": { "type": "string", "format": "datetime" }
        }
      }
    }
  }
}
```

### Lexicon Community Consideration

Long-term, consider moving governance lexicons to `community.lexicon.governance.*` for credible exit — if Co-op Source Network ceases to exist, lexicons survive under community stewardship. Not urgent for initial deployment.

---

## 14. Codebase Gap Analysis

### Current Codebase Inventory

The codebase contains ~26,500 lines across ~280 files:

- **API backend**: 14,461 lines, 11 services, 27+ routes
- **Federation package**: 3,232 lines, full IPdsService/IFederationClient implementations
- **Database**: 29 migrations, 50+ tables
- **Frontend**: 92 files, 40+ routes, complete SvelteKit 2 + Svelte 5 app
- **Lexicons**: 22 ATProto schemas with code generation
- **AI/Agents**: ChatEngine, MCP client, 3 agent types (facilitator, governance, coordinator)

### What Stays Unchanged

| Component | Location | Notes |
|---|---|---|
| SvelteKit frontend | `apps/web/` | Write path changes from internal API to ATProto-aware API |
| AppView indexer architecture | `apps/api/src/appview/` | Replace firehose source; indexer dispatch by NSID stays |
| DI container pattern | `apps/api/src/container.ts` | Extend to inject Tap consumer |
| Kysely database layer | `apps/api/src/database/` | Add private_record table, drop PDS tables |
| ATProto OAuth client | `apps/api/src/auth/oauth-client.ts` | Upgrade scopes when available |
| Generated validators | `packages/lexicons/generated/` | Regenerate when lexicons refined |
| AI agent framework | `packages/ai/` | Unchanged; independent of data layer |
| Stripe integration | `apps/api/src/payments/` | Unchanged; Tier 2 financial data |
| Notification system | `apps/api/src/notifications/` | Trigger sources expand to Tap events |
| Config (Zod-validated) | `apps/api/src/config.ts` | Add new keys, remove deprecated |
| Bilateral membership logic | `membership-indexer.ts` | Core pattern preserved; data source changes |
| RFC 9421 HTTP signing | `packages/federation/http/` | Retained for Tier 2 private data exchange |

### What Changes

| Component | Current | V5 | Effort |
|---|---|---|---|
| AtprotoPdsService | Exists, gated behind `PDS_URL`, unused | Primary write path for public records | Low |
| AppView firehose source | `pg_notify` from LocalPdsService | Tap WebSocket consumer | Medium |
| PlcClient | HTTP client for plc.directory, unused | Active for DID creation and resolution | Low |
| Auth model | Internal JWT for all | ATProto OAuth for members; internal auth for operators | Medium |
| Service layer (writes) | Direct to LocalPdsService | Proxy member writes via OAuth; co-op writes to self-hosted PDS | Medium |
| Service layer (reads) | PostgreSQL single-source | AppView materialized views + private_record table | Medium |
| Database schema | Mixed PDS/AppView/private | Clearly separated: AppView, private_record, system | Medium |

### What Gets Retired

| Component | Replacement |
|---|---|
| LocalPdsService | Real `@atproto/pds` via AtprotoPdsService |
| LocalPlcClient | Real PlcClient for plc.directory |
| IFederationClient interface | Individual service methods composing ATProto operations (retained for Tier 2 private exchange) |
| LocalFederationClient | Direct PDS writes + Tap consumption |
| Federation outbox + processor | PDS handles write reliability; Tap handles sync |
| Saga coordinator | ATProto's eventually-consistent model |
| `pds_record`, `pds_commit` tables | Real PDS stores records; AppView indexes |
| `federation_peer`, `federation_outbox` tables | Discovery via firehose; no outbound federation |
| `pg_notify('pds_firehose')` | Tap's WebSocket from real relay |

### New Components to Build

| Component | Purpose | Effort |
|---|---|---|
| Tap consumer service | Replaces loop.ts event source | 1-2 weeks |
| Member write proxy | Proxies writes to member's PDS via OAuth | 1-2 weeks |
| Private record service | CRUD for Tier 2 data with ACL | 1-2 weeks |
| Ozone governance labeler | Automated governance status labels | 2-3 weeks |
| PDS deployment scripts | Docker Compose for self-hosted PDS | 1 week |
| Cooperative provisioning | Create DID, configure PDS, set handle | 1 week |
| List/Starter Pack sync | Auto-maintain membership list | 1 week |
| Legal document service | CRUD for legal/admin documents | 2 weeks |
| Compliance calendar | State-specific deadlines and tracking | 1-2 weeks |
| Onboarding workflow engine | Probationary period, training, buy-in | 2 weeks |
| Patronage calculation engine | Per-type patronage calculation | 2-3 weeks |
| Capital account service | Member equity tracking | 1-2 weeks |
| Multi-user auth proxy | Operator auth for cooperative PDS writes | 1-2 weeks |

---

## 15. Phased Migration Plan

### Phase 0: Foundation (Weeks 1-2)

**Goal**: Deploy real PDS, create cooperative's ATProto identity.

**Code changes**:
1. Create `docker-compose.pds.yml` for self-hosted PDS
2. Activate PlcClient in container.ts (`PLC_URL=https://plc.directory`)
3. Build cooperative provisioning script
4. Set `PDS_URL` → activates AtprotoPdsService
5. Verify cooperative's profile appears on bsky.app

**Config**:
```
PDS_URL=https://pds.mycoop.net
PLC_URL=https://plc.directory
INSTANCE_DID=did:plc:<created>
COOP_PDS_ADMIN_PASSWORD=<generated>
```

### Phase 1: Member Identity and OAuth (Weeks 3-5)

**Goal**: Members authenticate with ATProto identities and write to their own PDS.

1. Upgrade OAuth scopes (when available) from `transition:generic` to granular
2. Build member write proxy service
3. Modify membership/vote/signature flows to write to member's PDS
4. Add `private_record` table for Tier 2 data
5. Implement multi-user auth proxy for cooperative operators

### Phase 2: Tap-Based AppView (Weeks 6-8)

**Goal**: Replace local firehose with real network firehose via Tap.

1. Deploy Tap binary with cooperative collection filters
2. Build Tap event handler adapting to existing indexer dispatch
3. Retire `appview/loop.ts` pg_notify (keep as feature-flag fallback)
4. Add ecosystem record indexers (calendar RSVPs, Bluesky lists)
5. Drop local PDS tables after Tap consumer is stable

### Phase 3: Ecosystem Composability (Weeks 9-12)

**Goal**: Integrate Smoke Signal, WhiteWind, Frontpage. Deploy Ozone.

1. Add cross-reference fields to proposal lexicon
2. Build Smoke Signal event integration
3. Build Frontpage cross-posting
4. Deploy Ozone with governance label definitions
5. Build automated labeler for governance status
6. Add Starter Pack generation
7. Retire public-data federation components

### Phase 4: Legal and Administrative (Weeks 13-16)

**Goal**: Deploy legal document lifecycle and compliance tracking.

1. Deploy new legal/admin lexicons
2. Build legal document service with versioning
3. Build compliance calendar with state-specific deadlines
4. Build officer record management
5. Build meeting record service with resolution tracking
6. Implement digital signature workflow with legal enforceability

### Phase 5: Private Data and Closed Cooperatives (Weeks 17-20)

**Goal**: Implement Tier 2 private data for closed/mixed cooperatives.

1. Build private record service with ACL enforcement
2. Implement visibility routing for mixed-mode cooperatives
3. Build private proposal/vote/deliberation UI
4. Add Germ DM integration for Tier 3
5. Forward-compatible data modeling for eventual Bucket migration

### Phase 6: Financial Tools (Weeks 21-24)

**Goal**: Patronage calculation, capital accounts, compliance automation.

1. Build patronage calculation engine (per cooperative type)
2. Build capital account service
3. Implement 1099-PATR generation workflow
4. Build fiscal period tracking
5. Integrate with Stripe for cash distributions

### Phase 7: Advanced Features (Weeks 25-32)

**Goal**: Onboarding workflows, multi-stakeholder governance, feed generators.

1. Build onboarding workflow engine
2. Implement delegation-based voting
3. Build governance feed generator
4. Implement Lexicon Lenses when spec stabilizes
5. Evaluate HappyView as secondary AppView
6. Build inter-cooperative connection flows
7. Implement multi-stakeholder weighted voting

---

## 16. Data Sovereignty and Compliance

### GDPR Compliance

- Member data portability via ATProto's native data export (`com.atproto.sync.getRepo`)
- Right to be forgotten: coordinate deletion across AppView indexes and private records
- Consent management: capture during onboarding, track in membership agreement signature
- Data processing records: maintain audit log of all data access

### Multi-Jurisdiction Support

- Canadian data sovereignty: NorthSky Social Cooperative demonstrates cooperative PDS hosting with Canadian jurisdiction
- EU compliance: EuroSky's pan-European infrastructure provides relay and PDS with European hosting
- State-level US compliance: Per-state cooperative statutes, filing requirements, and notice periods

### Member Data Rights

- Export: Members own their ATProto data and can export/migrate at any time
- Portability: Member's cooperative participation travels with their portable DID
- Deletion: Cooperative must honor deletion requests within legal retention requirements
- Transparency: Members can audit their own records via their PDS

---

## 17. ATmosphereConf 2026 and Community Strategy

### Conference (March 26-29, Vancouver)

ATmosphereConf 2026 has not yet occurred as of this document's date. Key talks to attend:

- **Brittany Ellich**: Building collaborative spaces (groups-as-DID)
- **Daniel Holmgren**: Protocol governance and hard decentralization
- **Evelyn Osman (NorthSky)**: Community privacy in decentralized networks
- **Govind Mohan**: Cooperate and Succeed! (cooperative infrastructure)
- **Cassidy James Blaede (ROOST)**: Open source Trust & Safety

### Strategic Recommendations

1. **Present Co-op Source Network** at the conference
2. **Join IndieSky Working Group** for independent infrastructure coordination
3. **Connect with Brittany Ellich** about opensocial.community integration
4. **Connect with NorthSky** about shared cooperative infrastructure
5. **Attend OAuth Masterclass** for Phase 1 implementation
6. **Apply to AT Protocol Community Fund** for funding

### Community Initiatives to Engage

- **IndieSky**: Independent infrastructure coordination ($50K from Free Our Feeds)
- **NorthSky**: Worker-owned PDS hosting, Canadian data sovereignty
- **EuroSky**: Pan-European ATProto infrastructure
- **Blacksky/rsky**: Most complete independent ATProto implementation (Rust)
- **Free Our Feeds**: Public-interest ATProto funding ($30M goal)
- **Lexicon Community**: Shared lexicon governance

---

## Appendix: Key Resources

### ATProto Specifications
- DID methods: atproto.com/specs/did
- Repository format: atproto.com/specs/repository
- Sync protocol: atproto.com/specs/sync
- Label system: atproto.com/specs/label
- Self-hosting: atproto.com/guides/self-hosting

### Protocol Roadmap
- Fall 2025 Check-in: docs.bsky.app/blog/protocol-checkin-fall-2025
- Buckets design: dholms.leaflet.pub/3mfrsbcn2gk2a
- IETF Working Group: datatracker.ietf.org/group/atproto/about/

### Ecosystem Apps
- Smoke Signal: smokesignal.events
- WhiteWind: whtwnd.com
- Germ DM: germnetwork.com
- Frontpage: frontpage.fyi
- HappyView: happyview.dev
- Lexicon Community: github.com/lexicon-community

### Infrastructure
- @atproto/pds: npmjs.com/package/@atproto/pds
- Tap: github.com/bluesky-social/indigo/cmd/tap
- Ozone: github.com/bluesky-social/ozone
- rsky: github.com/blacksky-algorithms/rsky

### Cooperative Resources
- ICA Principles: ica.coop/en/cooperatives/cooperative-identity
- Platform Cooperativism Consortium: platform.coop
- SELC Templates: theselc.org
- DAWI Resources: institute.coop
- USDA Cooperative Tools: rd.usda.gov/about-rd/agencies/rural-business-cooperative-service

### Community Organizations
- opensocial.community: Brittany Ellich's group-as-DID model
- NorthSky: Worker-owned PDS hosting
- IndieSky: Independent infrastructure coordination
- EuroSky: Pan-European ATProto infrastructure
- Free Our Feeds: Public-interest funding
- ROOST: Open-source Trust & Safety

---

*This document consolidates V4's ATProto-native architecture with implementation-grade bilateral membership, comprehensive security model, legal/administrative lifecycle, financial tools, and current ecosystem intelligence. It is the single reference document for Co-op Source Network's architecture moving forward.*
