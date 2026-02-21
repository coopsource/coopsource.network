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
}

export interface ListRecordsOptions {
  limit?: number;
  cursor?: string;
  reverse?: boolean;
}
