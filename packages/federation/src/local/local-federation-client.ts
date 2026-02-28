import type { Kysely } from 'kysely';
import type { DID } from '@coopsource/common';
import { NotFoundError } from '@coopsource/common';
import type { IPdsService } from '../interfaces/pds-service.js';
import type { IClock } from '../interfaces/clock.js';
import type {
  IFederationClient,
  EntityInfo,
  CoopProfile,
  CoopMetadata,
  FederationEvent,
} from '../interfaces/federation-client.js';
import type { DidDocument } from '../types.js';
import type { FederationDatabase } from './db-tables.js';

/**
 * LocalFederationClient — standalone-mode implementation of IFederationClient.
 *
 * All operations dispatch locally via direct DB access and the local PDS service.
 * Used when INSTANCE_ROLE is 'standalone' (single server, single DB).
 *
 * In federated mode (Phase 2), HttpFederationClient makes signed HTTP calls instead.
 */
export class LocalFederationClient implements IFederationClient {
  constructor(
    private db: Kysely<FederationDatabase>,
    private pdsService: IPdsService,
    private clock: IClock,
  ) {}

  // --- Identity ---

  async resolveEntity(did: string): Promise<EntityInfo> {
    const entity = await this.db
      .selectFrom('entity')
      .where('did', '=', did)
      .where('invalidated_at', 'is', null)
      .select([
        'did',
        'handle',
        'display_name',
        'type',
        'status',
        'description',
      ])
      .executeTakeFirst();

    if (!entity) {
      throw new NotFoundError(`Entity not found: ${did}`);
    }

    return {
      did: entity.did,
      handle: entity.handle,
      displayName: entity.display_name,
      type: entity.type as 'person' | 'cooperative',
      status: entity.status,
      description: entity.description,
    };
  }

  async resolveDid(did: string): Promise<DidDocument> {
    return this.pdsService.resolveDid(did as DID);
  }

  // --- Membership ---

  async requestMembership(params: {
    memberDid: string;
    cooperativeDid: string;
    message?: string;
  }): Promise<{ memberRecordUri: string; memberRecordCid: string }> {
    const now = this.clock.now();

    const ref = await this.pdsService.createRecord({
      did: params.memberDid as DID,
      collection: 'network.coopsource.org.membership',
      record: {
        cooperative: params.cooperativeDid,
        message: params.message,
        createdAt: now.toISOString(),
      },
    });

    return {
      memberRecordUri: ref.uri,
      memberRecordCid: ref.cid,
    };
  }

  async approveMembership(params: {
    cooperativeDid: string;
    memberDid: string;
    roles: string[];
  }): Promise<{ approvalRecordUri: string; approvalRecordCid: string }> {
    const now = this.clock.now();

    const ref = await this.pdsService.createRecord({
      did: params.cooperativeDid as DID,
      collection: 'network.coopsource.org.memberApproval',
      record: {
        member: params.memberDid,
        roles: params.roles,
        createdAt: now.toISOString(),
      },
    });

    return {
      approvalRecordUri: ref.uri,
      approvalRecordCid: ref.cid,
    };
  }

  // --- Agreements ---

  async requestSignature(_params: {
    agreementUri: string;
    signerDid: string;
    cooperativeDid: string;
    agreementTitle?: string;
  }): Promise<{ acknowledged: boolean }> {
    // In standalone mode, the signer is on this instance — no remote call needed.
    return { acknowledged: true };
  }

  async submitSignature(_params: {
    agreementUri: string;
    signerDid: string;
    signatureUri: string;
    signatureCid: string;
    cooperativeDid: string;
    statement?: string;
  }): Promise<{ recorded: boolean }> {
    // In standalone mode, the signature is recorded locally — no remote call needed.
    return { recorded: true };
  }

  async rejectSignatureRequest(_params: {
    agreementUri: string;
    signerDid: string;
    cooperativeDid: string;
    reason?: string;
  }): Promise<{ acknowledged: boolean }> {
    return { acknowledged: true };
  }

  async cancelSignatureRequest(_params: {
    agreementUri: string;
    signerDid: string;
    cooperativeDid: string;
    reason?: string;
  }): Promise<{ acknowledged: boolean }> {
    return { acknowledged: true };
  }

  async retractSignature(_params: {
    agreementUri: string;
    signerDid: string;
    cooperativeDid: string;
    reason?: string;
  }): Promise<{ acknowledged: boolean }> {
    return { acknowledged: true };
  }

  // --- Network ---

  async registerWithHub(_params: {
    cooperativeDid: string;
    hubUrl: string;
    metadata: CoopMetadata;
  }): Promise<void> {
    // In standalone mode, the hub IS this instance — no-op.
  }

  async notifyHub(_event: FederationEvent): Promise<void> {
    // In standalone mode, the hub IS this instance — no-op.
  }

  // --- Discovery ---

  async fetchCoopProfile(did: string): Promise<CoopProfile | null> {
    const row = await this.db
      .selectFrom('entity')
      .innerJoin(
        'cooperative_profile',
        'cooperative_profile.entity_did',
        'entity.did',
      )
      .where('entity.did', '=', did)
      .where('entity.invalidated_at', 'is', null)
      .select([
        'entity.did',
        'entity.handle',
        'entity.display_name',
        'entity.description',
        'cooperative_profile.cooperative_type',
        'cooperative_profile.membership_policy',
        'cooperative_profile.website',
      ])
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    // Count active members
    const countResult = await this.db
      .selectFrom('membership')
      .where('cooperative_did', '=', did)
      .where('status', '=', 'active')
      .where('invalidated_at', 'is', null)
      .select(this.db.fn.countAll<number>().as('count'))
      .executeTakeFirst();

    return {
      did: row.did,
      handle: row.handle,
      displayName: row.display_name,
      description: row.description,
      cooperativeType: row.cooperative_type,
      membershipPolicy: row.membership_policy,
      memberCount: Number(countResult?.count ?? 0),
      website: row.website,
    };
  }

  async searchCoops(query: string): Promise<CoopProfile[]> {
    const pattern = `%${query}%`;

    const rows = await this.db
      .selectFrom('entity')
      .innerJoin(
        'cooperative_profile',
        'cooperative_profile.entity_did',
        'entity.did',
      )
      .where('entity.type', '=', 'cooperative')
      .where('entity.invalidated_at', 'is', null)
      .where((eb) =>
        eb.or([
          eb('entity.display_name', 'ilike', pattern),
          eb('entity.description', 'ilike', pattern),
        ]),
      )
      .select([
        'entity.did',
        'entity.handle',
        'entity.display_name',
        'entity.description',
        'cooperative_profile.cooperative_type',
        'cooperative_profile.membership_policy',
        'cooperative_profile.website',
      ])
      .limit(50)
      .execute();

    return rows.map((row) => ({
      did: row.did,
      handle: row.handle,
      displayName: row.display_name,
      description: row.description,
      cooperativeType: row.cooperative_type,
      membershipPolicy: row.membership_policy,
      memberCount: 0, // Omit count for search results (performance)
      website: row.website,
    }));
  }
}
