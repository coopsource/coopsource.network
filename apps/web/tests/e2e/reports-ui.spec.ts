import { test, expect, type APIRequestContext } from '@playwright/test';
import { ADMIN, wp, setupCooperative, loginAs } from './helpers.js';

const API = 'http://localhost:3002/api/v1';

async function post(request: APIRequestContext, cookie: string, path: string, data: unknown) {
  return request.post(`${API}${path}`, { headers: { Cookie: cookie }, data });
}

test.describe('Reports UI', () => {
  let cookie: string;

  test.beforeEach(async ({ page, request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('page renders with header and empty state', async ({ page }) => {
    await page.goto(wp('/reports'));
    await expect(page.locator('h1', { hasText: 'Reports' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New Template' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generate Report' })).toBeVisible();
    await expect(page.getByText('No reports yet')).toBeVisible();
  });

  test('type filter tabs rendered', async ({ page }) => {
    await page.goto(wp('/reports'));
    for (const tab of ['All Types', 'Annual', 'Board Packet', 'Financial', 'Membership', 'Compliance']) {
      await expect(page.getByRole('link', { name: tab, exact: true })).toBeVisible();
    }
  });

  test('create template modal opens with form fields', async ({ page }) => {
    await page.goto(wp('/reports'));
    await page.getByRole('button', { name: 'New Template' }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });

    await expect(page.locator('#tpl-name')).toBeVisible();
    await expect(page.locator('#tpl-type')).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Create Template' })).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  test('template seeded via API appears on page', async ({ page, request }) => {
    await post(request, cookie, '/reports/templates', {
      name: 'Annual Report Tpl',
      reportType: 'annual',
    });

    await page.goto(wp('/reports'));
    await expect(page.getByText('Annual Report Tpl')).toBeVisible({ timeout: 10_000 });
  });

  test('delete template', async ({ page, request }) => {
    const res = await post(request, cookie, '/reports/templates', {
      name: 'Delete Me Template',
      reportType: 'annual',
    });
    expect(res.status()).toBe(201);

    await page.goto(wp('/reports'));
    await expect(page.getByText('Delete Me Template')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Delete Me Template')).not.toBeVisible({ timeout: 10_000 });
  });
});
