import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import { ProfileService } from '../src/services/profile-service.js';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, type TestApp } from './helpers/test-app.js';

let testApp: TestApp;
let profileService: ProfileService;
let db: Kysely<Database>;

async function insertPerson(did: string, displayName: string): Promise<void> {
  const now = new Date();
  await db
    .insertInto('entity')
    .values({
      did,
      type: 'person',
      display_name: displayName,
      status: 'active',
      created_at: now,
      indexed_at: now,
    })
    .execute();
}

beforeAll(() => {
  testApp = createTestApp();
  db = testApp.container.db;
  profileService = testApp.container.profileService;
});

beforeEach(async () => {
  await truncateAllTables();
});

describe('ProfileService.createDefaultProfile', () => {
  it('creates a default profile with verified=true and last_renamed_at=null', async () => {
    await insertPerson('did:plc:alice', 'Alice');

    const profile = await profileService.createDefaultProfile({
      entityDid: 'did:plc:alice',
      displayName: 'Alice',
    });

    expect(profile.entityDid).toBe('did:plc:alice');
    expect(profile.displayName).toBe('Alice');
    expect(profile.verified).toBe(true);
    expect(profile.avatarCid).toBeNull();
    expect(profile.bio).toBeNull();

    const row = await db
      .selectFrom('profile')
      .where('id', '=', profile.id)
      .select(['is_default', 'last_renamed_at'])
      .executeTakeFirstOrThrow();

    expect(row.is_default).toBe(true);
    expect(row.last_renamed_at).toBeNull();
  });

  it('throws when a default profile already exists for the entity', async () => {
    await insertPerson('did:plc:bob', 'Bob');
    await profileService.createDefaultProfile({
      entityDid: 'did:plc:bob',
      displayName: 'Bob',
    });

    await expect(
      profileService.createDefaultProfile({
        entityDid: 'did:plc:bob',
        displayName: 'Bob 2',
      }),
    ).rejects.toThrow();
  });

  it('persists optional avatarCid', async () => {
    await insertPerson('did:plc:carol', 'Carol');

    const profile = await profileService.createDefaultProfile({
      entityDid: 'did:plc:carol',
      displayName: 'Carol',
      avatarCid: 'bafycid-carol-avatar',
    });

    expect(profile.avatarCid).toBe('bafycid-carol-avatar');
  });
});

describe('ProfileService.getDefaultProfile', () => {
  it('returns the default profile for an entity', async () => {
    await insertPerson('did:plc:dave', 'Dave');
    const created = await profileService.createDefaultProfile({
      entityDid: 'did:plc:dave',
      displayName: 'Dave',
    });

    const fetched = await profileService.getDefaultProfile('did:plc:dave');

    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
    expect(fetched!.displayName).toBe('Dave');
    expect(fetched!.verified).toBe(true);
  });

  it('returns null when the entity has no profile', async () => {
    const fetched = await profileService.getDefaultProfile('did:plc:noprofile');
    expect(fetched).toBeNull();
  });

  it('does not return invalidated profiles', async () => {
    await insertPerson('did:plc:eve', 'Eve');
    const created = await profileService.createDefaultProfile({
      entityDid: 'did:plc:eve',
      displayName: 'Eve',
    });

    await db
      .updateTable('profile')
      .set({ invalidated_at: new Date() })
      .where('id', '=', created.id)
      .execute();

    const fetched = await profileService.getDefaultProfile('did:plc:eve');
    expect(fetched).toBeNull();
  });
});
