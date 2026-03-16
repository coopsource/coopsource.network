/**
 * API-level integration tests for V5 features.
 * These verify backend endpoints directly via Playwright's request context,
 * complementing the browser-level UI tests in separate spec files.
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { setupCooperative } from './helpers.js';

const API = 'http://localhost:3002/api/v1';

async function post(request: APIRequestContext, cookie: string, path: string, data: unknown) {
  return request.post(`${API}${path}`, { headers: { Cookie: cookie }, data });
}

async function get(request: APIRequestContext, cookie: string, path: string) {
  return request.get(`${API}${path}`, { headers: { Cookie: cookie } });
}

test.describe('Onboarding API', () => {
  let cookie: string;
  let adminDid: string;

  test.beforeEach(async ({ request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
    adminDid = setup.adminDid;
  });

  test('create and retrieve onboarding config', async ({ request }) => {
    const createRes = await post(request, cookie, '/onboarding/config', {
      probationDurationDays: 30,
      requireTraining: true,
      requireBuyIn: false,
      buddySystemEnabled: false,
    });
    expect(createRes.status()).toBe(201);
    const config = await createRes.json();
    expect(config.probationDurationDays).toBe(30);
    expect(config.requireTraining).toBe(true);
  });

  test('start onboarding and complete lifecycle', async ({ request }) => {
    await post(request, cookie, '/onboarding/config', { probationDurationDays: 30 });

    // Start
    const startRes = await post(request, cookie, '/onboarding/start', { memberDid: adminDid });
    expect(startRes.status()).toBe(201);
    const progress = await startRes.json();
    expect(progress.memberDid).toBe(adminDid);
    expect(progress.status).toBe('in_progress');

    // Review
    const reviewRes = await post(request, cookie, '/onboarding/review', {
      memberDid: adminDid,
      reviewType: 'periodic',
      outcome: 'pass',
      comments: 'Making good progress.',
    });
    expect(reviewRes.status()).toBe(201);
    expect((await reviewRes.json()).outcome).toBe('pass');

    // Complete
    const completeRes = await post(request, cookie, '/onboarding/complete', { memberDid: adminDid });
    expect(completeRes.status()).toBe(200);
    expect((await completeRes.json()).status).toBe('completed');
  });
});

test.describe('Delegation API', () => {
  let cookie: string;

  test.beforeEach(async ({ request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
  });

  test('delegation endpoint validates input', async ({ request }) => {
    const res = await post(request, cookie, '/governance/delegations', {
      delegateeDid: 'did:plc:nonexistent',
      scope: 'project',
    });
    // Should get 400 (validation error like self-delegation or not found) or 201 — not 404 or 500
    expect([201, 400]).toContain(res.status());
  });

  test('list delegations returns array', async ({ request }) => {
    const res = await get(request, cookie, '/governance/delegations');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.delegations).toBeDefined();
    expect(Array.isArray(body.delegations)).toBe(true);
  });
});

test.describe('Governance Feed API', () => {
  let cookie: string;

  test.beforeEach(async ({ request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
  });

  test('action items endpoint returns items array', async ({ request }) => {
    const res = await get(request, cookie, '/governance/feed/action-items');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.items).toBeDefined();
  });

  test('outcomes endpoint returns items array', async ({ request }) => {
    const res = await get(request, cookie, '/governance/feed/outcomes');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.items).toBeDefined();
  });
});

test.describe('Member Classes API', () => {
  let cookie: string;
  let adminDid: string;

  test.beforeEach(async ({ request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
    adminDid = setup.adminDid;
  });

  test('full CRUD lifecycle', async ({ request }) => {
    // Create
    const createRes = await post(request, cookie, '/member-classes', {
      name: 'Consumer',
      description: 'Consumer members',
      voteWeight: 1,
    });
    expect(createRes.status()).toBe(201);
    const cls = await createRes.json();
    expect(cls.name).toBe('Consumer');

    // List
    const listRes = await get(request, cookie, '/member-classes');
    expect(listRes.status()).toBe(200);
    expect((await listRes.json()).classes.length).toBe(1);

    // Delete
    const delRes = await request.delete(`${API}/member-classes/${cls.id}`, {
      headers: { Cookie: cookie },
    });
    expect(delRes.status()).toBe(204);

    // Verify deleted
    const list2 = await (await get(request, cookie, '/member-classes')).json();
    expect(list2.classes.length).toBe(0);
  });

  test('assign member to class', async ({ request }) => {
    await post(request, cookie, '/member-classes', { name: 'Producer' });

    const assignRes = await post(request, cookie, '/member-classes/assign', {
      memberDid: adminDid,
      className: 'Producer',
    });
    expect(assignRes.status()).toBe(200);
    const result = await assignRes.json();
    expect(result.className).toBe('Producer');
  });
});

test.describe('Cooperative Links API', () => {
  let cookie: string;
  let coopDid: string;

  test.beforeEach(async ({ request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
    coopDid = setup.coopDid;
  });

  test('create and list cooperative links', async ({ request }) => {
    const createRes = await post(request, cookie, '/cooperative-links', {
      targetDid: coopDid,
      linkType: 'supply_chain',
      description: 'Supply chain link',
    });
    // May return 201 (created) or 400 (self-link validation)
    expect([201, 400]).toContain(createRes.status());

    const listRes = await get(request, cookie, '/cooperative-links');
    expect(listRes.status()).toBe(200);
  });

  test('partners endpoint returns array', async ({ request }) => {
    const res = await get(request, cookie, '/cooperative-links/partners');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.partners).toBeDefined();
  });
});
