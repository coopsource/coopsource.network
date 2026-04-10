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
