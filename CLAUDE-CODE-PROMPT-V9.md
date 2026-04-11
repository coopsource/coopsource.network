# CLAUDE-CODE-PROMPT-V9.md — Ecosystem Composability Implementation Guide

> **For**: Claude Code / Claude agents working on the Co-op Source Network codebase
> **Architecture reference**: ARCHITECTURE-V9.md
> **Codebase reference**: CLAUDE.md (constraints, patterns, build commands)
> **Deployment reference**: DEPLOYMENT.md (dev modes, env vars, Docker stacks)
> **Lexicon reference**: packages/lexicons/LEXICONS.md (41 schemas, ownership matrix)
> **Date**: April 11, 2026
> **Status**: Active

---

## Your Role

You are implementing the Co-op Source Network V9 — ecosystem composability and governance as a service. The codebase is a working monorepo with ~600 source files, 88 pages, 60+ services, 100+ database tables, 41 lexicon schemas, 339 E2E tests, and 981 total tests. V6 (real ATProto federation), V7 (production deployment, hook pipeline, scripting), and V8.1-V8.11 (Home, Profiles, Search, Matchmaking, Entity Editing) are complete and merged.

**V9 focuses on making CSN a composable governance service within the ATProto ecosystem.** Read ARCHITECTURE-V9.md thoroughly before making any decisions.

**For full codebase context, patterns, and constraints, read CLAUDE.md.** It is the authoritative reference for technology choices, git workflow, and design principles.

---

## Critical Constraints (from CLAUDE.md — Non-Negotiable)

- **TypeScript strict mode** — no `any`, no unsafe casts
- **Express 5** — standard routes; `@atproto/xrpc-server` is NOT used
- **Kysely 0.28+** — NOT Prisma, Drizzle, or TypeORM
- **SvelteKit 2** with **Svelte 5** runes
- **Vite 7** — Tailwind CSS 4 plugin MUST come BEFORE `sveltekit()`
- **pnpm 10+** workspace, **Turborepo 2+**, **Vitest 4**, **Zod 4**, **Node.js 24 LTS**
- **Bilateral membership is non-negotiable** — active ONLY when BOTH records exist
- **Role authority is ONLY in memberApproval**
- **DIDs are authoritative** — never handles for security
- **Records of authority live in PDS repos** — PostgreSQL is a materialized index
- **Tier 2 private data NEVER touches the firehose**
- **All work on feature branches** — never commit directly to `main`
- **Clean up merged branches** — delete after merge

---

## V9 Phases Overview

| Phase | Branch | Priority | Goal |
|-------|--------|----------|------|
| V9.1 | `feature/v9.1-service-auth` | Immediate | Replace shared admin-Basic with CSN-owned PLC signing keys + app-password sessions |
| V9.2 | `feature/v9.2-governance-api` | Immediate | XRPC query endpoints for external ATProto apps |
| V9.3 | `feature/v9.3-inlay-components` | After V9.2 | Composable governance widgets for cross-app embedding |
| V9.4 | `feature/v9.4-content-wrappers` | Medium | Cooperative-curated content via strongRef wrappers |
| V9.5 | `feature/v9.5-transparency-logs` | Medium-High | Append-only Merkle accountability for governance |
| V9.6 | `feature/v9.6-opensocial-bridge` | Deferred | Optional opensocial.community compatibility |
| V9.7 | N/A | Ongoing | Lexicon Community engagement (community work, not code) |
| V9.8 | `feature/v9.8-space-adapter` | Deferred | Permission spaces adapter when spaces ship |

**Start V9.1 and V9.2 in parallel.**

---

## Phase V9.1: Cooperative Write Path — App-Password Sessions

### Context

Today, every write to a cooperative's PDS repo in production (`PDS_URL` set) routes through `AtprotoPdsService.getAgentForDid()` at `packages/federation/src/atproto/atproto-pds-service.ts:247-265`, which attaches `Authorization: Basic admin:${PDS_ADMIN_PASSWORD}` on every XRPC call — a shared admin credential with full control over every repo on the PDS. That mechanism is **also empirically broken**: `@atproto/pds` rejects admin Basic on `com.atproto.repo.*` methods with `"Unexpected authorization type"`. V6 federation tests only passed because `createDid()` cached the post-`createAccount` session-bearing agent and every test happened to reuse it.

