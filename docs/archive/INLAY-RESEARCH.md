# Inlay Components for Co-op Source Network: Source-Code-Informed Integration Guide (v2)

> **Updated April 13, 2026** — Revised with complete component inventory from ARCHITECTURE-V9.md and detailed auth analysis from both codebases. Cross-references CSN's shipped XRPC handlers, service-auth verifier, and Inlay's personalized component flow.

---

## Critical Corrections from Source Code

**Inlay is NOT React Server Components on the wire.** It's a custom JSON element tree protocol over XRPC. External components return `{ node: Element, cache: CachePolicy }` via XRPC POST. CSN's Express backend can serve Inlay components natively — no React, no RSC, no Next.js required.

**No third-party client code (RFC 003, stage-5).** Components cannot ship JavaScript. All interactivity must use host-provided Atsui primitives. This constrains what governance actions can happen inside an Inlay component.

**DID-based resolution (RFC 034).** Import stacks are ordered DID lists. Resolution: `at://{did}/at.inlay.component/{nsid}`. CSN's DID becomes its component namespace.

---

## How Inlay Works (From Source Code)

### Three Component Types

The `at.inlay.component` record's optional `body` field determines rendering:

1. **No body (primitives)** — Host renders natively (`org.atsui.Stack`, `org.atsui.Text`). CSN does not define primitives.

2. **`bodyTemplate`** — Stored element tree with `at.inlay.Binding` placeholders. Host resolves bindings against `{ props: {...}, record: {...} }`. **No server required** — the template lives in the ATProto record. Best for components that display record data directly.

3. **`bodyExternal`** — XRPC endpoint identified by a `did`. Host resolves DID → service URL, POSTs props to `/xrpc/{nsid}`, receives `{ node, cache }`. **Required for server-side logic** (aggregation, eligibility checks, personalization).

### The View System (RFC 025)

Components declare what data they display via `view`:

```json
{
  "view": {
    "prop": "uri",
    "accepts": [
      { "$type": "#viewRecord", "collection": "network.coopsource.governance.proposal" }
    ]
  }
}
```

For template components, the host auto-fetches the record and makes it available in `record.*` binding scope. When `viewRecord` includes `rkey` (e.g., `"self"`), components also accept bare DIDs — the host expands them to full AT URIs.

### Resolution & Caching

Resolution walks the import DID stack, constructing `at://{did}/at.inlay.component/{nsid}` for each DID — first match wins. All fetches fire concurrently.

The cache system uses Redis with a Jetstream-fed invalidator. Component responses declare `cacheLife()` and `cacheTag*()` policies. The host's `callComponentCached()` maps these to Next.js `cacheTag`/`cacheLife` directives. **Personalized components bypass the cache entirely** (important for governance components).

---

## Authentication Architecture

### How Inlay Authenticates Personalized Components (From Source Code)

This is the most important detail for CSN. From `app/(render)/render.tsx`, the resolver's `xrpc()` method:

```typescript
// Personalized with viewer: get service JWT, skip cache
if (params.personalized) {
  const jwt = await getServiceJwt(params.did, params.nsid);
  if (jwt) {
    return callComponent(params.did, params.nsid, input, jwt);
  }
  // No viewer — fall through to cached path
}
```

From `auth/session.ts`, `getServiceJwt()` calls the **viewer's PDS** via the standard ATProto endpoint:

```typescript
const response = await agent.com.atproto.server.getServiceAuth({
  aud: componentDid,   // CSN's component server DID
  lxm: procedure,      // e.g., "network.coopsource.VoteWidget"
});
return response.data.token;
```

The resulting JWT is:
- `iss`: viewer's DID (e.g., `did:plc:viewer123`)
- `aud`: component server's DID (CSN's DID)
- `lxm`: component NSID being invoked
- `exp`: short-lived (seconds)
- Signed by the viewer's PDS signing key (the key in the viewer's DID document under `#atproto`)

This JWT is sent as `Authorization: Bearer <token>` to the component XRPC endpoint.

### How This Maps to CSN's Existing Auth (Gap Analysis)

CSN's V9.2.5 shipped `ServiceAuthVerifier` (at `packages/federation/src/atproto/service-auth-verifier.ts`) verifies service-auth JWTs. However, there is a **critical mismatch** between the two auth models:

**CSN's current V9.2.5 verifier uses a trusted issuer allowlist:**

