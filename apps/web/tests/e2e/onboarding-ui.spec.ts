import { test, expect, type APIRequestContext } from '@playwright/test';
import { ADMIN, wp, setupCooperative, loginAs } from './helpers.js';

const API = 'http://localhost:3002/api/v1';

async function post(request: APIRequestContext, cookie: string, path: string, data: unknown) {
  return request.post(`${API}${path}`, { headers: { Cookie: cookie }, data });
}

test.describe('Onboarding UI', () => {
  let cookie: string;
  let adminDid: string;

  test.beforeEach(async ({ page, request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
    adminDid = setup.adminDid;
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('onboarding page renders with tabs', async ({ page }) => {
    await page.goto(wp('/onboarding'));
    await expect(page.locator('h1', { hasText: 'Onboarding' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Progress/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Configuration/ })).toBeVisible();
  });

  test('create onboarding config', async ({ page }) => {
    await page.goto(wp('/onboarding'));
    await page.locator('button[role="tab"]').filter({ hasText: 'Configuration' }).click();

    await page.locator('#probationDays').fill('60');
    await page.locator('#requireTraining').check();

    await page.getByRole('button', { name: 'Create configuration' }).click();
    await expect(page.getByText('Saved successfully')).toBeVisible({ timeout: 10_000 });
  });

  test('onboarding config API works', async ({ request }) => {
    const createRes = await post(request, cookie, '/onboarding/config', {
      probationDurationDays: 30,
      requireTraining: true,
      requireBuyIn: false,
      buddySystemEnabled: false,
    });
    expect(createRes.status()).toBe(201);
    const config = await createRes.json();
    expect(config.probationDurationDays).toBe(30);
    expect(config.requireTraining).toBe(true);
  });

  test('start onboarding for admin (self-onboard)', async ({ request }) => {
    await post(request, cookie, '/onboarding/config', { probationDurationDays: 30 });

    const startRes = await post(request, cookie, '/onboarding/start', { memberDid: adminDid });
    expect(startRes.status()).toBe(201);
    const progress = await startRes.json();
    expect(progress.memberDid).toBe(adminDid);
    expect(progress.status).toBe('in_progress');
  });

  test('view onboarding detail page', async ({ page, request }) => {
    await post(request, cookie, '/onboarding/config', {
      probationDurationDays: 30,
      requireTraining: true,
    });
    await post(request, cookie, '/onboarding/start', { memberDid: adminDid });

    await page.goto(wp(`/onboarding/${encodeURIComponent(adminDid)}`));
    await expect(page.getByText('Checklist')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Training')).toBeVisible();
  });

  test('complete training step', async ({ page, request }) => {
    await post(request, cookie, '/onboarding/config', {
      probationDurationDays: 30,
      requireTraining: true,
    });
    await post(request, cookie, '/onboarding/start', { memberDid: adminDid });

    await page.goto(wp(`/onboarding/${encodeURIComponent(adminDid)}`));
    await expect(page.getByText('Training')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Mark done' }).first().click();
    await expect(page.getByText('Updated successfully')).toBeVisible({ timeout: 10_000 });
  });

  test('create onboarding review via API', async ({ request }) => {
    await post(request, cookie, '/onboarding/config', { probationDurationDays: 30 });
    await post(request, cookie, '/onboarding/start', { memberDid: adminDid });

    const reviewRes = await post(request, cookie, '/onboarding/review', {
      memberDid: adminDid,
      reviewType: 'periodic',
      outcome: 'pass',
      comments: 'Making good progress.',
    });
    expect(reviewRes.status()).toBe(201);
    const review = await reviewRes.json();
    expect(review.outcome).toBe('pass');
  });

  test('complete onboarding via API', async ({ request }) => {
    await post(request, cookie, '/onboarding/config', { probationDurationDays: 30 });
    await post(request, cookie, '/onboarding/start', { memberDid: adminDid });

    const completeRes = await post(request, cookie, '/onboarding/complete', { memberDid: adminDid });
    expect(completeRes.status()).toBe(200);
    const completed = await completeRes.json();
    expect(completed.status).toBe('completed');
  });

  test('members page shows onboarding link', async ({ page }) => {
    await page.goto(wp('/members'));
    await expect(page.getByRole('link', { name: 'View onboarding progress' })).toBeVisible();
  });
});
