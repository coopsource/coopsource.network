# Co-op Source Network Lexicons

These are the ATProto lexicon schemas for the Co-op Source Network, published under the `network.coopsource.*` namespace. Each schema defines a record type that cooperatives and their members write to ATProto Personal Data Servers (PDS). The JSON schema files live in subdirectories of [`network/coopsource/`](./network/coopsource/) organized by namespace: `admin`, `agreement`, `alignment`, `commerce`, `connection`, `finance`, `funding`, `governance`, `legal`, `ops`, and `org`.

Records written to a PDS are broadcast through the ATProto relay firehose. AppView instances — including the Co-op Source Network's own AppView — subscribe to the firehose, filter for `network.coopsource.*` collections, and index the records into PostgreSQL for fast queries. PostgreSQL is a materialized index; the authoritative record always lives in the PDS.

For a broader overview of the architecture, federation design, and three-tier data model, see [README.md](../../README.md).

---

## Record Ownership Matrix

Records are owned by the party whose PDS holds them. A subset of records exist only in the PostgreSQL database (no ATProto write path implemented) — these are shown in the third column.

| Member's PDS | Cooperative's PDS | DB-only (no ATProto write path) |
|---|---|---|
| `org.membership` | `org.cooperative` | `org.project` |
| `governance.vote` | `org.memberApproval` | `org.team` |
| `agreement.signature` | `governance.proposal` ¹ | `org.role` |
| `alignment.interest` | `agreement.master` | `governance.delegation` |
| `alignment.outcome` | `agreement.stakeholderTerms` | `agreement.amendment` |
| `funding.campaign` | `commerce.intercoopAgreement` | `agreement.contribution` |
| `funding.pledge` | `ops.task` | `admin.officer` |
| `connection.link` | `ops.schedule` | `admin.complianceItem` |
| | `commerce.listing` | `admin.memberNotice` |
| | `commerce.need` | `admin.fiscalPeriod` |
| | `commerce.resource` | `legal.document` |
| | `commerce.collaborativeProject` | `legal.meetingRecord` |
| | | `finance.expense` ² |
| | | `finance.expenseApproval` ² |
| | | `finance.revenue` ² |
| | | `ops.taskAcceptance` |
| | | `ops.timeEntry` ² |
| | | `alignment.interestMap` |
| | | `alignment.stakeholder` |
| | | `connection.binding` |
| | | `connection.sync` |

**Notes:**

1. `governance.proposal` is routed by `VisibilityRouter`: cooperatives running open governance write proposals to their PDS (Tier 1, visible on the firehose); cooperatives running closed governance store proposals in the `private_record` table (Tier 2, never on the firehose).
2. `finance.*` records and `ops.timeEntry` are explicitly Tier 2 private by design — they are never written to a PDS or broadcast on the firehose, regardless of governance mode.
3. Other DB-only records have lexicon schemas defined and declarative AppView hook configurations, but no ATProto write path has been implemented yet.
4. The service layer refers to `ops.schedule` as `ops.scheduleShift` and `commerce.resource` as `commerce.sharedResource` in some places. This document uses the canonical lexicon IDs from the JSON schema files.

---

## Data Tiers

**Tier 1 (Public ATProto):** Records written to a PDS and broadcast on the relay firehose. All records in the Member's PDS and Cooperative's PDS columns above (subject to the `governance.proposal` note) are Tier 1.

**Tier 2 (Private PostgreSQL):** Records stored in the `private_record` table or the main PostgreSQL database, never written to a PDS, never visible on the firehose. Includes closed-governance proposals, all `finance.*` records, `ops.timeEntry`, and the DB-only records listed above.

**Tier 3 (E2EE):** Board-confidential discussions, salary records, and other personnel matters. Tier 3 data is not represented in these lexicons — it is handled by Germ DM / MLS protocol. The platform facilitates key exchange and delivery but never handles plaintext content.

---

## Namespace: `org`

The `org` namespace defines the organizational primitives that every cooperative is built from: the cooperative itself, its members, and the hierarchy of projects, teams, and roles nested within it.