```typescript
constructor(
  private readonly didResolver: DidResolver,
  private readonly audienceDid: string,
  private readonly trustedIssuers: ReadonlySet<string>,  // ← Problem
)
```

The `trustedIssuers` set was designed for **service-to-service** auth — known external ATProto apps (like Roomy or Tangled) that call CSN's XRPC endpoints. Each trusted service DID is pre-registered.

**Inlay's personalized flow sends JWTs from arbitrary viewer DIDs.** The `iss` is the viewer's own DID — not a pre-known service. There could be thousands of distinct issuers (one per viewer). The trusted-issuer whitelist model doesn't fit.

### Recommended Auth Strategy for V9.3

CSN needs **two auth paths** for XRPC endpoints:

**Path 1: Service-auth (existing V9.2.5)** — External ATProto services call governance XRPC queries. Trusted issuer whitelist, `sub` claim identifies the user on whose behalf the service acts. Used for server-to-server integration (e.g., Roomy querying membership).

**Path 2: Viewer-auth for Inlay components** — Inlay host sends per-viewer JWTs where `iss` = viewer's DID. No trusted-issuer whitelist. Instead:
- Verify JWT signature against the `#atproto` key in the issuer's DID document (cryptographic proof that the viewer's PDS vouches for them)
- Verify `aud` matches CSN's component server DID
- Verify `lxm` matches the invoked component NSID
- Verify `exp` is not past (with clock skew tolerance)
- Extract `iss` as the viewer's DID — use for personalization

The dispatcher can distinguish the two paths by: (a) checking if the `lxm` claim matches an Inlay component NSID (e.g., `network.coopsource.VoteWidget` vs. `network.coopsource.governance.getVoteEligibility`), or (b) using separate route prefixes for Inlay XRPC vs. governance XRPC.

**Implementation sketch:**

```typescript
class InlayAuthVerifier {
  constructor(
    private readonly didResolver: DidResolver,
    private readonly audienceDid: string,  // CSN component server DID
  ) {}

  async verify(token: string, expectedLxm: string): Promise<{ viewerDid: string }> {
    // Same JWT parsing as ServiceAuthVerifier
    // Same aud/lxm/exp validation
    // Same DID document key resolution
    // Same ES256 signature verification
    // NO trustedIssuers check — any valid DID can be a viewer
    return { viewerDid: payload.iss };
  }
}
```

### Auth Requirements by Component

| Component | Auth Needed | Inlay `personalized` | Viewer Identity Used For |
|---|---|---|---|
| ProposalCard | None (public data) | `false` | N/A |
| MembershipStatus | Viewer-auth | `true` | Show viewer's own membership status |
| VoteWidget | Viewer-auth | `true` | Vote eligibility, existing vote, delegation weight |
| OfficerList | None (public for open coops) | `false` | N/A (closed coops need auth — see below) |
| GovernanceFeed | None (public for open coops) | `false` | N/A |

