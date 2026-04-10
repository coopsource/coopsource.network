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

---

## Namespace: `governance`

The `governance` namespace implements the full cooperative decision-making lifecycle: from drafting a proposal through community discussion and voting to a final outcome.

A `proposal` moves through a linear status progression: `draft` → `discussion` → `voting` → `passed` / `failed` / `withdrawn`. At each stage, cooperative members can see where deliberation stands. The proposal specifies a `votingMethod` — `simple_majority`, `supermajority`, `consensus`, or `ranked_choice` — and an optional `quorumRequired` expressed as a fraction between 0 and 1. The `quorumBasis` field controls whether that fraction is measured against votes actually cast or against the total member count. Optional deadlines (`discussionEndsAt`, `votingEndsAt`) allow automated stage transitions. Proposals can also carry links to cross-ecosystem artifacts: a Smoke Signal calendar event for the governance meeting, a WhiteWind blog entry for detailed rationale, and a Frontpage discussion thread for community commentary.

Visibility of the `proposal` record is controlled by `VisibilityRouter`. Cooperatives running open governance write proposals directly to their PDS, making them Tier 1 records that flow through the ATProto relay firehose. Cooperatives running closed governance store proposals in the `private_record` table as Tier 2 records, keeping deliberations off the public firehose entirely.

Members cast votes by writing `vote` records to their **own PDS** via `MemberWriteProxy`. Each vote references the proposal by AT URI, identifies the voter by DID, and carries a `choice` string (`yes`, `no`, or `abstain` for standard methods; a JSON-encoded ranked array for `ranked_choice`). The `weight` field, which defaults to 1.0, is increased when active delegations are in effect — the AppView computes effective weight from all active delegations before tallying results.

Delegation is the mechanism by which a member temporarily transfers their voting authority to a trusted peer. A `delegation` record names a delegator, a delegatee, and a `scope`: `project` (covers all proposals within a project) or `proposal` (covers only one specific proposal). Delegations can be revoked at any time by setting `status` to `revoked` and recording a `revokedAt` timestamp. `delegation` is DB-only — it has no ATProto write path.

---

### `network.coopsource.governance.proposal`

A governance proposal for cooperative decision-making. Written to the **cooperative's PDS** for open-governance cooperatives; stored in `private_record` (Tier 2) for closed-governance cooperatives, via `VisibilityRouter`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cooperativeDid` | did | Yes | The cooperative this proposal belongs to |
| `title` | string (max 256) | Yes | Short title of the proposal |
| `body` | string (max 10000) | Yes | Full text of the proposal |
| `proposalType` | string | Yes | Category: `amendment`, `budget`, `membership`, `policy`, `election`, `other` |
| `votingMethod` | string | Yes | How votes are counted: `simple_majority`, `supermajority`, `consensus`, `ranked_choice` |
| `options` | array of string (each max 256) | No | For `ranked_choice` or multi-option proposals, the list of options |
| `quorumRequired` | number (min 0, max 1) | No | Fraction of members required to vote (0–1) |
| `quorumBasis` | string | No | Whether quorum is measured against `votesCast` or `totalMembers` |
| `discussionEndsAt` | datetime | No | When the discussion period closes |
| `votingEndsAt` | datetime | No | When the voting period closes |
| `meetingEvent` | at-uri | No | Smoke Signal calendar event for the governance meeting |
| `fullDocument` | at-uri | No | WhiteWind blog entry with detailed rationale |
| `discussionThread` | at-uri | No | Frontpage link submission for community discussion |
| `status` | string | Yes | `draft`, `discussion`, `voting`, `passed`, `failed`, `withdrawn` |
| `createdAt` | datetime | Yes | When the proposal was created |

---

### `network.coopsource.governance.vote`

A vote cast on a governance proposal. Written to the **member's PDS** via `MemberWriteProxy`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `proposalUri` | at-uri | Yes | The proposal being voted on |
| `voterDid` | did | Yes | DID of the voter |
| `choice` | string (max 1000) | Yes | Vote choice: `yes`, `no`, or `abstain` for standard methods; JSON array for `ranked_choice` |
| `weight` | number (min 0) | No | Voting weight, defaults to 1.0; higher when delegations are active |
| `rationale` | string (max 2000) | No | Optional explanation of the voter's reasoning |
| `delegatedFrom` | did | No | DID of the delegator, if this vote was cast on behalf of someone else |
| `createdAt` | datetime | Yes | When the vote was cast |

---

### `network.coopsource.governance.delegation`

