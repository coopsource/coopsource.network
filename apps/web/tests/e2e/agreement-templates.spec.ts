import { test, expect } from '@playwright/test';
import { ADMIN, wp, setupCooperative, loginAs } from './helpers.js';

test.describe('Agreement Templates', () => {
	test.beforeEach(async ({ page, request }) => {
		await setupCooperative(request);
		await loginAs(page, ADMIN.email, ADMIN.password);
	});

	test('templates list page renders with New template button', async ({ page }) => {
		await page.goto(wp('/agreements/templates'));
		await expect(page.getByRole('heading', { name: 'Templates', exact: true })).toBeVisible();
		await expect(page.getByRole('link', { name: 'New template' })).toBeVisible();
	});

	test('create template with name and agreement fields', async ({ page }) => {
		await page.goto(wp('/agreements/templates/new'));
		await page.getByLabel('Template Name').fill('Standard Worker Agreement');
		await page.getByLabel('Description').fill('Template for onboarding new workers');
		await page.getByLabel('Agreement Type').selectOption('worker-cooperative');
		await page.getByLabel('Default Title').fill('Worker Membership Agreement');
		await page.getByLabel('Default Purpose').fill('Define worker rights and responsibilities');

		await page.getByRole('button', { name: 'Create template' }).click();

		// Should redirect to template detail page
		await page.waitForURL(/\/coop\/[^/]+\/agreements\/templates\//);
		await expect(page.getByRole('heading', { name: 'Standard Worker Agreement' })).toBeVisible();
	});

	test('edit template name and save shows success message', async ({ page }) => {
		// Create a template first
		await page.goto(wp('/agreements/templates/new'));
		await page.getByLabel('Template Name').fill('Draft Template');
		await page.getByRole('button', { name: 'Create template' }).click();
		await page.waitForURL(/\/coop\/[^/]+\/agreements\/templates\//);

		// Edit the name
		await page.getByLabel('Template Name').fill('Updated Template Name');
		await page.getByRole('button', { name: 'Save changes' }).click();
		await page.waitForLoadState('networkidle');

		await expect(page.getByText('Template updated.')).toBeVisible();
	});

	test('use template creates a draft agreement', async ({ page }) => {
		// Create a template with pre-filled fields
		await page.goto(wp('/agreements/templates/new'));
		await page.getByLabel('Template Name').fill('Quick Agreement');
		await page.getByLabel('Default Title').fill('Generated Agreement');
		await page.getByLabel('Default Purpose').fill('Auto-generated from template');
		await page.getByRole('button', { name: 'Create template' }).click();
		await page.waitForURL(/\/coop\/[^/]+\/agreements\/templates\//);

		// Use the template
		await page.getByRole('button', { name: 'Use template' }).click();

		// Should redirect to agreement detail page
		await page.waitForURL(/\/coop\/[^/]+\/agreements\/(?!templates)/);
		await expect(page.getByText('draft')).toBeVisible();
	});

	test('delete template returns to template list', async ({ page }) => {
		// Create a template
		await page.goto(wp('/agreements/templates/new'));
		await page.getByLabel('Template Name').fill('Temporary Template');
		await page.getByRole('button', { name: 'Create template' }).click();
		await page.waitForURL(/\/coop\/[^/]+\/agreements\/templates\//);

		// Delete the template (accept the confirm dialog)
		page.on('dialog', (dialog) => dialog.accept());
		await page.getByRole('button', { name: 'Delete' }).click();

		// Should redirect to templates list
		await page.waitForURL(wp('/agreements/templates'));
		await expect(page.getByRole('heading', { name: 'Templates', exact: true })).toBeVisible();
	});

	test('templates link visible on agreements list page', async ({ page }) => {
		await page.goto(wp('/agreements'));
		await expect(page.getByRole('link', { name: 'Templates' })).toBeVisible();

		await page.getByRole('link', { name: 'Templates' }).click();
		await expect(page).toHaveURL(wp('/agreements/templates'));
	});
});
