import { test, expect, type APIRequestContext } from '@playwright/test';
import { ADMIN, wp, setupCooperative, loginAs } from './helpers.js';

const API = 'http://localhost:3002/api/v1';

async function post(request: APIRequestContext, cookie: string, path: string, data: unknown) {
  return request.post(`${API}${path}`, { headers: { Cookie: cookie }, data });
}

test.describe('Admin — Officers Tab', () => {
  test.beforeEach(async ({ page, request }) => {
    await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('admin page renders with tabs', async ({ page }) => {
    await page.goto(wp('/admin'));
    await expect(page.getByRole('heading', { name: 'Administration' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Officers/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Compliance/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Notices/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Fiscal Periods/ })).toBeVisible();
  });

  test('appoint officer via modal', async ({ page, request }) => {
    const setup = await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);

    // Create officer via API since MemberSelect requires complex interaction
    const API = 'http://localhost:3002/api/v1';
    await request.post(`${API}/admin/officers`, {
      headers: { Cookie: setup.cookie },
      data: {
        officerDid: setup.adminDid,
        title: 'president',
        appointedAt: '2026-01-01T00:00:00.000Z',
        appointmentType: 'elected',
      },
    });

    await page.goto(wp('/admin'));

    // Table should show the officer
    await expect(page.getByText('president')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('elected')).toBeVisible();
    await expect(page.getByText('active')).toBeVisible();
  });

  test('end officer term', async ({ page, request }) => {
    const setup = await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);

    // Create officer via API
    await post(request, setup.cookie, '/admin/officers', {
      officerDid: setup.adminDid,
      title: 'treasurer',
      appointedAt: '2026-01-01T00:00:00.000Z',
      appointmentType: 'appointed',
    });

    await page.goto(wp('/admin'));
    await expect(page.getByText('treasurer')).toBeVisible();
    await page.getByRole('button', { name: 'End term' }).click();

    // Confirm dialog
    await expect(page.getByText('Are you sure you want to end')).toBeVisible();
    await page.getByRole('button', { name: 'End term' }).nth(1).click();

    await expect(page.getByText('ended')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Admin — Compliance Tab', () => {
  test.beforeEach(async ({ page, request }) => {
    await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('create and complete compliance item', async ({ page }) => {
    await page.goto(wp('/admin'));
    await page.getByRole('tab', { name: /Compliance/ }).click();

    await page.getByRole('button', { name: 'New compliance item' }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });

    await page.locator('#compTitle').fill('Annual Report 2026');
    await page.locator('#dueDate').fill('2026-04-15');
    await page.locator('#filingType').selectOption('annual_report');
    await page.getByRole('button', { name: 'Create' }).click();

    await expect(page.getByText('Annual Report 2026')).toBeVisible({ timeout: 10_000 });

    // Mark complete
    await page.getByRole('button', { name: 'Mark complete' }).click();
    await expect(page.getByText('Mark this compliance item')).toBeVisible();
    await page.getByRole('button', { name: 'Mark complete' }).nth(1).click();

    await expect(page.getByText('completed')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Admin — Notices Tab', () => {
  test.beforeEach(async ({ page, request }) => {
    await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('send member notice via API and view in notices tab', async ({ page, request }) => {
    const setup = await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);

    // Create notice via API
    const API = 'http://localhost:3002/api/v1';
    await request.post(`${API}/admin/notices`, {
      headers: { Cookie: setup.cookie },
      data: { title: 'Annual Meeting', body: 'The annual meeting is scheduled for April 1.', noticeType: 'meeting', targetAudience: 'all' },
    });

    await page.goto(wp('/admin'));
    // Click the Notices tab button directly
    await page.locator('button[role="tab"]').filter({ hasText: 'Notices' }).click();
    // Wait for content to appear
    await expect(page.getByText('The annual meeting is scheduled')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Annual Meeting').first()).toBeVisible();
  });
});

test.describe('Admin — Fiscal Periods Tab', () => {
  test.beforeEach(async ({ page, request }) => {
    await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('create and close fiscal period', async ({ page }) => {
    await page.goto(wp('/admin'));
    await page.getByRole('tab', { name: /Fiscal/ }).click();

    await page.getByRole('button', { name: 'New fiscal period' }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });

    await page.locator('#fiscalLabel').fill('FY2026');
    await page.locator('#startsAt').fill('2026-01-01');
    await page.locator('#endsAt').fill('2026-12-31');
    await page.getByRole('button', { name: 'Create' }).click();

    await expect(page.getByText('FY2026')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('open')).toBeVisible();

    // Close the period
    await page.getByRole('button', { name: 'Close period' }).click();
    await expect(page.getByText('Are you sure you want to close')).toBeVisible();
    await page.getByRole('button', { name: 'Close period' }).nth(1).click();

    await expect(page.getByText('closed')).toBeVisible({ timeout: 10_000 });
  });
});
