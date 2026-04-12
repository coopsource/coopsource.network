# V9.2.3 Design: Remaining XRPC Query Endpoints

> **Date**: April 12, 2026
> **Branch**: `feature/v9.2.3-remaining-xrpc`
> **Prerequisite**: V9.2 (4 XRPC endpoints shipped), V9.2.1 (PLC service entry), V9.2.2 (OAuth scopes)
> **Next**: V9.3 (Inlay governance components) — consumes these endpoints

---

## Problem

V9.2 shipped 4 XRPC query endpoints (`getCooperative`, `getMembership`, `listProposals`, `getProposal`). V9.3 Inlay governance components need 3 more: a member directory (with privacy controls), vote eligibility checks, and an officer listing.

## Solution

Add 3 XRPC query endpoints and a per-member directory visibility preference:

| Endpoint | Namespace | Auth | Inlay Component |
|----------|-----------|------|-----------------|
| `network.coopsource.org.listMembers` | org | optional viewer | OfficerList, GovernanceFeed |
| `network.coopsource.governance.getVoteEligibility` | governance | viewer | VoteWidget |
| `network.coopsource.admin.getOfficers` | admin | none | OfficerList |

Plus: `directory_visible boolean DEFAULT false` column on the membership table.

Dropped from original CLAUDE-CODE-PROMPT-V9.md proposal:
- `getMemberRoles` — redundant with `getMembership` (already returns roles)
- `getVoteTally` — redundant with `getProposal` (already returns tally)
- `hasAuthority` — deferred to a later phase (governance moderation)

## DB Migration: `directory_visible`

Add `directory_visible boolean NOT NULL DEFAULT false` to the `membership` table. Privacy is on by default — members opt in to appearing in the public directory.

Edit the existing migration file (DB is disposable pre-release, per project conventions).

## Dispatcher: Optional Auth Mode

The dispatcher currently supports `auth: 'none'` and `auth: 'viewer'`. `listMembers` needs `auth: 'optional'` — run `requireViewer` but don't 401 if no session exists. The `viewer` field in `XrpcContext` becomes `viewer?: { did, displayName }`.

Implementation: add `'optional'` to the auth union type in the dispatcher. When `auth === 'optional'`, call `requireViewer` wrapped in a try/catch that swallows auth errors and leaves `req.viewer` undefined.

## Endpoint 1: `listMembers`

**Method**: `network.coopsource.org.listMembers`
**Auth**: optional viewer
**Rate limit**: 15 min / 60 queries

**Parameters**: `cooperative` (DID, required), `limit` (int, default 50, max 100), `cursor` (string)

**Three-tier visibility model**:

| Caller | Sees |
|--------|------|
| No auth | Only `directory_visible=true` members. Full detail for those shown. |
| Authed non-member | All members. `directory_visible=false` members show `{ did, joinedAt, private: true }` only. |
| Authed fellow member | All members with full detail regardless of `directory_visible`. |

**Response**:
```json
{
  "members": [
    {
      "did": "did:plc:abc123",
      "displayName": "Alice",
      "roles": ["admin", "member"],
      "joinedAt": "2026-01-15T00:00:00Z",
      "private": false
    }
  ],
  "cursor": "..."
}
```

For private members shown to authed non-members:
```json
{
  "did": "did:plc:def456",
  "joinedAt": "2026-03-01T00:00:00Z",
  "private": true
}
```

**Service call**: `membershipService.listMembers(cooperativeDid, params)` — returns paginated active members. The handler applies the privacy filter based on caller context.

**Fellow member check**: Query `membershipService.getMember(cooperativeDid, viewer.did)` to check if the viewer is an active member. Cache-friendly since `getMembership` already does this.

## Endpoint 2: `getVoteEligibility`

**Method**: `network.coopsource.governance.getVoteEligibility`
**Auth**: viewer (required)
**Rate limit**: 15 min / 200 queries

**Parameters**: `proposal` (string, required — proposal ID)

**Response**:
```json
{
  "eligible": true,
  "weight": 3,
  "hasVoted": false,
  "reason": null
}
```

