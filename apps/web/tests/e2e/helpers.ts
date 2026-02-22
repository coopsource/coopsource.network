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
 * Truncate all tables and reset the API server's setup cache.
 * Must be called before setupCooperative() to ensure a clean state.
 */
export async function resetDatabase(request: APIRequestContext): Promise<void> {
  const res = await request.post('http://localhost:3002/api/v1/admin/test-reset');
  if (!res.ok()) {
    throw new Error(`DB reset failed (${res.status()}): ${await res.text()}`);
  }
}

/**
 * Set up the cooperative via the API.
 * Automatically resets the DB first for test isolation.
 * Returns the Set-Cookie header for authenticated follow-up requests.
 */
export async function setupCooperative(
  request: APIRequestContext,
): Promise<{ coopDid: string; adminDid: string; cookie: string }> {
  await resetDatabase(request);

  const res = await request.post('http://localhost:3002/api/v1/setup/initialize', {
    data: {
      cooperativeName: COOP.name,
      cooperativeHandle: COOP.handle,
      adminEmail: ADMIN.email,
      adminPassword: ADMIN.password,
      adminDisplayName: ADMIN.displayName,
      adminHandle: ADMIN.handle,
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
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
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
  const invRes = await request.post('http://localhost:3002/api/v1/invitations', {
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
    `http://localhost:3002/api/v1/invitations/${invitation.token}/accept`,
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
