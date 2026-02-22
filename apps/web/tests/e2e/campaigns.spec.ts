import { test, expect } from '@playwright/test';
import { ADMIN, setupCooperative, loginAs } from './helpers.js';

test.describe('Funding Campaigns', () => {
	test.beforeEach(async ({ page, request }) => {
		await setupCooperative(request);
		await loginAs(page, ADMIN.email, ADMIN.password);
	});

	test('campaign list renders with New Campaign button', async ({ page }) => {
		await page.goto('/campaigns');
		await expect(page.getByRole('heading', { name: 'Funding Campaigns' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'New Campaign' })).toBeVisible();
	});

	test('create campaign shows form fields', async ({ page }) => {
		await page.goto('/campaigns/new');
		await expect(page.getByRole('heading', { name: 'Create Campaign' })).toBeVisible();
		await expect(page.getByLabel('Title')).toBeVisible();
		await expect(page.getByLabel('Description')).toBeVisible();
		await expect(page.getByLabel('Goal Amount ($)')).toBeVisible();
		await expect(page.getByLabel('Tier')).toBeVisible();
		await expect(page.getByLabel('Type')).toBeVisible();
		await expect(page.getByLabel('Funding Model')).toBeVisible();
	});

	test('create campaign and navigate to detail', async ({ page }) => {
		await page.goto('/campaigns/new');
		await page.getByLabel('Title').fill('Test Fundraiser');
		await page.getByLabel('Description').fill('A test campaign for E2E.');
		await page.getByLabel('Goal Amount ($)').fill('1000');
		await page.getByRole('button', { name: 'Create Campaign' }).click();

		// Should redirect to campaign detail
		await page.waitForURL(/\/campaigns\//);
		await expect(page.getByRole('heading', { name: 'Test Fundraiser' })).toBeVisible();
		await expect(page.getByText('draft')).toBeVisible();
		await expect(page.getByText('$0')).toBeVisible();
		await expect(page.getByText('$1,000')).toBeVisible();
	});

	test('activate campaign enables pledge form', async ({ page }) => {
		// Create campaign
		await page.goto('/campaigns/new');
		await page.getByLabel('Title').fill('Pledge Test');
		await page.getByLabel('Goal Amount ($)').fill('500');
		await page.getByRole('button', { name: 'Create Campaign' }).click();
		await page.waitForURL(/\/campaigns\//);

		// Activate
		await page.getByRole('button', { name: 'Activate Campaign' }).click();
		await page.waitForLoadState('networkidle');

		// Pledge form should be visible
		await expect(page.getByRole('heading', { name: 'Make a Pledge' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Pledge' })).toBeVisible();
	});

	test('status filters work on campaign list', async ({ page }) => {
		await page.goto('/campaigns');

		// Click Active filter
		await page.getByRole('link', { name: 'Active' }).click();
		await expect(page).toHaveURL(/status=active/);

		// Click All filter
		await page.getByRole('link', { name: 'All' }).click();
		await expect(page).toHaveURL('/campaigns');
	});
});
