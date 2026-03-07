import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DID, AtUri, CID } from '@coopsource/common';
import type { IPdsService, RecordRef } from '@coopsource/federation';
import { MemberWriteProxy } from '../src/services/member-write-proxy.js';

function mockPdsService(): IPdsService {
  return {
    createDid: vi.fn(),
    resolveDid: vi.fn(),
    updateDidDocument: vi.fn(),
    createRecord: vi.fn().mockResolvedValue({
      uri: 'at://did:plc:test/network.coopsource.org.membership/abc' as AtUri,
      cid: 'bafytest' as CID,
    } satisfies RecordRef),
    putRecord: vi.fn(),
    deleteRecord: vi.fn(),
    getRecord: vi.fn(),
    listRecords: vi.fn(),
    subscribeRepos: vi.fn(),
  };
}

const testDid = 'did:plc:member123' as DID;
const testParams = {
  memberDid: testDid,
  collection: 'network.coopsource.org.membership',
  record: { cooperative: 'did:plc:coop1', createdAt: '2026-01-01T00:00:00Z' },
};

describe('MemberWriteProxy', () => {
  let pdsService: IPdsService;

  beforeEach(() => {
    pdsService = mockPdsService();
    vi.restoreAllMocks();
  });

  describe('dev/test mode (no OAuth client)', () => {
    it('should warn and fallback to pdsService when oauthClient is undefined', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const proxy = new MemberWriteProxy(undefined, pdsService, 'development');

      const result = await proxy.writeRecord(testParams);

      expect(result.uri).toBe('at://did:plc:test/network.coopsource.org.membership/abc');
      expect(pdsService.createRecord).toHaveBeenCalledWith({
        did: testDid,
        collection: testParams.collection,
        record: testParams.record,
        rkey: undefined,
      });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('No OAuth client configured'),
      );
    });

    it('should warn and fallback when oauthClient.restore() throws', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const mockClient = {
        restore: vi.fn().mockRejectedValue(new Error('No active session for did')),
      };
      const proxy = new MemberWriteProxy(
        mockClient as unknown as import('@atproto/oauth-client-node').NodeOAuthClient,
        pdsService,
        'test',
      );

      const result = await proxy.writeRecord(testParams);

      expect(result.uri).toBeTruthy();
      expect(pdsService.createRecord).toHaveBeenCalledOnce();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('No OAuth session for did:plc:member123'),
      );
    });

    it('should also fallback in test mode', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const proxy = new MemberWriteProxy(undefined, pdsService, 'test');

      const result = await proxy.writeRecord(testParams);

      expect(result.uri).toBeTruthy();
      expect(pdsService.createRecord).toHaveBeenCalledOnce();
    });
  });

  describe('production mode (no OAuth = error)', () => {
    it('should throw when oauthClient is undefined in production', async () => {
      const proxy = new MemberWriteProxy(undefined, pdsService, 'production');

      await expect(proxy.writeRecord(testParams)).rejects.toThrow(
        'Cannot write member-owned record in production',
      );
      expect(pdsService.createRecord).not.toHaveBeenCalled();
    });

    it('should throw when oauthClient.restore() fails in production', async () => {
      const mockClient = {
        restore: vi.fn().mockRejectedValue(new Error('No active session for did')),
      };
      const proxy = new MemberWriteProxy(
        mockClient as unknown as import('@atproto/oauth-client-node').NodeOAuthClient,
        pdsService,
        'production',
      );

      await expect(proxy.writeRecord(testParams)).rejects.toThrow(
        'Cannot write member-owned record in production',
      );
      expect(pdsService.createRecord).not.toHaveBeenCalled();
    });
  });

  describe('V5 OAuth path', () => {
    it('should attempt OAuth write and not fall back to pdsService', async () => {
      // When restore() succeeds, the proxy uses the Agent (XRPC) path.
      // We can't easily mock the full XRPC pipeline in unit tests,
      // but we can verify that pdsService is NOT called, proving the
      // OAuth path was taken. The XRPC call itself will fail with a
      // network/validation error since we're mocking at the fetch level.
      const mockFetchHandler = vi.fn().mockResolvedValue(
        new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
      );
      const mockSession = {
        fetchHandler: mockFetchHandler,
        did: testDid,
      };
      const mockClient = {
        restore: vi.fn().mockResolvedValue(mockSession),
      };
      const proxy = new MemberWriteProxy(
        mockClient as unknown as import('@atproto/oauth-client-node').NodeOAuthClient,
        pdsService,
        'production',
      );

      // The XRPC call will fail due to lexicon validation on the mock response,
      // but the important thing is that pdsService was NOT called (no fallback).
      try {
        await proxy.writeRecord(testParams);
      } catch {
        // Expected: XRPC validation error from mock response
      }

      expect(pdsService.createRecord).not.toHaveBeenCalled();
      expect(mockClient.restore).toHaveBeenCalledWith(testDid);
      expect(mockFetchHandler).toHaveBeenCalledOnce();
    });
  });

  describe('DID verification', () => {
    it('should throw on DID mismatch between session and requested member', async () => {
      const mockSession = {
        fetchHandler: vi.fn(),
        did: 'did:plc:different-user',
      };
      const mockClient = {
        restore: vi.fn().mockResolvedValue(mockSession),
      };
      const proxy = new MemberWriteProxy(
        mockClient as unknown as import('@atproto/oauth-client-node').NodeOAuthClient,
        pdsService,
        'production',
      );

      await expect(proxy.writeRecord(testParams)).rejects.toThrow(
        'OAuth session DID mismatch',
      );
      expect(pdsService.createRecord).not.toHaveBeenCalled();
    });
  });

  describe('updateRecord', () => {
    it('should fallback to pdsService.putRecord in dev mode', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const proxy = new MemberWriteProxy(undefined, pdsService, 'development');
      (pdsService.putRecord as ReturnType<typeof vi.fn>).mockResolvedValue({
        uri: 'at://did:plc:test/network.coopsource.alignment.interest/abc' as AtUri,
        cid: 'bafytest' as CID,
      });

      const result = await proxy.updateRecord({
        memberDid: testDid,
        collection: 'network.coopsource.alignment.interest',
        rkey: 'abc',
        record: { name: 'updated' },
      });

      expect(result.uri).toBeTruthy();
      expect(pdsService.putRecord).toHaveBeenCalledWith({
        did: testDid,
        collection: 'network.coopsource.alignment.interest',
        rkey: 'abc',
        record: { name: 'updated' },
      });
    });

    it('should throw in production when no OAuth session', async () => {
      const proxy = new MemberWriteProxy(undefined, pdsService, 'production');

      await expect(
        proxy.updateRecord({
          memberDid: testDid,
          collection: 'network.coopsource.alignment.interest',
          rkey: 'abc',
          record: { name: 'updated' },
        }),
      ).rejects.toThrow('Cannot update member-owned record in production');
    });
  });

  describe('error propagation', () => {
    it('should propagate XRPC errors (not treat as session error)', async () => {
      const mockSession = {
        fetchHandler: vi.fn().mockRejectedValue(new Error('XRPC call failed: 500')),
        did: testDid,
      };
      const mockClient = {
        restore: vi.fn().mockResolvedValue(mockSession),
      };
      const proxy = new MemberWriteProxy(
        mockClient as unknown as import('@atproto/oauth-client-node').NodeOAuthClient,
        pdsService,
        'development',
      );

      await expect(proxy.writeRecord(testParams)).rejects.toThrow(
        'XRPC call failed',
      );
      expect(pdsService.createRecord).not.toHaveBeenCalled();
    });
  });
});
