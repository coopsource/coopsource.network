import { sql, type Kysely, type Selectable } from 'kysely';
import type { Database, SharedResourceTable, ResourceBookingTable } from '@coopsource/db';
import { NotFoundError, ConflictError, ValidationError } from '@coopsource/common';
import type { DID } from '@coopsource/common';
import type { IClock } from '@coopsource/federation';
import type { IPdsService } from '@coopsource/federation';
import type { OperatorWriteProxy } from './operator-write-proxy.js';
import type { Page, PageParams } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';

type ResourceRow = Selectable<SharedResourceTable>;
type BookingRow = Selectable<ResourceBookingTable>;

export class SharedResourceService {
  constructor(
    private db: Kysely<Database>,
    private pdsService: IPdsService,
    private clock: IClock,
    private operatorWriteProxy?: OperatorWriteProxy,
  ) {}

  // ── Resources ───────────────────────────────────

  async createResource(
    cooperativeDid: string,
    createdBy: string,
    data: {
      title: string;
      description?: string | null;
      resourceType: string;
      availabilitySchedule?: Record<string, unknown> | null;
      location?: string | null;
      costPerUnit?: number | null;
      costUnit?: string | null;
    },
  ): Promise<ResourceRow> {
    const now = this.clock.now();

    // Best-effort PDS write (with operator audit logging when proxy available)
    let uri: string | null = null;
    let cid: string | null = null;
    try {
      const collection = 'network.coopsource.commerce.sharedResource';
      const record = {
        title: data.title,
        description: data.description ?? undefined,
        resourceType: data.resourceType,
        availabilitySchedule: data.availabilitySchedule ?? undefined,
        location: data.location ?? undefined,
        costPerUnit: data.costPerUnit ?? undefined,
        costUnit: data.costUnit ?? undefined,
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
      // PDS write is best-effort; resource is still materialized in PostgreSQL
    }

    try {
      const [row] = await this.db
        .insertInto('shared_resource')
        .values({
          cooperative_did: cooperativeDid,
          title: data.title,
          description: data.description ?? null,
          resource_type: data.resourceType,
          availability_schedule: data.availabilitySchedule ?? null,
          location: data.location ?? null,
          cost_per_unit: data.costPerUnit ?? null,
          cost_unit: data.costUnit ?? null,
          uri,
          cid,
          status: 'available',
          created_by: createdBy,
          created_at: now,
          updated_at: now,
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
        throw new ConflictError('A resource with these details already exists');
      }
      throw err;
    }
  }

  async updateResource(
    id: string,
    cooperativeDid: string,
    data: {
      title?: string;
      description?: string | null;
      resourceType?: string;
      availabilitySchedule?: Record<string, unknown> | null;
      location?: string | null;
      costPerUnit?: number | null;
      costUnit?: string | null;
      status?: string;
    },
  ): Promise<ResourceRow> {
    const now = this.clock.now();
    const updates: Record<string, unknown> = { updated_at: now };

    if (data.title !== undefined) updates.title = data.title;
    if (data.description !== undefined) updates.description = data.description;
    if (data.resourceType !== undefined) updates.resource_type = data.resourceType;
    if (data.availabilitySchedule !== undefined) {
      updates.availability_schedule = data.availabilitySchedule
        ? JSON.stringify(data.availabilitySchedule)
        : null;
    }
    if (data.location !== undefined) updates.location = data.location;
    if (data.costPerUnit !== undefined) updates.cost_per_unit = data.costPerUnit;
    if (data.costUnit !== undefined) updates.cost_unit = data.costUnit;
    if (data.status !== undefined) updates.status = data.status;

    const [row] = await this.db
      .updateTable('shared_resource')
      .set(updates)
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .returningAll()
      .execute();

    if (!row) throw new NotFoundError('Shared resource not found');
    return row;
  }

  async getResource(id: string): Promise<ResourceRow> {
    const row = await this.db
      .selectFrom('shared_resource')
      .where('id', '=', id)
      .selectAll()
      .executeTakeFirst();

    if (!row) throw new NotFoundError('Shared resource not found');
    return row;
  }

  async listResources(
    cooperativeDid: string,
    params: PageParams,
    filters?: {
      resourceType?: string;
      status?: string;
    },
  ): Promise<Page<ResourceRow>> {
    const limit = params.limit ?? 50;

    let query = this.db
      .selectFrom('shared_resource')
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1);

    if (filters?.resourceType) {
      query = query.where('resource_type', '=', filters.resourceType);
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

  async searchResources(
    params: PageParams,
    filters: {
      resourceType?: string;
      location?: string;
    },
  ): Promise<Page<ResourceRow>> {
    const limit = params.limit ?? 50;

    let query = this.db
      .selectFrom('shared_resource')
      .where('status', '=', 'available')
      .selectAll()
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1);

    if (filters.resourceType) {
      query = query.where('resource_type', '=', filters.resourceType);
    }
    if (filters.location) {
      query = query.where('location', '=', filters.location);
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

  async deleteResource(id: string, cooperativeDid: string): Promise<ResourceRow> {
    const [row] = await this.db
      .updateTable('shared_resource')
      .set({ status: 'unavailable', updated_at: this.clock.now() })
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .returningAll()
      .execute();

    if (!row) throw new NotFoundError('Shared resource not found');
    return row;
  }

  // ── Bookings ────────────────────────────────────

  async createBooking(
    resourceId: string,
    requestingDid: string,
    data: {
      startsAt: string;
      endsAt: string;
      purpose?: string | null;
    },
  ): Promise<BookingRow> {
    // Verify the resource exists and is available
    const resource = await this.db
      .selectFrom('shared_resource')
      .where('id', '=', resourceId)
      .select(['id', 'status'])
      .executeTakeFirst();

    if (!resource) throw new NotFoundError('Shared resource not found');
    if (resource.status !== 'available') {
      throw new ValidationError('Resource is not available for booking');
    }

    const now = this.clock.now();

    try {
      const [row] = await this.db
        .insertInto('resource_booking')
        .values({
          resource_id: resourceId,
          requesting_did: requestingDid,
          starts_at: data.startsAt,
          ends_at: data.endsAt,
          purpose: data.purpose ?? null,
          status: 'pending',
          cost_total: null,
          approved_by: null,
          approved_at: null,
          created_at: now,
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
        throw new ConflictError('A booking already exists for this time slot');
      }
      throw err;
    }
  }

  async reviewBooking(
    id: string,
    cooperativeDid: string,
    approverDid: string,
    action: 'approve' | 'reject',
  ): Promise<BookingRow> {
    // Verify the booking exists and belongs to a resource owned by this cooperative
    const booking = await this.db
      .selectFrom('resource_booking')
      .innerJoin('shared_resource', (join) =>
        join.on(sql`shared_resource.id::text`, '=', sql.ref('resource_booking.resource_id')),
      )
      .where('resource_booking.id', '=', id)
      .where('shared_resource.cooperative_did', '=', cooperativeDid)
      .select([
        'resource_booking.id',
        'resource_booking.status',
      ])
      .executeTakeFirst();

    if (!booking) throw new NotFoundError('Booking not found');

    if (booking.status !== 'pending') {
      throw new ValidationError(
        `Cannot ${action} booking in '${booking.status}' status; must be 'pending'`,
      );
    }

    const now = this.clock.now();
    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    const [row] = await this.db
      .updateTable('resource_booking')
      .set({
        status: newStatus,
        approved_by: action === 'approve' ? approverDid : null,
        approved_at: action === 'approve' ? now : null,
        indexed_at: now,
      })
      .where('id', '=', id)
      .returningAll()
      .execute();

    if (!row) throw new NotFoundError('Booking not found');
    return row;
  }

  async listBookings(
    resourceId: string | undefined,
    requestingDid: string | undefined,
    params: PageParams,
  ): Promise<Page<BookingRow>> {
    const limit = params.limit ?? 50;

    let query = this.db
      .selectFrom('resource_booking')
      .selectAll()
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1);

    if (resourceId) {
      query = query.where('resource_id', '=', resourceId);
    }
    if (requestingDid) {
      query = query.where('requesting_did', '=', requestingDid);
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
}
