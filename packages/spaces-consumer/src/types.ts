import type { DID, CID } from '@coopsource/common';

type Brand<T, B extends string> = T & { readonly __brand: B };

/**
 * Per ARCHITECTURE-V11.md §17.3, SpaceRef is the load-bearing substrate.
 * Independent of URI scheme decisions (ats:// vs at:// is not yet finalized upstream).
 */
export interface SpaceRef {
  readonly arbiter: DID;
  readonly type: string;
  readonly skey: string;
}

export function spaceRefKey(ref: SpaceRef): string {
  return `${ref.arbiter}|${ref.type}|${ref.skey}`;
}

export interface SpaceNotification {
  readonly space: SpaceRef;
  readonly since: string; // cursor/rev — upstream-protocol-dependent
  /**
   * Expected ECMH digest over the records that the notification is announcing.
   * Provided by the real notification protocol (Stage 2+). Undefined in Stage 1
   * sketches — the fail-closed verifier rejects regardless of digest input.
   */
  readonly digest?: string;
  readonly receivedAt: Date;
}

/**
 * Options shared by all in-memory sketch implementations in this package.
 * Lets tests inject a deterministic clock; production wiring uses `() => new Date()`.
 */
export interface ClockedOptions {
  clock: () => Date;
}

export type PermissionedCheckpoint = Brand<string, 'PermissionedCheckpoint'>;
export type PermissionedCursor = Brand<string, 'PermissionedCursor'>;
export type MembershipCursor = Brand<string, 'MembershipCursor'>;
export type MembershipSnapshotId = Brand<string, 'MembershipSnapshotId'>;

export interface PermissionedRecordLocation {
  readonly space: SpaceRef;
  readonly authorDid: DID;
  readonly collection: string;
  readonly rkey: string;
}

export interface VerifiedPermissionedRecord {
  readonly location: PermissionedRecordLocation;
  readonly cid: CID;
  readonly record: unknown;
  readonly sourceRevision?: string;
}

/**
 * Internal Stage 1 sketch record. Stable application code should depend on
 * VerifiedPermissionedRecord and PermissionedRecordLocation instead.
 *
 * @internal
 */
export interface PulledRecord extends VerifiedPermissionedRecord {
  readonly sourceRevision: string;
  readonly commitSignature: string;
}

export type PermissionedVerificationStatus =
  | 'verified'
  | 'resynced'
  | 'failed-closed'
  | 'unverified-dev-mode';

export interface PermissionedChangeHint {
  readonly space: SpaceRef;
  readonly receivedAt?: Date;
  readonly sourceRevision?: string;
  readonly checkpointHint?: PermissionedCheckpoint;
}

export interface VerifiedPermissionedChanges {
  readonly space: SpaceRef;
  readonly records: ReadonlyArray<VerifiedPermissionedRecord>;
  readonly verification: PermissionedVerificationStatus;
  readonly checkpoint?: PermissionedCheckpoint;
  readonly sourceRevision?: string;
  readonly resynced?: boolean;
}

export interface ConsumerHealth {
  readonly subscribedSpaces: number;
  readonly lastPullAt: string | null;
  readonly recordsAccepted: number;
  readonly recordsRejected: number;
  readonly verificationFailures: number;
  readonly resyncsTriggered: number;
  readonly memberCrossCheckFailures: number;
  readonly errorCount: number;
  readonly startedAt: string;
}

/**
 * Internal error taxonomy for the spaces consumer.
 * Distinct from the V11 5-axis authorization model (CLAUDE.md / ARCHITECTURE-V11.md §3).
 */
export class SpacesConsumerError extends Error {
  constructor(
    public readonly kind: 'credential' | 'verification' | 'member-list' | 'protocol' | 'schema',
    message: string,
  ) {
    super(message);
    this.name = 'SpacesConsumerError';
  }
}
