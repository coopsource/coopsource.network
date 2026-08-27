# Audit tranche 5 — AppView delivery integrity (C-05 + O-12)

- **Written:** 2026-08-27, before implementation
- **Backlog item:** [closeout §3 item 5](./2026-08-02-audit-tranche-1-closeout-and-handover.md)
- **Branch:** `feature/audit-tranche-5-appview-delivery`
- **Baseline:** `9a12157`

Re-derived with an executable probe against the real pipeline and the real
local loop before any fix was designed. The probe
(`apps/api/tests/zz-appview-probe.test.ts`) is deleted before merge; its output
is captured in the fix commits.

---

## 0. What the probe measured

Failure injected by throwing from a Kysely plugin's **`transformQuery`**, which
runs at compile time before the statement is sent. (A first attempt threw from
`transformResult` instead and measured nothing — that hook runs *after* the row
has already landed, so every "failed" write had in fact succeeded.)

| Probe | Result |
|---|---|
| `pds_record` write fails | `processFirehoseEvent` returns normally. **Zero** `pds_record` rows, **zero** dead-letter rows. The post-storage hook **still ran**, building a materialized view from a record that was never stored. |
| A post-storage hook fails *and* the dead-letter write fails | `processFirehoseEvent` returns normally. Zero dead-letter rows. **No forensic trace of any kind.** |
| Local loop, two events whose storage fails | Cursor advanced to **102**, the second event's seq. Zero `pds_record` rows. Both events are permanently skipped — on restart the loop resumes past them. |
| O-12 retry | `POST /api/v1/admin/hooks/dead-letter/:id/retry` → **404**. `retry_count` is `0` and has no writer anywhere in the tree. |

## 1. Root causes (confirmed, not inferred)

1. **`processFirehoseEvent` is total.** It converts every failure into a normal
   return (`pipeline.ts:87-100`, `:135-139`, `:149-162`, and the two swallowing
   `.catch()` calls on `recordDeadLetter` at `:97` and `:159`). Both callers
   treat "returned" as "processed", so no failure can reach the delivery
   mechanism.
2. **Tap acks because we swallow.** `SimpleIndexer.onEvent` awaits the record
   handler and then calls `opts.ack()`; `TapChannel` skips the ack when the
   handler throws, with the comment *"Don't ack on error - let Tap retry"*
   (`@atproto/tap@0.2.11`, `dist/channel.js:139-144`, `dist/simple-indexer.js`).
   The upstream library already supports the behaviour we want — the
   `try/catch` at `loop.ts:121-136` is what discards it. It is also dead code
   for record events, since `processFirehoseEvent` cannot throw.
3. **The local loop advances unconditionally.** `loop.ts:193-200` writes
   `pds_firehose_cursor` after `processFirehoseEvent` returns, and the catch at
   `:207` continues to the next event, so the next success advances past the
   failure.
4. **A failed `pds_record` write is not even dead-lettered** — it is logged and
   forgotten, and post-storage hooks run anyway. The stale rationale in the
   comment at `:137-138` ("the old switch statement didn't write to pds_record
   at all in Tap mode") predates `pds_record` being the source of truth.

## 2. Fix design

**Principle: a failure we can record is recoverable and we continue; a failure
we cannot record must be redelivered.**

- **Storage failure** → try to dead-letter the event with its full payload
  (phase `'storage'`). If that write succeeds, skip post-storage hooks and
  return: the event is preserved and replayable through the retry endpoint. If
  the dead-letter write *also* fails, **throw**.
- **Hook failure whose dead-letter write fails** → **throw**, same reasoning.
  Replaces both swallowing `.catch()` calls.
- **Tap loop** → count the error, log it, and **rethrow**, so Tap does not ack
  and redelivers.
- **Local loop** → do not advance the cursor when processing throws; rethrow to
  the outer backoff loop so it re-subscribes from the last good cursor.
- **O-12** → `retryDeadLetter()` rebuilds the event from `event_data`, re-runs
  it through the pipeline, increments `retry_count`, and marks the entry
  resolved on success. Exposed as
  `POST /api/v1/admin/hooks/dead-letter/:id/retry`.

### Why the dead-letter write is the liveness probe

The obvious fix — throw on every storage failure — is wrong, and the probe
shows why the distinction matters. A record whose content can never be stored
(a literal NUL byte is enough to make a `text` insert fail permanently) would
stall the entire AppView firehose forever under unbounded fail-closed retry,
turning a data-loss bug into an instance-wide availability bug that one crafted
record can trigger.

Attempting the dead-letter write separates the two cases without any retry
counter or extra state: if the database is healthy enough to record the
failure, the failure is specific to this record and the stream can safely move
on with the payload preserved. If the database is down, the dead-letter write
fails too, and throwing is then exactly right.

## 3. Commit plan

1. Pipeline: dead-letter storage failures, stop running post-storage hooks after
   one, and stop swallowing dead-letter write failures.
2. Loop: Tap rethrows so it does not ack; local does not advance its cursor past
   a failure.
3. O-12: `retryDeadLetter()` plus the admin retry route.
4. Docs: register amendment, agent-learnings, handover.