Membership is bilateral and non-negotiable. When a person or cooperative wants to join, they write a `membership` record to **their own PDS** naming the cooperative's DID. The cooperative independently writes a `memberApproval` record to **its own PDS** naming the member's DID. The AppView matches the two records by DID pair; only when both exist does it transition the membership status to `active`. Either record can arrive first — the AppView state machine handles out-of-order arrival gracefully, holding an unmatched record in `pending_member` or `pending_approval` until its counterpart appears.

Role authority lives exclusively in `memberApproval`. A member can never self-declare a role: the `membership` record they write carries no role field at all. When the cooperative writes the `memberApproval` it may include a `roles` array; the AppView reads those role assignments from the cooperative's record and surfaces them accordingly. This prevents any escalation-of-privilege scenario where a member claims a role the cooperative has not granted.

The organizational hierarchy extends below membership. A `cooperative` can contain one or more `project` records, each representing a discrete collaborative effort with its own visibility, status, and link back to the parent cooperative. Projects in turn contain `team` records — focused working groups with a defined decision method. `role` records define named responsibilities and permissions that can be attached to either a cooperative or a project. All three of these (`project`, `team`, `role`) are DB-only: they have lexicon schemas and PostgreSQL tables but no ATProto write path is implemented, so they never appear on the firehose.

The `cooperative` record itself is the entry point: the cooperative writes it to its own PDS to declare its name, status, and optional branding. Its DID — the stable identifier behind the cooperative's ATProto account — is the authoritative reference used by every other record in the system.

---

### `network.coopsource.org.cooperative`

The cooperative's own self-description record. Written to the **cooperative's PDS**.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string (max 255) | Yes | Display name of the cooperative |
| `description` | string (max 3000) | No | Human-readable description |
| `logoUrl` | uri (max 2000) | No | URL of the cooperative's logo |
| `website` | uri (max 2000) | No | Cooperative's public website |
| `status` | string | Yes | Lifecycle state: `active`, `inactive`, `dissolved` |
| `createdAt` | datetime | Yes | When the cooperative was created |

---

### `network.coopsource.org.membership`

The member's declaration of intent to join a cooperative. Written to the **member's PDS** via `MemberWriteProxy`. One side of the bilateral membership pair — does not confer `active` status alone.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cooperative` | did | Yes | DID of the cooperative being joined |
| `createdAt` | datetime | Yes | When this membership record was created |

---

### `network.coopsource.org.memberApproval`

The cooperative's approval of a member. Written to the **cooperative's PDS**. The authoritative source of role assignments — roles are never self-declared in the `membership` record.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `member` | did | Yes | DID of the approved member entity (person or cooperative) |
| `roles` | array of string | No | Roles assigned by the cooperative to this member |
| `createdAt` | datetime | Yes | When this approval record was created |

---

### `network.coopsource.org.project`

A discrete collaborative effort, optionally nested under a parent cooperative. **DB-only** — no ATProto write path implemented.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string (max 255) | Yes | Project name |
| `description` | string (max 3000) | No | What the project is about |
| `cooperativeUri` | at-uri | No | Parent cooperative, if any |
| `status` | string | Yes | `active`, `completed`, `on-hold`, `cancelled` |
| `visibility` | string | Yes | `public`, `members`, `private` |
| `createdAt` | datetime | Yes | When the project was created |

---

### `network.coopsource.org.team`

A focused working group within a project, with a defined decision method. **DB-only** — no ATProto write path implemented.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string (max 255) | Yes | Team name |
| `projectUri` | at-uri | Yes | The project this team belongs to |
| `description` | string (max 3000) | No | What the team works on |
| `purpose` | string (max 2000) | No | Why this team exists |
| `decisionMethod` | string | No | How the team makes decisions: `consensus`, `voting`, `lead-driven` |
| `createdAt` | datetime | Yes | When the team was created |

---

### `network.coopsource.org.role`

A named responsibility with defined permissions, scoped to a cooperative or project. **DB-only** — no ATProto write path implemented.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string (max 255) | Yes | Role name, e.g. Coordinator, Treasurer |
| `entityUri` | at-uri | Yes | The cooperative or project this role belongs to |
| `description` | string (max 3000) | No | What the role entails |
| `responsibilities` | array of string (each max 1000) | No | List of specific responsibilities |
| `permissions` | array of string (each max 500) | No | What this role can do |
| `termLengthMonths` | integer (min 0) | No | Term length in months, if applicable |
| `createdAt` | datetime | Yes | When the role was created |
