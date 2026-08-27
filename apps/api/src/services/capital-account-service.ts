import type { Kysely, Selectable, Transaction } from 'kysely';
import type { Database, CapitalAccountTable, CapitalAccountTransactionTable } from '@coopsource/db';
import { NotFoundError, ValidationError, type DID } from '@coopsource/common';
import { membersSpace } from '@coopsource/arbiter-client';
import type {
  JsonValue,
  SurplusDistributorPlugin,
} from '@coopsource/governance-view';
import {
  CoopSurplusDistributionError,
  parseCoopSurplusDistributions,
  planCoopSurplusDistributions,
  type CoopSurplusAllocation,
  type CoopSurplusDistribution,
} from '@coopsource/coop-view';
import type { IClock } from '@coopsource/federation';
import type { Page, PageParams } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';

type Executor = Kysely<Database> | Transaction<Database>;

type AccountRow = Selectable<CapitalAccountTable>;
type TransactionRow = Selectable<CapitalAccountTransactionTable>;

export class CapitalAccountService {
  constructor(
    private db: Kysely<Database>,
    private clock: IClock,
    private surplusDistributor?: SurplusDistributorPlugin,
  ) {}

  async getOrCreateAccount(
    cooperativeDid: string,
    memberDid: string,
    executor: Executor = this.db,
  ): Promise<AccountRow> {
    const now = this.clock.now();

    // Insert if not exists
    await executor
      .insertInto('capital_account')
      .values({
        cooperative_did: cooperativeDid,
        member_did: memberDid,
        initial_contribution: 0,
        total_patronage_allocated: 0,
        total_redeemed: 0,
        balance: 0,
        created_at: now,
        updated_at: now,
      })
      .onConflict((oc) =>
        oc.columns(['cooperative_did', 'member_did']).doNothing(),
      )
      .execute();

    const row = await executor
      .selectFrom('capital_account')
      .where('cooperative_did', '=', cooperativeDid)
      .where('member_did', '=', memberDid)
      .selectAll()
      .executeTakeFirst();

    return row!;
  }

  async recordContribution(
    cooperativeDid: string,
    operatorDid: string,
    data: { memberDid: string; amount: number; description?: string },
  ): Promise<AccountRow> {
    const now = this.clock.now();

    // The ledger row and the balance it explains are written together, and the
    // balance is computed by the database from its own current value. Computing
    // it here from a prior read loses concurrent contributions (audit C-06).
    const delta = numericParam(data.amount);

    return this.db.transaction().execute(async (trx) => {
      const account = await this.getOrCreateAccount(
        cooperativeDid,
        data.memberDid,
        trx,
      );

      await trx
        .insertInto('capital_account_transaction')
        .values({
          capital_account_id: account.id,
          cooperative_did: cooperativeDid,
          member_did: data.memberDid,
          transaction_type: 'initial_contribution',
          amount: data.amount,
          description: data.description ?? null,
          created_at: now,
          created_by: operatorDid,
        })
        .execute();

      const [row] = await trx
        .updateTable('capital_account')
        .set((eb) => ({
          initial_contribution: eb('initial_contribution', '+', delta),
          balance: eb('balance', '+', delta),
          updated_at: now,
        }))
        .where('id', '=', account.id)
        .returningAll()
        .execute();

      return row!;
    });
  }

  async allocatePatronageBulk(
    cooperativeDid: string,
    operatorDid: string,
    fiscalPeriodId: string,
  ): Promise<number> {
    const now = this.clock.now();

    // Get all approved patronage records for this period
    const records = await this.db
      .selectFrom('patronage_record')
      .where('cooperative_did', '=', cooperativeDid)
      .where('fiscal_period_id', '=', fiscalPeriodId)
      .where('status', '=', 'approved')
      .selectAll()
      .execute();

    if (records.length === 0) return 0;
    const distributions = await this.distributeSurplus({
      cooperativeDid,
      fiscalPeriodId,
      allocations: records.map((record) => ({
        patronageRecordId: record.id,
        memberDid: record.member_did,
        retainedAmount: Number(record.retained_amount),
      })),
    });

    // One transaction for the whole distribution run, and the patronage record
    // is the idempotency token: crediting an account happens only for the
    // caller that claims the record's `approved` -> `distributed` transition.
    return this.db.transaction().execute(async (trx) => {
      let count = 0;
      for (const distribution of distributions) {
        const claimed = await trx
          .updateTable('patronage_record')
          .set({
            status: 'distributed',
            distributed_at: now,
            indexed_at: now,
          })
          .where('id', '=', distribution.patronageRecordId)
          .where('status', '=', 'approved')
          .executeTakeFirst();

        if (Number(claimed.numUpdatedRows) !== 1) continue;

        const account = await this.getOrCreateAccount(
          cooperativeDid,
          distribution.memberDid,
          trx,
        );

        await trx
          .insertInto('capital_account_transaction')
          .values({
            capital_account_id: account.id,
            cooperative_did: cooperativeDid,
            member_did: distribution.memberDid,
            transaction_type: distribution.transactionType,
            amount: distribution.amount,
            fiscal_period_id: fiscalPeriodId,
            patronage_record_id: distribution.patronageRecordId,
            description: distribution.description,
            created_at: now,
            created_by: operatorDid,
          })
          .execute();

        await trx
          .updateTable('capital_account')
          .set((eb) => ({
            total_patronage_allocated: eb(
              'total_patronage_allocated',
              '+',
              numericParam(distribution.amount),
            ),
            balance: eb('balance', '+', numericParam(distribution.amount)),
            updated_at: now,
          }))
          .where('id', '=', account.id)
          .execute();

        count++;
      }

      return count;
    });
  }

