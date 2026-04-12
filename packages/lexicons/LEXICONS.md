# Co-op Source Network Lexicon Reference

Co-op Source Network is a federated collaboration platform built on the AT Protocol. These 45 lexicon schemas define the record types and queries that cooperatives, their members, and external applications use to interact with the platform. All schemas live under the `network.coopsource.*` namespace and are organized into 11 sub-namespaces covering organizational structure, governance, agreements, finance, operations, commerce, alignment, funding, connections, administration, and legal records.

Records of authority live in PDS (Personal Data Server) repositories. Members write records like memberships, votes, and signatures to their own PDS; cooperatives write records like approvals, proposals, and tasks to theirs. PostgreSQL serves as a materialized index for queries -- the AppView consumes these records from the ATProto firehose and indexes them for fast lookups. Some record types are stored only in the database (DB-only) because they contain private data that must never appear on the firehose, or because their ATProto write path is not yet implemented.

The JSON schema files are located alongside this document in the [`network/coopsource/`](./network/coopsource/) directory tree. Each file follows the [Lexicon v1 specification](https://atproto.com/specs/lexicon). The generated TypeScript types for these schemas are produced by running `pnpm --filter @coopsource/lexicons lex:generate`.

## Record Ownership Matrix

| Member's PDS | Cooperative's PDS | DB-only |
|---|---|---|
| `org.membership` | `org.cooperative` | `org.project` |
| `governance.vote` | `org.memberApproval` | `org.team` |
| `agreement.signature` | `governance.proposal` * | `org.role` |
| `alignment.interest` | `agreement.master` | `governance.delegation` |
| `alignment.outcome` | `agreement.stakeholderTerms` | `agreement.amendment` |
| `funding.pledge` | `commerce.intercoopAgreement` | `agreement.contribution` |
| `funding.campaign` | `ops.task` | `alignment.interestMap` |
| `connection.link` | `ops.schedule` | `alignment.stakeholder` |
| | `commerce.listing` | `admin.officer` |
| | `commerce.need` | `admin.complianceItem` |
| | `commerce.resource` | `admin.memberNotice` |
| | `commerce.collaborativeProject` | `admin.fiscalPeriod` |
| | | `legal.document` |
| | | `legal.meetingRecord` |
| | | `finance.expense` |
| | | `finance.expenseApproval` |
| | | `finance.revenue` |
| | | `ops.taskAcceptance` |
| | | `ops.timeEntry` |
| | | `connection.binding` |
| | | `connection.sync` |

\* `governance.proposal` uses the VisibilityRouter: open-governance cooperatives write proposals to their PDS (Tier 1 public), while closed-governance cooperatives store them in the `private_record` table (Tier 2 private).

**Note:** The four XRPC query schemas (`org.getCooperative`, `org.getMembership`, `governance.listProposals`, `governance.getProposal`) are not records and do not have an ownership location -- they are read-only endpoints served by the AppView.

## Data Tiers

**Tier 1 -- Public ATProto.** Records written to a PDS repo and broadcast on the relay firehose. Any ATProto participant can consume them. All records in the "Member's PDS" and "Cooperative's PDS" columns above are Tier 1 (except `governance.proposal` in closed-governance mode).

**Tier 2 -- Private PostgreSQL.** Records stored in the `private_record` table or as plain database rows. Never on the firehose. All finance records, `ops.timeEntry`, and all DB-only records fall into this tier. Some DB-only records have declarative hook configs for future AppView indexing but no ATProto write path yet.

**Tier 3 -- End-to-End Encrypted.** Board-confidential discussions, salary records, and personnel matters. Handled via Germ DM / MLS protocol. Not represented in these lexicon schemas -- the platform facilitates key exchange but never handles content.

---

## `org` -- Organization

The `org` namespace defines the core organizational building blocks: cooperatives, memberships, and internal structure. The central mechanism is **bilateral membership**: a member entity writes a `membership` record to their own PDS declaring intent to join a cooperative, and the cooperative writes a `memberApproval` record to its PDS confirming the membership. The AppView indexes both records and transitions the membership to `active` status only when both sides exist. Either record can arrive first -- the AppView state machine handles out-of-order arrival by tracking intermediate states (`pending_member` when only the membership exists, `pending_approval` when only the approval exists). Deleting either record transitions the membership to `revoked`.

Role authority lives exclusively in `memberApproval`, never in the `membership` record. Members cannot self-declare roles. Below the cooperative level, `project`, `team`, and `role` records define internal structure -- projects belong to cooperatives, teams belong to projects, and roles can belong to either cooperatives or projects. These three structural records are DB-only; they are not written to any PDS.

This namespace also includes two XRPC query schemas (`getCooperative` and `getMembership`) that provide read-only AppView endpoints for public cooperative metadata and membership status checks.

### `network.coopsource.org.cooperative`

A cooperative organization. Written to the **cooperative's PDS** via OperatorWriteProxy.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string (max 255) | Yes | |
| `description` | string (max 3000) | No | |
| `logoUrl` | string (uri, max 2000) | No | |
| `website` | string (uri, max 2000) | No | |
| `status` | string | Yes | Known values: `active`, `inactive`, `dissolved` |
| `createdAt` | datetime | Yes | |

### `network.coopsource.org.membership`

A membership record created by the member entity in their own PDS. Represents one side of a bilateral membership; the cooperative must also create a `memberApproval` record for the membership to become active. Written to the **member's PDS** via MemberWriteProxy.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cooperative` | did | Yes | The DID of the cooperative being joined |
| `createdAt` | datetime | Yes | |

### `network.coopsource.org.memberApproval`

An approval record created by the cooperative in its PDS. Represents the cooperative's side of a bilateral membership. Role authority lives here, never in the membership record. Written to the **cooperative's PDS** via OperatorWriteProxy.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `member` | did | Yes | The DID of the approved member entity (person or cooperative) |
| `roles` | string[] | No | Roles assigned by the cooperative to this member |
| `createdAt` | datetime | Yes | |

### `network.coopsource.org.project`

A project, optionally linked to a cooperative. **DB-only.**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string (max 255) | Yes | |
| `description` | string (max 3000) | No | |
| `cooperativeUri` | at-uri | No | Parent cooperative, if any |
| `status` | string | Yes | Known values: `active`, `completed`, `on-hold`, `cancelled` |
| `visibility` | string | Yes | Known values: `public`, `members`, `private` |
| `createdAt` | datetime | Yes | |

### `network.coopsource.org.team`

A team within a project. **DB-only.**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string (max 255) | Yes | |
| `projectUri` | at-uri | Yes | The project this team belongs to |
| `description` | string (max 3000) | No | |
| `purpose` | string (max 2000) | No | Why this team exists |
| `decisionMethod` | string | No | Known values: `consensus`, `voting`, `lead-driven` |
| `createdAt` | datetime | Yes | |

### `network.coopsource.org.role`

A defined role within a cooperative or project, with responsibilities and permissions. **DB-only.**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string (max 255) | Yes | Role name, e.g. Coordinator, Treasurer |
| `entityUri` | at-uri | Yes | The cooperative or project this role belongs to |
| `description` | string (max 3000) | No | |
| `responsibilities` | string[] (items max 1000) | No | |
| `permissions` | string[] (items max 500) | No | What this role can do |
| `termLengthMonths` | integer (min 0) | No | Term length in months, if applicable |
| `createdAt` | datetime | Yes | |

### `network.coopsource.org.getCooperative` (Query)

Get public metadata for an open-governance cooperative by DID.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `cooperative` | did | Yes | DID of the cooperative to look up |

**Output:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `did` | did | Yes | |
| `handle` | string | No | |
| `displayName` | string | Yes | |
| `description` | string | No | |
| `avatarCid` | string | No | |
| `cooperativeType` | string | Yes | |
| `membershipPolicy` | string | Yes | |
| `maxMembers` | integer | No | |
| `location` | string | No | |
| `website` | string | No | |
| `foundedDate` | string | No | |
| `governanceVisibility` | string | Yes | Known values: `open`, `closed` |
| `isNetwork` | boolean | Yes | Whether this cooperative is a network (a cooperative of cooperatives) |

### `network.coopsource.org.getMembership` (Query)

Check the authenticated viewer's membership status in an open-governance cooperative. The viewer's DID is implicit from the session.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `cooperative` | did | Yes | DID of the cooperative to check membership in |

**Output:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `isMember` | boolean | Yes | Whether the viewer has an active membership in this cooperative |
| `status` | string | No | Membership status, if a relationship exists. Known values: `active`, `pending_member`, `pending_approval`, `revoked` |
| `roles` | string[] | No | Roles assigned to the viewer via memberApproval authority. Only present when active |
| `joinedAt` | datetime | No | When the membership became active |

---

## `governance` -- Governance

The `governance` namespace covers cooperative decision-making through proposals, voting, and delegation. The proposal lifecycle moves through six states: `draft` (author is still editing), `discussion` (open for comment), `voting` (ballots are being cast), and three terminal states -- `passed`, `failed`, or `withdrawn`. Proposals support four voting methods: `simple_majority`, `supermajority`, `consensus`, and `ranked_choice`. For ranked-choice or multi-option proposals, the `options` array lists the available choices.

Quorum is configurable per proposal: `quorumRequired` sets the fraction of participation needed (0-1), and `quorumBasis` determines whether that fraction is calculated against `votesCast` or `totalMembers`. Votes can carry variable `weight` to support delegation -- when a member casts a vote on behalf of a delegator, the `delegatedFrom` field identifies whose authority backs the vote.

Proposals in open-governance cooperatives are written to the cooperative's PDS and appear on the firehose. In closed-governance cooperatives, the VisibilityRouter directs them to the `private_record` table instead. Votes are always written to the voter's own PDS. Delegations are DB-only records that construct an AT URI for identification but store in PostgreSQL; their scope can cover all proposals in a project or a single specific proposal.

This namespace also includes two XRPC query schemas (`listProposals` and `getProposal`) that provide read-only AppView endpoints for retrieving proposal lists and details with vote tallies.

### `network.coopsource.governance.proposal`

A governance proposal for cooperative decision-making. Written to the **cooperative's PDS** (open governance) or `private_record` table (closed governance) via VisibilityRouter.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cooperativeDid` | did | Yes | The cooperative this proposal belongs to |
| `title` | string (max 256) | Yes | |
| `body` | string (max 10000) | Yes | The full text of the proposal |
| `proposalType` | string | Yes | The category of the proposal. Known values: `amendment`, `budget`, `membership`, `policy`, `election`, `other` |
| `votingMethod` | string | Yes | How votes are counted. Known values: `simple_majority`, `supermajority`, `consensus`, `ranked_choice` |
| `options` | string[] (items max 256) | No | For ranked_choice or multi-option proposals, the list of options |
| `quorumRequired` | number (min 0, max 1) | No | Fraction of members required to vote (0-1) |
| `quorumBasis` | string | No | Whether quorum is based on votes cast or total members. Known values: `votesCast`, `totalMembers` |
| `discussionEndsAt` | datetime | No | When the discussion period closes |
| `votingEndsAt` | datetime | No | When the voting period closes |
| `meetingEvent` | at-uri | No | Smoke Signal calendar event for governance meeting |
| `fullDocument` | at-uri | No | WhiteWind blog entry with detailed rationale |
| `discussionThread` | at-uri | No | Frontpage link submission for community discussion |
| `status` | string | Yes | Known values: `draft`, `discussion`, `voting`, `passed`, `failed`, `withdrawn` |
| `createdAt` | datetime | Yes | |

### `network.coopsource.governance.vote`

A vote cast on a governance proposal. Written to the **member's PDS** via MemberWriteProxy.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `proposalUri` | at-uri | Yes | The proposal being voted on |
| `voterDid` | did | Yes | The DID of the voter |
| `choice` | string (max 1000) | Yes | `yes`, `no`, `abstain` for standard methods; JSON array for ranked_choice |
| `weight` | number (min 0) | No | Voting weight, defaults to 1.0. May be higher due to delegations |
| `rationale` | string (max 2000) | No | Optional explanation of the voter's reasoning |
| `delegatedFrom` | did | No | DID of the delegator, if this vote was cast on behalf of someone else |
| `createdAt` | datetime | Yes | |

### `network.coopsource.governance.delegation`

A vote delegation from one project member to another. **DB-only.**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectUri` | at-uri | Yes | The project this delegation applies to |
| `delegatorDid` | did | Yes | The DID of the person delegating their vote |
| `delegateeDid` | did | Yes | The DID of the person receiving the delegation |
| `scope` | string | Yes | Whether delegation covers all project proposals or a specific one. Known values: `project`, `proposal` |
| `proposalUri` | at-uri | No | Specific proposal URI when scope is `proposal` |
| `status` | string | Yes | Known values: `active`, `revoked` |
| `revokedAt` | datetime | No | When the delegation was revoked |
| `createdAt` | datetime | Yes | |

### `network.coopsource.governance.listProposals` (Query)

List governance proposals for an open-governance cooperative, with cursor-based pagination.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `cooperative` | did | Yes | DID of the cooperative whose proposals to list |
| `status` | string | No | Filter by proposal status. Known values: `draft`, `discussion`, `voting`, `passed`, `failed`, `withdrawn` |
| `limit` | integer (min 1, max 100, default 50) | No | |
| `cursor` | string | No | |

**Output:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `proposals` | ref[] (`#proposalSummary`) | Yes | |
| `cursor` | string | No | |

#### Sub-definition: `proposalSummary`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | |
| `title` | string | Yes | |
| `status` | string | Yes | |
| `votingType` | string | Yes | |
| `cooperativeDid` | did | Yes | |
| `authorDid` | did | Yes | |
| `createdAt` | datetime | Yes | |
| `resolvedAt` | datetime | No | |

### `network.coopsource.governance.getProposal` (Query)

Get a governance proposal by ID, including the current vote tally. The ID is a proposal UUID (app-layer entity), not an AT-URI.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Proposal UUID |

**Output:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | |
| `title` | string | Yes | |
| `body` | string | Yes | |
| `status` | string | Yes | |
| `votingType` | string | Yes | |
| `options` | string[] | No | |
| `quorumType` | string | No | |
| `quorumBasis` | string | No | |
| `cooperativeDid` | did | Yes | |
| `authorDid` | did | Yes | |
| `createdAt` | datetime | Yes | |
| `resolvedAt` | datetime | No | |
| `tally` | ref[] (`#tallyEntry`) | Yes | Vote tally entries -- one per choice with its count |

#### Sub-definition: `tallyEntry`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `choice` | string | Yes | The vote choice (e.g. `yes`, `no`, `abstain`) |
| `count` | integer | Yes | Number of votes for this choice |

---

## `agreement` -- Agreements

The `agreement` namespace models multi-party project agreements through a chain of linked records. A `master` agreement governs a project, defining its purpose, scope, governance framework, and termination conditions. Each party's specific obligations are captured in `stakeholderTerms` records that reference the master -- these define what a stakeholder contributes (labor, capital, resources, intellectual property, network), how they are compensated (salary, shares, dividends, hourly), their IP ownership terms, governance rights (voting power, board seats, decision categories), and exit conditions (buyback price, notice period).

Signatories record their assent by writing `signature` records to their own PDS, each referencing the agreement or terms being signed. Signatures support three types -- digital, witnessed, and notarized -- and carry cryptographic proof data. When the terms of a master agreement need to change, an `amendment` record captures the field-level diffs (from/to values for each changed field) and links to a governance proposal for voting. Once approved and applied, the amendment bumps the master agreement's version number. Finally, `contribution` records track ongoing fulfillment of stakeholder terms -- each contribution references the relevant terms, describes the work done, and carries a status from `pending` through `fulfilled` or `disputed`.

The `master` and `stakeholderTerms` records are written to the cooperative's PDS. Signatures are written to the signer's own PDS. Amendments and contributions are DB-only.

### `network.coopsource.agreement.master`

A master agreement governing a project, defining governance framework and terms. Written to the **cooperative's PDS** via OperatorWriteProxy.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectUri` | at-uri | Yes | The project this agreement governs |
| `title` | string (max 255) | Yes | |
| `version` | integer (min 1) | Yes | |
| `purpose` | string (max 3000) | No | |
| `scope` | string (max 3000) | No | |
| `agreementType` | string | No | Template type used. Known values: `worker-cooperative`, `multi-stakeholder`, `platform-cooperative`, `open-source`, `producer-cooperative`, `hybrid-member-investor`, `custom` |
| `effectiveDate` | datetime | No | |
| `terminationDate` | datetime | No | |
| `governanceFramework` | ref (`#governanceFramework`) | No | |
| `terminationConditions` | string[] (items max 2000) | No | |
| `status` | string | Yes | Known values: `draft`, `active`, `amended`, `terminated` |
| `createdAt` | datetime | Yes | |
| `updatedAt` | datetime | No | |

#### Sub-definition: `governanceFramework`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `decisionMethod` | string | No | Known values: `consensus`, `majority-vote`, `supermajority`, `weighted-vote` |
| `quorum` | integer (min 0, max 100) | No | Quorum percentage required |
| `votingThreshold` | integer (min 0, max 100) | No | Voting threshold percentage |
| `disputeResolution` | string (max 3000) | No | |
| `modificationProcess` | string (max 3000) | No | |

### `network.coopsource.agreement.stakeholderTerms`

Terms specific to one stakeholder party within a master agreement. Written to the **cooperative's PDS** via OperatorWriteProxy.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `masterAgreementUri` | at-uri | Yes | The master agreement these terms belong to |
| `stakeholderDid` | did | Yes | |
| `stakeholderType` | string | Yes | Known values: `worker`, `investor`, `customer`, `supplier`, `community`, `partner` |
| `contributions` | ref[] (`#termsContribution`) | No | |
| `financialTerms` | ref (`#financialTerms`) | No | |
| `ipTerms` | ref (`#ipTerms`) | No | |
| `governanceRights` | ref (`#governanceRights`) | No | |
| `exitTerms` | ref (`#exitTerms`) | No | |
| `createdAt` | datetime | Yes | |

#### Sub-definition: `termsContribution`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | Known values: `labor`, `capital`, `resources`, `intellectual-property`, `network` |
| `description` | string (max 2000) | Yes | |
| `amount` | string (max 500) | No | |

#### Sub-definition: `financialTerms`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `compensationType` | string | No | Known values: `salary`, `share`, `dividend`, `hourly`, `other` |
| `compensationAmount` | integer | No | Amount in smallest currency unit (e.g. cents) |
| `currency` | string (max 10) | No | |
| `paymentSchedule` | string (max 500) | No | |
| `profitShare` | integer (min 0, max 100) | No | Percentage |
| `equityStake` | integer (min 0, max 100) | No | Percentage |

#### Sub-definition: `ipTerms`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ownership` | string | No | Known values: `individual`, `collective`, `shared` |
| `licensing` | string (max 2000) | No | |

#### Sub-definition: `governanceRights`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `votingPower` | integer (min 0, max 100) | No | Voting power percentage |
| `boardSeat` | boolean | No | |
| `decisionCategories` | string[] (items max 500) | No | |

#### Sub-definition: `exitTerms`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `buybackPrice` | string (max 500) | No | |
| `noticePeriodDays` | integer (min 0) | No | |
| `conditions` | string (max 3000) | No | |

### `network.coopsource.agreement.signature`

A digital signature on an agreement or stakeholder terms. Written to the **member's PDS** via MemberWriteProxy.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agreementUri` | at-uri | Yes | The agreement or terms being signed |
| `signerDid` | did | Yes | |
| `signerRole` | string (max 255) | No | |
| `signatureType` | string | Yes | Known values: `digital`, `witnessed`, `notarized` |
| `signatureData` | ref (`#signatureData`) | No | |
| `signedAt` | datetime | Yes | |

#### Sub-definition: `signatureData`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `method` | string | Yes | Known values: `atproto-did-proof`, `timestamp`, `cryptographic-hash` |
| `proof` | string (max 10000) | No | |
| `timestamp` | datetime | Yes | |
| `witnessDids` | did[] | No | |

### `network.coopsource.agreement.amendment`

A proposed amendment to a master agreement, linked to a governance proposal for voting. **DB-only.**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agreementUri` | at-uri | Yes | The master agreement being amended |
| `proposalUri` | at-uri | No | The governance proposal for voting on this amendment |
| `title` | string (max 255) | Yes | |
| `description` | string (max 10000) | Yes | |
| `changes` | ref (`#amendmentChanges`) | Yes | |
| `status` | string | Yes | Known values: `proposed`, `voting`, `approved`, `applied`, `rejected` |
| `fromVersion` | integer (min 1) | Yes | |
| `toVersion` | integer (min 2) | No | |
| `proposedAt` | datetime | Yes | |
| `appliedAt` | datetime | No | |

#### Sub-definition: `amendmentChanges`

Field-level changes to the agreement. Each property maps to a `fieldChange` object.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | ref (`#fieldChange`) | No | |
| `purpose` | ref (`#fieldChange`) | No | |
| `scope` | ref (`#fieldChange`) | No | |
| `governanceFramework` | ref (`#fieldChange`) | No | |
| `disputeResolution` | ref (`#fieldChange`) | No | |
| `amendmentProcess` | ref (`#fieldChange`) | No | |
| `terminationConditions` | ref (`#fieldChange`) | No | |

#### Sub-definition: `fieldChange`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `from` | unknown | Yes | |
| `to` | unknown | Yes | |

### `network.coopsource.agreement.contribution`

A tracked contribution by a stakeholder toward their agreement terms. **DB-only.**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `stakeholderTermsUri` | at-uri | Yes | The stakeholder terms record this contribution fulfills |
| `contributionType` | string | Yes | Known values: `labor`, `capital`, `resources`, `intellectual-property`, `network` |
| `description` | string (max 3000) | Yes | |
| `amount` | string (max 500) | No | |
| `units` | string (max 100) | No | Hours, dollars, items, etc. |
| `startDate` | datetime | No | |
| `endDate` | datetime | No | |
| `status` | string | Yes | Known values: `pending`, `in-progress`, `fulfilled`, `disputed` |
| `createdAt` | datetime | Yes | |

---

## `funding` -- Funding

Campaigns define crowdfunding goals for cooperatives, projects, or the network itself. Each campaign specifies a type (`rewards`, `patronage`, `donation`, `revenue_share`) and a funding model (`all_or_nothing` or `keep_it_all`). The `tier` field indicates whether the campaign operates at the network, cooperative, or project level. Campaigns are written to the creating member's PDS via pdsService, not to the cooperative's PDS.

Pledges are individual contributions to a campaign. Each pledge records the backer's DID, the amount in the smallest currency unit (cents), and a payment status tracking the pledge through its lifecycle. Pledges are written to the member's PDS.

### `network.coopsource.funding.campaign`

A crowdfunding campaign for a cooperative, project, or the network. Written to the **member's PDS** (the campaign creator).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `beneficiaryUri` | string | Yes | AT URI of the cooperative/project, or `network:coopsource` for network-level campaigns |
| `title` | string (max 256) | Yes | |
| `description` | string (max 5000) | No | |
| `tier` | string | Yes | The level at which this campaign operates. Known values: `network`, `cooperative`, `project` |
| `campaignType` | string | Yes | Known values: `rewards`, `patronage`, `donation`, `revenue_share` |
| `goalAmount` | integer (min 1) | Yes | Funding goal in cents |
| `goalCurrency` | string (max 10) | Yes | ISO 4217 currency code |
| `amountRaised` | integer (min 0) | No | Total amount raised in cents |
| `backerCount` | integer (min 0) | No | Number of backers |
| `fundingModel` | string | Yes | How funds are collected. Known values: `all_or_nothing`, `keep_it_all` |
| `status` | string | Yes | Known values: `draft`, `active`, `funded`, `completed`, `cancelled` |
| `startDate` | datetime | No | |
| `endDate` | datetime | No | |
| `metadata` | unknown | No | Additional campaign data (reward tiers, images, tags) |
| `createdAt` | datetime | Yes | |

### `network.coopsource.funding.pledge`

A pledge or contribution to a crowdfunding campaign. Written to the **member's PDS** via MemberWriteProxy.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `campaignUri` | at-uri | Yes | The campaign this pledge is for |
| `backerDid` | did | Yes | DID of the backer |
| `amount` | integer (min 1) | Yes | Pledge amount in cents |
| `currency` | string (max 10) | Yes | ISO 4217 currency code |
| `paymentStatus` | string | Yes | Known values: `pending`, `completed`, `failed`, `refunded` |
| `metadata` | unknown | No | Additional pledge data (reward tier selection, etc.) |
| `createdAt` | datetime | Yes | |

---

## `alignment` -- Alignment

Members declare their interests in a project through the `interest` record, which captures detailed goals (with priorities 1-5 and time-horizon scope), potential contributions (skills, resources, capital, network, time), constraints (hard or soft), and non-negotiable red lines. Work-style preferences for decision-making, communication, and pace round out the declaration. Outcomes describe desired results with measurable success criteria and track stakeholder support levels from `strong` through `opposed`.

Interest maps are computed summaries that identify alignment zones (where stakeholders agree) and conflict zones (areas of tension) across a project's stakeholders. They can optionally include AI-generated analysis with recommendations and mediation suggestions. Stakeholder records provide background profiles (role, class, description, interests summary) used as inputs for interest map computation. Interest and outcome records are written to the member's PDS; interest maps and stakeholder profiles are DB-only.

### `network.coopsource.alignment.interest`

A stakeholder's detailed interests, contributions, constraints, and red lines for a project. Written to the **member's PDS** via MemberWriteProxy.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectUri` | at-uri | Yes | The project this interest declaration relates to |
| `interests` | ref[] (`#interestItem`) | Yes | Detailed interests and goals |
| `contributions` | ref[] (`#contributionItem`) | No | What the stakeholder can bring to the project |
| `constraints` | ref[] (`#constraintItem`) | No | Limitations or conditions |
| `redLines` | ref[] (`#redLineItem`) | No | Non-negotiable boundaries |
| `preferences` | ref (`#workPreferences`) | No | Work style and decision-making preferences |
| `createdAt` | datetime | Yes | |
| `updatedAt` | datetime | No | |

#### Sub-definition: `interestItem`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `category` | string (max 100) | Yes | |
| `description` | string (max 2000) | Yes | |
| `priority` | integer (min 1, max 5) | Yes | |
| `scope` | string | No | Known values: `short-term`, `medium-term`, `long-term` |

#### Sub-definition: `contributionItem`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | Known values: `skill`, `resource`, `capital`, `network`, `time` |
| `description` | string (max 2000) | Yes | |
| `capacity` | string (max 500) | No | Estimated availability |

#### Sub-definition: `constraintItem`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `description` | string (max 2000) | Yes | |
| `hardConstraint` | boolean | No | |

#### Sub-definition: `redLineItem`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `description` | string (max 2000) | Yes | |
| `reason` | string (max 2000) | No | |

#### Sub-definition: `workPreferences`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `decisionMaking` | string (max 500) | No | |
| `communication` | string (max 500) | No | |
| `pace` | string (max 500) | No | |

### `network.coopsource.alignment.outcome`

A desired outcome for a project, with success criteria and stakeholder support tracking. Written to the **member's PDS** via MemberWriteProxy.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectUri` | at-uri | Yes | The project this outcome belongs to |
| `title` | string (max 255) | Yes | |
| `description` | string (max 3000) | Yes | |
| `category` | string | Yes | Known values: `financial`, `social`, `environmental`, `governance`, `other` |
| `successCriteria` | ref[] (`#successCriterion`) | No | |
| `stakeholderSupport` | ref[] (`#supportEntry`) | No | |
| `status` | string | Yes | Known values: `proposed`, `endorsed`, `active`, `achieved`, `abandoned` |
| `createdAt` | datetime | Yes | |

#### Sub-definition: `successCriterion`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `metric` | string (max 500) | Yes | |
| `target` | string (max 500) | Yes | |
| `timeline` | string (max 200) | No | |
| `ownerDid` | did | No | |

#### Sub-definition: `supportEntry`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `stakeholderDid` | did | Yes | |
| `supportLevel` | string | Yes | Known values: `strong`, `moderate`, `conditional`, `neutral`, `opposed` |
| `conditions` | string (max 2000) | No | |

### `network.coopsource.alignment.interestMap`

A computed map of alignment and conflict zones across stakeholder interests for a project. **DB-only.**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectUri` | at-uri | Yes | The project this map covers |
| `alignmentZones` | ref[] (`#alignmentZone`) | No | Areas where stakeholders agree |
| `conflictZones` | ref[] (`#conflictZone`) | No | Areas of tension between stakeholders |
| `aiAnalysis` | ref (`#aiAnalysis`) | No | Optional AI-generated analysis |
| `createdAt` | datetime | Yes | |

#### Sub-definition: `alignmentZone`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `participants` | did[] | Yes | |
| `description` | string (max 2000) | Yes | |
| `strength` | integer (min 0, max 100) | Yes | Overlap percentage |
| `interestsInvolved` | string[] (items max 500) | No | |

#### Sub-definition: `conflictZone`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `stakeholders` | did[] | Yes | |
| `description` | string (max 2000) | Yes | |
| `severity` | string | Yes | Known values: `low`, `medium`, `high` |
| `potentialSolutions` | string[] (items max 1000) | No | |

#### Sub-definition: `aiAnalysis`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `summary` | string (max 5000) | No | |
| `recommendations` | string[] (items max 2000) | No | |
| `mediationSuggestions` | string[] (items max 2000) | No | |

### `network.coopsource.alignment.stakeholder`

A stakeholder profile within a project, describing their role and background. **DB-only.**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectUri` | at-uri | Yes | The project this stakeholder belongs to |
| `name` | string (max 255) | Yes | Display name of the stakeholder |
| `role` | string (max 100) | Yes | Stakeholder category. Known values: `worker`, `investor`, `customer`, `partner`, `supplier`, `community`, `other` |
| `stakeholderClass` | string (max 100) | No | Subclass for more specific categorization |
| `description` | string (max 3000) | No | Background and context about this stakeholder |
| `interestsSummary` | string (max 1000) | No | Brief overview of what they care about |
| `createdAt` | datetime | Yes | |

---

## `connection` -- Connections

External OAuth service integrations. The `link` record is written to the member's PDS and tracks which external service (e.g., GitHub, Google) is connected and its current status. Bindings and sync events are DB-only.

### `network.coopsource.connection.link`

An external service connection linked to a user's account. Written to the **member's PDS** via MemberWriteProxy.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `service` | string | Yes | The external service provider. Known values: `github`, `google` |
| `status` | string | Yes | Current status of the connection. Known values: `active`, `revoked`, `expired` |
| `metadata` | ref (`#metadata`) | No | |
| `createdAt` | datetime | Yes | |

#### Sub-definition: `metadata`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `username` | string (max 255) | No | |
| `email` | string (max 255) | No | |
| `scopes` | string[] (items max 255) | No | |

### `network.coopsource.connection.binding`

A binding between an external resource and a project. **DB-only.**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `connectionUri` | at-uri | Yes | The external connection this binding belongs to |
| `projectUri` | at-uri | Yes | The project this resource is bound to |
| `resourceType` | string | Yes | The type of external resource. Known values: `github_repo`, `google_doc`, `google_sheet`, `google_drive_folder` |
| `resourceId` | string (max 1000) | Yes | The external identifier for the resource |
| `metadata` | ref (`#resourceMetadata`) | No | |
| `createdAt` | datetime | Yes | |

#### Sub-definition: `resourceMetadata`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `displayName` | string (max 500) | No | |
| `url` | string (max 2000) | No | |
| `description` | string (max 2000) | No | |

### `network.coopsource.connection.sync`

A synchronization event for a connection binding. **DB-only.** Placeholder for future sync pipeline.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `bindingUri` | at-uri | Yes | The connection binding this sync event relates to |
| `eventType` | string | Yes | The type of sync event. Known values: `push`, `pull`, `webhook` |
| `timestamp` | datetime | Yes | |
| `payload` | object | No | Event-specific data |

---

## `admin` -- Administration

Officer appointments, regulatory compliance tracking, member communications, and fiscal year management. All records in this namespace are DB-only. Declarative hook configs exist for future AppView indexing but no ATProto write path is implemented.

### `network.coopsource.admin.officer`

An officer appointment record for a cooperative. **DB-only.**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cooperativeDid` | did | Yes | The cooperative this officer serves |
| `officerDid` | did | Yes | The DID of the officer |
| `title` | string | Yes | Known values: `president`, `secretary`, `treasurer`, `director`, `other` |
| `appointedAt` | datetime | Yes | When the officer was appointed or elected |
| `termEndsAt` | datetime | No | When the officer's term ends |
| `appointmentType` | string | Yes | Known values: `elected`, `appointed` |
| `responsibilities` | string (max 3000) | No | Description of the officer's responsibilities |
| `status` | string | Yes | Known values: `active`, `ended` |
| `createdAt` | datetime | Yes | |

### `network.coopsource.admin.complianceItem`

A compliance calendar item tracking regulatory deadlines and filings. **DB-only.**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cooperativeDid` | did | Yes | The cooperative this compliance item belongs to |
| `title` | string (max 255) | Yes | |
| `description` | string (max 3000) | No | |
| `dueDate` | datetime | Yes | When this filing or report is due |
| `filingType` | string | Yes | Known values: `annual_report`, `tax_filing`, `state_report`, `other` |
| `status` | string | Yes | Known values: `pending`, `completed`, `overdue` |
| `completedAt` | datetime | No | When this item was completed |
| `createdAt` | datetime | Yes | |

### `network.coopsource.admin.memberNotice`

A notice sent to members of a cooperative. **DB-only.**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cooperativeDid` | did | Yes | The cooperative sending the notice |
| `title` | string (max 255) | Yes | |
| `body` | string (max 10000) | Yes | The full text of the notice |
| `noticeType` | string | Yes | Known values: `general`, `election`, `meeting`, `policy_change`, `other` |
| `targetAudience` | string | Yes | Known values: `all`, `board`, `officers` |
| `sentAt` | datetime | No | When the notice was sent |
| `createdAt` | datetime | Yes | |

### `network.coopsource.admin.fiscalPeriod`

A fiscal period (e.g. fiscal year) for a cooperative. **DB-only.**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cooperativeDid` | did | Yes | The cooperative this fiscal period belongs to |
| `label` | string (max 100) | Yes | Human-readable label (e.g. FY2026) |
| `startsAt` | datetime | Yes | Start of the fiscal period |
| `endsAt` | datetime | Yes | End of the fiscal period |
| `status` | string | Yes | Known values: `open`, `closed` |
| `createdAt` | datetime | Yes | |

---

## `legal` -- Legal

Versioned legal documents (bylaws, articles of incorporation, policies, resolutions) and meeting records with attendance, resolutions, and certified minutes. All records are DB-only.

### `network.coopsource.legal.document`

A foundational legal document for a cooperative. **DB-only.**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cooperativeDid` | did | Yes | The cooperative this document belongs to |
| `title` | string (max 255) | Yes | |
| `body` | string (max 50000) | No | The full text of the document |
| `documentType` | string | Yes | Known values: `bylaws`, `articles`, `policy`, `resolution`, `other` |
| `version` | integer (min 1) | Yes | Monotonically increasing version number |
| `previousVersion` | at-uri | No | AT-URI of the previous version in the chain |
| `bodyFormat` | string (max 50) | No | Format of the body text. Known values: `markdown`, `plain`, `html` |
| `status` | string | Yes | Known values: `draft`, `active`, `superseded`, `archived` |
| `createdAt` | datetime | Yes | |

### `network.coopsource.legal.meetingRecord`

A record of a cooperative meeting with minutes, attendance, and resolutions. **DB-only.**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cooperativeDid` | did | Yes | The cooperative this meeting belongs to |
| `title` | string (max 255) | Yes | |
| `meetingDate` | datetime | Yes | When the meeting took place |
| `meetingType` | string | Yes | Known values: `board`, `general`, `special`, `committee` |
| `attendees` | did[] | No | DIDs of members who attended |
| `quorumMet` | boolean | No | Whether quorum was achieved |
| `resolutions` | string[] (items max 2000) | No | Resolutions passed during the meeting |
| `minutes` | string (max 50000) | No | Full text of the meeting minutes |
| `certifiedBy` | did | No | DID of the person who certified the minutes |
| `createdAt` | datetime | Yes | |

---

## `commerce` -- Commerce

Marketplace records for cooperative commerce: service and product listings, procurement needs, shared resources with booking status, cross-cooperative collaborative projects, and bilateral B2B agreements. Most records are written to the cooperative's PDS via OperatorWriteProxy.

### `network.coopsource.commerce.listing`

A service or product offering published by a cooperative. Discoverable across the ATProto ecosystem via firehose. Written to the **cooperative's PDS** via OperatorWriteProxy.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cooperativeDid` | did | Yes | |
| `title` | string (max 255) | Yes | |
| `description` | string (max 5000) | No | |
| `category` | string (max 100) | Yes | |
| `availability` | string | No | Known values: `available`, `limited`, `unavailable` |
| `location` | string (max 500) | No | |
| `cooperativeType` | string (max 100) | No | |
| `tags` | string[] (items max 50, max 20 items) | No | |
| `createdBy` | did | Yes | |
| `createdAt` | datetime | Yes | |

### `network.coopsource.commerce.need`

A request for services or products published by a cooperative. Enables proactive matching across the ecosystem. Written to the **cooperative's PDS** via OperatorWriteProxy.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cooperativeDid` | did | Yes | |
| `title` | string (max 255) | Yes | |
| `description` | string (max 5000) | No | |
| `category` | string (max 100) | Yes | |
| `urgency` | string | No | Known values: `low`, `normal`, `high`, `urgent` |
| `location` | string (max 500) | No | |
| `tags` | string[] (items max 50, max 20 items) | No | |
| `createdBy` | did | Yes | |
| `createdAt` | datetime | Yes | |

### `network.coopsource.commerce.resource`

A shared resource listing. Discoverable by network members for booking. Written to the **cooperative's PDS** via OperatorWriteProxy.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cooperativeDid` | did | Yes | |
| `title` | string (max 255) | Yes | |
| `description` | string (max 5000) | No | |
| `resourceType` | string | Yes | Known values: `equipment`, `space`, `expertise`, `vehicle`, `other` |
| `location` | string (max 500) | No | |
| `status` | string | No | Known values: `available`, `reserved`, `unavailable` |
| `createdBy` | did | Yes | |
| `createdAt` | datetime | Yes | |

### `network.coopsource.commerce.collaborativeProject`

A cross-cooperative project record. Shows the ecosystem that cooperatives are collaborating. Written to the **cooperative's PDS** via OperatorWriteProxy.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `hostCooperativeDid` | did | Yes | |
| `title` | string (max 255) | Yes | |
| `description` | string (max 10000) | No | |
| `participantDids` | did[] (max 50 items) | Yes | |
| `status` | string | No | Known values: `planning`, `active`, `completed`, `cancelled` |
| `createdBy` | did | Yes | |
| `createdAt` | datetime | Yes | |

### `network.coopsource.commerce.intercoopAgreement`

A bilateral B2B agreement between cooperatives. Each co-op writes their copy to their PDS. Written to the **cooperative's PDS** via OperatorWriteProxy.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `initiatorDid` | did | Yes | |
| `responderDid` | did | Yes | |
| `title` | string (max 255) | Yes | |
| `description` | string (max 10000) | No | |
| `agreementType` | string | Yes | Known values: `service`, `supply`, `joint_venture`, `procurement`, `resource_sharing`, `other` |
| `status` | string | No | Known values: `proposed`, `negotiating`, `active`, `completed`, `cancelled` |
| `createdAt` | datetime | Yes | |

---

## `finance` -- Finance

All finance records are DB-only and explicitly Tier 2 private -- they are stored in the `private_record` table and never appear on the firehose. The expense workflow follows a bilateral pattern: a member submits an `expense` claim (with optional receipt blob), and the cooperative records an `expenseApproval` to approve or reject it. Revenue records track income with optional period and project references.

### `network.coopsource.finance.expense`

An expense claim submitted by a member. Tier 2 private record -- stored in `private_record` table, never on firehose. **DB-only.**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cooperativeDid` | did | Yes | |
| `memberDid` | did | Yes | |
| `categoryId` | string | No | |
| `title` | string (max 255) | Yes | |
| `description` | string (max 2000) | No | |
| `amount` | number (min 0) | Yes | |
| `currency` | string (max 10) | Yes | |
| `receiptBlobCid` | cid-link | No | |
| `status` | string | No | Known values: `draft`, `submitted`, `approved`, `rejected`, `reimbursed` |
| `createdAt` | datetime | Yes | |

### `network.coopsource.finance.expenseApproval`

Cooperative approval or rejection of an expense claim. Tier 2 private record. **DB-only.**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cooperativeDid` | did | Yes | |
| `expenseId` | string | Yes | |
| `action` | string | Yes | Known values: `approve`, `reject` |
| `reviewedBy` | did | Yes | |
| `note` | string (max 1000) | No | |
| `createdAt` | datetime | Yes | |

### `network.coopsource.finance.revenue`

A revenue entry recording income. Tier 2 private record -- stored in `private_record` table, never on firehose. **DB-only.**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cooperativeDid` | did | Yes | |
| `projectId` | string | No | |
| `title` | string (max 255) | Yes | |
| `description` | string (max 2000) | No | |
| `amount` | number (min 0) | Yes | |
| `currency` | string (max 10) | Yes | |
| `source` | string (max 100) | No | |
| `sourceReference` | string (max 500) | No | |
| `recordedBy` | did | Yes | |
| `recordedAt` | datetime | No | |
| `periodStart` | datetime | No | |
| `periodEnd` | datetime | No | |
| `createdAt` | datetime | Yes | |

---

## `ops` -- Operations

Task coordination with a bilateral acceptance pattern: the cooperative creates a `task` record via OperatorWriteProxy, assigning it to members, and the assigned member writes a `taskAcceptance` to acknowledge it. Schedule entries represent shifts or work slots, also written via OperatorWriteProxy, with optional references to Smoke Signal calendar events. Time entries record work hours and are explicitly Tier 2 private -- they never appear on the firehose.

Note: the lexicon ID is `ops.schedule` but some service-layer code references this as `scheduleShift`. This document uses the canonical lexicon ID from the JSON schema. `taskAcceptance` and `timeEntry` are DB-only.

### `network.coopsource.ops.task`

A task definition in a cooperative's work coordination system. Written to the **cooperative's PDS** via OperatorWriteProxy.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cooperativeDid` | did | Yes | |
| `projectId` | string | No | Project entity ID |
| `title` | string (max 255) | Yes | |
| `description` | string (max 10000) | No | |
| `status` | string | Yes | Known values: `backlog`, `todo`, `in_progress`, `in_review`, `done`, `cancelled` |
| `priority` | string | Yes | Known values: `urgent`, `high`, `medium`, `low` |
| `assigneeDids` | did[] (max 20 items) | No | |
| `dueDate` | datetime | No | |
| `labels` | string[] (items max 50, max 20 items) | No | |
| `linkedProposal` | at-uri | No | |
| `createdBy` | did | Yes | |
| `createdAt` | datetime | Yes | |

### `network.coopsource.ops.taskAcceptance`

A member's acceptance of a task assignment. **DB-only.**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `taskUri` | at-uri | Yes | AT-URI of the task record |
| `cooperativeDid` | did | Yes | |
| `note` | string (max 2000) | No | |
| `createdAt` | datetime | Yes | |

### `network.coopsource.ops.schedule`

A shift or schedule entry in a cooperative's work schedule. Written to the **cooperative's PDS** via OperatorWriteProxy.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cooperativeDid` | did | Yes | |
| `title` | string (max 255) | Yes | |
| `description` | string (max 2000) | No | |
| `assignedDid` | did | No | |
| `startsAt` | datetime | Yes | |
| `endsAt` | datetime | Yes | |
| `recurrence` | string (max 50) | No | |
| `location` | string (max 500) | No | |
| `status` | string | No | Known values: `open`, `assigned`, `completed`, `cancelled` |
| `calendarEventRef` | at-uri | No | Reference to Smoke Signal calendar event |
| `createdBy` | did | Yes | |
| `createdAt` | datetime | Yes | |

### `network.coopsource.ops.timeEntry`

A time entry recording work hours. Tier 2 private record -- stored in `private_record` table, never on firehose. **DB-only.**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cooperativeDid` | did | Yes | |
| `memberDid` | did | Yes | |
| `taskId` | string | No | |
| `projectId` | string | No | |
| `description` | string (max 2000) | No | |
| `startedAt` | datetime | Yes | |
| `endedAt` | datetime | No | |
| `durationMinutes` | integer (min 1, max 1440) | No | |
| `status` | string | No | Known values: `draft`, `submitted`, `approved`, `rejected` |
| `createdAt` | datetime | Yes | |
