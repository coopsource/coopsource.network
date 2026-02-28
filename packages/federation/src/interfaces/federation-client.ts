import type { DidDocument } from '../types.js';

export interface EntityInfo {
  did: string;
  handle: string | null;
  displayName: string;
  type: 'person' | 'cooperative';
  status: string;
  description: string | null;
}

export interface CoopProfile {
  did: string;
  handle: string | null;
  displayName: string;
  description: string | null;
  cooperativeType: string;
  membershipPolicy: string;
  memberCount: number;
  website: string | null;
}

export interface CoopMetadata {
  displayName: string;
  description?: string;
  cooperativeType?: string;
  website?: string;
}

export interface FederationEvent {
  type: string;
  sourceDid: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface IFederationClient {
  // Identity
  resolveEntity(did: string): Promise<EntityInfo>;
  resolveDid(did: string): Promise<DidDocument>;

  // Membership
  requestMembership(params: {
    memberDid: string;
    cooperativeDid: string;
    message?: string;
  }): Promise<{ memberRecordUri: string; memberRecordCid: string }>;

  approveMembership(params: {
    cooperativeDid: string;
    memberDid: string;
    roles: string[];
  }): Promise<{ approvalRecordUri: string; approvalRecordCid: string }>;

  // Agreements
  requestSignature(params: {
    agreementUri: string;
    signerDid: string;
    cooperativeDid: string;
    agreementTitle?: string;
  }): Promise<{ acknowledged: boolean }>;

  submitSignature(params: {
    agreementUri: string;
    signerDid: string;
    signatureUri: string;
    signatureCid: string;
    cooperativeDid: string;
    statement?: string;
  }): Promise<{ recorded: boolean }>;

  rejectSignatureRequest(params: {
    agreementUri: string;
    signerDid: string;
    cooperativeDid: string;
    reason?: string;
  }): Promise<{ acknowledged: boolean }>;

  cancelSignatureRequest(params: {
    agreementUri: string;
    signerDid: string;
    cooperativeDid: string;
    reason?: string;
  }): Promise<{ acknowledged: boolean }>;

  retractSignature(params: {
    agreementUri: string;
    signerDid: string;
    cooperativeDid: string;
    reason?: string;
  }): Promise<{ acknowledged: boolean }>;

  // Network
  registerWithHub(params: {
    cooperativeDid: string;
    hubUrl: string;
    metadata: CoopMetadata;
  }): Promise<void>;

  notifyHub(event: FederationEvent): Promise<void>;

  // Discovery
  fetchCoopProfile(did: string): Promise<CoopProfile | null>;
  searchCoops(query: string): Promise<CoopProfile[]>;
}
