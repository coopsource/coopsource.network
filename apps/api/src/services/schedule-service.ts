import type { Kysely, Selectable } from 'kysely';
import type { Database, ScheduleShiftTable } from '@coopsource/db';
import { NotFoundError, ValidationError } from '@coopsource/common';
import type { IClock } from '@coopsource/federation';
import type { IPdsService } from '@coopsource/federation';
import type { DID } from '@coopsource/common';
import type { Page, PageParams } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';

type ShiftRow = Selectable<ScheduleShiftTable>;

const SHIFT_STATUS_TRANSITIONS: Record<string, string[]> = {
  open: ['assigned', 'cancelled'],
  assigned: ['completed', 'open', 'cancelled'],
  completed: [],
  cancelled: ['open'],
};

export class ScheduleService {
  constructor(
    private db: Kysely<Database>,
    private pdsService: IPdsService,
    private clock: IClock,
  ) {}

  // ─── Create ─────────────────────────────────────────────────────────────

  async createShift(
    cooperativeDid: string,
    createdBy: string,
    data: {
      title: string;
      description?: string | null;
      assignedDid?: string | null;
      startsAt: string | Date;
      endsAt: string | Date;
      recurrence?: string | null;
      location?: string | null;
    },
  ): Promise<ShiftRow> {
    const now = this.clock.now();
    const startsAt = new Date(data.startsAt);
    const endsAt = new Date(data.endsAt);

    if (endsAt.getTime() <= startsAt.getTime()) {
      throw new ValidationError('endsAt must be after startsAt');
    }

    const status = data.assignedDid ? 'assigned' : 'open';

    // Best-effort PDS write for federation discoverability
    try {
      await this.pdsService.createRecord({
        did: cooperativeDid as DID,
        collection: 'network.coopsource.ops.scheduleShift',
        record: {
          title: data.title,
          description: data.description ?? undefined,
          assignedDid: data.assignedDid ?? undefined,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          recurrence: data.recurrence ?? undefined,
          location: data.location ?? undefined,
          status,
          createdBy,
          createdAt: now.toISOString(),
        },
      });
    } catch {
      // best-effort — shift table is the source of truth
    }

    const [row] = await this.db
      .insertInto('schedule_shift')
      .values({
        cooperative_did: cooperativeDid,
        title: data.title,
        description: data.description ?? null,
        assigned_did: data.assignedDid ?? null,
        starts_at: startsAt,
        ends_at: endsAt,
        recurrence: data.recurrence ?? null,
        location: data.location ?? null,
        status,
        created_by: createdBy,
        created_at: now,
        updated_at: now,
      })
      .returningAll()
      .execute();

    return row!;
  }

  // ─── Update ─────────────────────────────────────────────────────────────

  async updateShift(
    id: string,
    cooperativeDid: string,
    data: {
      title?: string;
      description?: string | null;
      assignedDid?: string | null;
      startsAt?: string | Date;
      endsAt?: string | Date;
      recurrence?: string | null;
      location?: string | null;
      status?: string;
    },
  ): Promise<ShiftRow> {
    const existing = await this.db
      .selectFrom('schedule_shift')
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .executeTakeFirst();

    if (!existing) {
      throw new NotFoundError('Shift not found');
    }

    // Validate status transition if status is being changed
    if (data.status !== undefined && data.status !== existing.status) {
      const allowed = SHIFT_STATUS_TRANSITIONS[existing.status];
      if (!allowed || !allowed.includes(data.status)) {
        throw new ValidationError(
          `Cannot transition shift from '${existing.status}' to '${data.status}'`,
        );
      }
    }

    const now = this.clock.now();
    const updates: Record<string, unknown> = { updated_at: now };

    if (data.title !== undefined) updates.title = data.title;
    if (data.description !== undefined) updates.description = data.description;
    if (data.assignedDid !== undefined) updates.assigned_did = data.assignedDid;
    if (data.startsAt !== undefined) updates.starts_at = new Date(data.startsAt);
    if (data.endsAt !== undefined) updates.ends_at = new Date(data.endsAt);
    if (data.recurrence !== undefined) updates.recurrence = data.recurrence;
    if (data.location !== undefined) updates.location = data.location;
    if (data.status !== undefined) updates.status = data.status;

    // Validate time ordering if either time is changing
    const effectiveStartsAt = data.startsAt
      ? new Date(data.startsAt)
      : existing.starts_at;
    const effectiveEndsAt = data.endsAt
      ? new Date(data.endsAt)
      : existing.ends_at;
    if (effectiveEndsAt.getTime() <= effectiveStartsAt.getTime()) {
      throw new ValidationError('endsAt must be after startsAt');
    }

    const [row] = await this.db
      .updateTable('schedule_shift')
      .set(updates)
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .returningAll()
      .execute();

    if (!row) throw new NotFoundError('Shift not found');
    return row;
  }

  // ─── Read ───────────────────────────────────────────────────────────────

