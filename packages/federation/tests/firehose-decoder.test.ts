import { describe, it, expect } from 'vitest';
import { encode as cborEncode } from 'cborg';
import { decodeFirehoseMessage } from '../src/atproto/firehose-decoder.js';

describe('firehose-decoder', () => {
  it('should return empty array for error frames', () => {
    const data = concatCbor({ op: -1, t: '#error' }, { error: 'test' });
    const events = decodeFirehoseMessage(data);
    expect(events).toEqual([]);
  });

  it('should return empty array for non-commit frames', () => {
    const data = concatCbor(
      { op: 1, t: '#identity' },
      { seq: 1, did: 'did:plc:test' },
    );
    const events = decodeFirehoseMessage(data);
    expect(events).toEqual([]);
  });

  it('should decode a commit frame with ops', () => {
    const header = { op: 1, t: '#commit' };
    const body = {
      seq: 42,
      repo: 'did:plc:abc123',
      commit: { '/': 'bafycommit' },
      rev: 'rev1',
      since: null,
      blocks: new Uint8Array(0),
      ops: [
        {
          action: 'create',
          path: 'network.coopsource.test/rkey1',
          cid: { '/': 'bafyrecord1' },
        },
        {
          action: 'delete',
          path: 'network.coopsource.test/rkey2',
          cid: null,
        },
      ],
      time: '2026-01-01T00:00:00Z',
      tooBig: false,
    };
    const data = concatCbor(header, body);
    const events = decodeFirehoseMessage(data);

    expect(events).toHaveLength(2);

    expect(events[0]).toMatchObject({
      seq: 42,
      did: 'did:plc:abc123',
      operation: 'create',
      uri: 'at://did:plc:abc123/network.coopsource.test/rkey1',
      cid: 'bafyrecord1',
      time: '2026-01-01T00:00:00Z',
    });

    expect(events[1]).toMatchObject({
      seq: 42,
      operation: 'delete',
      uri: 'at://did:plc:abc123/network.coopsource.test/rkey2',
      cid: '',
    });
  });

  it('should handle commit with update action', () => {
    const data = concatCbor(
      { op: 1, t: '#commit' },
      {
        seq: 100,
        repo: 'did:plc:xyz',
        commit: { '/': 'bafycommit2' },
        rev: 'rev2',
        since: 'rev1',
        blocks: new Uint8Array(0),
        ops: [
          {
            action: 'update',
            path: 'network.coopsource.org.membership/rkey1',
            cid: { '/': 'bafyupdated' },
          },
        ],
        time: '2026-02-01T00:00:00Z',
        tooBig: false,
      },
    );
    const events = decodeFirehoseMessage(data);

    expect(events).toHaveLength(1);
    expect(events[0]!.operation).toBe('update');
    expect(events[0]!.cid).toBe('bafyupdated');
  });
});

/** Helper: concatenate two CBOR-encoded values into one Uint8Array */
function concatCbor(a: unknown, b: unknown): Uint8Array {
  const aBuf = cborEncode(a);
  const bBuf = cborEncode(b);
  const result = new Uint8Array(aBuf.length + bBuf.length);
  result.set(new Uint8Array(aBuf), 0);
  result.set(new Uint8Array(bBuf), aBuf.length);
  return result;
}
