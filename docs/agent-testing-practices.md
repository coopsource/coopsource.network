# Testing Practices — writing tests that actually catch things

Companion to [agent-learnings.md](./agent-learnings.md) and the
[debugging playbook](./agent-debugging-playbook.md). Every rule here exists
because a green test suite in this repo failed to catch a real defect.

---

## 1. Watch it fail for the *right* reason

TDD's value is the red step, and only if the failure is the one you intended.

- Fails with `TypeError: x is not a function` → you proved the function is
  missing, not that the behaviour is wrong. Add a minimal stub and re-run until
  it fails on the **assertion**.
- Fails on setup (`expected 201, got 400`) → your fixture is broken; the
  behaviour under test never ran.

Worked example: the log-redaction fix. The first red was "function does not
exist", which proves nothing. Adding the factory *without* redaction produced
the real red — `expected '…SUPERSECRET_SESSION…' not to contain 'SUPERSECRET'` —
which proved the vulnerability existed and that the test could see it.

## 2. Assert on observable end state, through the real route

`tier2-placement-containment.test.ts` asserted that a port returned
`permissioned-space` for nine confidential collections. It passed while two of
those collections wrote to public repos, because **no writer called the port.**

```ts
// Proves a helper's opinion.
expect((await port.resolveWritePlacement({ collection })).kind)
  .toBe('permissioned-space');

// Proves the system's behaviour.
await app.agent.post(`/api/v1/campaigns/${uri}/pledge`).send({ amount: 5000 });
const published = await db.selectFrom('pds_record')
  .where('collection', '=', 'network.coopsource.funding.pledge')
  .select('uri').execute();
expect(published).toEqual([]);
```

Unit tests over ports are fine as *additional* coverage. They must not be the
only evidence for a system-level invariant.

## 3. When asserting absence, first prove the action happened

An assertion that "no public record exists" is satisfied by any failure —
including a 400 from a fixture mistake. This test passed for the wrong reason:

```ts
await app.agent.post(`/…/pledge`).send({ amount: 5000 });   // silently 400'd
expect(publishedPledges).toEqual([]);                        // vacuously true
```

Always pin the status:

```ts
const res = await app.agent.post(`/…/pledge`).send({ amount: 5000 });
expect(res.status).toBe(501);          // the action reached the guard
expect(publishedPledges).toEqual([]);  // and produced no record
```

Rule of thumb: **every `toEqual([])` / `not.toContain` / `toBeUndefined` needs a
companion assertion that the operation ran.**

## 4. Test both sibling verbs, always

Guarding `create` and not `update` is not a fix — both publish. The regression
test must cover the pair, with a fake that screams if the unguarded path is
reached:

```ts
const unreachableOAuth = { restore: async () => { throw new Error('REACHED_OAUTH'); } };
```

If the guard is missing, the failure message says `REACHED_OAUTH` rather than a
generic mismatch, which names the defect for you.

Applies to: create/update, add/remove, grant/revoke, open/close, HTTP route vs.
federation route, production container vs. test container.

## 5. Mirror container changes into the test container

`apps/api/tests/helpers/test-app.ts` builds its own container rather than
calling `createContainer()`. A change to `apps/api/src/container.ts` **does not
reach the tests**. A production-only guard once shipped while the suite reported
it contained.

When you touch container wiring, change both in the same commit.

## 6. Never run destructive infrastructure operations in the suite

`CREATE DATABASE` / `DROP DATABASE` take heavyweight locks and stall unrelated
tests into timeouts, surfacing as failures in innocent files.

**Split the decision from the execution and test the decision.** In a sweep, the
risk is choosing the wrong name — so `selectOrphanedTestDbs(names): string[]` is
pure and fully tested, while the DDL that applies its output is never exercised
by the suite.

This generalises: for anything destructive or slow, find the pure decision
inside it and test that.

## 7. Repair fixtures; do not weaken assertions

When your change breaks a test, decide what the test's *subject* is:

| Situation | Action |
|---|---|
| Subject unchanged, arrangement now invalid | fix the arrangement (e.g. swap a now-contained collection for a publishable one) |
| Subject genuinely changed | rewrite the assertion **and comment what it should become later** |
| You want it green | not a reason. Never delete or `.skip` to pass |

When you rewrite an assertion because behaviour is intentionally contained, say
so in the test so the next person restores it rather than deleting it:

```ts
/**
 * … These assertions hold until the collection has a real permissioned
 * destination — at which point rewrite them to assert the record lands in the
 * member-class space, rather than deleting them.
 */
```

## 8. No tautologies

`expect(true).toBe(true)` is a probe, not a test. Probes belong in `zz-*.test.ts`
files that you delete. Before committing:

```bash
grep -rn "expect(true).toBe(true)" apps/api/tests
git status --short   # no stray zz-* files
```

## 9. Prefer a broad invariant to an enumerated list

Asserting "no public record contains `/space/`" catches the leak you know about
*and* the one you haven't thought of. Asserting "the vote record does not
contain the proposal URI" only catches the former.

```ts
for (const record of await db.selectFrom('pds_record').select(['content']).execute()) {
  expect(String(record.content)).not.toContain('/space/');
}
```

The same principle at the code level found a leak no audit had listed: a guard
at the write *boundary* catches every writer, present and future; a list of
collections to check catches only what someone remembered.

## 10. Harness hygiene

- Add new tables to `truncateAllTables` in the same commit that adds the table,
  or rows leak across files and produce order-dependent failures.
- `TEST_DB_KEEP=1` preserves the run's database for inspection; `TEST_DATABASE_URL`
  pins one (and is never dropped for you).
- `apps/api/tsconfig.json` is `"include": ["src"]` — **tests are not
  typechecked**. `pnpm build` passing says nothing about test type safety.
