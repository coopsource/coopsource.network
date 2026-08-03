import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { DID } from '@coopsource/common';
import { ValidationError } from '@coopsource/common';
import type { SpaceRef } from '@coopsource/spaces-consumer';
import {
  findCsnSpacePlacement,
  isConfidentialCsnCollection,
} from '@coopsource/lexicons';

export type GovernanceRecordPlacement =
  | {
      readonly kind: 'public-repo';
    }
  | {
      readonly kind: 'permissioned-space';
      readonly space: SpaceRef;
    };

export interface GovernanceRecordPlacementRequest {
  readonly cooperativeDid: string;
  readonly collection: string;
  readonly space?: SpaceRef;
  readonly visibilityOverride?: 'public' | 'private';
  /**
   * Where the record sits in its own lifecycle. A `draft` is Tier 2 until it
   * is deliberately published, independent of the cooperative's governance
   * visibility (audit C-03).
   */
  readonly lifecycleState?: 'draft' | 'published';
}

export interface GovernanceRecordPlacementPort {
  resolveWritePlacement(
    request: GovernanceRecordPlacementRequest,
  ): Promise<GovernanceRecordPlacement>;
}

export class CsnDbGovernanceRecordPlacementPort implements GovernanceRecordPlacementPort {
  constructor(private db: Kysely<Database>) {}

  async resolveWritePlacement(
    request: GovernanceRecordPlacementRequest,
  ): Promise<GovernanceRecordPlacement> {
    const visibility = await this.getVisibility(request.cooperativeDid);

    // Publication is irreversible — relay, crawler, and archive copies survive
    // any later deletion — so Tier 2 placement is decided before anything a
    // caller or cooperative setting can relax (audit C-03,
    // ARCHITECTURE-V12 §8: "Never on the public firehose").
    if (
      isConfidentialCsnCollection(request.collection) ||
      request.lifecycleState === 'draft'
    ) {
      return {
        kind: 'permissioned-space',
        space: permissionedSpaceFor(request),
      };
    }

    if (request.visibilityOverride === 'public') {
      return { kind: 'public-repo' };
    }
    if (request.visibilityOverride === 'private') {
      return {
        kind: 'permissioned-space',
        space: permissionedSpaceFor(request),
      };
    }

    switch (visibility) {
      case 'closed':
        return {
          kind: 'permissioned-space',
          space: permissionedSpaceFor(request),
        };
      case 'open':
      case 'mixed':
      default:
        return { kind: 'public-repo' };
    }
  }

  private async getVisibility(cooperativeDid: string): Promise<string> {
    const row = await this.db
      .selectFrom('cooperative_profile')
      .where('entity_did', '=', cooperativeDid)
      .select('governance_visibility')
      .executeTakeFirst();

    return row?.governance_visibility ?? 'open';
  }
}

function permissionedSpaceFor(
  request: GovernanceRecordPlacementRequest,
): SpaceRef {
  if (request.space) return request.space;

  const placement = findCsnSpacePlacement(request.collection);
  if (!placement) {
    throw new ValidationError(
      `No CSN permissioned-space placement for private collection '${request.collection}'`,
    );
  }
  if (placement.spaceKind !== 'members') {
    throw new ValidationError(
      `Collection '${request.collection}' requires an explicit '${placement.spaceKind}' private space`,
    );
  }
  return {
    arbiterDid: request.cooperativeDid as DID,
    spaceKey: placement.skeyPattern,
    expectedSpaceType: placement.spaceType,
  };
}
