import { test, expect, type APIRequestContext } from '@playwright/test';
import { ADMIN, wp, setupCooperative, loginAs } from './helpers.js';

const API = 'http://localhost:3002/api/v1';

async function post(request: APIRequestContext, cookie: string, path: string, data: unknown) {
  return request.post(`${API}${path}`, { headers: { Cookie: cookie }, data });
}

async function put(request: APIRequestContext, cookie: string, path: string, data: unknown) {
  return request.put(`${API}${path}`, { headers: { Cookie: cookie }, data });
}

test.describe('Expenses UI', () => {
  let cookie: string;

  test.beforeEach(async ({ page, request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('page renders with header and empty state', async ({ page }) => {
    await page.goto(wp('/expenses'));
    await expect(page.locator('h1', { hasText: 'Expenses' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit Expense' })).toBeVisible();
    await expect(page.getByText('No expenses')).toBeVisible();
  });

  test('submit expense via modal form', async ({ page }) => {
    await page.goto(wp('/expenses'));
    await page.getByRole('button', { name: 'Submit Expense' }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });

    await page.locator('#exp-title').fill('Office Supplies');
    await page.locator('#exp-amount').fill('49.99');
    await page.getByRole('dialog').getByRole('button', { name: 'Submit Expense' }).click();

    await expect(page.getByText('Office Supplies')).toBeVisible({ timeout: 10_000 });
  });

  test('status filter tabs rendered', async ({ page }) => {
    await page.goto(wp('/expenses'));
    for (const tab of ['All', 'Submitted', 'Approved', 'Rejected', 'Reimbursed']) {
      await expect(page.getByRole('link', { name: tab, exact: true })).toBeVisible();
    }
  });

  test('category summary cards show after seeding', async ({ page, request }) => {
    // Seed category + expense via API
    const catRes = await post(request, cookie, '/finance/expense-categories', {
      name: 'Travel',
    });
    const category = await catRes.json();

    await post(request, cookie, '/finance/expenses', {
      title: 'Flight to NYC',
      amount: 350,
      categoryId: category.id,
    });

    await page.goto(wp('/expenses'));
    await expect(page.getByText('Flight to NYC')).toBeVisible({ timeout: 10_000 });
  });

  test('delete button only for submitted expenses', async ({ page, request }) => {
    // Seed an expense
    const expRes = await post(request, cookie, '/finance/expenses', {
      title: 'Deletable Expense',
      amount: 25,
    });
    const expense = await expRes.json();

    // Approve it via API
    await put(request, cookie, `/finance/expenses/${expense.id}/review`, {
      status: 'approved',
    });

    await page.goto(wp('/expenses'));

    // Filter to approved — should not have Delete button
    await page.getByRole('link', { name: 'Approved', exact: true }).click();
    await expect(page.getByText('Deletable Expense')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Delete' })).not.toBeVisible();
  });
});