A transfer of voting authority from one project member to another. **DB-only** — no ATProto write path implemented.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectUri` | at-uri | Yes | The project this delegation applies to |
| `delegatorDid` | did | Yes | DID of the person delegating their vote |
| `delegateeDid` | did | Yes | DID of the person receiving the delegation |
| `scope` | string | Yes | Coverage of the delegation: `project` (all proposals) or `proposal` (one specific proposal) |
| `proposalUri` | at-uri | No | Specific proposal URI when `scope` is `proposal` |
| `status` | string | Yes | `active` or `revoked` |
| `revokedAt` | datetime | No | When the delegation was revoked |
| `createdAt` | datetime | Yes | When the delegation was created |

---

## Namespace: `agreement`

The `agreement` namespace defines the formal contract layer that governs how cooperatives and their members collaborate on projects. It models the full agreement lifecycle from initial drafting through execution, amendment, and contribution tracking.

A `master` agreement is the foundational document for a project. It establishes the governance framework under which the project operates — including decision method, quorum, voting threshold, and dispute resolution procedures — and records the agreement type (worker-cooperative, multi-stakeholder, open-source, and others), its effective dates, and the conditions under which it terminates. The master is written to the **cooperative's PDS** and anchors every other record in the agreement chain.

`stakeholderTerms` records describe each participating party's specific obligations and entitlements within a master agreement. A single master agreement will typically have multiple stakeholder terms records — one per party. Terms cover what each stakeholder contributes (labor, capital, IP, network access, or physical resources), how they are compensated (salary, share, dividend, or hourly), their IP ownership and licensing arrangement, their voting power and board representation rights, and the conditions and notice period for exit. Because these records may contain financially sensitive details, they are candidates for Tier 2 private storage depending on the cooperative's governance mode.

Every party who agrees to a master or stakeholder terms record signals their consent by writing a `signature` record to their **own PDS**. The signature identifies the agreement being signed, the signer's DID and optional role, the signature type (`digital`, `witnessed`, or `notarized`), and an embedded `signatureData` sub-object carrying the cryptographic method and proof. Collecting all required signatures constitutes full ratification.

`amendment` records propose changes to a ratified master agreement and link to a governance proposal for the voting process. An amendment captures the agreement's `fromVersion`, the intended `toVersion`, and an `amendmentChanges` object that records the before-and-after values of every field being changed as typed `fieldChange` pairs. Once the linked governance proposal passes, the amendment status advances to `approved` and then `applied`, at which point the master agreement's version number increments. Both `amendment` and `contribution` are DB-only records.

`contribution` records track the ongoing fulfillment of a stakeholder's obligations. Each contribution references the stakeholder terms it fulfills, specifies the contribution type, records an amount and units (hours, dollars, items, etc.), and carries a status that moves from `pending` through `in-progress` to `fulfilled` or `disputed`.

---

### `network.coopsource.agreement.master`

The foundational agreement governing a project. Written to the **cooperative's PDS**.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectUri` | at-uri | Yes | The project this agreement governs |
| `title` | string (max 255) | Yes | Agreement title |
| `version` | integer (min 1) | Yes | Version number; increments on each applied amendment |
| `purpose` | string (max 3000) | No | Statement of the agreement's purpose |
| `scope` | string (max 3000) | No | What activities and parties the agreement covers |
| `agreementType` | string | No | Template type: `worker-cooperative`, `multi-stakeholder`, `platform-cooperative`, `open-source`, `producer-cooperative`, `hybrid-member-investor`, `custom` |
| `effectiveDate` | datetime | No | When the agreement comes into force |
| `terminationDate` | datetime | No | Scheduled termination date, if any |
| `governanceFramework` | `governanceFramework` | No | Embedded governance rules for the project |
| `terminationConditions` | array of string (each max 2000) | No | Conditions that trigger termination |
| `status` | string | Yes | `draft`, `active`, `amended`, `terminated` |
| `createdAt` | datetime | Yes | When the record was created |
| `updatedAt` | datetime | No | When the record was last updated |

#### Sub-definition: `governanceFramework`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `decisionMethod` | string | No | `consensus`, `majority-vote`, `supermajority`, `weighted-vote` |
| `quorum` | integer (min 0, max 100) | No | Quorum percentage required |
| `votingThreshold` | integer (min 0, max 100) | No | Voting threshold percentage |
| `disputeResolution` | string (max 3000) | No | How disputes are resolved |
| `modificationProcess` | string (max 3000) | No | Process for modifying the agreement |

---

### `network.coopsource.agreement.stakeholderTerms`

The specific obligations and entitlements for one party within a master agreement. Written to the **cooperative's PDS**.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `masterAgreementUri` | at-uri | Yes | The master agreement these terms belong to |
| `stakeholderDid` | did | Yes | DID of the stakeholder party |
| `stakeholderType` | string | Yes | `worker`, `investor`, `customer`, `supplier`, `community`, `partner` |
| `contributions` | array of `termsContribution` | No | What this stakeholder contributes |
| `financialTerms` | `financialTerms` | No | Compensation and profit-sharing terms |
| `ipTerms` | `ipTerms` | No | Intellectual property ownership and licensing |
| `governanceRights` | `governanceRights` | No | Voting power and board representation |
| `exitTerms` | `exitTerms` | No | Conditions and mechanics for exit |
| `createdAt` | datetime | Yes | When these terms were created |

#### Sub-definition: `termsContribution`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | `labor`, `capital`, `resources`, `intellectual-property`, `network` |
| `description` | string (max 2000) | Yes | Description of the contribution |
| `amount` | string (max 500) | No | Quantification of the contribution |

