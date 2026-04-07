import { test, expect } from '@playwright/test';
import { ADMIN, setupCooperative, loginAs } from './helpers.js';

test.describe('V8.3 — Profile dropdown', () => {
  test.beforeEach(async ({ page, request }) => {
    await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('sidebar shows profile dropdown trigger with display name', async ({ page }) => {
    const trigger = page.getByTestId('profile-dropdown-trigger');
    await expect(trigger).toBeVisible();
    await expect(trigger).toContainText(ADMIN.displayName);
  });

  test('clicking the trigger opens the dropdown', async ({ page }) => {
    await page.getByTestId('profile-dropdown-trigger').click();
    // Validate via a menuitem (which auto-waits) instead of the wrapper —
    // avoids the Svelte 5 hydration race seen on direct toBeVisible checks.
    const viewProfile = page.getByRole('menuitem', { name: 'View profile' });
    await expect(viewProfile).toBeVisible();
    const menu = page.getByTestId('profile-dropdown-menu');
    await expect(menu).toContainText(ADMIN.displayName);
    await expect(menu).toContainText('current');
  });

  test('"View profile" navigates to /me/profile', async ({ page }) => {
    await page.getByTestId('profile-dropdown-trigger').click();
    await page.getByRole('menuitem', { name: 'View profile' }).click();
    await expect(page).toHaveURL(/\/me\/profile$/);
  });

  test('"Settings" navigates to /me/settings', async ({ page }) => {
    await page.getByTestId('profile-dropdown-trigger').click();
    await page.getByRole('menuitem', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/\/me\/settings$/);
  });

  test('Escape closes the dropdown', async ({ page }) => {
    const trigger = page.getByTestId('profile-dropdown-trigger');
    await trigger.click();
    // Use a menuitem (auto-waits) instead of the wrapper testid to avoid
    // the Svelte 5 hydration race seen on direct toBeVisible checks.
    const viewProfile = page.getByRole('menuitem', { name: 'View profile' });
    await expect(viewProfile).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(viewProfile).not.toBeVisible();
  });

  test('clicking outside closes the dropdown', async ({ page }) => {
    await page.getByTestId('profile-dropdown-trigger').click();
    const viewProfile = page.getByRole('menuitem', { name: 'View profile' });
    await expect(viewProfile).toBeVisible();

    // Click on the main content area (anywhere outside the dropdown)
    await page.getByRole('main').click();
    await expect(viewProfile).not.toBeVisible();
  });
});

test.describe('V8.3 — /me/profile Current Profile card', () => {
  test.beforeEach(async ({ page, request }) => {
    await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);
    await page.goto('/me/profile');
  });

  test('shows the Current Profile card with the user display name', async ({ page }) => {
    const card = page.getByTestId('current-profile-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText(ADMIN.displayName);
  });

  test('shows the V8.3 future-state placeholder note', async ({ page }) => {
    const note = page.getByTestId('profile-future-note');
    await expect(note).toBeVisible();
    await expect(note).toContainText('More profiles coming soon');
  });
});
