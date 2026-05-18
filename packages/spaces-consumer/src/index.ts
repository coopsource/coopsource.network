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
  SpaceRef,
  VerifiedPermissionedChanges,
  VerifiedPermissionedRecord,
} from './types.js';
export { spaceRefKey, SpacesConsumerError } from './types.js';
export type { SpaceCredential, SpaceCredentialStore } from './credential-store.js';
export { InMemorySpaceCredentialStore } from './credential-store.js';
export type {
  GroupAuthorityPort,
  MembershipConsistency,
  MembershipDecision,
  MembershipSnapshotPage,
} from './group-authority-port.js';
export { DenyAllGroupAuthorityPort, StaticGroupAuthorityPort } from './group-authority-port.js';
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
