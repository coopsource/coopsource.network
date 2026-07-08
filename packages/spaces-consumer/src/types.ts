import type { DID, CID } from '@coopsource/common';

type Brand<T, B extends string> = T & { readonly __brand: B };

/**
 * Per ARCHITECTURE-V12.md §11, SpaceRef is the load-bearing substrate,
 * independent of URI-scheme decisions. Upstream proposal 0016 settled on
 * `at://…/space/…` (see space-uri.ts), but the scheme is still marked likely
 * to change, so SpaceRef carries identity, not a URI.
 *
 * `arbiterDid` is the proposal's *space authority* DID; we keep the arbiter
 * naming because CSN still treats this as the higher-level group-authority
 * boundary, even when an adapter maps it to current `com.atproto.space.*`
 * endpoints.
 */
export interface SpaceRef {
  readonly arbiterDid: DID;
  readonly spaceKey: string;
  readonly expectedSpaceType?: string;
}

export function spaceRefKey(ref: SpaceRef): string {
  return `${ref.arbiterDid}|${ref.spaceKey}|${ref.expectedSpaceType ?? ''}`;
}

export type UnknownLexiconObject = Record<string, unknown>;

export type SpaceMemberRef =
  | {
      readonly kind: 'did';
      readonly did: DID;
    }
  | {
      readonly kind: 'localSpace';
      readonly spaceKey: string;
      readonly expectedSpaceType?: string;
    }
  | {
      readonly kind: 'remoteSpace';
      readonly arbiterDid: DID;
      readonly spaceKey: string;
      readonly expectedSpaceType?: string;
    };

export interface DirectSpaceMember {
  readonly member: SpaceMemberRef;
  readonly access?: UnknownLexiconObject;
  readonly source?: UnknownLexiconObject;
}

export interface ResolvedSpaceMember {
  readonly did: DID;
  readonly via: ReadonlyArray<SpaceRef>;
  readonly directMember: SpaceMemberRef;
  readonly access?: UnknownLexiconObject;
  readonly resolverDepth: number;
}

export interface MissingSpace {
  readonly space: SpaceRef;
  readonly reason: 'not-found' | 'unavailable' | 'invalid-space' | 'depth-limit' | 'cycle';
}

export interface ResolvedMembers {
  readonly ok: boolean;
  readonly directMembers: ReadonlyArray<DirectSpaceMember>;
  readonly members: ReadonlyArray<ResolvedSpaceMember>;
  readonly missingSpaces: ReadonlyArray<MissingSpace>;
  readonly partial: boolean;
  readonly stale: boolean;
  readonly resolverDepth: number;
  readonly snapshotId?: MembershipSnapshotId;
  readonly sourceRevision?: string;
}

export interface SpaceNotification {
  readonly space: SpaceRef;
  readonly since: string; // cursor/rev — upstream-protocol-dependent
  /**
   * Expected set-hash digest over the records the notification is announcing.
   * Upstream (proposal 0016) uses LtHash; kept algorithm-agnostic here and
   * verified behind the repo port. Provided by the real notification protocol
   * (Stage 2+); undefined in Stage 1 sketches — the fail-closed path rejects
   * regardless of digest input.
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
 * Distinct from the V11 5-axis authorization model (CLAUDE.md / ARCHITECTURE-V12.md §3).
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
