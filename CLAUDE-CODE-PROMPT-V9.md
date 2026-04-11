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
| V9.1 | `feature/v9.1-service-auth` | Immediate | Replace OperatorWriteProxy app-passwords with service-auth JWTs |
| V9.2 | `feature/v9.2-governance-api` | Immediate | XRPC query endpoints for external ATProto apps |
| V9.3 | `feature/v9.3-inlay-components` | After V9.2 | Composable governance widgets for cross-app embedding |
| V9.4 | `feature/v9.4-content-wrappers` | Medium | Cooperative-curated content via strongRef wrappers |
| V9.5 | `feature/v9.5-transparency-logs` | Medium-High | Append-only Merkle accountability for governance |
| V9.6 | `feature/v9.6-opensocial-bridge` | Deferred | Optional opensocial.community compatibility |
| V9.7 | N/A | Ongoing | Lexicon Community engagement (community work, not code) |
| V9.8 | `feature/v9.8-space-adapter` | Deferred | Permission spaces adapter when spaces ship |

**Start V9.1 and V9.2 in parallel.**

---

## Phase V9.1: Service-Auth JWT Migration

### Context

Today, every write to a cooperative's PDS repo in production (`PDS_URL` set) goes through `AtprotoPdsService.getAgentForDid()` at `packages/federation/src/atproto/atproto-pds-service.ts:247-265`, which attaches `Authorization: Basic admin:${PDS_ADMIN_PASSWORD}` on every XRPC call — a shared admin credential with full control over every repo on the PDS. V9.1 replaces this with short-lived service-auth JWTs (`iss=cooperativeDid`, `aud=<pds service DID>`, `lxm=<xrpc method>`, `exp=now+60`) signed by the cooperative's own `verificationMethods.atproto` key. The Roomy/OpenMeet pattern (March 2026) proves the underlying JWT flow works across apps.

**Two scope realities** — neither reflected in the original sketch of this phase:

1. **CSN does not hold the cooperative's signing key today.** `AtprotoPdsService.createDid()` calls `com.atproto.server.createAccount` and the PDS generates the `verificationMethods.atproto` key internally; CSN never sees it. V9.1 must put CSN in control of that key via a PLC operation before JWTs can verify in production.
2. **The mode switch belongs inside `AtprotoPdsService`, not `OperatorWriteProxy`.** Many direct `pdsService.createRecord` / `putRecord` / `deleteRecord` calls target cooperative DIDs and bypass `OperatorWriteProxy` entirely (starter-pack-service, network-service, intercoop-agreement, membership, setup routes, federation routes, org/memberships routes). The ACL + audit layer in `OperatorWriteProxy` is orthogonal — unchanged in V9.1.

The full implementation plan lives at `/Users/alan/.claude/plans/immutable-stirring-flamingo.md` (reference it for per-step detail and the validation gate).

### Tasks

1. **Create `ServiceAuthClient`** at `packages/federation/src/atproto/service-auth-client.ts`:

```typescript
export class ServiceAuthClient {
  async createServiceAuth(params: {
    issuerDid: string;      // Cooperative DID (the repo owner)
    audienceDid: string;    // PDS service DID (from describeServer)
    lxm: string;            // XRPC method being called
    signingKey: Uint8Array; // Cooperative's atproto-signing key (32 raw bytes)
  }): Promise<string> {
    // Build JWT: header {alg:'ES256',typ:'JWT'}, payload {iss,aud,exp,iat,jti,lxm}
    // Sign via @atproto/crypto P256Keypair.sign() (returns 64-byte raw r||s)
    // Assemble three-part base64url token
  }
}
```

2. **Extend `SigningKeyResolver`** (`packages/federation/src/http/signing-key-resolver.ts`) with `resolveRawBytes(entityDid, purpose): Promise<Uint8Array>`. Returns the decrypted JWK's `d` field as 32 raw bytes. Keep the existing `resolve()` method (used for federation HTTP signing) unchanged. Throws when no matching row exists — the throw IS the fallback signal.

3. **Add `resolvePdsServiceDid(pdsUrl)`** at `packages/federation/src/atproto/pds-did-resolver.ts` — single exported function backed by a module-level `Map<string,string>` cache. Calls `com.atproto.server.describeServer` and returns `data.did`. No class.

