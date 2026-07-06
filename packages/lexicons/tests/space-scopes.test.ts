import { describe, expect, it } from 'vitest';
import {
  CSN_MEMBERS_SPACE_TYPE,
  CSN_SPACE_TYPE_DECLARATIONS,
  formatSpaceReadScope,
  formatSpaceReadSelfScope,
  formatSpaceScope,
} from '../src/index.js';

describe('space OAuth scope formatting', () => {
  it('formats a whole-space read scope for a cooperative authority', () => {
    expect(
      formatSpaceReadScope(CSN_MEMBERS_SPACE_TYPE, {
        authority: 'did:plc:coop',
        skey: 'members',
      }),
    ).toBe(
      'space:network.coopsource.org.spaceType.members?authority=did%3Aplc%3Acoop&skey=members&action=read',
    );
  });

  it('formats read_self distinctly from read', () => {
    expect(formatSpaceReadSelfScope(CSN_MEMBERS_SPACE_TYPE)).toBe(
      'space:network.coopsource.org.spaceType.members?action=read_self',
    );
  });

  it('accepts a space declaration and narrows collections explicitly', () => {
    expect(
      formatSpaceScope(CSN_SPACE_TYPE_DECLARATIONS[0], {
        authority: 'did:plc:coop',
        collections: [
          'network.coopsource.governance.proposal',
          'network.coopsource.governance.vote',
        ],
        actions: ['read', 'create'],
      }),
    ).toBe(
      'space:network.coopsource.org.spaceType.members?authority=did%3Aplc%3Acoop&collection=network.coopsource.governance.proposal&collection=network.coopsource.governance.vote&action=read&action=create',
    );
  });

  it('formats management scopes without record actions', () => {
    expect(
      formatSpaceScope(CSN_MEMBERS_SPACE_TYPE, {
        authority: 'did:plc:coop',
        skey: '*',
        manage: ['create', 'update'],
      }),
    ).toBe(
      'space:network.coopsource.org.spaceType.members?authority=did%3Aplc%3Acoop&skey=*&manage=create&manage=update',
    );
  });

  it('rejects scopes without an action or manage operation', () => {
    expect(() => formatSpaceScope(CSN_MEMBERS_SPACE_TYPE, {})).toThrow(
      'requires at least one action or manage operation',
    );
  });
});
