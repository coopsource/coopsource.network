import type { Kysely, Selectable } from 'kysely';
import type { Database, TaxForm1099PatrTable } from '@coopsource/db';
import { NotFoundError, ConflictError } from '@coopsource/common';
import type { IClock } from '@coopsource/federation';
import type { Page, PageParams } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';

type FormRow = Selectable<TaxForm1099PatrTable>;

export class Tax1099Service {
  constructor(
    private db: Kysely<Database>,
    private clock: IClock,
  ) {}

  async generateForPeriod(
    cooperativeDid: string,
    fiscalPeriodId: string,
    taxYear: number,
  ): Promise<FormRow[]> {
    // Get fiscal period to compute cash deadline
    const period = await this.db
      .selectFrom('fiscal_period')
      .where('id', '=', fiscalPeriodId)
      .where('cooperative_did', '=', cooperativeDid)
      .where('invalidated_at', 'is', null)
      .select(['id', 'ends_at', 'status'])
      .executeTakeFirst();

    if (!period) throw new NotFoundError('Fiscal period not found');

    // Cash deadline = fiscal year end + 8.5 months
    const endDate = new Date(period.ends_at);
    const cashDeadline = new Date(endDate);
    cashDeadline.setMonth(cashDeadline.getMonth() + 8);
    cashDeadline.setDate(cashDeadline.getDate() + 15); // +0.5 months ≈ 15 days

    // Get approved/distributed patronage records for this period
    const records = await this.db
      .selectFrom('patronage_record')
      .where('cooperative_did', '=', cooperativeDid)
      .where('fiscal_period_id', '=', fiscalPeriodId)
      .where('status', 'in', ['approved', 'distributed'])
      .selectAll()
      .execute();

    const now = this.clock.now();
    const forms: FormRow[] = [];

    for (const record of records) {
      const totalAllocation = Number(record.total_allocation);

      // IRS threshold: only generate 1099-PATR for dividends >= $10
      if (totalAllocation < 10) continue;

      const cashAmount = Number(record.cash_amount);
      const retainedAmount = Number(record.retained_amount);

      try {
        const [row] = await this.db
          .insertInto('tax_form_1099_patr')
          .values({
            cooperative_did: cooperativeDid,
            fiscal_period_id: fiscalPeriodId,
            member_did: record.member_did,
            tax_year: taxYear,
            patronage_dividends: totalAllocation,
            per_unit_retain_allocated: retainedAmount,
            qualified_payments: cashAmount,
            cash_paid: 0,
            cash_deadline: cashDeadline,
            generation_status: 'pending',
            created_at: now,
            indexed_at: now,
          })
          .returningAll()
          .execute();

        forms.push(row!);
      } catch (err: unknown) {
        if (
          err instanceof Error &&
          (err.message.includes('duplicate key') ||
           err.message.includes('unique constraint'))
        ) {
          throw new ConflictError(`1099-PATR already generated for member ${record.member_did} in this period`);
        }
        throw err;
      }
    }

    return forms;
  }

  async listForms(
    cooperativeDid: string,
    params: PageParams & { taxYear?: number; status?: string },
  ): Promise<Page<FormRow>> {
    const limit = params.limit ?? 50;

    let query = this.db
      .selectFrom('tax_form_1099_patr')
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1);

    if (params.taxYear) {
      query = query.where('tax_year', '=', params.taxYear);
    }
    if (params.status) {
      query = query.where('generation_status', '=', params.status);
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

  async getForm(id: string, cooperativeDid: string): Promise<FormRow> {
    const row = await this.db
      .selectFrom('tax_form_1099_patr')
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .executeTakeFirst();

    if (!row) throw new NotFoundError('1099-PATR form not found');
    return row;
  }

  async markGenerated(id: string, cooperativeDid: string): Promise<FormRow> {
    const now = this.clock.now();

    const [row] = await this.db
      .updateTable('tax_form_1099_patr')
      .set({
        generation_status: 'generated',
        generated_at: now,
        indexed_at: now,
      })
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .returningAll()
      .execute();

    if (!row) throw new NotFoundError('1099-PATR form not found');
    return row;
  }

  async markSent(id: string, cooperativeDid: string): Promise<FormRow> {
    const now = this.clock.now();

    const [row] = await this.db
      .updateTable('tax_form_1099_patr')
      .set({
        generation_status: 'sent',
        sent_at: now,
        indexed_at: now,
      })
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .returningAll()
      .execute();

    if (!row) throw new NotFoundError('1099-PATR form not found');
    return row;
  }

  async recordCashPayment(id: string, cooperativeDid: string): Promise<FormRow> {
    const now = this.clock.now();
    const existing = await this.getForm(id, cooperativeDid);

    const [row] = await this.db
      .updateTable('tax_form_1099_patr')
      .set({
        cash_paid: existing.qualified_payments,
        cash_paid_at: now,
        indexed_at: now,
      })
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .returningAll()
      .execute();

    if (!row) throw new NotFoundError('1099-PATR form not found');
    return row;
  }

  async getUpcomingDeadlines(cooperativeDid: string): Promise<FormRow[]> {
    const now = this.clock.now();
    const thirtyDaysLater = new Date(now);
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

    return await this.db
      .selectFrom('tax_form_1099_patr')
      .where('cooperative_did', '=', cooperativeDid)
      .where('cash_deadline', '<=', thirtyDaysLater)
      .where('cash_paid_at', 'is', null)
      .selectAll()
      .orderBy('cash_deadline', 'asc')
      .execute();
  }
}
