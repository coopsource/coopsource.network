import { test, expect, type APIRequestContext } from '@playwright/test';
import { ADMIN, wp, setupCooperative, loginAs } from './helpers.js';

const API = 'http://localhost:3002/api/v1';

async function post(request: APIRequestContext, cookie: string, path: string, data: unknown) {
  return request.post(`${API}${path}`, { headers: { Cookie: cookie }, data });
}

/** Get an ISO datetime string for a day within the current week (offset from Sunday). */
function currentWeekDay(dayOffset: number, hour: number): string {
  const now = new Date();
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - now.getDay());
  sunday.setHours(hour, 0, 0, 0);
  sunday.setDate(sunday.getDate() + dayOffset);
  return sunday.toISOString();
}

/** Get a datetime-local string (YYYY-MM-DDTHH:MM) for form input. */
function currentWeekDayLocal(dayOffset: number, hour: number): string {
  const now = new Date();
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - now.getDay());
  sunday.setHours(hour, 0, 0, 0);
  sunday.setDate(sunday.getDate() + dayOffset);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${sunday.getFullYear()}-${pad(sunday.getMonth() + 1)}-${pad(sunday.getDate())}T${pad(hour)}:00`;
}

test.describe('Schedule UI', () => {
  let cookie: string;

  test.beforeEach(async ({ page, request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('page renders with weekly calendar grid', async ({ page }) => {
    await page.goto(wp('/schedule'));
    await expect(page.locator('h1', { hasText: 'Schedule' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New Shift' })).toBeVisible();

    // 7 day columns
    for (const day of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) {
      await expect(page.getByText(day, { exact: false }).first()).toBeVisible();
    }
  });

  test('create shift via modal form', async ({ page }) => {
    await page.goto(wp('/schedule'));
    await page.getByRole('button', { name: 'New Shift' }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });

    // Use a date within the current displayed week
    await page.locator('#shift-title').fill('Morning Opening');
    await page.locator('#shift-start').fill(currentWeekDayLocal(3, 8));  // Wednesday 8am
    await page.locator('#shift-end').fill(currentWeekDayLocal(3, 12));   // Wednesday 12pm
    await page.getByRole('dialog').getByRole('button', { name: 'Create Shift' }).click();

    await expect(page.getByText('Morning Opening')).toBeVisible({ timeout: 10_000 });
  });

  test('shift card shows claim button for open shifts', async ({ page, request }) => {
    // Seed a shift within the current week via API (uses startsAt/endsAt)
    await post(request, cookie, '/ops/shifts', {
      title: 'Claimable Shift',
      startsAt: currentWeekDay(1, 9),   // Monday 9am
      endsAt: currentWeekDay(1, 17),    // Monday 5pm
    });

    await page.goto(wp('/schedule'));
    await expect(page.getByText('Claimable Shift')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Claim' })).toBeVisible();
  });

  test('fairness summary after claimed shift', async ({ page, request }) => {
    // Seed and claim a shift
    const shiftRes = await post(request, cookie, '/ops/shifts', {
      title: 'Claimed Shift',
      startsAt: currentWeekDay(2, 10),  // Tuesday 10am
      endsAt: currentWeekDay(2, 14),    // Tuesday 2pm
    });
    const shift = await shiftRes.json();
    await post(request, cookie, `/ops/shifts/${shift.id}/claim`, {});

    await page.goto(wp('/schedule'));
    await expect(page.getByText('Shift Distribution')).toBeVisible({ timeout: 10_000 });
  });
});
