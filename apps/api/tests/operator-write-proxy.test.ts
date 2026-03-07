import { describe, it, expect, beforeEach } from 'vitest';
import type { DID } from '@coopsource/common';
import { OperatorWriteProxy } from '../src/services/operator-write-proxy.js';
import type { AppConfig } from '../src/config.js';
import { getTestDb, truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('OperatorWriteProxy', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  function createProxy(pdsService: import('@coopsource/federation').IPdsService, coopOperators?: string) {
    const db = getTestDb();
    const config = {
      COOP_OPERATORS: coopOperators,
    } as AppConfig;
    return new OperatorWriteProxy(pdsService, db, config);
  }

  it('should allow writes from operator listed in COOP_OPERATORS', async () => {
    const testApp = createTestApp();
    const { coopDid, adminDid } = await setupAndLogin(testApp);
    const proxy = createProxy(testApp.container.pdsService, adminDid);

    const ref = await proxy.writeCoopRecord({
      operatorDid: adminDid,
      cooperativeDid: coopDid as DID,
      collection: 'network.coopsource.org.memberApproval',
      record: { member: 'did:plc:someone', roles: ['member'], createdAt: new Date().toISOString() },
    });

    expect(ref.uri).toBeTruthy();
    expect(ref.cid).toBeTruthy();
  });

  it('should allow writes from operator with admin role', async () => {
    const testApp = createTestApp();
    const { coopDid, adminDid } = await setupAndLogin(testApp);
    const proxy = createProxy(testApp.container.pdsService); // no COOP_OPERATORS set

    const ref = await proxy.writeCoopRecord({
      operatorDid: adminDid,
      cooperativeDid: coopDid as DID,
      collection: 'network.coopsource.org.memberApproval',
      record: { member: 'did:plc:someone', roles: ['member'], createdAt: new Date().toISOString() },
    });

    expect(ref.uri).toBeTruthy();
  });

  it('should reject writes from unauthorized operator', async () => {
    const testApp = createTestApp();
    const { coopDid } = await setupAndLogin(testApp);
    const proxy = createProxy(testApp.container.pdsService);

    await expect(
      proxy.writeCoopRecord({
        operatorDid: 'did:plc:unauthorized',
        cooperativeDid: coopDid as DID,
        collection: 'network.coopsource.org.memberApproval',
        record: { member: 'did:plc:someone', roles: ['member'] },
      }),
    ).rejects.toThrow('not authorized');
  });

  it('should create audit log entry on successful write', async () => {
    const db = getTestDb();
    const testApp = createTestApp();
    const { coopDid, adminDid } = await setupAndLogin(testApp);
    const proxy = createProxy(testApp.container.pdsService, adminDid);

    await proxy.writeCoopRecord({
      operatorDid: adminDid,
      cooperativeDid: coopDid as DID,
      collection: 'network.coopsource.org.memberApproval',
      record: { member: 'did:plc:someone', roles: ['member'] },
    });

    const logs = await db
      .selectFrom('operator_audit_log')
      .where('cooperative_did', '=', coopDid)
      .selectAll()
      .execute();

    expect(logs).toHaveLength(1);
    expect(logs[0]!.operator_did).toBe(adminDid);
    expect(logs[0]!.operation).toBe('create');
    expect(logs[0]!.collection).toBe('network.coopsource.org.memberApproval');
    expect(logs[0]!.record_uri).toBeTruthy();
  });

  it('should not create audit log when authorization fails', async () => {
    const db = getTestDb();
    const testApp = createTestApp();
    const { coopDid } = await setupAndLogin(testApp);
    const proxy = createProxy(testApp.container.pdsService);

    try {
      await proxy.writeCoopRecord({
        operatorDid: 'did:plc:unauthorized',
        cooperativeDid: coopDid as DID,
        collection: 'network.coopsource.org.memberApproval',
        record: { member: 'did:plc:someone' },
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
});