#### Sub-definition: `financialTerms`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `compensationType` | string | No | `salary`, `share`, `dividend`, `hourly`, `other` |
| `compensationAmount` | integer | No | Amount in smallest currency unit (e.g. cents) |
| `currency` | string (max 10) | No | Currency code |
| `paymentSchedule` | string (max 500) | No | When and how payments are made |
| `profitShare` | integer (min 0, max 100) | No | Profit share percentage |
| `equityStake` | integer (min 0, max 100) | No | Equity stake percentage |

#### Sub-definition: `ipTerms`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ownership` | string | No | IP ownership model: `individual`, `collective`, `shared` |
| `licensing` | string (max 2000) | No | Licensing terms and conditions |

#### Sub-definition: `governanceRights`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `votingPower` | integer (min 0, max 100) | No | Voting power percentage |
| `boardSeat` | boolean | No | Whether this stakeholder holds a board seat |
| `decisionCategories` | array of string (each max 500) | No | Categories of decisions this stakeholder can vote on |

#### Sub-definition: `exitTerms`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `buybackPrice` | string (max 500) | No | Formula or amount for buying back this stakeholder's stake |
| `noticePeriodDays` | integer (min 0) | No | Days of notice required before exiting |
| `conditions` | string (max 3000) | No | Conditions governing exit |

---

### `network.coopsource.agreement.signature`

A digital signature signaling a party's consent to an agreement or stakeholder terms. Written to the **signer's PDS** via `MemberWriteProxy`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agreementUri` | at-uri | Yes | The agreement or terms being signed |
| `signerDid` | did | Yes | DID of the signer |
| `signerRole` | string (max 255) | No | The signer's role in the agreement (e.g. "Treasurer") |
| `signatureType` | string | Yes | `digital`, `witnessed`, `notarized` |
| `signatureData` | `signatureData` | No | Embedded cryptographic proof details |
| `signedAt` | datetime | Yes | When the signature was applied |

#### Sub-definition: `signatureData`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `method` | string | Yes | Signing method: `atproto-did-proof`, `timestamp`, `cryptographic-hash` |
| `proof` | string (max 10000) | No | The cryptographic proof material |
| `timestamp` | datetime | Yes | Timestamp of the signature |
| `witnessDids` | array of did | No | DIDs of witnesses, if applicable |

---

### `network.coopsource.agreement.amendment`

A proposed change to a ratified master agreement, linked to a governance proposal for voting. **DB-only** — no ATProto write path implemented.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agreementUri` | at-uri | Yes | The master agreement being amended |
| `proposalUri` | at-uri | No | The governance proposal for voting on this amendment |
| `title` | string (max 255) | Yes | Amendment title |
| `description` | string (max 10000) | Yes | Full description of the proposed changes |
| `changes` | `amendmentChanges` | Yes | Field-level before-and-after values |
| `status` | string | Yes | `proposed`, `voting`, `approved`, `applied`, `rejected` |
| `fromVersion` | integer (min 1) | Yes | Agreement version this amendment applies to |
| `toVersion` | integer (min 2) | No | Agreement version after the amendment is applied |
| `proposedAt` | datetime | Yes | When the amendment was proposed |
| `appliedAt` | datetime | No | When the amendment was applied to the agreement |

#### Sub-definition: `amendmentChanges`

Each field in `amendmentChanges` maps to a `fieldChange` object capturing the before and after value for that field.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | `fieldChange` | No | Change to the agreement's title |
| `purpose` | `fieldChange` | No | Change to the agreement's purpose |
| `scope` | `fieldChange` | No | Change to the agreement's scope |
| `governanceFramework` | `fieldChange` | No | Change to the governance framework |
| `disputeResolution` | `fieldChange` | No | Change to the dispute resolution clause |
| `amendmentProcess` | `fieldChange` | No | Change to the amendment process description |
| `terminationConditions` | `fieldChange` | No | Change to termination conditions |

#### Sub-definition: `fieldChange`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `from` | unknown | Yes | Previous value of the field |
| `to` | unknown | Yes | New value of the field |

---

### `network.coopsource.agreement.contribution`

A tracked fulfillment event for a stakeholder's obligations under their terms. **DB-only** — no ATProto write path implemented.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `stakeholderTermsUri` | at-uri | Yes | The stakeholder terms record this contribution fulfills |
| `contributionType` | string | Yes | `labor`, `capital`, `resources`, `intellectual-property`, `network` |
| `description` | string (max 3000) | Yes | Description of what was contributed |
| `amount` | string (max 500) | No | Quantification of the contribution |
| `units` | string (max 100) | No | Unit of measurement (e.g. hours, dollars, items) |
| `startDate` | datetime | No | When the contribution period began |
| `endDate` | datetime | No | When the contribution period ended |
| `status` | string | Yes | `pending`, `in-progress`, `fulfilled`, `disputed` |

---

## Namespace: `network.coopsource.funding`

The funding namespace lets cooperatives and projects raise money from supporters. A campaign specifies a goal amount, a campaign type (`rewards`, `patronage`, `donation`, `revenue_share`), and a funding model (`all_or_nothing` or `keep_it_all`). Members back campaigns by creating pledge records in their own PDS. Both records are written via `pdsService` by the creating member rather than by the cooperative's OperatorWriteProxy.

