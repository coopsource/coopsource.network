import type { FirehoseEvent } from '@coopsource/federation';
import type { DID, AtUri, CID } from '@coopsource/common';

/**
 * Create a minimal FirehoseEvent for testing.
 *
 * Defaults: seq 1, did `did:plc:test`, rkey `rkey1`, cid `bafytest`.
 */
export function makeEvent(
  collection: string,
  operation: 'create' | 'update' | 'delete' = 'create',
  record?: Record<string, unknown>,
  overrides?: Partial<Omit<FirehoseEvent, 'operation'>>,
): FirehoseEvent {
  const did = (overrides?.did ?? 'did:plc:test') as DID;
  const rkey = overrides?.uri
    ? overrides.uri.split('/').pop() ?? 'rkey1'
    : 'rkey1';

  return {
    seq: overrides?.seq ?? 1,
    did,
    operation,
    uri: (overrides?.uri ?? `at://${did}/${collection}/${rkey}`) as AtUri,
    cid: (overrides?.cid ?? 'bafytest') as CID,
    record: record ?? { $type: collection },
    time: overrides?.time ?? '2026-01-01T00:00:00Z',
  };
}
