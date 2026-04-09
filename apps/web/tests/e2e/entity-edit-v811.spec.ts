import { test, expect, type APIRequestContext } from '@playwright/test';
import { ADMIN, wp, setupCooperative, loginAs } from './helpers.js';

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

  test('edit active listing title via modal', async ({ page, request }) => {
    // Create listing via API
    await post(request, cookie, '/commerce/listings', {
      title: 'Original Listing',
      description: 'A test listing',
      category: 'services',
      availability: 'available',
    });

    await page.goto(wp('/commerce/listings'));
    await expect(page.getByText('Original Listing')).toBeVisible({ timeout: 10_000 });

    // Click Edit button
    await page.getByRole('button', { name: 'Edit' }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });

    // Change title
    await page.locator('#listing-title').fill('Updated Listing');
    await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();

    // Verify updated
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
    await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible();

    // Click "Edit roles" on the first member
    await page.getByRole('button', { name: /Edit roles/i }).first().click();

    // Verify checkboxes appear
    await expect(page.getByRole('checkbox', { name: 'admin' })).toBeVisible({ timeout: 10_000 });

    // Save (no changes — just verify the flow works)
    await page.getByRole('button', { name: 'Save' }).click();

    // Should return to normal display (no more checkboxes visible)
    await expect(page.getByRole('checkbox', { name: 'admin' })).not.toBeVisible({ timeout: 10_000 });
  });
});
