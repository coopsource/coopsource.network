import { describe, it, expect, beforeEach } from 'vitest';
import type { DID } from '@coopsource/common';
import {
  DenyAllGroupDirectoryPort,
  type ResolvedMembers,
  type SpaceRef,
} from '@coopsource/spaces-consumer';
import { OperatorWriteProxy } from '../src/services/operator-write-proxy.js';
import type { AppConfig } from '../src/config.js';
import { getTestDb, truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';
import { MembershipReadModel } from '../src/services/membership-read-model.js';

describe('OperatorWriteProxy', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  function createProxy(
    pdsService: import('@coopsource/federation').IPdsService,
    membershipReadModel: MembershipReadModel,
    coopOperators?: string,
  ) {
    const db = getTestDb();
    const config = {
      COOP_OPERATORS: coopOperators,
    } as AppConfig;
    return new OperatorWriteProxy(pdsService, db, config, membershipReadModel);
  }

  it('should allow writes from operator listed in COOP_OPERATORS', async () => {
    const testApp = createTestApp();
    const { coopDid, adminDid } = await setupAndLogin(testApp);
    const proxy = createProxy(
      testApp.container.pdsService,
      testApp.container.membershipReadModel,
      adminDid,
    );

    const ref = await proxy.writeCoopRecord({
      operatorDid: adminDid,
      cooperativeDid: coopDid as DID,
      collection: 'network.coopsource.admin.memberNotice',
      record: {
        title: 'Operator notice',
        body: 'Test',
        createdAt: new Date().toISOString(),
      },
    });

    expect(ref.uri).toBeTruthy();
    expect(ref.cid).toBeTruthy();
  });

  it('should allow writes from operator with admin role', async () => {
    const testApp = createTestApp();
    const { coopDid, adminDid } = await setupAndLogin(testApp);
    const proxy = createProxy(
      testApp.container.pdsService,
      testApp.container.membershipReadModel,
    ); // no COOP_OPERATORS set

    const ref = await proxy.writeCoopRecord({
      operatorDid: adminDid,
      cooperativeDid: coopDid as DID,
      collection: 'network.coopsource.admin.memberNotice',
      record: {
        title: 'Operator notice',
        body: 'Test',
        createdAt: new Date().toISOString(),
      },
    });

    expect(ref.uri).toBeTruthy();
  });

  it('should reject writes from unauthorized operator', async () => {
    const testApp = createTestApp();
    const { coopDid } = await setupAndLogin(testApp);
    const proxy = createProxy(
      testApp.container.pdsService,
      testApp.container.membershipReadModel,
    );

    await expect(
      proxy.writeCoopRecord({
        operatorDid: 'did:plc:unauthorized',
        cooperativeDid: coopDid as DID,
        collection: 'network.coopsource.admin.memberNotice',
        record: { title: 'Operator notice', body: 'Test' },
      }),
    ).rejects.toThrow('not authorized');
  });

  it('should create audit log entry on successful write', async () => {
    const db = getTestDb();
    const testApp = createTestApp();
    const { coopDid, adminDid } = await setupAndLogin(testApp);
    const proxy = createProxy(
      testApp.container.pdsService,
      testApp.container.membershipReadModel,
      adminDid,
    );

    await proxy.writeCoopRecord({
      operatorDid: adminDid,
      cooperativeDid: coopDid as DID,
      collection: 'network.coopsource.admin.memberNotice',
      record: { title: 'Operator notice', body: 'Test' },
    });

    const logs = await db
      .selectFrom('operator_audit_log')
      .where('cooperative_did', '=', coopDid)
      .selectAll()
      .execute();

    expect(logs).toHaveLength(1);
    expect(logs[0]!.operator_did).toBe(adminDid);
    expect(logs[0]!.operation).toBe('create');
    expect(logs[0]!.collection).toBe('network.coopsource.admin.memberNotice');
    expect(logs[0]!.record_uri).toBeTruthy();
  });

  it('should not create audit log when authorization fails', async () => {
    const db = getTestDb();
    const testApp = createTestApp();
    const { coopDid } = await setupAndLogin(testApp);
    const proxy = createProxy(
      testApp.container.pdsService,
      testApp.container.membershipReadModel,
    );

    try {
      await proxy.writeCoopRecord({
        operatorDid: 'did:plc:unauthorized',
        cooperativeDid: coopDid as DID,
        collection: 'network.coopsource.admin.memberNotice',
        record: { title: 'Operator notice' },
      });
    } catch {
      // expected
    }

    const logs = await db
      .selectFrom('operator_audit_log')
      .selectAll()
      .execute();

    expect(logs).toHaveLength(0);
  });

  it('fails closed when directory resolution is partial', async () => {
    const testApp = createTestApp();
    const { coopDid, adminDid } = await setupAndLogin(testApp);
    const readModel = new MembershipReadModel(
      testApp.container.db,
      new PartialDirectoryPort(adminDid as DID),
    );
    const proxy = createProxy(testApp.container.pdsService, readModel);

    await expect(
      proxy.writeCoopRecord({
        operatorDid: adminDid,
        cooperativeDid: coopDid as DID,
        collection: 'network.coopsource.admin.memberNotice',
        record: { title: 'Operator notice', body: 'Test' },
      }),
    ).rejects.toThrow('partial result');
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