**Closed-governance cooperatives** are a complication. CSN's `assertGovernanceAccess()` returns 404 for non-members of closed coops. For Inlay, this means:
- Template components viewing closed-coop records will fail at the record-fetch step (the PDS won't serve them if they're Tier 2 private records, or the record simply won't exist on the public PDS)
- External components for closed coops must be `personalized: true` so the viewer's membership can be verified
- Consider a `CooperativeCard` component that doesn't need auth but gracefully handles closed coops (shows basic cooperative profile without governance details)

### Security Constraints to Preserve

From CLAUDE.md's security requirements, the following apply directly to Inlay components:

- **Never count votes without verifying active bilateral membership** — VoteWidget must check both `membership` and `memberApproval` records exist
- **Never expose pending/unmatched memberships** — MembershipStatus must never show pending members to non-member viewers
- **DIDs are authoritative identifiers** — Use the JWT's `iss` DID for all identity decisions, never handles
- **Never use Jetstream for security-critical data** — VoteWidget eligibility checks must use CSN's own database, not Jetstream
- **Per-DID rate limiting** — Inlay component endpoints need the same rate limiting as V9.2 governance XRPC (100/hour non-members, 200/hour members)

---

## Complete Component Inventory

ARCHITECTURE-V9.md §4 defines five governance components. The V9.2 XRPC handler inventory confirms the data backend endpoints they depend on.

### 1. ProposalCard — Template Component

**Purpose**: Compact proposal summary with status, deadline, and current tally.

**Inlay type**: `bodyTemplate` — displays data from a single `network.coopsource.governance.proposal` record.

**View declaration**:
```json
{
  "prop": "uri",
  "accepts": [{ "$type": "#viewRecord", "collection": "network.coopsource.governance.proposal" }]
}
```

**Approach**: Pure template. The Inlay host fetches the proposal record from the cooperative's PDS and resolves bindings against `record.title`, `record.status`, `record.createdAt`, etc. No server endpoint needed.

**Limitation**: Vote tally is not in the proposal record itself — it's an aggregate computed by CSN's database. A pure template can only show fields from the proposal record (title, status, body, voting type, quorum info, author DID, creation/resolution timestamps). To show live vote tallies, either:
- Embed a child `VoteTally` external component inside the template, OR
- Make ProposalCard itself an external component that calls `getProposal` (which already includes tally data in V9.2)

**Recommendation**: Start as a **template** for the v1 (simple card: title + status + deadline). Add a companion `VoteTally` external component later.

**Auth**: None — open-governance proposals are public. Closed-governance proposals won't be accessible at the PDS level, so the template will hit `MissingError` for them (handled gracefully by `at.inlay.Maybe`).

**Data backend**: PDS record fetch (automatic, done by Inlay host). For tally: `network.coopsource.governance.getProposal` (V9.2, shipped).

### 2. MembershipStatus — External Component (Personalized)

**Purpose**: Shows a viewer's own membership state in a cooperative.

**Inlay type**: `bodyExternal` with `personalized: true`.

**Why not template**: Membership is bilateral — status depends on matching `membership` + `memberApproval` records across two PDS repos, with role data only in `memberApproval`. A template can only view one record. The actual membership status is an aggregate computed by CSN's AppView.

**View declaration**:
```json
{
  "prop": "uri",
  "accepts": [
    { "$type": "#viewRecord", "collection": "network.coopsource.org.membership" },
    { "$type": "#viewRecord", "collection": "network.coopsource.org.memberApproval", "rkey": "self" }
  ]
}
```

Or more likely, accept a cooperative DID and show the viewer's status in that cooperative:
```json
{
  "prop": "did",
  "accepts": [{ "$type": "#viewPrimitive", "type": "string", "format": "did" }]
}
```

**Auth**: `personalized: true`. The Inlay host sends a viewer JWT. CSN verifies the JWT and uses the viewer's DID to look up their membership status.

**Data backend**: `network.coopsource.org.getMembership` (V9.2, shipped — requires `auth: 'viewer'`).

**Cache policy**: `cacheLife("minutes")`, `cacheTagLink(cooperativeUri, "network.coopsource.org.membership")`, `cacheTagLink(cooperativeUri, "network.coopsource.org.memberApproval")`. However, because `personalized: true`, the Inlay host skips caching entirely — CSN should still declare tags for any downstream cache layers.

### 3. VoteWidget — External Component (Personalized)

**Purpose**: Embedded voting interface with live tally, eligibility status, and existing vote display.

**Inlay type**: `bodyExternal` with `personalized: true`.

**View declaration**:
```json
{
  "prop": "uri",
  "accepts": [{ "$type": "#viewRecord", "collection": "network.coopsource.governance.proposal" }]
}
```

**Auth**: `personalized: true`. Critical for:
- Showing whether the viewer has already voted (V9.2: `getVoteEligibility` handler)
- Showing the viewer's delegation weight
- Respecting closed-governance visibility

**Data backends** (all shipped in V9.2):
- `network.coopsource.governance.getProposal` — proposal details + aggregate tally
- `network.coopsource.governance.getVoteEligibility` — eligible, weight, hasVoted, reason

**Interaction limitation (RFC 003)**: Cannot include vote-casting buttons. The widget displays status only. Actual voting requires a deep link to CSN's SvelteKit UI or the future Inlay mutations mechanism (RFC 008, stage-1). Recommend rendering an `org.atsui.Link` pointing to `https://coopsource.network/cooperatives/{slug}/proposals/{id}/vote`.

**Cache policy**: `cacheLife("seconds")` for active proposals (tallies change frequently), `cacheTagLink(proposalUri, "network.coopsource.governance.vote")`.

### 4. OfficerList — External Component

**Purpose**: Current officers for a cooperative.

**Inlay type**: `bodyExternal` (aggregates across multiple officer appointment records).

**View declaration**:
```json
{
  "prop": "did",
  "accepts": [{ "$type": "#viewPrimitive", "type": "string", "format": "did" }]
}
```

Accepts a cooperative DID, shows its current officers.

**Auth**: `personalized: false` for open-governance cooperatives. For closed cooperatives, the component should check governance visibility and return a minimal "private cooperative" tree instead of officer data. Since it's not personalized, closed-coop officer lists aren't accessible through Inlay — this is acceptable (members use the CSN UI directly).

**Data backend**: `network.coopsource.admin.getOfficers` (V9.2.3, shipped — `auth: 'optional'`).

**Cache policy**: `cacheLife("hours")`, `cacheTagRecord(cooperativeUri)`, `cacheTagLink(cooperativeUri, "network.coopsource.admin.officer")`.

### 5. GovernanceFeed — External Component

**Purpose**: Stream of recent governance activity for a cooperative.

**Inlay type**: `bodyExternal` (aggregates proposals, votes, officer changes across time).

**View declaration**:
```json
{
  "prop": "did",
  "accepts": [{ "$type": "#viewPrimitive", "type": "string", "format": "did" }]
}
```

**Auth**: `personalized: false` for open-governance.

**Data backend**: `network.coopsource.governance.listProposals` (V9.2, shipped). May also need a new aggregate endpoint or composition of existing endpoints within the component handler.

**Cache policy**: `cacheLife("minutes")`, `cacheTagLink(cooperativeUri, "network.coopsource.governance.proposal")`.

### Summary Table

| Component | Inlay Body Type | `personalized` | CSN XRPC Backends (shipped) | Server Endpoint Needed? |
|---|---|---|---|---|
| ProposalCard | `bodyTemplate` | N/A | PDS record fetch (auto) | No |
| MembershipStatus | `bodyExternal` | `true` | `getMembership` | Yes |
| VoteWidget | `bodyExternal` | `true` | `getProposal`, `getVoteEligibility` | Yes |
| OfficerList | `bodyExternal` | `false` | `getOfficers` | Yes |
| GovernanceFeed | `bodyExternal` | `false` | `listProposals` | Yes |

---

## Server-Side Requirements

### 1. Component XRPC Endpoints (Express POST handlers)

Add POST handlers to the existing XRPC dispatcher for the four external components. Each returns `{ node, cache }`:

```typescript
// apps/api/src/xrpc/inlay-handlers/vote-widget.ts
import { $, serializeTree } from "@inlay/core";

export async function handleVoteWidgetInlay(
  props: Record<string, unknown>,
  viewerDid: string | null,
  container: Container,
): Promise<{ node: unknown; cache: CachePolicy }> {
  const uri = props.uri as string;
  const proposalResult = await container.proposalService.getProposal(uri);
  // ... build element tree using Atsui primitives
  return { node: serializeTree(tree), cache: { life: "seconds", tags } };
}
```

**Important**: Inlay external component calls are POST (not GET), which differs from the existing governance XRPC handlers (GET queries). The dispatcher currently only handles GET. V9.3 needs to add POST routing for Inlay component NSIDs — or create a separate Express router for Inlay XRPC.

### 2. DID Document `#inlay` Service Entry

The Inlay host resolves external components by looking up `#inlay` in the component's DID document (from `data/xrpc.ts: resolveDidToService(did, "#inlay")`).

**Option A: `did:web` for the component server** — Serve `/.well-known/did.json` at `api.coopsource.network`:

```json
{
  "id": "did:web:api.coopsource.network",
  "service": [{
    "id": "#inlay",
    "type": "InlayComponentServer",
    "serviceEndpoint": "https://api.coopsource.network"
  }]
}
```

**Option B: Add `#inlay` to cooperative `did:plc` docs** — Each cooperative DID gets an `#inlay` service entry pointing to CSN's API. This requires PLC operations (same mechanism as V9.2.1's `#coopsource` entries).

