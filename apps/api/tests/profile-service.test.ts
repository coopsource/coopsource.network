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
    // V8.8 — discoverable defaults to false per migration 061.
    expect(fetched!.discoverable).toBe(false);
    // V8.9 — dismissedGetStarted defaults to false per migration 062.
    expect(fetched!.dismissedGetStarted).toBe(false);
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

describe('ProfileService.setDiscoverable (V8.8)', () => {
  it('flips discoverable from false to true on the default profile', async () => {
    await insertPerson('did:plc:frank', 'Frank');
    await profileService.createDefaultProfile({
      entityDid: 'did:plc:frank',
      displayName: 'Frank',
    });

    // Default from migration 061 is false.
    const before = await profileService.getDefaultProfile('did:plc:frank');
    expect(before!.discoverable).toBe(false);

    await profileService.setDiscoverable('did:plc:frank', true);

    const after = await profileService.getDefaultProfile('did:plc:frank');
    expect(after!.discoverable).toBe(true);
  });

  it('flips discoverable back to false', async () => {
    await insertPerson('did:plc:grace', 'Grace');
    await profileService.createDefaultProfile({
      entityDid: 'did:plc:grace',
      displayName: 'Grace',
    });

    await profileService.setDiscoverable('did:plc:grace', true);
    await profileService.setDiscoverable('did:plc:grace', false);

    const after = await profileService.getDefaultProfile('did:plc:grace');
    expect(after!.discoverable).toBe(false);
  });

  it('bumps updated_at on the row', async () => {
    await insertPerson('did:plc:heidi', 'Heidi');
    const created = await profileService.createDefaultProfile({
      entityDid: 'did:plc:heidi',
      displayName: 'Heidi',
    });

    // Tests use MockClock; advance it so the new timestamp is strictly
    // greater than the createdAt baked into the creation.
    testApp.clock.advance(60_000);

    await profileService.setDiscoverable('did:plc:heidi', true);

    const row = await db
      .selectFrom('profile')
      .where('id', '=', created.id)
      .select(['updated_at'])
      .executeTakeFirstOrThrow();

    expect(new Date(row.updated_at).getTime()).toBeGreaterThan(
      new Date(created.updatedAt).getTime(),
    );
  });

  it('only updates the default profile row (leaves non-default profiles alone)', async () => {
    // V8.3 ships single-profile-only, but the partial unique index allows
    // non-default rows. Seed one directly to verify the WHERE clause.
    await insertPerson('did:plc:ivan', 'Ivan');
    const now = new Date();
    const defaultRow = await db
      .insertInto('profile')
      .values({
        entity_did: 'did:plc:ivan',
        is_default: true,
        display_name: 'Ivan Default',
        verified: true,
        discoverable: false,
        created_at: now,
        updated_at: now,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const sideRow = await db
      .insertInto('profile')
      .values({
        entity_did: 'did:plc:ivan',
        is_default: false,
        display_name: 'Ivan Alt',
        verified: false,
        discoverable: false,
        created_at: now,
        updated_at: now,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    await profileService.setDiscoverable('did:plc:ivan', true);

    const def = await db
      .selectFrom('profile')
      .where('id', '=', defaultRow.id)
      .select(['discoverable'])
      .executeTakeFirstOrThrow();
    const side = await db
      .selectFrom('profile')
      .where('id', '=', sideRow.id)
      .select(['discoverable'])
      .executeTakeFirstOrThrow();

    expect(def.discoverable).toBe(true);
    expect(side.discoverable).toBe(false);
  });

  it('is a no-op when the entity has no default profile', async () => {
    // No row inserted → update affects zero rows, no throw.
    await expect(
      profileService.setDiscoverable('did:plc:noone', true),
    ).resolves.toBeUndefined();
  });
});

describe('ProfileService.setDismissedGetStarted (V8.9)', () => {
  it('flips dismissed_get_started from false to true', async () => {
    await insertPerson('did:plc:kim', 'Kim');
    await profileService.createDefaultProfile({
      entityDid: 'did:plc:kim',
      displayName: 'Kim',
    });

    const before = await profileService.getDefaultProfile('did:plc:kim');
    expect(before!.dismissedGetStarted).toBe(false);

    await profileService.setDismissedGetStarted('did:plc:kim', true);

    const after = await profileService.getDefaultProfile('did:plc:kim');
    expect(after!.dismissedGetStarted).toBe(true);
  });

  it('flips dismissed_get_started back to false', async () => {
    await insertPerson('did:plc:leo', 'Leo');
    await profileService.createDefaultProfile({
      entityDid: 'did:plc:leo',
      displayName: 'Leo',
    });

    await profileService.setDismissedGetStarted('did:plc:leo', true);
    await profileService.setDismissedGetStarted('did:plc:leo', false);

    const after = await profileService.getDefaultProfile('did:plc:leo');
    expect(after!.dismissedGetStarted).toBe(false);
  });

  it('bumps updated_at', async () => {
    await insertPerson('did:plc:mia', 'Mia');
    const created = await profileService.createDefaultProfile({
      entityDid: 'did:plc:mia',
      displayName: 'Mia',
    });

    testApp.clock.advance(60_000);
    await profileService.setDismissedGetStarted('did:plc:mia', true);

    const row = await db
      .selectFrom('profile')
      .where('id', '=', created.id)
      .select(['updated_at'])
      .executeTakeFirstOrThrow();

    expect(new Date(row.updated_at).getTime()).toBeGreaterThan(
      new Date(created.updatedAt).getTime(),
    );
  });
});
