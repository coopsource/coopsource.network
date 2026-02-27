import { describe, it, expect } from 'vitest';
import { PERMISSIONS, BUILT_IN_ROLES } from '../src/permissions.js';
import type { Permission } from '../src/permissions.js';

describe('PERMISSIONS', () => {
  it('has all expected permission keys', () => {
    expect(Object.keys(PERMISSIONS)).toContain('member.invite');
    expect(Object.keys(PERMISSIONS)).toContain('vote.cast');
    expect(Object.keys(PERMISSIONS)).toContain('coop.settings.edit');
    expect(Object.keys(PERMISSIONS)).toContain('network.coop.approve');
  });

  it('has human-readable descriptions for all permissions', () => {
    for (const [key, desc] of Object.entries(PERMISSIONS)) {
      expect(typeof desc).toBe('string');
      expect(desc.length).toBeGreaterThan(0);
      expect(key).toMatch(/^[a-z]+\.[a-z]+(\.[a-z]+)?$/);
    }
  });

  it('contains 21 permissions', () => {
    expect(Object.keys(PERMISSIONS)).toHaveLength(21);
  });
});

describe('BUILT_IN_ROLES', () => {
  it('defines 4 built-in roles', () => {
    expect(Object.keys(BUILT_IN_ROLES)).toEqual(
      expect.arrayContaining(['member', 'coordinator', 'admin', 'observer']),
    );
    expect(Object.keys(BUILT_IN_ROLES)).toHaveLength(4);
  });

  it('member role has expected permissions', () => {
    const member = BUILT_IN_ROLES.member;
    expect(member.permissions).toContain('proposal.create');
    expect(member.permissions).toContain('vote.cast');
    expect(member.permissions).toContain('agreement.sign');
    expect(member.permissions).toContain('post.create');
    expect(member.permissions).toContain('project.create');
    expect(member.inherits).toBeUndefined();
  });

  it('coordinator inherits from member', () => {
    const coordinator = BUILT_IN_ROLES.coordinator;
    expect(coordinator.inherits).toEqual(['member']);
    expect(coordinator.permissions).toContain('member.invite');
    expect(coordinator.permissions).toContain('coop.settings.edit');
    // Should NOT have admin-only permissions
    expect(coordinator.permissions).not.toContain('*');
  });

  it('admin has wildcard permission', () => {
    const admin = BUILT_IN_ROLES.admin;
    expect(admin.permissions).toEqual(['*']);
    expect(admin.inherits).toBeUndefined();
  });

  it('observer role only has vote.cast', () => {
    const observer = BUILT_IN_ROLES.observer;
    expect(observer.permissions).toEqual(['vote.cast']);
    expect(observer.inherits).toBeUndefined();
  });

  it('all non-wildcard permissions reference valid permission keys', () => {
    const validKeys = new Set(Object.keys(PERMISSIONS));
    for (const [roleName, def] of Object.entries(BUILT_IN_ROLES)) {
      for (const perm of def.permissions) {
        if (perm === '*') continue;
        expect(validKeys.has(perm as Permission)).toBe(true);
      }
    }
  });
});
