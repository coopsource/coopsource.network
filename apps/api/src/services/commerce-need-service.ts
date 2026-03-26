import type { Kysely, Selectable } from 'kysely';
import type { Database, CommerceNeedTable } from '@coopsource/db';
import { NotFoundError, ConflictError } from '@coopsource/common';
import type { DID } from '@coopsource/common';
import type { IClock } from '@coopsource/federation';
import type { IPdsService } from '@coopsource/federation';
import type { OperatorWriteProxy } from './operator-write-proxy.js';
import type { Page, PageParams } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';

type NeedRow = Selectable<CommerceNeedTable>;

export class CommerceNeedService {
  constructor(
    private db: Kysely<Database>,
    private pdsService: IPdsService,
    private clock: IClock,
    private operatorWriteProxy?: OperatorWriteProxy,
  ) {}

  async createNeed(
    cooperativeDid: string,
    createdBy: string,
    data: {
      title: string;
      description?: string | null;
      category: string;
      urgency?: string;
      location?: string | null;
      tags?: string[];
    },
  ): Promise<NeedRow> {
    const now = this.clock.now();
    const urgency = data.urgency ?? 'normal';

    // Best-effort PDS write (with operator audit logging when proxy available)
    let uri: string | null = null;
    let cid: string | null = null;
    try {
      const collection = 'network.coopsource.commerce.need';
      const record = {
        title: data.title,
        description: data.description ?? undefined,
        category: data.category,
        urgency,
        location: data.location ?? undefined,
        tags: data.tags ?? [],
        createdBy,
        createdAt: now.toISOString(),
      };
      const result = this.operatorWriteProxy
        ? await this.operatorWriteProxy.writeCoopRecord({
            operatorDid: createdBy, cooperativeDid: cooperativeDid as DID, collection, record,
          })
        : await this.pdsService.createRecord({ did: cooperativeDid as DID, collection, record });
      uri = result.uri;
      cid = result.cid;
    } catch {
      // PDS write is best-effort; need is still materialized in PostgreSQL
    }

    try {
      const [row] = await this.db
        .insertInto('commerce_need')
        .values({
          cooperative_did: cooperativeDid,
          title: data.title,
          description: data.description ?? null,
          category: data.category,
          urgency,
          location: data.location ?? null,
          tags: data.tags ?? [],
          uri,
          cid,
          status: 'open',
          created_by: createdBy,
          created_at: now,
          updated_at: now,
          indexed_at: now,
        })
        .returningAll()
        .execute();

      return row!;
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        (err.message.includes('duplicate key') ||
         err.message.includes('unique constraint'))
      ) {
        throw new ConflictError('A need with these details already exists');
      }
      throw err;
    }
  }

  async updateNeed(
    id: string,
    cooperativeDid: string,
    data: {
      title?: string;
      description?: string | null;
      category?: string;
      urgency?: string;
      location?: string | null;
      tags?: string[];
      status?: string;
    },
  ): Promise<NeedRow> {
    const now = this.clock.now();
    const updates: Record<string, unknown> = { updated_at: now, indexed_at: now };

    if (data.title !== undefined) updates.title = data.title;
    if (data.description !== undefined) updates.description = data.description;
    if (data.category !== undefined) updates.category = data.category;
    if (data.urgency !== undefined) updates.urgency = data.urgency;
    if (data.location !== undefined) updates.location = data.location;
    if (data.tags !== undefined) updates.tags = data.tags;
    if (data.status !== undefined) updates.status = data.status;

    const [row] = await this.db
      .updateTable('commerce_need')
      .set(updates)
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .returningAll()
      .execute();

    if (!row) throw new NotFoundError('Need not found');
    return row;
  }

  async getNeed(id: string): Promise<NeedRow> {
    const row = await this.db
      .selectFrom('commerce_need')
      .where('id', '=', id)
      .selectAll()
      .executeTakeFirst();

    if (!row) throw new NotFoundError('Need not found');
    return row;
  }

  async listNeeds(
    cooperativeDid: string,
    params: PageParams,
    filters?: {
      category?: string;
      status?: string;
      urgency?: string;
    },
  ): Promise<Page<NeedRow>> {
    const limit = params.limit ?? 50;

    let query = this.db
      .selectFrom('commerce_need')
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1);

    if (filters?.category) {
      query = query.where('category', '=', filters.category);
    }
    if (filters?.status) {
      query = query.where('status', '=', filters.status);
    }
    if (filters?.urgency) {
      query = query.where('urgency', '=', filters.urgency);
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
        ? encodeCursor(slice[slice.length - 1]!.created_at, slice[slice.length - 1]!.id)
        : undefined;

    return { items: slice, cursor };
  }

  async searchNeeds(
    params: PageParams,
    filters: {
      category?: string;
      urgency?: string;
    },
  ): Promise<Page<NeedRow>> {
    const limit = params.limit ?? 50;

    let query = this.db
      .selectFrom('commerce_need')
      .where('status', '=', 'open')
      .selectAll()
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1);

    if (filters.category) {
      query = query.where('category', '=', filters.category);
    }
    if (filters.urgency) {
      query = query.where('urgency', '=', filters.urgency);
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
        ? encodeCursor(slice[slice.length - 1]!.created_at, slice[slice.length - 1]!.id)
        : undefined;

    return { items: slice, cursor };
  }

  async deleteNeed(id: string, cooperativeDid: string): Promise<NeedRow> {
    const [row] = await this.db
      .updateTable('commerce_need')
      .set({ status: 'cancelled', updated_at: this.clock.now(), indexed_at: this.clock.now() })
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .returningAll()
      .execute();

    if (!row) throw new NotFoundError('Need not found');
    return row;
  }
}
