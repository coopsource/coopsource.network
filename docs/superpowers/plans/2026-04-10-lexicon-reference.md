# Lexicon Reference Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `packages/lexicons/LEXICONS.md` — a centralized reference for all 41 ATProto lexicon schemas, with record ownership matrix, data tier documentation, and per-namespace field tables with workflow intros scaled to complexity.

**Architecture:** Single markdown file. Content is derived from the 41 JSON schema files in `packages/lexicons/network/coopsource/`. Each namespace gets a prose intro (scaled to complexity) followed by field-level reference tables for each lexicon. Record ownership (member PDS vs cooperative PDS vs DB-only) is documented in a matrix near the top.

**Tech Stack:** Markdown only — no code changes, no tests.

**Source of truth for all field tables:** The JSON schema files in `packages/lexicons/network/coopsource/*/`. Read each file and transcribe fields accurately — do not guess or rely on memory.

---

### Task 1: Overview, Ownership Matrix, and Data Tiers

**Files:**
- Create: `packages/lexicons/LEXICONS.md`

- [ ] **Step 1: Create the file with overview, ownership matrix, and data tiers**

Write the following sections:

**Overview** (2-3 paragraphs):
- These are ATProto lexicon schemas under the `network.coopsource.*` namespace
- They define the record types that cooperatives and their members write to ATProto Personal Data Servers (PDS)
- Records flow through the ATProto relay firehose and are indexed by AppView instances
- Link to the JSON schema files in `network/coopsource/` subdirectories
- Link back to [README.md](../../README.md) for architecture overview

**Record Ownership Matrix** — a three-column table:

Member's PDS (8 records):
- `org.membership`
- `governance.vote`
- `agreement.signature`
- `alignment.interest`
- `alignment.outcome`
- `funding.campaign`
- `funding.pledge`
- `connection.link`

Cooperative's PDS (12 records):
- `org.cooperative`
- `org.memberApproval`
- `governance.proposal` (conditional — see note)
- `agreement.master`
- `agreement.stakeholderTerms`
- `commerce.intercoopAgreement`
- `ops.task`
- `ops.schedule`
- `commerce.listing`
- `commerce.need`
- `commerce.resource`
- `commerce.collaborativeProject`

DB-only (21 records):
- `org.project`, `org.team`, `org.role`
- `governance.delegation`
- `agreement.amendment`, `agreement.contribution`
- `admin.officer`, `admin.complianceItem`, `admin.memberNotice`, `admin.fiscalPeriod`
- `legal.document`, `legal.meetingRecord`
- `finance.expense`, `finance.expenseApproval`, `finance.revenue`
- `ops.taskAcceptance`, `ops.timeEntry`
- `alignment.interestMap`, `alignment.stakeholder`
- `connection.binding`, `connection.sync`

Notes below the table:
- `governance.proposal` uses a VisibilityRouter: open governance cooperatives write to PDS (Tier 1); closed governance cooperatives store in `private_record` table (Tier 2)
- `finance.*` and `ops.timeEntry` are explicitly Tier 2 private — never on firehose by design
- Other DB-only records have lexicon schemas defined and declarative AppView hook configs, but no ATProto write path implemented yet
- The code references `ops.schedule` as `ops.scheduleShift` and `commerce.resource` as `commerce.sharedResource` in some service layers — this document uses the canonical lexicon IDs from the JSON schema files

**Data Tiers** — brief paragraph:
- Tier 1 (Public): ATProto PDS records, visible on the relay firehose
- Tier 2 (Private): PostgreSQL `private_record` table or DB-only storage, never on firehose
- Tier 3 (E2EE): Not represented in lexicons — handled by Germ DM / MLS protocol

- [ ] **Step 2: Verify**

Check: file exists, ownership matrix has 8 + 12 + 21 = 41 records total, all notes present.

- [ ] **Step 3: Commit**

```bash
git add packages/lexicons/LEXICONS.md
git commit -m "docs: add lexicon reference — overview, ownership matrix, data tiers"
```

---

### Task 2: Organization namespace (`org`)

