# V12 Phase 4 Background Sync Credential Posture

**Date:** 2026-07-07
**Status:** Phase 4 decision record. This does not exercise a live
space-enabled PDS or HappyView target.

## Decision

CSN background sync uses a **cooperative-designated managing session pool**.
The AppView may renew a full-space `read` credential only through an OAuth
session for a cooperative-designated operator, admin, or future managing-app
principal that is still authorized for the target space.

If no eligible managing session is available, sync fails closed and reports the
space as needing renewed authorization. CSN must not silently borrow an
arbitrary active member session, downgrade to `read_self`, or keep projecting
from stale cached credentials after expiry.

## Rationale

- Proposal 0016's draft shape allows an app serving several users to obtain a
  space credential using a user session, but always-on AppView projection needs
  an explicit operational owner.
- Arbitrary active-member pooling makes background access surprising: any
  member's OAuth session could become the renewal path for whole-space sync.
- A cooperative-designated managing pool preserves the three failure modes:
  scope/session missing, principal not authorized for the space, and client not
  authorized by the space authority.
- `KyselySpaceCredentialStore` can bridge short process restarts, but its
  bearer tokens remain short-lived and are not a durable authorization source.

## Implementation Consequences

- `SpaceCredentialManager` remains refresh-per-batch capable and issuer
  agnostic.
- `KyselySpaceCredentialStore` remains a cache, not an authority. Expired
  credentials are treated as missing.
- The API-side session-selection seam now exists as
  `OAuthManagingSpaceCredentialSessionSelector`. It chooses an injected
  designated candidate for a `SpaceRef`, checks eligibility through
  `MembershipReadModel.hasPermissionResult()`, restores that OAuth session, and
  returns a session-bound fetch constrained to the restored PDS audience.
  Restored sessions with unusable token/audience metadata are skipped in favor
  of later eligible designated candidates; a restored DID mismatch still fails
  closed.
- The live Phase 4 PDS/HappyView exercise still needs to connect that selected
  session to a real draft delegation-token client.
- Eligibility must be checked through the membership read seam and the group
  directory boundary before using a session.
- Member-list changes must invalidate the affected space credential cache entry
  before the next sync batch.

## Deferred Questions

- Whether upstream standardizes a service or app principal that can obtain
  full-space credentials without a user OAuth session.
- Whether CSN should expose an operator UI for selecting and rotating managing
  sessions per cooperative space.
- How to surface "authorization required" sync health in the CoopView once
  Phase 5 extracts the view layer.
