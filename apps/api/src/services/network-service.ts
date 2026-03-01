import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { DID } from '@coopsource/common';
import { NotFoundError, ConflictError } from '@coopsource/common';
import type { IPdsService, IFederationClient, IClock } from '@coopsource/federation';
import type { Page, PageParams } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';

export interface NetworkSummary {
  did: string;
  handle: string | null;
  displayName: string;
  description: string | null;
  cooperativeType: string;
  membershipPolicy: string;
  memberCount: number;
}

export interface NetworkDetail extends NetworkSummary {
  website: string | null;
  createdAt: Date;
}

export interface NetworkMember {
  did: string;
  handle: string | null;
  displayName: string;
  description: string | null;
  cooperativeType: string;
  status: string;
  joinedAt: Date | null;
}

export class NetworkService {
  constructor(
    private db: Kysely<Database>,
    private pdsService: IPdsService,
    private federationClient: IFederationClient,
    private clock: IClock,
  ) {}

  async listNetworks(params: PageParams): Promise<Page<NetworkSummary>> {
    const limit = params.limit ?? 50;

    let query = this.db
      .selectFrom('entity')
      .innerJoin(
        'cooperative_profile',
        'cooperative_profile.entity_did',
        'entity.did',
      )
      .where('cooperative_profile.is_network', '=', true)
      .where('entity.status', '=', 'active')
      .select([
        'entity.did',
        'entity.handle',
        'entity.display_name',
        'entity.description',
        'entity.created_at',
        'cooperative_profile.cooperative_type',
        'cooperative_profile.membership_policy',
      ])
      .select((eb) =>
        eb
          .selectFrom('membership')
          .whereRef('membership.cooperative_did', '=', 'entity.did')
          .where('membership.status', '=', 'active')
          .where('membership.invalidated_at', 'is', null)
          .select(eb.fn.countAll<number>().as('count'))
          .as('member_count'),
      )
      .orderBy('entity.created_at', 'desc')
      .orderBy('entity.did', 'desc')
      .limit(limit + 1);

    if (params.cursor) {
      const { t, i } = decodeCursor(params.cursor);
      query = query.where((eb) =>
        eb.or([
          eb('entity.created_at', '<', new Date(t)),
          eb.and([
            eb('entity.created_at', '=', new Date(t)),
            eb('entity.did', '<', i),
          ]),
        ]),
      );
    }

    const rows = await query.execute();
    const slice = rows.slice(0, limit);

    const items: NetworkSummary[] = slice.map((row) => ({
      did: row.did,
      handle: row.handle,
      displayName: row.display_name,
      description: row.description,
      cooperativeType: row.cooperative_type,
      membershipPolicy: row.membership_policy,
      memberCount: Number(row.member_count ?? 0),
    }));

    const cursor =
      rows.length > limit
        ? encodeCursor(slice[slice.length - 1]!.created_at, slice[slice.length - 1]!.did)
        : undefined;

    return { items, cursor };
  }

  async getNetwork(did: string): Promise<NetworkDetail> {
    const row = await this.db
      .selectFrom('entity')
      .innerJoin(
        'cooperative_profile',
        'cooperative_profile.entity_did',
        'entity.did',
      )
      .where('entity.did', '=', did)
      .where('cooperative_profile.is_network', '=', true)
      .select([
        'entity.did',
        'entity.handle',
        'entity.display_name',
        'entity.description',
        'entity.created_at',
        'cooperative_profile.cooperative_type',
        'cooperative_profile.membership_policy',
        'cooperative_profile.website',
      ])
      .select((eb) =>
        eb
          .selectFrom('membership')
          .whereRef('membership.cooperative_did', '=', 'entity.did')
          .where('membership.status', '=', 'active')
          .where('membership.invalidated_at', 'is', null)
          .select(eb.fn.countAll<number>().as('count'))
          .as('member_count'),
      )
      .executeTakeFirst();

    if (!row) {
      throw new NotFoundError('Network not found');
    }

    return {
      did: row.did,
      handle: row.handle,
      displayName: row.display_name,
      description: row.description,
      cooperativeType: row.cooperative_type,
      membershipPolicy: row.membership_policy,
      memberCount: Number(row.member_count ?? 0),
      website: row.website,
      createdAt: row.created_at,
    };
  }

  async listNetworkMembers(
    networkDid: string,
    params: PageParams,
  ): Promise<Page<NetworkMember>> {
    const limit = params.limit ?? 50;

    let query = this.db
      .selectFrom('membership')
      .innerJoin('entity', 'entity.did', 'membership.member_did')
      .leftJoin(
        'cooperative_profile',
        'cooperative_profile.entity_did',
        'membership.member_did',
      )
      .where('membership.cooperative_did', '=', networkDid)
      .where('membership.status', '=', 'active')
      .where('membership.invalidated_at', 'is', null)
      .select([
        'membership.id',
        'membership.member_did',
        'membership.status',
        'membership.joined_at',
        'membership.created_at',
        'entity.handle',
        'entity.display_name',
        'entity.description',
        'cooperative_profile.cooperative_type',
      ])
      .orderBy('membership.created_at', 'desc')
      .orderBy('membership.id', 'desc')
      .limit(limit + 1);

    if (params.cursor) {
      const { t, i } = decodeCursor(params.cursor);
      query = query.where((eb) =>
        eb.or([
          eb('membership.created_at', '<', new Date(t)),
          eb.and([
            eb('membership.created_at', '=', new Date(t)),
            eb('membership.id', '<', i),
          ]),
        ]),
      );
    }

    const rows = await query.execute();
    const slice = rows.slice(0, limit);

    const items: NetworkMember[] = slice.map((row) => ({
      did: row.member_did,
      handle: row.handle,
      displayName: row.display_name,
      description: row.description,
      cooperativeType: row.cooperative_type ?? 'unknown',
      status: row.status,
      joinedAt: row.joined_at,
    }));

    const cursor =
      rows.length > limit
        ? encodeCursor(slice[slice.length - 1]!.created_at, slice[slice.length - 1]!.id)
        : undefined;

    return { items, cursor };
  }

