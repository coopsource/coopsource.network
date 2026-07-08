import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { DID } from '@coopsource/common';
import { NotFoundError, ConflictError } from '@coopsource/common';
import type { GroupMutationPort } from '@coopsource/arbiter-client';
import type { IPdsService, IClock } from '@coopsource/federation';
import type { Page, PageParams } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';
import {
  emitMemberJoined,
  emitMemberDeparted,
} from '../appview/membership-events.js';
import {
  membershipAuthorityAppError,
  type MembershipReadModel,
} from './membership-read-model.js';

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
    private clock: IClock,
    private groupMutations: GroupMutationPort,
    private membershipReadModel: MembershipReadModel,
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
    const memberCounts =
      await this.membershipReadModel.countProjectedActiveMembersByCooperative(
        slice.map((row) => row.did as DID),
      );

    const items: NetworkSummary[] = slice.map((row) => ({
      did: row.did,
      handle: row.handle,
      displayName: row.display_name,
      description: row.description,
      cooperativeType: row.cooperative_type,
      membershipPolicy: row.membership_policy,
      memberCount: memberCounts.get(row.did) ?? 0,
    }));

    const cursor =
      rows.length > limit
        ? encodeCursor(
            slice[slice.length - 1]!.created_at,
            slice[slice.length - 1]!.did,
          )
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
      .executeTakeFirst();

    if (!row) {
      throw new NotFoundError('Network not found');
    }
    const memberCounts =
      await this.membershipReadModel.countProjectedActiveMembersByCooperative([
        row.did as DID,
      ]);

    return {
      did: row.did,
      handle: row.handle,
      displayName: row.display_name,
      description: row.description,
      cooperativeType: row.cooperative_type,
      membershipPolicy: row.membership_policy,
      memberCount: memberCounts.get(row.did) ?? 0,
      website: row.website,
      createdAt: row.created_at,
    };
  }

  async listNetworkMembers(
    networkDid: string,
    params: PageParams,
  ): Promise<Page<NetworkMember>> {
    const roster = await this.membershipReadModel.listMembersResult(
      networkDid as DID,
      params,
    );
    if (!roster.ok) {
      throw membershipAuthorityAppError(
        roster,
        403,
        'NETWORK_MEMBERS_UNAVAILABLE',
      );
    }

    const memberDids = roster.page.items.map((member) => member.did);
    const rows =
      memberDids.length > 0
        ? await this.db
            .selectFrom('entity')
            .leftJoin(
              'cooperative_profile',
              'cooperative_profile.entity_did',
              'entity.did',
            )
            .where('entity.did', 'in', memberDids)
            .select([
              'entity.did',
              'entity.handle',
              'entity.description',
              'cooperative_profile.cooperative_type',
            ])
            .execute()
        : [];
    const entityMap = new Map(rows.map((row) => [row.did, row]));

    const items: NetworkMember[] = roster.page.items.map((member) => ({
      did: member.did,
      handle: entityMap.get(member.did)?.handle ?? null,
      displayName: member.displayName,
      description: entityMap.get(member.did)?.description ?? null,
      cooperativeType: entityMap.get(member.did)?.cooperative_type ?? 'unknown',
      status: member.status,
      joinedAt: member.joinedAt,
    }));

    return { items, cursor: roster.page.cursor };
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

    await this.groupMutations.provisionCooperativeAuthority({
      cooperativeDid: did as DID,
      actorDid: did as DID,
    });

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

    const existing = await this.membershipReadModel.getActiveMembershipResult(
      params.networkDid as DID,
      params.cooperativeDid as DID,
    );

    if (existing.ok) {
      throw new ConflictError('Already a member of this network');
    }
    if (existing.reason !== 'not-member') {
      throw membershipAuthorityAppError(existing, 409, 'Conflict');
    }

    const consentRef = await this.pdsService.createRecord({
      did: params.cooperativeDid as DID,
      collection: 'network.coopsource.org.memberConsent',
      record: {
        cooperative: params.networkDid,
        consentType: 'networkJoin',
        createdAt: now.toISOString(),
      },
    });

    await this.groupMutations.addMember({
      cooperativeDid: params.networkDid as DID,
      memberDid: params.cooperativeDid as DID,
      actorDid: params.cooperativeDid as DID,
      roles: ['member'],
      consentRecordUri: consentRef.uri,
      consentRecordCid: consentRef.cid,
      joinedAt: now,
      reason: 'join network',
    });
    emitMemberJoined(params.networkDid, params.cooperativeDid);
  }

  async leaveNetwork(
    networkDid: string,
    cooperativeDid: string,
  ): Promise<void> {
    const result = await this.groupMutations.removeMember({
      cooperativeDid: networkDid as DID,
      memberDid: cooperativeDid as DID,
      actorDid: cooperativeDid as DID,
      reason: 'leave network',
    });

    if (result.reason === 'not-found') {
      throw new NotFoundError('Membership not found');
    }
    emitMemberDeparted(networkDid, cooperativeDid);

    // Hub discovers membership changes via firehose — no explicit notification needed
  }
}
