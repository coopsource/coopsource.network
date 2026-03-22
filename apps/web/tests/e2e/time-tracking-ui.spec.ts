import { test, expect, type APIRequestContext } from '@playwright/test';
import { ADMIN, wp, setupCooperative, loginAs } from './helpers.js';

const API = 'http://localhost:3002/api/v1';

async function post(request: APIRequestContext, cookie: string, path: string, data: unknown) {
  return request.post(`${API}${path}`, { headers: { Cookie: cookie }, data });
}

test.describe('Time Tracking UI', () => {
  let cookie: string;

  test.beforeEach(async ({ page, request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('page renders with timer and summary cards', async ({ page }) => {
    await page.goto(wp('/time'));
    await expect(page.locator('h1', { hasText: 'Time Tracking' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log Time' })).toBeVisible();
    await expect(page.getByText('00:00:00')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
  });

  test('timer start/stop toggle', async ({ page }) => {
    await page.goto(wp('/time'));
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible({ timeout: 5_000 });

    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible({ timeout: 5_000 });
  });

  test('log time via modal form', async ({ page }) => {
    await page.goto(wp('/time'));
    await page.getByRole('button', { name: 'Log Time' }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });

    await page.locator('#entry-desc').fill('Code review session');
    await page.locator('#entry-start').fill('2026-03-20T09:00');
    await page.locator('#entry-duration').fill('90');
    await page.getByRole('dialog').getByRole('button', { name: 'Save Entry' }).click();

    await expect(page.getByText('Code review session')).toBeVisible({ timeout: 10_000 });
  });

  test('status filter tabs rendered', async ({ page }) => {
    await page.goto(wp('/time'));
    for (const tab of ['All', 'Draft', 'Submitted', 'Approved', 'Rejected']) {
      await expect(page.getByRole('link', { name: tab, exact: true })).toBeVisible();
    }
  });

  test('draft entries show checkbox and delete', async ({ page, request }) => {
    const now = new Date();
    await post(request, cookie, '/ops/time-entries', {
      description: 'Draft time entry',
      startedAt: now.toISOString(),
      durationMinutes: 60,
    });

    await page.goto(wp('/time'));
    await expect(page.getByText('Draft time entry')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible();
  });
});
