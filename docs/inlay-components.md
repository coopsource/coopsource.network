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

## Planned Components

These are planned for follow-up releases:

| Component | Type | Personalized | Description |
|---|---|---|---|
| OfficerList | External | No | Current officers for a cooperative |
| GovernanceFeed | External | No | Stream of recent governance activity |
| VoteWidget | External | Yes | Proposal tally + vote eligibility (display-only — voting requires deep link to CSN UI) |

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
