// Types
export type {
  BlobRef,
  RecordRef,
  PdsRecord,
  DidDocument,
  FirehoseEvent,
  FirehoseOperation,
  ListRecordsOptions,
  VerificationMethod,
  ServiceEndpoint,
} from './types.js';

// Interfaces
export type {
  IFederationClient,
  EntityInfo,
  CoopProfile,
  CoopMetadata,
  FederationEvent,
} from './interfaces/federation-client.js';
export type {
  IPdsService,
  CreateDidOptions,
  UpdateDidOptions,
  CreateRecordParams,
  PutRecordParams,
  DeleteRecordParams,
} from './interfaces/pds-service.js';
export type { IBlobStore, BlobData } from './interfaces/blob-store.js';
export type { IClock } from './interfaces/clock.js';
export type {
  IEmailService,
  InvitationEmailParams,
  NotificationEmailParams,
} from './interfaces/email-service.js';

// Local implementations
export { LocalFederationClient } from './local/local-federation-client.js';

// HTTP / did:web / Federation
export { HttpFederationClient } from './http/http-federation-client.js';
export { DidWebResolver } from './http/did-web-resolver.js';
export type { DidWebResolverOptions } from './http/did-web-resolver.js';
export { SigningKeyResolver } from './http/signing-key-resolver.js';
export { signRequest, verifyRequest } from './http/signing.js';

// Clocks
export { SystemClock } from './clocks/system-clock.js';
export { MockClock } from './clocks/mock-clock.js';

// ATProto (Stage 2)
export { AtprotoPdsService } from './atproto/atproto-pds-service.js';
export {
  decodeFirehoseMessage,
  decodeFirehoseMessageWithRecords,
} from './atproto/firehose-decoder.js';
