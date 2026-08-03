import { describe, it, expect } from 'vitest';
import {
  getTestConnectionString,
  getTestDbName,
  getAdminConnectionString,
  perRunConnectionString,
  selectOrphanedTestDbs,
} from './helpers/test-db.js';

/**
 * The harness used to hardcode both the database name and the admin URL, so
 * `TEST_DATABASE_URL` — declared as a passthrough knob in turbo.json — moved
 * where tests *read* from without moving what `createTestDb` *dropped*. A run
 * with the override set would go green while destroying the default database
 * out from under a concurrent run, which is a hard failure to attribute:
 * the victim fails on the first table of `truncateAllTables`.
 */
describe('test database isolation', () => {
  it('derives the database name from the connection string', () => {
    expect(getTestDbName('postgresql://localhost:5432/some_other_db')).toBe('some_other_db');
    expect(
      getTestDbName('postgresql://user:pw@db.example:6543/scoped_db'),
    ).toBe('scoped_db');
  });

  it('derives the admin connection from the same host and credentials', () => {
    const admin = new URL(getAdminConnectionString('postgresql://u:pw@db.example:6543/target'));

    expect(admin.pathname).toBe('/postgres');
    expect(admin.hostname).toBe('db.example');
    expect(admin.port).toBe('6543');
    expect(admin.username).toBe('u');
  });

  it('names each run its own database rather than the shared one', () => {
    const name = getTestDbName(perRunConnectionString());

    expect(name).toMatch(/^coopsource_test_\d+$/);
    // The shared name is what the Playwright harness owns; contending over it
    // is what required a manual psql DROP between the two suites.
    expect(name).not.toBe('coopsource_test');
  });

  it('runs against the database the global setup actually created', async () => {
    // Workers are forked, so their pid differs from the setup process's. If the
    // name were re-derived per process this query would hit a missing database.
    const { getTestDb } = await import('./helpers/test-db.js');
    const row = await getTestDb()
      .selectNoFrom((eb) => eb.fn<string>('current_database', []).as('db'))
      .executeTakeFirstOrThrow();

    expect(row.db).toBe(getTestDbName(getTestConnectionString()));
  });

  it('rejects a database name that is not a bare identifier', () => {
    // The name reaches DDL, where it cannot be parameterised.
    expect(() => getTestDbName('postgresql://localhost:5432/evil";DROP DATABASE x;--')).toThrow();
    expect(() => getTestDbName('postgresql://localhost:5432/')).toThrow();
  });
});

/**
 * Teardown does not run when a process is killed, so per-run databases from
 * crashed runs would otherwise accumulate forever — which undercuts the whole
 * point of owning one per run.
 *
 * These exercise the selection, not the DDL, deliberately. An earlier version
 * created and dropped real databases here, and `CREATE`/`DROP DATABASE` take
 * heavyweight locks that stalled unrelated tests to the point of 30s timeouts.
 * The risk in a sweep is choosing the wrong name, and that is entirely in the
 * selection.
 */
describe('orphaned per-run database selection', () => {
  /** A pid with no live process. */
  function deadPid(): number {
    for (let candidate = 999_999; candidate > 900_000; candidate--) {
      try {
        process.kill(candidate, 0);
      } catch {
        return candidate;
      }
    }
    throw new Error('could not find a dead pid');
  }

  it('selects databases whose owning process is gone', () => {
    const orphan = `coopsource_test_${deadPid()}`;

    expect(selectOrphanedTestDbs([orphan])).toEqual([orphan]);
  });

  it('never selects a database whose process is alive', () => {
    const live = `coopsource_test_${process.pid}`;

    expect(selectOrphanedTestDbs([live])).toEqual([]);
  });

  it('never selects anything that is not a per-run database', () => {
    // `coopsource_test` belongs to the Playwright harness; the others are dev
    // and federation databases that must survive.
    expect(
      selectOrphanedTestDbs([
        'coopsource_test',
        'coopsource_dev',
        'coopsource_hub',
        'coopsource_test_sweepguard',
        'coopsource_v91_gate_test',
        'postgres',
      ]),
    ).toEqual([]);
  });
});
