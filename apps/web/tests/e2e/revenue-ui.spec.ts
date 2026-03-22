import { test, expect, type APIRequestContext } from '@playwright/test';
import { ADMIN, wp, setupCooperative, loginAs } from './helpers.js';

const API = 'http://localhost:3002/api/v1';

async function post(request: APIRequestContext, cookie: string, path: string, data: unknown) {
  return request.post(`${API}${path}`, { headers: { Cookie: cookie }, data });
}

test.describe('Revenue UI', () => {
  let cookie: string;

  test.beforeEach(async ({ page, request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('page renders with header and empty state', async ({ page }) => {
    await page.goto(wp('/revenue'));
    await expect(page.locator('h1', { hasText: 'Revenue' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Record Revenue' })).toBeVisible();
    await expect(page.getByText('No revenue recorded')).toBeVisible();
  });

  test('record revenue via modal form', async ({ page }) => {
    await page.goto(wp('/revenue'));
    await page.getByRole('button', { name: 'Record Revenue' }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });

    await page.locator('#rev-title').fill('Client Project Payment');
    await page.locator('#rev-amount').fill('5000');
    await page.getByRole('dialog').getByRole('button', { name: 'Record Revenue' }).click();

    await expect(page.getByText('Client Project Payment')).toBeVisible({ timeout: 10_000 });
  });

  test('summary cards show total after seeding', async ({ page, request }) => {
    await post(request, cookie, '/finance/revenue', {
      title: 'Consulting Fee',
      amount: 2000,
      source: 'Consulting',
    });
    await post(request, cookie, '/finance/revenue', {
      title: 'Workshop Income',
      amount: 800,
      source: 'Workshops',
    });

    await page.goto(wp('/revenue'));
    await expect(page.getByText('Consulting Fee')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Workshop Income')).toBeVisible();
  });

  test('delete button visible for entries', async ({ page, request }) => {
    await post(request, cookie, '/finance/revenue', {
      title: 'Revenue to Delete',
      amount: 100,
    });

    await page.goto(wp('/revenue'));
    await expect(page.getByText('Revenue to Delete')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible();
  });
});
