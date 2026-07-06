import { beforeEach, describe, expect, it } from 'vitest';
import type { DID } from '@coopsource/common';
import {
  DenyAllGroupDirectoryPort,
  type ResolvedMembers,
  type SpaceRef,
} from '@coopsource/spaces-consumer';
import { MembershipReadModel } from '../src/services/membership-read-model.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { truncateAllTables } from './helpers/test-db.js';

describe('MembershipReadModel', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  it('returns the primary actor membership through strict directory resolution', async () => {
    const testApp = createTestApp();
    const { coopDid, adminDid } = await setupAndLogin(testApp);

    const actor =
      await testApp.container.membershipReadModel.getPrimaryActorMembership(
        adminDid as DID,
      );

    expect(actor).toMatchObject({
      cooperativeDid: coopDid,
      memberDid: adminDid,
      status: 'active',
      displayName: 'Test Admin',
    });
    expect(actor?.roles).toContain('admin');
    await expect(
      testApp.container.membershipReadModel.hasPermission(
        coopDid as DID,
        adminDid as DID,
        'member.approve',
      ),
    ).resolves.toBe(true);
    await expect(
      testApp.container.membershipReadModel.countActiveMembersResult(
        coopDid as DID,
      ),
    ).resolves.toMatchObject({ ok: true, count: 1 });

    const memberships =
      await testApp.container.membershipReadModel.listMemberCooperatives(
        adminDid as DID,
      );
    expect(memberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          did: coopDid,
          displayName: 'Test Cooperative',
          isNetwork: false,
          status: 'active',
        }),
      ]),
    );

    const roster =
      await testApp.container.membershipReadModel.listMembersResult(
        coopDid as DID,
        {},
      );
    if (!roster.ok) throw new Error(roster.message);
    expect(roster.page.items).toHaveLength(1);
    expect(roster.page.items[0]).toMatchObject({
      did: adminDid,
      displayName: 'Test Admin',
      status: 'active',
    });

    const member = await testApp.container.membershipReadModel.getMemberResult(
      coopDid as DID,
      adminDid as DID,
    );
    if (!member.ok) throw new Error(member.message);
    expect(member.member).toMatchObject({
      did: adminDid,
      status: 'active',
    });
  });

  it('fails closed when strict directory resolution is partial', async () => {
    const testApp = createTestApp();
    const { coopDid, adminDid } = await setupAndLogin(testApp);
    const readModel = new MembershipReadModel(
      testApp.container.db,
      new PartialDirectoryPort(adminDid as DID),
    );

    await expect(
      readModel.getPrimaryActorMembership(adminDid as DID),
    ).resolves.toBeNull();
    await expect(
      readModel.getPrimaryActorMembershipResult(adminDid as DID),
    ).resolves.toMatchObject({
      ok: false,
      axis: 'spaces',
      reason: 'partial',
    });
    await expect(
      readModel.hasPermission(
        coopDid as DID,
        adminDid as DID,
        'member.approve',
      ),
    ).resolves.toBe(false);
    await expect(
      readModel.listMemberCooperatives(adminDid as DID),
    ).resolves.toEqual([]);
    await expect(
      readModel.listMemberCooperativesResult(adminDid as DID),
    ).resolves.toMatchObject({
      ok: false,
      axis: 'spaces',
      reason: 'partial',
    });
    await expect(
      readModel.countActiveMembersResult(coopDid as DID),
    ).resolves.toMatchObject({
      ok: false,
      axis: 'spaces',
      reason: 'partial',
    });
    await expect(
      readModel.listMembersResult(coopDid as DID, {}),
    ).resolves.toMatchObject({
      ok: false,
      axis: 'spaces',
      reason: 'partial',
    });
    await expect(
      readModel.getMemberResult(coopDid as DID, adminDid as DID),
    ).resolves.toMatchObject({
      ok: false,
      axis: 'spaces',
      reason: 'partial',
    });
  });

  it('counts the strict authority roster, not just local projection rows', async () => {
    const testApp = createTestApp();
    const { coopDid, adminDid } = await setupAndLogin(testApp);
    const remoteDid = 'did:plc:authorityonly' as DID;
    const readModel = new MembershipReadModel(
      testApp.container.db,
      new CompleteDirectoryPort([adminDid as DID, remoteDid]),
    );

    await expect(
      readModel.countActiveMembersResult(coopDid as DID),
    ).resolves.toMatchObject({ ok: true, count: 2 });
  });

  it('lists suspended membership rows without active authority resolution', async () => {
    const testApp = createTestApp();
    const { coopDid, adminDid } = await setupAndLogin(testApp);

    await testApp.container.db
      .updateTable('membership')
      .set({ status: 'suspended' })
      .where('member_did', '=', adminDid)
      .execute();

    const readModel = new MembershipReadModel(
      testApp.container.db,
      new PartialDirectoryPort(adminDid as DID),
    );

    const roster = await readModel.listMembersResult(
      coopDid as DID,
      {},
      { status: 'suspended' },
    );
    if (!roster.ok) throw new Error(roster.message);
    expect(roster.page.items).toEqual([
      expect.objectContaining({
        did: adminDid,
        status: 'suspended',
      }),
    ]);

    const member = await readModel.getMemberResult(
      coopDid as DID,
      adminDid as DID,
    );
    if (!member.ok) throw new Error(member.message);
    expect(member.member).toMatchObject({
      did: adminDid,
      status: 'suspended',
    });
  });

  it('fails closed when strict directory resolution is stale', async () => {
    const testApp = createTestApp();
    const { coopDid, adminDid } = await setupAndLogin(testApp);
    const readModel = new MembershipReadModel(
      testApp.container.db,
      new StaleDirectoryPort(adminDid as DID),
    );

    await expect(
      readModel.getPrimaryActorMembership(adminDid as DID),
    ).resolves.toBeNull();
    await expect(
      readModel.getPrimaryActorMembershipResult(adminDid as DID),
    ).resolves.toMatchObject({
      ok: false,
      axis: 'spaces',
      reason: 'stale',
    });
    await expect(
      readModel.hasPermission(
        coopDid as DID,
        adminDid as DID,
        'member.approve',
      ),
    ).resolves.toBe(false);
  });

  it('rejects suspended member projections', async () => {
    const testApp = createTestApp();
    const { coopDid, adminDid } = await setupAndLogin(testApp);

    await testApp.container.db
      .updateTable('membership')
      .set({ status: 'suspended' })
      .where('member_did', '=', adminDid)
      .execute();

    await expect(
      testApp.container.membershipReadModel.getPrimaryActorMembership(
        adminDid as DID,
      ),
    ).resolves.toBeNull();
    await expect(
      testApp.container.membershipReadModel.hasPermission(
        coopDid as DID,
        adminDid as DID,
        'member.approve',
      ),
    ).resolves.toBe(false);
  });

  it('rejects invalidated member projections', async () => {
    const testApp = createTestApp();
    const { coopDid, adminDid } = await setupAndLogin(testApp);

    await testApp.container.db
      .updateTable('membership')
      .set({ invalidated_at: new Date() })
      .where('member_did', '=', adminDid)
      .execute();

    await expect(
      testApp.container.membershipReadModel.getPrimaryActorMembership(
        adminDid as DID,
      ),
    ).resolves.toBeNull();
    await expect(
      testApp.container.membershipReadModel.hasPermission(
        coopDid as DID,
        adminDid as DID,
        'member.approve',
      ),
    ).resolves.toBe(false);
  });
});

