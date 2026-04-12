# V9.2.1 Design: PLC Service Entry for Cooperatives

> **Date**: April 12, 2026
> **Branch**: `feature/v9.2.1-plc-service-entry`
> **Prerequisite**: V9.2 (governance AppView API) — shipped
> **Architecture reference**: ARCHITECTURE-V9.md §2 (deferred items)

---

## Problem

External ATProto clients have no way to discover that a cooperative uses CSN for governance. When a client resolves a cooperative's DID document, it finds `#atproto_pds` (the PDS service) but nothing pointing to CSN. V9.2 shipped four XRPC query endpoints, but no client can discover them programmatically from a cooperative's DID.

## Solution

Add a `#coopsource` service entry to every cooperative's PLC DID document during provisioning. After provisioning, a resolved DID document will contain:

```json
{
  "id": "#coopsource",
  "type": "CoopSourceNetwork",
  "serviceEndpoint": "https://coopsource.network"
}
```

External clients resolve the DID, find `#coopsource`, read the `serviceEndpoint`, and call XRPC methods at `{serviceEndpoint}/xrpc/{methodId}`.

## Approach: PDS Identity Email-Token Flow

CSN does not hold the PLC rotation key for cooperatives (deferred in V9.1 — PDS 0.4 gates prevent CSN-owned key registration). The PDS holds the rotation key, so PLC updates must go through the PDS's identity endpoints:

1. `com.atproto.identity.requestPlcOperationSignature` — PDS emails a confirmation token to the cooperative's account email
2. Extract the token from the email
3. `com.atproto.identity.signPlcOperation` — pass the token and desired services map; PDS constructs the full PLC operation from the account's current state plus the caller-provided fields, signs with its rotation key, returns the signed operation (does NOT submit)
4. `com.atproto.identity.submitPlcOperation` — submit the signed operation to PLC

**Defensive services map**: Always pass both `atproto_pds` (copied from the current DID document via `getRecommendedDidCredentials` or `PlcClient.resolve()`) and the new `coopsource` entry in the `signPlcOperation` call. This protects against the PDS replacing the entire services map rather than merging. Even if the PDS does merge, including both entries is harmless and eliminates the risk of accidentally removing `#atproto_pds`.

In dev/test, Mailpit intercepts the email. A `MailpitClient` utility extracts the token from the captured email via Mailpit's REST API.

## PLC Service Entry Specification

| Field | Value |
|-------|-------|
| `id` | `#coopsource` |
| `type` | `CoopSourceNetwork` |
| `serviceEndpoint` | Configurable — `https://coopsource.network` in production, `http://localhost:3001` in dev |

The `serviceEndpoint` is passed as a new parameter to `provisionCooperative()`.

## Infrastructure Changes

### docker-compose.yml

Add SMTP configuration to the PDS container so `requestPlcOperationSignature` can send email:

```yaml
pds:
  environment:
    # ... existing vars ...
    PDS_EMAIL_SMTP_URL: smtp://mailpit:1025
    PDS_EMAIL_FROM_ADDRESS: noreply@coopsource.local
  depends_on:
    plc:
      condition: service_healthy
    mailpit:
      condition: service_started
```

### global-setup.ts

Add `mailpit` to the containers started for federation tests:

```typescript
execSync(
  `docker compose -f "${COMPOSE_FILE}" up -d plc pds mailpit`,
  { stdio: 'pipe' },
);
```

## Code Changes

### New: `packages/federation/src/email/mailpit-client.ts`

Mailpit REST API client for dev/test email token extraction.

```typescript
export class MailpitClient {
  constructor(private baseUrl: string) {} // e.g. http://localhost:8025

  /**
   * Delete all messages in the Mailpit inbox. Call before each test
   * to prevent stale emails from interfering with token extraction.
   * Uses DELETE /api/v1/messages.
   */
  async clearInbox(): Promise<void>

  /**
   * Poll for an email matching the given recipient and optional
   * subject/body filter. Returns the raw message body.
   * Uses GET /api/v1/search with query parameter.
   * Polls every 500ms up to timeoutMs (default 15000ms).
   * Filters by recipient AND timestamp (only emails received after
   * the call was made) to avoid picking up stale messages.
   */
  async waitForEmail(to: string, opts?: {
    timeoutMs?: number;
    afterTimestamp?: Date;
  }): Promise<string>

  /**
   * Extract the PLC operation confirmation token from an email body.
   * The PDS sends a token — this parses it from the email content.
   */
  extractPlcToken(emailBody: string): string
}
```

The token extraction logic depends on the email format `@atproto/pds` sends for `requestPlcOperationSignature`. This will be determined during implementation by inspecting the actual email captured in Mailpit.

### Modified: `packages/federation/src/local/cooperative-provisioning.ts`

Extend `ProvisionCooperativeOptions` with:

```typescript
/** CSN service endpoint URL for the #coopsource PLC entry. */
serviceEndpoint?: string;
/** Mailpit base URL for email token extraction (dev/test only). */
mailpitUrl?: string;
```