When ineligible:
```json
{
  "eligible": false,
  "weight": 0,
  "hasVoted": false,
  "reason": "not_active_member"
}
```

Possible reasons: `not_active_member`, `proposal_not_voting`, `already_voted`.

**Service calls**:
- `proposalService.getProposal(id)` — get proposal + check status is `voting`
- `membershipService.getMember(cooperativeDid, viewer.did)` — check active membership
- `delegationVotingService.calculateVoteWeight(cooperativeDid, viewer.did, proposalId)` — compute weight including delegations
- Check existing votes for `(viewer.did, proposalId)` — determine `hasVoted`

## Endpoint 3: `getOfficers`

**Method**: `network.coopsource.admin.getOfficers`
**Auth**: none
**Rate limit**: 15 min / 60 queries

**Parameters**: `cooperative` (DID, required)

**Response**:
```json
{
  "officers": [
    {
      "did": "did:plc:abc123",
      "displayName": "Alice",
      "title": "President",
      "appointedAt": "2026-01-01T00:00:00Z",
      "termEndsAt": "2027-01-01T00:00:00Z"
    }
  ]
}
```

**Service call**: `officerRecordService.getCurrent(cooperativeDid)` — returns active officers sorted by title. Join with `entity` table for `displayName`.

## Lexicon Schemas

3 new JSON files:
- `packages/lexicons/network/coopsource/org/listMembers.json`
- `packages/lexicons/network/coopsource/governance/getVoteEligibility.json`
- `packages/lexicons/network/coopsource/admin/getOfficers.json`

After creating schemas: `pnpm --filter @coopsource/lexicons lex:generate` + strip warning lines from generated output (same cleanup as V9.2).

Update `packages/lexicons/tests/lexicons.test.ts` snapshot: 40 → 43 schemas.

## Handler Files

3 new handlers in `apps/api/src/xrpc/handlers/`:
- `list-members.ts`
- `get-vote-eligibility.ts`
- `get-officers.ts`

Register all 3 in `apps/api/src/xrpc/index.ts`.

## Testing

One test file per handler following the V9.2 pattern (`apps/api/tests/xrpc-*.test.ts`):
- `xrpc-list-members.test.ts` — tests all three visibility tiers, pagination, closed-gov 404
- `xrpc-vote-eligibility.test.ts` — eligible, ineligible (not member, not voting, already voted), delegation weight
- `xrpc-officers.test.ts` — returns current officers, empty list, closed-gov 404

## Verification

1. `pnpm test` — all tests pass (761+ existing + new endpoint tests)
2. `pnpm --filter @coopsource/lexicons lex:generate` — codegen succeeds
3. Lexicon snapshot test updated to 43 schemas

## Files Summary

| File | Action |
|------|--------|
| `packages/db/src/migrations/001_foundation.ts` (or relevant migration) | Modify — add `directory_visible` |
| `packages/lexicons/network/coopsource/org/listMembers.json` | New |
| `packages/lexicons/network/coopsource/governance/getVoteEligibility.json` | New |
| `packages/lexicons/network/coopsource/admin/getOfficers.json` | New |
| `packages/lexicons/src/generated/lexicons.ts` | Regenerated |
| `packages/lexicons/tests/lexicons.test.ts` | Modify — 40 → 43 |
| `apps/api/src/xrpc/dispatcher.ts` | Modify — add `'optional'` auth mode |
| `apps/api/src/xrpc/index.ts` | Modify — register 3 handlers |
| `apps/api/src/xrpc/handlers/list-members.ts` | New |
| `apps/api/src/xrpc/handlers/get-vote-eligibility.ts` | New |
| `apps/api/src/xrpc/handlers/get-officers.ts` | New |
| `apps/api/tests/xrpc-list-members.test.ts` | New |
| `apps/api/tests/xrpc-vote-eligibility.test.ts` | New |
| `apps/api/tests/xrpc-officers.test.ts` | New |
| `ARCHITECTURE-V9.md` | Modify — mark V9.2.3 shipped |
