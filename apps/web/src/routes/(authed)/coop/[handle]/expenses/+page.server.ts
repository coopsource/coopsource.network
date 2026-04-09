import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request, url }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);
  const status = url.searchParams.get('status') ?? undefined;
  const categoryId = url.searchParams.get('categoryId') ?? undefined;

  try {
    const [expensesResult, categoriesResult] = await Promise.all([
      api.getExpenses({ status, categoryId, limit: 50 }),
      api.getExpenseCategories(),
    ]);
    return {
      expenses: expensesResult.items,
      cursor: expensesResult.cursor,
      categories: categoriesResult.categories,
      filterStatus: status ?? '',
      filterCategory: categoryId ?? '',
    };
  } catch (err) {
    if (err instanceof ApiError) {
      error(err.status >= 500 ? 500 : err.status, 'Failed to load expenses.');
    }
    error(500, 'Failed to load expenses.');
  }
};

export const actions: Actions = {
  submitExpense: async ({ request, fetch }) => {
    const formData = await request.formData();
    const title = String(formData.get('title') ?? '').trim();
    const description = String(formData.get('description') ?? '').trim();
    const amountStr = String(formData.get('amount') ?? '').trim();
    const categoryId = String(formData.get('categoryId') ?? '').trim();

    if (!title) return fail(400, { error: 'Title is required.' });
    if (!amountStr || isNaN(Number(amountStr))) return fail(400, { error: 'Valid amount is required.' });

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.createExpense({
        title,
        description: description || undefined,
        amount: Number(amountStr),
        categoryId: categoryId || undefined,
      });
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to submit expense.' });
    }
  },

  updateExpense: async ({ request, fetch }) => {
    const data = await request.formData();
    const id = String(data.get('id') ?? '').trim();
    const title = String(data.get('title') ?? '').trim();
    const description = String(data.get('description') ?? '').trim();
    const amountStr = String(data.get('amount') ?? '').trim();
    const categoryId = String(data.get('categoryId') ?? '').trim();

    if (!id) return fail(400, { error: 'Expense ID is required.' });
    if (!title) return fail(400, { error: 'Title is required.' });
    if (!amountStr || isNaN(Number(amountStr))) return fail(400, { error: 'Valid amount is required.' });

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.updateExpense(id, {
        title,
        description: description || undefined,
        amount: Number(amountStr),
        categoryId: categoryId || null,
      });
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to update expense.' });
    }
  },

  deleteExpense: async ({ request, fetch }) => {
    const formData = await request.formData();
    const id = String(formData.get('id') ?? '');

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.deleteExpense(id);
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to delete expense.' });
    }
  },
};
