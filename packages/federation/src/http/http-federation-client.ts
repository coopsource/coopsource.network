import type {
  IFederationClient,
  EntityInfo,
  CoopProfile,
  CoopMetadata,
  FederationEvent,
} from '../interfaces/federation-client.js';
import type { DidDocument } from '../types.js';
import type { DidWebResolver } from './did-web-resolver.js';
import type { SigningKeyResolver } from './signing-key-resolver.js';
import { signRequest } from './signing.js';

/**
 * HttpFederationClient — federated-mode implementation of IFederationClient.
 *
 * Makes signed HTTP requests to remote co-op instances. Each outbound request
 * is signed with the instance's ECDSA P-256 key per RFC 9421.
 *
 * Used when INSTANCE_ROLE is 'hub' or 'coop'.
 */
export class HttpFederationClient implements IFederationClient {
  constructor(
    private signingKeyResolver: SigningKeyResolver,
    private didResolver: DidWebResolver,
    private instanceDid: string,
    private hubUrl?: string,
  ) {}

  // ── Private helpers ──

  private getPdsEndpoint(doc: DidDocument): string {
    const service = doc.service.find(
      (s) =>
        s.type === 'CoopSourcePds' ||
        s.type === 'AtprotoPersonalDataServer',
    );
    if (!service) {
      throw new Error(`No PDS service endpoint in DID document for ${doc.id}`);
    }
    return service.serviceEndpoint;
  }

