import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';
import type { TestApp } from './helpers/test-app.js';

describe('V8.3 — profile inlining in /auth/me', () => {
  let testApp: TestApp;

  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
    testApp = createTestApp();
  });

  it('GET /auth/me returns the user profile inline', async () => {
    await setupAndLogin(testApp);

    const res = await testApp.agent.get('/api/v1/auth/me').expect(200);

    expect(res.body.profile).toBeDefined();
    expect(res.body.profile).not.toBeNull();
    expect(res.body.profile.displayName).toBe('Test Admin');
    expect(res.body.profile.verified).toBe(true);
    expect(res.body.profile.avatarCid).toBeNull();
    expect(res.body.profile.bio).toBeNull();
    expect(typeof res.body.profile.id).toBe('string');
  });

  it('POST /auth/login response includes the profile inline', async () => {
    // Use setup to create the admin, then issue an explicit login on a fresh agent.
    await setupAndLogin(testApp);

    const freshApp = createTestApp();
    const res = await freshApp.agent
      .post('/api/v1/auth/login')
      .send({ email: 'admin@test.com', password: 'password123' })
      .expect(200);

    expect(res.body.profile).toBeDefined();
    expect(res.body.profile).not.toBeNull();
    expect(res.body.profile.displayName).toBe('Test Admin');
    expect(res.body.profile.verified).toBe(true);
  });

  it('setup creates a default profile for the new admin', async () => {
    const { adminDid } = await setupAndLogin(testApp);

    // The setup flow creates the admin entity inside its own transaction
    // and calls profileService.createDefaultProfile with the trx override.
    const profile = await testApp.container.profileService.getDefaultProfile(adminDid);

    expect(profile).not.toBeNull();
    expect(profile!.entityDid).toBe(adminDid);
    expect(profile!.displayName).toBe('Test Admin');
    expect(profile!.verified).toBe(true);
  });

  it('AuthService.register() creates a default profile inside the transaction', async () => {
    // First, set up a cooperative so register() has somewhere to attach a
    // bilateral membership.
    const { coopDid } = await setupAndLogin(testApp);

    // Now register a NEW user via AuthService.register() directly. This
    // exercises the V8.3 db.transaction() wrap around entity + profile +
    // auth_credential.
    const { did: newDid } = await testApp.container.authService.register({
      email: 'newuser@test.com',
      password: 'password123',
      displayName: 'New Persona',
      cooperativeDid: coopDid,
    });

    const profile = await testApp.container.profileService.getDefaultProfile(newDid);
    expect(profile).not.toBeNull();
    expect(profile!.entityDid).toBe(newDid);
    expect(profile!.displayName).toBe('New Persona');
    expect(profile!.verified).toBe(true);
  });
});