After the existing V9.1 steps (createAccount → createAppPassword → persist credentials), add:

```
Step 5: Add #coopsource service entry to PLC
  - If serviceEndpoint is provided:
    a. Fetch current PDS endpoint via getRecommendedDidCredentials (or
       PlcClient.resolve) to build the defensive services map
    b. Call requestPlcOperationSignature via the AtpAgent from createAccount
       (agent has session refresh, so the accessJwt expiry is handled)
    c. Extract token via MailpitClient (requires mailpitUrl)
    d. Call signPlcOperation with token + full services map
       (both atproto_pds and coopsource)
    e. Call submitPlcOperation with the returned signed operation
    f. Verify the DID document contains #coopsource (non-fatal on
       failure — the operation was submitted; retry verification if needed)
```

The step is gated on `serviceEndpoint` being provided — omitting it preserves the V9.1 behavior exactly, so existing tests and provisioning flows are unaffected. When `serviceEndpoint` is provided, `mailpitUrl` is required (enforced at the top of the function) — there is no production email path yet, only the Mailpit-based dev/test path. A production email automation strategy will be designed when deployment is closer.

### Modified: `infrastructure/docker-compose.yml`

Add PDS SMTP env vars and Mailpit dependency (see Infrastructure Changes above).

### Modified: `packages/federation/tests/global-setup.ts`

Start Mailpit alongside PDS + PLC in the auto-start path.

## Testing

### Integration test: PLC service entry after provisioning

Extend or add a sibling to `coop-write-auth-mode.test.ts`:

1. Clear Mailpit inbox (`DELETE /api/v1/messages`) in `beforeAll`
2. Provision a cooperative with `serviceEndpoint: 'http://localhost:3001'` and `mailpitUrl: 'http://localhost:8025'`
3. Resolve the cooperative's DID via PLC (`PlcClient.resolve(did)`)
4. Assert `services` contains `#atproto_pds` (PDS-created, preserved — confirms defensive map worked)
5. Assert `services` contains `#coopsource` with:
   - `type: 'CoopSourceNetwork'`
   - `endpoint: 'http://localhost:3001'`

Runs under `make test:pds` alongside the existing V9.1 validation gate.

### Cleanup

Fix the stale comment in `coop-write-auth-mode.test.ts` lines 10-14 which describes `provisionCooperative` as adding a `#coopsource` service entry — that was aspirational from the V9.1 design, not the shipped behavior. Update to reflect V9.1 reality (no service entry) and note that V9.2.1 adds it when `serviceEndpoint` is provided.

## Prerequisite Investigation

Before writing implementation code, run this spike against the dev PDS:

1. **PDS dev mode email behavior**: Call `requestPlcOperationSignature` against the current docker-compose PDS (no SMTP config, `PDS_DEV_MODE=true`). Does it fail, skip email, or send to a configured SMTP? The answer determines whether the SMTP/Mailpit wiring is a prerequisite or unnecessary in dev mode.

2. **If SMTP is needed**: Add the PDS SMTP config, call the endpoint again, inspect the Mailpit email, extract the token format. Then call `signPlcOperation` → `submitPlcOperation` and verify the DID document. This answers the remaining questions in one pass.

## Open Question (Resolve During Implementation)

1. **Email format**: The token extraction regex in `MailpitClient.extractPlcToken()` depends on how `@atproto/pds` formats the confirmation email. Determine by inspecting the first captured email in Mailpit during the prerequisite spike.

## Resolved Design Decisions

- **signPlcOperation services map**: Always pass the full services map (both `atproto_pds` and `coopsource`), fetched from the current DID document state. This is defensive — works regardless of whether the PDS merges or replaces.
- **submitPlcOperation**: `signPlcOperation` returns but does not submit the signed operation. An explicit `submitPlcOperation` call is required.
- **Auth session management**: Use the `AtpAgent` instance from `createAccount` (not raw fetch with `accessJwt`) for the identity endpoint calls. The agent handles token refresh automatically.

## Verification

After implementation:

1. `pnpm test` — all 761+ tests pass
2. `make test:pds` — federation tests pass, including the new PLC service entry assertion
3. Manual verification (optional): provision a cooperative, then `curl http://localhost:2582/{did}` and confirm `#coopsource` appears in the DID document

## Files Summary

| File | Action |
|------|--------|
| `packages/federation/src/email/mailpit-client.ts` | New |
| `packages/federation/src/email/index.ts` | Modify (barrel export) |
| `packages/federation/src/local/cooperative-provisioning.ts` | Modify |
| `infrastructure/docker-compose.yml` | Modify |
| `packages/federation/tests/global-setup.ts` | Modify |
| `packages/federation/tests/plc-service-entry.test.ts` (or extend existing) | New/Modify |
| `packages/federation/tests/coop-write-auth-mode.test.ts` | Modify (fix stale comment) |