  async getShift(id: string, cooperativeDid: string): Promise<ShiftRow> {
    const row = await this.db
      .selectFrom('schedule_shift')
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .executeTakeFirst();

    if (!row) throw new NotFoundError('Shift not found');
    return row;
  }

  async listShifts(
    cooperativeDid: string,
    params: PageParams,
    filters?: {
      status?: string;
      assignedDid?: string;
      startAfter?: string;
      endBefore?: string;
    },
  ): Promise<Page<ShiftRow>> {
    const limit = params.limit ?? 50;

    let query = this.db
      .selectFrom('schedule_shift')
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .orderBy('starts_at', 'asc')
      .orderBy('id', 'asc')
      .limit(limit + 1);

    if (filters?.status) {
      query = query.where('status', '=', filters.status);
    }
    if (filters?.assignedDid) {
      query = query.where('assigned_did', '=', filters.assignedDid);
    }
    if (filters?.startAfter) {
      query = query.where('starts_at', '>', new Date(filters.startAfter));
    }
    if (filters?.endBefore) {
      query = query.where('ends_at', '<', new Date(filters.endBefore));
    }

    if (params.cursor) {
      const { t, i } = decodeCursor(params.cursor);
      query = query.where((eb) =>
        eb.or([
          eb('starts_at', '>', new Date(t)),
          eb.and([
            eb('starts_at', '=', new Date(t)),
            eb('id', '>', i),
          ]),
        ]),
      );
    }

    const rows = await query.execute();
    const slice = rows.slice(0, limit);
    const cursor =
      rows.length > limit
        ? encodeCursor(slice[slice.length - 1]!.starts_at, slice[slice.length - 1]!.id)
        : undefined;

    return { items: slice, cursor };
  }

  // ─── Delete ─────────────────────────────────────────────────────────────

  async deleteShift(id: string, cooperativeDid: string): Promise<void> {
    const existing = await this.db
      .selectFrom('schedule_shift')
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .select(['id', 'status'])
      .executeTakeFirst();

    if (!existing) {
      throw new NotFoundError('Shift not found');
    }
    if (existing.status !== 'open' && existing.status !== 'cancelled') {
      throw new ValidationError('Only open or cancelled shifts can be deleted');
    }

    const result = await this.db
      .deleteFrom('schedule_shift')
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .executeTakeFirst();

    if (result.numDeletedRows === 0n) {
      throw new NotFoundError('Shift not found');
    }
  }

  // ─── Claim ──────────────────────────────────────────────────────────────

  async claimShift(
    id: string,
    cooperativeDid: string,
    memberDid: string,
  ): Promise<ShiftRow> {
    const existing = await this.db
      .selectFrom('schedule_shift')
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .executeTakeFirst();

    if (!existing) {
      throw new NotFoundError('Shift not found');
    }
    if (existing.status !== 'open') {
      throw new ValidationError('Only open shifts can be claimed');
    }

    const now = this.clock.now();

    const [row] = await this.db
      .updateTable('schedule_shift')
      .set({
        assigned_did: memberDid,
        status: 'assigned',
        updated_at: now,
      })
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .where('status', '=', 'open')
      .returningAll()
      .execute();

    if (!row) throw new NotFoundError('Shift not found or already claimed');
    return row;
  }

  // ─── Complete ───────────────────────────────────────────────────────────

  async completeShift(
    id: string,
    cooperativeDid: string,
  ): Promise<ShiftRow> {
    const existing = await this.db
      .selectFrom('schedule_shift')
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .executeTakeFirst();

    if (!existing) {
      throw new NotFoundError('Shift not found');
    }
    if (existing.status !== 'assigned') {
      throw new ValidationError('Only assigned shifts can be completed');
    }

    const now = this.clock.now();

    const [row] = await this.db
      .updateTable('schedule_shift')
      .set({
        status: 'completed',
        updated_at: now,
      })
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .where('status', '=', 'assigned')
      .returningAll()
      .execute();

    if (!row) throw new NotFoundError('Shift not found or not assigned');
    return row;
  }

  // ─── Fairness Summary ──────────────────────────────────────────────────

  async getFairnessSummary(
    cooperativeDid: string,
    startDate: string,
    endDate: string,
  ): Promise<Array<{ memberDid: string; shiftCount: number }>> {
    const rows = await this.db
      .selectFrom('schedule_shift')
      .where('cooperative_did', '=', cooperativeDid)
      .where('status', 'in', ['assigned', 'completed'])
      .where('assigned_did', 'is not', null)
      .where('starts_at', '>=', new Date(startDate))
      .where('starts_at', '<', new Date(endDate))
      .groupBy('assigned_did')
      .select((eb) => [
        'assigned_did',
        eb.fn.countAll<number>().as('shift_count'),
      ])
      .execute();

    return rows.map((r) => ({
      memberDid: r.assigned_did!,
      shiftCount: Number(r.shift_count),
    }));
  }
}
