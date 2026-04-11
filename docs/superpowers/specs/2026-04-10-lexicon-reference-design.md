# Lexicon Reference Documentation — Design Spec

**Date:** 2026-04-10
**Location:** `packages/lexicons/LEXICONS.md`
**Audience:** External developers building ATProto apps that interact with coopsource records

## Context

The project has 41 ATProto lexicon schemas under `network.coopsource.*` across 11 namespaces. The schemas are self-documented to varying degrees (some have thorough field descriptions, others are minimal). Architecture docs (V5 Section 13) contain comprehensive schema specifications but are buried in a 900-line document alongside unrelated content. There is no centralized, external-developer-facing reference.

External developers need to understand: what records exist, what fields they have, who writes them (member vs cooperative), where they're stored (PDS vs DB-only), and how multi-record workflows operate.

## Design

### File

`packages/lexicons/LEXICONS.md` — a single markdown file next to the schema JSON files.

### Structure

1. **Overview** — 2-3 paragraphs: what these lexicons are, the `network.coopsource.*` namespace, ATProto context, link to the lexicon JSON files.

2. **Record Ownership Matrix** — A table with three columns:
   - **Member's PDS** (8 records): membership, vote, signature, interest, outcome, pledge, connection.link, funding.campaign
   - **Cooperative's PDS** (12 records): cooperative, memberApproval, proposal (conditional), master, stakeholderTerms, intercoopAgreement, ops.task, ops.schedule, commerce.listing, commerce.need, commerce.resource, commerce.collaborativeProject

   Note: `actor.profile` is also written to member PDS but has no JSON schema in this package — it is defined in code only.
   Note: The code references `ops.schedule` as `ops.scheduleShift` and `commerce.resource` as `commerce.sharedResource` in some service layers. This doc uses the canonical lexicon IDs from the JSON schema files.
   - **DB-only** (21 records): all admin, legal, finance, org.project/team/role, agreement.amendment/contribution, governance.delegation, ops.taskAcceptance/timeEntry, connection.binding/sync, alignment.interestMap/stakeholder

   Notes:
   - `governance.proposal` uses VisibilityRouter: open governance → PDS (Tier 1), closed governance → `private_record` table (Tier 2)
   - Finance records and `ops.timeEntry` are explicitly Tier 2 private (never on firehose by design)
   - Other DB-only records have declarative hook configs for future AppView indexing but no ATProto write path implemented yet

3. **Data Tiers** — Brief section (can be merged into ownership matrix notes):
   - Tier 1: Public ATProto PDS records, on the firehose
   - Tier 2: Private PostgreSQL (`private_record` table or DB-only), never on firehose
   - Tier 3: E2EE (not represented in lexicons — Germ DM / MLS)

4-14. **Per-Namespace Sections** (11 namespaces), each containing:
   - Prose intro scaled to complexity
   - Field table per lexicon (columns: Field, Type, Required, Description)
   - Sub-definition tables where applicable

### Namespace Content

#### Complex namespaces (workflow intros, 6-10 sentences)

**`org`** (6 lexicons: cooperative, membership, memberApproval, project, team, role)
- Intro explains bilateral membership lifecycle: member writes `membership` to their PDS, cooperative writes `memberApproval` to its PDS, AppView matches the pair and transitions status to `active`. Out-of-order arrival is handled (either record can arrive first). Role authority lives only in `memberApproval`, never self-declared.
- Notes cooperative → project → team → role hierarchy.
- Notes `project`, `team`, `role` are DB-only.

**`governance`** (3 lexicons: proposal, vote, delegation)
- Intro walks through proposal lifecycle: draft → discussion → voting → passed/failed/withdrawn.
- Explains voting methods (simple_majority, supermajority, consensus, ranked_choice), quorum calculation (votesCast vs totalMembers basis), weighted voting, and delegation (project-wide or per-proposal scope).
- Notes `proposal` uses VisibilityRouter for open vs closed governance.
- Notes `delegation` is DB-only (URI constructed, stored in PostgreSQL).

