# Audit tranche 6 — outbound fetch containment (S-08)

- **Written:** 2026-08-27, before implementation
- **Backlog item:** [closeout §3 item 6](./2026-08-02-audit-tranche-1-closeout-and-handover.md)
- **Branch:** `feature/audit-tranche-6-ssrf`
- **Baseline:** `da17a91`

Re-derived with an executable probe against the real federation route before
any fix was designed. The probe (`apps/api/tests/zz-ssrf-probe.test.ts`) is
deleted before merge; its output is captured in the fix commits.

---

## 0. It is reachable unauthenticated, and that is measured

An unauthenticated `POST /api/v1/federation/agreement/sign-request` carrying a
`keyid` of `did:web:127.0.0.1%3A<port>` made the API issue
`GET /.well-known/did.json` **to that port**, recorded by a listener the test
started. The request then failed signature verification (401) — but the fetch
had already happened, which is the whole of the vulnerability.

`verifyRequest` (`packages/federation/src/http/signing.ts:136-182`) does four
checks before it resolves the DID at `:182`: the signature-input parses, the
algorithm is `ecdsa-p256-sha256`, `created` is within skew, and — when a body is
present — the component list contains `content-digest` and the digest matches.
**Every one of those is computable by the attacker from their own request.** The
A-07 request-coverage work (tranche 3) narrowed the shape of a usable request
but does not gate the fetch: the digest is a hash of the attacker's own body,
not a secret. A first probe attempt failed to reach the resolver precisely
because it omitted the digest; adding it reproduced immediately.

## 1. What the probe measured

### `didWebToUrl` downgrades to plaintext for any IPv4 literal

`isInsecureHost` (`packages/common/src/did-web.ts:21-30`) returns true for
`localhost`, `0.0.0.0`, `::1`, and **any dotted quad**:

```
did:web:169.254.169.254        -> http://169.254.169.254/.well-known/did.json
did:web:127.0.0.1%3A6379       -> http://127.0.0.1:6379/.well-known/did.json
did:web:10.0.0.1               -> http://10.0.0.1/.well-known/did.json
did:web:192.168.1.1%3A8080     -> http://192.168.1.1:8080/.well-known/did.json
did:web:metadata.google.internal -> https://metadata.google.internal/.well-known/did.json
```

So the cloud metadata endpoint is fetched over plaintext, and `%3A` ports turn
the DID into an arbitrary internal port selector.

### `validateWebhookUrl` misses most of what it means to block

Measured against `apps/api/src/utils/url-validation.ts`:

| URL | Result |
|---|---|
| `https://[::1]/x` | **ALLOWED** |
| `https://[fd00::1]/x` | **ALLOWED** |
| `https://[fe80::1]/x` | **ALLOWED** |
| `https://[::ffff:127.0.0.1]/x` | **ALLOWED** |
| `https://127.0.0.2/x` | **ALLOWED** |
| `https://127.5.5.5/x` | **ALLOWED** |
| `https://0.0.0.0/x` | **ALLOWED** |
| `https://169.254.1.1/x` | **ALLOWED** |
| `https://100.64.0.1/x` | **ALLOWED** |
| `https://2130706433/x` | blocked |
| `https://127.1/x` | blocked |

Two mechanisms explain the whole table:

- **`URL.hostname` keeps the brackets on an IPv6 literal.**
  `new URL('https://[::1]/').hostname` is `"[::1]"`, so the `hostname === '::1'`
  comparison can never match. That check is dead code, and every IPv6 form is
  therefore unfiltered.
- **`URL` normalizes IPv4 shorthand.** `2130706433` and `127.1` both parse to
  `127.0.0.1`, which is why those two are caught — by accident, via the one
  exact-string loopback comparison. `127.0.0.2` is not, because only the single
  address `127.0.0.1` is listed rather than the `127.0.0.0/8` range. The same
  applies to link-local: only `169.254.169.254` is named, not the range.

### Structural gaps in both paths

No DNS resolution check (a public hostname pointing at a private address
passes), no redirect control (`fetch` follows redirects by default, so a
validated URL can hand off to any address), no timeout, no response size limit.
`validateWebhookUrl` is not applied to DID resolution at all.

## 2. Fix design

**Package boundary first.** `@coopsource/common` is imported by `apps/web` and
is currently Node-free — a DNS-dependent guard cannot live there.
`@coopsource/federation` is server-only and already imports Node built-ins, and
`apps/api` depends on it. The guard goes in
`packages/federation/src/http/url-safety.ts`; `apps/api/src/utils/url-validation.ts`
delegates to it so its two existing call sites keep working.

**1. `did-web.ts` stops downgrading.** The http exception narrows from "any
dotted quad" to loopback only (`localhost`, `127.0.0.0/8`, `::1`), which is what
local development actually needs (`INSTANCE_URL=http://localhost:3001` →
`did:web:localhost%3A3001`). Everything else resolves over https. This removes
the plaintext fetch; it does not by itself stop the request, which is layer 2's
job.

**2. A real address classifier.** `isPrivateAddress()` covering, for IPv4:
`0.0.0.0/8`, `10/8`, `100.64/10`, `127/8`, `169.254/16`, `172.16/12`,
`192.168/16`, `192.0.0/24`, `198.18/15`, and multicast/reserved above `224`;
for IPv6: `::`, `::1`, `fc00::/7`, `fe80::/10`, and IPv4-mapped forms unwrapped
and re-checked as IPv4. Brackets are stripped before classification.

**3. A guarded fetch for DID resolution**, applied in `DidWebResolver`:
scheme allowlist, host classification, DNS lookup with **every** returned
address checked, `redirect: 'manual'` so a 3xx is an error rather than a
follow, a request timeout, and a response size cap.

### What this does not close

The DNS check is a lookup-then-fetch, so a name that answers differently on the
second lookup — a true DNS-rebinding race — is still possible. Closing that
needs the connection pinned to the address that was checked, which means a
custom agent/dispatcher rather than plain `fetch`. The check stops the
straightforward "public hostname whose A record is 10.0.0.1" case, and the
residual is recorded rather than claimed as fixed.

## 3. Commit plan

1. `url-safety.ts` in `packages/federation` — classifier plus guarded fetch,
   with unit tests over the address table above.
2. `did-web.ts` — narrow the http downgrade to loopback.
3. `DidWebResolver` — use the guarded fetch; end-to-end test that the
   unauthenticated federation request no longer reaches a chosen port.
4. `apps/api/src/utils/url-validation.ts` — delegate, so the webhook and script
   paths inherit the fixes.
5. Docs: register amendment, agent-learnings, handover.
