import { test, expect } from '@playwright/test';
import { ADMIN, wp, setupCooperative, loginAs } from './helpers.js';

test.describe('Member Classes Settings UI', () => {
  test.beforeEach(async ({ page, request }) => {
    await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('member classes page renders with empty state', async ({ page }) => {
    await page.goto(wp('/settings/member-classes'));
    await expect(page.locator('h1', { hasText: 'Member Classes' })).toBeVisible();
    await expect(page.getByText('No member classes')).toBeVisible();
    await expect(page.getByRole('button', { name: 'New class' })).toBeVisible();
  });

  test('create member class via modal', async ({ page }) => {
    await page.goto(wp('/settings/member-classes'));
    await page.getByRole('button', { name: 'New class' }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });

    await page.locator('#className').fill('Worker');
    await page.locator('#classDesc').fill('Worker-owners');
    await page.locator('#voteWeight').fill('1');
    await page.locator('#boardSeats').fill('3');
    await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();

    await expect(page.getByText('Updated successfully')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('cell', { name: 'Worker', exact: true })).toBeVisible();
  });

  test('assign member button exists', async ({ page }) => {
    await page.goto(wp('/settings/member-classes'));
    await expect(page.getByRole('button', { name: 'Assign member' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New class' })).toBeVisible();
  });
});
