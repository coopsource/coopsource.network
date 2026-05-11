import type { DID, AtUri, CID } from '@coopsource/common';

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

export interface PulledRecord {
  readonly space: SpaceRef;
  readonly authorDid: DID;
  readonly collection: string;
  readonly rkey: string;
  readonly uri: AtUri;
  readonly cid: CID;
  readonly record: unknown;
  readonly rev: string;
  readonly commitSignature: string;
}

export interface ConsumerHealth {
  readonly subscribedSpaces: number;
  readonly lastPullAt: string | null;
  readonly recordsAccepted: number;
  readonly recordsRejected: number;
  readonly digestMismatches: number;
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
    public readonly kind: 'credential' | 'digest' | 'member-list' | 'protocol' | 'schema',
    message: string,
  ) {
    super(message);
    this.name = 'SpacesConsumerError';
  }
}