V9.1 replaces admin-Basic with **per-cooperative app-password sessions** — the atproto-native primitive for "a third-party service holds scoped, revocable credentials to act on behalf of an account." Each cooperative gets a privileged app password during provisioning (via `com.atproto.server.createAppPassword`), stored encrypted in `auth_credential`. `AtprotoPdsService.authFor(did, lxm)` reads the app password, opens a `login`-based session via `AtpAgent.login`, caches the session-bearing agent per DID, and uses it for all subsequent repo writes. `@atproto/api` handles access-token refresh automatically via the stored `refreshJwt`.

**Critical verification**: service-auth JWTs signed by the repo owner are NOT accepted by `@atproto/pds` (current main 0.4.218) for `com.atproto.repo.createRecord`, `putRecord`, or `deleteRecord`. The `authorization()` verifier used by those handlers routes Bearer tokens to the legacy `access()` verifier (which expects PDS-issued session tokens) and DPoP tokens to OAuth; it has no service-auth branch. The ecosystem-native path for server-to-server writes is **app-password login**, not service-auth — see [bluesky-social/atproto discussion #4118](https://github.com/bluesky-social/atproto/discussions/4118) for the current permission-set state.

The full implementation plan lives at `/Users/alan/.claude/plans/immutable-stirring-flamingo.md`. ARCHITECTURE-V9.md §2 has the full design rationale including what was deferred from the earlier sketch and why.

### Tasks

1. **Add `AuthCredentialResolver`** at `packages/federation/src/http/auth-credential-resolver.ts`. Mirror of `SigningKeyResolver` — single method `resolveAppPassword(did): Promise<string>` reads the active `auth_credential` row with `credential_type='atproto-app-password'`, decrypts `secret_hash` via `KEY_ENC_KEY`, returns plaintext. Throws when no row exists (the fallback signal for `authFor`).

2. **Build `provisionCooperative`** at `packages/federation/src/local/cooperative-provisioning.ts`. Single library function:
   - As PDS admin (HTTP Basic), create an invite code via `com.atproto.server.createInviteCode`.
   - Call `com.atproto.server.createAccount({handle, email, password, inviteCode})` the normal way — let the PDS generate its own rotation + signing keys and register the DID in PLC. Returns an activated account with `accessJwt` + `refreshJwt`.
   - Using the `accessJwt` as Bearer auth, call `com.atproto.server.createAppPassword({name: 'coopsource-api', privileged: true})`.
   - Encrypt the returned app password with `KEY_ENC_KEY` and insert into `auth_credential` with `credential_type='atproto-app-password'`, `identifier=<did>`.
   - Insert the matching `entity` row.
   - Discard the random account password.

3. **Modify `AtprotoPdsService`** at `packages/federation/src/atproto/atproto-pds-service.ts`:
   - Add optional constructor param `authCredentialResolver?`. Back-compat positional extension.
   - Add `authFor(did, lxm)` with this decision order:
     1. **App-password session (the V9.1 win).** `authCredentialResolver.resolveAppPassword(did)` → `agent.login` → cached session-bearing agent per DID.
     2. **Post-`createDid` session cache.** V6-era narrow in-process fallback for DIDs just provisioned via `createDid` without a stored app password.
     3. **Admin Basic.** Terminal fallback — still broken for repo writes but kept for admin endpoints and as a clear failure signal.
   - Add `withAuthForCoop(did, lxm, fn)` wrapper that retries once on auth-class errors (`ExpiredToken`, `InvalidToken`, `AuthRequiredError`, HTTP 401) by invalidating the cached session and re-running `authFor`.
   - Wrap `createRecord`, `putRecord`, `deleteRecord` agent calls in `withAuthForCoop`.
   - **Retain** `sessionCache` (the V6 post-`createDid` map) unchanged — its narrow use pattern was correct.

4. **Wire DI** in `apps/api/src/container.ts` — instantiate `AuthCredentialResolver` (with `KEY_ENC_KEY`) and pass it as the new optional param to `AtprotoPdsService`. No config changes, no new env vars.

5. **CLI wrapper** at `apps/api/scripts/provision-cooperative.ts` — thin arg parser that opens a `@coopsource/db` Kysely connection and calls `provisionCooperative`. Lives inside `apps/api/scripts/` (not top-level `scripts/`) so tsx resolves workspace package imports against `apps/api/node_modules/@coopsource/*`.

6. **Do NOT rewrite OAuth scopes in V9.1.** The proposed narrow replacement (`rpc:network.coopsource.governance?aud=* rpc:network.coopsource.org?aud=*`) breaks 8+ feature areas. Deferred to V9.2 with the full per-namespace audit. `apps/api/src/auth/oauth-client.ts:30` stays as `'atproto transition:generic'`.

### Deferred from V9.1 (see ARCHITECTURE-V9.md §2 "What V9.1 ships vs. defers")

- **CSN-owned PLC signing keys for cooperatives.** Blocked on `@atproto/pds` 0.4 gates — `createAccount(plcOp)` is rejected as "Unsupported input", `getRecommendedDidCredentials` requires a session (circular), `activateAccount` rejects imports without the PDS rotation key in PLC. `ServiceAuthClient`, `SigningKeyResolver.resolveRawBytes`, `resolvePdsServiceDid` were built, tested (17 unit tests), and left in the codebase unused — they're correct and will be the starting point when upstream account-import UX matures.
- **`#coopsource` service entry in the cooperative's PLC doc.** Deferred to V9.2 where the governance AppView API will need it. Requires the `requestPlcOperationSignature` → email-token → `signPlcOperation` flow (automatable in dev via Mailpit).

### Key Files

- `packages/federation/src/http/auth-credential-resolver.ts` (new — app-password lookup)
- `packages/federation/src/local/cooperative-provisioning.ts` (new — `provisionCooperative` library)
- `packages/federation/src/atproto/atproto-pds-service.ts` (modify — add `authFor` + `withAuthForCoop`)
- `apps/api/src/container.ts` (wire `AuthCredentialResolver`)
- `apps/api/scripts/provision-cooperative.ts` (new CLI wrapper, inside `apps/api/scripts/`)
- `packages/federation/tests/coop-write-auth-mode.test.ts` (validation gate)

Retained but unused in V9.1 (see deferred list above):

- `packages/federation/src/atproto/service-auth-client.ts` + unit tests
- `packages/federation/src/http/signing-key-resolver.ts` `resolveRawBytes` method + unit tests
- `packages/federation/src/atproto/pds-did-resolver.ts`

### Tests

- Unit: `ServiceAuthClient` (9 tests, retained-but-unused infrastructure — JWT round-trip, signature verification, jti uniqueness).
- Unit: `SigningKeyResolver.resolveRawBytes` (6 tests, retained-but-unused).
- **Integration — validation gate**: `packages/federation/tests/coop-write-auth-mode.test.ts` runs under `make test:pds` against a real PDS auto-started by `global-setup.ts`. 9 assertions: provisioning writes `entity` + `auth_credential` rows, `AuthCredentialResolver` round-trip, `createRecord`/`putRecord`/`deleteRecord` succeed via the app-password session path, repeated writes reuse the cached session, fallback path for DIDs with no stored credential fails as expected.
- All 339 E2E tests pass.

---

## Phase V9.2: Governance AppView API

### Context

Position CSN as a queryable governance service. Model after Blacksky's AppView architecture.

### Tasks

1. **Define XRPC query lexicons** in `packages/lexicons/network/coopsource/query/`:
   - `getMembership.json`, `getMemberRoles.json`, `listMembers.json`
   - `getProposal.json`, `listProposals.json`, `getVoteEligibility.json`, `getVoteTally.json`
   - `getOfficers.json`, `hasAuthority.json`

2. **Build route handlers** at `apps/api/src/routes/xrpc-governance.ts`:

```typescript
// Each handler queries existing service layer, returns ATProto-standard format
router.get('/xrpc/network.coopsource.query.getMembership', xrpcAuth, rateLimit, async (req, res) => {
  const { memberDid, cooperativeDid } = req.query;
  const membership = await membershipService.getActiveMembership(memberDid, cooperativeDid);
  res.json({ active: !!membership, roles: membership?.roles ?? [] });
});
```

3. **Build XRPC auth middleware** at `apps/api/src/middleware/xrpc-auth.ts`:
   - Verify ATProto OAuth tokens from external callers
   - Resolve caller DID
   - Check membership/visibility permissions
   - Non-members: open cooperative data only; mixed cooperatives: anchor data only

4. **Rate limiting**: per-DID (100/hr non-member, 1000/hr member)

5. **Mount** in `apps/api/src/index.ts`

### Key Files
- `packages/lexicons/network/coopsource/query/` (new directory, 9 lexicons)
- `apps/api/src/routes/xrpc-governance.ts` (new)
- `apps/api/src/middleware/xrpc-auth.ts` (new)
- `apps/api/src/index.ts` (mount)

---

## Phase V9.3: Inlay Governance Components

### Context

Dan Abramov's Inlay (inlay.at, source at `tangled.org/danabra.mov/inlay`) enables remixable cross-product server-driven UI on ATProto. Brittany Ellich plans to integrate Inlay with opensocial groups.

### Tasks

1. **Study Inlay component model** — read source, understand data contracts and rendering
2. **Build server-side component data endpoints** — each returns structured data for Inlay rendering:
   - `/inlay/proposal-card/:uri` — proposal title, status, tally, vote action
   - `/inlay/membership-badge/:did/:coopDid` — membership status, roles
   - `/inlay/vote-widget/:proposalUri` — inline voting interface
   - `/inlay/cooperative-directory` — searchable cooperative listing
   - `/inlay/governance-feed/:coopDid` — activity stream
3. **Register components** with Inlay's component registry
4. **Test embedding** in at least one external ATProto client

### Dependencies
- V9.2 must ship first (components consume XRPC endpoints)
- Inlay's component authoring API must be stable

---

## Phase V9.4: Content Wrapper Pattern

### Tasks

1. **Define lexicon** `network.coopsource.org.curatedContent` — strongRef to member content, category, context, optional proposal link, curatedBy DID

2. **Build `CuratedContentService`** — CRUD with officer authorization (`curator` or `admin` roles)

3. **Add declarative hook config**:
```typescript
{
  collection: 'network.coopsource.org.curatedContent',
  targetTable: 'curated_content',
  writeMode: 'upsert',
  deleteStrategy: 'hard-delete',
  fieldMappings: [
    { recordField: 'content.uri', column: 'content_uri' },
    { recordField: 'content.cid', column: 'content_cid' },
    { recordField: 'category', column: 'category' },
    { recordField: 'context', column: 'context' },
    { recordField: 'relatedProposal', column: 'related_proposal_uri' },
    { recordField: 'curatedBy', column: 'curated_by_did' },
    { recordField: 'createdAt', column: 'created_at', transform: 'date_parse' },
  ],
}
```

4. **Kysely migration** for `curated_content` table

5. **Frontend** at `apps/web/src/routes/(authed)/coop/[handle]/curated/`

---

## Phase V9.5: Governance Transparency Logs

### Tasks

1. **Build `TransparencyLogService`** using `merkletreejs` + PostgreSQL:
   - Append governance events (proposal created/resolved, vote cast, policy changed) as Merkle leaves
   - Compute root hash, sign tree head with cooperative's secp256k1 key (reuse `LabelSigner` infrastructure)
   - Publish STH as ATProto record: `network.coopsource.governance.transparencyLog`

2. **Define lexicon** for STH records: treeSize, rootHash, timestamp, signature

3. **Hook integration** — post-storage hook on governance collections appends to transparency log

4. **XRPC endpoints** (add to V9.2 routes):
   - `network.coopsource.query.getInclusionProof`
   - `network.coopsource.query.getConsistencyProof`
   - `network.coopsource.query.getLatestSTH`

5. **Admin UI** — log health dashboard, latest STH, proof verification tool

### Key Design
- STH published every 60 seconds (batched, not per-event)
- Inclusion proofs are O(log n)
- Cross-cooperative monitoring: cooperatives can verify each other's logs

---

## Common Patterns

### Adding a New XRPC Endpoint

```typescript
// 1. Define lexicon JSON in packages/lexicons/network/coopsource/query/
// 2. Run: pnpm --filter @coopsource/lexicons lex:generate
// 3. Add handler in apps/api/src/routes/xrpc-governance.ts:
router.get('/xrpc/network.coopsource.query.getProposal',
  xrpcAuth,
  rateLimit,
  async (req, res) => {
    const { proposalUri } = req.query;
    // Query existing service layer
    const proposal = await proposalService.getByUri(proposalUri);
    // Check visibility
    if (!canAccess(req.callerDid, proposal.cooperativeDid)) return res.status(403).json({});
    res.json({ proposal });
  }
);
```

### Adding a New Declarative Hook

```typescript
// In apps/api/src/appview/hooks/declarative/configs.ts, add:
{
  collection: 'network.coopsource.org.curatedContent',
  targetTable: 'curated_content',
  writeMode: 'upsert',
  deleteStrategy: 'hard-delete',
  fieldMappings: [ /* ... */ ],
}
```

### Adding a New Service

1. Create class in `apps/api/src/services/`
2. Add to DI container in `apps/api/src/container.ts`
3. Create routes in `apps/api/src/routes/`
4. Mount in `apps/api/src/index.ts`
5. Add API client methods in `apps/web/src/lib/api/client.ts`
6. Create frontend routes in `apps/web/src/routes/`

---

## Security Requirements (V9 Additions)

### Service-Auth JWTs
- JWTs MUST be short-lived (< 60 seconds)
- MUST include `lxm` (method binding) to prevent scope escalation
- Verify signature against operator's DID document signing key
- Log every JWT-authenticated write with operator DID and method

### Governance AppView API
- External callers MUST authenticate via ATProto OAuth
- Per-DID rate limiting (100/hr non-member, 1000/hr member)
- Never expose pending/unmatched memberships
- Visibility check on every query

### Transparency Logs
- STHs signed by cooperative's secp256k1 key
- Log is append-only — no deletion, no modification
- Inclusion proofs are public (anyone can verify)

---

## Testing Strategy

### Per-Phase
- **V9.1**: JWT creation, mode switching, full write flow, all 339 E2E tests pass
- **V9.2**: XRPC auth, rate limiting, visibility enforcement, response format
- **V9.3**: Component data endpoints return correct structures
- **V9.4**: Curated content CRUD, officer authorization, declarative hook indexing
- **V9.5**: Merkle tree append, STH signing, inclusion/consistency proofs

### Regression
- All existing E2E tests MUST pass after each phase
- Hook pipeline behavior unchanged for existing collections
- Bilateral membership logic unchanged

---

## Pitfalls to Avoid

1. **Don't build permission spaces from scratch** — use existing private_record; ISpaceAdapter is a future migration interface
2. **Don't make the opensocial bridge mandatory** — it's opt-in per cooperative and deferred
3. **Service-auth JWTs are per-operation** — never cache or reuse them
4. **Don't expose Tier 2 data through the Governance AppView API** — only public/anchor data for non-members
5. **Don't block on Inlay's API stabilizing** — build the server endpoints first; Inlay integration is the last step
6. **Transparency log STHs are batched** — don't sign per-event; sign every 60 seconds
7. **XRPC routes are Express routes** — we don't use `@atproto/xrpc-server`; implement as standard `router.get()`
8. **The Roomy/OpenMeet service-auth pattern is experimental** — follow it but treat as pre-standard

---

## Build & Test Commands

```bash
pnpm install                                    # Install dependencies
pnpm dev                                        # Start dev servers
pnpm test                                       # Run all tests
pnpm --filter @coopsource/lexicons lex:generate # Regenerate types from lexicon JSON
pnpm build                                      # Build all packages
make dev                                        # Local dev with Homebrew services
make test:all                                   # Full suite with real PDS
```

---

## Key File Locations

```
Existing (modify in V9):
apps/api/src/services/operator-write-proxy.ts    # V9.1 — service-auth migration
apps/api/src/container.ts                        # V9.1, V9.2, V9.4, V9.5 — wire new services
apps/api/src/config.ts                           # V9.1 — add COOP_AUTH_MODE
apps/api/src/index.ts                            # V9.2 — mount XRPC routes
apps/api/src/appview/hooks/declarative/configs.ts # V9.4 — add curated content config
scripts/provision-cooperative.ts                 # V9.1 — DID doc service entry

New in V9:
packages/federation/src/atproto/service-auth-client.ts  # V9.1
packages/lexicons/network/coopsource/query/             # V9.2 (9 lexicons)
apps/api/src/routes/xrpc-governance.ts                  # V9.2
apps/api/src/middleware/xrpc-auth.ts                     # V9.2
apps/api/src/services/curated-content-service.ts         # V9.4
apps/api/src/services/transparency-log-service.ts        # V9.5
packages/lexicons/network/coopsource/org/curatedContent.json           # V9.4
packages/lexicons/network/coopsource/governance/transparencyLog.json   # V9.5
```

---

*This prompt provides the implementation context for V9. Always reference ARCHITECTURE-V9.md for design rationale and ecosystem context. Read CLAUDE.md for codebase constraints and patterns. Ask the user before making architectural decisions not covered by these documents.*
