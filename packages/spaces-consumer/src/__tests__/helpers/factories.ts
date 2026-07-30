import type { CID, DID } from '@coopsource/common';
import type {
  PermissionedCheckpoint,
  PulledRecord,
  SpaceRef,
  VerifiedPermissionedRecord,
} from '../../types.js';

export const fakeCid = (s: string) => s as unknown as CID;
export const fakeDid = (s: string) => s as unknown as DID;
export const fakeCheckpoint = (s: string) => s as unknown as PermissionedCheckpoint;

export function buildVerifiedRecord(overrides: {
  space: SpaceRef;
  authorDid: DID;
  rkey?: string;
  sourceRevision?: string;
  operation?: VerifiedPermissionedRecord['operation'];
  location?: VerifiedPermissionedRecord['location'];
  cid?: CID;
  record?: unknown;
  previousCid?: CID;
}): VerifiedPermissionedRecord {
  const sourceRevision = overrides.sourceRevision ?? '1';
  const rkey = overrides.rkey ?? overrides.location?.rkey ?? 'rk';
  const location = overrides.location ?? {
    space: overrides.space,
    authorDid: overrides.authorDid,
    collection: 'network.coopsource.governance.vote',
    rkey,
  };
  if (overrides.operation === 'delete') {
    return {
      operation: 'delete',
      location,
      ...(overrides.previousCid ? { previousCid: overrides.previousCid } : {}),
      sourceRevision,
    };
  }
  return {
    operation: overrides.operation ?? 'create',
    location,
    cid: overrides.cid ?? fakeCid(`cid-${sourceRevision}`),
    record: overrides.record ?? {},
    sourceRevision,
  };
}

export function buildPulledRecord(
  overrides: {
    space: SpaceRef;
    authorDid: DID;
    rkey?: string;
    rev?: string;
    sourceRevision?: string;
  } & Partial<PulledRecord>,
): PulledRecord {
  const sourceRevision = overrides.sourceRevision ?? overrides.rev ?? '1';
  return {
    operation: overrides.operation ?? 'create',
    location: overrides.location ?? {
      space: overrides.space,
      authorDid: overrides.authorDid,
      collection: 'network.coopsource.governance.vote',
      rkey: overrides.rkey ?? 'rk',
    },
    cid: overrides.cid ?? fakeCid(`cid-${sourceRevision}`),
    record: overrides.record ?? {},
    sourceRevision,
    commitSignature: overrides.commitSignature ?? 'sig',
  };
}
