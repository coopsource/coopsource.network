import { describe, expect, it } from 'vitest';
import {
  ATPROTO_ACCOUNT_VERIFICATION_METHOD_ID,
  ATPROTO_PDS_SERVICE_ID,
  ATPROTO_SPACE_HOST_SERVICE_ID,
  ATPROTO_SPACE_VERIFICATION_METHOD_ID,
  PERMISSIONED_DATA_DRAFT_BASELINE,
  SIMPLESPACE_XRPC_METHODS,
  SPACE_XRPC_METHODS,
} from '../src/index.js';

describe('Proposal 0016 executable draft baseline', () => {
  it('pins the proposal and implementation commits used by CSN', () => {
    expect(PERMISSIONED_DATA_DRAFT_BASELINE.proposal.commit).toBe(
      '1caad93dbb1f445396f6abf3b97eb4040345e78e',
    );
    expect(PERMISSIONED_DATA_DRAFT_BASELINE.implementation.commit).toBe(
      '3f6c96d5d2d25438bd40fa89d6ecc37865f8e354',
    );
    expect(PERMISSIONED_DATA_DRAFT_BASELINE.commitFields).toEqual([
      'ver',
      'hash',
      'mac',
      'ikm',
      'sig',
      'rev',
    ]);
  });

  it('publishes the current DID service and verification fragments', () => {
    expect(ATPROTO_SPACE_HOST_SERVICE_ID).toBe('#atproto_space_host');
    expect(ATPROTO_PDS_SERVICE_ID).toBe('#atproto_pds');
    expect(ATPROTO_SPACE_VERIFICATION_METHOD_ID).toBe('#atproto_space');
    expect(ATPROTO_ACCOUNT_VERIFICATION_METHOD_ID).toBe('#atproto');
  });

  it('describes every draft XRPC method currently used by CSN', () => {
    expect(SPACE_XRPC_METHODS).toEqual({
      getSpace: 'com.atproto.space.getSpace',
      listSpaces: 'com.atproto.space.listSpaces',
      getDelegationToken: 'com.atproto.space.getDelegationToken',
      getSpaceCredential: 'com.atproto.space.getSpaceCredential',
      createRecord: 'com.atproto.space.createRecord',
      putRecord: 'com.atproto.space.putRecord',
      deleteRecord: 'com.atproto.space.deleteRecord',
      listRepos: 'com.atproto.space.listRepos',
      listRepoOps: 'com.atproto.space.listRepoOps',
      getRepo: 'com.atproto.space.getRepo',
      getLatestCommit: 'com.atproto.space.getLatestCommit',
      getBlob: 'com.atproto.space.getBlob',
      registerNotify: 'com.atproto.space.registerNotify',
      notifyWrite: 'com.atproto.space.notifyWrite',
      notifySpaceDeleted: 'com.atproto.space.notifySpaceDeleted',
    });
    expect(SIMPLESPACE_XRPC_METHODS).toEqual({
      createSpace: 'com.atproto.simplespace.createSpace',
      addMember: 'com.atproto.simplespace.addMember',
      removeMember: 'com.atproto.simplespace.removeMember',
      listMembers: 'com.atproto.simplespace.listMembers',
      checkUserAccess: 'com.atproto.simplespace.checkUserAccess',
    });
  });

  it('keeps record-write errors distinct from SimpleSpace membership policy', () => {
    expect(
      PERMISSIONED_DATA_DRAFT_BASELINE.methods.createRecord.errors,
    ).toEqual(['SpaceNotFound']);
    expect(PERMISSIONED_DATA_DRAFT_BASELINE.methods.putRecord.errors).toEqual([
      'SpaceNotFound',
    ]);
    expect(
      PERMISSIONED_DATA_DRAFT_BASELINE.methods.deleteRecord.errors,
    ).toEqual(['SpaceNotFound']);
    expect(PERMISSIONED_DATA_DRAFT_BASELINE.methods.addMember.errors).toContain(
      'NotSpaceOwner',
    );
    expect(PERMISSIONED_DATA_DRAFT_BASELINE.methods.listMembers.manage).toBe(
      'update',
    );
    expect(PERMISSIONED_DATA_DRAFT_BASELINE.methods.checkUserAccess.auth).toBe(
      'service-auth',
    );
  });
});
