import type { DID } from '@coopsource/common';
import {
  RawDidEquivalencePort,
  type DidEquivalencePort,
} from './did-equivalence-port.js';
import type { GroupDirectoryPort } from './group-directory-port.js';
import type {
  PermissionedRepoPort,
  PermissionedWatchHandle,
} from './permissioned-repo-port.js';
import {
  SpacesConsumerError,
  type ClockedOptions,
  type ConsumerHealth,
  type PermissionedChangeHint,
  type PublicRepoLifecycleEvent,
  type ResolvedMembers,
  type SpaceRef,
  type VerifiedPermissionedChanges,
  type VerifiedPermissionedRecord,
} from './types.js';

export interface RejectedPermissionedRecord {
  readonly record: VerifiedPermissionedRecord;
  readonly reason: 'not-member' | 'membership-indeterminate';
}

export interface SpacesConsumerOptions extends ClockedOptions {
  readonly groupDirectory: GroupDirectoryPort;
  readonly didEquivalence?: DidEquivalencePort;
  readonly permissionedRepo: PermissionedRepoPort;
  readonly onAccepted: (
    record: VerifiedPermissionedRecord,
  ) => Promise<void> | void;
  readonly onRejected?: (
    rejection: RejectedPermissionedRecord,
  ) => Promise<void> | void;
  readonly onError: (
    err: unknown,
    context: { space: SpaceRef; authorDid?: DID },
  ) => Promise<void> | void;
}

export class SpacesConsumer {
  private readonly didEquivalence: DidEquivalencePort;
  private readonly startedAt: string;
  private watchHandle: PermissionedWatchHandle | null = null;
  private readonly spaceQueues = new Map<string, Promise<void>>();
  private activeSpaces: ReadonlyArray<SpaceRef> = [];
  private subscribedSpaces = 0;
  private lastPullAt: string | null = null;
  private recordsAccepted = 0;
  private recordsRejected = 0;
  private verificationFailures = 0;
  private resyncsTriggered = 0;
  private memberCrossCheckFailures = 0;
  private errorCount = 0;

  constructor(private readonly opts: SpacesConsumerOptions) {
    this.didEquivalence = opts.didEquivalence ?? new RawDidEquivalencePort();
    this.startedAt = opts.clock().toISOString();
  }

  async start(spaces: ReadonlyArray<SpaceRef>): Promise<void> {
    this.watchHandle = await this.opts.permissionedRepo.watch({
      spaces,
      onChange: (hint) => this.enqueueChange(hint),
    });
    this.activeSpaces = [...spaces];
    this.subscribedSpaces = spaces.length;
  }

  async stop(): Promise<void> {
    await this.watchHandle?.close();
    await Promise.allSettled(this.spaceQueues.values());
    this.watchHandle = null;
    this.activeSpaces = [];
    this.subscribedSpaces = 0;
  }

  async handleRepoLifecycleEvent(
    event: PublicRepoLifecycleEvent,
  ): Promise<void> {
    await Promise.all(
      this.activeSpaces.map((space) =>
        this.enqueueChange(
          {
            space,
            repoDid: event.did,
            receivedAt: event.occurredAt,
            repoLifecycle: event,
          },
          true,
        ),
      ),
    );
  }

  private enqueueChange(
    hint: PermissionedChangeHint,
    propagateErrors = false,
  ): Promise<void> {
    const key = `${hint.space.arbiterDid}|${hint.space.spaceKey}|${hint.space.expectedSpaceType ?? ''}`;
    const prior = this.spaceQueues.get(key) ?? Promise.resolve();
    const queued = prior
      .catch(() => undefined)
      .then(() => this.handleChange(hint, propagateErrors));
    this.spaceQueues.set(key, queued);
    return queued.finally(() => {
      if (this.spaceQueues.get(key) === queued) {
        this.spaceQueues.delete(key);
      }
    });
  }

  health(): ConsumerHealth {
    return {
      subscribedSpaces: this.subscribedSpaces,
      lastPullAt: this.lastPullAt,
      recordsAccepted: this.recordsAccepted,
      recordsRejected: this.recordsRejected,
      verificationFailures: this.verificationFailures,
      resyncsTriggered: this.resyncsTriggered,
      memberCrossCheckFailures: this.memberCrossCheckFailures,
      errorCount: this.errorCount,
      startedAt: this.startedAt,
    };
  }

