import { test, expect } from '@playwright/test';
import { ADMIN, COOP, setupCooperative, loginAs } from './helpers.js';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page, request }) => {
    await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('dashboard renders co-op info card', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByText(COOP.name)).toBeVisible();
  });

  test('sidebar contains Threads link', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Threads' })).toBeVisible();
  });

  test('recent Proposals and Agreements sections visible', async ({ page }) => {
    await expect(page.getByText('Recent Proposals')).toBeVisible();
    await expect(page.getByText('Recent Agreements')).toBeVisible();
  });
});
