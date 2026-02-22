import { test, expect } from '@playwright/test';
import { ADMIN, setupCooperative, loginAs } from './helpers.js';

test.describe('Agreements', () => {
	test.beforeEach(async ({ page, request }) => {
		await setupCooperative(request);
		await loginAs(page, ADMIN.email, ADMIN.password);
	});

	test('agreement list renders with New agreement button', async ({ page }) => {
		await page.goto('/agreements');
		await expect(page.getByRole('heading', { name: 'Agreements', exact: true })).toBeVisible();
		await expect(page.getByRole('link', { name: 'New agreement' })).toBeVisible();
	});

	test('create agreement redirects to detail page', async ({ page }) => {
		await page.goto('/agreements/new');
		await page.getByLabel('Title').fill('Test Agreement');
		await page.getByLabel('Content').fill('This is the agreement body for E2E testing.');
		await page.getByRole('button', { name: 'Create agreement' }).click();

		await page.waitForURL(/\/agreements\/[a-f0-9-]+$/);
		await expect(page.getByRole('heading', { name: 'Test Agreement' })).toBeVisible();
		await expect(page.locator('.rounded-lg').getByText('draft')).toBeVisible();
	});

	test('open agreement for signing', async ({ page }) => {
		// Create agreement
		await page.goto('/agreements/new');
		await page.getByLabel('Title').fill('Open Test');
		await page.getByLabel('Content').fill('Agreement to test opening.');
		await page.getByRole('button', { name: 'Create agreement' }).click();
		await page.waitForURL(/\/agreements\/[a-f0-9-]+$/);

		// Open for signing
		await page.getByRole('button', { name: 'Open for signing' }).click();
		await page.waitForLoadState('networkidle');

		await expect(page.getByRole('button', { name: 'Sign Agreement' })).toBeVisible();
	});

	test('sign agreement increments signature count', async ({ page }) => {
		// Create and open agreement
		await page.goto('/agreements/new');
		await page.getByLabel('Title').fill('Sign Test');
		await page.getByLabel('Content').fill('Agreement to test signing.');
		await page.getByRole('button', { name: 'Create agreement' }).click();
		await page.waitForURL(/\/agreements\/[a-f0-9-]+$/);
		await page.getByRole('button', { name: 'Open for signing' }).click();
		await page.waitForLoadState('networkidle');

		// Sign — click the green Sign button, then confirm in the modal
		await page.getByRole('button', { name: 'Sign Agreement' }).click();
		await page.getByRole('button', { name: 'Confirm & Sign' }).click();
		await page.waitForLoadState('networkidle');

		// Should show signed confirmation
		await expect(page.getByText('You have signed this agreement.')).toBeVisible();
		await expect(page.getByText('Total signatures: 1')).toBeVisible();
	});

	test('retract signature', async ({ page }) => {
		// Create, open, and sign
		await page.goto('/agreements/new');
		await page.getByLabel('Title').fill('Retract Test');
		await page.getByLabel('Content').fill('Agreement to test retraction.');
		await page.getByRole('button', { name: 'Create agreement' }).click();
		await page.waitForURL(/\/agreements\/[a-f0-9-]+$/);
		await page.getByRole('button', { name: 'Open for signing' }).click();
		await page.waitForLoadState('networkidle');
		await page.getByRole('button', { name: 'Sign Agreement' }).click();
		await page.getByRole('button', { name: 'Confirm & Sign' }).click();
		await page.waitForLoadState('networkidle');

		// Retract
		await page.getByRole('button', { name: 'Retract signature' }).click();
		await page.waitForLoadState('networkidle');

		// Should show sign button again
		await expect(page.getByRole('button', { name: 'Sign Agreement' })).toBeVisible();
		await expect(page.getByText('Total signatures: 0')).toBeVisible();
	});

	test('void agreement', async ({ page }) => {
		// Create agreement
		await page.goto('/agreements/new');
		await page.getByLabel('Title').fill('Void Test');
		await page.getByLabel('Content').fill('Agreement to test voiding.');
		await page.getByRole('button', { name: 'Create agreement' }).click();
		await page.waitForURL(/\/agreements\/[a-f0-9-]+$/);

		// Void — click Void button then confirm in modal
		await page.getByRole('button', { name: 'Void' }).click();
		await page.getByRole('button', { name: 'Void Agreement' }).click();
		await page.waitForLoadState('networkidle');

		// No sign/open buttons should be visible after voiding
		await expect(page.getByRole('button', { name: 'Open for signing' })).not.toBeVisible();
		await expect(page.getByRole('button', { name: 'Sign Agreement' })).not.toBeVisible();
	});
});
