import { test, expect } from '@playwright/test';
import { ADMIN, COOP, WORKSPACE, wp, setupCooperative, loginAs } from './helpers.js';

test.describe('Home', () => {
  test.beforeEach(async ({ page, request }) => {
    await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('home renders with cooperative card', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
    await expect(page.getByRole('heading', { name: COOP.name })).toBeVisible();
  });

  test('cooperative card navigates to workspace', async ({ page }) => {
    await page.getByRole('link', { name: new RegExp(COOP.handle) }).first().click();
    await expect(page).toHaveURL(new RegExp(WORKSPACE));
  });

  test('workspace sidebar contains Posts link', async ({ page }) => {
    await page.goto(WORKSPACE);
    await expect(page.getByRole('link', { name: 'Posts' })).toBeVisible();
  });

  test('workspace sidebar contains Campaigns link', async ({ page }) => {
    await page.goto(WORKSPACE);
    await expect(page.getByRole('link', { name: 'Campaigns' })).toBeVisible();
  });

  test('workspace sidebar contains Alignment link', async ({ page }) => {
    await page.goto(WORKSPACE);
    await expect(page.getByRole('link', { name: 'Alignment' })).toBeVisible();
  });

  test('home shows My Cooperatives section', async ({ page }) => {
    await expect(page.getByText('My Cooperatives')).toBeVisible();
  });

  test('home hides My Networks section when user has no networks', async ({ page }) => {
    // My Networks section is conditional — only rendered when networks.length > 0
    await expect(page.getByText('My Networks')).not.toBeVisible();
  });
});

/**
 * V8.9 — GetStartedCard E2E tests.
 *
 * Serial because the dismiss test mutates server state (persisted via
 * PATCH /api/v1/me/profile) and the subsequent reload test asserts the
 * card stays gone. A fresh cooperative is set up once in beforeAll so
 * the user starts with dismissed_get_started = false.
 */
test.describe.serial('V8.9 — GetStartedCard on /me', () => {
  test.beforeAll(async ({ request }) => {
    await setupCooperative(request);
  });

  test('fresh user sees the GetStartedCard', async ({ page }) => {
    await loginAs(page, ADMIN.email, ADMIN.password);
    const card = page.getByRole('complementary', { name: 'Getting started guide' });
    await expect(card).toBeVisible();
    await expect(card.getByText('Welcome to Co-op Source')).toBeVisible();
  });

  test('card contains link to /me/explore', async ({ page }) => {
    await loginAs(page, ADMIN.email, ADMIN.password);
    const card = page.getByRole('complementary', { name: 'Getting started guide' });
    const exploreLink = card.getByRole('link', { name: 'directory' });
    await expect(exploreLink).toBeVisible();
    await expect(exploreLink).toHaveAttribute('href', '/me/explore');
  });

  test('dismissing the card removes it from the DOM', async ({ page }) => {
    await loginAs(page, ADMIN.email, ADMIN.password);
    const card = page.getByRole('complementary', { name: 'Getting started guide' });
    await expect(card).toBeVisible();

    await page.getByRole('button', { name: 'Dismiss getting started guide' }).click();

    await expect(card).not.toBeVisible();
  });

  test('reloading /me after dismiss does NOT show the card', async ({ page }) => {
    await loginAs(page, ADMIN.email, ADMIN.password);
    await page.goto('/me');
    const card = page.getByRole('complementary', { name: 'Getting started guide' });
    await expect(card).not.toBeVisible();
  });
});
