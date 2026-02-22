import { test, expect } from '@playwright/test';
import { ADMIN, setupCooperative, loginAs } from './helpers.js';

test.describe('Master Agreements', () => {
	test.beforeEach(async ({ page, request }) => {
		await setupCooperative(request);
		await loginAs(page, ADMIN.email, ADMIN.password);
	});

	test('master agreements list renders with New button', async ({ page }) => {
		await page.goto('/master-agreements');
		await expect(page.getByRole('heading', { name: 'Master Agreements', exact: true })).toBeVisible();
		await expect(page.getByRole('link', { name: 'New master agreement' })).toBeVisible();
	});

	test('create master agreement shows form fields', async ({ page }) => {
		await page.goto('/master-agreements/new');
		await expect(page.getByRole('heading', { name: 'New Master Agreement' })).toBeVisible();
		await expect(page.getByLabel('Title')).toBeVisible();
		await expect(page.getByLabel('Type')).toBeVisible();
		await expect(page.getByLabel('Purpose')).toBeVisible();
		await expect(page.getByLabel('Scope')).toBeVisible();
	});

	test('create master agreement redirects to detail page', async ({ page }) => {
		await page.goto('/master-agreements/new');
		await page.getByLabel('Title').fill('Worker Co-op Agreement');
		await page.getByLabel('Type').selectOption('worker-cooperative');
		await page.getByLabel('Purpose').fill('Govern the cooperative structure and member responsibilities.');
		await page.getByLabel('Scope').fill('All worker-members of the cooperative.');

		await page.getByRole('button', { name: 'Create agreement' }).click();

		// Should redirect to detail page (URI-encoded path)
		await page.waitForURL(/\/master-agreements\//);
		await expect(page.getByRole('heading', { name: 'Worker Co-op Agreement' })).toBeVisible();
		await expect(page.getByText('draft')).toBeVisible();
		await expect(page.getByText('worker-cooperative')).toBeVisible();
	});

	test('activate master agreement changes status', async ({ page }) => {
		// Create agreement
		await page.goto('/master-agreements/new');
		await page.getByLabel('Title').fill('Activate Test');
		await page.getByRole('button', { name: 'Create agreement' }).click();
		await page.waitForURL(/\/master-agreements\//);

		// Activate
		await page.getByRole('button', { name: 'Activate' }).click();
		await page.waitForLoadState('networkidle');

		// Status should change to active
		await expect(page.getByText('active')).toBeVisible();
		// Activate button should be gone, terminate button should appear
		await expect(page.getByRole('button', { name: 'Activate' })).not.toBeVisible();
		await expect(page.getByRole('button', { name: 'Terminate' })).toBeVisible();
	});

	test('terminate active master agreement', async ({ page }) => {
		// Create and activate
		await page.goto('/master-agreements/new');
		await page.getByLabel('Title').fill('Terminate Test');
		await page.getByRole('button', { name: 'Create agreement' }).click();
		await page.waitForURL(/\/master-agreements\//);
		await page.getByRole('button', { name: 'Activate' }).click();
		await page.waitForLoadState('networkidle');

		// Terminate
		await page.getByRole('button', { name: 'Terminate' }).click();
		await page.waitForLoadState('networkidle');

		await expect(page.getByText('terminated')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Terminate' })).not.toBeVisible();
	});

	test('add stakeholder terms to draft agreement', async ({ page, request }) => {
		// Get admin DID from setup
		const { adminDid } = await setupCooperative(request);
		await loginAs(page, ADMIN.email, ADMIN.password);

		// Create agreement
		await page.goto('/master-agreements/new');
		await page.getByLabel('Title').fill('Terms Test');
		await page.getByRole('button', { name: 'Create agreement' }).click();
		await page.waitForURL(/\/master-agreements\//);

		// Add stakeholder terms
		await page.getByLabel('Stakeholder DID').fill(adminDid);
		await page.getByLabel('Type', { exact: false }).last().selectOption('worker');
		await page.getByLabel('Class (optional)').fill('founding-member');
		await page.getByRole('button', { name: 'Add' }).click();
		await page.waitForLoadState('networkidle');

		// Should show the terms in the list
		await expect(page.getByText(adminDid)).toBeVisible();
		await expect(page.getByText('worker')).toBeVisible();
		await expect(page.getByText('founding-member')).toBeVisible();
	});

	test('remove stakeholder terms from draft agreement', async ({ page, request }) => {
		const { adminDid } = await setupCooperative(request);
		await loginAs(page, ADMIN.email, ADMIN.password);

		// Create agreement
		await page.goto('/master-agreements/new');
		await page.getByLabel('Title').fill('Remove Terms Test');
		await page.getByRole('button', { name: 'Create agreement' }).click();
		await page.waitForURL(/\/master-agreements\//);

		// Add terms
		await page.getByLabel('Stakeholder DID').fill(adminDid);
		await page.getByRole('button', { name: 'Add' }).click();
		await page.waitForLoadState('networkidle');

		// Remove terms
		await page.getByRole('button', { name: 'Remove' }).click();
		await page.waitForLoadState('networkidle');

		// Should show empty message
		await expect(page.getByText('No stakeholder terms have been added yet')).toBeVisible();
	});

	test('status filters work on list page', async ({ page }) => {
		await page.goto('/master-agreements');

		// Click Active filter
		await page.getByRole('link', { name: 'Active' }).click();
		await expect(page).toHaveURL(/status=active/);

		// Click All filter
		await page.getByRole('link', { name: 'All' }).click();
		await expect(page).toHaveURL('/master-agreements');
	});

	test('sidebar navigation to master agreements works', async ({ page }) => {
		await page.goto('/dashboard');
		await page.getByRole('link', { name: 'Master Agreements' }).click();
		await expect(page).toHaveURL('/master-agreements');
		await expect(page.getByRole('heading', { name: 'Master Agreements', exact: true })).toBeVisible();
	});
});
