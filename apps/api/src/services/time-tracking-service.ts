import type { Kysely, Selectable } from 'kysely';
import type { Database, TimeEntryTable } from '@coopsource/db';
import { NotFoundError, ValidationError } from '@coopsource/common';
import type { IClock } from '@coopsource/federation';
import type { Page, PageParams } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';

type EntryRow = Selectable<TimeEntryTable>;

const VALID_STATUSES = ['draft', 'submitted', 'approved', 'rejected'] as const;

export class TimeTrackingService {
  constructor(
    private db: Kysely<Database>,
    private clock: IClock,
  ) {}

  // ─── Create ─────────────────────────────────────────────────────────────

  async createEntry(
    cooperativeDid: string,
    memberDid: string,
    data: {
      taskId?: string | null;
      projectId?: string | null;
      description?: string | null;
      startedAt: string | Date;
      endedAt?: string | Date | null;
      durationMinutes?: number | null;
    },
  ): Promise<EntryRow> {
    const now = this.clock.now();
    const startedAt = new Date(data.startedAt);

    let endedAt: Date | null = data.endedAt ? new Date(data.endedAt) : null;
    let durationMinutes: number | null = data.durationMinutes ?? null;

    // Compute duration from start/end if not explicitly provided
    if (endedAt && durationMinutes === null) {
      const diffMs = endedAt.getTime() - startedAt.getTime();
      if (diffMs < 0) {
        throw new ValidationError('endedAt must be after startedAt');
      }
      durationMinutes = Math.round(diffMs / 60_000);
    }

    const [row] = await this.db
      .insertInto('time_entry')
      .values({
        cooperative_did: cooperativeDid,
        member_did: memberDid,
        task_id: data.taskId ?? null,
        project_id: data.projectId ?? null,
        description: data.description ?? null,
        started_at: startedAt,
        ended_at: endedAt,
        duration_minutes: durationMinutes,
        status: 'draft',
        approved_by: null,
        approved_at: null,
        created_at: now,
        indexed_at: now,
      })
      .returningAll()
      .execute();

    return row!;
  }

  // ─── Update ─────────────────────────────────────────────────────────────

  async updateEntry(
    id: string,
    cooperativeDid: string,
    memberDid: string,
    data: {
      taskId?: string | null;
      projectId?: string | null;
      description?: string | null;
      startedAt?: string | Date;
      endedAt?: string | Date | null;
      durationMinutes?: number | null;
    },
  ): Promise<EntryRow> {
    // Verify entry exists, belongs to this member, and is in draft status
    const existing = await this.db
      .selectFrom('time_entry')
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .where('member_did', '=', memberDid)
      .selectAll()
      .executeTakeFirst();

    if (!existing) {
      throw new NotFoundError('Time entry not found');
    }
    if (existing.status !== 'draft') {
      throw new ValidationError('Only draft entries can be updated');
    }

    const now = this.clock.now();
    const updates: Record<string, unknown> = { indexed_at: now };

    if (data.taskId !== undefined) updates.task_id = data.taskId;
    if (data.projectId !== undefined) updates.project_id = data.projectId;
    if (data.description !== undefined) updates.description = data.description;
    if (data.startedAt !== undefined) updates.started_at = new Date(data.startedAt);
    if (data.endedAt !== undefined) updates.ended_at = data.endedAt ? new Date(data.endedAt) : null;
    if (data.durationMinutes !== undefined) updates.duration_minutes = data.durationMinutes;

    // Re-compute duration if endedAt changed and durationMinutes not explicitly set
    if (data.endedAt !== undefined && data.durationMinutes === undefined) {
      const startedAt = data.startedAt
        ? new Date(data.startedAt)
        : existing.started_at;
      const endedAt = data.endedAt ? new Date(data.endedAt) : null;
      if (endedAt) {
        const diffMs = endedAt.getTime() - startedAt.getTime();
        if (diffMs < 0) {
          throw new ValidationError('endedAt must be after startedAt');
        }
        updates.duration_minutes = Math.round(diffMs / 60_000);
      }
    }

    const [row] = await this.db
      .updateTable('time_entry')
      .set(updates)
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .where('member_did', '=', memberDid)
      .returningAll()
      .execute();

    if (!row) throw new NotFoundError('Time entry not found');
    return row;
  }

  // ─── Read ───────────────────────────────────────────────────────────────

  async getEntry(id: string, cooperativeDid: string): Promise<EntryRow> {
    const row = await this.db
      .selectFrom('time_entry')
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .executeTakeFirst();

    if (!row) throw new NotFoundError('Time entry not found');
    return row;
  }

  async listEntries(
    cooperativeDid: string,
    params: PageParams,
    filters?: {
      memberDid?: string;
      taskId?: string;
      projectId?: string;
      status?: string;
    },
  ): Promise<Page<EntryRow>> {
    const limit = params.limit ?? 50;

    let query = this.db
      .selectFrom('time_entry')
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1);

