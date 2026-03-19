import type { Kysely, Selectable } from 'kysely';
import type { Database, ExpenseTable, ExpenseCategoryTable } from '@coopsource/db';
import { NotFoundError, ConflictError, ValidationError } from '@coopsource/common';
import type { IClock } from '@coopsource/federation';
import type { Page, PageParams } from '../lib/pagination.js';
import { encodeCursor, decodeCursor } from '../lib/pagination.js';

type ExpenseRow = Selectable<ExpenseTable>;
type CategoryRow = Selectable<ExpenseCategoryTable>;

export class ExpenseService {
  constructor(
    private db: Kysely<Database>,
    private clock: IClock,
  ) {}

  // ─── Categories ──────────────────────────────────────────────────────

  async createCategory(
    cooperativeDid: string,
    data: { name: string; description?: string; budgetLimit?: number },
  ): Promise<CategoryRow> {
    const now = this.clock.now();

    try {
      const [row] = await this.db
        .insertInto('expense_category')
        .values({
          cooperative_did: cooperativeDid,
          name: data.name,
          description: data.description ?? null,
          budget_limit: data.budgetLimit ?? null,
          created_at: now,
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
        throw new ConflictError(
          `Expense category '${data.name}' already exists for this cooperative`,
        );
      }
      throw err;
    }
  }

  async listCategories(cooperativeDid: string): Promise<CategoryRow[]> {
    return this.db
      .selectFrom('expense_category')
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .orderBy('name', 'asc')
      .execute();
  }

  async deleteCategory(id: string, cooperativeDid: string): Promise<void> {
    const result = await this.db
      .deleteFrom('expense_category')
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .executeTakeFirst();

    if (Number(result.numDeletedRows) === 0) {
      throw new NotFoundError('Expense category not found');
    }
  }

  // ─── Expenses ────────────────────────────────────────────────────────

  async createExpense(
    cooperativeDid: string,
    memberDid: string,
    data: {
      categoryId?: string;
      title: string;
      description?: string;
      amount: number;
      currency?: string;
      receiptBlobCid?: string;
    },
  ): Promise<ExpenseRow> {
    const now = this.clock.now();

    const [row] = await this.db
      .insertInto('expense')
      .values({
        cooperative_did: cooperativeDid,
        member_did: memberDid,
        category_id: data.categoryId ?? null,
        title: data.title,
        description: data.description ?? null,
        amount: data.amount,
        currency: data.currency ?? 'USD',
        receipt_blob_cid: data.receiptBlobCid ?? null,
        status: 'submitted',
        created_at: now,
        indexed_at: now,
      })
      .returningAll()
      .execute();

    return row!;
  }

  async updateExpense(
    id: string,
    cooperativeDid: string,
    memberDid: string,
    data: {
      categoryId?: string | null;
      title?: string;
      description?: string;
      amount?: number;
      currency?: string;
      receiptBlobCid?: string | null;
    },
  ): Promise<ExpenseRow> {
    // Only allow update of own expenses in draft or submitted status
    const existing = await this.db
      .selectFrom('expense')
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .where('member_did', '=', memberDid)
      .selectAll()
      .executeTakeFirst();

    if (!existing) throw new NotFoundError('Expense not found');

    if (existing.status !== 'draft' && existing.status !== 'submitted') {
      throw new ValidationError(
        `Cannot update expense in '${existing.status}' status`,
      );
    }

    const now = this.clock.now();
    const updates: Record<string, unknown> = { indexed_at: now };

    if (data.categoryId !== undefined) updates.category_id = data.categoryId;
    if (data.title !== undefined) updates.title = data.title;
    if (data.description !== undefined) updates.description = data.description;
    if (data.amount !== undefined) updates.amount = data.amount;
    if (data.currency !== undefined) updates.currency = data.currency;
    if (data.receiptBlobCid !== undefined)
      updates.receipt_blob_cid = data.receiptBlobCid;

    const [row] = await this.db
      .updateTable('expense')
      .set(updates)
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .where('member_did', '=', memberDid)
      .returningAll()
      .execute();

    if (!row) throw new NotFoundError('Expense not found');
    return row;
  }

  async getExpense(id: string, cooperativeDid: string): Promise<ExpenseRow> {
    const row = await this.db
      .selectFrom('expense')
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .executeTakeFirst();

    if (!row) throw new NotFoundError('Expense not found');
    return row;
  }

  async listExpenses(
    cooperativeDid: string,
    params: PageParams,
    filters?: { memberDid?: string; categoryId?: string; status?: string },
  ): Promise<Page<ExpenseRow>> {
    const limit = params.limit ?? 50;

    let query = this.db
      .selectFrom('expense')
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1);

    if (filters?.memberDid) {
      query = query.where('member_did', '=', filters.memberDid);
    }
    if (filters?.categoryId) {
      query = query.where('category_id', '=', filters.categoryId);
    }
    if (filters?.status) {
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
        ? encodeCursor(
            slice[slice.length - 1]!.created_at,
            slice[slice.length - 1]!.id,
          )
        : undefined;

    return { items: slice, cursor };
  }

  async reviewExpense(
    id: string,
    cooperativeDid: string,
    reviewerDid: string,
    action: 'approve' | 'reject',
    note?: string,
  ): Promise<ExpenseRow> {
    const existing = await this.db
      .selectFrom('expense')
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .executeTakeFirst();

    if (!existing) throw new NotFoundError('Expense not found');

    if (existing.status !== 'submitted') {
      throw new ValidationError(
        `Cannot review expense in '${existing.status}' status; must be 'submitted'`,
      );
    }

    const now = this.clock.now();
    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    const [row] = await this.db
      .updateTable('expense')
      .set({
        status: newStatus,
        reviewed_by: reviewerDid,
        reviewed_at: now,
        review_note: note ?? null,
        indexed_at: now,
      })
      .where('id', '=', id)
      .returningAll()
      .execute();

    return row!;
  }

  async reimburseExpenses(
    cooperativeDid: string,
    reviewerDid: string,
    expenseIds: string[],
  ): Promise<number> {
    if (expenseIds.length === 0) return 0;

    const now = this.clock.now();

    // Verify all expenses are in approved status
    const expenses = await this.db
      .selectFrom('expense')
      .where('id', 'in', expenseIds)
      .where('cooperative_did', '=', cooperativeDid)
      .select(['id', 'status'])
      .execute();

    if (expenses.length !== expenseIds.length) {
      throw new NotFoundError('One or more expenses not found');
    }

    const nonApproved = expenses.filter((e) => e.status !== 'approved');
    if (nonApproved.length > 0) {
      throw new ValidationError(
        `Cannot reimburse expenses that are not approved (${nonApproved.length} invalid)`,
      );
    }

    const result = await this.db
      .updateTable('expense')
      .set({
        status: 'reimbursed',
        reimbursed_at: now,
        indexed_at: now,
      })
      .where('id', 'in', expenseIds)
      .where('cooperative_did', '=', cooperativeDid)
      .where('status', '=', 'approved')
      .execute();

    return Number(result[0]?.numUpdatedRows ?? 0);
  }

  async deleteExpense(
    id: string,
    cooperativeDid: string,
    memberDid: string,
  ): Promise<void> {
    // Only allow deleting own draft expenses
    const existing = await this.db
      .selectFrom('expense')
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .where('member_did', '=', memberDid)
      .selectAll()
      .executeTakeFirst();

    if (!existing) throw new NotFoundError('Expense not found');

    if (existing.status !== 'draft') {
      throw new ValidationError(
        `Cannot delete expense in '${existing.status}' status; only draft expenses can be deleted`,
      );
    }

    const result = await this.db
      .deleteFrom('expense')
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .where('member_did', '=', memberDid)
      .executeTakeFirst();

    if (Number(result.numDeletedRows) === 0) {
      throw new NotFoundError('Expense not found');
    }
  }

  // ─── Summaries ───────────────────────────────────────────────────────

  async getCategorySummary(
    cooperativeDid: string,
    startDate: string,
    endDate: string,
  ): Promise<
    Array<{
      categoryId: string | null;
      categoryName: string | null;
      totalAmount: number;
      count: number;
      budgetLimit: number | null;
    }>
  > {
    const rows = await this.db
      .selectFrom('expense')
      .leftJoin('expense_category', 'expense_category.id', 'expense.category_id')
      .where('expense.cooperative_did', '=', cooperativeDid)
      .where('expense.status', 'in', ['approved', 'reimbursed'])
      .where('expense.created_at', '>=', new Date(startDate))
      .where('expense.created_at', '<=', new Date(endDate))
      .select([
        'expense.category_id as categoryId',
        'expense_category.name as categoryName',
        'expense_category.budget_limit as budgetLimit',
      ])
      .select((eb) => [
        eb.fn.sum<string>('expense.amount').as('totalAmount'),
        eb.fn.count<string>('expense.id').as('count'),
      ])
      .groupBy([
        'expense.category_id',
        'expense_category.name',
        'expense_category.budget_limit',
      ])
      .execute();

    return rows.map((row) => ({
      categoryId: row.categoryId,
      categoryName: row.categoryName ?? null,
      totalAmount: Number(row.totalAmount) || 0,
      count: Number(row.count),
      budgetLimit: row.budgetLimit != null ? Number(row.budgetLimit) : null,
    }));
  }

  async getMemberExpenseSummary(
    cooperativeDid: string,
    memberDid: string,
    startDate: string,
    endDate: string,
  ): Promise<{
    totalAmount: number;
    approvedAmount: number;
    pendingAmount: number;
    count: number;
  }> {
    const rows = await this.db
      .selectFrom('expense')
      .where('cooperative_did', '=', cooperativeDid)
      .where('member_did', '=', memberDid)
      .where('created_at', '>=', new Date(startDate))
      .where('created_at', '<=', new Date(endDate))
      .select(['status', 'amount'])
      .execute();

    let totalAmount = 0;
    let approvedAmount = 0;
    let pendingAmount = 0;

    for (const row of rows) {
      const amount = Number(row.amount);
      totalAmount += amount;
      if (row.status === 'approved' || row.status === 'reimbursed') {
        approvedAmount += amount;
      }
      if (row.status === 'submitted' || row.status === 'draft') {
        pendingAmount += amount;
      }
    }

    return {
      totalAmount: Math.round(totalAmount * 100) / 100,
      approvedAmount: Math.round(approvedAmount * 100) / 100,
      pendingAmount: Math.round(pendingAmount * 100) / 100,
      count: rows.length,
    };
  }
}
