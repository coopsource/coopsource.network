import { test, expect } from '@playwright/test';
import { ADMIN, wp, setupCooperative, loginAs } from './helpers.js';

test.describe('Partners UI', () => {
  test.beforeEach(async ({ page, request }) => {
    await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('partners page renders with tabs and empty state', async ({ page }) => {
    await page.goto(wp('/partners'));
    await expect(page.locator('h1', { hasText: 'Partners' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Partners/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Pending/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /All Links/ })).toBeVisible();
    await expect(page.getByText('No partners')).toBeVisible();
  });

  test('create link button opens modal', async ({ page }) => {
    await page.goto(wp('/partners'));
    await page.getByRole('button', { name: 'Create link' }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Target DID')).toBeVisible();
    await expect(page.getByText('Link Type')).toBeVisible();
  });
});
