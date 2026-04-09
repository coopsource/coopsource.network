import { test, expect } from '@playwright/test';
import { ADMIN, wp, setupCooperative, loginAs } from './helpers.js';

test.describe('Proposals', () => {
  test.beforeEach(async ({ page, request }) => {
    await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('proposals list renders with New proposal button', async ({ page }) => {
    await page.goto(wp('/governance'));
    await expect(page.locator('h1', { hasText: 'Governance' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'New proposal' })).toBeVisible();
  });

  test('create proposal redirects to detail page', async ({ page }) => {
    await page.goto(wp('/governance/new'));
    await page.getByLabel('Title').fill('Test Proposal');
    await page.getByLabel('Description').fill('This is a test proposal for E2E testing.');
    await page.getByRole('button', { name: 'Create proposal' }).click();

    // Should redirect to the proposal detail page
    await page.waitForURL(/\/coop\/[^/]+\/governance\/[a-f0-9-]+$/);
    await expect(page.getByRole('heading', { name: 'Test Proposal' })).toBeVisible();
    await expect(page.getByText('draft')).toBeVisible();
  });

  test('open proposal and cast vote', async ({ page }) => {
    // Create a proposal
    await page.goto(wp('/governance/new'));
    await page.getByLabel('Title').fill('Voting Test');
    await page.getByLabel('Description').fill('A proposal to test voting.');
    await page.getByRole('button', { name: 'Create proposal' }).click();
    await page.waitForURL(/\/coop\/[^/]+\/governance\/[a-f0-9-]+$/);

    // Open for voting
    await page.getByRole('button', { name: 'Open for voting' }).click();

    // Should show voting section
    await expect(page.getByText('Cast Your Vote')).toBeVisible({ timeout: 10_000 });

    // Cast a vote
    await page.getByRole('button', { name: 'Yes' }).click();

    // Should show the vote was cast
    await expect(page.getByText(/You voted.*yes/i)).toBeVisible({ timeout: 10_000 });
  });

  test('edit draft proposal and verify changes', async ({ page }) => {
    // Create a proposal
    await page.goto(wp('/governance/new'));
    await page.getByLabel('Title').fill('Original Title');
    await page.getByLabel('Description').fill('Original body text.');
    await page.getByRole('button', { name: 'Create proposal' }).click();
    await page.waitForURL(/\/coop\/[^/]+\/governance\/[a-f0-9-]+$/);
    await expect(page.getByRole('heading', { name: 'Original Title' })).toBeVisible();

    // Click Edit link (visible for draft proposals)
    await page.getByRole('link', { name: 'Edit' }).click();
    await page.waitForURL(/\/governance\/[a-f0-9-]+\/edit$/);

    // Verify pre-filled values
    await expect(page.getByLabel('Title')).toHaveValue('Original Title');
    await expect(page.getByLabel('Description')).toHaveValue('Original body text.');

    // Modify fields
    await page.getByLabel('Title').fill('Updated Title');
    await page.getByLabel('Description').fill('Updated body text.');
    await page.getByRole('button', { name: 'Save changes' }).click();

    // Verify redirect to detail page with updated content
    await page.waitForURL(/\/governance\/[a-f0-9-]+$/);
    await expect(page.getByRole('heading', { name: 'Updated Title' })).toBeVisible();
    await expect(page.getByText('Updated body text.')).toBeVisible();
  });

  test('edit link not visible after opening proposal', async ({ page }) => {
    // Create a proposal
    await page.goto(wp('/governance/new'));
    await page.getByLabel('Title').fill('Non-editable Proposal');
    await page.getByLabel('Description').fill('Will be opened for voting.');
    await page.getByRole('button', { name: 'Create proposal' }).click();
    await page.waitForURL(/\/coop\/[^/]+\/governance\/[a-f0-9-]+$/);

    // Open for voting
    await page.getByRole('button', { name: 'Open for voting' }).click();
    await expect(page.getByText('Cast Your Vote')).toBeVisible({ timeout: 10_000 });

    // Edit link should not be visible
    await expect(page.getByRole('link', { name: 'Edit' })).not.toBeVisible();
  });

  test('vote is reflected in tally', async ({ page }) => {
    // Create and open a proposal
    await page.goto(wp('/governance/new'));
    await page.getByLabel('Title').fill('Tally Test');
    await page.getByLabel('Description').fill('A proposal to test tally.');
    await page.getByRole('button', { name: 'Create proposal' }).click();
    await page.waitForURL(/\/coop\/[^/]+\/governance\/[a-f0-9-]+$/);
    await page.getByRole('button', { name: 'Open for voting' }).click();
    await expect(page.getByText('Cast Your Vote')).toBeVisible({ timeout: 10_000 });

    // Cast vote
    await page.getByRole('button', { name: 'Yes' }).click();

    // Check tally shows 1 vote
    await expect(page.getByText(/1 total vote/)).toBeVisible({ timeout: 10_000 });
  });
});