**Files:**
- Modify: `packages/lexicons/LEXICONS.md`
- Read: `packages/lexicons/network/coopsource/org/cooperative.json`
- Read: `packages/lexicons/network/coopsource/org/membership.json`
- Read: `packages/lexicons/network/coopsource/org/memberApproval.json`
- Read: `packages/lexicons/network/coopsource/org/project.json`
- Read: `packages/lexicons/network/coopsource/org/team.json`
- Read: `packages/lexicons/network/coopsource/org/role.json`

- [ ] **Step 1: Read all 6 JSON schema files**

Read each file and note every field name, type, required status, description, knownValues, and constraints (maxLength, minimum, maximum, format).

- [ ] **Step 2: Write the `org` namespace section**

Append to LEXICONS.md:

**Prose intro** (6-10 sentences): Explains the bilateral membership lifecycle — member writes `membership` to their PDS, cooperative writes `memberApproval` to its PDS, AppView matches the pair and transitions status to `active`. Either record can arrive first (out-of-order handling). Role authority lives only in `memberApproval` — roles are never self-declared by the member. Also covers the organizational hierarchy: cooperatives contain projects, projects contain teams, and roles define responsibilities and permissions within a cooperative or project. Notes that `project`, `team`, and `role` are DB-only (no ATProto write path yet).

**Field tables** for each of the 6 lexicons, transcribed directly from the JSON files:
- `network.coopsource.org.cooperative` — written to **cooperative's PDS**
- `network.coopsource.org.membership` — written to **member's PDS**
- `network.coopsource.org.memberApproval` — written to **cooperative's PDS**
- `network.coopsource.org.project` — **DB-only**
- `network.coopsource.org.team` — **DB-only**
- `network.coopsource.org.role` — **DB-only**

Each table has columns: Field | Type | Required | Description. Include constraints (maxLength, format, knownValues) in the Type or Description column.

- [ ] **Step 3: Verify**

Count fields in each table against the JSON file. Every field in the JSON must appear in the table.

- [ ] **Step 4: Commit**

```bash
git add packages/lexicons/LEXICONS.md
git commit -m "docs(lexicons): add org namespace — bilateral membership, cooperatives, projects"
```

---

### Task 3: Governance namespace (`governance`)

**Files:**
- Modify: `packages/lexicons/LEXICONS.md`
- Read: `packages/lexicons/network/coopsource/governance/proposal.json`
- Read: `packages/lexicons/network/coopsource/governance/vote.json`
- Read: `packages/lexicons/network/coopsource/governance/delegation.json`

- [ ] **Step 1: Read all 3 JSON schema files**

- [ ] **Step 2: Write the `governance` namespace section**

**Prose intro** (6-10 sentences): Walks through the proposal lifecycle: draft → discussion → voting → passed/failed/withdrawn. Proposals specify a voting method (simple_majority, supermajority, consensus, ranked_choice), quorum requirements (based on votes cast or total members), and optional discussion/voting deadlines. Members cast votes to their own PDS — votes can carry weight greater than 1.0 when delegations are active. Delegation can be scoped to an entire project or a single proposal. Notes that `proposal` uses VisibilityRouter (open governance → PDS Tier 1, closed governance → private_record Tier 2). Notes that `delegation` is DB-only.

**Field tables** for:
- `network.coopsource.governance.proposal` — written to **cooperative's PDS** (conditional via VisibilityRouter)
- `network.coopsource.governance.vote` — written to **member's PDS**
- `network.coopsource.governance.delegation` — **DB-only**

- [ ] **Step 3: Verify**

Count fields in each table against the JSON file.

- [ ] **Step 4: Commit**

```bash
git add packages/lexicons/LEXICONS.md
git commit -m "docs(lexicons): add governance namespace — proposals, votes, delegation"
```

---

### Task 4: Agreement namespace (`agreement`)

**Files:**
- Modify: `packages/lexicons/LEXICONS.md`
- Read: `packages/lexicons/network/coopsource/agreement/master.json`
- Read: `packages/lexicons/network/coopsource/agreement/stakeholderTerms.json`
- Read: `packages/lexicons/network/coopsource/agreement/signature.json`
- Read: `packages/lexicons/network/coopsource/agreement/amendment.json`
- Read: `packages/lexicons/network/coopsource/agreement/contribution.json`

