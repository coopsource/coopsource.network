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
  VerifiedPermissionedRecordDelete,
  VerifiedPermissionedRecordUpsert,
} from './types.js';
export { spaceRefKey, SpacesConsumerError } from './types.js';
export type {
  SpaceCredential,
  SpaceCredentialIssueRequest,
  SpaceCredentialIssuerPort,
  SpaceCredentialManagerOptions,
  SpaceCredentialStore,
  SpaceCredentialRefreshReason,
  SpaceCredentialErrorKind,
} from './credential-store.js';
export type {
  ClientAttestationClaims,
  ClientAttestationJwtSigner,
  ClientAttestationProtectedHeader,
  ClientAttestationProvider,
  ClientAttestationRequest,
  Proposal0016ClientAttestationProviderOptions,
} from './client-attestation.js';
export { Proposal0016ClientAttestationProvider } from './client-attestation.js';
export type {
  ResolvedSpaceAuthority,
  SpaceAuthorityDidDocument,
  SpaceAuthorityDidResolver,
  SpaceAuthorityResolutionErrorKind,
  SpaceAuthorityServiceEntry,
  SpaceAuthorityVerificationMethod,
} from './space-authority-resolver.js';
export {
  DidSpaceAuthorityResolver,
  SpaceAuthorityResolutionError,
} from './space-authority-resolver.js';
export { DidPermissionedSyncResolver } from './did-permissioned-sync-resolver.js';
export {
  InMemorySpaceCredentialStore,
  KyselySpaceCredentialStore,
  SpaceCredentialError,
  SpaceCredentialManager,
} from './credential-store.js';
export type {
  SpaceCredentialExchangeClientPort,
  SpaceCredentialExchangeRequest,
  SpaceCredentialExchangeResponse,
  SpaceDelegationTokenClientPort,
  SpaceDelegationTokenRequest,
  SpaceDelegationTokenResponse,
  TwoStepSpaceCredentialIssuerOptions,
} from './space-credential-issuer.js';
export {
  TwoStepSpaceCredentialIssuer,
  formatSpaceCredentialSpaceUri,
} from './space-credential-issuer.js';
export type { DidEquivalencePort } from './did-equivalence-port.js';
export {
  KyselyDidEquivalencePort,
  RawDidEquivalencePort,
} from './did-equivalence-port.js';
export type {
  GroupDirectoryPort,
  MembershipConsistency,
  SpaceConfigResult,
  SpaceListPage,
} from './group-directory-port.js';
export {
  DenyAllGroupDirectoryPort,
  StaticGroupDirectoryPort,
} from './group-directory-port.js';
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
export type {
  PermissionedCommitContext,
  PermissionedCommitVerificationRequest,
  PermissionedCommitVerifierPort,
  PermissionedReplicaRecord,
  PermissionedReplicaState,
  PermissionedReplicaStore,
  PermissionedRepoOperation,
  PermissionedRepoSigningKeyResolver,
  PermissionedSignedCommit,
  PermissionedSyncErrorKind,
  PermissionedWriterSummary,
} from './permissioned-sync.js';
export {
  cidForPermissionedRecord,
  diffPermissionedReplica,
  encodePermissionedCommitContext,
  InMemoryPermissionedReplicaStore,
  ltHashForReplica,
  PermissionedSyncError,
  Proposal0016CommitVerifier,
  Proposal0016LtHash,
} from './permissioned-sync.js';
export type {
  PermissionedListRepoOpsRequest,
  PermissionedListRepoOpsResponse,
  PermissionedListReposRequest,
  PermissionedListReposResponse,
  PermissionedNotification,
  PermissionedNotificationRegistration,
  PermissionedNotificationRegistrationStore,
  PermissionedNotificationSourcePort,
  PermissionedRecoveredRepo,
  PermissionedRegisterNotifyRequest,
  PermissionedRepoRecoveryPort,
  PermissionedSyncEndpointResolver,
  PermissionedSyncXrpcClientPort,
  XrpcPermissionedRepoPortOptions,
  XrpcPermissionedSyncFetch,
  XrpcPermissionedSyncFetchInit,
  XrpcPermissionedSyncFetchResponse,
} from './xrpc-permissioned-repo-port.js';
export {
  FailClosedPermissionedRepoRecoveryPort,
  InMemoryPermissionedNotificationRegistrationStore,
  spaceRefFromPermissionedNotification,
  XrpcPermissionedRepoPort,
  XrpcPermissionedSyncClient,
} from './xrpc-permissioned-repo-port.js';
export {
  KyselyPermissionedNotificationRegistrationStore,
  KyselyPermissionedReplicaStore,
} from './kysely-permissioned-sync-store.js';
export type {
  PermissionedCarFetch,
  PermissionedCarFetchResponse,
} from './car-permissioned-repo-recovery.js';
export { XrpcCarPermissionedRepoRecoveryPort } from './car-permissioned-repo-recovery.js';
export type {
  PermissionedBlobFetch,
  PermissionedBlobFetchResponse,
  PermissionedBlobVerificationRequest,
  PermissionedBlobVerifierPort,
} from './permissioned-blob-verifier.js';
export {
  FailClosedPermissionedBlobVerifier,
  XrpcPermissionedBlobVerifier,
} from './permissioned-blob-verifier.js';
export type {
  InMemoryPermissionedRecordWritePortOptions,
  PermissionedRecordCreateRequest,
  PermissionedRecordDeleteRequest,
  PermissionedRecordUpdateRequest,
  PermissionedRecordWritePort,
  PermissionedRecordWriteResult,
  PermissionedRecordWriteErrorKind,
  StoredPermissionedRecordWrite,
} from './permissioned-record-write-port.js';
export {
  formatPermissionedRecordLocationUri,
  InMemoryPermissionedRecordWritePort,
  PermissionedRecordWriteError,
} from './permissioned-record-write-port.js';
export type {
  XrpcPermissionedRecordWriteArgs,
  XrpcPermissionedRecordWriteFetch,
  XrpcPermissionedRecordWriteFetchInit,
  XrpcPermissionedRecordWriteFetchResponse,
  XrpcPermissionedRecordWriteHeaderProvider,
  XrpcPermissionedRecordWriteHeaderRequest,
  XrpcPermissionedRecordWriteOperation,
  XrpcPermissionedRecordWritePortOptions,
  XrpcPermissionedRecordWriteSession,
  XrpcPermissionedRecordWriteSessionRequest,
  XrpcPermissionedRecordWriteSessionProvider,
} from './xrpc-permissioned-record-write-port.js';
export {
  formatPermissionedSpaceLocationUri,
  XrpcPermissionedRecordWritePort,
} from './xrpc-permissioned-record-write-port.js';
export type { CredentialedPermissionedRepoPortOptions } from './credentialed-permissioned-repo-port.js';
export { CredentialedPermissionedRepoPort } from './credentialed-permissioned-repo-port.js';
export type {
  RejectedPermissionedRecord,
  SpacesConsumerOptions,
} from './consumer.js';
export { SpacesConsumer } from './consumer.js';
export type { SpaceRecordUri, SpaceUri } from './space-uri.js';
export {
  fromAtprotoSpaceSkey,
  formatSpaceRecordUri,
  formatSpaceUri,
  isSpaceRecordUri,
  parseSpaceRecordUri,
  parseSpaceUri,
  toAtprotoSpaceSkey,
} from './space-uri.js';
