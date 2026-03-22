import { test, expect } from '@playwright/test';
import { ADMIN, wp, setupCooperative, loginAs } from './helpers.js';

// ---------------------------------------------------------------------------
// 1. Integrations (Connectors & Webhooks)
// ---------------------------------------------------------------------------

test.describe('Integrations UI', () => {
  test.beforeEach(async ({ page, request }) => {
    await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('page renders with tabs and empty state', async ({ page }) => {
    await page.goto(wp('/integrations'));
    await expect(page.locator('h1', { hasText: 'Integrations' })).toBeVisible();
    await expect(page.getByText('Connectors', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Webhooks', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('No connectors configured')).toBeVisible();
  });

  test('add connector via modal form', async ({ page }) => {
    await page.goto(wp('/integrations'));
    await page.getByRole('button', { name: 'Add Connector' }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });

    await page.locator('#conn-type').selectOption({ index: 1 });
    await page.locator('#conn-name').fill('Our GitHub Integration');
    await page.getByRole('dialog').getByRole('button', { name: 'Add Connector' }).click();

    await expect(page.getByText('Our GitHub Integration')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Enabled', { exact: false })).toBeVisible();
  });

  test('webhook tab shows empty state', async ({ page }) => {
    await page.goto(wp('/integrations'));

    // Switch to webhooks tab using the button
    await page.getByRole('button', { name: /Webhooks/ }).click();
    await expect(page.getByText('No webhooks configured')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Add Webhook' })).toBeVisible();
  });

  test('event catalog modal opens', async ({ page }) => {
    await page.goto(wp('/integrations'));
    await page.getByRole('button', { name: 'Event Catalog' }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// 2. AI Providers (inline form, not modal)
// ---------------------------------------------------------------------------

test.describe('AI Providers UI', () => {
  test.beforeEach(async ({ page, request }) => {
    await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('page renders with header and empty state', async ({ page }) => {
    await page.goto(wp('/settings/ai-providers'));
    await expect(page.locator('h1', { hasText: 'AI Model Providers' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Provider' })).toBeVisible();
    await expect(page.getByText('No model providers configured')).toBeVisible();
  });

  test('add provider form appears on button click', async ({ page }) => {
    await page.goto(wp('/settings/ai-providers'));
    await page.getByRole('button', { name: 'Add Provider' }).click();

    await expect(page.locator('#providerId')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#displayName')).toBeVisible();
    await expect(page.locator('#apiKey')).toBeVisible();
  });

  test('provider type switch changes form fields', async ({ page }) => {
    await page.goto(wp('/settings/ai-providers'));
    await page.getByRole('button', { name: 'Add Provider' }).click();

    // Default shows apiKey
    await expect(page.locator('#apiKey')).toBeVisible({ timeout: 5_000 });

    // Switch to Ollama
    await page.locator('#providerId').selectOption('ollama');
    await expect(page.locator('#baseUrl')).toBeVisible({ timeout: 5_000 });
    // apiKey should no longer be visible for Ollama
    await expect(page.locator('#apiKey')).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 3. Payment Settings (inline form, not modal)
// ---------------------------------------------------------------------------

test.describe('Payment Settings UI', () => {
  test.beforeEach(async ({ page, request }) => {
    await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('page renders with header and empty state', async ({ page }) => {
    await page.goto(wp('/settings/payments'));
    await expect(page.locator('h1', { hasText: 'Payment Providers' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Provider' })).toBeVisible();
    await expect(page.getByText('No payment providers configured')).toBeVisible();
  });

  test('add provider form appears on button click', async ({ page }) => {
    await page.goto(wp('/settings/payments'));
    await page.getByRole('button', { name: 'Add Provider' }).click();

    await expect(page.locator('#providerId')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#displayName')).toBeVisible();
    await expect(page.locator('#secretKey')).toBeVisible();
    await expect(page.locator('#webhookSecret')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });
});
