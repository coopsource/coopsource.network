import { test, expect } from '@playwright/test';
import { ADMIN, COOP, wp, setupCooperative, loginAs } from './helpers.js';

test.describe('Networks', () => {
  let cookie: string;

  test.beforeEach(async ({ page, request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
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
    const createRes = await request.post('http://localhost:3002/api/v1/networks', {
      headers: { Cookie: cookie },
      data: { name: 'Joinable Network' },
    });
    const { did: networkDid } = await createRes.json();

    // Navigate to network detail
    await page.goto(wp(`/networks/${encodeURIComponent(networkDid)}`));
    await expect(page.getByRole('heading', { name: 'Joinable Network' })).toBeVisible();

    // Join the network
    await page.getByRole('button', { name: 'Join network' }).click();

    // Should now show Leave button and the co-op in members
    await expect(page.getByRole('button', { name: 'Leave network' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('heading', { name: COOP.name })).toBeVisible({ timeout: 10_000 });
  });

  test('workspace switcher opens a network with only valid navigation', async ({
    page,
    request,
  }) => {
    const createRes = await request.post('http://localhost:3002/api/v1/networks', {
      headers: { Cookie: cookie },
      data: {
        name: 'Navigation Network',
        handle: 'navigation-network',
      },
    });
    expect(createRes.status()).toBe(201);
    const { did } = await createRes.json();

    const joinRes = await request.post(
      `http://localhost:3002/api/v1/networks/${encodeURIComponent(did)}/join`,
      { headers: { Cookie: cookie } },
    );
    expect(joinRes.status()).toBe(201);

    await page.goto('/me');
    await page.getByRole('button', { name: 'Switch workspace' }).click();
    await page.getByRole('menuitem', { name: 'Navigation Network' }).click();
    await page.waitForURL('/net/navigation-network/cooperatives');

    const navLinks = page.locator('aside nav a');
    await expect(navLinks).toHaveCount(3);
    await expect(navLinks.nth(0)).toHaveAttribute(
      'href',
      '/net/navigation-network/cooperatives',
    );
    await expect(navLinks.nth(1)).toHaveAttribute('href', '/me/profile');
    await expect(navLinks.nth(2)).toHaveAttribute('href', '/me/settings');

    await expect(page.getByRole('link', { name: 'Governance' })).not.toBeVisible();
    await expect(page.getByRole('link', { name: 'Agreements' })).not.toBeVisible();

    await page.getByRole('button', { name: 'Switch workspace' }).click();
    await expect(page.getByRole('menuitem', { name: 'Create new coop' })).not.toBeVisible();
    await page.keyboard.press('Escape');

    expect((await page.goto('/net/navigation-network/governance'))?.status()).toBe(404);
    expect((await page.goto('/net/navigation-network/agreements'))?.status()).toBe(404);
    expect((await page.goto('/coop/navigation-network'))?.status()).toBe(404);
  });

  test('network workspace rejects a cooperative that is not a member', async ({
    page,
    request,
  }) => {
    const createRes = await request.post('http://localhost:3002/api/v1/networks', {
      headers: { Cookie: cookie },
      data: {
        name: 'Private Network',
        handle: 'private-network',
      },
    });
    expect(createRes.status()).toBe(201);

    expect((await page.goto('/net/private-network/cooperatives'))?.status()).toBe(403);
  });
});
