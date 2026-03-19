import type { Kysely, Selectable } from 'kysely';
import type { Database, CommerceListingTable } from '@coopsource/db';
import { NotFoundError, ConflictError } from '@coopsource/common';
import type { DID } from '@coopsource/common';
import type { IClock } from '@coopsource/federation';
import type { IPdsService } from '@coopsource/federation';
import type { Page, PageParams } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';

type ListingRow = Selectable<CommerceListingTable>;

export class CommerceListingService {
  constructor(
    private db: Kysely<Database>,
    private pdsService: IPdsService,
    private clock: IClock,
  ) {}

  async createListing(
    cooperativeDid: string,
    createdBy: string,
    data: {
      title: string;
      description?: string | null;
      category: string;
      availability: string;
      location?: string | null;
      cooperativeType?: string | null;
      tags?: string[];
    },
  ): Promise<ListingRow> {
    const now = this.clock.now();

    // Best-effort PDS write
    let uri: string | null = null;
    let cid: string | null = null;
    try {
      const result = await this.pdsService.createRecord({
        did: cooperativeDid as DID,
        collection: 'network.coopsource.commerce.listing',
        record: {
          title: data.title,
          description: data.description ?? undefined,
          category: data.category,
          availability: data.availability,
          location: data.location ?? undefined,
          cooperativeType: data.cooperativeType ?? undefined,
          tags: data.tags ?? [],
          createdBy,
          createdAt: now.toISOString(),
        },
      });
      uri = result.uri;
      cid = result.cid;
    } catch {
      // PDS write is best-effort; listing is still materialized in PostgreSQL
    }

    try {
      const [row] = await this.db
        .insertInto('commerce_listing')
        .values({
          cooperative_did: cooperativeDid,
          title: data.title,
          description: data.description ?? null,
          category: data.category,
          availability: data.availability,
          location: data.location ?? null,
          cooperative_type: data.cooperativeType ?? null,
          tags: data.tags ?? [],
          uri,
          cid,
          status: 'active',
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
        throw new ConflictError('A listing with these details already exists');
      }
      throw err;
    }
  }

  async updateListing(
    id: string,
    cooperativeDid: string,
    data: {
      title?: string;
      description?: string | null;
      category?: string;
      availability?: string;
      location?: string | null;
      cooperativeType?: string | null;
      tags?: string[];
      status?: string;
    },
  ): Promise<ListingRow> {
    const now = this.clock.now();
    const updates: Record<string, unknown> = { updated_at: now, indexed_at: now };

    if (data.title !== undefined) updates.title = data.title;
    if (data.description !== undefined) updates.description = data.description;
    if (data.category !== undefined) updates.category = data.category;
    if (data.availability !== undefined) updates.availability = data.availability;
    if (data.location !== undefined) updates.location = data.location;
    if (data.cooperativeType !== undefined) updates.cooperative_type = data.cooperativeType;
    if (data.tags !== undefined) updates.tags = data.tags;
    if (data.status !== undefined) updates.status = data.status;

    const [row] = await this.db
      .updateTable('commerce_listing')
      .set(updates)
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .returningAll()
      .execute();

    if (!row) throw new NotFoundError('Listing not found');
    return row;
  }

  async getListing(id: string): Promise<ListingRow> {
    const row = await this.db
      .selectFrom('commerce_listing')
      .where('id', '=', id)
      .selectAll()
      .executeTakeFirst();

    if (!row) throw new NotFoundError('Listing not found');
    return row;
  }

  async listListings(
    cooperativeDid: string,
    params: PageParams,
    filters?: {
      category?: string;
      status?: string;
    },
  ): Promise<Page<ListingRow>> {
    const limit = params.limit ?? 50;

    let query = this.db
      .selectFrom('commerce_listing')
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

  async searchListings(
    params: PageParams,
    filters: {
      category?: string;
      location?: string;
      tags?: string[];
      query?: string;
    },
  ): Promise<Page<ListingRow>> {
    const limit = params.limit ?? 50;

    let query = this.db
      .selectFrom('commerce_listing')
      .where('status', '=', 'active')
      .selectAll()
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1);

    if (filters.category) {
      query = query.where('category', '=', filters.category);
    }
    if (filters.location) {
      query = query.where('location', '=', filters.location);
    }
    if (filters.tags && filters.tags.length > 0) {
      query = query.where('tags', '@>', filters.tags);
    }
    if (filters.query) {
      const term = `%${filters.query}%`;
      query = query.where((eb) =>
        eb.or([
          eb('title', 'ilike', term),
          eb('description', 'ilike', term),
        ]),
      );
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

  async deleteListing(id: string, cooperativeDid: string): Promise<ListingRow> {
    const [row] = await this.db
      .updateTable('commerce_listing')
      .set({ status: 'archived', updated_at: this.clock.now(), indexed_at: this.clock.now() })
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .returningAll()
      .execute();

    if (!row) throw new NotFoundError('Listing not found');
    return row;
  }
}
