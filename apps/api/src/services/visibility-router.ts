import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { PrivateRecordService } from './private-record-service.js';

export type Tier = 1 | 2;

export interface RouteResult {
  tier: Tier;
  did?: string;
  collection?: string;
  rkey?: string;
}

export interface RouteWriteParams {
  cooperativeDid: string;
  collection: string;
  record: Record<string, unknown>;
  createdBy: string;
  rkey?: string;
  visibilityOverride?: 'public' | 'private';
}

export class VisibilityRouter {
  constructor(
    private db: Kysely<Database>,
    private privateRecordService: PrivateRecordService,
  ) {}

  async getVisibility(cooperativeDid: string): Promise<string> {
    const row = await this.db
      .selectFrom('cooperative_profile')
      .where('entity_did', '=', cooperativeDid)
      .select('governance_visibility')
      .executeTakeFirst();

    return row?.governance_visibility ?? 'open';
  }

  async routeWrite(params: RouteWriteParams): Promise<RouteResult> {
    const visibility = await this.getVisibility(params.cooperativeDid);

    // Explicit override takes precedence
    if (params.visibilityOverride === 'public') {
      return { tier: 1 };
    }

    if (params.visibilityOverride === 'private') {
      const result = await this.privateRecordService.create(
        params.cooperativeDid,
        params.collection,
        params.record,
        params.createdBy,
        params.rkey,
      );
      return {
        tier: 2,
        did: result.did,
        collection: result.collection,
        rkey: result.rkey,
      };
    }

    // No override: use cooperative visibility setting
    switch (visibility) {
      case 'closed': {
        const result = await this.privateRecordService.create(
          params.cooperativeDid,
          params.collection,
          params.record,
          params.createdBy,
          params.rkey,
        );
        return {
          tier: 2,
          did: result.did,
          collection: result.collection,
          rkey: result.rkey,
        };
      }
      case 'open':
      case 'mixed':
      default:
        // open → Tier 1, mixed without override → default to Tier 1
        return { tier: 1 };
    }
  }
}
