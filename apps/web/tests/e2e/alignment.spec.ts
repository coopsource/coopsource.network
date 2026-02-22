import { test, expect } from '@playwright/test';
import { ADMIN, setupCooperative, loginAs } from './helpers.js';

test.describe('Alignment Discovery', () => {
	test.beforeEach(async ({ page, request }) => {
		await setupCooperative(request);
		await loginAs(page, ADMIN.email, ADMIN.password);
	});

	test('alignment dashboard renders', async ({ page }) => {
		await page.goto('/alignment');
		await expect(page.getByRole('heading', { name: 'Alignment Discovery' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'My Interests' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Desired Outcomes' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Interest Map' })).toBeVisible();
	});

	test('submit interests form shows fields', async ({ page }) => {
		await page.goto('/alignment/interests');
		await expect(page.getByRole('heading', { name: 'Submit My Interests' })).toBeVisible();
		await expect(page.getByText('Interests & Goals')).toBeVisible();
		await expect(page.getByText('Contributions')).toBeVisible();
		await expect(page.getByText('Constraints')).toBeVisible();
		await expect(page.getByText('Red Lines')).toBeVisible();
		await expect(page.getByText('Work Preferences')).toBeVisible();
	});

	test('submit interests redirects to alignment dashboard', async ({ page }) => {
		await page.goto('/alignment/interests');

		// Fill in an interest
		await page.getByLabel('Category').first().fill('sustainability');
		await page.getByLabel('Description').first().fill('Reduce our carbon footprint by 50%');
		await page.getByLabel('Priority (1-5)').first().fill('5');

		await page.getByRole('button', { name: 'Submit Interests' }).click();

		// Should redirect to alignment dashboard
		await page.waitForURL(/\/alignment$/);
		// After submitting, the dashboard should show the interest
		await expect(page.getByText('sustainability')).toBeVisible();
	});

	test('create outcome form shows fields', async ({ page }) => {
		await page.goto('/alignment/outcomes/new');
		await expect(page.getByRole('heading', { name: 'Create Desired Outcome' })).toBeVisible();
		await expect(page.getByLabel('Title')).toBeVisible();
		await expect(page.getByLabel('Description')).toBeVisible();
		await expect(page.getByLabel('Category')).toBeVisible();
	});

	test('create outcome redirects to detail page', async ({ page }) => {
		await page.goto('/alignment/outcomes/new');
		await page.getByLabel('Title').fill('Carbon Neutral by 2030');
		await page.getByLabel('Description').fill('Achieve net-zero emissions.');
		await page.getByLabel('Category').selectOption('environmental');

		await page.getByRole('button', { name: 'Create Outcome' }).click();

		// Should redirect to outcome detail
		await page.waitForURL(/\/alignment\/outcomes\//);
		await expect(page.getByRole('heading', { name: 'Carbon Neutral by 2030' })).toBeVisible();
		await expect(page.getByText('environmental')).toBeVisible();
	});

	test('interest map page renders', async ({ page }) => {
		await page.goto('/alignment/map');
		await expect(page.getByRole('heading', { name: 'Interest Map' })).toBeVisible();
		await expect(page.getByText('No interest map has been generated yet')).toBeVisible();
	});

	test('generate interest map', async ({ page }) => {
		// First submit some interests
		await page.goto('/alignment/interests');
		await page.getByLabel('Category').first().fill('growth');
		await page.getByLabel('Description').first().fill('Grow the cooperative membership');
		await page.getByLabel('Priority (1-5)').first().fill('4');
		await page.getByRole('button', { name: 'Submit Interests' }).click();
		await page.waitForURL(/\/alignment$/);

		// Now go to map and generate
		await page.goto('/alignment/map');
		await page.getByRole('button', { name: 'Generate Map' }).click();
		await page.waitForLoadState('networkidle');

		// After generating, should see the map data
		await expect(page.getByRole('heading', { name: /Alignment Zones/ })).toBeVisible();
		await expect(page.getByRole('heading', { name: /Conflict Zones/ })).toBeVisible();
	});
});
