import type { DID } from '@coopsource/common';
import type {
  DidDocument,
  FirehoseEvent,
  ListRecordsOptions,
  PdsRecord,
  RecordRef,
} from '../types.js';

export interface CreateDidOptions {
  entityType: 'person' | 'cooperative';
  handle?: string;
  pdsUrl: string;
}

export interface UpdateDidOptions {
  handle?: string;
  rotateSigningKey?: Record<string, unknown>;
  pdsUrl?: string;
}

export interface CreateRecordParams {
  did: DID;
  collection: string;
  record: Record<string, unknown>;
  rkey?: string;
}

export interface PutRecordParams {
  did: DID;
  collection: string;
  rkey: string;
  record: Record<string, unknown>;
}

export interface DeleteRecordParams {
  did: DID;
  collection: string;
  rkey: string;
}

export interface IPdsService {
  createDid(options: CreateDidOptions): Promise<DidDocument>;
  resolveDid(did: DID): Promise<DidDocument>;
  updateDidDocument(did: DID, updates: UpdateDidOptions): Promise<DidDocument>;
  createRecord(params: CreateRecordParams): Promise<RecordRef>;
  putRecord(params: PutRecordParams): Promise<RecordRef>;
  deleteRecord(params: DeleteRecordParams): Promise<void>;
  getRecord(uri: string): Promise<PdsRecord>;
  listRecords(
    did: DID,
    collection: string,
    options?: ListRecordsOptions,
  ): Promise<PdsRecord[]>;
  subscribeRepos(cursor?: number): AsyncIterable<FirehoseEvent>;
}
