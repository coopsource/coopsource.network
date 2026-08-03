import { describe, it, expect } from 'vitest';
import {
  getTestConnectionString,
  getTestDbName,
  getAdminConnectionString,
  perRunConnectionString,
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