  private async handleChange(
    hint: PermissionedChangeHint,
    propagateErrors: boolean,
  ): Promise<void> {
    let changes: VerifiedPermissionedChanges;
    try {
      changes = await this.opts.permissionedRepo.sync({
        space: hint.space,
        hint,
      });
    } catch (err) {
      await this.recordError(err, { space: hint.space });
      if (propagateErrors) throw err;
      return;
    }

    this.lastPullAt = this.opts.clock().toISOString();

    if (changes.verification === 'failed-closed') {
      this.verificationFailures += 1;
      return;
    }

    if (changes.resynced || changes.verification === 'resynced') {
      this.resyncsTriggered += 1;
    }

    let canCommitCheckpoint = true;
    for (const record of changes.records) {
      const handled = await this.handleRecord(record, propagateErrors);
      if (!handled) canCommitCheckpoint = false;
    }

    if (changes.checkpoint && canCommitCheckpoint) {
      try {
        await this.opts.permissionedRepo.commitCheckpoint({
          space: changes.space,
          checkpoint: changes.checkpoint,
        });
      } catch (err) {
        await this.recordError(err, { space: changes.space });
        if (propagateErrors) throw err;
      }
    }
  }

  private async handleRecord(
    record: VerifiedPermissionedRecord,
    propagateErrors: boolean,
  ): Promise<boolean> {
    if (record.operation === 'delete') {
      // The authority inventory or a verified writer commit may remove records
      // after the author leaves the space. Applying the tombstone prevents
      // formerly authorized data from remaining projected indefinitely.
      try {
        await this.opts.onAccepted(record);
        this.recordsAccepted += 1;
        return true;
      } catch (err) {
        await this.recordError(err, {
          space: record.location.space,
          authorDid: record.location.authorDid,
        });
        if (propagateErrors) throw err;
        return false;
      }
    }

    let resolvedMembers: ResolvedMembers;
    try {
      resolvedMembers = await this.opts.groupDirectory.resolveSpaceMembers({
        ...record.location.space,
        consistency: 'strict',
      });
    } catch (err) {
      this.recordsRejected += 1;
      this.memberCrossCheckFailures += 1;
      await this.recordError(err, {
        space: record.location.space,
        authorDid: record.location.authorDid,
      });
      if (propagateErrors) throw err;
      return false;
    }

    if (
      !resolvedMembers.ok ||
      resolvedMembers.partial ||
      resolvedMembers.stale ||
      resolvedMembers.missingSpaces.length > 0
    ) {
      this.recordsRejected += 1;
      this.memberCrossCheckFailures += 1;
      const error = new SpacesConsumerError(
        'member-list',
        'strict resolved membership was indeterminate',
      );
      await this.recordError(error, {
        space: record.location.space,
        authorDid: record.location.authorDid,
      });
      if (propagateErrors) throw error;
      return false;
    }

    let isMember = false;
    try {
      for (const member of resolvedMembers.members) {
        if (
          await this.didEquivalence.areEquivalent(
            member.did,
            record.location.authorDid,
          )
        ) {
          isMember = true;
          break;
        }
      }
    } catch (err) {
      this.recordsRejected += 1;
      this.memberCrossCheckFailures += 1;
      await this.recordError(err, {
        space: record.location.space,
        authorDid: record.location.authorDid,
      });
      if (propagateErrors) throw err;
      return false;
    }

    if (!isMember) {
      // A record authored by a non-member is an EXPECTED, successful cross-check
      // outcome (the trust anchor discards non-member records), not a failure.
      // memberCrossCheckFailures counts only indeterminate resolution / errors
      // above, so health checks keyed on it are not tripped by routine traffic.
      this.recordsRejected += 1;
      try {
        await this.opts.onRejected?.({ record, reason: 'not-member' });
        return true;
      } catch (err) {
        await this.recordError(err, {
          space: record.location.space,
          authorDid: record.location.authorDid,
        });
        if (propagateErrors) throw err;
        return false;
      }
    }

    try {
      await this.opts.onAccepted(record);
      this.recordsAccepted += 1;
      return true;
    } catch (err) {
      await this.recordError(err, {
        space: record.location.space,
        authorDid: record.location.authorDid,
      });
      if (propagateErrors) throw err;
      return false;
    }
  }

  private async recordError(
    err: unknown,
    context: { space: SpaceRef; authorDid?: DID },
  ): Promise<void> {
    this.errorCount += 1;
    await this.opts.onError(err, context);
  }
}
