import type { AtUri, CID, DID } from '@coopsource/common';
import type { PulledRecord, SpaceRef } from '../../types.js';

/**
 * Test-only branded-type constructors. Contained casts so production code
 * never carries `as unknown as T`. If @coopsource/common later exposes safe
 * test constructors, replace these and delete the file.
 */
export const fakeUri = (s: string) => s as unknown as AtUri;
export const fakeCid = (s: string) => s as unknown as CID;
export const fakeDid = (s: string) => s as unknown as DID;

export function buildPulledRecord(
  overrides: { space: SpaceRef; authorDid: DID; rev: string } & Partial<PulledRecord>,
): PulledRecord {
  // Note: `uri` and `rkey` are independent fields. If you pass `uri` explicitly,
  // also pass `rkey` — they are not derived from each other after construction.
  return {
    space: overrides.space,
    authorDid: overrides.authorDid,
    collection: overrides.collection ?? 'network.coopsource.governance.vote',
    rkey: overrides.rkey ?? 'rk',
    uri: overrides.uri ?? fakeUri(`at://${overrides.authorDid}/network.coopsource.governance.vote/${overrides.rkey ?? 'rk'}`),
    cid: overrides.cid ?? fakeCid(`cid-${overrides.rev}`),
    record: overrides.record ?? {},
    rev: overrides.rev,
    commitSignature: overrides.commitSignature ?? 'sig',
  };
}
