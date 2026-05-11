import type { DID } from '@coopsource/common';
import type { ArbiterMemberList } from './arbiter-member-list.js';
import type { CursorStore } from './cursor-store.js';
import type { EcmhVerifier } from './ecmh-verifier.js';
import type { NotificationSubscriber } from './notification-subscriber.js';
import type { RepoPuller } from './repo-puller.js';
import { type ClockedOptions, type ConsumerHealth, type PulledRecord, type SpaceNotification, type SpaceRef } from './types.js';

export type { CursorStore } from './cursor-store.js';

export interface SpacesConsumerOptions extends ClockedOptions {
  readonly subscriber: NotificationSubscriber;
  readonly memberList: ArbiterMemberList;
  readonly puller: RepoPuller;
  readonly verifier: EcmhVerifier;
  readonly cursors: CursorStore;
  readonly onAccepted: (r: PulledRecord) => Promise<void> | void;
  /**
   * Called on any thrown error during notification handling. The consumer
   * never silently swallows errors; this callback is the one path out.
   * Implementations should log at warn+ and continue. The consumer's own
   * errorCount metric increments before this callback fires.
   */
  readonly onError: (err: unknown, context: { space: SpaceRef; memberDid?: string }) => Promise<void> | void;
  // clock is inherited from ClockedOptions
}

/**
 * The pull-based spaces consumer. On each notification, walks the arbiter's
 * authoritative member list for the space, pulls records per member since the
 * cursor, verifies the batch digest, cross-checks each record's author DID
 * against the member list (defense in depth — protects against a compromised
 * member PDS returning forged records), and emits accepted records to
 * onAccepted. Cursors advance only after successful acceptance.
 *
 * Security boundaries:
 *   - Verifier failure -> skip the batch, increment digestMismatches.
 *   - Author not on member list -> drop the record, increment
 *     memberCrossCheckFailures + recordsRejected.
 *   - Any throw -> caught, onError called, errorCount incremented.
 *
 * Stage 1 is sketch-only — wiring (Task 11) defaults to fail-closed sketches
 * for memberList and verifier, so the consumer never accepts real data in
 * Stage 1.
 */
export class SpacesConsumer {
  private readonly startedAt: string;
  private subscribedSpaces = 0;
  private lastPullAt: string | null = null;
  private recordsAccepted = 0;
  private recordsRejected = 0;
  private digestMismatches = 0;
  private memberCrossCheckFailures = 0;
  private errorCount = 0;

  constructor(private readonly opts: SpacesConsumerOptions) {
    this.startedAt = opts.clock().toISOString();
  }

  async start(spaces: ReadonlyArray<SpaceRef>): Promise<void> {
    for (const space of spaces) {
      await this.opts.subscriber.subscribe(space, (n) => this.handleNotification(n));
      this.subscribedSpaces += 1;
    }
  }

  health(): ConsumerHealth {
    return {
      subscribedSpaces: this.subscribedSpaces,
      lastPullAt: this.lastPullAt,
      recordsAccepted: this.recordsAccepted,
      recordsRejected: this.recordsRejected,
      digestMismatches: this.digestMismatches,
      memberCrossCheckFailures: this.memberCrossCheckFailures,
      errorCount: this.errorCount,
      startedAt: this.startedAt,
    };
  }

  private async handleNotification(n: SpaceNotification): Promise<void> {
    let members: ReadonlyArray<DID>;
    try {
      members = await this.opts.memberList.list(n.space);
    } catch (err) {
      this.errorCount += 1;
      await this.opts.onError(err, { space: n.space });
      return;
    }

    for (const memberDid of members) {
      try {
        const since = await this.opts.cursors.get(n.space, memberDid);
        const pulled = await this.opts.puller.pull({ space: n.space, memberDid, since });
        if (pulled.length === 0) continue;

        // See SpaceNotification.digest for why this is n.digest ?? ''.
        const digestResult = await this.opts.verifier.verify({
          records: pulled,
          expectedDigest: n.digest ?? '',
        });
        if (!digestResult.ok) {
          this.digestMismatches += 1;
          continue;
        }

        let maxRev = since;
        for (const r of pulled) {
          // Defense-in-depth: even though we iterated by member-list, verify
          // each record's claimed authorDid against the live member list. A
          // compromised member PDS could return records authored by a
          // non-member; the cross-check is the load-bearing security boundary.
          const isMember = await this.opts.memberList.isMember(n.space, r.authorDid);
          if (!isMember) {
            this.memberCrossCheckFailures += 1;
            this.recordsRejected += 1;
            continue;
          }
          await this.opts.onAccepted(r);
          this.recordsAccepted += 1;
          // String comparison: revs are TID-format and lex-ordered (see repo-puller.ts).
          if (r.rev > maxRev) maxRev = r.rev;
        }
        // Intentional: a batch of all-rejected records does not advance the cursor.
        // The rejections might be transient (member-list inconsistency during pull); the next
        // notification re-evaluates.
        if (maxRev !== since) await this.opts.cursors.set(n.space, memberDid, maxRev);
      } catch (err) {
        this.errorCount += 1;
        await this.opts.onError(err, { space: n.space, memberDid });
        // continue to next member
      }
    }
    this.lastPullAt = this.opts.clock().toISOString();
  }
}
