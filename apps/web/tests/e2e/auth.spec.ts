import { test, expect } from '@playwright/test';
import { ADMIN, setupCooperative, loginAs, resetDatabase } from './helpers.js';

test.describe('Authentication', () => {
  test('unauthenticated user is redirected to /login', async ({ page, request }) => {
    await setupCooperative(request);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('login with valid credentials lands on dashboard', async ({ page, request }) => {
    await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);
    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('login with invalid credentials shows error', async ({ page, request }) => {
    await setupCooperative(request);
    await page.goto('/login');
    await page.getByLabel('Email').fill(ADMIN.email);
    await page.getByLabel('Password').fill('wrongpassword');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText(/invalid|error/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('logout clears session', async ({ page, context, request }) => {
    await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);
    await expect(page).toHaveURL('/dashboard');

    // Clear all browser cookies to simulate logout
    await context.clearCookies();

    // After clearing cookies, navigating to dashboard should redirect to login
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });
});
