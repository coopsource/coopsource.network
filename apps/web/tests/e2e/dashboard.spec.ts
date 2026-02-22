import { test, expect } from '@playwright/test';
import { ADMIN, COOP, setupCooperative, loginAs } from './helpers.js';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page, request }) => {
    await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('dashboard renders co-op info card', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('heading', { name: COOP.name })).toBeVisible();
  });

  test('sidebar contains Threads link', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Threads' })).toBeVisible();
  });

  test('recent Proposals and Agreements sections visible', async ({ page }) => {
    await expect(page.getByText('Recent Proposals')).toBeVisible();
    await expect(page.getByText('Recent Agreements')).toBeVisible();
  });

  test('sidebar contains Campaigns link', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Campaigns' })).toBeVisible();
  });

  test('sidebar contains Alignment link', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Alignment' })).toBeVisible();
  });

  test('dashboard shows Recent Campaigns section', async ({ page }) => {
    await expect(page.getByText('Recent Campaigns')).toBeVisible();
  });

  test('dashboard shows Recent Outcomes section', async ({ page }) => {
    await expect(page.getByText('Recent Outcomes')).toBeVisible();
  });
});