---

### `network.coopsource.funding.campaign`

A crowdfunding campaign for a cooperative, project, or the network. Written to the **member's PDS**.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `beneficiaryUri` | string | Yes | AT URI of the cooperative/project, or `'network:coopsource'` for network-level campaigns |
| `title` | string (max 256) | Yes | Campaign title |
| `description` | string (max 5000) | No | Campaign description |
| `tier` | string | Yes | Level at which the campaign operates: `network`, `cooperative`, `project` |
| `campaignType` | string | Yes | Type of crowdfunding: `rewards`, `patronage`, `donation`, `revenue_share` |
| `goalAmount` | integer (min 1) | Yes | Funding goal in cents |
| `goalCurrency` | string (max 10) | Yes | ISO 4217 currency code |
| `amountRaised` | integer (min 0) | No | Total amount raised so far, in cents |
| `backerCount` | integer (min 0) | No | Number of backers |
| `fundingModel` | string | Yes | How funds are collected: `all_or_nothing`, `keep_it_all` |
| `status` | string | Yes | `draft`, `active`, `funded`, `completed`, `cancelled` |
| `startDate` | datetime | No | Campaign start date |
| `endDate` | datetime | No | Campaign end date |
| `metadata` | unknown | No | Additional campaign data (reward tiers, images, tags) |
| `createdAt` | datetime | Yes | Creation timestamp |

---

### `network.coopsource.funding.pledge`

A pledge or contribution to a crowdfunding campaign. Written to the **member's PDS**.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `campaignUri` | at-uri | Yes | The campaign this pledge is for |
| `backerDid` | did | Yes | DID of the backer |
| `amount` | integer (min 1) | Yes | Pledge amount in cents |
| `currency` | string (max 10) | Yes | ISO 4217 currency code |
| `paymentStatus` | string | Yes | `pending`, `completed`, `failed`, `refunded` |
| `metadata` | unknown | No | Additional pledge data (reward tier selection, etc.) |
| `createdAt` | datetime | Yes | Creation timestamp |

---

## Namespace: `network.coopsource.alignment`

The alignment namespace gives projects a structured way to surface and reconcile stakeholder interests. Members declare their interests (priorities, contributions, constraints, and red lines) and propose outcomes with measurable success criteria. The platform can compute an interest map that identifies alignment and conflict zones across all stakeholder declarations, optionally with AI-generated analysis and mediation suggestions. `interestMap` and `stakeholder` are stored in PostgreSQL only and have no ATProto write path.

---

### `network.coopsource.alignment.interest`

A stakeholder's detailed interests, contributions, constraints, and red lines for a project. Written to the **member's PDS**.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectUri` | at-uri | Yes | The project this interest declaration relates to |
| `interests` | array of `interestItem` | Yes | Detailed interests and goals |
| `contributions` | array of `contributionItem` | No | What the stakeholder can bring to the project |
| `constraints` | array of `constraintItem` | No | Limitations or conditions |
| `redLines` | array of `redLineItem` | No | Non-negotiable boundaries |
| `preferences` | `workPreferences` | No | Work style and decision-making preferences |
| `createdAt` | datetime | Yes | Creation timestamp |
| `updatedAt` | datetime | No | Last update timestamp |

#### Sub-definition: `interestItem`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `category` | string (max 100) | Yes | Category label for this interest |
| `description` | string (max 2000) | Yes | Detailed description of the interest |
| `priority` | integer (1–5) | Yes | Priority level, 1 = lowest, 5 = highest |
| `scope` | string | No | Time horizon: `short-term`, `medium-term`, `long-term` |

#### Sub-definition: `contributionItem`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | `skill`, `resource`, `capital`, `network`, `time` |
| `description` | string (max 2000) | Yes | Description of the contribution |
| `capacity` | string (max 500) | No | Estimated availability |

#### Sub-definition: `constraintItem`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `description` | string (max 2000) | Yes | Description of the constraint |
| `hardConstraint` | boolean | No | Whether this is a hard (non-flexible) constraint |

#### Sub-definition: `redLineItem`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `description` | string (max 2000) | Yes | Description of the red line |
| `reason` | string (max 2000) | No | Explanation of why this is a red line |

#### Sub-definition: `workPreferences`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `decisionMaking` | string (max 500) | No | Preferred decision-making style |
| `communication` | string (max 500) | No | Preferred communication style |
| `pace` | string (max 500) | No | Preferred work pace |

---

### `network.coopsource.alignment.outcome`

A desired outcome for a project, with success criteria and stakeholder support tracking. Written to the **member's PDS**.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectUri` | at-uri | Yes | The project this outcome belongs to |
| `title` | string (max 255) | Yes | Outcome title |
| `description` | string (max 3000) | Yes | Detailed description of the desired outcome |
| `category` | string | Yes | `financial`, `social`, `environmental`, `governance`, `other` |
| `successCriteria` | array of `successCriterion` | No | Measurable criteria for achieving this outcome |
| `stakeholderSupport` | array of `supportEntry` | No | Support levels from individual stakeholders |
| `status` | string | Yes | `proposed`, `endorsed`, `active`, `achieved`, `abandoned` |
| `createdAt` | datetime | Yes | Creation timestamp |

