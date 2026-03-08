import type { Kysely, Selectable } from 'kysely';
import type { Database, CapitalAccountTable, CapitalAccountTransactionTable } from '@coopsource/db';
import { NotFoundError, ValidationError } from '@coopsource/common';
import type { IClock } from '@coopsource/federation';
import type { Page, PageParams } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';

type AccountRow = Selectable<CapitalAccountTable>;
type TransactionRow = Selectable<CapitalAccountTransactionTable>;

export class CapitalAccountService {
  constructor(
    private db: Kysely<Database>,
    private clock: IClock,
  ) {}

  async getOrCreateAccount(
    cooperativeDid: string,
    memberDid: string,
  ): Promise<AccountRow> {
    const now = this.clock.now();

    // Insert if not exists
    await this.db
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

    const row = await this.db
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
    const account = await this.getOrCreateAccount(cooperativeDid, data.memberDid);
    const currentBalance = Number(account.balance);
    const currentContribution = Number(account.initial_contribution);

    // Create transaction record
    await this.db
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

    // Update balance
    const [row] = await this.db
      .updateTable('capital_account')
      .set({
        initial_contribution: currentContribution + data.amount,
        balance: currentBalance + data.amount,
        updated_at: now,
      })
      .where('id', '=', account.id)
      .returningAll()
      .execute();

    return row!;
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

    let count = 0;
    for (const record of records) {
      const retainedAmount = Number(record.retained_amount);
      if (retainedAmount <= 0) continue;

      const account = await this.getOrCreateAccount(cooperativeDid, record.member_did);
      const currentBalance = Number(account.balance);
      const currentPatronage = Number(account.total_patronage_allocated);

      // Create transaction
      await this.db
        .insertInto('capital_account_transaction')
        .values({
          capital_account_id: account.id,
          cooperative_did: cooperativeDid,
          member_did: record.member_did,
          transaction_type: 'patronage_allocation',
          amount: retainedAmount,
          fiscal_period_id: fiscalPeriodId,
          patronage_record_id: record.id,
          description: `Patronage allocation for fiscal period ${fiscalPeriodId}`,
          created_at: now,
          created_by: operatorDid,
        })
        .execute();

      // Update account
      await this.db
        .updateTable('capital_account')
        .set({
          total_patronage_allocated: currentPatronage + retainedAmount,
          balance: currentBalance + retainedAmount,
          updated_at: now,
        })
        .where('id', '=', account.id)
        .execute();

      // Mark patronage record as distributed
      await this.db
        .updateTable('patronage_record')
        .set({
          status: 'distributed',
          distributed_at: now,
          indexed_at: now,
        })
        .where('id', '=', record.id)
        .execute();

      count++;
    }

    return count;
  }

  async redeemAllocation(
    cooperativeDid: string,
    operatorDid: string,
    data: { memberDid: string; amount: number; description?: string },
  ): Promise<AccountRow> {
    const now = this.clock.now();
    const account = await this.getOrCreateAccount(cooperativeDid, data.memberDid);
    const currentBalance = Number(account.balance);
    const currentRedeemed = Number(account.total_redeemed);

    if (data.amount > currentBalance) {
      throw new ValidationError(
        `Redemption amount ${data.amount} exceeds balance ${currentBalance}`,
      );
    }

    // Create transaction
    await this.db
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

    // Update balance
    const [row] = await this.db
      .updateTable('capital_account')
      .set({
        total_redeemed: currentRedeemed + data.amount,
        balance: currentBalance - data.amount,
        updated_at: now,
      })
      .where('id', '=', account.id)
      .returningAll()
      .execute();

    return row!;
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
