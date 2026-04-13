# Co-op Source Network — Inlay Governance Components

> For ATProto app developers embedding CSN governance widgets via [Inlay](https://inlay.at).

---

## Overview

Co-op Source Network publishes governance widgets as Inlay components. These components let any ATProto client display cooperative governance data — proposals, membership status, officer lists — without building custom governance logic.

**Component server DID**: Check `/.well-known/did.json` on your CSN instance for the `#inlay` service entry.

**Import stack**: Add CSN's DID to your Inlay import stack. Components resolve via `at://{csnDid}/at.inlay.component/{componentName}`.

---

## Components

### ProposalCard

Compact proposal summary showing title, status, voting type, and dates.

| Property | Value |
|---|---|
| Type | Template (`bodyTemplate`) |
| Personalized | No |
| Auth required | No |
| Input | Proposal AT-URI |

**View declaration**: Accepts `network.coopsource.governance.proposal` records.

**What it shows**:
- Proposal title
- Status (draft, voting, approved, rejected, archived)
- Voting type (binary, ranked, etc.)
- Creation date
- Resolution date (if resolved, wrapped in `at.inlay.Maybe`)

**Usage**: Embed anywhere a proposal URI is available. The Inlay host fetches the proposal record from the cooperative's PDS and renders the template.

**Limitations**: Vote tally is not shown — it's an AppView aggregate not stored in the PDS record. A companion VoteTally component is planned.

---

### MembershipStatus

Shows a viewer's own membership state in a cooperative.

| Property | Value |
|---|---|
| Type | External (`bodyExternal`) |
| Personalized | Yes |
| Auth required | Viewer JWT |
| Input | Cooperative DID |
| XRPC method | `network.coopsource.inlay.MembershipStatus` (POST) |

**How auth works**: The Inlay host obtains a viewer JWT via `com.atproto.server.getServiceAuth({ aud: csnDid, lxm: "network.coopsource.inlay.MembershipStatus" })` from the viewer's PDS. CSN verifies the JWT signature against the viewer's DID document — no pre-registration required.

**What it shows**:
- Cooperative name
- Membership status: "Active member" with roles, or "Not a member"
- If not authenticated: "Sign in to see your membership status"

**Request format** (POST body):
```json
{ "did": "did:plc:cooperative-did-here" }
```

**Response format** (`at.inlay.defs#response`):
```json
{
  "node": { /* org.atsui.* element tree */ },
  "cache": {
    "life": "minutes",
    "tags": [
      { "uri": "at://did:plc:coop/network.coopsource.org.membership" },
      { "uri": "at://did:plc:coop/network.coopsource.org.memberApproval" }
    ]
  }
}
```

---

### OfficerList

Shows current officers for a cooperative.

| Property | Value |
|---|---|
| Type | External (`bodyExternal`) |
| Personalized | No |
| Auth required | No |
| Input | Cooperative DID |
| XRPC method | `network.coopsource.inlay.OfficerList` (POST) |

**What it shows**:
- Cooperative name
- List of current officers: display name, title, appointment date, term end date
- Empty state: "No officers appointed"
- Closed-governance cooperatives: "This cooperative's governance is private"

**Request format** (POST body):
```json
{ "did": "did:plc:cooperative-did-here" }
```

**Cache**: `life: "hours"` — officer lists change infrequently.

---

### GovernanceFeed

Stream of recent governance activity for a cooperative.

| Property | Value |
|---|---|
| Type | External (`bodyExternal`) |
| Personalized | No |
| Auth required | No |
| Input | Cooperative DID |
| XRPC method | `network.coopsource.inlay.GovernanceFeed` (POST) |

**What it shows**:
- Cooperative name
- Up to 5 recent non-draft proposals: title, status ("Open for voting", "Voting closed", "Resolved"), creation date
- Empty state: "No governance activity yet"
- Closed-governance cooperatives: "This cooperative's governance is private"

**Request format** (POST body):
```json
{ "did": "did:plc:cooperative-did-here" }
```

**Cache**: `life: "minutes"` — proposal statuses change as votes come in.

---

### VoteWidget

Proposal details with live vote tally and viewer's eligibility status.

| Property | Value |
|---|---|
| Type | External (`bodyExternal`) |
| Personalized | Yes |
| Auth required | Viewer JWT |
| Input | Proposal AT-URI |
| XRPC method | `network.coopsource.inlay.VoteWidget` (POST) |

**How auth works**: Same as MembershipStatus — viewer JWT obtained via `com.atproto.server.getServiceAuth`.

**What it shows**:
- Proposal title and status
- Live vote tally (choices + counts)
- Viewer's eligibility: "You can vote" / "Already voted" / "Members only" / "Voting ended"
- Delegation weight (if > 1)
- Deep link to CSN's web UI for actual voting

**Display-only**: VoteWidget does not support casting votes through Inlay — voting requires visiting CSN's web UI via the provided deep link. This is by design: Inlay has no mutation model (RFC 008 stage-1).

**Request format** (POST body):
```json
{ "uri": "at://did:plc:coop/network.coopsource.governance.proposal/rkey" }
```

**Cache**: `life: "seconds"` — tallies change with each vote.

---

## Authentication

### Non-personalized components (ProposalCard, OfficerList, GovernanceFeed)

No authentication required. Public governance data is served to any caller.

### Personalized components (MembershipStatus, VoteWidget)

Require a viewer JWT obtained via `com.atproto.server.getServiceAuth`:

```typescript
const response = await agent.com.atproto.server.getServiceAuth({
  aud: csnComponentDid,   // CSN's DID (from #inlay service entry)
  lxm: procedureNsid,     // e.g., "network.coopsource.inlay.MembershipStatus"
});
const jwt = response.data.token;
```

Send as `Authorization: Bearer <jwt>` with the POST request.

**Trust model**: CSN accepts JWTs from any DID — there is no issuer whitelist. Trust is cryptographic: the JWT signature is verified against the `#atproto` key in the issuer's DID document.

---

## DID Document Requirements

CSN's DID document must include an `#inlay` service entry:

```json
{
  "service": [
    {
      "id": "#inlay",
      "type": "InlayComponentServer",
      "serviceEndpoint": "https://your-csn-instance.example.com"
    }
  ]
}
```

The Inlay host resolves external component DIDs by looking up `#inlay` in the DID document to find the service URL for XRPC calls.

---

## Rate Limits

| Endpoint type | Limit |
|---|---|
| Non-personalized components | 60 requests / 15 minutes per DID |
| Personalized components | 200 requests / 15 minutes per viewer DID |

---

## CORS

All `/xrpc/*` endpoints return `Access-Control-Allow-Origin: *` for cross-origin Inlay widget embedding. Allowed methods: `GET, POST, OPTIONS`. Allowed headers: `Content-Type, Authorization`.
