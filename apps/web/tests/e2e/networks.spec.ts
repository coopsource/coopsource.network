import { test, expect } from '@playwright/test';
import { ADMIN, COOP, wp, setupCooperative, loginAs } from './helpers.js';

test.describe('Networks', () => {
  test.beforeEach(async ({ page, request }) => {
    await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('network list renders with Create network button', async ({ page }) => {
    await page.goto(wp('/networks'));
    await expect(page.getByRole('heading', { name: 'Networks', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Create network' })).toBeVisible();
  });

  test('create network and see it in list', async ({ page }) => {
    await page.goto(wp('/networks/new'));
    await page.getByLabel('Name').fill('Test Network');
    await page.getByLabel('Description').fill('A network for E2E testing.');
    await page.getByRole('button', { name: 'Create network' }).click();

    // Should redirect to network detail page (DID contains colons, URL-encoded)
    await page.waitForURL(/\/coop\/[^/]+\/networks\/did/);
    await expect(page.getByRole('heading', { name: 'Test Network' })).toBeVisible();
    await expect(page.getByText('A network for E2E testing.')).toBeVisible();

    // Go back to list and verify it's there
    await page.goto(wp('/networks'));
    await expect(page.getByText('Test Network')).toBeVisible();
  });

  test('join network shows co-op in members', async ({ page, request }) => {
    // Create a network via API (faster than UI)
    const setup = await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);

    const createRes = await request.post('http://localhost:3002/api/v1/networks', {
      headers: { Cookie: setup.cookie },
      data: { name: 'Joinable Network' },
    });
    const { did: networkDid } = await createRes.json();

    // Navigate to network detail
    await page.goto(wp(`/networks/${encodeURIComponent(networkDid)}`));
    await expect(page.getByRole('heading', { name: 'Joinable Network' })).toBeVisible();

    // Join the network
    await page.getByRole('button', { name: 'Join network' }).click();
    await page.waitForLoadState('networkidle');

    // Should now show Leave button and the co-op in members
    await expect(page.getByRole('button', { name: 'Leave network' })).toBeVisible();
    await expect(page.getByRole('heading', { name: COOP.name })).toBeVisible();
  });
});