**Recommendation**: Option A (`did:web`) for v1 — one DID for all CSN components, no PLC operations needed. Component records point all external bodies at this single `did:web`. Revisit per-cooperative DIDs if cooperatives need independent component customization.

### 3. `InlayAuthVerifier` (New — For Personalized Components)

Create a new verifier that validates Inlay viewer JWTs **without a trusted-issuer whitelist**:

```typescript
// packages/federation/src/atproto/inlay-auth-verifier.ts
export class InlayAuthVerifier {
  constructor(
    private readonly didResolver: DidResolver,
    private readonly audienceDid: string,  // CSN's did:web or did:plc
  ) {}

  async verify(token: string, expectedLxm: string): Promise<{ viewerDid: string }> {
    // 1. Parse JWT (same as ServiceAuthVerifier)
    // 2. Validate aud === this.audienceDid
    // 3. Validate lxm === expectedLxm
    // 4. Validate exp (with 30s clock skew)
    // 5. Resolve iss DID document → extract #atproto verification key
    // 6. Verify ES256 signature
    // 7. Return { viewerDid: payload.iss }
    // NO trustedIssuers check
  }
}
```

Wire into the Inlay XRPC route handler. For personalized components, the handler extracts the viewer DID and passes it to the component rendering function. For non-personalized components, no auth processing occurs.

