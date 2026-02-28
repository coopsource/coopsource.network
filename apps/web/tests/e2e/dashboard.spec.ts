import { test, expect } from '@playwright/test';
import { ADMIN, COOP, WORKSPACE, wp, setupCooperative, loginAs } from './helpers.js';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page, request }) => {
    await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('dashboard renders with cooperative card', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByText(COOP.name)).toBeVisible();
  });

  test('cooperative card navigates to workspace', async ({ page }) => {
    await page.getByText(COOP.name).click();
    await expect(page).toHaveURL(new RegExp(WORKSPACE));
  });

  test('workspace sidebar contains Posts link', async ({ page }) => {
    await page.goto(WORKSPACE);
    await expect(page.getByRole('link', { name: 'Posts' })).toBeVisible();
  });

  test('workspace sidebar contains Campaigns link', async ({ page }) => {
    await page.goto(WORKSPACE);
    await expect(page.getByRole('link', { name: 'Campaigns' })).toBeVisible();
  });

  test('workspace sidebar contains Alignment link', async ({ page }) => {
    await page.goto(WORKSPACE);
    await expect(page.getByRole('link', { name: 'Alignment' })).toBeVisible();
  });

  test('dashboard shows My Cooperatives section', async ({ page }) => {
    await expect(page.getByText('My Cooperatives')).toBeVisible();
  });

  test('dashboard shows My Networks section', async ({ page }) => {
    await expect(page.getByText('My Networks')).toBeVisible();
  });
});
