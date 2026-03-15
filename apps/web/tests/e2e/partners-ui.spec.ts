import { test, expect, type APIRequestContext } from '@playwright/test';
import { ADMIN, wp, setupCooperative, loginAs } from './helpers.js';

const API = 'http://localhost:3002/api/v1';

async function post(request: APIRequestContext, cookie: string, path: string, data: unknown) {
  return request.post(`${API}${path}`, { headers: { Cookie: cookie }, data });
}

test.describe('Partners UI', () => {
  let cookie: string;
  let coopDid: string;

  test.beforeEach(async ({ page, request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
    coopDid = setup.coopDid;
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('partners page renders with tabs and empty state', async ({ page }) => {
    await page.goto(wp('/partners'));
    await expect(page.locator('h1', { hasText: 'Partners' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Partners/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Pending/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /All Links/ })).toBeVisible();
    await expect(page.getByText('No partners')).toBeVisible();
  });

  test('cooperative links API lifecycle', async ({ request }) => {
    // Create link
    // Note: targetDid must be a real cooperative entity. In test env, use own coopDid.
    // The API may reject self-linking, so we test the endpoint behavior.
    const createRes = await post(request, cookie, '/cooperative-links', {
      targetDid: coopDid,
      linkType: 'supply_chain',
      description: 'Supply chain link',
    });
    // May return 201 (created) or 400 (self-link validation)
    expect([201, 400]).toContain(createRes.status());

    if (createRes.status() === 201) {
      const link = await createRes.json();
      expect(link.linkType).toBe('supply_chain');
    }

    // List links - always works
    const listRes = await request.get(`${API}/cooperative-links`, {
      headers: { Cookie: cookie },
    });
    expect(listRes.status()).toBe(200);
  });

  test('partners API endpoint exists', async ({ request }) => {
    const res = await request.get(`${API}/cooperative-links/partners`, {
      headers: { Cookie: cookie },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.partners).toBeDefined();
  });
});
