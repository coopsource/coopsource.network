import { createTestDb, migrateTestDb, destroyTestDb } from './test-db.js';

export async function setup(): Promise<void> {
  await createTestDb();
  await migrateTestDb();
}

export async function teardown(): Promise<void> {
  await destroyTestDb();
}
