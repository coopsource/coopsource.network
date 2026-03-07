import type { Kysely, Selectable } from 'kysely';
import type { Database, ComplianceItemTable } from '@coopsource/db';
import { NotFoundError, ConflictError } from '@coopsource/common';
import type { IClock } from '@coopsource/federation';
import type { Page, PageParams } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';

type ComplianceRow = Selectable<ComplianceItemTable>;

export class ComplianceCalendarService {
  constructor(
    private db: Kysely<Database>,
    private clock: IClock,
  ) {}

  async create(
    cooperativeDid: string,
    data: {
      title: string;
      description?: string;
      dueDate: string;
      filingType: string;
    },
  ): Promise<ComplianceRow> {
    const now = this.clock.now();

    const [row] = await this.db
      .insertInto('compliance_item')
      .values({
        cooperative_did: cooperativeDid,
        title: data.title,
        description: data.description ?? null,
        due_date: new Date(data.dueDate),
        filing_type: data.filingType,
        status: 'pending',
        created_at: now,
        indexed_at: now,
      })
      .returningAll()
      .execute();

    return row!;
  }

  async list(
    cooperativeDid: string,
    params: PageParams & { status?: string },
  ): Promise<Page<ComplianceRow>> {
    const limit = params.limit ?? 50;

    let query = this.db
      .selectFrom('compliance_item')
      .where('cooperative_did', '=', cooperativeDid)
      .where('invalidated_at', 'is', null)
      .selectAll()
      .orderBy('due_date', 'asc')
      .orderBy('id', 'asc')
      .limit(limit + 1);

    if (params.status) {
      query = query.where('status', '=', params.status);
    }

    if (params.cursor) {
      const { t, i } = decodeCursor(params.cursor);
      query = query.where((eb) =>
        eb.or([
          eb('due_date', '>', new Date(t)),
          eb.and([
            eb('due_date', '=', new Date(t)),
            eb('id', '>', i),
          ]),
        ]),
      );
    }

    const rows = await query.execute();
    const slice = rows.slice(0, limit);
    const cursor =
      rows.length > limit
        ? encodeCursor(
            slice[slice.length - 1]!.due_date,
            slice[slice.length - 1]!.id,
          )
        : undefined;

    return { items: slice, cursor };
  }

  async markCompleted(
    id: string,
    completedBy: string,
  ): Promise<ComplianceRow> {
    const existing = await this.db
      .selectFrom('compliance_item')
      .where('id', '=', id)
      .where('invalidated_at', 'is', null)
      .selectAll()
      .executeTakeFirst();

    if (!existing) throw new NotFoundError('Compliance item not found');
    if (existing.status === 'completed') {
      throw new ConflictError('Compliance item is already completed');
    }

    const now = this.clock.now();

    const [row] = await this.db
      .updateTable('compliance_item')
      .set({
        status: 'completed',
        completed_at: now,
        completed_by: completedBy,
        indexed_at: now,
      })
      .where('id', '=', id)
      .returningAll()
      .execute();

    return row!;
  }

  async getOverdue(cooperativeDid: string): Promise<ComplianceRow[]> {
    const now = this.clock.now();

    // First, auto-update pending items that are now overdue
    await this.db
      .updateTable('compliance_item')
      .set({ status: 'overdue', indexed_at: now })
      .where('cooperative_did', '=', cooperativeDid)
      .where('status', '=', 'pending')
      .where('due_date', '<', now)
      .where('invalidated_at', 'is', null)
      .execute();

    return this.db
      .selectFrom('compliance_item')
      .where('cooperative_did', '=', cooperativeDid)
      .where('status', '=', 'overdue')
      .where('invalidated_at', 'is', null)
      .selectAll()
      .orderBy('due_date', 'asc')
      .execute();
  }
}
