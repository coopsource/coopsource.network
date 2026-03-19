import type { Kysely, Selectable } from 'kysely';
import type { Database, RevenueEntryTable } from '@coopsource/db';
import { NotFoundError } from '@coopsource/common';
import type { IClock } from '@coopsource/federation';
import type { Page, PageParams } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';

type RevenueRow = Selectable<RevenueEntryTable>;

export class RevenueService {
  constructor(
    private db: Kysely<Database>,
    private clock: IClock,
  ) {}

  async createEntry(
    cooperativeDid: string,
    recordedBy: string,
    data: {
      projectId?: string;
      title: string;
      description?: string;
      amount: number;
      currency?: string;
      source?: string;
      sourceReference?: string;
      recordedAt?: string;
      periodStart?: string;
      periodEnd?: string;
    },
  ): Promise<RevenueRow> {
    const now = this.clock.now();

    const [row] = await this.db
      .insertInto('revenue_entry')
      .values({
        cooperative_did: cooperativeDid,
        project_id: data.projectId ?? null,
        title: data.title,
        description: data.description ?? null,
        amount: data.amount,
        currency: data.currency ?? 'USD',
        source: data.source ?? null,
        source_reference: data.sourceReference ?? null,
        recorded_by: recordedBy,
        recorded_at: data.recordedAt ? new Date(data.recordedAt) : now,
        period_start: data.periodStart ? new Date(data.periodStart) : null,
        period_end: data.periodEnd ? new Date(data.periodEnd) : null,
        created_at: now,
        indexed_at: now,
      })
      .returningAll()
      .execute();

    return row!;
  }

  async updateEntry(
    id: string,
    cooperativeDid: string,
    data: {
      projectId?: string | null;
      title?: string;
      description?: string;
      amount?: number;
      currency?: string;
      source?: string | null;
      sourceReference?: string | null;
      periodStart?: string | null;
      periodEnd?: string | null;
    },
  ): Promise<RevenueRow> {
    const now = this.clock.now();
    const updates: Record<string, unknown> = { indexed_at: now };

    if (data.projectId !== undefined) updates.project_id = data.projectId;
    if (data.title !== undefined) updates.title = data.title;
    if (data.description !== undefined) updates.description = data.description;
    if (data.amount !== undefined) updates.amount = data.amount;
    if (data.currency !== undefined) updates.currency = data.currency;
    if (data.source !== undefined) updates.source = data.source;
    if (data.sourceReference !== undefined)
      updates.source_reference = data.sourceReference;
    if (data.periodStart !== undefined)
      updates.period_start = data.periodStart ? new Date(data.periodStart) : null;
    if (data.periodEnd !== undefined)
      updates.period_end = data.periodEnd ? new Date(data.periodEnd) : null;

    const [row] = await this.db
      .updateTable('revenue_entry')
      .set(updates)
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .returningAll()
      .execute();

    if (!row) throw new NotFoundError('Revenue entry not found');
    return row;
  }

  async getEntry(id: string, cooperativeDid: string): Promise<RevenueRow> {
    const row = await this.db
      .selectFrom('revenue_entry')
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .executeTakeFirst();

    if (!row) throw new NotFoundError('Revenue entry not found');
    return row;
  }

  async listEntries(
    cooperativeDid: string,
    params: PageParams,
    filters?: { projectId?: string; source?: string; startDate?: string; endDate?: string },
  ): Promise<Page<RevenueRow>> {
    const limit = params.limit ?? 50;

    let query = this.db
      .selectFrom('revenue_entry')
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .orderBy('recorded_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1);

    if (filters?.projectId) {
      query = query.where('project_id', '=', filters.projectId);
    }
    if (filters?.source) {
      query = query.where('source', '=', filters.source);
    }
    if (filters?.startDate) {
      query = query.where('recorded_at', '>=', new Date(filters.startDate));
    }
    if (filters?.endDate) {
      query = query.where('recorded_at', '<=', new Date(filters.endDate));
    }

    if (params.cursor) {
      const { t, i } = decodeCursor(params.cursor);
      query = query.where((eb) =>
        eb.or([
          eb('recorded_at', '<', new Date(t)),
          eb.and([
            eb('recorded_at', '=', new Date(t)),
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
            slice[slice.length - 1]!.recorded_at,
            slice[slice.length - 1]!.id,
          )
        : undefined;

    return { items: slice, cursor };
  }

  async deleteEntry(id: string, cooperativeDid: string): Promise<void> {
    const result = await this.db
      .deleteFrom('revenue_entry')
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .executeTakeFirst();

    if (Number(result.numDeletedRows) === 0) {
      throw new NotFoundError('Revenue entry not found');
    }
  }

  async getProjectRevenueSummary(
    cooperativeDid: string,
    projectId: string,
    startDate: string,
    endDate: string,
  ): Promise<{ totalAmount: number; count: number; currency: string }> {
    const rows = await this.db
      .selectFrom('revenue_entry')
      .where('cooperative_did', '=', cooperativeDid)
      .where('project_id', '=', projectId)
      .where('recorded_at', '>=', new Date(startDate))
      .where('recorded_at', '<=', new Date(endDate))
      .select(['amount', 'currency'])
      .execute();

    let totalAmount = 0;
    // Default currency from first entry, or USD
    const currency = rows.length > 0 ? rows[0]!.currency : 'USD';

    for (const row of rows) {
      totalAmount += Number(row.amount);
    }

    return {
      totalAmount: Math.round(totalAmount * 100) / 100,
      count: rows.length,
      currency,
    };
  }

  async getOverallRevenueSummary(
    cooperativeDid: string,
    startDate: string,
    endDate: string,
  ): Promise<Array<{ projectId: string | null; totalAmount: number; count: number }>> {
    const rows = await this.db
      .selectFrom('revenue_entry')
      .where('cooperative_did', '=', cooperativeDid)
      .where('recorded_at', '>=', new Date(startDate))
      .where('recorded_at', '<=', new Date(endDate))
      .select(['project_id as projectId'])
      .select((eb) => [
        eb.fn.sum<string>('amount').as('totalAmount'),
        eb.fn.count<string>('id').as('count'),
      ])
      .groupBy('project_id')
      .execute();

    return rows.map((row) => ({
      projectId: row.projectId,
      totalAmount: Number(row.totalAmount) || 0,
      count: Number(row.count),
    }));
  }
}