### 4. Publish `at.inlay.component` Records

Write component records to an ATProto repo. For the CSN component server, this could be:
- A dedicated "CSN components" account on the PDS, OR
- Written to each cooperative's repo (more federated, but more management overhead)

**Recommendation**: Single publisher DID (the `did:web:api.coopsource.network` or a dedicated `did:plc`) that publishes all five components. Cooperatives can override specific components by stacking their own DID above CSN's in the import list.

### 5. `@inlay/core` and `@inlay/cache` Dependencies

Add to CSN's monorepo:

```bash
pnpm --filter @coopsource/api add @inlay/core @inlay/cache
```

Use `@inlay/core` for element tree construction in component handlers. Use `@inlay/cache` for declarative cache policy accumulation (uses `AsyncLocalStorage` — same pattern as CSN's existing Node.js infrastructure).

### 6. CORS (Already Shipped)

V9.2's dispatcher already sets `Access-Control-Allow-Origin: *` on `/xrpc/*`. For Inlay POST routes, ensure the same CORS headers apply.

---

## Implementation Path

### Phase 1: ProposalCard Template (No Server Changes)

1. Add `@inlay/core` to `packages/` as a new workspace.
2. Build a ProposalCard template using `$()` and `serializeTree()`.
3. Write the `at.inlay.component` record to CSN's PDS with `bodyTemplate`.
4. Test on inlay.at by navigating to a proposal AT URI.

### Phase 2: External Component Infrastructure

1. Create `did:web:api.coopsource.network` with `#inlay` service entry.
2. Build `InlayAuthVerifier` (fork of `ServiceAuthVerifier` without trusted issuers).
3. Add POST route handling to the XRPC dispatcher for Inlay NSIDs.
4. Implement the `@inlay/cache` dispatcher pattern with `AsyncLocalStorage`.

### Phase 3: OfficerList + GovernanceFeed (Non-Personalized)

1. Implement handlers that query existing services and return element trees.
2. Publish `at.inlay.component` records with `bodyExternal` + `personalized: false`.
3. Test on inlay.at.

### Phase 4: MembershipStatus + VoteWidget (Personalized)

1. Wire `InlayAuthVerifier` into Inlay POST routes.
2. Implement handlers that use the verified viewer DID to call `getMembership` / `getVoteEligibility`.
3. Publish with `personalized: true`.
4. Test with a logged-in Inlay session.

---

## Key Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Atsui primitive set insufficient for governance UI | Missing progress bars, status badges, data tables | Start with Text/Stack/Row/Caption/List. Propose Atsui extensions via Inlay community |
| No mutation/action model yet (RFC 008, stage-1) | Interactive voting impossible inside Inlay | Deep link to CSN SvelteKit UI. Revisit when Inlay actions mature |
| Inlay is experimental and may change | Component contracts could break | Thin wrappers; governance logic stays in CSN's AppView (V9 risk matrix) |
| Template components expose record schema | Lexicon changes break templates | Use external components for complex views. Version component records on schema changes |
| Viewer-auth JWTs from untrusted DIDs | Malicious JWTs attempt unauthorized access | Cryptographic verification against DID document. Rate limit per-DID. Never trust without signature check |
| Personalized components bypass Inlay cache | Higher load on CSN's API for VoteWidget/MembershipStatus | CSN's own response caching layer (short TTL, per-viewer). V9.2 rate limiting applies |
| Closed-governance cooperatives | Template components fail silently; external components need auth | Wrap in `at.inlay.Maybe` for graceful fallback. Personalized components check governance visibility |
