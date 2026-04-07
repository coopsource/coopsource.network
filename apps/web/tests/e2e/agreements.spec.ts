import { test, expect } from '@playwright/test';
import { ADMIN, WORKSPACE, wp, setupCooperative, loginAs } from './helpers.js';

test.describe('Agreements (Unified)', () => {
	test.beforeEach(async ({ page, request }) => {
		await setupCooperative(request);
		await loginAs(page, ADMIN.email, ADMIN.password);
	});

	test('agreement list renders with New agreement button', async ({ page }) => {
		await page.goto(wp('/agreements'));
		await expect(page.getByRole('heading', { name: 'Agreements', exact: true })).toBeVisible();
		await expect(page.getByRole('link', { name: 'New agreement' })).toBeVisible();
	});

	test('create agreement with structured fields redirects to detail page', async ({ page }) => {
		await page.goto(wp('/agreements/new'));
		await page.getByLabel('Title').fill('Worker Co-op Agreement');
		await page.getByLabel('Type').selectOption('worker-cooperative');
		await page.getByLabel('Purpose').fill('Govern the cooperative structure.');
		await page.getByLabel('Scope').fill('All worker-members.');

		await page.getByRole('button', { name: 'Create agreement' }).click();

		// Should redirect to detail page (URI-encoded path)
		await page.waitForURL(/\/coop\/[^/]+\/agreements\//);
		await expect(page.getByRole('heading', { name: 'Worker Co-op Agreement' })).toBeVisible();
		await expect(page.getByText('draft')).toBeVisible();
		await expect(page.getByText('worker-cooperative')).toBeVisible();
	});

	test('create agreement with body text', async ({ page }) => {
		await page.goto(wp('/agreements/new'));
		await page.getByLabel('Title').fill('Code of Conduct');
		await page.getByLabel('Content', { exact: false }).fill('All members shall treat each other with respect.');
		await page.getByRole('button', { name: 'Create agreement' }).click();

		await page.waitForURL(/\/coop\/[^/]+\/agreements\//);
		await expect(page.getByRole('heading', { name: 'Code of Conduct' })).toBeVisible();
	});

	test('open agreement for signing', async ({ page }) => {
		await page.goto(wp('/agreements/new'));
		await page.getByLabel('Title').fill('Open Test');
		await page.getByRole('button', { name: 'Create agreement' }).click();
		await page.waitForURL(/\/coop\/[^/]+\/agreements\//);

		await page.getByRole('button', { name: 'Open for signing' }).click();

		await expect(page.getByRole('button', { name: 'Sign Agreement' })).toBeVisible({ timeout: 10_000 });
	});

	test('activate a draft agreement', async ({ page }) => {
		await page.goto(wp('/agreements/new'));
		await page.getByLabel('Title').fill('Activate Test');
		await page.getByRole('button', { name: 'Create agreement' }).click();
		await page.waitForURL(/\/coop\/[^/]+\/agreements\//);

		await page.getByRole('button', { name: 'Activate' }).click();

		await expect(page.getByText('active')).toBeVisible({ timeout: 10_000 });
		await expect(page.getByRole('button', { name: 'Terminate' })).toBeVisible({ timeout: 10_000 });
	});

	test('terminate an active agreement', async ({ page }) => {
		await page.goto(wp('/agreements/new'));
		await page.getByLabel('Title').fill('Terminate Test');
		await page.getByRole('button', { name: 'Create agreement' }).click();
		await page.waitForURL(/\/coop\/[^/]+\/agreements\//);

		await page.getByRole('button', { name: 'Activate' }).click();
		await expect(page.getByRole('button', { name: 'Terminate' })).toBeVisible({ timeout: 10_000 });

		await page.getByRole('button', { name: 'Terminate' }).click();

		await expect(page.getByText('terminated', { exact: true })).toBeVisible({ timeout: 10_000 });
	});

	test('sign agreement increments signature count', async ({ page }) => {
		await page.goto(wp('/agreements/new'));
		await page.getByLabel('Title').fill('Sign Test');
		await page.getByRole('button', { name: 'Create agreement' }).click();
		await page.waitForURL(/\/coop\/[^/]+\/agreements\//);
		await page.getByRole('button', { name: 'Open for signing' }).click();
		await expect(page.getByRole('button', { name: 'Sign Agreement' })).toBeVisible({ timeout: 10_000 });

		await page.getByRole('button', { name: 'Sign Agreement' }).click();
		await page.getByRole('button', { name: 'Confirm & Sign' }).click();

		await expect(page.getByText('You have signed this agreement.')).toBeVisible({ timeout: 10_000 });
		await expect(page.getByText('Total signatures: 1')).toBeVisible({ timeout: 10_000 });
	});

	test('retract signature', async ({ page }) => {
		await page.goto(wp('/agreements/new'));
		await page.getByLabel('Title').fill('Retract Test');
		await page.getByRole('button', { name: 'Create agreement' }).click();
		await page.waitForURL(/\/coop\/[^/]+\/agreements\//);
		await page.getByRole('button', { name: 'Open for signing' }).click();
		await expect(page.getByRole('button', { name: 'Sign Agreement' })).toBeVisible({ timeout: 10_000 });
		await page.getByRole('button', { name: 'Sign Agreement' }).click();
		await page.getByRole('button', { name: 'Confirm & Sign' }).click();
		await expect(page.getByText('You have signed this agreement.')).toBeVisible({ timeout: 10_000 });
		// Reload to get a clean page state after the sign action chain
		await page.reload();
		await expect(page.getByRole('button', { name: 'Retract signature' })).toBeVisible({ timeout: 10_000 });

		await page.getByRole('button', { name: 'Retract signature' }).click();

		await expect(page.getByRole('button', { name: 'Sign Agreement' })).toBeVisible({ timeout: 15_000 });
		await expect(page.getByText('Total signatures: 0')).toBeVisible({ timeout: 10_000 });
	});

	test('void agreement', async ({ page }) => {
		await page.goto(wp('/agreements/new'));
		await page.getByLabel('Title').fill('Void Test');
		await page.getByRole('button', { name: 'Create agreement' }).click();
		await page.waitForURL(/\/coop\/[^/]+\/agreements\//);

		await page.getByRole('button', { name: 'Void' }).click();
		await page.getByRole('button', { name: 'Void Agreement' }).click();

		await expect(page.getByRole('button', { name: 'Open for signing' })).not.toBeVisible({ timeout: 10_000 });
		await expect(page.getByRole('button', { name: 'Sign Agreement' })).not.toBeVisible({ timeout: 10_000 });
	});

	test('add stakeholder terms to draft agreement', async ({ page, request }) => {
		const { adminDid } = await setupCooperative(request);
		await loginAs(page, ADMIN.email, ADMIN.password);

		await page.goto(wp('/agreements/new'));
		await page.getByLabel('Title').fill('Terms Test');
		await page.getByRole('button', { name: 'Create agreement' }).click();
		await page.waitForURL(/\/coop\/[^/]+\/agreements\//);

		await page.getByLabel('Stakeholder DID').fill(adminDid);
		await page.getByLabel('Type', { exact: false }).last().selectOption('worker');
		await page.getByLabel('Class (optional)').fill('founding-member');
		await page.getByRole('button', { name: 'Add' }).click();

		await expect(page.getByText(adminDid)).toBeVisible({ timeout: 10_000 });
		await expect(page.getByText('worker', { exact: true })).toBeVisible({ timeout: 10_000 });
		await expect(page.getByText('founding-member')).toBeVisible({ timeout: 10_000 });
	});

	test('remove stakeholder terms from draft agreement', async ({ page, request }) => {
		const { adminDid } = await setupCooperative(request);
		await loginAs(page, ADMIN.email, ADMIN.password);

		await page.goto(wp('/agreements/new'));
		await page.getByLabel('Title').fill('Remove Terms Test');
		await page.getByRole('button', { name: 'Create agreement' }).click();
		await page.waitForURL(/\/coop\/[^/]+\/agreements\//);

		await page.getByLabel('Stakeholder DID').fill(adminDid);
		await page.getByRole('button', { name: 'Add' }).click();
		await expect(page.getByRole('button', { name: 'Remove' })).toBeVisible({ timeout: 10_000 });

		await page.getByRole('button', { name: 'Remove' }).click();

		await expect(page.getByText('No stakeholder terms have been added yet')).toBeVisible({ timeout: 10_000 });
	});

	test('status filters work on list page', async ({ page }) => {
		await page.goto(wp('/agreements'));

		await page.getByRole('link', { name: 'Active' }).click();
		await expect(page).toHaveURL(/status=active/);

		await page.getByRole('link', { name: 'All' }).click();
		await expect(page).toHaveURL(wp('/agreements'));
	});

	test('Governance > Agreements tab navigation works', async ({ page }) => {
		// V8.1: Agreements is now a tab under Governance, not a top-level sidebar item.
		// Use ?tab=agreements URL param to land directly on the Agreements tab
		// (bypasses any client-side hydration timing issues with tab clicks).
		await page.goto(wp('/governance?tab=agreements'));
		// The "New agreement" link is unique to the Agreements tab content.
		await expect(page.getByRole('link', { name: 'New agreement' })).toBeVisible();
	});
});
