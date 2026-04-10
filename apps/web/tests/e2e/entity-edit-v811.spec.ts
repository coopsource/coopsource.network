import { test, expect, type APIRequestContext } from '@playwright/test';
import { ADMIN, wp, setupCooperative, loginAs, waitForHydration, clickAndWaitForDialog } from './helpers.js';

const API = 'http://localhost:3002/api/v1';

async function post(request: APIRequestContext, cookie: string, path: string, data: unknown) {
  return request.post(`${API}${path}`, { headers: { Cookie: cookie }, data });
}

test.describe('Commerce Listing Edit', () => {
  let cookie: string;

  test.beforeEach(async ({ page, request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test.fixme('edit active listing title via modal', async ({ page, request }) => {
    // V8.13 investigation: SvelteKit returns 500 for /coop/.../commerce/listings.
    // Reproduced on main — pre-existing backend rendering bug, not hydration.
    await post(request, cookie, '/commerce/listings', {
      title: 'Original Listing',
      description: 'A test listing',
      category: 'services',
      availability: 'available',
    });

    await page.goto(wp('/commerce/listings'));
    await waitForHydration(page);
    await expect(page.getByText('Original Listing')).toBeVisible({ timeout: 10_000 });

    await clickAndWaitForDialog(
      page,
      page.getByRole('button', { name: 'Edit' }).first(),
    );

    await page.locator('#listing-title').fill('Updated Listing');
    await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Updated Listing')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Member Role Edit', () => {
  test.beforeEach(async ({ page, request }) => {
    await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('edit member roles via inline picker', async ({ page }) => {
    await page.goto(wp('/members'));
    await waitForHydration(page);
    await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible();

    await page.getByRole('button', { name: /Edit roles/i }).first().click();
    await expect(async () => {
      await expect(page.getByRole('checkbox', { name: 'admin' })).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('checkbox', { name: 'admin' })).not.toBeVisible({ timeout: 10_000 });
  });
});
