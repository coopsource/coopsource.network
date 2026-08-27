# Audit tranche 7 — cooperative identity on read (N-1)

- **Written:** 2026-08-27, before implementation
- **Backlog item:** [closeout §3 item 7](./2026-08-02-audit-tranche-1-closeout-and-handover.md)
- **Branch:** `feature/audit-tranche-7-coop-identity`
- **Baseline:** `f83b313`

Re-derived through production HTTP routes before any fix was designed. The
probe (`apps/api/tests/zz-coop-identity-probe.test.ts`) is deleted before merge;
its output is captured in the fix commit.

---

## 0. What the probe measured

Setup, then create a network, then save the co-op settings — all through real
routes, no hand-inserted rows:

```
setup coop did:                did:plc:jz4nd…
GET  /cooperative  (fresh)  -> did:plc:jz4nd…  "Test Cooperative"      correct
POST /networks {Beta Network} -> 201            did:plc:hiidc…
GET  /cooperative  (after)  -> did:plc:jz4nd…  "Test Cooperative"      still correct
PUT  /cooperative {displayName:"Alpha Coop", website:"https://alpha.example"}
     -> 200, body says       did:plc:hiidc…  "Beta Network"  website:null
     write landed on         did:plc:jz4nd…  "Alpha Coop"    website:https://alpha.example
GET  /cooperative  (after PUT) -> did:plc:hiidc…  "Beta Network"       WRONG, permanently
five consecutive reads      -> Beta, Beta, Beta, Beta, Beta
system_config.cooperative_did = "did:plc:jz4nd…"  (correct throughout, and ignored)
```

The `PUT` writes correctly — it is scoped to `req.actor.cooperativeDid` — and
then reads back through the unscoped query, so **its own response body describes
a different cooperative than the one it just wrote**. The update also moves the
edited row's heap tuple behind the other one, so from that point the unordered
sequential scan returns the wrong cooperative every time.

**The user-visible failure.** An admin opens their settings page. It prefills
from Beta Network — display name, description, website, and the
public-visibility checkboxes. They press Save. The write goes to *their* co-op,
so Beta's description and **its public-exposure flags** are copied onto it, and
the `website: null` echo means a second save blanks the website they just set.
28 `+page.server.ts` files call `api.getCooperative()` for co-op context and
inherit the wrong identity.

## 1. Root cause (confirmed)

`apps/api/src/services/entity-service.ts:46` selects `entity` joined to
`cooperative_profile` `WHERE type = 'cooperative' AND status = 'active'` and
takes the first row — **no actor predicate, no `ORDER BY`**. The route
(`apps/api/src/routes/org/cooperatives.ts:41`) passes no actor at all; its
handler signature is `(_req, res)`.

`POST /api/v1/networks` is enough to create a second qualifying row: a network
is a cooperative in the recursive model, so `network-service.ts` inserts an
`entity` of type `cooperative`, status `active`, with a profile.

## 2. Sibling sweep

Every other query with this shape was checked, since "guarded one path, missed
its sibling" is the trap that has cost this program the most:

| Site | Verdict |
|---|---|
| `xrpc/handlers/open-governance-gate.ts:63` | scoped by `entity.did` |
| `xrpc/handlers/inlay-membership-status.ts:39` | scoped by `entity.did` |
| `xrpc/handlers/inlay-governance-feed.ts:35` | scoped by `entity.did` |
| `xrpc/handlers/inlay-officer-list.ts:29` | scoped by `entity.did` |
| `services/entity-service.ts:141` (`getCooperativeByHandle`) | scoped by handle |
| `routes/explore.ts:126` | scoped by handle |
| `routes/explore.ts:30,230`, `services/search-service.ts:110` | list queries, not single-row |
| `services/membership-read-model.ts:526` | scoped by `membership.member_did` |

`entity-service.ts:46` is the only site with the defect.

## 3. Fix design

`getCooperative()` takes a required `cooperativeDid` and filters on it. Both
call sites pass `req.actor!.cooperativeDid` — the same value the `PUT` already
writes to, so the read and the write can no longer disagree. With a predicate on
the primary key exactly one row matches, so no `ORDER BY` is needed and adding
one would be decoration.

No web change: the 28 callers go through `GET /api/v1/cooperative`, which is now
scoped server-side.

### What this does not fix

`req.actor.cooperativeDid` is itself chosen by an unordered query —
`membership-read-model.ts:180-186` takes the caller's first active membership
with no `ORDER BY`. That is **M-01**, still open. So for a member of more than
one cooperative, *which* co-op the API treats as theirs remains arbitrary; what
this change guarantees is that the read and the write agree on it, which is the
harm the probe demonstrated. Fixing M-01 needs a decision about how a
multi-cooperative session selects its active tenant, which is a product
question, not a query fix.

## 4. Commit plan

1. Scope `getCooperative` to the caller's cooperative, with regression tests.
2. Docs: register amendment, handover.
