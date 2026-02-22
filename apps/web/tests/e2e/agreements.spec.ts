import { test, expect } from '@playwright/test';
import { ADMIN, setupCooperative, loginAs } from './helpers.js';

test.describe('Agreements (Unified)', () => {
	test.beforeEach(async ({ page, request }) => {
		await setupCooperative(request);
		await loginAs(page, ADMIN.email, ADMIN.password);
	});

	test('agreement list renders with New agreement button', async ({ page }) => {
		await page.goto('/agreements');
		await expect(page.getByRole('heading', { name: 'Agreements', exact: true })).toBeVisible();
		await expect(page.getByRole('link', { name: 'New agreement' })).toBeVisible();
	});

	test('create agreement with structured fields redirects to detail page', async ({ page }) => {
		await page.goto('/agreements/new');
		await page.getByLabel('Title').fill('Worker Co-op Agreement');
		await page.getByLabel('Type').selectOption('worker-cooperative');
		await page.getByLabel('Purpose').fill('Govern the cooperative structure.');
		await page.getByLabel('Scope').fill('All worker-members.');

		await page.getByRole('button', { name: 'Create agreement' }).click();

		// Should redirect to detail page (URI-encoded path)
		await page.waitForURL(/\/agreements\//);
		await expect(page.getByRole('heading', { name: 'Worker Co-op Agreement' })).toBeVisible();
		await expect(page.getByText('draft')).toBeVisible();
		await expect(page.getByText('worker-cooperative')).toBeVisible();
	});

	test('create agreement with body text', async ({ page }) => {
		await page.goto('/agreements/new');
		await page.getByLabel('Title').fill('Code of Conduct');
		await page.getByLabel('Content', { exact: false }).fill('All members shall treat each other with respect.');
		await page.getByRole('button', { name: 'Create agreement' }).click();

		await page.waitForURL(/\/agreements\//);
		await expect(page.getByRole('heading', { name: 'Code of Conduct' })).toBeVisible();
	});

	test('open agreement for signing', async ({ page }) => {
		await page.goto('/agreements/new');
		await page.getByLabel('Title').fill('Open Test');
		await page.getByRole('button', { name: 'Create agreement' }).click();
		await page.waitForURL(/\/agreements\//);

		await page.getByRole('button', { name: 'Open for signing' }).click();
		await page.waitForLoadState('networkidle');

		await expect(page.getByRole('button', { name: 'Sign Agreement' })).toBeVisible();
	});

	test('activate a draft agreement', async ({ page }) => {
		await page.goto('/agreements/new');
		await page.getByLabel('Title').fill('Activate Test');
		await page.getByRole('button', { name: 'Create agreement' }).click();
		await page.waitForURL(/\/agreements\//);

		await page.getByRole('button', { name: 'Activate' }).click();
		await page.waitForLoadState('networkidle');

		await expect(page.getByText('active')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Terminate' })).toBeVisible();
	});

	test('terminate an active agreement', async ({ page }) => {
		await page.goto('/agreements/new');
		await page.getByLabel('Title').fill('Terminate Test');
		await page.getByRole('button', { name: 'Create agreement' }).click();
		await page.waitForURL(/\/agreements\//);

		await page.getByRole('button', { name: 'Activate' }).click();
		await page.waitForLoadState('networkidle');

		await page.getByRole('button', { name: 'Terminate' }).click();
		await page.waitForLoadState('networkidle');

		await expect(page.getByText('terminated')).toBeVisible();
	});

	test('sign agreement increments signature count', async ({ page }) => {
		await page.goto('/agreements/new');
		await page.getByLabel('Title').fill('Sign Test');
		await page.getByRole('button', { name: 'Create agreement' }).click();
		await page.waitForURL(/\/agreements\//);
		await page.getByRole('button', { name: 'Open for signing' }).click();
		await page.waitForLoadState('networkidle');

		await page.getByRole('button', { name: 'Sign Agreement' }).click();
		await page.getByRole('button', { name: 'Confirm & Sign' }).click();
		await page.waitForLoadState('networkidle');

		await expect(page.getByText('You have signed this agreement.')).toBeVisible();
		await expect(page.getByText('Total signatures: 1')).toBeVisible();
	});

	test('retract signature', async ({ page }) => {
		await page.goto('/agreements/new');
		await page.getByLabel('Title').fill('Retract Test');
		await page.getByRole('button', { name: 'Create agreement' }).click();
		await page.waitForURL(/\/agreements\//);
		await page.getByRole('button', { name: 'Open for signing' }).click();
		await page.waitForLoadState('networkidle');
		await page.getByRole('button', { name: 'Sign Agreement' }).click();
		await page.getByRole('button', { name: 'Confirm & Sign' }).click();
		await page.waitForLoadState('networkidle');

		await page.getByRole('button', { name: 'Retract signature' }).click();
		await page.waitForLoadState('networkidle');

		await expect(page.getByRole('button', { name: 'Sign Agreement' })).toBeVisible();
		await expect(page.getByText('Total signatures: 0')).toBeVisible();
	});

	test('void agreement', async ({ page }) => {
		await page.goto('/agreements/new');
		await page.getByLabel('Title').fill('Void Test');
		await page.getByRole('button', { name: 'Create agreement' }).click();
		await page.waitForURL(/\/agreements\//);

		await page.getByRole('button', { name: 'Void' }).click();
		await page.getByRole('button', { name: 'Void Agreement' }).click();
		await page.waitForLoadState('networkidle');

		await expect(page.getByRole('button', { name: 'Open for signing' })).not.toBeVisible();
		await expect(page.getByRole('button', { name: 'Sign Agreement' })).not.toBeVisible();
	});

	test('add stakeholder terms to draft agreement', async ({ page, request }) => {
		const { adminDid } = await setupCooperative(request);
		await loginAs(page, ADMIN.email, ADMIN.password);

		await page.goto('/agreements/new');
		await page.getByLabel('Title').fill('Terms Test');
		await page.getByRole('button', { name: 'Create agreement' }).click();
		await page.waitForURL(/\/agreements\//);

		await page.getByLabel('Stakeholder DID').fill(adminDid);
		await page.getByLabel('Type', { exact: false }).last().selectOption('worker');
		await page.getByLabel('Class (optional)').fill('founding-member');
		await page.getByRole('button', { name: 'Add' }).click();
		await page.waitForLoadState('networkidle');

		await expect(page.getByText(adminDid)).toBeVisible();
		await expect(page.getByText('worker')).toBeVisible();
		await expect(page.getByText('founding-member')).toBeVisible();
	});

	test('remove stakeholder terms from draft agreement', async ({ page, request }) => {
		const { adminDid } = await setupCooperative(request);
		await loginAs(page, ADMIN.email, ADMIN.password);

		await page.goto('/agreements/new');
		await page.getByLabel('Title').fill('Remove Terms Test');
		await page.getByRole('button', { name: 'Create agreement' }).click();
		await page.waitForURL(/\/agreements\//);

		await page.getByLabel('Stakeholder DID').fill(adminDid);
		await page.getByRole('button', { name: 'Add' }).click();
		await page.waitForLoadState('networkidle');

		await page.getByRole('button', { name: 'Remove' }).click();
		await page.waitForLoadState('networkidle');

		await expect(page.getByText('No stakeholder terms have been added yet')).toBeVisible();
	});

	test('status filters work on list page', async ({ page }) => {
		await page.goto('/agreements');

		await page.getByRole('link', { name: 'Active' }).click();
		await expect(page).toHaveURL(/status=active/);

		await page.getByRole('link', { name: 'All' }).click();
		await expect(page).toHaveURL('/agreements');
	});

	test('sidebar navigation to agreements works', async ({ page }) => {
		await page.goto('/dashboard');
		await page.getByRole('link', { name: 'Agreements' }).click();
		await expect(page).toHaveURL('/agreements');
		await expect(page.getByRole('heading', { name: 'Agreements', exact: true })).toBeVisible();
	});
});
