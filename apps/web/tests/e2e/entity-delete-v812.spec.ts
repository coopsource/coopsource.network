import { test, expect, type APIRequestContext } from '@playwright/test';
import { ADMIN, wp, setupCooperative, loginAs } from './helpers.js';

const API = 'http://localhost:3002/api/v1';

async function post(request: APIRequestContext, cookie: string, path: string, data: unknown) {
  return request.post(`${API}${path}`, { headers: { Cookie: cookie }, data });
}

test.describe('Proposal Delete', () => {
  let cookie: string;

  test.beforeEach(async ({ page, request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('delete draft proposal via confirm dialog', async ({ page, request }) => {
    // Create draft proposal via API
    await post(request, cookie, '/proposals', {
      title: 'Proposal To Delete',
      description: 'Should be removed',
      votingType: 'simple_majority',
    });

    await page.goto(wp('/governance'));
    await expect(page.getByText('Proposal To Delete')).toBeVisible({ timeout: 10_000 });

    // Navigate to detail page
    await page.getByText('Proposal To Delete').click();
    await expect(page.getByRole('heading', { name: 'Proposal To Delete' })).toBeVisible({ timeout: 10_000 });

    // Click Delete button
    await page.getByRole('button', { name: 'Delete' }).click();

    // Confirm dialog should appear
    await expect(page.getByText('permanently remove this draft proposal')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Delete' }).last().click();

    // Should redirect to governance list
    await expect(page).toHaveURL(/\/governance/, { timeout: 10_000 });
    // Proposal should be gone
    await expect(page.getByText('Proposal To Delete')).not.toBeVisible({ timeout: 5_000 });
  });
});

test.describe('Task Delete', () => {
  let cookie: string;

  test.beforeEach(async ({ page, request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('delete task via confirm dialog in list view', async ({ page, request }) => {
    await post(request, cookie, '/ops/tasks', {
      title: 'Task To Delete',
      priority: 'low',
      status: 'backlog',
    });

    await page.goto(wp('/tasks'));
    await page.getByRole('button', { name: 'List' }).click();
    await expect(page.getByText('Task To Delete')).toBeVisible({ timeout: 10_000 });

    // Click Delete button
    await page.getByRole('button', { name: 'Delete' }).first().click();

    // Confirm dialog should appear
    await expect(page.getByText('permanently delete this task')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Delete' }).last().click();

    // Task should be removed from the list
    await expect(page.getByText('Task To Delete')).not.toBeVisible({ timeout: 10_000 });
  });

  test('delete button not visible for done tasks', async ({ page, request }) => {
    await post(request, cookie, '/ops/tasks', {
      title: 'Completed Task',
      priority: 'low',
      status: 'done',
    });

    await page.goto(wp('/tasks'));
    await page.getByRole('button', { name: 'List' }).click();
    await page.getByRole('link', { name: 'Done', exact: true }).click();
    await expect(page.getByText('Completed Task')).toBeVisible({ timeout: 10_000 });

    // Delete button should not be visible for done tasks
    await expect(page.getByRole('button', { name: 'Delete' })).not.toBeVisible();
  });
});

test.describe('Commerce Listing Archive', () => {
  let cookie: string;

  test.beforeEach(async ({ page, request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('archive listing via confirm dialog', async ({ page, request }) => {
    await post(request, cookie, '/commerce/listings', {
      title: 'Listing To Archive',
      description: 'Will be archived',
      category: 'services',
      availability: 'available',
    });

    await page.goto(wp('/commerce/listings'));
    await expect(page.getByText('Listing To Archive')).toBeVisible({ timeout: 10_000 });

    // Click Remove/Delete button
    await page.getByRole('button', { name: /Remove|Delete/i }).first().click();

    // Confirm dialog should appear
    await expect(page.getByText('archive this listing')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /Remove|Delete/i }).last().click();

    // Listing should no longer be visible in the active list
    await expect(page.getByText('Listing To Archive')).not.toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Expense Delete Guard', () => {
  let cookie: string;

  test.beforeEach(async ({ page, request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('delete button only appears for draft expenses', async ({ page, request }) => {
    // Create a submitted expense (should NOT show delete)
    await post(request, cookie, '/finance/expenses', {
      amount: 5000,
      currency: 'USD',
      description: 'Submitted Expense',
      category: 'office_supplies',
      status: 'submitted',
    });

    await page.goto(wp('/expenses'));
    await expect(page.getByText('Submitted Expense')).toBeVisible({ timeout: 10_000 });

    // Delete button should NOT be visible for submitted expense
    await expect(page.getByRole('button', { name: 'Delete' })).not.toBeVisible();
  });
});