- [ ] **Step 1: Read all 5 JSON schema files**

Pay special attention to sub-definitions — `master` has `governanceFramework`, `signature` has `signatureData`, `amendment` has `amendmentChanges` and `fieldChange`, `stakeholderTerms` has `termsContribution`, `financialTerms`, `ipTerms`, `governanceRights`, `exitTerms`.

- [ ] **Step 2: Write the `agreement` namespace section**

**Prose intro** (6-10 sentences): Explains the agreement chain — a master agreement governs a project, defining governance framework and terms. Stakeholder terms specify each party's obligations: contributions, compensation, IP ownership, governance rights, and exit conditions. Each signer writes a signature record to their own PDS. Amendments propose changes to a master agreement and link to governance proposals for voting. Contributions track fulfillment of stakeholder terms over time. Notes that `amendment` and `contribution` are DB-only.

**Field tables** for each of the 5 lexicons. Sub-definitions get their own sub-table immediately after the parent table, headed "Sub-definition: `name`":
- `network.coopsource.agreement.master` — written to **cooperative's PDS**
  - Sub-definition: `governanceFramework`
- `network.coopsource.agreement.stakeholderTerms` — written to **cooperative's PDS**
  - Sub-definitions: `termsContribution`, `financialTerms`, `ipTerms`, `governanceRights`, `exitTerms`
- `network.coopsource.agreement.signature` — written to **member's PDS**
  - Sub-definition: `signatureData`
- `network.coopsource.agreement.amendment` — **DB-only**
  - Sub-definitions: `amendmentChanges`, `fieldChange`
- `network.coopsource.agreement.contribution` — **DB-only**

- [ ] **Step 3: Verify**

Count fields in each table AND each sub-definition table against the JSON file.

- [ ] **Step 4: Commit**

```bash
git add packages/lexicons/LEXICONS.md
git commit -m "docs(lexicons): add agreement namespace — master, stakeholder terms, signatures"
```

---

### Task 5: Funding and Alignment namespaces

**Files:**
- Modify: `packages/lexicons/LEXICONS.md`
- Read: `packages/lexicons/network/coopsource/funding/campaign.json`
- Read: `packages/lexicons/network/coopsource/funding/pledge.json`
- Read: `packages/lexicons/network/coopsource/alignment/interest.json`
- Read: `packages/lexicons/network/coopsource/alignment/outcome.json`
- Read: `packages/lexicons/network/coopsource/alignment/interestMap.json`
- Read: `packages/lexicons/network/coopsource/alignment/stakeholder.json`

- [ ] **Step 1: Read all 6 JSON schema files**

`alignment/interest` has many sub-definitions: `interestItem`, `contributionItem`, `constraintItem`, `redLineItem`, `workPreferences`. `alignment/outcome` has `successCriterion`, `supportEntry`. `alignment/interestMap` has `alignmentZone`, `conflictZone`, `aiAnalysis`.

- [ ] **Step 2: Write the `funding` namespace section**

**Prose intro** (3-5 sentences): Campaigns define a funding goal with a type (rewards, patronage, donation, revenue_share) and model (all_or_nothing, keep_it_all). Members create pledges to back campaigns. Note that campaigns are written via pdsService by the creating member, not by the cooperative.

**Field tables** for:
- `network.coopsource.funding.campaign` — written to **member's PDS**
- `network.coopsource.funding.pledge` — written to **member's PDS**

- [ ] **Step 3: Write the `alignment` namespace section**

**Prose intro** (3-5 sentences): Members declare their interests in a project — priorities, constraints, contributions they can make, and non-negotiable red lines. They propose outcomes with measurable success criteria and track stakeholder support levels. Interest maps compute alignment zones (where stakeholders agree) and conflict zones (areas of tension), optionally with AI-generated analysis and mediation suggestions. Notes that `interestMap` and `stakeholder` are DB-only.

**Field tables** for:
- `network.coopsource.alignment.interest` — written to **member's PDS**
  - Sub-definitions: `interestItem`, `contributionItem`, `constraintItem`, `redLineItem`, `workPreferences`
- `network.coopsource.alignment.outcome` — written to **member's PDS**
  - Sub-definitions: `successCriterion`, `supportEntry`
