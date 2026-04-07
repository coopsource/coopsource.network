import { test, expect } from '@playwright/test';
import { ADMIN, COOP, WORKSPACE, wp, setupCooperative, loginAs } from './helpers.js';

test.describe('Home', () => {
  test.beforeEach(async ({ page, request }) => {
    await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('home renders with cooperative card', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
    await expect(page.getByRole('heading', { name: COOP.name })).toBeVisible();
  });

  test('cooperative card navigates to workspace', async ({ page }) => {
    await page.getByRole('link', { name: new RegExp(COOP.handle) }).first().click();
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

  test('home shows My Cooperatives section', async ({ page }) => {
    await expect(page.getByText('My Cooperatives')).toBeVisible();
  });

  test('home hides My Networks section when user has no networks', async ({ page }) => {
    // My Networks section is conditional — only rendered when networks.length > 0
    await expect(page.getByText('My Networks')).not.toBeVisible();
  });
});
