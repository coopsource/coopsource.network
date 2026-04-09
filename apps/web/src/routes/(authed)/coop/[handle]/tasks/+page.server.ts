import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request, url }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);
  const status = url.searchParams.get('status') ?? undefined;
  const priority = url.searchParams.get('priority') ?? undefined;

  try {
    const [result, labelsResult] = await Promise.all([
      api.getTasks({ status, priority, limit: 50 }),
      api.getTaskLabels(),
    ]);
    return {
      tasks: result.tasks,
      cursor: result.cursor,
      labels: labelsResult.labels,
      filterStatus: status ?? '',
      filterPriority: priority ?? '',
    };
  } catch (err) {
    if (err instanceof ApiError) {
      error(err.status >= 500 ? 500 : err.status, 'Failed to load tasks.');
    }
    error(500, 'Failed to load tasks.');
  }
};

export const actions: Actions = {
  createTask: async ({ request, fetch }) => {
    const formData = await request.formData();
    const title = String(formData.get('title') ?? '').trim();
    const description = String(formData.get('description') ?? '').trim();
    const priority = String(formData.get('priority') ?? 'medium');
    const status = String(formData.get('status') ?? 'backlog');
    const dueDate = String(formData.get('dueDate') ?? '').trim();

    if (!title) return fail(400, { error: 'Title is required.' });

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.createTask({
        title,
        description: description || undefined,
        priority,
        status,
        dueDate: dueDate || undefined,
      });
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to create task.' });
    }
  },

  updateTask: async ({ request, fetch }) => {
    const data = await request.formData();
    const id = String(data.get('id') ?? '').trim();
    const title = String(data.get('title') ?? '').trim();
    const description = String(data.get('description') ?? '').trim();
    const priority = String(data.get('priority') ?? 'medium');
    const status = String(data.get('status') ?? 'backlog');
    const dueDate = String(data.get('dueDate') ?? '').trim();

    if (!id) return fail(400, { error: 'Task ID is required.' });
    if (!title) return fail(400, { error: 'Title is required.' });

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.updateTask(id, {
        title,
        description: description || undefined,
        priority,
        status,
        dueDate: dueDate || null,
      });
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to update task.' });
    }
  },

  updateStatus: async ({ request, fetch }) => {
    const formData = await request.formData();
    const id = String(formData.get('id') ?? '');
    const status = String(formData.get('status') ?? '');

    if (!id || !status) return fail(400, { error: 'Task ID and status are required.' });

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.updateTask(id, { status });
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to update task status.' });
    }
  },
};
