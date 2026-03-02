import { test, expect } from '@playwright/test';
import { ADMIN, wp, setupCooperative, loginAs } from './helpers.js';

test.describe('Invitations', () => {
  test.beforeEach(async ({ page, request }) => {
    await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('members page shows Invite member button', async ({ page }) => {
    await page.goto(wp('/members'));
    await expect(page.getByRole('heading', { name: 'Members', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Invite member' })).toBeVisible();
  });

  test('create invitation via members page modal', async ({ page }) => {
    await page.goto(wp('/members'));
    await page.getByRole('button', { name: 'Invite member' }).click();

    // Fill the invitation form in the modal
    await expect(page.getByLabel('Email')).toBeVisible({ timeout: 10_000 });
    await page.getByLabel('Email').fill('newmember@e2e-test.com');
    await page.getByRole('button', { name: 'Send invitation' }).click();

    // Navigate to invitations page to verify
    await page.goto(wp('/invitations'));
    await expect(page.getByText('newmember@e2e-test.com')).toBeVisible({ timeout: 10_000 });
  });

  test('invitations page lists pending invitations', async ({ page, request }) => {
    // Create an invitation via API for speed
    const setup = await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);

    // Create invitation via API
    await request.post('http://localhost:3002/api/v1/invitations', {
      headers: { Cookie: setup.cookie },
      data: { email: 'pending@e2e-test.com', roles: ['member'] },
    });

    await page.goto(wp('/invitations'));
    await expect(page.getByRole('heading', { name: 'Invitations', exact: true })).toBeVisible();
    await expect(page.getByText('pending@e2e-test.com')).toBeVisible();
  });

  test('revoke invitation', async ({ page, request }) => {
    const setup = await setupCooperative(request);
    await loginAs(page, ADMIN.email, ADMIN.password);

    // Create invitation via API
    await request.post('http://localhost:3002/api/v1/invitations', {
      headers: { Cookie: setup.cookie },
      data: { email: 'revoke@e2e-test.com', roles: ['member'] },
    });

    await page.goto(wp('/invitations'));
    await expect(page.getByText('revoke@e2e-test.com')).toBeVisible();

    // Click revoke button
    await page.getByRole('button', { name: 'Revoke' }).click();

    // Revoke button should disappear (status changed, button hidden)
    await expect(page.getByRole('button', { name: 'Revoke' })).not.toBeVisible({ timeout: 10_000 });
  });

  test('accept invitation creates new member account', async ({ page, request }) => {
    const setup = await setupCooperative(request);

    // Create invitation via API
    const invRes = await request.post('http://localhost:3002/api/v1/invitations', {
      headers: { Cookie: setup.cookie },
      data: { email: 'accept@e2e-test.com', roles: ['member'] },
    });
    const invitation = await invRes.json();

    // Navigate to accept page (public, no auth needed)
    await page.goto(`/invite/${invitation.token}`);
    await expect(page.getByText('accept@e2e-test.com')).toBeVisible();

    // Fill the registration form
    await page.getByLabel('Display Name').fill('New Member');
    await page.getByLabel('Password').fill('newmemberpassword123');

    // Submit
    await page.getByRole('button', { name: 'Accept Invitation' }).click();
    await page.waitForURL('/dashboard');

    // Should be logged in as the new member
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });
});
