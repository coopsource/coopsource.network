import { test, expect, type APIRequestContext } from '@playwright/test';
import { ADMIN, wp, setupCooperative, loginAs } from './helpers.js';

const API = 'http://localhost:3002/api/v1';

async function post(request: APIRequestContext, cookie: string, path: string, data: unknown) {
  return request.post(`${API}${path}`, { headers: { Cookie: cookie }, data });
}

test.describe('Finance Hub', () => {
  test.beforeEach(async ({ page, request }) => {
    await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('finance page renders with overview and tabs', async ({ page }) => {
    await page.goto(wp('/finance'));
    await expect(page.locator('h1', { hasText: 'Finance' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Overview/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Patronage/ })).toBeVisible();
  });

  test('overview shows summary cards', async ({ page }) => {
    await page.goto(wp('/finance'));
    await expect(page.locator('.rounded-lg', { hasText: 'Total Balance' }).first()).toBeVisible();
    await expect(page.locator('.rounded-lg', { hasText: 'Patronage Configs' }).first()).toBeVisible();
  });

  test('quick links navigate to sub-pages', async ({ page }) => {
    await page.goto(wp('/finance'));
    await page.getByRole('link', { name: 'Manage Patronage' }).click();
    await expect(page.locator('h1', { hasText: 'Patronage' })).toBeVisible();
  });
});

test.describe('Patronage', () => {
  let cookie: string;

  test.beforeEach(async ({ page, request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('patronage page renders with tabs', async ({ page }) => {
    await page.goto(wp('/finance/patronage'));
    await expect(page.locator('h1', { hasText: 'Patronage' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Records/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Configuration/ })).toBeVisible();
  });

  test('create patronage config', async ({ page }) => {
    await page.goto(wp('/finance/patronage'));
    await page.locator('button[role="tab"]').filter({ hasText: 'Configuration' }).click();

    await page.getByRole('button', { name: 'Add config' }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });

    await page.locator('#metricType').selectOption('hours_worked');
    await page.locator('#cashPayoutPct').fill('25');
    await page.getByRole('button', { name: 'Create' }).click();

    await expect(page.getByText('hours_worked')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('25%')).toBeVisible();
  });

  test('records tab requires fiscal period selection', async ({ page }) => {
    await page.goto(wp('/finance/patronage'));
    await expect(page.getByText('Select a fiscal period')).toBeVisible();
  });

  test('records tab shows empty state for period with no records', async ({ page, request }) => {
    const fpRes = await post(request, cookie, '/admin/fiscal-periods', {
      label: 'FY2025', startsAt: '2025-01-01T00:00:00.000Z', endsAt: '2025-12-31T23:59:59.999Z',
    });
    const fp = await fpRes.json();
    await post(request, cookie, `/admin/fiscal-periods/${fp.id}/close`, {});

    await page.goto(wp(`/finance/patronage?fiscalPeriodId=${fp.id}`));
    await expect(page.getByText('No records')).toBeVisible();
  });
});

test.describe('Capital Accounts', () => {
  test.beforeEach(async ({ page, request }) => {
    await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('capital accounts page renders', async ({ page }) => {
    await page.goto(wp('/finance/capital-accounts'));
    await expect(page.locator('h1', { hasText: 'Capital Accounts' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Record contribution' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Redeem' })).toBeVisible();
  });

  test('record contribution via modal', async ({ page }) => {
    await page.goto(wp('/finance/capital-accounts'));
    await page.getByRole('button', { name: 'Record contribution' }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });

    await page.locator('#contribMember').selectOption({ index: 1 });
    await page.locator('#contribAmount').fill('500');
    await page.getByRole('dialog').getByRole('button', { name: 'Record' }).click();

    await expect(page.getByText('Transaction recorded')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Tax Forms', () => {
  test.beforeEach(async ({ page, request }) => {
    await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('tax forms page renders', async ({ page }) => {
    await page.goto(wp('/finance/tax-forms'));
    await expect(page.locator('h1', { hasText: '1099-PATR Tax Forms' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generate forms' })).toBeVisible();
  });

  test('generate forms button exists on tax forms page', async ({ page }) => {
    await page.goto(wp('/finance/tax-forms'));
    const btn = page.getByRole('button', { name: 'Generate forms' });
    await expect(btn).toBeVisible({ timeout: 10_000 });
    // Verify button is interactive by checking it's not disabled
    await expect(btn).toBeEnabled();
  });
});
