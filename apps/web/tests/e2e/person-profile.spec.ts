import { test, expect } from '@playwright/test';
import { setupCooperative, seedCandidatePerson } from './helpers.js';

const API_URL = 'http://localhost:3002';

test.describe('V8.9 — Public person profile page', () => {
  test.beforeEach(async ({ request }) => {
    await setupCooperative(request);
  });

  test('displays the person profile for a discoverable person', async ({ page, request }) => {
    await seedCandidatePerson(
      request,
      'did:web:e2e-profile-alice.example',
      'profile-alice',
      'Alice Profile E2E',
    );

    await page.goto('/profiles/profile-alice');

    await expect(page.getByRole('heading', { level: 1, name: 'Alice Profile E2E' })).toBeVisible();
    await expect(page.getByText('@profile-alice')).toBeVisible();
  });

  test('renders 404 for a nonexistent handle', async ({ page }) => {
    await page.goto('/profiles/nonexistent-handle-zzz');

    // SvelteKit error page renders the status code as an h1.
    await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
    await expect(page.getByText('Person not found')).toBeVisible();
  });

  test('shows interests section when alignment data exists', async ({ page, request }) => {
    const res = await request.post(`${API_URL}/api/v1/admin/test-seed-candidate-person`, {
      data: {
        did: 'did:web:e2e-profile-interests.example',
        handle: 'profile-interests',
        displayName: 'Interests Person E2E',
        discoverable: true,
        interests: [
          { category: 'Technology', description: 'Software development' },
          { category: 'Education', description: 'Teaching' },
        ],
      },
    });
    if (!res.ok()) {
      throw new Error(`seed person with interests failed: ${res.status()} ${await res.text()}`);
    }

    await page.goto('/profiles/profile-interests');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Interests Person E2E' }),
    ).toBeVisible();

    // The interests section heading is always present; verify seeded categories appear.
    await expect(page.getByText('technology')).toBeVisible();
    await expect(page.getByText('education')).toBeVisible();
  });
});
