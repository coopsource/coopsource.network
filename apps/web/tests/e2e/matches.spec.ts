import { test, expect } from '@playwright/test';
import { ADMIN, setupCooperative, loginAs } from './helpers.js';

const API_URL = 'http://localhost:3002';

/**
 * V8.7 — Match Service E2E.
 *
 * The matchmaking job is triggered synchronously via a non-production
 * admin endpoint (/api/v1/admin/test-run-matchmaking) so tests don't
 * have to wait for the hourly setInterval tick. Candidate coops are
 * seeded via /api/v1/admin/test-seed-candidate-coop because the admin's
 * own coop is excluded from their own matches.
 */

async function seedCandidateCoop(
  request: import('@playwright/test').APIRequestContext,
  did: string,
  handle: string,
  displayName: string,
): Promise<void> {
  const res = await request.post(`${API_URL}/api/v1/admin/test-seed-candidate-coop`, {
    data: { did, handle, displayName, cooperativeType: 'worker' },
  });
  if (!res.ok()) {
    throw new Error(`Seed failed (${res.status()}): ${await res.text()}`);
  }
}

// V8.8 — Seed a discoverable person candidate so the matchmaking job has a
// person to score and surface alongside the cooperative candidates. Mirrors
// seedCandidateCoop but hits the V8.8 admin endpoint that writes the
// `entity` (type=person) + `profile` (discoverable=true) rows. The viewer
// (E2E admin) will not have alignment data, so the V8.7 fallback branch in
// score.ts (recency * diversity) is what surfaces this candidate.
async function seedCandidatePerson(
  request: import('@playwright/test').APIRequestContext,
  did: string,
  handle: string,
  displayName: string,
): Promise<void> {
  const res = await request.post(`${API_URL}/api/v1/admin/test-seed-candidate-person`, {
    data: { did, handle, displayName, discoverable: true },
  });
  if (!res.ok()) {
    throw new Error(`Seed person failed (${res.status()}): ${await res.text()}`);
  }
}

async function runMatchmaking(
  request: import('@playwright/test').APIRequestContext,
): Promise<void> {
  const res = await request.post(`${API_URL}/api/v1/admin/test-run-matchmaking`);
  if (!res.ok()) {
    throw new Error(`Matchmaking failed (${res.status()}): ${await res.text()}`);
  }
}

test.describe('V8.7 — Suggested Matches widget on /me', () => {
  test.beforeEach(async ({ request }) => {
    await setupCooperative(request);
  });

  test('Matches link appears in the Home sidebar', async ({ page }) => {
    await loginAs(page, ADMIN.email, ADMIN.password);
    await page.goto('/me');
    await expect(page.getByRole('link', { name: 'Matches', exact: true })).toBeVisible();
  });

  test('widget is hidden when there are no matches', async ({ page }) => {
    await loginAs(page, ADMIN.email, ADMIN.password);
    await page.goto('/me');
    // The "Suggested for You" header is the widget's only top-level marker.
    await expect(
      page.getByRole('heading', { name: 'Suggested for You', exact: true }),
    ).not.toBeVisible();
  });

  test('widget renders seeded matches and dismiss persists', async ({ page, request }) => {
    await seedCandidateCoop(
      request,
      'did:web:test-match-1.example',
      'test-match-1',
      'Test Match One',
    );
    await runMatchmaking(request);

    await loginAs(page, ADMIN.email, ADMIN.password);
    await page.goto('/me');

    // Widget visible.
    await expect(
      page.getByRole('heading', { name: 'Suggested for You', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Test Match One' })).toBeVisible();

    // Dismiss the only card.
    await page.getByRole('button', { name: 'Dismiss this suggestion' }).click();

    // After the form action, the page server-loader re-runs and the card is gone.
    await expect(page.getByRole('heading', { level: 3, name: 'Test Match One' })).not.toBeVisible();

    // Reload — dismiss persists (tombstone).
    await page.reload();
    await expect(page.getByRole('heading', { level: 3, name: 'Test Match One' })).not.toBeVisible();
  });
});

test.describe('V8.7 — /me/matches full page', () => {
  test.beforeEach(async ({ request }) => {
    await setupCooperative(request);
  });

  test('renders the page header and active toggle by default', async ({ page }) => {
    await loginAs(page, ADMIN.email, ADMIN.password);
    await page.goto('/me/matches');
    await expect(page.getByRole('heading', { name: 'Matches', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Active' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: /All/ })).toHaveAttribute('aria-selected', 'false');
  });

  test('shows seeded matches and supports the show=all toggle', async ({ page, request }) => {
    await seedCandidateCoop(
      request,
      'did:web:test-match-2.example',
      'test-match-2',
      'Test Match Two',
    );
    await runMatchmaking(request);

    await loginAs(page, ADMIN.email, ADMIN.password);
    await page.goto('/me/matches');

    await expect(page.getByRole('heading', { level: 3, name: 'Test Match Two' })).toBeVisible();

    // Dismiss it.
    await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
    await expect(page.getByRole('heading', { level: 3, name: 'Test Match Two' })).not.toBeVisible();

    // Active tab now empty.
    await expect(page.getByText(/No active matches/)).toBeVisible();

    // Switch to All — dismissed match reappears with the Dismissed badge.
    await page.getByRole('tab', { name: /All/ }).click();
    await expect(page.getByRole('heading', { level: 3, name: 'Test Match Two' })).toBeVisible();
    await expect(page.getByText('Dismissed', { exact: true })).toBeVisible();
  });

  // V8.8 — Person matches. The matchmaking service now scores discoverable
  // person candidates alongside cooperatives, and the page renders them with
  // a distinguishing User icon and NO "View" link (V8.8 doesn't ship a public
  // person profile page yet — see V8.9 TODO in matches/+page.svelte).
  test('renders a seeded discoverable person as a match (no View link)', async ({
    page,
    request,
  }) => {
    await seedCandidatePerson(
      request,
      'did:web:test-person-match.example',
      'test-person-match',
      'Test Person Match',
    );
    await runMatchmaking(request);

    await loginAs(page, ADMIN.email, ADMIN.password);
    await page.goto('/me/matches');

    // The person card renders with the seeded display name as an h3.
    const personHeading = page.getByRole('heading', {
      level: 3,
      name: 'Test Person Match',
    });
    await expect(personHeading).toBeVisible();

    // Person matches do NOT get a "View" link (V8.8 ships without person
    // profile pages). Scope the assertion to the article that contains the
    // person heading so we don't accidentally match a coop card's "View" link
    // if both kinds of candidates were seeded in the same run.
    const personCard = page.locator('article').filter({ hasText: 'Test Person Match' });
    await expect(personCard).toBeVisible();
    await expect(personCard.getByRole('link', { name: /View/ })).toHaveCount(0);
  });
});
