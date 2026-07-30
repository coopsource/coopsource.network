import type { AtUri, CID, DID } from '@coopsource/common';

export interface BlobRef {
  $type: 'blob';
  ref: { $link: string }; // CID
  mimeType: string;
  size: number;
}

export interface RecordRef {
  uri: AtUri;
  cid: CID;
}

export interface PdsRecord {
  uri: AtUri;
  cid: CID;
  value: Record<string, unknown>;
  indexedAt: string; // ISO datetime
}

export interface VerificationMethod {
  id: string;
  type: string;
  controller: string;
  publicKeyMultibase?: string;
  publicKeyJwk?: Record<string, unknown>;
}

export interface ServiceEndpoint {
  id: string;
  type: string;
  serviceEndpoint: string;
}

export interface DidDocument {
  '@context': string[];
  id: DID;
  alsoKnownAs?: string[];
  verificationMethod: VerificationMethod[];
  authentication?: string[];
  assertionMethod?: string[];
  service: ServiceEndpoint[];
}

export type FirehoseOperation = 'create' | 'update' | 'delete';

export interface FirehoseEvent {
  seq: number;
  did: DID;
  operation: FirehoseOperation;
  uri: AtUri;
  cid: CID;
  record?: Record<string, unknown>;
  prevCid?: CID;
  time: string; // ISO datetime
  commitSig?: Uint8Array; // ECDSA signature from signed commit node
  commitSignedBytes?: Uint8Array; // DAG-CBOR encoding of commit without sig field
}

export type RepoAccountStatus =
  | 'takendown'
  | 'suspended'
  | 'deleted'
  | 'deactivated'
  | 'desynchronized'
  | 'throttled'
  | (string & {});

export interface RepoIdentityEvent {
  readonly kind: 'identity';
  readonly seq: number;
  readonly did: DID;
  readonly time: string;
  readonly handle?: string;
  /**
   * Host that emitted the raw firehose event. Tap-derived events omit this
   * because Tap exposes normalized repo state rather than the upstream host.
   */
  readonly sourceHost?: string;
}

export interface RepoAccountEvent {
  readonly kind: 'account';
  readonly seq: number;
  readonly did: DID;
  readonly time: string;
  readonly active: boolean;
  readonly status?: RepoAccountStatus;
  readonly sourceHost?: string;
}

export type RepoLifecycleEvent = RepoIdentityEvent | RepoAccountEvent;
export type RepositoryStreamEvent = FirehoseEvent | RepoLifecycleEvent;

export interface ListRecordsOptions {
  limit?: number;
  cursor?: string;
  reverse?: boolean;
}
