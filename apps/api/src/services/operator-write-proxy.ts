import type { DID } from '@coopsource/common';
import type { IPdsService, RecordRef } from '@coopsource/federation';
import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { AppConfig } from '../config.js';

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
  ) {
    this.authorizedOperators = new Set(
      (config.COOP_OPERATORS ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }

  async writeCoopRecord(params: WriteCoopRecordParams): Promise<RecordRef> {
    await this.verifyOperatorAuthorized(params.operatorDid, params.cooperativeDid);

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

    const membership = await this.db
      .selectFrom('membership')
      .innerJoin('membership_role', 'membership_role.membership_id', 'membership.id')
      .where('membership.member_did', '=', operatorDid)
      .where('membership.cooperative_did', '=', cooperativeDid)
      .where('membership.status', '=', 'active')
      .where('membership_role.role', 'in', ['admin', 'board-member', 'staff'])
      .select('membership.id')
      .executeTakeFirst();

    if (!membership) {
      throw new Error(
        `Operator ${operatorDid} is not authorized to write records for cooperative ${cooperativeDid}`,
      );
    }
  }
}
