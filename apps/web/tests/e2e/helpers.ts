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

/** Base workspace path for the E2E test cooperative. */
export const WORKSPACE = `/coop/${COOP.handle}`;

/** Build a path under the workspace. */
export function wp(path: string): string {
  return `${WORKSPACE}${path}`;
}

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
  await page.waitForURL('/me');
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

/**
 * V8.5 — Update the test cooperative's public-profile visibility flags
 * via the API. The test setup defaults to anon_discoverable=false, so
 * tests that exercise /explore/[handle] must opt in here first.
 */
export async function setExploreVisibility(
  request: APIRequestContext,
  cookie: string,
  flags: {
    anonDiscoverable?: boolean;
    publicDescription?: boolean;
    publicMembers?: boolean;
    publicActivity?: boolean;
    publicAgreements?: boolean;
    publicCampaigns?: boolean;
  },
): Promise<void> {
  const res = await request.put('http://localhost:3002/api/v1/cooperative', {
    headers: { Cookie: cookie },
    data: flags,
  });
  if (!res.ok()) {
    throw new Error(`setExploreVisibility failed (${res.status()}): ${await res.text()}`);
  }
}

/**
 * V8.5 — Seed an open proposal so /explore/[handle] has something to render
 * in the proposals section. Two-step: create draft → open.
 */
export async function createOpenProposal(
  request: APIRequestContext,
  cookie: string,
  data: { title: string; body: string },
): Promise<{ id: string }> {
  const createRes = await request.post('http://localhost:3002/api/v1/proposals', {
    headers: { Cookie: cookie },
    data: {
      title: data.title,
      body: data.body,
      bodyFormat: 'text/markdown',
      votingType: 'binary',
      quorumType: 'simpleMajority',
    },
  });
  if (!createRes.ok()) {
    throw new Error(`Create proposal failed (${createRes.status()}): ${await createRes.text()}`);
  }
  const proposal = await createRes.json();

  const openRes = await request.post(
    `http://localhost:3002/api/v1/proposals/${proposal.id}/open`,
    { headers: { Cookie: cookie } },
  );
  if (!openRes.ok()) {
    throw new Error(`Open proposal failed (${openRes.status()}): ${await openRes.text()}`);
  }

  return { id: proposal.id };
}

/**
 * V8.8 — Seed a discoverable person entity + default profile for people-search
 * and person-match E2E tests. The person has no alignment data by default; the
 * V8.7 fallback branch in score.ts (recency * diversity) means they still
 * surface as a match candidate for viewers with no alignment data of their own.
 *
 * Throws on a non-OK response so that upstream test failures surface as a
 * specific "seedCandidatePerson failed: NNN ..." error rather than a
 * misleading locator miss later in the test.
 */
export async function seedCandidatePerson(
  request: APIRequestContext,
  did: string,
  handle: string,
  displayName: string,
): Promise<void> {
  const res = await request.post(
    'http://localhost:3002/api/v1/admin/test-seed-candidate-person',
    {
      data: { did, handle, displayName, discoverable: true },
    },
  );
  if (!res.ok()) {
    throw new Error(`seedCandidatePerson failed: ${res.status()} ${await res.text()}`);
  }
}

/**
 * Register a new account via the UI register page.
 * Expects a cooperative to already be set up.
 */
export async function registerAs(
  page: Page,
  user: { displayName: string; handle: string; email: string; password: string },
): Promise<void> {
  await page.goto('/register');
  await page.getByLabel('Display Name').fill(user.displayName);
  await page.locator('#handle').fill(user.handle);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('/me');
}