#### Sub-definition: `successCriterion`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `metric` | string (max 500) | Yes | The measurable metric |
| `target` | string (max 500) | Yes | The target value or threshold |
| `timeline` | string (max 200) | No | When this criterion should be met |
| `ownerDid` | did | No | DID of the person responsible for this criterion |

#### Sub-definition: `supportEntry`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `stakeholderDid` | did | Yes | DID of the stakeholder |
| `supportLevel` | string | Yes | `strong`, `moderate`, `conditional`, `neutral`, `opposed` |
| `conditions` | string (max 2000) | No | Conditions attached to conditional support |

---

### `network.coopsource.alignment.interestMap`

A computed map of alignment and conflict zones across stakeholder interests for a project. **DB-only** — no ATProto write path.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectUri` | at-uri | Yes | The project this map covers |
| `alignmentZones` | array of `alignmentZone` | No | Areas where stakeholders agree |
| `conflictZones` | array of `conflictZone` | No | Areas of tension between stakeholders |
| `aiAnalysis` | `aiAnalysis` | No | Optional AI-generated analysis |
| `createdAt` | datetime | Yes | Creation timestamp |

#### Sub-definition: `alignmentZone`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `participants` | array of did | Yes | DIDs of stakeholders in this alignment zone |
| `description` | string (max 2000) | Yes | Description of the shared area of agreement |
| `strength` | integer (0–100) | Yes | Overlap percentage |
| `interestsInvolved` | array of string (max 500 each) | No | Interest labels involved in this zone |

#### Sub-definition: `conflictZone`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `stakeholders` | array of did | Yes | DIDs of stakeholders in tension |
| `description` | string (max 2000) | Yes | Description of the conflict |
| `severity` | string | Yes | `low`, `medium`, `high` |
| `potentialSolutions` | array of string (max 1000 each) | No | Suggested ways to resolve the conflict |

#### Sub-definition: `aiAnalysis`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `summary` | string (max 5000) | No | AI-generated summary of stakeholder alignment |
| `recommendations` | array of string (max 2000 each) | No | AI-generated recommendations |
| `mediationSuggestions` | array of string (max 2000 each) | No | AI-generated mediation suggestions |

---

### `network.coopsource.alignment.stakeholder`

A stakeholder profile within a project, describing their role and background. **DB-only** — no ATProto write path.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectUri` | at-uri | Yes | The project this stakeholder belongs to |
| `name` | string (max 255) | Yes | Display name of the stakeholder |
| `role` | string (max 100) | Yes | Stakeholder category: `worker`, `investor`, `customer`, `partner`, `supplier`, `community`, `other` |
| `stakeholderClass` | string (max 100) | No | Subclass for more specific categorization |
| `description` | string (max 3000) | No | Background and context about this stakeholder |
| `interestsSummary` | string (max 1000) | No | Brief overview of what they care about |
| `createdAt` | datetime | Yes | Creation timestamp |

---

## Namespace: `network.coopsource.ops`

The ops namespace covers cooperative work coordination. The cooperative creates `task` records via OperatorWriteProxy; members signal acceptance by writing a `taskAcceptance` record — mirroring the bilateral membership pattern. `schedule` records track shifts and are also written to the cooperative's PDS. `timeEntry` is a Tier 2 private record stored exclusively in `private_record` and never emitted on the firehose. Note that `taskAcceptance` and `timeEntry` are DB-only in the current implementation. The lexicon identifier is `ops.schedule`; some internal code paths refer to this as `ops.scheduleShift`.

---

### `network.coopsource.ops.task`

A task definition in a cooperative's work coordination system. Written to the **cooperative's PDS**.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cooperativeDid` | did | Yes | The cooperative this task belongs to |
| `projectId` | string | No | Project entity ID |
| `title` | string (max 255) | Yes | Task title |
| `description` | string (max 10000) | No | Full task description |
| `status` | string | Yes | `backlog`, `todo`, `in_progress`, `in_review`, `done`, `cancelled` |
| `priority` | string | Yes | `urgent`, `high`, `medium`, `low` |
| `assigneeDids` | array of did (max 20) | No | DIDs of assigned members |
| `dueDate` | datetime | No | Task due date |
| `labels` | array of string max 50 (max 20) | No | Categorization labels |
| `linkedProposal` | at-uri | No | AT URI of a linked governance proposal |
| `createdBy` | did | Yes | DID of the task creator |
| `createdAt` | datetime | Yes | Creation timestamp |

---

### `network.coopsource.ops.taskAcceptance`

A member's acceptance of a task assignment. **DB-only** — mirrors the bilateral membership pattern but not yet written to the member's live PDS.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `taskUri` | at-uri | Yes | AT URI of the task record being accepted |
| `cooperativeDid` | did | Yes | The cooperative this task belongs to |
| `note` | string (max 2000) | No | Optional note from the accepting member |
| `createdAt` | datetime | Yes | Creation timestamp |

---

### `network.coopsource.ops.schedule`

A shift or schedule entry in a cooperative's work schedule. Written to the **cooperative's PDS**. The lexicon ID is `ops.schedule`; the code sometimes refers to this collection as `ops.scheduleShift`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cooperativeDid` | did | Yes | The cooperative this schedule entry belongs to |
| `title` | string (max 255) | Yes | Shift or schedule entry title |
| `description` | string (max 2000) | No | Additional details |
| `assignedDid` | did | No | DID of the member assigned to this shift |
| `startsAt` | datetime | Yes | Shift start time |
| `endsAt` | datetime | Yes | Shift end time |
| `recurrence` | string (max 50) | No | Recurrence rule (e.g. iCal RRULE string) |
| `location` | string (max 500) | No | Physical or virtual location |
| `status` | string | No | `open`, `assigned`, `completed`, `cancelled` |
| `calendarEventRef` | at-uri | No | Reference to a Smoke Signal calendar event |
| `createdBy` | did | Yes | DID of the creator |
| `createdAt` | datetime | Yes | Creation timestamp |