**`agreement`** (5 lexicons: master, stakeholderTerms, signature, amendment, contribution)
- Intro explains the agreement chain: master agreement governs a project → stakeholder terms define each party's obligations/compensation/IP/governance/exit → signatures written by each signer to their own PDS → amendments link to governance proposals for voting → contributions track fulfillment of terms.
- Notes `amendment` and `contribution` are DB-only.

#### Medium namespaces (brief intros, 3-5 sentences)

**`funding`** (2 lexicons: campaign, pledge)
- Campaign defines a funding goal with type (rewards, patronage, donation, revenue_share) and model (all_or_nothing, keep_it_all). Pledges are member-written.
- Note: campaign is written via pdsService by the creating member, not the cooperative.

**`alignment`** (4 lexicons: interest, outcome, interestMap, stakeholder)
- Members declare interests (with priorities, constraints, red lines) and propose outcomes (with success criteria). Interest maps compute alignment/conflict zones across stakeholders, optionally with AI analysis.
- Notes `interestMap` and `stakeholder` are DB-only.

**`ops`** (4 lexicons: task, taskAcceptance, schedule, timeEntry)
- Task coordination with bilateral acceptance pattern: cooperative creates task (OperatorWriteProxy), member writes taskAcceptance. Schedule entries use OperatorWriteProxy. Time entries are Tier 2 private.
- Notes the `schedule` (lexicon) / `scheduleShift` (code) naming mismatch.
- Notes `taskAcceptance` and `timeEntry` are DB-only.

**`finance`** (3 lexicons: expense, expenseApproval, revenue)
- All DB-only, explicitly Tier 2 private. Expense → expenseApproval flow (member submits, cooperative approves/rejects). Revenue records income with period tracking.

#### Simple namespaces (1-2 sentence intros)

**`admin`** (4 lexicons: officer, complianceItem, memberNotice, fiscalPeriod)
- Officer appointments, regulatory compliance tracking, member communications, fiscal year management. All DB-only; declarative hook configs exist for future AppView indexing.

**`legal`** (2 lexicons: document, meetingRecord)
- Versioned legal documents (bylaws, articles, policies) and meeting records with attendance, resolutions, and certified minutes. DB-only.

**`commerce`** (5 lexicons: listing, need, resource, collaborativeProject, intercoopAgreement)
- Marketplace records for cooperative commerce: service/product listings, procurement needs, shared resources, cross-cooperative projects, and bilateral B2B agreements. Most use OperatorWriteProxy.

**`connection`** (3 lexicons: link, binding, sync)
- External OAuth service integrations. `link` is written to member's PDS; `binding` and `sync` are DB-only.

### Field Table Format

Each lexicon gets a table like:

```markdown
#### `network.coopsource.governance.vote`

A vote cast on a governance proposal. Written to the **member's PDS** via MemberWriteProxy.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `proposalUri` | at-uri | Yes | The proposal being voted on |
| `voterDid` | did | Yes | DID of the voter |
| `choice` | string (max 1000) | Yes | `yes`, `no`, `abstain`; or JSON array for ranked_choice |
| `weight` | number (min 0) | No | Voting weight (defaults to 1.0, may be higher from delegations) |
| `rationale` | string (max 2000) | No | Explanation of the voter's reasoning |
| `delegatedFrom` | did | No | DID of the delegator, if vote was cast on someone's behalf |
| `createdAt` | datetime | Yes | |
```

Sub-definitions (like `governanceFramework` in `agreement.master`) get a separate sub-table immediately after the parent field table, with a heading like "Sub-definition: `governanceFramework`".

### What's NOT in scope

- Example payloads (the field tables with types and descriptions are sufficient)
- Generated TypeScript type documentation (that's a codegen concern)
- Lexicon governance process (how new lexicons are proposed/versioned)
- Internal implementation details (service layer, hook pipeline)

## Verification

After implementation:
1. Count lexicons documented — should be 41
2. Cross-check every field table against the corresponding JSON schema file
3. Verify ownership matrix against the code-verified split from this design phase
4. Check all internal links resolve
