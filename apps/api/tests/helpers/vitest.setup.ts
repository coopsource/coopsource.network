import {
  createTestDb,
  migrateTestDb,
  destroyTestDb,
  dropTestDb,
  perRunConnectionString,
  OWNED_DB_ENV,
} from './test-db.js';

export async function setup(): Promise<void> {
  // Fix the database for the whole run here, in the one process that runs
  // before any worker is forked. Workers inherit this env, so they cannot
  // derive a different name from their own pid.
  if (!process.env.TEST_DATABASE_URL) {
    process.env.TEST_DATABASE_URL = perRunConnectionString();
    process.env[OWNED_DB_ENV] = '1';
  }

  await createTestDb();
  await migrateTestDb();
}

export async function teardown(): Promise<void> {
  // Close the pool before dropping, or the drop blocks on our own connections.
  await destroyTestDb();
  // The run owns a per-process database, so it also has to remove it.
  await dropTestDb();
}
