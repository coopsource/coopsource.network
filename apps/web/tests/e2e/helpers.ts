import type { Page, APIRequestContext } from '@playwright/test';

export const ADMIN = {
  email: 'admin@e2e-test.com',
  password: 'testpassword123',
  displayName: 'E2E Admin',
  handle: 'e2e-admin',
};

export const COOP = {
  name: 'E2E Test Co-op',
  handle: 'e2e-test-coop',
};

/**
 * Set up the cooperative via the API.
 * Returns the Set-Cookie header for authenticated follow-up requests.
 */
export async function setupCooperative(
  request: APIRequestContext,
): Promise<{ coopDid: string; adminDid: string; cookie: string }> {
  const res = await request.post('http://localhost:3001/api/v1/setup/initialize', {
    data: {
      coopName: COOP.name,
      adminEmail: ADMIN.email,
      adminPassword: ADMIN.password,
      adminDisplayName: ADMIN.displayName,
    },
  });

  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`Setup failed (${res.status()}): ${body}`);
  }

  const body = await res.json();
  const setCookie = res.headers()['set-cookie'] ?? '';

  return {
    coopDid: body.coopDid,
    adminDid: body.adminDid,
    cookie: setCookie,
  };
}

/**
 * Log in via the UI login page.
 */
export async function loginAs(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('/dashboard');
}

/**
 * Create a member via invitation API (admin must be authenticated via cookie).
 */
export async function createMemberViaInvitation(
  request: APIRequestContext,
  cookie: string,
  member: { email: string; displayName: string; handle: string; password: string },
): Promise<{ did: string; token: string }> {
  // Create invitation
  const invRes = await request.post('http://localhost:3001/api/v1/invitations', {
    headers: { Cookie: cookie },
    data: {
      email: member.email,
      roles: ['member'],
    },
  });

  if (!invRes.ok()) {
    throw new Error(`Create invitation failed: ${await invRes.text()}`);
  }

  const invitation = await invRes.json();

  // Accept invitation
  const acceptRes = await request.post(
    `http://localhost:3001/api/v1/invitations/${invitation.token}/accept`,
    {
      data: {
        displayName: member.displayName,
        handle: member.handle,
        password: member.password,
      },
    },
  );

  if (!acceptRes.ok()) {
    throw new Error(`Accept invitation failed: ${await acceptRes.text()}`);
  }

  const result = await acceptRes.json();
  return { did: result.member.did, token: invitation.token };
}
