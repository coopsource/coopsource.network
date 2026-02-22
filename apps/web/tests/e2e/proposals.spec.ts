import { test, expect } from '@playwright/test';
import { ADMIN, setupCooperative, loginAs } from './helpers.js';

test.describe('Proposals', () => {
  test.beforeEach(async ({ page, request }) => {
    await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('proposals list renders with New proposal button', async ({ page }) => {
    await page.goto('/proposals');
    await expect(page.getByRole('heading', { name: 'Proposals', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'New proposal' })).toBeVisible();
  });

  test('create proposal redirects to detail page', async ({ page }) => {
    await page.goto('/proposals/new');
    await page.getByLabel('Title').fill('Test Proposal');
    await page.getByLabel('Description').fill('This is a test proposal for E2E testing.');
    await page.getByRole('button', { name: 'Create proposal' }).click();

    // Should redirect to the proposal detail page
    await page.waitForURL(/\/proposals\/[a-f0-9-]+$/);
    await expect(page.getByRole('heading', { name: 'Test Proposal' })).toBeVisible();
    await expect(page.getByText('draft')).toBeVisible();
  });

  test('open proposal and cast vote', async ({ page }) => {
    // Create a proposal
    await page.goto('/proposals/new');
    await page.getByLabel('Title').fill('Voting Test');
    await page.getByLabel('Description').fill('A proposal to test voting.');
    await page.getByRole('button', { name: 'Create proposal' }).click();
    await page.waitForURL(/\/proposals\/[a-f0-9-]+$/);

    // Open for voting
    await page.getByRole('button', { name: 'Open for voting' }).click();
    await page.waitForLoadState('networkidle');

    // Should show voting section
    await expect(page.getByText('Cast Your Vote')).toBeVisible();

    // Cast a vote
    await page.getByRole('button', { name: 'Yes' }).click();
    await page.waitForLoadState('networkidle');

    // Should show the vote was cast
    await expect(page.getByText(/You voted.*yes/i)).toBeVisible();
  });

  test('vote is reflected in tally', async ({ page }) => {
    // Create and open a proposal
    await page.goto('/proposals/new');
    await page.getByLabel('Title').fill('Tally Test');
    await page.getByLabel('Description').fill('A proposal to test tally.');
    await page.getByRole('button', { name: 'Create proposal' }).click();
    await page.waitForURL(/\/proposals\/[a-f0-9-]+$/);
    await page.getByRole('button', { name: 'Open for voting' }).click();
    await page.waitForLoadState('networkidle');

    // Cast vote
    await page.getByRole('button', { name: 'Yes' }).click();
    await page.waitForLoadState('networkidle');

    // Check tally shows 1 vote
    await expect(page.getByText(/1 total vote/)).toBeVisible();
  });
});