  private async signedFetch(
    url: string,
    options: { method?: string; body?: Record<string, unknown> | null } = {},
  ): Promise<Response> {
    const method = options.method ?? 'GET';
    const bodyStr = options.body ? JSON.stringify(options.body) : null;

    const headers: Record<string, string> = {
      accept: 'application/json',
    };
    if (bodyStr) {
      headers['content-type'] = 'application/json';
    }

    const { privateKey, keyId } =
      await this.signingKeyResolver.resolve(this.instanceDid);

    const sigHeaders = await signRequest(
      method,
      url,
      headers,
      bodyStr,
      privateKey,
      keyId,
    );
    Object.assign(headers, sigHeaders);

    const response = await fetch(url, {
      method,
      headers,
      body: bodyStr ?? undefined,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(
        `Federation request failed: ${method} ${url} -> ${response.status} ${errorBody}`,
      );
    }

    return response;
  }

  // ── Identity ──

  async resolveEntity(did: string): Promise<EntityInfo> {
    const doc = await this.didResolver.resolve(did);
    const pdsUrl = this.getPdsEndpoint(doc);
    const response = await this.signedFetch(
      `${pdsUrl}/api/v1/federation/entity/${encodeURIComponent(did)}`,
    );
    return response.json() as Promise<EntityInfo>;
  }

  async resolveDid(did: string): Promise<DidDocument> {
    return this.didResolver.resolve(did);
  }

  // ── Membership ──

  async requestMembership(params: {
    memberDid: string;
    cooperativeDid: string;
    message?: string;
  }): Promise<{ memberRecordUri: string; memberRecordCid: string }> {
    const doc = await this.didResolver.resolve(params.cooperativeDid);
    const pdsUrl = this.getPdsEndpoint(doc);
    const response = await this.signedFetch(
      `${pdsUrl}/api/v1/federation/membership/request`,
      { method: 'POST', body: params },
    );
    return response.json() as Promise<{
      memberRecordUri: string;
      memberRecordCid: string;
    }>;
  }

  async approveMembership(params: {
    cooperativeDid: string;
    memberDid: string;
    roles: string[];
  }): Promise<{ approvalRecordUri: string; approvalRecordCid: string }> {
    const doc = await this.didResolver.resolve(params.cooperativeDid);
    const pdsUrl = this.getPdsEndpoint(doc);
    const response = await this.signedFetch(
      `${pdsUrl}/api/v1/federation/membership/approve`,
      { method: 'POST', body: params },
    );
    return response.json() as Promise<{
      approvalRecordUri: string;
      approvalRecordCid: string;
    }>;
  }

  // ── Agreements ──

  async requestSignature(params: {
    agreementUri: string;
    signerDid: string;
    cooperativeDid: string;
    agreementTitle?: string;
  }): Promise<{ acknowledged: boolean }> {
    const doc = await this.didResolver.resolve(params.cooperativeDid);
    const pdsUrl = this.getPdsEndpoint(doc);
    const response = await this.signedFetch(
      `${pdsUrl}/api/v1/federation/agreement/sign-request`,
      { method: 'POST', body: params },
    );
    return response.json() as Promise<{ acknowledged: boolean }>;
  }

  async submitSignature(params: {
    agreementUri: string;
    signerDid: string;
    signatureUri: string;
    signatureCid: string;
    cooperativeDid: string;
    statement?: string;
  }): Promise<{ recorded: boolean }> {
    const doc = await this.didResolver.resolve(params.cooperativeDid);
    const pdsUrl = this.getPdsEndpoint(doc);
    const response = await this.signedFetch(
      `${pdsUrl}/api/v1/federation/agreement/signature`,
      { method: 'POST', body: params },
    );
    return response.json() as Promise<{ recorded: boolean }>;
  }

  async rejectSignatureRequest(params: {
    agreementUri: string;
    signerDid: string;
    cooperativeDid: string;
    reason?: string;
  }): Promise<{ acknowledged: boolean }> {
    const doc = await this.didResolver.resolve(params.cooperativeDid);
    const pdsUrl = this.getPdsEndpoint(doc);
    const response = await this.signedFetch(
      `${pdsUrl}/api/v1/federation/agreement/sign-reject`,
      { method: 'POST', body: params },
    );
    return response.json() as Promise<{ acknowledged: boolean }>;
  }

  async cancelSignatureRequest(params: {
    agreementUri: string;
    signerDid: string;
    cooperativeDid: string;
    reason?: string;
  }): Promise<{ acknowledged: boolean }> {
    const doc = await this.didResolver.resolve(params.cooperativeDid);
    const pdsUrl = this.getPdsEndpoint(doc);
    const response = await this.signedFetch(
      `${pdsUrl}/api/v1/federation/agreement/sign-cancel`,
      { method: 'POST', body: params },
    );
    return response.json() as Promise<{ acknowledged: boolean }>;
  }

  async retractSignature(params: {
    agreementUri: string;
    signerDid: string;
    cooperativeDid: string;
    reason?: string;
  }): Promise<{ acknowledged: boolean }> {
    const doc = await this.didResolver.resolve(params.cooperativeDid);
    const pdsUrl = this.getPdsEndpoint(doc);
    const response = await this.signedFetch(
      `${pdsUrl}/api/v1/federation/agreement/signature-retract`,
      { method: 'POST', body: params },
    );
    return response.json() as Promise<{ acknowledged: boolean }>;
  }

  // ── Network ──

  async registerWithHub(params: {
    cooperativeDid: string;
    hubUrl: string;
    metadata: CoopMetadata;
  }): Promise<void> {
    await this.signedFetch(
      `${params.hubUrl}/api/v1/federation/hub/register`,
      { method: 'POST', body: params },
    );
  }

  async notifyHub(event: FederationEvent): Promise<void> {
    if (!this.hubUrl) {
      return; // No hub URL configured — skip notification
    }
    await this.signedFetch(
      `${this.hubUrl}/api/v1/federation/hub/notify`,
      { method: 'POST', body: event as unknown as Record<string, unknown> },
    );
  }

  // ── Discovery ──

  async fetchCoopProfile(did: string): Promise<CoopProfile | null> {
    try {
      const doc = await this.didResolver.resolve(did);
      const pdsUrl = this.getPdsEndpoint(doc);
      const response = await this.signedFetch(
        `${pdsUrl}/api/v1/federation/coop/${encodeURIComponent(did)}/profile`,
      );
      return response.json() as Promise<CoopProfile>;
    } catch {
      return null;
    }
  }

  async searchCoops(_query: string): Promise<CoopProfile[]> {
    // Search is local-only — not federated across instances
    return [];
  }
}
