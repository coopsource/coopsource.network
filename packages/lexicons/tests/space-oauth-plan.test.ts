import { describe, expect, it } from 'vitest';
import {
  CSN_SPACE_PLACEMENT_MATRIX,
  formatCsnAppViewReadScopePlan,
  formatCsnMemberSelfReadScopePlan,
  formatCsnMemberWriteScopePlan,
} from '../src/index.js';

describe('CSN space OAuth scope plan', () => {
  it('formats one AppView read scope per placement with canonical or wildcard skeys', () => {
    const scopes = formatCsnAppViewReadScopePlan({
      authority: 'did:plc:coop',
    });

    expect(scopes).toHaveLength(CSN_SPACE_PLACEMENT_MATRIX.length);
    expect(scopes).toContain(
      'space:network.coopsource.org.spaceType.members?authority=did%3Aplc%3Acoop&skey=members&collection=network.coopsource.governance.vote&action=read',
    );
    expect(scopes).toContain(
      'space:network.coopsource.org.spaceType.role?authority=did%3Aplc%3Acoop&skey=*&collection=network.coopsource.legal.document&action=read',
    );
    expect(scopes).toContain(
      'space:network.coopsource.org.spaceType.memberClass?authority=did%3Aplc%3Acoop&skey=*&collection=network.coopsource.ops.timeEntry&action=read',
    );
  });

  it('can omit skey constraints for pre-consent planning displays', () => {
    expect(
      formatCsnAppViewReadScopePlan({
        collections: ['network.coopsource.governance.vote'],
        skeyMode: 'omit',
      }),
    ).toEqual([
      'space:network.coopsource.org.spaceType.members?collection=network.coopsource.governance.vote&action=read',
    ]);
  });

  it('formats member-self read scope plans separately from AppView read plans', () => {
    expect(
      formatCsnMemberSelfReadScopePlan({
        collections: ['network.coopsource.governance.vote'],
      }),
    ).toEqual([
      'space:network.coopsource.org.spaceType.members?skey=members&collection=network.coopsource.governance.vote&action=read_self',
    ]);
  });

  it('formats member write scope plans for permissioned-space records', () => {
    expect(
      formatCsnMemberWriteScopePlan({
        collections: ['network.coopsource.governance.vote'],
        actions: ['create', 'delete'],
      }),
    ).toEqual([
      'space:network.coopsource.org.spaceType.members?skey=members&collection=network.coopsource.governance.vote&action=create&action=delete',
    ]);
  });

  it('can format broad draft member write scopes before the cooperative authority is known', () => {
    expect(
      formatCsnMemberWriteScopePlan({
        collections: [
          'network.coopsource.governance.proposal',
          'network.coopsource.governance.vote',
        ],
        skeyMode: 'omit',
      }),
    ).toEqual([
      'space:network.coopsource.org.spaceType.members?collection=network.coopsource.governance.proposal&action=create&action=update&action=delete',
      'space:network.coopsource.org.spaceType.members?collection=network.coopsource.governance.vote&action=create&action=update&action=delete',
    ]);
  });

  it('rejects unknown collections instead of silently under-scoping the plan', () => {
    expect(() =>
      formatCsnAppViewReadScopePlan({
        collections: ['network.coopsource.unknown.record'],
      }),
    ).toThrow(
      'Unknown CSN space placement collection: network.coopsource.unknown.record',
    );
  });
});
