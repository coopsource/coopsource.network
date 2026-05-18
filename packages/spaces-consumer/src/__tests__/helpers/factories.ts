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

export function buildVerifiedRecord(
  overrides: {
    space: SpaceRef;
    authorDid: DID;
    rkey?: string;
    sourceRevision?: string;
  } & Partial<VerifiedPermissionedRecord>,
): VerifiedPermissionedRecord {
  const sourceRevision = overrides.sourceRevision ?? '1';
  const rkey = overrides.rkey ?? overrides.location?.rkey ?? 'rk';
  return {
    location: overrides.location ?? {
      space: overrides.space,
      authorDid: overrides.authorDid,
      collection: 'network.coopsource.governance.vote',
      rkey,
    },
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
    ...buildVerifiedRecord({ ...overrides, sourceRevision }),
    sourceRevision,
    commitSignature: overrides.commitSignature ?? 'sig',
  };
}
