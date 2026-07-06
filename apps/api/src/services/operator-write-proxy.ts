import type { DID } from '@coopsource/common';
import type { IPdsService, RecordRef } from '@coopsource/federation';
import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { AppConfig } from '../config.js';
import type { MembershipReadModel } from './membership-read-model.js';

export interface WriteCoopRecordParams {
  operatorDid: string;
  cooperativeDid: DID;
  collection: string;
  record: Record<string, unknown>;
  rkey?: string;
}

/**
 * Proxies cooperative-owned record writes with ACL enforcement and audit logging.
 *
 * Verifies the operator is authorized (listed in COOP_OPERATORS or has
 * admin/board-member/staff role), writes the record to the cooperative's PDS,
 * and logs the operation for audit.
 */
export class OperatorWriteProxy {
  private authorizedOperators: Set<string>;

  constructor(
    private pdsService: IPdsService,
    private db: Kysely<Database>,
    config: AppConfig,
    private membershipReadModel: MembershipReadModel,
  ) {
    this.authorizedOperators = new Set(
      (config.COOP_OPERATORS ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }

  async writeCoopRecord(params: WriteCoopRecordParams): Promise<RecordRef> {
    await this.verifyOperatorAuthorized(
      params.operatorDid,
      params.cooperativeDid,
    );

    const ref = await this.pdsService.createRecord({
      did: params.cooperativeDid,
      collection: params.collection,
      record: params.record,
      rkey: params.rkey,
    });

    await this.db
      .insertInto('operator_audit_log')
      .values({
        cooperative_did: params.cooperativeDid,
        operator_did: params.operatorDid,
        operation: 'create',
        collection: params.collection,
        rkey: params.rkey ?? null,
        record_uri: ref.uri,
        record_cid: ref.cid,
      })
      .execute();

    return ref;
  }

  private async verifyOperatorAuthorized(
    operatorDid: string,
    cooperativeDid: string,
  ): Promise<void> {
    if (this.authorizedOperators.has(operatorDid)) {
      return;
    }

    const membership = await this.membershipReadModel.getActiveMembershipResult(
      cooperativeDid as DID,
      operatorDid as DID,
    );
    if (!membership.ok) {
      if (membership.reason !== 'not-member') {
        throw new Error(
          `${membership.message} (${membership.axis}:${membership.reason})`,
        );
      }
      throw new Error(
        `Operator ${operatorDid} is not authorized to write records for cooperative ${cooperativeDid}`,
      );
    }

    const mayWrite = membership.membership.roles.some((role) =>
      ['admin', 'board-member', 'staff'].includes(role),
    );
    if (!mayWrite) {
      throw new Error(
        `Operator ${operatorDid} is not authorized to write records for cooperative ${cooperativeDid}`,
      );
    }
  }
}