  private async distributeSurplus(input: {
    readonly cooperativeDid: string;
    readonly fiscalPeriodId: string;
    readonly allocations: readonly CoopSurplusAllocation[];
  }): Promise<readonly CoopSurplusDistribution[]> {
    try {
      if (!this.surplusDistributor) {
        return planCoopSurplusDistributions(input);
      }

      const memberSpace = membersSpace(input.cooperativeDid as DID);
      const result = await this.surplusDistributor.distribute({
        cooperative: {
          authorityDid: input.cooperativeDid,
          spaceKey: memberSpace.spaceKey,
          spaceType: memberSpace.expectedSpaceType,
        },
        period: { id: input.fiscalPeriodId },
        allocations: input.allocations.map(surplusAllocationToJson),
      });
      return parseCoopSurplusDistributions(result.distributions);
    } catch (err) {
      if (err instanceof CoopSurplusDistributionError) {
        throw new ValidationError(err.message);
      }
      throw err;
    }
  }

  async redeemAllocation(
    cooperativeDid: string,
    operatorDid: string,
    data: { memberDid: string; amount: number; description?: string },
  ): Promise<AccountRow> {
    const now = this.clock.now();

    // The sufficiency check is the UPDATE's own predicate, so it is evaluated
    // against the balance at the moment of the write rather than against an
    // earlier read. Checking a prior read lets concurrent redemptions each pass
    // the guard and overdraw the account (audit C-06).
    const delta = numericParam(data.amount);

    return this.db.transaction().execute(async (trx) => {
      const account = await this.getOrCreateAccount(
        cooperativeDid,
        data.memberDid,
        trx,
      );

      const [row] = await trx
        .updateTable('capital_account')
        .set((eb) => ({
          total_redeemed: eb('total_redeemed', '+', delta),
          balance: eb('balance', '-', delta),
          updated_at: now,
        }))
        .where('id', '=', account.id)
        .where('balance', '>=', delta)
        .returningAll()
        .execute();

      if (!row) {
        const current = await trx
          .selectFrom('capital_account')
          .where('id', '=', account.id)
          .select('balance')
          .executeTakeFirst();
        throw new ValidationError(
          `Redemption amount ${data.amount} exceeds balance ${Number(current?.balance ?? 0)}`,
        );
      }

      await trx
        .insertInto('capital_account_transaction')
        .values({
          capital_account_id: account.id,
          cooperative_did: cooperativeDid,
          member_did: data.memberDid,
          transaction_type: 'revolving_redemption',
          amount: -data.amount,
          description: data.description ?? null,
          created_at: now,
          created_by: operatorDid,
        })
        .execute();

      return row;
    });
  }

  async getAccount(
    cooperativeDid: string,
    memberDid: string,
  ): Promise<AccountRow> {
    const row = await this.db
      .selectFrom('capital_account')
      .where('cooperative_did', '=', cooperativeDid)
      .where('member_did', '=', memberDid)
      .selectAll()
      .executeTakeFirst();

    if (!row) throw new NotFoundError('Capital account not found');
    return row;
  }

  async listAccounts(
    cooperativeDid: string,
    params: PageParams,
  ): Promise<Page<AccountRow>> {
    const limit = params.limit ?? 50;

    let query = this.db
      .selectFrom('capital_account')
      .where('cooperative_did', '=', cooperativeDid)
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

  async listTransactions(
    cooperativeDid: string,
    memberDid: string,
    params: PageParams,
  ): Promise<Page<TransactionRow>> {
    const limit = params.limit ?? 50;

    let query = this.db
      .selectFrom('capital_account_transaction')
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

  async getCooperativeSummary(cooperativeDid: string): Promise<{
    totalAccounts: number;
    totalEquity: number;
    totalPatronageAllocated: number;
    totalRedeemed: number;
    totalInitialContributions: number;
  }> {
    const rows = await this.db
      .selectFrom('capital_account')
      .where('cooperative_did', '=', cooperativeDid)
      .select([
        'initial_contribution',
        'total_patronage_allocated',
        'total_redeemed',
        'balance',
      ])
      .execute();

    let totalEquity = 0;
    let totalPatronageAllocated = 0;
    let totalRedeemed = 0;
    let totalInitialContributions = 0;

    for (const row of rows) {
      totalEquity += Number(row.balance);
      totalPatronageAllocated += Number(row.total_patronage_allocated);
      totalRedeemed += Number(row.total_redeemed);
      totalInitialContributions += Number(row.initial_contribution);
    }

    return {
      totalAccounts: rows.length,
      totalEquity: Math.round(totalEquity * 100) / 100,
      totalPatronageAllocated: Math.round(totalPatronageAllocated * 100) / 100,
      totalRedeemed: Math.round(totalRedeemed * 100) / 100,
      totalInitialContributions: Math.round(totalInitialContributions * 100) / 100,
    };
  }
}

/**
 * `numeric(18,2)` columns are selected as `string`, so Kysely types the operand
 * of an arithmetic or comparison expression over them as `string` too. node-pg
 * text-encodes every bound parameter, so this produces the same wire bytes as
 * passing the number, and PostgreSQL infers `numeric` from the operator.
 */
function numericParam(amount: number): string {
  return String(amount);
}

function surplusAllocationToJson(allocation: CoopSurplusAllocation): JsonValue {
  return {
    patronageRecordId: allocation.patronageRecordId,
    memberDid: allocation.memberDid,
    retainedAmount: allocation.retainedAmount,
  };
}
