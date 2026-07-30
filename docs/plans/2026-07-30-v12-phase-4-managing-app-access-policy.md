# V12 Phase 4 Managing-App Access Policy

- **Date:** 2026-07-30
- **Status:** Implemented behind a disabled default; production activation
  requires V12-S10 signoff
- **Upstream baseline:** Proposal 0016 implementation PR #5187 at
  `3f6c96d5d2d25438bd40fa89d6ecc37865f8e354`

## Scope

This checkpoint implements the smallest coherent managing-app slice from the
July 29 gap analysis:

- pin `com.atproto.simplespace.checkUserAccess` in the executable draft
  baseline;
- expose a generic asynchronous `ManagingAppAccessPolicyPort`;
- provide a CSN adapter backed by strict `GroupDirectoryPort` resolution;
- serve the draft query only when explicitly enabled; and
- authenticate and bind the calling authority before evaluating policy.

It does not choose a production space host, adopt Roomy/Rego, change record
placement, migrate storage, or enable the route by default.

## Pinned Contract

PR #5187 defines `checkUserAccess` as a query served by the managing app and
called by the space authority while minting a credential for a space whose
policy is `managing-app`.

The request has:

- required `space` AT URI;
- required requesting-user DID in `user`; and
- optional attested OAuth `clientId`.

The only response field is `{ "authorized": boolean }`.

The authority signs a service-auth JWT with:

- `iss` equal to the authority DID;
- `aud` equal to the space's exact `managingApp` service identifier, including
  its fragment when present; and
- `lxm` equal to `com.atproto.simplespace.checkUserAccess`.

The upstream authority applies this user decision and then separately applies
the space's `appAccess` open/allow-list policy. The first CSN policy therefore
accepts and preserves `clientId` at the port but does not use it to duplicate
the authority's application-perimeter decision.

## CSN Policy

`CsnGroupDirectoryManagingAppAccessPolicy` authorizes a user only when:

1. the requested space is a recognized CSN members, role, or member-class
   space;
2. strict group-directory resolution succeeds;
3. the result is complete and fresh; and
4. the user is in the resolved membership.

Unsupported spaces, nonmembers, stale or partial resolution, failed results,
and thrown directory errors all deny access. Internal denial reasons are
available to application code for diagnostics but are not returned over the
draft XRPC response.

This is application/group policy in Layer 2. It does not make membership a
Layer 1 permissioned-data protocol invariant.

## Trust Boundary

The shared service-auth verifier checks signature, trusted issuer, audience,
method binding, expiration, and future-issued tokens. The handler additionally
requires the verified JWT issuer to equal the authority DID encoded in the
requested space. A trusted authority cannot query policy for another
authority's space, and an asserted `sub` cannot replace the verified issuer.

The route is not registered unless all of the following are configured:

```text
SPACE_MANAGING_APP_ACCESS_MODE=group-directory
SERVICE_AUTH_AUDIENCE_DID=<exact managingApp service identifier>
SERVICE_AUTH_TRUSTED_ISSUERS=<comma-separated cooperative authority DIDs>
```

The audience setting is shared with the existing service-auth/Inlay verifier.
An operator must verify that the selected identifier is correct for every
enabled integration; this checkpoint does not split those verifier
configurations or publish a DID service entry.

## Activation Gate

V12-S10 requires review of:

- the exact managing-app service identifier and endpoint;
- the set and lifecycle of trusted cooperative authority DIDs;
- authority key custody, recovery, and incident response;
- availability behavior and monitoring for a fail-closed callback;
- membership correction, suspension, appeal, and legal-protection handling;
  and
- alignment with the production host selected under V12-S02.

Until then, the route remains absent and existing behavior is unchanged.

## Verification

Focused tests cover strict membership authorization, role spaces, nonmembers,
stale/partial/failed/throwing directory outcomes, unsupported spaces, default
route absence, required service authentication, issuer-to-space binding,
optional `clientId`, denial response minimization, and malformed inputs.

Final verification passed:

- `pnpm build`: 10/10 tasks;
- `pnpm test`: 17/17 tasks;
- API: 103 files / 995 tests;
- spaces-consumer: 20 files / 115 tests;
- arbiter-client: 7 files / 41 tests;
- lexicons: 8 files / 55 tests; and
- Docker federation: 17 files / 122 tests.