- `network.coopsource.alignment.interestMap` — **DB-only**
  - Sub-definitions: `alignmentZone`, `conflictZone`, `aiAnalysis`
- `network.coopsource.alignment.stakeholder` — **DB-only**

- [ ] **Step 4: Verify**

Count fields in each table and sub-definition table against JSON files.

- [ ] **Step 5: Commit**

```bash
git add packages/lexicons/LEXICONS.md
git commit -m "docs(lexicons): add funding and alignment namespaces"
```

---

### Task 6: Ops and Finance namespaces

**Files:**
- Modify: `packages/lexicons/LEXICONS.md`
- Read: `packages/lexicons/network/coopsource/ops/task.json`
- Read: `packages/lexicons/network/coopsource/ops/taskAcceptance.json`
- Read: `packages/lexicons/network/coopsource/ops/schedule.json`
- Read: `packages/lexicons/network/coopsource/ops/timeEntry.json`
- Read: `packages/lexicons/network/coopsource/finance/expense.json`
- Read: `packages/lexicons/network/coopsource/finance/expenseApproval.json`
- Read: `packages/lexicons/network/coopsource/finance/revenue.json`

- [ ] **Step 1: Read all 7 JSON schema files**

- [ ] **Step 2: Write the `ops` namespace section**

**Prose intro** (3-5 sentences): Task coordination follows a bilateral pattern — the cooperative creates a task via OperatorWriteProxy, and the assigned member writes a `taskAcceptance` record. Schedule entries track shifts and recurring work. Time entries record hours worked. Notes that `taskAcceptance` and `timeEntry` are DB-only. Notes the naming mismatch: the lexicon schema defines `ops.schedule` but some code references it as `ops.scheduleShift`.

**Field tables** for:
- `network.coopsource.ops.task` — written to **cooperative's PDS**
- `network.coopsource.ops.taskAcceptance` — **DB-only**
- `network.coopsource.ops.schedule` — written to **cooperative's PDS**
- `network.coopsource.ops.timeEntry` — **DB-only** (Tier 2 private)

- [ ] **Step 3: Write the `finance` namespace section**

**Prose intro** (2-3 sentences): All finance records are DB-only and explicitly Tier 2 private — they are never written to ATProto PDS or published on the firehose. Members submit expense claims; the cooperative approves or rejects them. Revenue entries record cooperative income with optional period tracking.

**Field tables** for:
- `network.coopsource.finance.expense` — **DB-only** (Tier 2 private)
- `network.coopsource.finance.expenseApproval` — **DB-only** (Tier 2 private)
- `network.coopsource.finance.revenue` — **DB-only** (Tier 2 private)

- [ ] **Step 4: Verify**

Count fields in each table against JSON files.

- [ ] **Step 5: Commit**

```bash
git add packages/lexicons/LEXICONS.md
git commit -m "docs(lexicons): add ops and finance namespaces"
```

---

### Task 7: Admin, Legal, Commerce, and Connection namespaces

**Files:**
- Modify: `packages/lexicons/LEXICONS.md`
- Read: `packages/lexicons/network/coopsource/admin/officer.json`
- Read: `packages/lexicons/network/coopsource/admin/complianceItem.json`
- Read: `packages/lexicons/network/coopsource/admin/memberNotice.json`
- Read: `packages/lexicons/network/coopsource/admin/fiscalPeriod.json`
- Read: `packages/lexicons/network/coopsource/legal/document.json`
- Read: `packages/lexicons/network/coopsource/legal/meetingRecord.json`
- Read: `packages/lexicons/network/coopsource/commerce/listing.json`
- Read: `packages/lexicons/network/coopsource/commerce/need.json`
- Read: `packages/lexicons/network/coopsource/commerce/resource.json`
- Read: `packages/lexicons/network/coopsource/commerce/collaborativeProject.json`
- Read: `packages/lexicons/network/coopsource/commerce/intercoopAgreement.json`
- Read: `packages/lexicons/network/coopsource/connection/link.json`
- Read: `packages/lexicons/network/coopsource/connection/binding.json`
- Read: `packages/lexicons/network/coopsource/connection/sync.json`

- [ ] **Step 1: Read all 15 JSON schema files**

