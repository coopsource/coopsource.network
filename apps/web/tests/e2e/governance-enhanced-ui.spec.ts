import { test, expect } from '@playwright/test';
import { ADMIN, wp, setupCooperative, loginAs } from './helpers.js';

test.describe('Governance — Tabs', () => {
  test.beforeEach(async ({ page, request }) => {
    await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('governance page has Proposals, Delegations, and Feed tabs', async ({ page }) => {
    await page.goto(wp('/governance'));
    await expect(page.locator('h1', { hasText: 'Governance' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Proposals/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Delegations/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Feed/ })).toBeVisible();
  });

  test('proposals tab shows existing proposal functionality', async ({ page }) => {
    await page.goto(wp('/governance'));
    await expect(page.getByRole('link', { name: 'New proposal' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Draft' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open' })).toBeVisible();
  });

  test('delegations tab is accessible', async ({ page }) => {
    await page.goto(wp('/governance'));
    await expect(page.getByRole('tab', { name: /Delegations/ })).toBeVisible();
  });

  test('feed tab is accessible', async ({ page }) => {
    await page.goto(wp('/governance'));
    await page.locator('button[role="tab"]').filter({ hasText: 'Feed' }).click();
    await expect(page.getByRole('tab', { name: /Feed/ })).toHaveAttribute('aria-selected', 'true');
  });
});

test.describe('Governance — Vote Weights on Detail Page', () => {
  test.beforeEach(async ({ page, request }) => {
    await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('proposal detail shows vote tally after voting', async ({ page }) => {
    await page.goto(wp('/governance/new'));
    await page.getByLabel('Title').fill('Weight Test');
    await page.getByLabel('Description').fill('Test vote weights');
    await page.getByRole('button', { name: 'Create proposal' }).click();
    await page.waitForURL(/\/governance\/[a-f0-9-]+$/);

    await page.getByRole('button', { name: 'Open for voting' }).click();
    await expect(page.getByText('Cast Your Vote')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Yes' }).click();
    await expect(page.getByText(/You voted.*yes/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/1 total vote/)).toBeVisible();
  });
});
