import { test, expect } from '@playwright/test';
import { ADMIN, WORKSPACE, wp, setupCooperative, loginAs } from './helpers.js';

test.describe('External Connections', () => {
	test.beforeEach(async ({ page, request }) => {
		await setupCooperative(request);
		await loginAs(page, ADMIN.email, ADMIN.password);
	});

	test('connections page renders', async ({ page }) => {
		await page.goto(wp('/settings/connections'));
		await expect(page.getByRole('heading', { name: 'External Connections' })).toBeVisible();
		await expect(page.getByText('Connect external services')).toBeVisible();
	});

	test('shows no services configured message when none available', async ({ page }) => {
		await page.goto(wp('/settings/connections'));

		// In test env, no OAuth services are configured
		await expect(
			page.getByText('No external services are configured'),
		).toBeVisible();
	});

	test('shows no current connections for new user', async ({ page }) => {
		await page.goto(wp('/settings/connections'));

		// "Your Connections" section should not appear when there are none
		await expect(page.getByRole('heading', { name: 'Your Connections' })).not.toBeVisible();
	});

	test('sidebar navigation to connections works', async ({ page }) => {
		await page.goto(WORKSPACE);
		await page.getByRole('link', { name: 'Connections' }).click();
		await expect(page).toHaveURL(wp('/settings/connections'));
		await expect(page.getByRole('heading', { name: 'External Connections' })).toBeVisible();
	});

	test('displays success message after OAuth redirect', async ({ page }) => {
		await page.goto(wp('/settings/connections') + '?connected=github');
		await expect(page.getByText('Successfully connected to GitHub')).toBeVisible();
	});

	test('displays error message after failed OAuth redirect', async ({ page }) => {
		await page.goto(wp('/settings/connections') + '?error=oauth_failed');
		await expect(page.getByText('OAuth authorization failed')).toBeVisible();
	});
});
