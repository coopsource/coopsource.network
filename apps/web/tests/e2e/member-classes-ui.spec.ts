import { test, expect, type APIRequestContext } from '@playwright/test';
import { ADMIN, wp, setupCooperative, loginAs } from './helpers.js';

const API = 'http://localhost:3002/api/v1';

async function post(request: APIRequestContext, cookie: string, path: string, data: unknown) {
  return request.post(`${API}${path}`, { headers: { Cookie: cookie }, data });
}

test.describe('Member Classes Settings', () => {
  let cookie: string;
  let adminDid: string;

  test.beforeEach(async ({ page, request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
    adminDid = setup.adminDid;
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('member classes page renders with empty state', async ({ page }) => {
    await page.goto(wp('/settings/member-classes'));
    await expect(page.locator('h1', { hasText: 'Member Classes' })).toBeVisible();
    await expect(page.getByText('No member classes')).toBeVisible();
    await expect(page.getByRole('button', { name: 'New class' })).toBeVisible();
  });

  test('create member class via modal', async ({ page }) => {
    await page.goto(wp('/settings/member-classes'));
    await page.getByRole('button', { name: 'New class' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.locator('#className').fill('Worker');
    await page.locator('#classDesc').fill('Worker-owners');
    await page.locator('#voteWeight').fill('1');
    await page.locator('#boardSeats').fill('3');
    await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();

    await expect(page.getByText('Updated successfully')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('cell', { name: 'Worker', exact: true })).toBeVisible();
  });

  test('member class API lifecycle', async ({ request }) => {
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
    const listRes = await request.get(`${API}/member-classes`, {
      headers: { Cookie: cookie },
    });
    expect(listRes.status()).toBe(200);
    const list = await listRes.json();
    expect(list.classes.length).toBe(1);

    // Delete
    const delRes = await request.delete(`${API}/member-classes/${cls.id}`, {
      headers: { Cookie: cookie },
    });
    expect(delRes.status()).toBe(204);

    // Verify deleted
    const list2 = await (await request.get(`${API}/member-classes`, {
      headers: { Cookie: cookie },
    })).json();
    expect(list2.classes.length).toBe(0);
  });

  test('assign member to class via API', async ({ request }) => {
    await post(request, cookie, '/member-classes', { name: 'Producer' });

    const assignRes = await post(request, cookie, '/member-classes/assign', {
      memberDid: adminDid,
      className: 'Producer',
    });
    expect(assignRes.status()).toBe(200);
    const result = await assignRes.json();
    expect(result.memberDid).toBe(adminDid);
    expect(result.className).toBe('Producer');
  });
});
