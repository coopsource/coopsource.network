import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import { logger } from '../middleware/logger.js';
import type { LabelSubscriptionManager, ATProtoLabel } from './label-subscription.js';
import type { LabelSigner, UnsignedLabel } from './label-signer.js';

export type GovernanceLabelValue =
  | 'proposal-active'
  | 'proposal-approved'
  | 'proposal-rejected'
  | 'proposal-archived'
  | 'member-suspended'
  | 'agreement-ratified';

export class GovernanceLabeler {
  constructor(
    private db: Kysely<Database>,
    private subscriptionManager?: LabelSubscriptionManager,
    private labelSigner?: LabelSigner,
  ) {}

  /**
   * Emit a governance label for a record.
   * Best-effort — logs and continues on failure.
   */
  async emitLabel(
    srcDid: string,
    subjectUri: string,
    labelValue: GovernanceLabelValue,
    subjectCid?: string,
  ): Promise<void> {
    try {
      const now = new Date();
      const result = await this.db
        .insertInto('governance_label')
        .values({
          src_did: srcDid,
          subject_uri: subjectUri,
          subject_cid: subjectCid ?? null,
          label_value: labelValue,
          created_at: now,
        })
        .returning(['seq', 'created_at'])
        .executeTakeFirstOrThrow();

      logger.info({ srcDid, subjectUri, labelValue }, 'Governance label emitted');

      // Notify WebSocket subscribers
      if (this.subscriptionManager) {
        const unsignedLabel: UnsignedLabel = {
          ver: 1,
          src: srcDid,
          uri: subjectUri,
          cid: subjectCid,
          val: labelValue,
          neg: false,
          cts: now.toISOString(),
        };

        const atLabel: ATProtoLabel = {
          ...unsignedLabel,
          sig: this.labelSigner ? await this.labelSigner.sign(unsignedLabel) : undefined,
        };

        this.subscriptionManager.notifyNewLabel(Number(result.seq), atLabel);
      }
    } catch (err) {
      logger.warn({ err, srcDid, subjectUri, labelValue }, 'Failed to emit governance label');
    }
  }

  /**
   * Negate (remove) a previously emitted label.
   */
  async negateLabel(
    srcDid: string,
    subjectUri: string,
    labelValue: GovernanceLabelValue,
  ): Promise<void> {
    try {
      const now = new Date();
      const result = await this.db
        .insertInto('governance_label')
        .values({
          src_did: srcDid,
          subject_uri: subjectUri,
          label_value: labelValue,
          neg: true,
          created_at: now,
        })
        .returning(['seq', 'created_at'])
        .executeTakeFirstOrThrow();

      // Notify WebSocket subscribers
      if (this.subscriptionManager) {
        const unsignedLabel: UnsignedLabel = {
          ver: 1,
          src: srcDid,
          uri: subjectUri,
          val: labelValue,
          neg: true,
          cts: now.toISOString(),
        };

        const atLabel: ATProtoLabel = {
          ...unsignedLabel,
          sig: this.labelSigner ? await this.labelSigner.sign(unsignedLabel) : undefined,
        };

        this.subscriptionManager.notifyNewLabel(Number(result.seq), atLabel);
      }
    } catch (err) {
      logger.warn({ err, subjectUri, labelValue }, 'Failed to negate governance label');
    }
  }

  /**
   * Query labels for a specific record.
   */
  async getLabelsForSubject(subjectUri: string): Promise<Array<{
    id: string;
    srcDid: string;
    subjectUri: string;
    labelValue: string;
    neg: boolean;
    createdAt: Date;
    seq: number;
  }>> {
    const rows = await this.db
      .selectFrom('governance_label')
      .where('subject_uri', '=', subjectUri)
      .orderBy('created_at', 'desc')
      .selectAll()
      .execute();

    return rows.map((r) => ({
      id: r.id,
      srcDid: r.src_did,
      subjectUri: r.subject_uri,
      labelValue: r.label_value,
      neg: r.neg,
      createdAt: r.created_at as Date,
      seq: Number(r.seq),
    }));
  }

  /**
   * Query all labels with a specific value.
   */
  async queryLabels(
    labelValue: string,
    limit = 50,
  ): Promise<Array<{
    id: string;
    srcDid: string;
    subjectUri: string;
    labelValue: string;
    neg: boolean;
    createdAt: Date;
    seq: number;
  }>> {
    const rows = await this.db
      .selectFrom('governance_label')
      .where('label_value', '=', labelValue)
      .where('neg', '=', false)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .selectAll()
      .execute();

    return rows.map((r) => ({
      id: r.id,
      srcDid: r.src_did,
      subjectUri: r.subject_uri,
      labelValue: r.label_value,
      neg: r.neg,
      createdAt: r.created_at as Date,
      seq: Number(r.seq),
    }));
  }
}
