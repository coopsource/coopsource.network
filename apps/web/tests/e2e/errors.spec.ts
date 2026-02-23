import { test, expect } from '@playwright/test';
import { ADMIN, setupCooperative, loginAs } from './helpers.js';

test.describe('Error Scenarios', () => {
	test.beforeEach(async ({ page, request }) => {
		await setupCooperative(request);
		await loginAs(page, ADMIN.email, ADMIN.password);
	});

	test('creating agreement without title shows validation error', async ({ page }) => {
		await page.goto('/agreements/new');

		// Remove the required attribute so the form submits with empty title
		await page.getByLabel('Title').evaluate((el: HTMLInputElement) => el.removeAttribute('required'));
		await page.getByRole('button', { name: 'Create agreement' }).click();
		await page.waitForLoadState('networkidle');

		await expect(page.getByText('Title is required')).toBeVisible();
	});

	test('creating proposal without title shows validation error', async ({ page }) => {
		await page.goto('/proposals/new');

		// Remove required attributes so the form submits with empty fields
		await page.getByLabel('Title').evaluate((el: HTMLInputElement) => el.removeAttribute('required'));
		await page.getByLabel('Description').evaluate((el: HTMLTextAreaElement) => el.removeAttribute('required'));
		await page.getByRole('button', { name: 'Create proposal' }).click();
		await page.waitForLoadState('networkidle');

		await expect(page.getByText('Title and body are required')).toBeVisible();
	});

	test('navigating to non-existent agreement shows error', async ({ page }) => {
		const response = await page.goto('/agreements/at%3A%2F%2Fdid%3Aplc%3Afake%2Fnetwork.coopsource.agreement.agreement%2Fnonexistent');
		// Should get a non-200 response or show an error
		expect(response?.status()).toBeGreaterThanOrEqual(400);
	});
});
