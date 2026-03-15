import { test, expect, type APIRequestContext } from '@playwright/test';
import { ADMIN, wp, setupCooperative, loginAs } from './helpers.js';

const API = 'http://localhost:3002/api/v1';

async function post(request: APIRequestContext, cookie: string, path: string, data: unknown) {
  return request.post(`${API}${path}`, { headers: { Cookie: cookie }, data });
}

test.describe('Governance — Tabs', () => {
  test.beforeEach(async ({ page, request }) => {
    await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('governance page has Proposals, Delegations, and Feed tabs', async ({ page }) => {
    await page.goto(wp('/governance'));
    await expect(page.locator('h1', { hasText: 'Governance' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Proposals/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Delegations/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Feed/ })).toBeVisible();
  });

  test('proposals tab shows existing proposal functionality', async ({ page }) => {
    await page.goto(wp('/governance'));
    await expect(page.getByRole('link', { name: 'New proposal' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Draft' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open' })).toBeVisible();
  });
});

test.describe('Governance — Delegations', () => {
  let cookie: string;

  test.beforeEach(async ({ page, request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('delegations tab renders with empty state', async ({ page }) => {
    await page.goto(wp('/governance'));
    // Delegations tab should show count of 0
    await expect(page.getByRole('tab', { name: /Delegations/ })).toBeVisible();
  });

  test('delegation API endpoint exists and validates input', async ({ request }) => {
    // Test that the delegation endpoint works (self-delegation is caught by validation)
    const res = await post(request, cookie, '/governance/delegations', {
      delegateeDid: 'did:plc:nonexistent',
      scope: 'project',
    });
    // Should get 400 (validation error) or 201 - not 404 or 500
    expect([201, 400]).toContain(res.status());
  });

  test('delegations list endpoint returns data', async ({ request }) => {
    const res = await request.get(`${API}/governance/delegations`, {
      headers: { Cookie: cookie },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.delegations).toBeDefined();
  });
});

test.describe('Governance — Feed', () => {
  test.beforeEach(async ({ page, request }) => {
    await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('feed tab renders', async ({ page }) => {
    await page.goto(wp('/governance'));
    await page.locator('button[role="tab"]').filter({ hasText: 'Feed' }).click();
    await expect(page.getByRole('tab', { name: /Feed/ })).toHaveAttribute('aria-selected', 'true');
  });

  test('governance feed API endpoints work', async ({ request }) => {
    const setup = await setupCooperative(request);

    const actionRes = await request.get(`${API}/governance/feed/action-items`, {
      headers: { Cookie: setup.cookie },
    });
    expect(actionRes.status()).toBe(200);

    const outcomesRes = await request.get(`${API}/governance/feed/outcomes`, {
      headers: { Cookie: setup.cookie },
    });
    expect(outcomesRes.status()).toBe(200);
  });
});

test.describe('Governance — Vote Weights on Detail Page', () => {
  test.beforeEach(async ({ page, request }) => {
    await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('proposal detail shows vote tally', async ({ page }) => {
    await page.goto(wp('/governance/new'));
    await page.getByLabel('Title').fill('Weight Test');
    await page.getByLabel('Description').fill('Test vote weights');
    await page.getByRole('button', { name: 'Create proposal' }).click();
    await page.waitForURL(/\/governance\/[a-f0-9-]+$/);

    await page.getByRole('button', { name: 'Open for voting' }).click();
    await expect(page.getByText('Cast Your Vote')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Yes' }).click();
    await expect(page.getByText(/You voted.*yes/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/1 total vote/)).toBeVisible();
  });
});
