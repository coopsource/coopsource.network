import type { DID } from '@coopsource/common';
import type { GroupDirectoryPort } from './group-directory-port.js';
import type { PermissionedRepoPort, PermissionedWatchHandle } from './permissioned-repo-port.js';
import {
  SpacesConsumerError,
  type ClockedOptions,
  type ConsumerHealth,
  type PermissionedChangeHint,
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
  readonly permissionedRepo: PermissionedRepoPort;
  readonly onAccepted: (record: VerifiedPermissionedRecord) => Promise<void> | void;
  readonly onRejected?: (rejection: RejectedPermissionedRecord) => Promise<void> | void;
  readonly onError: (err: unknown, context: { space: SpaceRef; authorDid?: DID }) => Promise<void> | void;
}

export class SpacesConsumer {
  private readonly startedAt: string;
  private watchHandle: PermissionedWatchHandle | null = null;
  private subscribedSpaces = 0;
  private lastPullAt: string | null = null;
  private recordsAccepted = 0;
  private recordsRejected = 0;
  private verificationFailures = 0;
  private resyncsTriggered = 0;
  private memberCrossCheckFailures = 0;
  private errorCount = 0;

  constructor(private readonly opts: SpacesConsumerOptions) {
    this.startedAt = opts.clock().toISOString();
  }

  async start(spaces: ReadonlyArray<SpaceRef>): Promise<void> {
    this.watchHandle = await this.opts.permissionedRepo.watch({
      spaces,
      onChange: (hint) => this.handleChange(hint),
    });
    this.subscribedSpaces = spaces.length;
  }

  async stop(): Promise<void> {
    await this.watchHandle?.close();
    this.watchHandle = null;
    this.subscribedSpaces = 0;
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

  private async handleChange(hint: PermissionedChangeHint): Promise<void> {
    let changes: VerifiedPermissionedChanges;
    try {
      changes = await this.opts.permissionedRepo.sync({ space: hint.space, hint });
    } catch (err) {
      await this.recordError(err, { space: hint.space });
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
      const handled = await this.handleRecord(record);
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
      }
    }
  }

  private async handleRecord(record: VerifiedPermissionedRecord): Promise<boolean> {
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
      await this.recordError(
        new SpacesConsumerError('member-list', 'strict resolved membership was indeterminate'),
        {
          space: record.location.space,
          authorDid: record.location.authorDid,
        },
      );
      return false;
    }

    const isMember = resolvedMembers.members.some((member) => member.did === record.location.authorDid);
    if (!isMember) {
      this.recordsRejected += 1;
      this.memberCrossCheckFailures += 1;
      try {
        await this.opts.onRejected?.({ record, reason: 'not-member' });
        return true;
      } catch (err) {
        await this.recordError(err, {
          space: record.location.space,
          authorDid: record.location.authorDid,
        });
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
      return false;
    }
  }

  private async recordError(err: unknown, context: { space: SpaceRef; authorDid?: DID }): Promise<void> {
    this.errorCount += 1;
    await this.opts.onError(err, context);
  }
}
