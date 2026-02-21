import { describe, it, expect, vi } from 'vitest';
import {
  createRecord,
  getRecord,
  deleteRecord,
  listRecords,
} from '../src/lib/pds-client.js';

function createMockAgent(did = 'did:plc:test123') {
  return {
    assertDid: did,
    com: {
      atproto: {
        repo: {
          createRecord: vi.fn(),
          getRecord: vi.fn(),
          deleteRecord: vi.fn(),
          listRecords: vi.fn(),
        },
      },
    },
  };
}

describe('pds-client', () => {
  describe('createRecord', () => {
    it('should call createRecord with correct params', async () => {
      const agent = createMockAgent();
      agent.com.atproto.repo.createRecord.mockResolvedValue({
        data: { uri: 'at://did:plc:test/collection/rkey', cid: 'bafytest' },
      });

      const record = { $type: 'network.coopsource.org.project', name: 'Test' };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await createRecord(agent as any, 'network.coopsource.org.project', record);

      expect(agent.com.atproto.repo.createRecord).toHaveBeenCalledWith({
        repo: 'did:plc:test123',
        collection: 'network.coopsource.org.project',
        record,
      });
      expect(result).toEqual({
        uri: 'at://did:plc:test/collection/rkey',
        cid: 'bafytest',
      });
    });
  });

  describe('getRecord', () => {
    it('should call getRecord with correct params', async () => {
      const agent = createMockAgent();
      agent.com.atproto.repo.getRecord.mockResolvedValue({
        data: {
          uri: 'at://did:plc:test/collection/rkey',
          cid: 'bafytest',
          value: { name: 'Test Project' },
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await getRecord(agent as any, 'did:plc:test', 'network.coopsource.org.project', 'rkey');

      expect(agent.com.atproto.repo.getRecord).toHaveBeenCalledWith({
        repo: 'did:plc:test',
        collection: 'network.coopsource.org.project',
        rkey: 'rkey',
      });
      expect(result.value).toEqual({ name: 'Test Project' });
    });
  });

  describe('deleteRecord', () => {
    it('should call deleteRecord with correct params', async () => {
      const agent = createMockAgent();
      agent.com.atproto.repo.deleteRecord.mockResolvedValue({});

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await deleteRecord(agent as any, 'did:plc:test', 'network.coopsource.org.project', 'rkey');

      expect(agent.com.atproto.repo.deleteRecord).toHaveBeenCalledWith({
        repo: 'did:plc:test',
        collection: 'network.coopsource.org.project',
        rkey: 'rkey',
      });
    });
  });

  describe('listRecords', () => {
    it('should call listRecords with correct params', async () => {
      const agent = createMockAgent();
      agent.com.atproto.repo.listRecords.mockResolvedValue({
        data: {
          records: [
            { uri: 'at://did:plc:test/collection/1', cid: 'bafytest1', value: { name: 'A' } },
            { uri: 'at://did:plc:test/collection/2', cid: 'bafytest2', value: { name: 'B' } },
          ],
          cursor: 'cursor123',
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await listRecords(agent as any, 'did:plc:test', 'network.coopsource.org.project', {
        limit: 10,
      });

      expect(agent.com.atproto.repo.listRecords).toHaveBeenCalledWith({
        repo: 'did:plc:test',
        collection: 'network.coopsource.org.project',
        limit: 10,
      });
      expect(result.records).toHaveLength(2);
      expect(result.cursor).toBe('cursor123');
    });

    it('should work without options', async () => {
      const agent = createMockAgent();
      agent.com.atproto.repo.listRecords.mockResolvedValue({
        data: { records: [], cursor: undefined },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await listRecords(agent as any, 'did:plc:test', 'network.coopsource.org.project');

      expect(agent.com.atproto.repo.listRecords).toHaveBeenCalledWith({
        repo: 'did:plc:test',
        collection: 'network.coopsource.org.project',
      });
      expect(result.records).toHaveLength(0);
    });
  });
});
