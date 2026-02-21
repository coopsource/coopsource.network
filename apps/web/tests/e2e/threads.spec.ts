import { test, expect } from '@playwright/test';
import { ADMIN, setupCooperative, loginAs } from './helpers.js';

test.describe('Threads', () => {
  test.beforeEach(async ({ page, request }) => {
    await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('thread list renders with New thread button', async ({ page }) => {
    await page.goto('/threads');
    await expect(page.getByRole('heading', { name: 'Threads' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'New thread' })).toBeVisible();
  });

  test('create thread redirects to detail page', async ({ page }) => {
    await page.goto('/threads/new');
    await page.getByLabel('Title').fill('Test Thread');
    await page.getByRole('button', { name: 'Create thread' }).click();

    // Should redirect to the thread detail page
    await page.waitForURL(/\/threads\/[a-f0-9-]+$/);
    await expect(page.getByText('Test Thread')).toBeVisible();
  });

  test('create post in thread', async ({ page }) => {
    // Create a thread first
    await page.goto('/threads/new');
    await page.getByLabel('Title').fill('Post Test Thread');
    await page.getByRole('button', { name: 'Create thread' }).click();
    await page.waitForURL(/\/threads\/[a-f0-9-]+$/);

    // Add a post
    await page.getByPlaceholder(/Write.*message|Write.*post|Type.*message/i).fill('Hello from E2E!');
    await page.getByRole('button', { name: /Send|Post|Submit/i }).click();
    await page.waitForLoadState('networkidle');

    // The post should appear
    await expect(page.getByText('Hello from E2E!')).toBeVisible();
  });

  test('delete own post', async ({ page }) => {
    // Create thread and post
    await page.goto('/threads/new');
    await page.getByLabel('Title').fill('Delete Post Thread');
    await page.getByRole('button', { name: 'Create thread' }).click();
    await page.waitForURL(/\/threads\/[a-f0-9-]+$/);

    await page.getByPlaceholder(/Write.*message|Write.*post|Type.*message/i).fill('Post to delete');
    await page.getByRole('button', { name: /Send|Post|Submit/i }).click();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Post to delete')).toBeVisible();

    // Delete the post
    await page.getByRole('button', { name: /Delete/i }).click();
    await page.waitForLoadState('networkidle');

    // Post should be gone
    await expect(page.getByText('Post to delete')).not.toBeVisible();
  });

  test('thread detail shows member count', async ({ page }) => {
    await page.goto('/threads/new');
    await page.getByLabel('Title').fill('Member Count Thread');
    await page.getByRole('button', { name: 'Create thread' }).click();
    await page.waitForURL(/\/threads\/[a-f0-9-]+$/);

    // Should show member count somewhere on the page
    await expect(page.getByText(/1.*member/i)).toBeVisible();
  });
});
