import type { Kysely, Selectable } from 'kysely';
import type { Database, PatronageConfigTable, PatronageRecordTable } from '@coopsource/db';
import { NotFoundError, ConflictError, ValidationError } from '@coopsource/common';
import type { IClock } from '@coopsource/federation';
import type { Page, PageParams } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';

type ConfigRow = Selectable<PatronageConfigTable>;
type RecordRow = Selectable<PatronageRecordTable>;

export class PatronageService {
  constructor(
    private db: Kysely<Database>,
    private clock: IClock,
  ) {}

  async createConfig(
    cooperativeDid: string,
    data: {
      stakeholderClass?: string | null;
      metricType: string;
      metricWeights?: Record<string, number>;
      cashPayoutPct?: number;
    },
  ): Promise<ConfigRow> {
    const now = this.clock.now();

    try {
      const [row] = await this.db
        .insertInto('patronage_config')
        .values({
          cooperative_did: cooperativeDid,
          stakeholder_class: data.stakeholderClass ?? null,
          metric_type: data.metricType,
          metric_weights: data.metricWeights ? JSON.stringify(data.metricWeights) : null,
          cash_payout_pct: data.cashPayoutPct ?? 20,
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
        throw new ConflictError('Patronage config already exists for this class');
      }
      throw err;
    }
  }

  async updateConfig(
    id: string,
    cooperativeDid: string,
    data: {
      metricType?: string;
      metricWeights?: Record<string, number>;
      cashPayoutPct?: number;
    },
  ): Promise<ConfigRow> {
    const now = this.clock.now();
    const updates: Record<string, unknown> = { updated_at: now };

    if (data.metricType !== undefined) updates.metric_type = data.metricType;
    if (data.metricWeights !== undefined) updates.metric_weights = JSON.stringify(data.metricWeights);
    if (data.cashPayoutPct !== undefined) updates.cash_payout_pct = data.cashPayoutPct;

    const [row] = await this.db
      .updateTable('patronage_config')
      .set(updates)
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .returningAll()
      .execute();

    if (!row) throw new NotFoundError('Patronage config not found');
    return row;
  }

  async getConfig(
    cooperativeDid: string,
    stakeholderClass?: string | null,
  ): Promise<ConfigRow | undefined> {
    let query = this.db
      .selectFrom('patronage_config')
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll();

    if (stakeholderClass !== undefined) {
      if (stakeholderClass === null) {
        query = query.where('stakeholder_class', 'is', null);
      } else {
        query = query.where('stakeholder_class', '=', stakeholderClass);
      }
    }

    return await query.executeTakeFirst();
  }

  async listConfigs(cooperativeDid: string): Promise<ConfigRow[]> {
    return await this.db
      .selectFrom('patronage_config')
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .orderBy('created_at', 'asc')
      .execute();
  }

  async deleteConfig(id: string, cooperativeDid: string): Promise<void> {
    const result = await this.db
      .deleteFrom('patronage_config')
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .executeTakeFirst();

    if (result.numDeletedRows === 0n) {
      throw new NotFoundError('Patronage config not found');
    }
  }

  async runCalculation(
    cooperativeDid: string,
    data: {
      fiscalPeriodId: string;
      totalSurplus: number;
      metrics: Array<{
        memberDid: string;
        metricValue: number;
        stakeholderClass?: string | null;
      }>;
    },
  ): Promise<RecordRow[]> {
    // Validate fiscal period is closed
    const period = await this.db
      .selectFrom('fiscal_period')
      .where('id', '=', data.fiscalPeriodId)
      .where('cooperative_did', '=', cooperativeDid)
      .where('invalidated_at', 'is', null)
      .select(['id', 'status'])
      .executeTakeFirst();

    if (!period) throw new NotFoundError('Fiscal period not found');
    if (period.status !== 'closed') {
      throw new ValidationError('Fiscal period must be closed before running patronage calculation');
    }

    // Get config for cash payout percentage
    const config = await this.getConfig(cooperativeDid);
    const cashPayoutPct = config?.cash_payout_pct ?? 20;

    // Calculate total metrics
    const totalMetrics = data.metrics.reduce((sum, m) => sum + m.metricValue, 0);
    if (totalMetrics === 0) {
      throw new ValidationError('Total metric values cannot be zero');
    }

    const now = this.clock.now();
    const records: RecordRow[] = [];

    for (const metric of data.metrics) {
      const ratio = metric.metricValue / totalMetrics;
      const totalAllocation = Math.round(data.totalSurplus * ratio * 100) / 100;
      const cashAmount = Math.round(totalAllocation * (cashPayoutPct / 100) * 100) / 100;
      const retainedAmount = Math.round((totalAllocation - cashAmount) * 100) / 100;

      try {
        const [row] = await this.db
          .insertInto('patronage_record')
          .values({
            cooperative_did: cooperativeDid,
            fiscal_period_id: data.fiscalPeriodId,
            member_did: metric.memberDid,
            stakeholder_class: metric.stakeholderClass ?? null,
            metric_value: metric.metricValue,
            patronage_ratio: ratio,
            total_allocation: totalAllocation,
            cash_amount: cashAmount,
            retained_amount: retainedAmount,
            status: 'calculated',
            created_at: now,
            indexed_at: now,
          })
          .returningAll()
          .execute();

        records.push(row!);
      } catch (err: unknown) {
        if (
          err instanceof Error &&
          (err.message.includes('duplicate key') ||
           err.message.includes('unique constraint'))
        ) {
          throw new ConflictError(`Patronage already calculated for member ${metric.memberDid} in this period`);
        }
        throw err;
      }
    }

    return records;
  }

  async listRecords(
    cooperativeDid: string,
    fiscalPeriodId: string,
    params: PageParams,
  ): Promise<Page<RecordRow>> {
    const limit = params.limit ?? 50;

    let query = this.db
      .selectFrom('patronage_record')
      .where('cooperative_did', '=', cooperativeDid)
      .where('fiscal_period_id', '=', fiscalPeriodId)
      .selectAll()
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1);

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

  async approveRecords(
    cooperativeDid: string,
    fiscalPeriodId: string,
  ): Promise<number> {
    const now = this.clock.now();

    const result = await this.db
      .updateTable('patronage_record')
      .set({
        status: 'approved',
        approved_at: now,
        indexed_at: now,
      })
      .where('cooperative_did', '=', cooperativeDid)
      .where('fiscal_period_id', '=', fiscalPeriodId)
      .where('status', '=', 'calculated')
      .execute();

    return Number(result[0]?.numUpdatedRows ?? 0);
  }

  async getRecordsByMember(
    cooperativeDid: string,
    memberDid: string,
    params: PageParams,
  ): Promise<Page<RecordRow>> {
    const limit = params.limit ?? 50;

    let query = this.db
      .selectFrom('patronage_record')
      .where('cooperative_did', '=', cooperativeDid)
      .where('member_did', '=', memberDid)
      .selectAll()
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1);

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
