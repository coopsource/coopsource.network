import { test, expect } from '@playwright/test';
import { ADMIN, wp, setupCooperative, loginAs } from './helpers.js';

test.describe('Notifications', () => {
  test.beforeEach(async ({ page, request }) => {
    await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('notification bell is visible in workspace navbar', async ({ page }) => {
    await page.goto(wp('/members'));
    await expect(page.getByRole('button', { name: 'Notifications' })).toBeVisible();
  });

  test('notification bell shows no badge when no unread notifications', async ({ page }) => {
    await page.goto(wp('/members'));
    const bell = page.getByRole('button', { name: 'Notifications' });
    await expect(bell).toBeVisible();
    // The red badge span should not be present when count is 0
    await expect(bell.locator('span.rounded-full')).not.toBeVisible();
  });

  test('clicking bell opens dropdown with empty state', async ({ page }) => {
    await page.goto(wp('/members'));
    await page.getByRole('button', { name: 'Notifications' }).click();
    await expect(page.getByText('No notifications')).toBeVisible();
  });

  test('dropdown closes on Escape key', async ({ page }) => {
    await page.goto(wp('/members'));
    await page.getByRole('button', { name: 'Notifications' }).click();
    await expect(page.getByText('No notifications')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByText('No notifications')).not.toBeVisible();
  });

  test('dropdown contains "View all notifications" link', async ({ page }) => {
    await page.goto(wp('/members'));
    await page.getByRole('button', { name: 'Notifications' }).click();
    const viewAll = page.getByRole('link', { name: 'View all notifications' });
    await expect(viewAll).toBeVisible();
    await expect(viewAll).toHaveAttribute('href', wp('/notifications'));
  });

  test('sidebar contains Notifications link', async ({ page }) => {
    await page.goto(wp('/members'));
    const link = page.getByRole('link', { name: 'Notifications' });
    await expect(link).toBeVisible();
  });

  test('sidebar Notifications link navigates to notifications page', async ({ page }) => {
    await page.goto(wp('/members'));
    await page.getByRole('link', { name: 'Notifications' }).click();
    await expect(page).toHaveURL(wp('/notifications'));
  });

  test('notifications page renders with heading and empty state', async ({ page }) => {
    await page.goto(wp('/notifications'));
    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
    await expect(page.getByText('No notifications yet')).toBeVisible();
  });

  test('notifications page has All and Unread filter tabs', async ({ page }) => {
    await page.goto(wp('/notifications'));
    await expect(page.getByRole('tab', { name: 'All' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Unread/ })).toBeVisible();
  });

  test('switching to Unread tab shows empty state', async ({ page }) => {
    await page.goto(wp('/notifications'));
    await page.getByRole('tab', { name: /Unread/ }).click();
    await expect(page.getByText('No unread notifications')).toBeVisible();
  });

  test('"View all notifications" link navigates from dropdown to page', async ({ page }) => {
    await page.goto(wp('/members'));
    await page.getByRole('button', { name: 'Notifications' }).click();
    await page.getByRole('link', { name: 'View all notifications' }).click();
    await expect(page).toHaveURL(wp('/notifications'));
    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
  });
});
