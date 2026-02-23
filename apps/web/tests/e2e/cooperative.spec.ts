import { test, expect } from '@playwright/test';
import { ADMIN, COOP, setupCooperative, loginAs } from './helpers.js';

test.describe('Cooperative Profile', () => {
	test.beforeEach(async ({ page, request }) => {
		await setupCooperative(request);
		await loginAs(page, ADMIN.email, ADMIN.password);
	});

	test('cooperative page shows name, status, and DID', async ({ page }) => {
		await page.goto('/cooperative');
		await expect(page.getByRole('heading', { name: 'Co-op Settings' })).toBeVisible();
		await expect(page.getByRole('main').getByText(COOP.name)).toBeVisible();
		await expect(page.getByRole('main').getByText('active', { exact: true })).toBeVisible();
		await expect(page.getByText(/did:plc:/)).toBeVisible();
	});

	test('edit button toggles edit form', async ({ page }) => {
		await page.goto('/cooperative');

		// View mode — Edit button visible, no form inputs
		await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();

		// Click Edit — form should appear
		await page.getByRole('button', { name: 'Edit' }).click();
		await expect(page.getByLabel('Display Name')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
	});

	test('update display name shows Settings saved message', async ({ page }) => {
		await page.goto('/cooperative');
		await page.getByRole('button', { name: 'Edit' }).click();

		await page.getByLabel('Display Name').fill('Renamed Co-op');
		await page.getByRole('button', { name: 'Save changes' }).click();
		await page.waitForLoadState('networkidle');

		await expect(page.getByText('Settings saved.')).toBeVisible();
		await expect(page.getByRole('main').getByText('Renamed Co-op')).toBeVisible();
	});

	test('cancel edit returns to view mode', async ({ page }) => {
		await page.goto('/cooperative');
		await page.getByRole('button', { name: 'Edit' }).click();
		await expect(page.getByLabel('Display Name')).toBeVisible();

		await page.getByRole('button', { name: 'Cancel' }).click();

		// Should be back in view mode — no form inputs, Edit button visible again
		await expect(page.getByLabel('Display Name')).not.toBeVisible();
		await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
	});
});
