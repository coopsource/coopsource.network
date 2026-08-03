# Debugging Playbook — locating root cause fast

Companion to [agent-learnings.md](./agent-learnings.md) (what bites) and
[agent-testing-practices.md](./agent-testing-practices.md) (how to write tests
that catch it). This file is about **method**: how to find where a problem
actually lives, drawn from cases in this repo where the obvious answer was
wrong.

---

## 1. The single highest-value habit: execute it

Every serious defect found by self-review in the 2026-08-02 remediation was
found by **running the thing**, and none by re-reading the diff. The suite was
green through all of them.

- Suspect a privilege bypass? Drive the real route as the lower-privileged
  actor and print the status.
- Suspect data leaks to a public repo? Query `pds_record` after the real route
  runs, and print what is in it.
- Suspect a replay problem? Replay the record and count rows.

Write a throwaway `apps/api/tests/zz-*.test.ts`, `console.log` the interesting
values, run it with `--disable-console-intercept`, read the numbers, delete it.
This takes about five minutes and is worth more than an hour of reasoning about
the code.

```bash
pnpm vitest run tests/zz-probe.test.ts --disable-console-intercept
```

**Delete probes before finishing.** They are diagnostic instruments, not tests —
a probe that ends in `expect(true).toBe(true)` is worse than no test because it
looks like coverage.

## 2. Do not trust a green run — trust a loop

Three consecutive green runs proved nothing here. Twice. An intermittent
survived a three-run sample and reappeared later, and the actual cause was only
found by looping until failure and capturing the log at the moment it broke:

```bash
for i in 1 2 3 4 5 6; do
  pnpm vitest run > /tmp/full-$i.log 2>&1
  if grep -qE "^ *× " /tmp/full-$i.log; then
    echo "FAILED on run $i"; grep -A 12 "Failed Tests" /tmp/full-$i.log; break
  fi
  echo "run $i: clean"
done
```

When it fails, you have the *whole* log, not a summary — which is what let the
30-second-timeout diagnosis land.

## 3. Read the failure signature before reading the code

Certain failures name their own cause:

| Signature | Almost always means |
|---|---|
| Failure on `tax_form_1099_patr` | first table in `truncateAllTables` — the database vanished; harness collision, not product |
| A whole file times out at exactly 30s | something took a heavyweight lock (`CREATE`/`DROP DATABASE`), or a connection pool is exhausted |
| `database "coopsource_test_<n>" does not exist` | per-run name derived in a forked worker instead of inherited from setup |
| Mass failures across unrelated files | infrastructure, not logic — check the harness first |
| A test fails only in the full suite | shared module state (`isolate: false`) or leaked rows from a table missing in `truncateAllTables` |

## 4. When a test fails in an innocent file, ask what else was running

The most confusing bug in this program presented as `posts.test.ts` timing out.
`posts.test.ts` was blameless — a *different* test file was running
`CREATE DATABASE` concurrently and taking locks that stalled it.

**Heuristic:** if the failing test has no plausible relationship to the change
you made, stop looking at it and ask what your change made run *alongside* it.

## 5. Isolate, then widen

```
fails in full suite → run the file alone → passes?  → order/state dependence
                                         → fails?   → real defect in that file
```

If it passes alone, the cause is outside the file: shared module state, leaked
rows, or concurrent load. `apps/api/vitest.config.ts` sets `isolate: false`, so
module-level state genuinely does persist across files.

## 6. Before declaring a fix complete, enumerate the siblings

The most repeated mistake in this repo (five instances in one session) is
guarding one path while an equivalent path stays open. After any guard:

```bash
# sibling verbs
grep -rn "updateRecord\|putRecord\|deleteRecord" apps/api/src --include='*.ts'
# sibling call sites of the thing you just protected
grep -rn "resolveWritePlacement\|assertPublicWriteAllowed" apps/api/src
```

Ask literally: *what is the other way to achieve this outcome?* Promoting
yourself and demoting everyone above you have the same effect on who holds
control. Creating and updating a record both publish it.

## 7. Verify inherited claims before acting on them

Audit documents and other agents' reports in this repo have contained real
false positives: dead code cited as live evidence, findings whose severity
assumed a disabled flag was on, sub-claims that dissolve on reading the file.
One "22/22 CONFIRMED" verification was not credible on inspection.

**Before spending a day on a reported finding, re-derive it.** Read the cited
`file:line` yourself, plus its callers and middleware, and ask what would make
the claim false. Cheap; occasionally saves a week.

## 8. Distinguish "my change broke this" from "my change revealed this"

When a fix causes fallout, read each failure as information rather than noise.
Adding the Tier 2 write guard broke nine tests. Eight were features that had
been leaking. **One was a leak nobody had enumerated** —
`admin.memberNotice` publishing through `OperatorWriteProxy`, absent from every
audit. A boundary-level guard finds things a list never will.

Then triage each broken test by asking **what its subject is**:

- Subject unchanged, arrangement invalidated → **fix the fixture** (a test about
  operator authorization that happened to use a now-contained collection).
- Subject genuinely changed → **rewrite the assertion**, and say in a comment
  what it should become later.
- Never delete a failing test to get green.

## 9. Prove the fix against the original reproduction

Keep the probe that demonstrated the bug and re-run it after the fix. Reporting
"fixed" without re-running the exact thing that showed it broken is how a
partial fix ships. The before/after table is the deliverable:

```
before:  coordinator approve → 204, victim active again
after:   coordinator approve → 409, victim still suspended
```

## 10. Time-box the hunt, then change the design

If a defect keeps recurring in different clothes, the design is producing it.
Testing a database sweep against a live server kept destabilising the suite; the
answer was not a better test but splitting the decision (pure, testable) from
the execution (DDL, never run in the suite). Recurrence is a design signal.
