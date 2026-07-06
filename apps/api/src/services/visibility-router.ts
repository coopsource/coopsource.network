import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { DID } from '@coopsource/common';
import { ValidationError } from '@coopsource/common';
import type { SpaceRef } from '@coopsource/spaces-consumer';
import { findCsnSpacePlacement } from '@coopsource/lexicons';

export type Tier = 1 | 2;

export type RouteResult =
  | {
      readonly tier: 1;
    }
  | {
      readonly tier: 2;
      readonly space: SpaceRef;
    };

export interface RouteWriteParams {
  readonly cooperativeDid: string;
  readonly collection: string;
  readonly record: Record<string, unknown>;
  readonly createdBy: string;
  readonly space?: SpaceRef;
  readonly visibilityOverride?: 'public' | 'private';
}

export class VisibilityRouter {
  constructor(private db: Kysely<Database>) {}

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
      return { tier: 2, space: privateSpaceFor(params) };
    }

    // No override: use cooperative visibility setting
    switch (visibility) {
      case 'closed':
        return { tier: 2, space: privateSpaceFor(params) };
      case 'open':
      case 'mixed':
      default:
        // open -> Tier 1, mixed without override -> default to Tier 1
        return { tier: 1 };
    }
  }
}

function privateSpaceFor(params: RouteWriteParams): SpaceRef {
  if (params.space) return params.space;

  const placement = findCsnSpacePlacement(params.collection);
  if (!placement) {
    throw new ValidationError(
      `No CSN permissioned-space placement for private collection '${params.collection}'`,
    );
  }
  if (placement.spaceKind !== 'members') {
    throw new ValidationError(
      `Collection '${params.collection}' requires an explicit '${placement.spaceKind}' private space`,
    );
  }
  return {
    arbiterDid: params.cooperativeDid as DID,
    spaceKey: placement.skeyPattern,
    expectedSpaceType: placement.spaceType,
  };
}
