/**
 * Pinned executable baseline for the Proposal 0016 methods CSN calls.
 *
 * This is deliberately named as a draft rather than a protocol version. The
 * upstream proposal and implementation are not stable, so changes must update
 * this object, its consumers, and the conformance note together.
 */
export const PERMISSIONED_DATA_DRAFT_BASELINE = {
  proposal: {
    url: 'https://github.com/bluesky-social/proposals/tree/main/0016-permissioned-data',
    commit: '1caad93dbb1f445396f6abf3b97eb4040345e78e',
  },
  implementation: {
    url: 'https://github.com/bluesky-social/atproto/pull/5187',
    branch: 'permissioned-data',
    commit: '3f6c96d5d2d25438bd40fa89d6ecc37865f8e354',
  },
  did: {
    spaceHostService: '#atproto_space_host',
    pdsService: '#atproto_pds',
    spaceVerificationMethod: '#atproto_space',
    accountVerificationMethod: '#atproto',
  },
  commitFields: ['ver', 'hash', 'mac', 'ikm', 'sig', 'rev'],
  methods: {
    getSpace: {
      nsid: 'com.atproto.space.getSpace',
      kind: 'query',
      auth: 'space-credential',
      parametersRequired: ['space'],
      inputRequired: [],
      outputRequired: ['uri', 'config'],
      errors: ['SpaceNotFound'],
    },
    listSpaces: {
      nsid: 'com.atproto.space.listSpaces',
      kind: 'query',
      auth: 'oauth',
      parametersRequired: [],
      inputRequired: [],
      outputRequired: ['spaces'],
      errors: [],
    },
    getDelegationToken: {
      nsid: 'com.atproto.space.getDelegationToken',
      kind: 'query',
      auth: 'oauth',
      parametersRequired: ['space'],
      inputRequired: [],
      outputRequired: ['token'],
      errors: [],
    },
    getSpaceCredential: {
      nsid: 'com.atproto.space.getSpaceCredential',
      kind: 'procedure',
      auth: 'delegation-token',
      parametersRequired: [],
      inputRequired: ['space'],
      outputRequired: ['credential'],
      errors: [
        'SpaceNotFound',
        'SpaceDeleted',
        'UserNotAuthorized',
        'AppNotAuthorized',
        'NotAuthorized',
        'InvalidDelegationToken',
        'InvalidClientAttestation',
      ],
    },
    createRecord: {
      nsid: 'com.atproto.space.createRecord',
      kind: 'procedure',
      auth: 'oauth',
      parametersRequired: [],
      inputRequired: ['space', 'repo', 'collection', 'record'],
      outputRequired: ['uri', 'cid'],
      errors: ['SpaceNotFound'],
    },
    putRecord: {
      nsid: 'com.atproto.space.putRecord',
      kind: 'procedure',
      auth: 'oauth',
      parametersRequired: [],
      inputRequired: ['space', 'repo', 'collection', 'rkey', 'record'],
      outputRequired: ['uri', 'cid'],
      errors: ['SpaceNotFound'],
    },
    deleteRecord: {
      nsid: 'com.atproto.space.deleteRecord',
      kind: 'procedure',
      auth: 'oauth',
      parametersRequired: [],
      inputRequired: ['space', 'repo', 'collection', 'rkey'],
      outputRequired: [],
      errors: ['SpaceNotFound'],
    },
    createSpace: {
      nsid: 'com.atproto.simplespace.createSpace',
      kind: 'procedure',
      auth: 'oauth',
      manage: 'create',
      parametersRequired: [],
      inputRequired: ['did', 'type'],
      outputRequired: ['uri'],
      errors: ['SpaceAlreadyExists', 'InvalidType'],
    },
    addMember: {
      nsid: 'com.atproto.simplespace.addMember',
      kind: 'procedure',
      auth: 'oauth',
      manage: 'update',
      parametersRequired: [],
      inputRequired: ['space', 'did'],
      outputRequired: [],
      errors: ['SpaceNotFound', 'NotSpaceOwner'],
    },
    removeMember: {
      nsid: 'com.atproto.simplespace.removeMember',
      kind: 'procedure',
      auth: 'oauth',
      manage: 'update',
      parametersRequired: [],
      inputRequired: ['space', 'did'],
      outputRequired: [],
      errors: ['SpaceNotFound', 'NotSpaceOwner'],
    },
    listMembers: {
      nsid: 'com.atproto.simplespace.listMembers',
      kind: 'query',
      auth: 'oauth',
      manage: 'update',
      parametersRequired: ['space'],
      inputRequired: [],
      outputRequired: ['members'],
      errors: ['SpaceNotFound', 'NotSpaceOwner'],
    },
  },
} as const;

export const SPACE_XRPC_METHODS = {
  getSpace: PERMISSIONED_DATA_DRAFT_BASELINE.methods.getSpace.nsid,
  listSpaces: PERMISSIONED_DATA_DRAFT_BASELINE.methods.listSpaces.nsid,
  getDelegationToken:
    PERMISSIONED_DATA_DRAFT_BASELINE.methods.getDelegationToken.nsid,
  getSpaceCredential:
    PERMISSIONED_DATA_DRAFT_BASELINE.methods.getSpaceCredential.nsid,
  createRecord: PERMISSIONED_DATA_DRAFT_BASELINE.methods.createRecord.nsid,
  putRecord: PERMISSIONED_DATA_DRAFT_BASELINE.methods.putRecord.nsid,
  deleteRecord: PERMISSIONED_DATA_DRAFT_BASELINE.methods.deleteRecord.nsid,
} as const;

export const SIMPLESPACE_XRPC_METHODS = {
  createSpace: PERMISSIONED_DATA_DRAFT_BASELINE.methods.createSpace.nsid,
  addMember: PERMISSIONED_DATA_DRAFT_BASELINE.methods.addMember.nsid,
  removeMember: PERMISSIONED_DATA_DRAFT_BASELINE.methods.removeMember.nsid,
  listMembers: PERMISSIONED_DATA_DRAFT_BASELINE.methods.listMembers.nsid,
} as const;

export const ATPROTO_SPACE_HOST_SERVICE_ID =
  PERMISSIONED_DATA_DRAFT_BASELINE.did.spaceHostService;
export const ATPROTO_PDS_SERVICE_ID =
  PERMISSIONED_DATA_DRAFT_BASELINE.did.pdsService;
export const ATPROTO_SPACE_VERIFICATION_METHOD_ID =
  PERMISSIONED_DATA_DRAFT_BASELINE.did.spaceVerificationMethod;
export const ATPROTO_ACCOUNT_VERIFICATION_METHOD_ID =
  PERMISSIONED_DATA_DRAFT_BASELINE.did.accountVerificationMethod;