---

### `network.coopsource.ops.timeEntry`

A time entry recording work hours. **DB-only** (Tier 2 private) — stored in `private_record` table, never emitted on the firehose.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cooperativeDid` | did | Yes | The cooperative context for this time entry |
| `memberDid` | did | Yes | DID of the member who performed the work |
| `taskId` | string | No | ID of the related task |
| `projectId` | string | No | ID of the related project |
| `description` | string (max 2000) | No | Description of work performed |
| `startedAt` | datetime | Yes | When work started |
| `endedAt` | datetime | No | When work ended |
| `durationMinutes` | integer (1–1440) | No | Duration of work in minutes |
| `status` | string | No | `draft`, `submitted`, `approved`, `rejected` |
| `createdAt` | datetime | Yes | Creation timestamp |

---

## Namespace: `network.coopsource.finance`

Financial records are all Tier 2 private — stored in `private_record` and never broadcast on the firehose. The `expense` → `expenseApproval` flow mirrors the bilateral task pattern: a member submits an expense claim and an authorized reviewer writes an approval or rejection record. `revenue` records track cooperative income with optional period attribution.

---

### `network.coopsource.finance.expense`

An expense claim submitted by a member. **DB-only** (Tier 2 private).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cooperativeDid` | did | Yes | The cooperative this expense is submitted to |
| `memberDid` | did | Yes | DID of the member submitting the expense |
| `categoryId` | string | No | Internal expense category ID |
| `title` | string (max 255) | Yes | Expense title |
| `description` | string (max 2000) | No | Details about the expense |
| `amount` | number (min 0) | Yes | Expense amount |
| `currency` | string (max 10) | Yes | ISO 4217 currency code |
| `receiptBlobCid` | cid-link | No | CID of the uploaded receipt blob |
| `status` | string | No | `draft`, `submitted`, `approved`, `rejected`, `reimbursed` |
| `createdAt` | datetime | Yes | Creation timestamp |

---

### `network.coopsource.finance.expenseApproval`

Cooperative approval or rejection of an expense claim. **DB-only** (Tier 2 private).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cooperativeDid` | did | Yes | The cooperative processing the approval |
| `expenseId` | string | Yes | ID of the expense record being reviewed |
| `action` | string | Yes | `approve`, `reject` |
| `reviewedBy` | did | Yes | DID of the officer or authorized reviewer |
| `note` | string (max 1000) | No | Reviewer note or explanation |
| `createdAt` | datetime | Yes | Creation timestamp |

---

### `network.coopsource.finance.revenue`

A revenue entry recording cooperative income. **DB-only** (Tier 2 private).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cooperativeDid` | did | Yes | The cooperative this revenue belongs to |
| `projectId` | string | No | ID of the related project |
| `title` | string (max 255) | Yes | Revenue entry title |
| `description` | string (max 2000) | No | Details about the revenue |
| `amount` | number (min 0) | Yes | Revenue amount |
| `currency` | string (max 10) | Yes | ISO 4217 currency code |
| `source` | string (max 100) | No | Revenue source label |
| `sourceReference` | string (max 500) | No | External reference (invoice number, transaction ID, etc.) |
| `recordedBy` | did | Yes | DID of the person recording this entry |
| `recordedAt` | datetime | No | When the revenue was recorded |
| `periodStart` | datetime | No | Start of the revenue period |
| `periodEnd` | datetime | No | End of the revenue period |
| `createdAt` | datetime | Yes | Creation timestamp |

---

## Namespace: `network.coopsource.admin`

The admin namespace covers cooperative governance housekeeping: officer appointments, regulatory compliance tracking, member communications, and fiscal year management. All four lexicons are DB-only.

---

### `network.coopsource.admin.officer`

