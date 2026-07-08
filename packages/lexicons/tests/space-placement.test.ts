import { describe, expect, it } from 'vitest';
import {
  CSN_MEMBERS_SPACE_TYPE,
  CSN_SPACE_PLACEMENT_MATRIX,
  CSN_SPACE_TYPE_DECLARATIONS,
  findCsnSpacePlacement,
  formatPlacementAppViewReadScope,
  formatPlacementMemberSelfReadScope,
} from '../src/index.js';

describe('Phase 4 space placement matrix', () => {
  it('covers every collection declared by a CSN space type exactly once', () => {
    const declaredCollections = CSN_SPACE_TYPE_DECLARATIONS.flatMap(
      (declaration) => declaration.defs.main.collections,
    ).sort();
    const placedCollections = CSN_SPACE_PLACEMENT_MATRIX.map(
      (placement) => placement.collection,
    ).sort();

    expect(placedCollections).toEqual(declaredCollections);
    expect(new Set(placedCollections).size).toBe(placedCollections.length);
  });

  it('keeps each placement aligned with its declaring space type', () => {
    for (const placement of CSN_SPACE_PLACEMENT_MATRIX) {
      const declaration = CSN_SPACE_TYPE_DECLARATIONS.find(
        (candidate) => candidate.id === placement.spaceType,
      );
      expect(declaration?.defs.main.collections).toContain(
        placement.collection,
      );
    }
  });

  it('locates the planned members-space placement for governance votes', () => {
    expect(findCsnSpacePlacement('network.coopsource.governance.vote')).toEqual(
      {
        collection: 'network.coopsource.governance.vote',
        spaceType: CSN_MEMBERS_SPACE_TYPE,
        spaceKind: 'members',
        skeyPattern: 'members',
        appViewReadAction: 'read',
        memberSelfReadAction: 'read_self',
        status: 'draft-phase-4',
      },
    );
  });

  it('formats collection-narrowed AppView and member-self read scopes', () => {
    const placement = findCsnSpacePlacement(
      'network.coopsource.governance.vote',
    );
    expect(placement).not.toBeNull();

    expect(
      formatPlacementAppViewReadScope(placement!, {
        authority: 'did:plc:coop',
        skey: 'members',
      }),
    ).toBe(
      'space:network.coopsource.org.spaceType.members?authority=did%3Aplc%3Acoop&skey=members&collection=network.coopsource.governance.vote&action=read',
    );
    expect(formatPlacementMemberSelfReadScope(placement!)).toBe(
      'space:network.coopsource.org.spaceType.members?collection=network.coopsource.governance.vote&action=read_self',
    );
  });
});
