import { test, expect, type APIRequestContext } from '@playwright/test';
import { setupCooperative } from './helpers.js';

const API = 'http://localhost:3002/api/v1';

/** Helper: authenticated POST */
async function post(request: APIRequestContext, cookie: string, path: string, data: unknown) {
  return request.post(`${API}${path}`, { headers: { Cookie: cookie }, data });
}

/** Helper: authenticated GET */
async function get(request: APIRequestContext, cookie: string, path: string) {
  return request.get(`${API}${path}`, { headers: { Cookie: cookie } });
}

/** Helper: authenticated PUT */
async function put(request: APIRequestContext, cookie: string, path: string, data: unknown) {
  return request.put(`${API}${path}`, { headers: { Cookie: cookie }, data });
}

/** Helper: authenticated DELETE */
async function del(request: APIRequestContext, cookie: string, path: string) {
  return request.delete(`${API}${path}`, { headers: { Cookie: cookie } });
}

// ---------------------------------------------------------------------------
// 1. Task Management API (E2E)
// ---------------------------------------------------------------------------

test.describe('Task Management API (E2E)', () => {
  let cookie: string;

  test.beforeEach(async ({ request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
  });

  test('full task lifecycle: create, get, update status, delete', async ({ request }) => {
    // Create
    const createRes = await post(request, cookie, '/ops/tasks', {
      title: 'Implement login page',
      description: 'Build the authentication UI',
      priority: 'high',
      labels: ['frontend', 'auth'],
    });
    expect(createRes.status()).toBe(201);
    const task = await createRes.json();
    expect(task.title).toBe('Implement login page');
    expect(task.priority).toBe('high');
    expect(task.status).toBe('backlog');
    expect(task.labels).toEqual(['frontend', 'auth']);

    // Get
    const getRes = await get(request, cookie, `/ops/tasks/${task.id}`);
    expect(getRes.status()).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.id).toBe(task.id);

    // Update status: backlog → todo → in_progress → in_review → done
    for (const status of ['todo', 'in_progress', 'in_review', 'done']) {
      const res = await put(request, cookie, `/ops/tasks/${task.id}`, { status });
      expect(res.status()).toBe(200);
      const updated = await res.json();
      expect(updated.status).toBe(status);
    }

    // Delete
    const delRes = await del(request, cookie, `/ops/tasks/${task.id}`);
    expect(delRes.status()).toBe(204);
  });

  test('list tasks with filters', async ({ request }) => {
    await post(request, cookie, '/ops/tasks', { title: 'Task A', priority: 'high' });
    await post(request, cookie, '/ops/tasks', { title: 'Task B', priority: 'low' });
    await post(request, cookie, '/ops/tasks', { title: 'Task C', priority: 'high' });

    // List all
    const allRes = await get(request, cookie, '/ops/tasks');
    expect(allRes.status()).toBe(200);
    const all = await allRes.json();
    expect(all.tasks).toHaveLength(3);

    // Filter by priority
    const highRes = await get(request, cookie, '/ops/tasks?priority=high');
    const high = await highRes.json();
    expect(high.tasks).toHaveLength(2);
  });

  test('checklist items: add, toggle, delete', async ({ request }) => {
    // Create task
    const createRes = await post(request, cookie, '/ops/tasks', { title: 'Task with checklist' });
    const task = await createRes.json();

    // Add checklist item
    const addRes = await post(request, cookie, `/ops/tasks/${task.id}/checklist`, {
      title: 'Step 1: Design',
    });
    expect(addRes.status()).toBe(201);
    const item = await addRes.json();
    expect(item.title).toBe('Step 1: Design');
    expect(item.completed).toBe(false);

    // Toggle completed
    const toggleRes = await put(request, cookie, `/ops/tasks/checklist/${item.id}`, {
      completed: true,
    });
    expect(toggleRes.status()).toBe(200);
    const toggled = await toggleRes.json();
    expect(toggled.completed).toBe(true);

    // Delete checklist item
    const delRes = await del(request, cookie, `/ops/tasks/checklist/${item.id}`);
    expect(delRes.status()).toBe(204);
  });

  test('task labels: create, list, delete', async ({ request }) => {
    // Create labels
    const res1 = await post(request, cookie, '/ops/labels', { name: 'bug', color: '#ef4444' });
    expect(res1.status()).toBe(201);
    await post(request, cookie, '/ops/labels', { name: 'feature', color: '#3b82f6' });

    // List
    const listRes = await get(request, cookie, '/ops/labels');
    expect(listRes.status()).toBe(200);
    const labels = await listRes.json();
    expect(labels.labels).toHaveLength(2);

    // Delete
    const label = labels.labels[0];
    const delRes = await del(request, cookie, `/ops/labels/${label.id}`);
    expect(delRes.status()).toBe(204);
  });

  test('invalid status transition is rejected', async ({ request }) => {
    const createRes = await post(request, cookie, '/ops/tasks', { title: 'Test' });
    const task = await createRes.json();
    // backlog → in_review is not allowed (must go through todo → in_progress first)
    const res = await put(request, cookie, `/ops/tasks/${task.id}`, { status: 'in_review' });
    expect(res.status()).toBe(400);
  });

  test('update task title and description', async ({ request }) => {
    const createRes = await post(request, cookie, '/ops/tasks', {
      title: 'Original title',
      description: 'Original description',
    });
    const task = await createRes.json();

    const updateRes = await put(request, cookie, `/ops/tasks/${task.id}`, {
      title: 'Updated title',
      description: 'Updated description',
    });
    expect(updateRes.status()).toBe(200);
    const updated = await updateRes.json();
    expect(updated.title).toBe('Updated title');
    expect(updated.description).toBe('Updated description');
  });

  test('create task with minimal fields', async ({ request }) => {
    const createRes = await post(request, cookie, '/ops/tasks', { title: 'Minimal task' });
    expect(createRes.status()).toBe(201);
    const task = await createRes.json();
    expect(task.title).toBe('Minimal task');
    expect(task.status).toBe('backlog');
    expect(task.priority).toBe('medium');
  });

  test('get nonexistent task returns 404', async ({ request }) => {
    const res = await get(request, cookie, '/ops/tasks/00000000-0000-0000-0000-000000000000');
    expect(res.status()).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// 2. Time Tracking API (E2E)
// ---------------------------------------------------------------------------

test.describe('Time Tracking API (E2E)', () => {
  let cookie: string;

  test.beforeEach(async ({ request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
  });

  test('time entry lifecycle: create, submit, approve', async ({ request }) => {
    const now = new Date();
    const startedAt = new Date(now.getTime() - 3600000).toISOString(); // 1 hour ago
    const endedAt = now.toISOString();

    // Create entry
    const createRes = await post(request, cookie, '/ops/time-entries', {
      description: 'Working on frontend',
      startedAt,
      endedAt,
    });
    expect(createRes.status()).toBe(201);
    const entry = await createRes.json();
    expect(entry.status).toBe('draft');
    expect(entry.durationMinutes).toBe(60);

    // Submit
    const submitRes = await post(request, cookie, '/ops/time-entries/submit', {
      entryIds: [entry.id],
    });
    expect(submitRes.status()).toBe(200);
    const submitted = await submitRes.json();
    expect(submitted.entries[0].status).toBe('submitted');

    // Approve
    const approveRes = await post(request, cookie, '/ops/time-entries/review', {
      entryIds: [entry.id],
      action: 'approve',
    });
    expect(approveRes.status()).toBe(200);
    const approved = await approveRes.json();
    expect(approved.entries[0].status).toBe('approved');
    expect(approved.entries[0].approvedBy).toBeTruthy();
  });

  test('manual duration entry', async ({ request }) => {
    const createRes = await post(request, cookie, '/ops/time-entries', {
      description: 'Meeting',
      startedAt: new Date().toISOString(),
      durationMinutes: 30,
    });
    expect(createRes.status()).toBe(201);
    const entry = await createRes.json();
    expect(entry.durationMinutes).toBe(30);
  });

  test('list and filter entries', async ({ request }) => {
    const startedAt = new Date().toISOString();
    await post(request, cookie, '/ops/time-entries', { description: 'Entry 1', startedAt });
    await post(request, cookie, '/ops/time-entries', { description: 'Entry 2', startedAt });

    const allRes = await get(request, cookie, '/ops/time-entries');
    expect(allRes.status()).toBe(200);
    const all = await allRes.json();
    expect(all.entries).toHaveLength(2);

    // Filter by status
    const draftRes = await get(request, cookie, '/ops/time-entries?status=draft');
    const drafts = await draftRes.json();
    expect(drafts.entries).toHaveLength(2);
  });

  test('reject time entries', async ({ request }) => {
    const startedAt = new Date().toISOString();
    const createRes = await post(request, cookie, '/ops/time-entries', {
      description: 'To reject',
      startedAt,
    });
    const entry = await createRes.json();

    // Submit first
    await post(request, cookie, '/ops/time-entries/submit', { entryIds: [entry.id] });

    // Reject
    const rejectRes = await post(request, cookie, '/ops/time-entries/review', {
      entryIds: [entry.id],
      action: 'reject',
    });
    expect(rejectRes.status()).toBe(200);
    const rejected = await rejectRes.json();
    expect(rejected.entries[0].status).toBe('rejected');
  });

  test('delete draft time entry', async ({ request }) => {
    const startedAt = new Date().toISOString();
    const createRes = await post(request, cookie, '/ops/time-entries', {
      description: 'To delete',
      startedAt,
    });
    const entry = await createRes.json();

    const delRes = await del(request, cookie, `/ops/time-entries/${entry.id}`);
    expect(delRes.status()).toBe(204);

    // Confirm deletion
    const getRes = await get(request, cookie, `/ops/time-entries/${entry.id}`);
    expect(getRes.status()).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// 3. Schedule API (E2E)
// ---------------------------------------------------------------------------

test.describe('Schedule API (E2E)', () => {
  let cookie: string;

  test.beforeEach(async ({ request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
  });

  test('shift lifecycle: create, claim, complete', async ({ request }) => {
    const tomorrow = new Date(Date.now() + 86400000);
    const startsAt = new Date(tomorrow.setHours(9, 0, 0, 0)).toISOString();
    const endsAt = new Date(tomorrow.setHours(17, 0, 0, 0)).toISOString();

    // Create open shift
    const createRes = await post(request, cookie, '/ops/shifts', {
      title: 'Morning shift',
      startsAt,
      endsAt,
      location: 'Office',
    });
    expect(createRes.status()).toBe(201);
    const shift = await createRes.json();
    expect(shift.status).toBe('open');
    expect(shift.location).toBe('Office');

    // Claim shift
    const claimRes = await post(request, cookie, `/ops/shifts/${shift.id}/claim`);
    expect(claimRes.status()).toBe(200);
    const claimed = await claimRes.json();
    expect(claimed.status).toBe('assigned');

    // Complete shift
    const completeRes = await post(request, cookie, `/ops/shifts/${shift.id}/complete`);
    expect(completeRes.status()).toBe(200);
    const completed = await completeRes.json();
    expect(completed.status).toBe('completed');
  });

  test('list shifts with filters', async ({ request }) => {
    const startsAt = new Date(Date.now() + 86400000).toISOString();
    const endsAt = new Date(Date.now() + 90000000).toISOString();
    await post(request, cookie, '/ops/shifts', { title: 'Shift A', startsAt, endsAt });
    await post(request, cookie, '/ops/shifts', { title: 'Shift B', startsAt, endsAt });

    const allRes = await get(request, cookie, '/ops/shifts');
    expect(allRes.status()).toBe(200);
    const all = await allRes.json();
    expect(all.items).toHaveLength(2);

    // Filter by status
    const openRes = await get(request, cookie, '/ops/shifts?status=open');
    const open = await openRes.json();
    expect(open.items).toHaveLength(2);
  });

  test('delete shift', async ({ request }) => {
    const startsAt = new Date(Date.now() + 86400000).toISOString();
    const endsAt = new Date(Date.now() + 90000000).toISOString();
    const createRes = await post(request, cookie, '/ops/shifts', {
      title: 'To delete',
      startsAt,
      endsAt,
    });
    const shift = await createRes.json();

    const delRes = await del(request, cookie, `/ops/shifts/${shift.id}`);
    expect(delRes.status()).toBe(204);
  });

  test('update shift details', async ({ request }) => {
    const startsAt = new Date(Date.now() + 86400000).toISOString();
    const endsAt = new Date(Date.now() + 90000000).toISOString();
    const createRes = await post(request, cookie, '/ops/shifts', {
      title: 'Original shift',
      startsAt,
      endsAt,
      location: 'Office',
    });
    const shift = await createRes.json();

    const updateRes = await put(request, cookie, `/ops/shifts/${shift.id}`, {
      title: 'Updated shift',
      location: 'Remote',
    });
    expect(updateRes.status()).toBe(200);
    const updated = await updateRes.json();
    expect(updated.title).toBe('Updated shift');
    expect(updated.location).toBe('Remote');
  });

  test('cannot complete unclaimed shift', async ({ request }) => {
    const startsAt = new Date(Date.now() + 86400000).toISOString();
    const endsAt = new Date(Date.now() + 90000000).toISOString();
    const createRes = await post(request, cookie, '/ops/shifts', {
      title: 'Open shift',
      startsAt,
      endsAt,
    });
    const shift = await createRes.json();

    // Attempt to complete without claiming first
    const completeRes = await post(request, cookie, `/ops/shifts/${shift.id}/complete`);
    expect(completeRes.status()).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// 4. Expenses API (E2E)
// ---------------------------------------------------------------------------

test.describe('Expenses API (E2E)', () => {
  let cookie: string;

  test.beforeEach(async ({ request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
  });

  test('expense category management', async ({ request }) => {
    // Create categories
    const res1 = await post(request, cookie, '/finance/expense-categories', {
      name: 'Travel',
      description: 'Business travel expenses',
      budgetLimit: 5000,
    });
    expect(res1.status()).toBe(201);
    const cat = await res1.json();
    expect(cat.name).toBe('Travel');

    await post(request, cookie, '/finance/expense-categories', { name: 'Office Supplies' });

    // List
    const listRes = await get(request, cookie, '/finance/expense-categories');
    const list = await listRes.json();
    expect(list.categories).toHaveLength(2);

    // Delete
    const delRes = await del(request, cookie, `/finance/expense-categories/${cat.id}`);
    expect(delRes.status()).toBe(204);
  });

  test('expense lifecycle: create, review, reimburse', async ({ request }) => {
    // Create expense
    const createRes = await post(request, cookie, '/finance/expenses', {
      title: 'Flight to conference',
      amount: 450.50,
      currency: 'USD',
    });
    expect(createRes.status()).toBe(201);
    const expense = await createRes.json();
    expect(expense.title).toBe('Flight to conference');
    expect(expense.amount).toBe(450.5);
    expect(expense.status).toBe('submitted');

    // Approve
    const approveRes = await post(request, cookie, `/finance/expenses/${expense.id}/review`, {
      action: 'approve',
      note: 'Approved for Q1 budget',
    });
    expect(approveRes.status()).toBe(200);
    const approved = await approveRes.json();
    expect(approved.status).toBe('approved');
    expect(approved.reviewNote).toBe('Approved for Q1 budget');

    // Reimburse
    const reimburseRes = await post(request, cookie, '/finance/expenses/reimburse', {
      expenseIds: [expense.id],
    });
    expect(reimburseRes.status()).toBe(200);
    const reimbursed = await reimburseRes.json();
    expect(reimbursed.reimbursed).toBe(1);
  });

  test('reject expense', async ({ request }) => {
    const createRes = await post(request, cookie, '/finance/expenses', {
      title: 'Personal item',
      amount: 100,
    });
    const expense = await createRes.json();

    const rejectRes = await post(request, cookie, `/finance/expenses/${expense.id}/review`, {
      action: 'reject',
      note: 'Not a business expense',
    });
    expect(rejectRes.status()).toBe(200);
    const rejected = await rejectRes.json();
    expect(rejected.status).toBe('rejected');
  });

  test('list expenses with filters', async ({ request }) => {
    await post(request, cookie, '/finance/expenses', { title: 'Expense 1', amount: 100 });
    await post(request, cookie, '/finance/expenses', { title: 'Expense 2', amount: 200 });

    const allRes = await get(request, cookie, '/finance/expenses');
    expect(allRes.status()).toBe(200);
    const all = await allRes.json();
    expect(all.items).toHaveLength(2);

    // Filter by status
    const submittedRes = await get(request, cookie, '/finance/expenses?status=submitted');
    const submitted = await submittedRes.json();
    expect(submitted.items).toHaveLength(2);
  });

  test('expense with category assignment', async ({ request }) => {
    // Create category first
    const catRes = await post(request, cookie, '/finance/expense-categories', {
      name: 'Software',
      description: 'Software subscriptions',
    });
    const cat = await catRes.json();

    // Create expense with category
    const createRes = await post(request, cookie, '/finance/expenses', {
      title: 'IDE License',
      amount: 199.99,
      currency: 'USD',
      categoryId: cat.id,
    });
    expect(createRes.status()).toBe(201);
    const expense = await createRes.json();
    expect(expense.categoryId).toBe(cat.id);
  });
});

// ---------------------------------------------------------------------------
// 5. Revenue API (E2E)
// ---------------------------------------------------------------------------

test.describe('Revenue API (E2E)', () => {
  let cookie: string;

  test.beforeEach(async ({ request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
  });

  test('revenue entry lifecycle: create, get, update, delete', async ({ request }) => {
    // Create
    const createRes = await post(request, cookie, '/finance/revenue', {
      title: 'Client project payment',
      amount: 5000,
      currency: 'USD',
      source: 'stripe',
      sourceReference: 'pi_123456',
    });
    expect(createRes.status()).toBe(201);
    const entry = await createRes.json();
    expect(entry.title).toBe('Client project payment');
    expect(entry.amount).toBe(5000);
    expect(entry.source).toBe('stripe');

    // Get
    const getRes = await get(request, cookie, `/finance/revenue/${entry.id}`);
    expect(getRes.status()).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.id).toBe(entry.id);

    // Update
    const updateRes = await put(request, cookie, `/finance/revenue/${entry.id}`, {
      title: 'Updated payment',
      amount: 5500,
    });
    expect(updateRes.status()).toBe(200);
    const updated = await updateRes.json();
    expect(updated.title).toBe('Updated payment');
    expect(updated.amount).toBe(5500);

    // Delete
    const delRes = await del(request, cookie, `/finance/revenue/${entry.id}`);
    expect(delRes.status()).toBe(204);
  });

  test('list revenue entries', async ({ request }) => {
    await post(request, cookie, '/finance/revenue', { title: 'Rev 1', amount: 1000 });
    await post(request, cookie, '/finance/revenue', { title: 'Rev 2', amount: 2000 });
    await post(request, cookie, '/finance/revenue', { title: 'Rev 3', amount: 3000 });

    const allRes = await get(request, cookie, '/finance/revenue');
    expect(allRes.status()).toBe(200);
    const all = await allRes.json();
    expect(all.items).toHaveLength(3);
  });

  test('get nonexistent revenue entry returns 404', async ({ request }) => {
    const res = await get(request, cookie, '/finance/revenue/00000000-0000-0000-0000-000000000000');
    expect(res.status()).toBe(404);
  });

  test('revenue entries with different sources', async ({ request }) => {
    await post(request, cookie, '/finance/revenue', {
      title: 'Stripe payment',
      amount: 1000,
      source: 'stripe',
    });
    await post(request, cookie, '/finance/revenue', {
      title: 'Invoice payment',
      amount: 2000,
      source: 'invoice',
    });
    await post(request, cookie, '/finance/revenue', {
      title: 'Membership dues',
      amount: 500,
      source: 'membership',
    });

    const allRes = await get(request, cookie, '/finance/revenue');
    expect(allRes.status()).toBe(200);
    const all = await allRes.json();
    expect(all.items).toHaveLength(3);

    // Verify each source is correctly stored
    const sources = all.items.map((item: { source: string }) => item.source);
    expect(sources).toContain('stripe');
    expect(sources).toContain('invoice');
    expect(sources).toContain('membership');
  });
});
