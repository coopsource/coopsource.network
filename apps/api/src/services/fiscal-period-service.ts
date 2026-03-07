import type { Kysely, Selectable } from 'kysely';
import type { Database, FiscalPeriodTable } from '@coopsource/db';
import { NotFoundError, ConflictError } from '@coopsource/common';
import type { IClock } from '@coopsource/federation';
import type { Page, PageParams } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';

type FiscalRow = Selectable<FiscalPeriodTable>;

export class FiscalPeriodService {
  constructor(
    private db: Kysely<Database>,
    private clock: IClock,
  ) {}

  async create(
    cooperativeDid: string,
    data: {
      label: string;
      startsAt: string;
      endsAt: string;
    },
  ): Promise<FiscalRow> {
    const now = this.clock.now();

    const [row] = await this.db
      .insertInto('fiscal_period')
      .values({
        cooperative_did: cooperativeDid,
        label: data.label,
        starts_at: new Date(data.startsAt),
        ends_at: new Date(data.endsAt),
        status: 'open',
        created_at: now,
        indexed_at: now,
      })
      .returningAll()
      .execute();

    return row!;
  }

  async list(
    cooperativeDid: string,
    params: PageParams,
  ): Promise<Page<FiscalRow>> {
    const limit = params.limit ?? 50;

    let query = this.db
      .selectFrom('fiscal_period')
      .where('cooperative_did', '=', cooperativeDid)
      .where('invalidated_at', 'is', null)
      .selectAll()
      .orderBy('starts_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1);

    if (params.cursor) {
      const { t, i } = decodeCursor(params.cursor);
      query = query.where((eb) =>
        eb.or([
          eb('starts_at', '<', new Date(t)),
          eb.and([
            eb('starts_at', '=', new Date(t)),
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
            slice[slice.length - 1]!.starts_at,
            slice[slice.length - 1]!.id,
          )
        : undefined;

    return { items: slice, cursor };
  }

  async close(id: string): Promise<FiscalRow> {
    const existing = await this.db
      .selectFrom('fiscal_period')
      .where('id', '=', id)
      .where('invalidated_at', 'is', null)
      .selectAll()
      .executeTakeFirst();

    if (!existing) throw new NotFoundError('Fiscal period not found');
    if (existing.status === 'closed') {
      throw new ConflictError('Fiscal period is already closed');
    }

    const now = this.clock.now();

    const [row] = await this.db
      .updateTable('fiscal_period')
      .set({
        status: 'closed',
        indexed_at: now,
      })
      .where('id', '=', id)
      .returningAll()
      .execute();

    return row!;
  }
}