  async createNetwork(params: {
    name: string;
    description?: string;
    handle?: string;
    cooperativeType?: string;
    instanceUrl: string;
  }): Promise<{ did: string }> {
    const now = this.clock.now();

    // Create DID via PDS
    const didDoc = await this.pdsService.createDid({
      entityType: 'cooperative',
      pdsUrl: params.instanceUrl,
    });
    const did = didDoc.id;

    // Create PDS record for the cooperative
    await this.pdsService.createRecord({
      did: did as DID,
      collection: 'network.coopsource.org.cooperative',
      record: {
        name: params.name,
        description: params.description ?? null,
        cooperativeType: params.cooperativeType ?? 'network',
        isNetwork: true,
        createdAt: now.toISOString(),
      },
    });

    // Insert entity row
    await this.db
      .insertInto('entity')
      .values({
        did,
        type: 'cooperative',
        handle: params.handle ?? null,
        display_name: params.name,
        description: params.description ?? null,
        status: 'active',
        created_at: now,
        indexed_at: now,
      })
      .execute();

    // Insert cooperative_profile row
    await this.db
      .insertInto('cooperative_profile')
      .values({
        entity_did: did,
        cooperative_type: params.cooperativeType ?? 'network',
        is_network: true,
        membership_policy: 'invite_only',
        created_at: now,
        indexed_at: now,
      })
      .execute();

    return { did };
  }

  async joinNetwork(params: {
    networkDid: string;
    cooperativeDid: string;
    instanceUrl: string;
  }): Promise<void> {
    const now = this.clock.now();

    // Verify network exists and is_network = true
    const network = await this.db
      .selectFrom('entity')
      .innerJoin(
        'cooperative_profile',
        'cooperative_profile.entity_did',
        'entity.did',
      )
      .where('entity.did', '=', params.networkDid)
      .where('cooperative_profile.is_network', '=', true)
      .select('entity.did')
      .executeTakeFirst();

    if (!network) {
      throw new NotFoundError('Network not found');
    }

    // Check for existing active membership
    const existing = await this.db
      .selectFrom('membership')
      .where('member_did', '=', params.cooperativeDid)
      .where('cooperative_did', '=', params.networkDid)
      .where('invalidated_at', 'is', null)
      .where('status', '=', 'active')
      .select('id')
      .executeTakeFirst();

    if (existing) {
      throw new ConflictError('Already a member of this network');
    }

    // 1. PDS membership record in cooperative's PDS
    const memberRef = await this.pdsService.createRecord({
      did: params.cooperativeDid as DID,
      collection: 'network.coopsource.org.membership',
      record: {
        cooperative: params.networkDid,
        createdAt: now.toISOString(),
      },
    });

    // 2. Cross-boundary: request approval from the network
    // In standalone mode: LocalFederationClient dispatches locally
    // In federated mode:  HttpFederationClient POSTs to the network's API
    const approvalResult = await this.federationClient.approveMembership({
      cooperativeDid: params.networkDid,
      memberDid: params.cooperativeDid,
      roles: ['member'],
    });

    // 3+4. DB writes in transaction
    await this.db.transaction().execute(async (trx) => {
      // Insert membership row with both URIs + CIDs
      const [membership] = await trx
        .insertInto('membership')
        .values({
          member_did: params.cooperativeDid,
          cooperative_did: params.networkDid,
          status: 'active',
          joined_at: now,
          member_record_uri: memberRef.uri,
          member_record_cid: memberRef.cid,
          approval_record_uri: approvalResult.approvalRecordUri,
          approval_record_cid: approvalResult.approvalRecordCid,
          created_at: now,
          indexed_at: now,
        })
        .returning('id')
        .execute();

      // Insert membership_role row with role='member'
      await trx
        .insertInto('membership_role')
        .values({
          membership_id: membership!.id,
          role: 'member',
          indexed_at: now,
        })
        .execute();
    });
  }

  async leaveNetwork(
    networkDid: string,
    cooperativeDid: string,
  ): Promise<void> {
    const now = this.clock.now();

    // Find active membership
    const membership = await this.db
      .selectFrom('membership')
      .where('member_did', '=', cooperativeDid)
      .where('cooperative_did', '=', networkDid)
      .where('invalidated_at', 'is', null)
      .where('status', '=', 'active')
      .select('id')
      .executeTakeFirst();

    if (!membership) {
      throw new NotFoundError('Membership not found');
    }

    // Update membership: status='departed', departed_at=now, invalidated_at=now
    await this.db
      .updateTable('membership')
      .set({
        status: 'departed',
        departed_at: now,
        invalidated_at: now,
        indexed_at: now,
      })
      .where('id', '=', membership.id)
      .execute();

    await this.federationClient.notifyHub({
      type: 'membership.departed',
      sourceDid: cooperativeDid,
      data: { networkDid, cooperativeDid, departedAt: now.toISOString() },
      timestamp: now.toISOString(),
    });
  }
}
