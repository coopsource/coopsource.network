import type { ArbiterMemberList } from './arbiter-member-list.js';
import type { EcmhVerifier } from './ecmh-verifier.js';
import type { NotificationSubscriber } from './notification-subscriber.js';
import type { RepoPuller } from './repo-puller.js';
import { spaceRefKey, type ConsumerHealth, type PulledRecord, type SpaceNotification, type SpaceRef } from './types.js';

/**
 * Persistence interface for per-(space, member) pull cursors.
 * Key format: `${spaceRefKey(space)}|${memberDid}`.
 * Returns '' (empty string) when no cursor has been stored yet.
 */
export interface CursorStore {
  get(key: string): Promise<string>;
  set(key: string, value: string): Promise<void>;
}

export interface SpacesConsumerOptions {
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
  readonly clock: () => Date;
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
    let currentMember: string | undefined;
    try {
      const members = await this.opts.memberList.list(n.space);
      for (const memberDid of members) {
        currentMember = memberDid;
        const cursorKey = `${spaceRefKey(n.space)}|${memberDid}`;
        const since = await this.opts.cursors.get(cursorKey);
        const pulled = await this.opts.puller.pull({ space: n.space, memberDid, since });
        if (pulled.length === 0) continue;

        // expectedDigest is upstream-dependent. When the notification protocol
        // settles, the digest will arrive on the notification itself. Until
        // then the verifier interface is in place but the wired default
        // (FailClosed) refuses anyway, so the placeholder is safe.
        const digestResult = await this.opts.verifier.verify({
          records: pulled,
          expectedDigest: n.since,
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
          if (r.rev > maxRev) maxRev = r.rev;
        }
        if (maxRev !== since) await this.opts.cursors.set(cursorKey, maxRev);
      }
      this.lastPullAt = this.opts.clock().toISOString();
    } catch (err) {
      this.errorCount += 1;
      await this.opts.onError(err, { space: n.space, memberDid: currentMember });
    }
  }
}