class PartialDirectoryPort extends DenyAllGroupDirectoryPort {
  constructor(private readonly memberDid: DID) {
    super();
  }

  override async resolveSpaceMembers(
    args: SpaceRef & {
      readonly consistency: 'projection-ok' | 'strict';
      readonly resolverDepth?: number;
    },
  ): Promise<ResolvedMembers> {
    return {
      ok: true,
      directMembers: [{ member: { kind: 'did', did: this.memberDid } }],
      members: [
        {
          did: this.memberDid,
          via: [args],
          directMember: { kind: 'did', did: this.memberDid },
          resolverDepth: 0,
        },
      ],
      missingSpaces: [],
      partial: true,
      stale: false,
      resolverDepth: args.resolverDepth ?? 0,
    };
  }
}

class CompleteDirectoryPort extends DenyAllGroupDirectoryPort {
  constructor(private readonly memberDids: readonly DID[]) {
    super();
  }

  override async resolveSpaceMembers(
    args: SpaceRef & {
      readonly consistency: 'projection-ok' | 'strict';
      readonly resolverDepth?: number;
    },
  ): Promise<ResolvedMembers> {
    return {
      ok: true,
      directMembers: this.memberDids.map((did) => ({
        member: { kind: 'did', did },
      })),
      members: this.memberDids.map((did) => ({
        did,
        via: [args],
        directMember: { kind: 'did', did },
        resolverDepth: 0,
      })),
      missingSpaces: [],
      partial: false,
      stale: false,
      resolverDepth: args.resolverDepth ?? 0,
    };
  }
}

class StaleDirectoryPort extends DenyAllGroupDirectoryPort {
  constructor(private readonly memberDid: DID) {
    super();
  }

  override async resolveSpaceMembers(
    args: SpaceRef & {
      readonly consistency: 'projection-ok' | 'strict';
      readonly resolverDepth?: number;
    },
  ): Promise<ResolvedMembers> {
    return {
      ok: true,
      directMembers: [{ member: { kind: 'did', did: this.memberDid } }],
      members: [
        {
          did: this.memberDid,
          via: [args],
          directMember: { kind: 'did', did: this.memberDid },
          resolverDepth: 0,
        },
      ],
      missingSpaces: [],
      partial: false,
      stale: true,
      resolverDepth: args.resolverDepth ?? 0,
    };
  }
}
