import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import { logger } from '../middleware/logger.js';

export type GovernanceLabelValue =
  | 'proposal-active'
  | 'proposal-approved'
  | 'proposal-rejected'
  | 'proposal-archived'
  | 'member-suspended'
  | 'agreement-ratified';

export class GovernanceLabeler {
  constructor(private db: Kysely<Database>) {}

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
      await this.db
        .insertInto('governance_label')
        .values({
          src_did: srcDid,
          subject_uri: subjectUri,
          subject_cid: subjectCid ?? null,
          label_value: labelValue,
          created_at: new Date(),
        })
        .execute();

      logger.info({ srcDid, subjectUri, labelValue }, 'Governance label emitted');
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
      await this.db
        .insertInto('governance_label')
        .values({
          src_did: srcDid,
          subject_uri: subjectUri,
          label_value: labelValue,
          neg: true,
          created_at: new Date(),
        })
        .execute();
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
    }));
  }
}
