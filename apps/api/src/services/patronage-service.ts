import type { Kysely, Selectable } from 'kysely';
import type { Database, PatronageConfigTable, PatronageRecordTable } from '@coopsource/db';
import { NotFoundError, ConflictError, ValidationError, type DID } from '@coopsource/common';
import { membersSpace } from '@coopsource/arbiter-client';
import type {
  JsonValue,
  PatronageAllocatorPlugin,
} from '@coopsource/governance-view';
import {
  CoopPatronageAllocationError,
  calculateCoopPatronageAllocations,
  parseCoopPatronageAllocations,
  type CoopPatronageAllocation,
  type CoopPatronageMetric,
} from '@coopsource/coop-view';
import type { IClock } from '@coopsource/federation';
import type { Page, PageParams } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';

type ConfigRow = Selectable<PatronageConfigTable>;
type RecordRow = Selectable<PatronageRecordTable>;

export class PatronageService {
  constructor(
    private db: Kysely<Database>,
    private clock: IClock,
    private patronageAllocator?: PatronageAllocatorPlugin,
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

    const allocations = await this.allocatePatronage({
      cooperativeDid,
      fiscalPeriodId: data.fiscalPeriodId,
      totalSurplus: data.totalSurplus,
      cashPayoutPct,
      metrics: data.metrics,
    });

    const now = this.clock.now();
    const records: RecordRow[] = [];

    for (const allocation of allocations) {
      try {
        const [row] = await this.db
          .insertInto('patronage_record')
          .values({
            cooperative_did: cooperativeDid,
            fiscal_period_id: data.fiscalPeriodId,
            member_did: allocation.memberDid,
            stakeholder_class: allocation.stakeholderClass,
            metric_value: allocation.metricValue,
            patronage_ratio: allocation.patronageRatio,
            total_allocation: allocation.totalAllocation,
            cash_amount: allocation.cashAmount,
            retained_amount: allocation.retainedAmount,
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
          throw new ConflictError(`Patronage already calculated for member ${allocation.memberDid} in this period`);
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

  private async allocatePatronage(input: {
    readonly cooperativeDid: string;
    readonly fiscalPeriodId: string;
    readonly totalSurplus: number;
    readonly cashPayoutPct: number;
    readonly metrics: readonly CoopPatronageMetric[];
  }): Promise<readonly CoopPatronageAllocation[]> {
    try {
      if (!this.patronageAllocator) {
        return calculateCoopPatronageAllocations({
          surplus: input.totalSurplus,
          metrics: input.metrics,
          cashPayoutPct: input.cashPayoutPct,
        });
      }

      const memberSpace = membersSpace(input.cooperativeDid as DID);
      const result = await this.patronageAllocator.allocate({
        cooperative: {
          authorityDid: input.cooperativeDid,
          spaceKey: memberSpace.spaceKey,
          spaceType: memberSpace.expectedSpaceType,
        },
        period: { id: input.fiscalPeriodId },
        surplus: input.totalSurplus,
        metrics: input.metrics.map(patronageMetricToJson),
        policy: { cashPayoutPct: input.cashPayoutPct },
      });
      return parseCoopPatronageAllocations(result.allocations);
    } catch (err) {
      if (err instanceof CoopPatronageAllocationError) {
        throw new ValidationError(err.message);
      }
      throw err;
    }
  }
}

function patronageMetricToJson(metric: CoopPatronageMetric): JsonValue {
  return {
    memberDid: metric.memberDid,
    metricValue: metric.metricValue,
    stakeholderClass: metric.stakeholderClass ?? null,
  };
}