4. **Modify `AtprotoPdsService`** at `packages/federation/src/atproto/atproto-pds-service.ts`:
   - Add optional constructor params `signingKeyResolver?`, `serviceAuthClient?`. Back-compat: positional extension `(pdsUrl, adminPassword, plcUrl?, signingKeyResolver?, serviceAuthClient?)`.
   - Replace `getAgentForDid(did)` with per-method `authFor(did, lxm)`:
     - Try `signingKeyResolver.resolveRawBytes(did, 'atproto-signing')`.
     - On success: resolve `audienceDid`, mint JWT, return fresh `AtpAgent` with `Authorization: Bearer <jwt>`.
     - On throw/missing/no-deps: return fresh `AtpAgent` with `Authorization: Basic admin:...` (today's behavior).
   - Call per operation from each of `createRecord`, `putRecord`, `deleteRecord`.
   - **Remove `sessionCache`** — service-auth JWTs must not be reused.

5. **Wire DI** in `apps/api/src/container.ts` — instantiate `SigningKeyResolver` (with `KEY_ENC_KEY`) and `ServiceAuthClient`, pass to `AtprotoPdsService`. `OperatorWriteProxy` is unchanged. **No config changes** — no `COOP_AUTH_MODE`, no new env vars.

6. **Provision cooperative signing key end-to-end.** Three scripts:
   - `scripts/request-coop-plc-signature.ts` — logs in as the cooperative, calls `com.atproto.identity.requestPlcOperationSignature` (triggers an email with a confirmation token), prints "check email" and exits (~15 lines).
   - `scripts/migrate-coop-signing-key.ts` — takes `--token <value>` (required), reads current PLC doc, merges in the new `verificationMethods.atproto` + `#coopsource` service entry, calls `signPlcOperation` + `submitPlcOperation`. Persists the new private key to `entity_key` with `key_purpose='atproto-signing'`.
   - `scripts/provision-cooperative.ts` (modify) — after `agent.createAccount()`, generates a fresh P-256 keypair, writes it to `entity_key` BEFORE any PLC op, then drives the two-phase migration flow. In dev, developers copy the confirmation token from Mailpit at `http://localhost:8025`.

7. **Do NOT rewrite OAuth scopes in V9.1.** The proposed narrow replacement (`rpc:network.coopsource.governance?aud=* rpc:network.coopsource.org?aud=*`) breaks 8+ feature areas (agreement, funding, alignment, commerce, ops, legal, connection, actor) that write records in namespaces outside the narrow set. Deferred to V9.2 where the full per-namespace scope audit happens alongside the governance AppView API. `apps/api/src/auth/oauth-client.ts:30` stays as `'atproto transition:generic'` for V9.1.

### Key Files
- `packages/federation/src/atproto/service-auth-client.ts` (new)
- `packages/federation/src/atproto/pds-did-resolver.ts` (new)
- `packages/federation/src/http/signing-key-resolver.ts` (modify — add `resolveRawBytes`)
- `packages/federation/src/atproto/atproto-pds-service.ts` (modify — add `authFor`, remove `sessionCache`)
- `packages/federation/src/index.ts` (export new pieces)
- `apps/api/src/container.ts` (wire `SigningKeyResolver` + `ServiceAuthClient`)
- `scripts/request-coop-plc-signature.ts` (new)
- `scripts/migrate-coop-signing-key.ts` (new)
- `scripts/provision-cooperative.ts` (modify — install CSN-owned atproto-signing key + PLC migration)

### Tests
- Unit: `ServiceAuthClient` creates valid JWTs with correct claims, signature round-trips, `jti` unique across 100 calls.
- Unit: `SigningKeyResolver.resolveRawBytes` returns 32 bytes, throws on missing, round-trips through `P256Keypair`.
- **Integration — validation gate**: `packages/federation/tests/coop-write-auth-mode.test.ts` runs under `make test:pds` against a real PDS auto-started by `global-setup.ts`. Asserts happy-path JWT write (Bearer header, decoded claims match), method binding, fallback to admin Basic for member DIDs, post-`createDid` ordering, and negative tests (expired JWT, wrong iss, wrong aud all rejected). **If the real PDS rejects `iss=repo.did` JWTs for `com.atproto.repo.createRecord`, stop V9.1 and write a new plan.**
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
