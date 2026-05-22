export type {
  ClockedOptions,
  ConsumerHealth,
  MembershipCursor,
  MembershipSnapshotId,
  PermissionedChangeHint,
  PermissionedCheckpoint,
  PermissionedCursor,
  PermissionedRecordLocation,
  PermissionedVerificationStatus,
  DirectSpaceMember,
  MissingSpace,
  ResolvedMembers,
  ResolvedSpaceMember,
  SpaceMemberRef,
  SpaceRef,
  UnknownLexiconObject,
  VerifiedPermissionedChanges,
  VerifiedPermissionedRecord,
} from './types.js';
export { spaceRefKey, SpacesConsumerError } from './types.js';
export type { SpaceCredential, SpaceCredentialStore } from './credential-store.js';
export { InMemorySpaceCredentialStore } from './credential-store.js';
export type {
  GroupDirectoryPort,
  MembershipConsistency,
  SpaceConfigResult,
  SpaceListPage,
} from './group-directory-port.js';
export { DenyAllGroupDirectoryPort, StaticGroupDirectoryPort } from './group-directory-port.js';
export type {
  PermissionedCheckpointStore,
  PermissionedRepoPort,
  PermissionedWatchHandle,
} from './permissioned-repo-port.js';
export {
  FailClosedPermissionedRepoPort,
  InMemoryPermissionedCheckpointStore,
  InMemoryPermissionedRepoPort,
  KyselyPermissionedCheckpointStore,
} from './permissioned-repo-port.js';
export type { RejectedPermissionedRecord, SpacesConsumerOptions } from './consumer.js';
export { SpacesConsumer } from './consumer.js';