An officer appointment record for a cooperative. **DB-only**.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cooperativeDid` | did | Yes | The cooperative this officer serves |
| `officerDid` | did | Yes | DID of the appointed officer |
| `title` | string | Yes | `president`, `secretary`, `treasurer`, `director`, `other` |
| `appointedAt` | datetime | Yes | When the officer was appointed or elected |
| `termEndsAt` | datetime | No | When the officer's term ends |
| `appointmentType` | string | Yes | `elected`, `appointed` |
| `responsibilities` | string (max 3000) | No | Description of the officer's responsibilities |
| `status` | string | Yes | `active`, `ended` |
| `createdAt` | datetime | Yes | Creation timestamp |

---

### `network.coopsource.admin.complianceItem`

A compliance calendar item tracking regulatory deadlines and filings. **DB-only**.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cooperativeDid` | did | Yes | The cooperative this item belongs to |
| `title` | string (max 255) | Yes | Item title |
| `description` | string (max 3000) | No | Details about the filing or requirement |
| `dueDate` | datetime | Yes | When the filing or report is due |
| `filingType` | string | Yes | `annual_report`, `tax_filing`, `state_report`, `other` |
| `status` | string | Yes | `pending`, `completed`, `overdue` |
| `completedAt` | datetime | No | When this item was completed |
| `createdAt` | datetime | Yes | Creation timestamp |

---

### `network.coopsource.admin.memberNotice`

A notice sent to members of a cooperative. **DB-only**.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cooperativeDid` | did | Yes | The cooperative sending the notice |
| `title` | string (max 255) | Yes | Notice title |
| `body` | string (max 10000) | Yes | Full text of the notice |
| `noticeType` | string | Yes | `general`, `election`, `meeting`, `policy_change`, `other` |
| `targetAudience` | string | Yes | `all`, `board`, `officers` |
| `sentAt` | datetime | No | When the notice was sent |
| `createdAt` | datetime | Yes | Creation timestamp |

---

### `network.coopsource.admin.fiscalPeriod`

A fiscal period (e.g. fiscal year) for a cooperative. **DB-only**.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cooperativeDid` | did | Yes | The cooperative this fiscal period belongs to |
| `label` | string (max 100) | Yes | Human-readable label (e.g. `FY2026`) |
| `startsAt` | datetime | Yes | Start of the fiscal period |
| `endsAt` | datetime | Yes | End of the fiscal period |
| `status` | string | Yes | `open`, `closed` |
| `createdAt` | datetime | Yes | Creation timestamp |

---

## Namespace: `network.coopsource.legal`

The legal namespace stores versioned foundational documents and meeting records for cooperatives. Both lexicons are DB-only.

---

### `network.coopsource.legal.document`

A foundational legal document (bylaws, articles, policies, resolutions) for a cooperative. **DB-only**.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cooperativeDid` | did | Yes | The cooperative this document belongs to |
| `title` | string (max 255) | Yes | Document title |
| `body` | string (max 50000) | No | Full text of the document |
| `documentType` | string | Yes | `bylaws`, `articles`, `policy`, `resolution`, `other` |
| `version` | integer (min 1) | Yes | Monotonically increasing version number |
| `previousVersion` | at-uri | No | AT URI of the previous version in the chain |
| `bodyFormat` | string (max 50) | No | Format of the body text: `markdown`, `plain`, `html` |
| `status` | string | Yes | `draft`, `active`, `superseded`, `archived` |
| `createdAt` | datetime | Yes | Creation timestamp |

---

### `network.coopsource.legal.meetingRecord`

A record of a cooperative meeting with minutes, attendance, and resolutions. **DB-only**.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cooperativeDid` | did | Yes | The cooperative this meeting belongs to |
| `title` | string (max 255) | Yes | Meeting title |
| `meetingDate` | datetime | Yes | When the meeting took place |
| `meetingType` | string | Yes | `board`, `general`, `special`, `committee` |
| `attendees` | array of did | No | DIDs of members who attended |
| `quorumMet` | boolean | No | Whether quorum was achieved |
| `resolutions` | array of string (max 2000 each) | No | Resolutions passed during the meeting |
| `minutes` | string (max 50000) | No | Full text of the meeting minutes |
| `certifiedBy` | did | No | DID of the person who certified the minutes |
| `createdAt` | datetime | Yes | Creation timestamp |

---

## Namespace: `network.coopsource.commerce`

The commerce namespace enables marketplace activity across the cooperative ecosystem. Cooperatives publish `listing` and `need` records to advertise what they offer and what they require, and `resource` records to make shared assets bookable by network members. `collaborativeProject` records signal cross-cooperative initiatives visible on the firehose. `intercoopAgreement` is bilateral: each cooperative writes its own copy to its PDS. Most records flow through OperatorWriteProxy. The lexicon ID is `commerce.resource`; some code paths refer to this collection as `commerce.sharedResource`.

---

### `network.coopsource.commerce.listing`

A service or product offering published by a cooperative. Written to the **cooperative's PDS**.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cooperativeDid` | did | Yes | The cooperative publishing this listing |
| `title` | string (max 255) | Yes | Listing title |
| `description` | string (max 5000) | No | Detailed description of the offering |
| `category` | string (max 100) | Yes | Category label |
| `availability` | string | No | `available`, `limited`, `unavailable` |
| `location` | string (max 500) | No | Geographic or service area |
| `cooperativeType` | string (max 100) | No | Type of cooperative producing this offering |
| `tags` | array of string max 50 (max 20) | No | Searchable tags |
| `createdBy` | did | Yes | DID of the member who created the listing |
| `createdAt` | datetime | Yes | Creation timestamp |

