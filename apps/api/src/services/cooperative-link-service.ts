import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { IClock } from '@coopsource/federation';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  UnauthorizedError,
} from '@coopsource/common';
import type { Page, PageParams } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';

export class CooperativeLinkService {
  constructor(
    private db: Kysely<Database>,
    private clock: IClock,
  ) {}

  async createLink(
    initiatorDid: string,
    data: {
      targetDid: string;
      linkType: string;
      description?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    // Prevent self-link
    if (initiatorDid === data.targetDid) {
      throw new ValidationError('Cannot create a link to yourself');
    }

    // Validate target is a cooperative entity
    const target = await this.db
      .selectFrom('entity')
      .where('did', '=', data.targetDid)
      .where('type', '=', 'cooperative')
      .select('did')
      .executeTakeFirst();

    if (!target) {
      throw new NotFoundError('Target cooperative not found');
    }

    // Bidirectional duplicate check: (A→B) or (B→A) that is not dissolved/declined
    const existing = await this.db
      .selectFrom('cooperative_link')
      .where((eb) =>
        eb.or([
          eb.and([
            eb('initiator_did', '=', initiatorDid),
            eb('target_did', '=', data.targetDid),
          ]),
          eb.and([
            eb('initiator_did', '=', data.targetDid),
            eb('target_did', '=', initiatorDid),
          ]),
        ]),
      )
      .where('status', 'in', ['pending', 'active'])
      .select('id')
      .executeTakeFirst();

    if (existing) {
      throw new ConflictError(
        'A link between these cooperatives already exists or is pending',
      );
    }

    const now = this.clock.now();
    const [row] = await this.db
      .insertInto('cooperative_link')
      .values({
        initiator_did: initiatorDid,
        target_did: data.targetDid,
        link_type: data.linkType,
        status: 'pending',
        description: data.description ?? null,
        metadata: data.metadata ?? null,
        initiated_at: now,
        created_at: now,
        updated_at: now,
      })
      .returningAll()
      .execute();

    return row!;
  }

  async respondToLink(
    linkId: string,
    responderDid: string,
    accept: boolean,
    message?: string,
  ) {
    const link = await this.db
      .selectFrom('cooperative_link')
      .where('id', '=', linkId)
      .selectAll()
      .executeTakeFirst();

    if (!link) throw new NotFoundError('Cooperative link not found');

    // Only target can respond
    if (link.target_did !== responderDid) {
      throw new UnauthorizedError('Only the target cooperative can respond to a link request');
    }

    if (link.status !== 'pending') {
      throw new ValidationError('Link is not pending');
    }

    const now = this.clock.now();
    const newStatus = accept ? 'active' : 'declined';

    const metadata = link.metadata as Record<string, unknown> | null;
    const updatedMetadata = message
      ? { ...(metadata ?? {}), responseMessage: message }
      : metadata;

    const [updated] = await this.db
      .updateTable('cooperative_link')
      .set({
        status: newStatus,
        responded_at: now,
        metadata: updatedMetadata,
        updated_at: now,
      })
      .where('id', '=', linkId)
      .returningAll()
      .execute();

    return updated!;
  }

  async dissolveLink(linkId: string, actorDid: string) {
    const link = await this.db
      .selectFrom('cooperative_link')
      .where('id', '=', linkId)
      .selectAll()
      .executeTakeFirst();

    if (!link) throw new NotFoundError('Cooperative link not found');

    // Either side can dissolve
    if (link.initiator_did !== actorDid && link.target_did !== actorDid) {
      throw new UnauthorizedError('Only participating cooperatives can dissolve a link');
    }

    if (link.status !== 'active') {
      throw new ValidationError(`Cannot dissolve a link with status '${link.status}'`);
    }

    const now = this.clock.now();
    const [updated] = await this.db
      .updateTable('cooperative_link')
      .set({
        status: 'dissolved',
        dissolved_at: now,
        updated_at: now,
      })
      .where('id', '=', linkId)
      .returningAll()
      .execute();

    return updated!;
  }

  async getLink(linkId: string) {
    const link = await this.db
      .selectFrom('cooperative_link')
      .where('id', '=', linkId)
      .selectAll()
      .executeTakeFirst();

    if (!link) throw new NotFoundError('Cooperative link not found');
    return link;
  }

  async listLinks(
    cooperativeDid: string,
    params: PageParams & { status?: string; linkType?: string },
  ): Promise<Page<Record<string, unknown>>> {
    const limit = params.limit ?? 50;

    let query = this.db
      .selectFrom('cooperative_link')
      .where((eb) =>
        eb.or([
          eb('initiator_did', '=', cooperativeDid),
          eb('target_did', '=', cooperativeDid),
        ]),
      )
      .selectAll()
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1);

    if (params.status) {
      query = query.where('status', '=', params.status);
    }
    if (params.linkType) {
      query = query.where('link_type', '=', params.linkType);
    }

    if (params.cursor) {
      const { t, i } = decodeCursor(params.cursor);
      query = query.where((eb) =>
        eb.or([
          eb('created_at', '<', new Date(t)),
          eb.and([
            eb('created_at', '=', new Date(t)),
            eb('id', '<', i),
          ]),
        ]),
      );
    }

    const rows = await query.execute();
    const slice = rows.slice(0, limit);
    const cursor =
      rows.length > limit
        ? encodeCursor(
            slice[slice.length - 1]!.created_at as Date,
            slice[slice.length - 1]!.id,
          )
        : undefined;

    return { items: slice as unknown as Record<string, unknown>[], cursor };
  }

  async listLinkedCooperatives(cooperativeDid: string) {
    const links = await this.db
      .selectFrom('cooperative_link')
      .where((eb) =>
        eb.or([
          eb('initiator_did', '=', cooperativeDid),
          eb('target_did', '=', cooperativeDid),
        ]),
      )
      .where('status', '=', 'active')
      .selectAll()
      .execute();

    // Get the partner DID for each link
    const partnerDids = links.map((l) =>
      l.initiator_did === cooperativeDid ? l.target_did : l.initiator_did,
    );

    if (partnerDids.length === 0) return [];

    // Look up entity details
    const entities = await this.db
      .selectFrom('entity')
      .where('did', 'in', partnerDids)
      .select(['did', 'display_name', 'handle', 'type'])
      .execute();

    const entityMap = new Map(entities.map((e) => [e.did, e]));

    return links.map((l) => {
      const partnerDid =
        l.initiator_did === cooperativeDid ? l.target_did : l.initiator_did;
      const entity = entityMap.get(partnerDid);
      return {
        linkId: l.id,
        linkType: l.link_type,
        status: l.status,
        partnerDid,
        displayName: entity?.display_name ?? null,
        handle: entity?.handle ?? null,
        initiatedAt: l.initiated_at,
      };
    });
  }
}
