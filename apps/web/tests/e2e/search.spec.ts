import { test, expect } from '@playwright/test';
import {
  ADMIN,
  COOP,
  setupCooperative,
  loginAs,
  setExploreVisibility,
} from './helpers.js';

test.describe('V8.6 — Anon search on /explore', () => {
  test.beforeEach(async ({ request }) => {
    const { cookie } = await setupCooperative(request);
    // V8.5 master switch — make the test coop discoverable
    await setExploreVisibility(request, cookie, {
      anonDiscoverable: true,
      publicDescription: true,
    });
  });

  test('shows the search input on /explore', async ({ page }) => {
    await page.goto('/explore');
    const input = page.getByPlaceholder('Search cooperatives...');
    await expect(input).toBeVisible();
  });

  test('searching for the test coop name returns it', async ({ page }) => {
    await page.goto('/explore');
    // Use a stem-friendly term ("test") that the english tokenizer will
    // reliably index. The full COOP.name "E2E Test Co-op" tokenizes to roughly
    // {e2e, test} after the english stemmer eats the hyphenated "co-op".
    await page.getByPlaceholder('Search cooperatives...').fill('test');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/explore\?q=test/);
    await expect(page.getByRole('heading', { level: 3, name: COOP.name })).toBeVisible();
  });

  test('searching for nonsense renders the empty state', async ({ page }) => {
    await page.goto('/explore?q=zzznonexistent');
    await expect(page.getByText(/No cooperatives match your search/)).toBeVisible();
  });

  test('search mode hides the Networks strip', async ({ page }) => {
    await page.goto('/explore?q=test');
    // The Networks heading should NOT be visible in search mode (even though the
    // browse view would show it). This is the visual focus rule from V8.6 plan §9.
    const networksHeading = page.getByRole('heading', { name: 'Networks', exact: true });
    await expect(networksHeading).not.toBeVisible();
  });
});

test.describe('V8.6 — Authed search on /me/explore', () => {
  test.beforeEach(async ({ page, request }) => {
    const { cookie } = await setupCooperative(request);
    await setExploreVisibility(request, cookie, {
      anonDiscoverable: true,
      publicDescription: true,
    });
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('renders the Explore page with search input and chips', async ({ page }) => {
    await page.goto('/me/explore');
    await expect(page.getByRole('heading', { name: 'Explore', exact: true })).toBeVisible();
    // V8.8 — Task 9 widened the placeholder to mention people alongside coops/posts.
    await expect(page.getByPlaceholder('Search cooperatives, people, and posts...')).toBeVisible();
    // Filter chips
    await expect(page.getByRole('tab', { name: 'All' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Cooperatives' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Posts' })).toBeVisible();
  });

  test('searching renders both Cooperatives and Posts sections under "All"', async ({ page }) => {
    await page.goto(`/me/explore?q=${encodeURIComponent(COOP.name)}`);
    await expect(page.getByRole('heading', { name: 'Cooperatives' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Posts' })).toBeVisible();
  });

  test('clicking the Posts chip filters to posts only', async ({ page }) => {
    await page.goto(`/me/explore?q=${encodeURIComponent(COOP.name)}`);
    await page.getByRole('tab', { name: 'Posts' }).click();
    await expect(page).toHaveURL(/type=posts/);
    // Cooperatives heading should be hidden in posts-only mode
    await expect(page.getByRole('heading', { name: 'Cooperatives' })).not.toBeVisible();
    await expect(page.getByRole('heading', { name: 'Posts' })).toBeVisible();
  });

  test('clicking the Cooperatives chip filters to coops only', async ({ page }) => {
    await page.goto(`/me/explore?q=${encodeURIComponent(COOP.name)}`);
    await page.getByRole('tab', { name: 'Cooperatives' }).click();
    await expect(page).toHaveURL(/type=cooperatives/);
    await expect(page.getByRole('heading', { name: 'Cooperatives' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Posts' })).not.toBeVisible();
  });

  test('Explore appears in the home sidebar nav', async ({ page }) => {
    await page.goto('/me');
    const exploreLink = page.getByRole('link', { name: 'Explore', exact: true });
    await expect(exploreLink).toBeVisible();
    await exploreLink.click();
    await expect(page).toHaveURL('/me/explore');
  });

  // V8.8 — People filter chip. The /me/explore page now has a People chip
  // alongside Cooperatives and Posts. Discoverable persons (profile.discoverable
  // = true) seeded via the test admin endpoint should be findable via FTS on
  // displayName/handle, and the chip should narrow to the People section.
  test('People chip — seeded discoverable person appears under the People filter', async ({
    page,
    request,
  }) => {
    await request.post(
      'http://localhost:3002/api/v1/admin/test-seed-candidate-person',
      {
        data: {
          did: 'did:web:e2e-person-quinoa.example',
          handle: 'quinoafan-e2e',
          displayName: 'Quinoa E2E Person',
          discoverable: true,
        },
      },
    );

    // Navigate with the People chip preselected so we don't depend on the
    // "All" view rendering all sections at once.
    await page.goto('/me/explore?q=quinoa&type=people');

    // Confirm the chip is the active tab.
    const peopleChip = page.getByRole('tab', { name: 'People', exact: true });
    await expect(peopleChip).toHaveAttribute('aria-selected', 'true');

    // The People section heading + the seeded display name are both visible.
    await expect(page.getByRole('heading', { name: 'People', exact: true })).toBeVisible();
    await expect(page.getByText('Quinoa E2E Person', { exact: true })).toBeVisible();
    await expect(page.getByText('@quinoafan-e2e', { exact: true })).toBeVisible();
  });
});
