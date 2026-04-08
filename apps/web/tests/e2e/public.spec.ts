import { test, expect } from '@playwright/test';
import { ADMIN, setupCooperative, loginAs } from './helpers.js';

test.describe('V8.4 — Public web (anon)', () => {
  test.beforeEach(async ({ request }) => {
    // Each test needs a setup-complete instance for /api/v1/auth/me to work
    // and for the redirect-on-authed paths to be exercisable. setupCooperative
    // already resets the DB.
    await setupCooperative(request);
  });

  test('/ shows the landing hero', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByText('Federated collaboration for cooperatives'),
    ).toBeVisible();
  });

  test('PublicNav (anon) shows Explore, About, Sign in, Sign up', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Explore', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'About', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign up' })).toBeVisible();
  });

  test('PublicNav logo links to /', async ({ page }) => {
    await page.goto('/explore');
    // The logo + "Co-op Source" wordmark is one anchor with href="/".
    const logo = page.getByRole('link', { name: 'Co-op Source' }).first();
    await expect(logo).toBeVisible();
    await logo.click();
    await expect(page).toHaveURL('/');
  });

  test('hero "Get started" CTA links to /register', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Get started/i }).first().click();
    await expect(page).toHaveURL('/register');
  });

  test('hero "Explore directory" CTA links to /explore', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Explore directory/i }).click();
    await expect(page).toHaveURL('/explore');
  });

  test('/about renders the three explainer sections', async ({ page }) => {
    await page.goto('/about');
    await expect(
      page.getByRole('heading', { name: 'About Co-op Source' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'What is Co-op Source?' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'The recursive cooperative model' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: "What we're building toward" }),
    ).toBeVisible();
  });

  test('/about footer CTAs link to /explore and /register', async ({ page }) => {
    await page.goto('/about');
    const exploreLink = page.getByRole('link', { name: 'Explore cooperatives' });
    const getStartedLink = page.getByRole('link', { name: 'Get started' });
    await expect(exploreLink).toBeVisible();
    await expect(exploreLink).toHaveAttribute('href', '/explore');
    await expect(getStartedLink).toBeVisible();
    await expect(getStartedLink).toHaveAttribute('href', '/register');
  });

  test('/explore loads with the PublicNav (regression after refactor)', async ({ page }) => {
    await page.goto('/explore');
    // Heading from the existing explore page
    await expect(
      page.getByRole('heading', { name: 'Discover Cooperatives' }),
    ).toBeVisible();
    // PublicNav links
    await expect(page.getByRole('link', { name: 'About' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  });
});

test.describe('V8.4 — Public web (authed)', () => {
  test.beforeEach(async ({ page, request }) => {
    await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('PublicNav (authed) shows Home button instead of Sign in/Sign up', async ({ page }) => {
    await page.goto('/about');
    await expect(page.getByRole('link', { name: 'Home', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in' })).not.toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign up' })).not.toBeVisible();
  });

  test('PublicNav Home link navigates to /me', async ({ page }) => {
    await page.goto('/about');
    await page.getByRole('link', { name: 'Home', exact: true }).click();
    await expect(page).toHaveURL('/me');
  });

  test('authed user visiting / redirects directly to /me (no /dashboard hop)', async ({ page }) => {
    // V8.4 fix: previously / → /dashboard → 301 → /me (two hops). Now / → /me.
    // Verify the redirect chain does NOT include /dashboard. We capture every
    // request URL the browser sees during page.goto via the framenavigated +
    // request listeners — Playwright's request.redirectedFrom() chain only
    // exposes server-side redirect chains, not client navigations, so we
    // capture both.
    const visitedUrls: string[] = [];
    page.on('request', (req) => {
      if (req.isNavigationRequest()) {
        visitedUrls.push(req.url());
      }
    });

    const response = await page.goto('/');
    await expect(page).toHaveURL('/me');

    // Walk the response's server-side redirect chain too (covers same-server
    // hops that don't surface as separate requests).
    let req = response?.request() ?? null;
    while (req) {
      visitedUrls.push(req.url());
      req = req.redirectedFrom();
    }

    // Forbid any /dashboard intermediate. Acceptable shapes:
    //   ['http://.../', 'http://.../me']  ← single 302 hop (V8.4 happy path)
    // Forbidden:
    //   chain containing '/dashboard'      ← V8.2-era two-hop
    expect(visitedUrls.some((u) => /\/dashboard(\/|$|\?)/.test(u))).toBe(false);
  });

  test('+error.svelte shows "Go to Home" → /me for authed users', async ({ page }) => {
    // Hit a guaranteed-404 path; SvelteKit renders the error template.
    const res = await page.goto('/this-path-definitely-does-not-exist-v84');
    expect(res?.status()).toBe(404);
    const homeLink = page.getByRole('link', { name: 'Go to Home' });
    await expect(homeLink).toBeVisible();
    await expect(homeLink).toHaveAttribute('href', '/me');
  });
});

test.describe('V8.4 — Error page (anon)', () => {
  test.beforeEach(async ({ request }) => {
    // Setup the instance so / doesn't auto-redirect to /setup, but DON'T
    // log in — the browser stays anon.
    await setupCooperative(request);
  });

  test('+error.svelte shows "Go to Explore" → /explore for anon users', async ({ page }) => {
    const res = await page.goto('/this-path-definitely-does-not-exist-v84');
    expect(res?.status()).toBe(404);
    const homeLink = page.getByRole('link', { name: 'Go to Explore' });
    await expect(homeLink).toBeVisible();
    await expect(homeLink).toHaveAttribute('href', '/explore');
  });
});
