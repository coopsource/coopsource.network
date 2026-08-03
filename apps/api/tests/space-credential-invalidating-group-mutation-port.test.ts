import type { DID } from '@coopsource/common';
import {
  membersSpace,
  roleSpace,
  type GroupMutationAuditPage,
  type GroupMutationPort,
  type GroupMutationResult,
  type ProvisionCooperativeAuthorityResult,
} from '@coopsource/arbiter-client';
import type {
  SpaceCredential,
  SpaceCredentialStore,
  SpaceRef,
} from '@coopsource/spaces-consumer';
import { describe, expect, it } from 'vitest';
import { SpaceCredentialInvalidatingGroupMutationPort } from '../src/services/space-credential-invalidating-group-mutation-port.js';

const cooperativeDid = 'did:plc:coop' as DID;
const otherCooperativeDid = 'did:plc:other' as DID;
const memberDid = 'did:plc:alice' as DID;
const actorDid = 'did:plc:admin' as DID;

describe('SpaceCredentialInvalidatingGroupMutationPort', () => {
  it('invalidates live cached credentials for the mutated cooperative', async () => {
    const events: string[] = [];
    const store = new FakeSpaceCredentialStore([
      membersSpace(cooperativeDid),
      roleSpace(cooperativeDid, 'board'),
      membersSpace(otherCooperativeDid),
    ], events);
    const delegate = new FakeGroupMutationPort(events, {
      ok: true,
      changed: true,
      operation: 'add-member',
      cooperativeDid,
      memberDid,
      space: membersSpace(cooperativeDid),
    });
    const port = new SpaceCredentialInvalidatingGroupMutationPort(
      delegate,
      store,
    );

    await port.addMember({
      cooperativeDid,
      memberDid,
      actorDid,
      roles: ['member'],
    });

    expect(events).toEqual([
      'mutation:add-member',
      'credentials:live',
      'credentials:delete:members',
      'credentials:delete:roles/board',
    ]);
    expect(store.deleted).toEqual([
      membersSpace(cooperativeDid),
      roleSpace(cooperativeDid, 'board'),
    ]);
  });

  it('does not invalidate credentials for unchanged mutations', async () => {
    const events: string[] = [];
    const store = new FakeSpaceCredentialStore(
      [membersSpace(cooperativeDid)],
      events,
    );
    const delegate = new FakeGroupMutationPort(events, {
      ok: true,
      changed: false,
      operation: 'remove-member',
      cooperativeDid,
      memberDid,
      space: membersSpace(cooperativeDid),
    });
    const port = new SpaceCredentialInvalidatingGroupMutationPort(
      delegate,
      store,
    );

    await port.removeMember({
      cooperativeDid,
      memberDid,
      actorDid,
    });

    expect(events).toEqual(['mutation:remove-member']);
    expect(store.deleted).toEqual([]);
  });

  it('does not touch credentials for audit reads', async () => {
    const events: string[] = [];
    const store = new FakeSpaceCredentialStore(
      [membersSpace(cooperativeDid)],
      events,
    );
    const delegate = new FakeGroupMutationPort(events, {
      ok: true,
      changed: true,
      operation: 'add-member',
      cooperativeDid,
      memberDid,
      space: membersSpace(cooperativeDid),
    });
    const port = new SpaceCredentialInvalidatingGroupMutationPort(
      delegate,
      store,
    );

    await expect(port.listAuditEvents({ cooperativeDid })).resolves.toEqual({
      events: [],
    });

    expect(events).toEqual(['audit']);
    expect(store.deleted).toEqual([]);
  });
});

class FakeSpaceCredentialStore
  implements Pick<SpaceCredentialStore, 'delete' | 'live'>
{
  readonly deleted: SpaceRef[] = [];

  constructor(
    private readonly refs: readonly SpaceRef[],
    private readonly events: string[],
  ) {}

  async live(): Promise<Array<{ ref: SpaceRef; cred: SpaceCredential }>> {
    this.events.push('credentials:live');
    await Promise.resolve();
    return this.refs.map((ref) => ({
      ref,
      cred: {
        token: `${ref.arbiterDid}:${ref.spaceKey}`,
        expiresAt: new Date('2026-07-08T13:00:00Z'),
      },
    }));
  }

  async delete(ref: SpaceRef): Promise<void> {
    await Promise.resolve();
    this.deleted.push(ref);
    this.events.push(`credentials:delete:${ref.spaceKey}`);
  }
}

class FakeGroupMutationPort implements GroupMutationPort {
  constructor(
    private readonly events: string[],
    private readonly result: GroupMutationResult,
  ) {}

  async provisionCooperativeAuthority(): Promise<ProvisionCooperativeAuthorityResult> {
    this.events.push('mutation:provision-cooperative-authority');
    await Promise.resolve();
    return {
      ...this.result,
      arbiterDid: this.result.cooperativeDid,
      membersSpace: membersSpace(this.result.cooperativeDid),
    };
  }

  async ensureRoleSpace(): Promise<GroupMutationResult> {
    return this.mutationResult('ensure-role-space');
  }

  async addMember(): Promise<GroupMutationResult> {
    return this.mutationResult('add-member');
  }

  async removeMember(): Promise<GroupMutationResult> {
    return this.mutationResult('remove-member');
  }

  async suspendMember(): Promise<GroupMutationResult> {
    return this.mutationResult('suspend-member');
  }

  async reinstateMember(): Promise<GroupMutationResult> {
    return this.mutationResult('reinstate-member');
  }

  async addRoleMember(): Promise<GroupMutationResult> {
    return this.mutationResult('add-role-member');
  }

  async removeRoleMember(): Promise<GroupMutationResult> {
    return this.mutationResult('remove-role-member');
  }

  async setMemberRoles(): Promise<GroupMutationResult> {
    return this.mutationResult('set-member-roles');
  }

  async listAuditEvents(): Promise<GroupMutationAuditPage> {
    this.events.push('audit');
    await Promise.resolve();
    return { events: [] };
  }

  private async mutationResult(
    operation: GroupMutationResult['operation'],
  ): Promise<GroupMutationResult> {
    this.events.push(`mutation:${operation}`);
    await Promise.resolve();
    return {
      ...this.result,
      operation,
    };
  }
}