    if (filters?.memberDid) {
      query = query.where('member_did', '=', filters.memberDid);
    }
    if (filters?.taskId) {
      query = query.where('task_id', '=', filters.taskId);
    }
    if (filters?.projectId) {
      query = query.where('project_id', '=', filters.projectId);
    }
    if (filters?.status) {
      if (!VALID_STATUSES.includes(filters.status as typeof VALID_STATUSES[number])) {
        throw new ValidationError(`Invalid status filter: ${filters.status}`);
      }
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

  // ─── Submit ─────────────────────────────────────────────────────────────

  async submitEntries(
    cooperativeDid: string,
    memberDid: string,
    entryIds: string[],
  ): Promise<EntryRow[]> {
    if (entryIds.length === 0) {
      throw new ValidationError('No entry IDs provided');
    }

    // Verify all entries belong to this member and cooperative, and are in draft status
    const entries = await this.db
      .selectFrom('time_entry')
      .where('id', 'in', entryIds)
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .execute();

    if (entries.length !== entryIds.length) {
      throw new NotFoundError('One or more time entries not found');
    }

    for (const entry of entries) {
      if (entry.member_did !== memberDid) {
        throw new ValidationError('Cannot submit entries belonging to another member');
      }
      if (entry.status !== 'draft') {
        throw new ValidationError(`Entry ${entry.id} is not in draft status`);
      }
    }

    const now = this.clock.now();

    const rows = await this.db
      .updateTable('time_entry')
      .set({ status: 'submitted', indexed_at: now })
      .where('id', 'in', entryIds)
      .where('cooperative_did', '=', cooperativeDid)
      .where('member_did', '=', memberDid)
      .where('status', '=', 'draft')
      .returningAll()
      .execute();

    return rows;
  }

  // ─── Review ─────────────────────────────────────────────────────────────

  async reviewEntries(
    cooperativeDid: string,
    reviewerDid: string,
    entryIds: string[],
    action: 'approve' | 'reject',
  ): Promise<EntryRow[]> {
    if (entryIds.length === 0) {
      throw new ValidationError('No entry IDs provided');
    }

    // Verify all entries exist, belong to this cooperative, and are submitted
    const entries = await this.db
      .selectFrom('time_entry')
      .where('id', 'in', entryIds)
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .execute();

    if (entries.length !== entryIds.length) {
      throw new NotFoundError('One or more time entries not found');
    }

    for (const entry of entries) {
      if (entry.status !== 'submitted') {
        throw new ValidationError(`Entry ${entry.id} is not in submitted status`);
      }
    }

    const now = this.clock.now();
    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    const updates: Record<string, unknown> = {
      status: newStatus,
      indexed_at: now,
    };

    if (action === 'approve') {
      updates.approved_by = reviewerDid;
      updates.approved_at = now;
    }

    const rows = await this.db
      .updateTable('time_entry')
      .set(updates)
      .where('id', 'in', entryIds)
      .where('cooperative_did', '=', cooperativeDid)
      .where('status', '=', 'submitted')
      .returningAll()
      .execute();

    return rows;
  }

  // ─── Delete ─────────────────────────────────────────────────────────────

  async deleteEntry(
    id: string,
    cooperativeDid: string,
    memberDid: string,
  ): Promise<void> {
    // Verify entry exists and is in draft status
    const existing = await this.db
      .selectFrom('time_entry')
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .where('member_did', '=', memberDid)
      .select(['id', 'status'])
      .executeTakeFirst();

    if (!existing) {
      throw new NotFoundError('Time entry not found');
    }
    if (existing.status !== 'draft') {
      throw new ValidationError('Only draft entries can be deleted');
    }

    const result = await this.db
      .deleteFrom('time_entry')
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .where('member_did', '=', memberDid)
      .executeTakeFirst();

    if (result.numDeletedRows === 0n) {
      throw new NotFoundError('Time entry not found');
    }
  }

  // ─── Summaries ──────────────────────────────────────────────────────────

  async getMemberSummary(
    cooperativeDid: string,
    memberDid: string,
    startDate: string,
    endDate: string,
  ): Promise<{ totalMinutes: number; entryCount: number }> {
    const result = await this.db
      .selectFrom('time_entry')
      .where('cooperative_did', '=', cooperativeDid)
      .where('member_did', '=', memberDid)
      .where('status', '=', 'approved')
      .where('started_at', '>=', new Date(startDate))
      .where('started_at', '<', new Date(endDate))
      .select((eb) => [
        eb.fn.coalesce(eb.fn.sum<number>('duration_minutes'), eb.lit(0)).as('total_minutes'),
        eb.fn.countAll<number>().as('entry_count'),
      ])
      .executeTakeFirst();

    return {
      totalMinutes: Number(result?.total_minutes ?? 0),
      entryCount: Number(result?.entry_count ?? 0),
    };
  }

  async getProjectSummary(
    cooperativeDid: string,
    projectId: string,
    startDate: string,
    endDate: string,
  ): Promise<Array<{ memberDid: string; totalMinutes: number; entryCount: number }>> {
    const rows = await this.db
      .selectFrom('time_entry')
      .where('cooperative_did', '=', cooperativeDid)
      .where('project_id', '=', projectId)
      .where('status', '=', 'approved')
      .where('started_at', '>=', new Date(startDate))
      .where('started_at', '<', new Date(endDate))
      .groupBy('member_did')
      .select((eb) => [
        'member_did',
        eb.fn.coalesce(eb.fn.sum<number>('duration_minutes'), eb.lit(0)).as('total_minutes'),
        eb.fn.countAll<number>().as('entry_count'),
      ])
      .execute();

    return rows.map((r) => ({
      memberDid: r.member_did,
      totalMinutes: Number(r.total_minutes),
      entryCount: Number(r.entry_count),
    }));
  }
}