---

### `network.coopsource.commerce.need`

A request for services or products published by a cooperative. Written to the **cooperative's PDS**.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cooperativeDid` | did | Yes | The cooperative publishing this need |
| `title` | string (max 255) | Yes | Need title |
| `description` | string (max 5000) | No | Detailed description of what is needed |
| `category` | string (max 100) | Yes | Category label |
| `urgency` | string | No | `low`, `normal`, `high`, `urgent` |
| `location` | string (max 500) | No | Geographic or service area |
| `tags` | array of string max 50 (max 20) | No | Searchable tags |
| `createdBy` | did | Yes | DID of the member who created the need |
| `createdAt` | datetime | Yes | Creation timestamp |

---

### `network.coopsource.commerce.resource`

A shared resource listing bookable by network members. Written to the **cooperative's PDS**. The lexicon ID is `commerce.resource`; some code paths call this `commerce.sharedResource`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cooperativeDid` | did | Yes | The cooperative offering this resource |
| `title` | string (max 255) | Yes | Resource title |
| `description` | string (max 5000) | No | Description of the resource |
| `resourceType` | string | Yes | `equipment`, `space`, `expertise`, `vehicle`, `other` |
| `location` | string (max 500) | No | Physical or virtual location |
| `status` | string | No | `available`, `reserved`, `unavailable` |
| `createdBy` | did | Yes | DID of the member who created the listing |
| `createdAt` | datetime | Yes | Creation timestamp |

---

### `network.coopsource.commerce.collaborativeProject`

A cross-cooperative project record, signaling ecosystem collaboration on the firehose. Written to the **cooperative's PDS**.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `hostCooperativeDid` | did | Yes | DID of the cooperative hosting the project |
| `title` | string (max 255) | Yes | Project title |
| `description` | string (max 10000) | No | Project description |
| `participantDids` | array of did (max 50) | Yes | DIDs of all participating cooperatives |
| `status` | string | No | `planning`, `active`, `completed`, `cancelled` |
| `createdBy` | did | Yes | DID of the member who created the record |
| `createdAt` | datetime | Yes | Creation timestamp |

---

### `network.coopsource.commerce.intercoopAgreement`

A bilateral B2B agreement between two cooperatives. Each cooperative writes its own copy to its PDS. Written to the **cooperative's PDS**.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `initiatorDid` | did | Yes | DID of the cooperative that initiated the agreement |
| `responderDid` | did | Yes | DID of the cooperative that is the counterparty |
| `title` | string (max 255) | Yes | Agreement title |
| `description` | string (max 10000) | No | Agreement description |
| `agreementType` | string | Yes | `service`, `supply`, `joint_venture`, `procurement`, `resource_sharing`, `other` |
| `status` | string | No | `proposed`, `negotiating`, `active`, `completed`, `cancelled` |
| `createdAt` | datetime | Yes | Creation timestamp |

---

## Namespace: `network.coopsource.connection`

The connection namespace manages external OAuth service integrations. A `link` record (written to the member's PDS) declares that the user has connected an external service such as GitHub or Google. `binding` and `sync` are DB-only: `binding` maps a linked service's resource to a project, and `sync` records discrete synchronization events for a binding.

---

### `network.coopsource.connection.link`

An external service connection linked to a user's account. Written to the **member's PDS**.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `service` | string | Yes | External service provider: `github`, `google` |
| `status` | string | Yes | `active`, `revoked`, `expired` |
| `metadata` | `metadata` | No | Metadata about the external service account |
| `createdAt` | datetime | Yes | Creation timestamp |

#### Sub-definition: `metadata`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `username` | string (max 255) | No | Username on the external service |
| `email` | string (max 255) | No | Email address on the external service |
| `scopes` | array of string (max 255 each) | No | OAuth scopes granted |

---

### `network.coopsource.connection.binding`

A binding between an external resource and a project. **DB-only**.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `connectionUri` | at-uri | Yes | The external connection this binding belongs to |
| `projectUri` | at-uri | Yes | The project this resource is bound to |
| `resourceType` | string | Yes | `github_repo`, `google_doc`, `google_sheet`, `google_drive_folder` |
| `resourceId` | string (max 1000) | Yes | External identifier for the resource |
| `metadata` | `resourceMetadata` | No | Display metadata for the bound resource |
| `createdAt` | datetime | Yes | Creation timestamp |

#### Sub-definition: `resourceMetadata`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `displayName` | string (max 500) | No | Human-readable name of the resource |
| `url` | string (max 2000) | No | URL to access the resource |
| `description` | string (max 2000) | No | Description of the resource |

---

### `network.coopsource.connection.sync`

A synchronization event for a connection binding. **DB-only** — placeholder for Phase 3 sync implementation.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `bindingUri` | at-uri | Yes | The connection binding this sync event relates to |
| `eventType` | string | Yes | `push`, `pull`, `webhook` |
| `timestamp` | datetime | Yes | When the sync event occurred |
| `payload` | object | No | Event-specific data |
