import { test, expect } from '@playwright/test';
import { ADMIN, wp, setupCooperative, loginAs } from './helpers.js';

test.describe('Funding Campaigns', () => {
	test.beforeEach(async ({ page, request }) => {
		await setupCooperative(request);
		await loginAs(page, ADMIN.email, ADMIN.password);
	});

	test('campaign list renders with New Campaign button', async ({ page }) => {
		await page.goto(wp('/campaigns'));
		await expect(page.getByRole('heading', { name: 'Funding Campaigns' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'New Campaign' })).toBeVisible();
	});

	test('create campaign shows form fields', async ({ page }) => {
		await page.goto(wp('/campaigns/new'));
		await expect(page.getByRole('heading', { name: 'Create Campaign' })).toBeVisible();
		await expect(page.getByLabel('Title')).toBeVisible();
		await expect(page.getByLabel('Description')).toBeVisible();
		await expect(page.getByLabel('Goal Amount ($)')).toBeVisible();
		await expect(page.getByLabel('Tier')).toBeVisible();
		await expect(page.getByLabel('Type')).toBeVisible();
		await expect(page.getByLabel('Funding Model')).toBeVisible();
	});

	test('create campaign redirects to detail page', async ({ page }) => {
		await page.goto(wp('/campaigns/new'));
		await page.getByLabel('Title').fill('Test Fundraiser');
		await page.getByLabel('Description').fill('A test campaign for E2E.');
		await page.getByLabel('Goal Amount ($)').fill('1000');
		await page.getByRole('button', { name: 'Create Campaign' }).click();

		// Should redirect to campaign detail (URI-encoded path)
		await page.waitForURL(/\/coop\/[^/]+\/campaigns\//);
		await expect(page.getByRole('heading', { name: 'Test Fundraiser' })).toBeVisible();
		await expect(page.getByText('draft')).toBeVisible();
		await expect(page.getByText('$1,000')).toBeVisible();
	});

	test('activate campaign enables pledge form', async ({ page }) => {
		// Create campaign via form
		await page.goto(wp('/campaigns/new'));
		await page.getByLabel('Title').fill('Pledge Test');
		await page.getByLabel('Goal Amount ($)').fill('500');
		await page.getByRole('button', { name: 'Create Campaign' }).click();
		await page.waitForURL(/\/coop\/[^/]+\/campaigns\//);

		// Activate
		await page.getByRole('button', { name: 'Activate Campaign' }).click();

		// Pledge form should be visible
		await expect(page.getByRole('heading', { name: 'Make a Pledge' })).toBeVisible({ timeout: 10_000 });
		await expect(page.getByRole('button', { name: 'Pledge' })).toBeVisible({ timeout: 10_000 });
	});

	test('edit draft campaign and verify changes', async ({ page }) => {
		// Create campaign
		await page.goto(wp('/campaigns/new'));
		await page.getByLabel('Title').fill('Draft Campaign');
		await page.getByLabel('Description').fill('Original description');
		await page.getByLabel('Goal Amount ($)').fill('500');
		await page.getByRole('button', { name: 'Create Campaign' }).click();
		await page.waitForURL(/\/coop\/[^/]+\/campaigns\//);

		// Click Edit link
		await page.getByRole('link', { name: 'Edit' }).click();
		await page.waitForURL(/\/campaigns\/.*\/edit$/);

		// Verify pre-filled values
		await expect(page.getByLabel('Title')).toHaveValue('Draft Campaign');
		await expect(page.getByLabel('Goal Amount ($)')).toHaveValue('500');  // 50000 cents / 100 = 500 dollars

		// Modify fields
		await page.getByLabel('Title').fill('Updated Campaign');
		await page.getByLabel('Goal Amount ($)').fill('1000');
		await page.getByRole('button', { name: 'Save changes' }).click();

		// Verify redirect with updated content
		await page.waitForURL(/\/campaigns\/(?!.*edit)/);
		await expect(page.getByRole('heading', { name: 'Updated Campaign' })).toBeVisible();
	});

	test('edit active campaign has locked fields', async ({ page }) => {
		// Create and activate
		await page.goto(wp('/campaigns/new'));
		await page.getByLabel('Title').fill('Active Test');
		await page.getByLabel('Goal Amount ($)').fill('100');
		await page.getByRole('button', { name: 'Create Campaign' }).click();
		await page.waitForURL(/\/coop\/[^/]+\/campaigns\//);
		await page.getByRole('button', { name: 'Activate Campaign' }).click();
		await expect(page.getByRole('heading', { name: 'Make a Pledge' })).toBeVisible({ timeout: 10_000 });

		// Click Edit link (should be visible for active campaigns)
		await page.getByRole('link', { name: 'Edit' }).click();
		await page.waitForURL(/\/campaigns\/.*\/edit$/);

		// Funding Model should be disabled
		await expect(page.locator('#fundingModel')).toBeDisabled();

		// Title should still be editable
		await page.getByLabel('Title').fill('Updated Active Campaign');
		await page.getByRole('button', { name: 'Save changes' }).click();

		await page.waitForURL(/\/campaigns\/(?!.*edit)/);
		await expect(page.getByRole('heading', { name: 'Updated Active Campaign' })).toBeVisible();
	});

	test('status filters work on campaign list', async ({ page }) => {
		await page.goto(wp('/campaigns'));

		// Click Active filter
		await page.getByRole('link', { name: 'Active' }).click();
		await expect(page).toHaveURL(/status=active/);

		// Click All filter
		await page.getByRole('link', { name: 'All' }).click();
		await expect(page).toHaveURL(wp('/campaigns'));
	});
});
