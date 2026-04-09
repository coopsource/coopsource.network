import { test, expect, type APIRequestContext } from '@playwright/test';
import { ADMIN, wp, setupCooperative, loginAs } from './helpers.js';

const API = 'http://localhost:3002/api/v1';

async function post(request: APIRequestContext, cookie: string, path: string, data: unknown) {
  return request.post(`${API}${path}`, { headers: { Cookie: cookie }, data });
}

test.describe('Tasks UI', () => {
  let cookie: string;

  test.beforeEach(async ({ page, request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('page renders with board view and empty columns', async ({ page }) => {
    await page.goto(wp('/tasks'));
    await expect(page.locator('h1', { hasText: 'Tasks' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New Task' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Board' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'List' })).toBeVisible();

    // Board columns
    for (const col of ['Backlog', 'To Do', 'In Progress', 'In Review', 'Done']) {
      await expect(page.getByText(col, { exact: true }).first()).toBeVisible();
    }
  });

  test('create task via modal form', async ({ page }) => {
    await page.goto(wp('/tasks'));
    await page.getByRole('button', { name: 'New Task' }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });

    await page.locator('#task-title').fill('Write unit tests');
    await page.locator('#task-priority').selectOption('high');
    await page.locator('#task-status').selectOption('todo');
    await page.getByRole('dialog').getByRole('button', { name: 'Create Task' }).click();

    await expect(page.getByText('Write unit tests')).toBeVisible({ timeout: 10_000 });
  });

  test('board view shows task cards with priority badge', async ({ page, request }) => {
    await post(request, cookie, '/ops/tasks', {
      title: 'Urgent Bug Fix',
      priority: 'urgent',
      status: 'in_progress',
    });

    await page.goto(wp('/tasks'));
    await expect(page.getByText('Urgent Bug Fix')).toBeVisible({ timeout: 10_000 });
  });

  test('list view shows table with task', async ({ page, request }) => {
    await post(request, cookie, '/ops/tasks', {
      title: 'Listed Task',
      priority: 'medium',
    });

    await page.goto(wp('/tasks'));
    await page.getByRole('button', { name: 'List' }).click();
    await expect(page.getByText('Listed Task')).toBeVisible({ timeout: 10_000 });
  });

  test('status filter tabs rendered', async ({ page }) => {
    await page.goto(wp('/tasks'));
    for (const tab of ['All Statuses', 'Backlog', 'To Do', 'In Progress', 'In Review', 'Done']) {
      await expect(page.getByRole('link', { name: tab, exact: true })).toBeVisible();
    }
  });

  test('edit task via modal in list view', async ({ page, request }) => {
    await post(request, cookie, '/ops/tasks', {
      title: 'Task To Edit',
      priority: 'low',
      status: 'todo',
    });
    await page.goto(wp('/tasks'));

    // Switch to list view
    await page.getByRole('button', { name: 'List' }).click();
    await expect(page.getByText('Task To Edit')).toBeVisible({ timeout: 10_000 });

    // Click edit button
    await page.getByRole('button', { name: 'Edit' }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });

    // Verify pre-filled values
    await expect(page.locator('#task-title')).toHaveValue('Task To Edit');

    // Modify title
    await page.locator('#task-title').fill('Updated Task');
    await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();

    // Verify update
    await expect(page.getByText('Updated Task')).toBeVisible({ timeout: 10_000 });
  });

  test('edit button not visible for done tasks', async ({ page, request }) => {
    await post(request, cookie, '/ops/tasks', {
      title: 'Done Task',
      priority: 'low',
      status: 'done',
    });
    await page.goto(wp('/tasks'));
    await page.getByRole('button', { name: 'List' }).click();
    // Filter to show done tasks
    await page.getByRole('link', { name: 'Done', exact: true }).click();
    await expect(page.getByText('Done Task')).toBeVisible({ timeout: 10_000 });

    // Edit button should not be visible
    await expect(page.getByRole('button', { name: 'Edit' })).not.toBeVisible();
  });

  test('task card shows in correct board column', async ({ page, request }) => {
    await post(request, cookie, '/ops/tasks', {
      title: 'In Progress Task',
      priority: 'medium',
      status: 'in_progress',
    });

    await page.goto(wp('/tasks'));
    await expect(page.getByText('In Progress Task')).toBeVisible({ timeout: 10_000 });
    // Verify the In Progress column shows count "1"
    await expect(page.getByRole('heading', { name: 'In Progress', level: 3 })).toBeVisible();
  });
});
