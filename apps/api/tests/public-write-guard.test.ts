import { describe, it, expect, beforeEach } from 'vitest';
import type { IPdsService } from '@coopsource/federation';
import type { DID } from '@coopsource/common';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, type TestApp } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';
import { MemberWriteProxy } from '../src/services/member-write-proxy.js';
import {
  assertPublicWriteAllowed,
  guardPublicWrites,
} from '../src/services/public-write-guard.js';

/**
 * The Tier 2 write boundary (audit C-03). Two code paths reach a public repo:
 * `IPdsService`, and `MemberWriteProxy`'s OAuth path which talks to the
 * member's PDS directly. Both must refuse confidential collections, and both
 * must refuse them on create *and* update — guarding one verb leaves the other
 * as an equivalent way to publish the same record.
 */
const CONFIDENTIAL = 'network.coopsource.funding.pledge';
const PUBLISHABLE = 'network.coopsource.governance.proposal';
const MEMBER = 'did:plc:guardmember' as DID;

describe('Tier 2 public-write guard', () => {
  let testApp: TestApp;

  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
    testApp = createTestApp();
  });

  /** Fails loudly if the guard lets a write through to the OAuth path. */
  const unreachableOAuth = {
    restore: async () => {
      throw new Error('REACHED_OAUTH');
    },
  };

  function productionProxy(): MemberWriteProxy {
    return new MemberWriteProxy(
      unreachableOAuth as never,
      testApp.container.pdsService,
      'production',
    );
  }

  it('refuses to create a confidential collection on the OAuth path', async () => {
    await expect(
      productionProxy().writeRecord({
        memberDid: MEMBER,
        collection: CONFIDENTIAL,
        record: { amount: 5000 },
      }),
    ).rejects.toThrow(/Tier 2/);
  });

  it('refuses to update a confidential collection on the OAuth path', async () => {
    await expect(
      productionProxy().updateRecord({
        memberDid: MEMBER,
        collection: CONFIDENTIAL,
        rkey: 'abc',
        record: { amount: 5000 },
      }),
    ).rejects.toThrow(/Tier 2/);
  });

  it('guards both verbs on the PDS port', async () => {
    const calls: string[] = [];
    const fake = {
      createRecord: async () => {
        calls.push('create');
        return { uri: 'at://x', cid: 'y' };
      },
      putRecord: async () => {
        calls.push('put');
        return { uri: 'at://x', cid: 'y' };
      },
    } as unknown as IPdsService;
    const guarded = guardPublicWrites(fake);

    await expect(
      guarded.createRecord({ did: MEMBER, collection: CONFIDENTIAL, record: {} }),
    ).rejects.toThrow(/Tier 2/);
    await expect(
      guarded.putRecord({ did: MEMBER, collection: CONFIDENTIAL, rkey: 'a', record: {} }),
    ).rejects.toThrow(/Tier 2/);
    expect(calls).toEqual([]);

    await guarded.createRecord({ did: MEMBER, collection: PUBLISHABLE, record: {} });
    await guarded.putRecord({ did: MEMBER, collection: PUBLISHABLE, rkey: 'a', record: {} });
    expect(calls).toEqual(['create', 'put']);
  });

  it('leaves publishable collections alone', () => {
    expect(() => assertPublicWriteAllowed(PUBLISHABLE)).not.toThrow();
    expect(() => assertPublicWriteAllowed('network.coopsource.org.cooperative')).not.toThrow();
  });
});