`connection/link` has sub-definition `metadata`. `connection/binding` has sub-definition `resourceMetadata`.

- [ ] **Step 2: Write the `admin` namespace section**

**Prose intro** (1-2 sentences): Officer appointments, regulatory compliance deadlines, member communications, and fiscal year management. All DB-only; declarative AppView hook configs exist for future indexing.

**Field tables** for:
- `network.coopsource.admin.officer` — **DB-only**
- `network.coopsource.admin.complianceItem` — **DB-only**
- `network.coopsource.admin.memberNotice` — **DB-only**
- `network.coopsource.admin.fiscalPeriod` — **DB-only**

- [ ] **Step 3: Write the `legal` namespace section**

**Prose intro** (1-2 sentences): Versioned legal documents (bylaws, articles of incorporation, policies, resolutions) and meeting records with attendance, resolutions, and certified minutes. DB-only.

**Field tables** for:
- `network.coopsource.legal.document` — **DB-only**
- `network.coopsource.legal.meetingRecord` — **DB-only**

- [ ] **Step 4: Write the `commerce` namespace section**

**Prose intro** (2-3 sentences): Marketplace records for cooperative commerce — service/product listings, procurement needs, shared resources, cross-cooperative projects, and bilateral B2B agreements. Most are written to the cooperative's PDS via OperatorWriteProxy and are discoverable across the ATProto ecosystem via firehose. Inter-coop agreements use a bilateral pattern where each cooperative writes their copy. Notes the naming mismatch: the lexicon schema defines `commerce.resource` but some code references it as `commerce.sharedResource`.

**Field tables** for:
- `network.coopsource.commerce.listing` — written to **cooperative's PDS**
- `network.coopsource.commerce.need` — written to **cooperative's PDS**
- `network.coopsource.commerce.resource` — written to **cooperative's PDS**
- `network.coopsource.commerce.collaborativeProject` — written to **cooperative's PDS**
- `network.coopsource.commerce.intercoopAgreement` — written to **cooperative's PDS**

- [ ] **Step 5: Write the `connection` namespace section**

**Prose intro** (1-2 sentences): External OAuth service integrations (GitHub, Google, etc.). Members write connection links to their PDS; resource bindings and sync events are DB-only.

**Field tables** for:
- `network.coopsource.connection.link` — written to **member's PDS**
  - Sub-definition: `metadata`
- `network.coopsource.connection.binding` — **DB-only**
  - Sub-definition: `resourceMetadata`
- `network.coopsource.connection.sync` — **DB-only**

- [ ] **Step 6: Verify**

Count fields in each table and sub-definition table against JSON files. All 15 lexicons covered.

- [ ] **Step 7: Commit**

```bash
git add packages/lexicons/LEXICONS.md
git commit -m "docs(lexicons): add admin, legal, commerce, connection namespaces"
```

---

### Task 8: Cross-references and final verification

**Files:**
- Modify: `README.md`
- Modify: `packages/lexicons/LEXICONS.md`

- [ ] **Step 1: Add cross-reference from README.md**

In the "See also" section at the bottom of README.md, add a link to the lexicon reference:

```markdown
- [packages/lexicons/LEXICONS.md](./packages/lexicons/LEXICONS.md) — ATProto lexicon schema reference (41 schemas, record ownership, field tables)
```

- [ ] **Step 2: Fix the lexicon count in README.md**

The README monorepo layout says "44 schemas" — update to "41 schemas" (verified by file count).

- [ ] **Step 3: Final verification of LEXICONS.md**

Run these checks:
1. Count total lexicons documented — grep for `#### \`network.coopsource.` headings. Should be 41.
2. Verify the ownership matrix totals: 8 + 12 + 21 = 41.
3. Spot-check 3-4 field tables against JSON files — pick one from each complexity tier (e.g. `org.membership`, `agreement.stakeholderTerms`, `admin.officer`).
4. Verify all namespace sections are present: org, governance, agreement, funding, alignment, ops, finance, admin, legal, commerce, connection (11 total).

- [ ] **Step 4: Commit**

```bash
git add README.md packages/lexicons/LEXICONS.md
git commit -m "docs: add lexicon reference cross-links, fix schema count (41 not 44)"
```
