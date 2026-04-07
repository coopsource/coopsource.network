import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables, getTestDb } from './helpers/test-db.js';
import { setupAndLogin, createTestApp } from './helpers/test-app.js';
import {
  resolveVisibilityTier,
  tierAtLeast,
} from '../src/services/visibility-tier.js';

describe('visibility-tier', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  describe('resolveVisibilityTier', () => {
    it('returns "anonymous" when no actor is present', async () => {
      const db = getTestDb();
      const tier = await resolveVisibilityTier(db, { actor: undefined });
      expect(tier.tier).toBe('anonymous');
      expect(tier.userDid).toBeUndefined();
    });

    it('returns "authenticated" for a logged-in user with no coop context', async () => {
      const db = getTestDb();
      const tier = await resolveVisibilityTier(db, {
        actor: {
          did: 'did:plc:abc',
          displayName: 'Test',
          roles: [],
          cooperativeDid: 'did:plc:other',
          membershipId: 'm1',
          hasRole: () => false,
        },
      });
      expect(tier.tier).toBe('authenticated');
      expect(tier.userDid).toBe('did:plc:abc');
    });

    it('returns "officer" when actor has admin role in the requested coop', async () => {
      const testApp = createTestApp();
      const { coopDid, adminDid } = await setupAndLogin(testApp);
      const db = getTestDb();

      const tier = await resolveVisibilityTier(db, {
        actor: {
          did: adminDid,
          displayName: 'Admin',
          roles: ['admin'],
          cooperativeDid: coopDid,
          membershipId: 'm1',
          hasRole: (...check: string[]) => check.includes('admin'),
        },
        cooperativeDid: coopDid,
      });
      expect(tier.tier).toBe('officer');
      expect(tier.roles).toContain('admin');
    });

    it('returns "owner" when actor has owner role in the requested coop', async () => {
      const db = getTestDb();
      const tier = await resolveVisibilityTier(db, {
        actor: {
          did: 'did:plc:owner',
          displayName: 'Owner',
          roles: ['owner'],
          cooperativeDid: 'did:plc:coop',
          membershipId: 'm1',
          hasRole: (...check: string[]) => check.includes('owner'),
        },
        cooperativeDid: 'did:plc:coop',
      });
      expect(tier.tier).toBe('owner');
    });

    it('returns "member" when actor is a plain member of the requested coop', async () => {
      const db = getTestDb();
      const tier = await resolveVisibilityTier(db, {
        actor: {
          did: 'did:plc:m',
          displayName: 'Member',
          roles: ['member'],
          cooperativeDid: 'did:plc:coop',
          membershipId: 'm1',
          hasRole: (...check: string[]) => check.includes('member'),
        },
        cooperativeDid: 'did:plc:coop',
      });
      expect(tier.tier).toBe('member');
    });

    it('returns "cross-coop" when authenticated user is a member of a different coop', async () => {
      const db = getTestDb();
      const tier = await resolveVisibilityTier(db, {
        actor: {
          did: 'did:plc:user',
          displayName: 'User',
          roles: ['member'],
          cooperativeDid: 'did:plc:coop-a',
          membershipId: 'm1',
          hasRole: () => false,
        },
        cooperativeDid: 'did:plc:coop-b',
      });
      expect(tier.tier).toBe('cross-coop');
    });
  });

  describe('tierAtLeast', () => {
    it('returns true when tier equals threshold', () => {
      expect(tierAtLeast({ tier: 'member' }, 'member')).toBe(true);
    });

    it('returns true when tier is above threshold', () => {
      expect(tierAtLeast({ tier: 'officer' }, 'member')).toBe(true);
      expect(tierAtLeast({ tier: 'owner' }, 'anonymous')).toBe(true);
    });

    it('returns false when tier is below threshold', () => {
      expect(tierAtLeast({ tier: 'anonymous' }, 'member')).toBe(false);
      expect(tierAtLeast({ tier: 'authenticated' }, 'officer')).toBe(false);
    });

    it('orders cross-coop between authenticated and member', () => {
      expect(tierAtLeast({ tier: 'cross-coop' }, 'authenticated')).toBe(true);
      expect(tierAtLeast({ tier: 'cross-coop' }, 'member')).toBe(false);
    });
  });
});
