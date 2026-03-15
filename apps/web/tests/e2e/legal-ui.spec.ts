import { test, expect } from '@playwright/test';
import { ADMIN, wp, setupCooperative, loginAs } from './helpers.js';

test.describe('Legal Documents UI', () => {
  test.beforeEach(async ({ page, request }) => {
    await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('legal page renders with empty state and create button', async ({ page }) => {
    await page.goto(wp('/legal'));
    await expect(page.locator('h1', { hasText: 'Legal Documents' })).toBeVisible();
    await expect(page.getByText('No legal documents')).toBeVisible();
    await expect(page.getByRole('button', { name: 'New document' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Meeting Records' })).toBeVisible();
  });

  test('create legal document via modal', async ({ page }) => {
    await page.goto(wp('/legal'));

    // Open create modal
    await page.getByRole('button', { name: 'New document' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Fill form
    await page.locator('#docTitle').fill('Test Bylaws');
    await page.locator('#docType').selectOption('bylaws');
    await page.locator('#docBody').fill('Article 1: Purpose and objectives.');

    // Submit
    await page.getByRole('button', { name: 'Create document' }).click();

    // Modal closes and document appears in list
    await expect(page.getByText('Test Bylaws')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('a').filter({ hasText: 'bylaws' })).toBeVisible();
  });

  test('navigate to document detail and edit', async ({ page, request }) => {
    // Create doc via API first
    const setup = await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);

    const API = 'http://localhost:3002/api/v1';
    const createRes = await request.post(`${API}/legal/documents`, {
      headers: { Cookie: setup.cookie },
      data: { title: 'Editable Doc', body: 'Original content', documentType: 'policy' },
    });
    const doc = await createRes.json();

    // Navigate to detail
    await page.goto(wp(`/legal/${doc.id}`));
    await expect(page.locator('h1', { hasText: 'Editable Doc' })).toBeVisible();
    await expect(page.getByText('Original content')).toBeVisible();
    await expect(page.getByText('v1')).toBeVisible();

    // Click edit
    await page.getByRole('button', { name: 'Edit document' }).click();

    // Modify the body
    await page.locator('#editBody').fill('Updated content for v2');
    await page.getByRole('button', { name: 'Save changes (new version)' }).click();

    // Success message
    await expect(page.getByText('Document updated successfully')).toBeVisible({ timeout: 10_000 });
  });

  test('filter documents by status', async ({ page, request }) => {
    const setup = await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);

    const API = 'http://localhost:3002/api/v1';
    await request.post(`${API}/legal/documents`, {
      headers: { Cookie: setup.cookie },
      data: { title: 'Draft Doc', documentType: 'policy' },
    });
    await request.post(`${API}/legal/documents`, {
      headers: { Cookie: setup.cookie },
      data: { title: 'Active Doc', documentType: 'bylaws', status: 'active' },
    });

    await page.goto(wp('/legal'));
    await expect(page.getByText('Draft Doc')).toBeVisible();
    await expect(page.getByText('Active Doc')).toBeVisible();

    // Filter to active only
    await page.getByRole('link', { name: 'Active', exact: true }).click();
    await expect(page.getByText('Active Doc')).toBeVisible();
    await expect(page.getByText('Draft Doc')).not.toBeVisible();
  });

  test('new document page creates and redirects', async ({ page }) => {
    await page.goto(wp('/legal/new'));
    await expect(page.locator('h1', { hasText: 'New Legal Document' })).toBeVisible();

    await page.locator('#title').fill('Resolution 2026-01');
    await page.locator('#documentType').selectOption('resolution');
    await page.locator('#body').fill('Be it resolved that...');
    await page.getByRole('button', { name: 'Create document' }).click();

    // Should redirect to detail page
    await page.waitForURL(/\/coop\/[^/]+\/legal\/[a-f0-9-]+$/);
    await expect(page.locator('h1', { hasText: 'Resolution 2026-01' })).toBeVisible();
  });
});

test.describe('Meeting Records UI', () => {
  test.beforeEach(async ({ page, request }) => {
    await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('meetings page renders with empty state', async ({ page }) => {
    await page.goto(wp('/legal/meetings'));
    await expect(page.locator('h1', { hasText: 'Meeting Records' })).toBeVisible();
    await expect(page.getByText('No meeting records')).toBeVisible();
  });

  test('create meeting record via modal', async ({ page }) => {
    await page.goto(wp('/legal/meetings'));
    await page.getByRole('button', { name: 'New meeting' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.locator('#meetingTitle').fill('Q1 Board Meeting');
    await page.locator('#meetingDate').fill('2026-03-15');
    await page.locator('#meetingType').selectOption('board');
    await page.locator('#quorumMet').check();
    await page.getByRole('button', { name: 'Create record' }).click();

    // Meeting appears in table
    await expect(page.getByText('Q1 Board Meeting')).toBeVisible({ timeout: 10_000 });
  });

  test('certify meeting record', async ({ page, request }) => {
    const setup = await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);

    const API = 'http://localhost:3002/api/v1';
    await request.post(`${API}/legal/meetings`, {
      headers: { Cookie: setup.cookie },
      data: { title: 'Certify Test', meetingDate: '2026-03-15T10:00:00.000Z', meetingType: 'general' },
    });

    await page.goto(wp('/legal/meetings'));
    await expect(page.getByText('Certify Test')).toBeVisible();

    // Click certify button
    await page.getByRole('button', { name: 'Certify' }).click();
    await expect(page.getByText('Meeting minutes certified')).toBeVisible({ timeout: 10_000 });
  });
});
