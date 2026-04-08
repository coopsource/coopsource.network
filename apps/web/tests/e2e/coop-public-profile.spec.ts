import { test, expect } from '@playwright/test';
import {
  ADMIN,
  COOP,
  setupCooperative,
  loginAs,
  setExploreVisibility,
  createOpenProposal,
} from './helpers.js';

const HANDLE = COOP.handle;
const PROFILE_URL = `/explore/${HANDLE}`;

test.describe('V8.5 — Public co-op profile (anon, anonDiscoverable off)', () => {
  test.beforeEach(async ({ request }) => {
    await setupCooperative(request);
    // Default anon_discoverable=false — do NOT opt in.
  });

  test('returns 404 for anon visit', async ({ page }) => {
    const res = await page.goto(PROFILE_URL);
    expect(res?.status()).toBe(404);
  });
});

test.describe('V8.5 — Public co-op profile (anon, all flags off)', () => {
  test.beforeEach(async ({ request }) => {
    const { cookie } = await setupCooperative(request);
    await setExploreVisibility(request, cookie, {
      anonDiscoverable: true,
      publicDescription: false,
      publicMembers: false,
      publicActivity: false,
      publicAgreements: false,
      publicCampaigns: false,
    });
  });

  test('renders header but no gated sections or stats', async ({ page }) => {
    await page.goto(PROFILE_URL);
    // Header is always visible
    await expect(page.getByRole('heading', { name: COOP.name })).toBeVisible();
    await expect(page.getByText(`@${HANDLE}`)).toBeVisible();
    // Member count is hidden when publicMembers=false (no "member" text in stats)
    await expect(page.getByText(/\d+\s+members?$/)).not.toBeVisible();
    // Section headings are absent when nothing is opted in
    await expect(page.getByRole('heading', { name: 'Networks' })).not.toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recent proposals' })).not.toBeVisible();
    await expect(page.getByRole('heading', { name: 'Agreements' })).not.toBeVisible();
    await expect(page.getByRole('heading', { name: 'Funding campaigns' })).not.toBeVisible();
  });
});

test.describe('V8.5 — Public co-op profile (anon, opted in with seeded proposal)', () => {
  test.beforeEach(async ({ request }) => {
    const { cookie } = await setupCooperative(request);
    await setExploreVisibility(request, cookie, {
      anonDiscoverable: true,
      publicDescription: true,
      publicMembers: true,
      publicActivity: true,
      publicAgreements: true,
      publicCampaigns: true,
    });
    await createOpenProposal(request, cookie, {
      title: 'V8.5 Test Proposal',
      body: 'Body of the proposal',
    });
  });

  test('renders header, stats, and proposal card for anon viewer', async ({ page }) => {
    await page.goto(PROFILE_URL);
    // Header
    await expect(page.getByRole('heading', { name: COOP.name })).toBeVisible();
    // Stats — at least one member (admin) is visible because publicMembers=true
    await expect(page.getByText(/\d+\s+members?/).first()).toBeVisible();
    // Recent proposals section visible with the seeded proposal
    await expect(page.getByRole('heading', { name: 'Recent proposals' })).toBeVisible();
    await expect(page.getByText('V8.5 Test Proposal')).toBeVisible();
  });

  test('does NOT render the "view as member" banner for anon viewer', async ({ page }) => {
    await page.goto(PROFILE_URL);
    await expect(page.getByText(/You're a member of this co-op/)).not.toBeVisible();
  });
});

// Note: The "authed non-member" scenario from spec task 5 is structurally
// impossible to set up in single-instance e2e: every user registered via
// /api/v1/auth/register is auto-joined to the instance's cooperative (see
// auth-service.ts:127-186). The non-member case maps to a multi-instance
// federation scenario which the e2e suite does not exercise. The principle
// (`isMember = me.cooperatives.some((c) => c.did === cooperative.did)`,
// returning false → no banner) is verified by the API integration tests
// in apps/api/tests/explore.test.ts and by inspection of the page server.

test.describe('V8.5 — Public co-op profile (authed member)', () => {
  test.beforeEach(async ({ page, request }) => {
    const { cookie } = await setupCooperative(request);
    await setExploreVisibility(request, cookie, {
      anonDiscoverable: true,
      publicDescription: true,
      publicMembers: true,
    });
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('shows the "view as member" banner linking to the workspace', async ({ page }) => {
    await page.goto(PROFILE_URL);
    const banner = page.getByRole('link', { name: /You're a member of this co-op/ });
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute('href', `/coop/${HANDLE}`);
  });

  test('clicking the banner navigates into the workspace', async ({ page }) => {
    await page.goto(PROFILE_URL);
    await page.getByRole('link', { name: /You're a member of this co-op/ }).click();
    // The workspace landing route may redirect to a default sub-page
    // (e.g. /coop/[handle]/members), so match the workspace prefix.
    await expect(page).toHaveURL(new RegExp(`/coop/${HANDLE}(/|$)`));
  });
});

test.describe('V8.5 — Settings master switch (form UI)', () => {
  // The deep "anon visit returns 404 after toggle" flow is covered by the
  // explore.test.ts API integration tests. The e2e tests below verify the
  // form UI interaction in isolation: the master switch renders, is bindable,
  // and submitting it shows the success state.

  test('master switch is rendered and reflects the current state', async ({ page, request }) => {
    const { cookie } = await setupCooperative(request);
    await setExploreVisibility(request, cookie, { anonDiscoverable: true });
    await loginAs(page, ADMIN.email, ADMIN.password);

    await page.goto(`/coop/${HANDLE}/settings`);
    const masterSwitch = page.locator('input[name="anonDiscoverable"]');
    await expect(masterSwitch).toBeVisible();
    await expect(masterSwitch).toBeChecked();
    // Helper copy is present
    await expect(page.getByText(/Anonymous discovery/)).toBeVisible();
  });

  test('toggling and saving the master switch shows the success banner', async ({ page, request }) => {
    const { cookie } = await setupCooperative(request);
    await setExploreVisibility(request, cookie, { anonDiscoverable: true });
    await loginAs(page, ADMIN.email, ADMIN.password);

    await page.goto(`/coop/${HANDLE}/settings`);
    await page.locator('input[name="anonDiscoverable"]').uncheck();
    await page.getByRole('button', { name: /Save visibility settings/ }).click();
    await expect(page.getByText('Visibility settings saved.')).toBeVisible();
  });
});
