import { test, expect, type APIRequestContext } from '@playwright/test';
import { setupCooperative } from './helpers.js';

const API = 'http://localhost:3002/api/v1';

/** Helper: authenticated POST */
async function post(request: APIRequestContext, cookie: string, path: string, data: unknown) {
  return request.post(`${API}${path}`, { headers: { Cookie: cookie }, data });
}

/** Helper: authenticated GET */
async function get(request: APIRequestContext, cookie: string, path: string) {
  return request.get(`${API}${path}`, { headers: { Cookie: cookie } });
}

/** Helper: authenticated DELETE */
async function del(request: APIRequestContext, cookie: string, path: string) {
  return request.delete(`${API}${path}`, { headers: { Cookie: cookie } });
}

// ---------------------------------------------------------------------------
// 1. Reports API (E2E)
// ---------------------------------------------------------------------------

test.describe('Reports API (E2E)', () => {
  let cookie: string;

  test.beforeEach(async ({ request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
  });

  test('create report template', async ({ request }) => {
    const createRes = await post(request, cookie, '/reports/templates', {
      name: 'Annual Summary Template',
      reportType: 'annual',
      config: { sections: ['finance', 'membership'] },
    });
    expect(createRes.status()).toBe(201);
    const template = await createRes.json();
    expect(template.name).toBe('Annual Summary Template');
    expect(template.reportType).toBe('annual');
    expect(template.id).toBeTruthy();
    expect(template.createdAt).toBeTruthy();
  });

  test('list report templates', async ({ request }) => {
    await post(request, cookie, '/reports/templates', {
      name: 'Template A',
      reportType: 'annual',
    });
    await post(request, cookie, '/reports/templates', {
      name: 'Template B',
      reportType: 'board_packet',
    });

    const listRes = await get(request, cookie, '/reports/templates');
    expect(listRes.status()).toBe(200);
    const result = await listRes.json();
    expect(result.items).toHaveLength(2);
    const names = result.items.map((t: { name: string }) => t.name);
    expect(names).toContain('Template A');
    expect(names).toContain('Template B');
  });

  test('delete report template', async ({ request }) => {
    const createRes = await post(request, cookie, '/reports/templates', {
      name: 'To Delete',
      reportType: 'financial',
    });
    const template = await createRes.json();

    const delRes = await del(request, cookie, `/reports/templates/${template.id}`);
    expect(delRes.status()).toBe(204);

    // Verify deletion
    const listRes = await get(request, cookie, '/reports/templates');
    const result = await listRes.json();
    const ids = result.items.map((t: { id: string }) => t.id);
    expect(ids).not.toContain(template.id);
  });

  test('generate annual report', async ({ request }) => {
    const genRes = await post(request, cookie, '/reports/generate', {
      reportType: 'annual',
      title: 'FY 2025 Annual Report',
      periodStart: '2025-01-01',
      periodEnd: '2025-12-31',
    });
    expect(genRes.status()).toBe(201);
    const report = await genRes.json();
    expect(report.title).toBe('FY 2025 Annual Report');
    expect(report.reportType).toBe('annual');
    expect(report.id).toBeTruthy();
    expect(report.generatedAt).toBeTruthy();
    expect(report.data).toBeTruthy();
    expect(report.periodStart).toBe('2025-01-01');
    expect(report.periodEnd).toBe('2025-12-31');
  });

  test('generate board packet report', async ({ request }) => {
    const genRes = await post(request, cookie, '/reports/generate', {
      reportType: 'board_packet',
      title: 'Q1 2026 Board Packet',
      periodStart: '2026-01-01',
      periodEnd: '2026-03-31',
    });
    expect(genRes.status()).toBe(201);
    const report = await genRes.json();
    expect(report.title).toBe('Q1 2026 Board Packet');
    expect(report.reportType).toBe('board_packet');
    expect(report.data).toBeTruthy();
  });

  test('list generated reports', async ({ request }) => {
    await post(request, cookie, '/reports/generate', {
      reportType: 'annual',
      title: 'Report 1',
    });
    await post(request, cookie, '/reports/generate', {
      reportType: 'financial',
      title: 'Report 2',
    });
    await post(request, cookie, '/reports/generate', {
      reportType: 'board_packet',
      title: 'Report 3',
    });

    // List all
    const allRes = await get(request, cookie, '/reports');
    expect(allRes.status()).toBe(200);
    const all = await allRes.json();
    expect(all.items).toHaveLength(3);

    // Filter by type
    const filteredRes = await get(request, cookie, '/reports?reportType=annual');
    expect(filteredRes.status()).toBe(200);
    const filtered = await filteredRes.json();
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0].reportType).toBe('annual');
  });
});

// ---------------------------------------------------------------------------
// 2. Dashboard API (E2E)
// ---------------------------------------------------------------------------

test.describe('Dashboard API (E2E)', () => {
  let cookie: string;

  test.beforeEach(async ({ request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
  });

  test('member engagement dashboard', async ({ request }) => {
    const res = await get(
      request,
      cookie,
      '/dashboards/engagement?startDate=2026-01-01&endDate=2026-03-31',
    );
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(typeof data.votingParticipation).toBe('number');
    expect(typeof data.proposalCount).toBe('number');
    expect(typeof data.agreementCount).toBe('number');
    expect(typeof data.memberCount).toBe('number');
    expect(typeof data.activeMemberCount).toBe('number');
  });

  test('financial summary dashboard', async ({ request }) => {
    const res = await get(
      request,
      cookie,
      '/dashboards/financial?startDate=2026-01-01&endDate=2026-03-31',
    );
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(typeof data.totalRevenue).toBe('number');
    expect(typeof data.totalExpenses).toBe('number');
    expect(typeof data.netIncome).toBe('number');
    expect(typeof data.pendingExpenses).toBe('number');
    expect(typeof data.approvedExpenses).toBe('number');
  });

  test('operational summary dashboard', async ({ request }) => {
    const res = await get(
      request,
      cookie,
      '/dashboards/operational?startDate=2026-01-01&endDate=2026-03-31',
    );
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(typeof data.tasksCompleted).toBe('number');
    expect(typeof data.tasksInProgress).toBe('number');
    expect(typeof data.timeLogged).toBe('number');
    expect(typeof data.upcomingCompliance).toBe('number');
    expect(typeof data.activeAgreements).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// 3. Mentions API (E2E)
// ---------------------------------------------------------------------------

test.describe('Mentions API (E2E)', () => {
  let cookie: string;

  test.beforeEach(async ({ request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
  });

  test('create mention', async ({ request }) => {
    const createRes = await post(request, cookie, '/mentions', {
      sourceType: 'proposal',
      sourceId: 'test-proposal-001',
      mentionedDid: 'did:web:example.com:alice',
    });
    expect(createRes.status()).toBe(201);
    const mention = await createRes.json();
    expect(mention.sourceType).toBe('proposal');
    expect(mention.sourceId).toBe('test-proposal-001');
    expect(mention.mentionedDid).toBe('did:web:example.com:alice');
    expect(mention.id).toBeTruthy();
    expect(mention.createdAt).toBeTruthy();
    expect(mention.readAt).toBeNull();
  });

  test('get unread mentions', async ({ request }) => {
    await post(request, cookie, '/mentions', {
      sourceType: 'proposal',
      sourceId: 'prop-1',
      mentionedDid: 'did:web:example.com:bob',
    });
    await post(request, cookie, '/mentions', {
      sourceType: 'agreement',
      sourceId: 'agr-1',
      mentionedDid: 'did:web:example.com:bob',
    });

    const listRes = await get(request, cookie, '/mentions');
    expect(listRes.status()).toBe(200);
    const result = await listRes.json();
    expect(result.items).toHaveLength(2);
    // All should be unread
    for (const mention of result.items) {
      expect(mention.readAt).toBeNull();
    }
  });

  test('mark mention as read', async ({ request }) => {
    const createRes = await post(request, cookie, '/mentions', {
      sourceType: 'post',
      sourceId: 'post-1',
      mentionedDid: 'did:web:example.com:carol',
    });
    const mention = await createRes.json();

    // Mark as read
    const readRes = await post(request, cookie, `/mentions/${mention.id}/read`, {});
    expect(readRes.status()).toBe(200);

    // Verify unread list no longer has it
    const listRes = await get(request, cookie, '/mentions');
    const result = await listRes.json();
    const ids = result.items.map((m: { id: string }) => m.id);
    expect(ids).not.toContain(mention.id);
  });

  test('mark all mentions as read', async ({ request }) => {
    await post(request, cookie, '/mentions', {
      sourceType: 'proposal',
      sourceId: 'prop-a',
      mentionedDid: 'did:web:example.com:dave',
    });
    await post(request, cookie, '/mentions', {
      sourceType: 'proposal',
      sourceId: 'prop-b',
      mentionedDid: 'did:web:example.com:dave',
    });
    await post(request, cookie, '/mentions', {
      sourceType: 'agreement',
      sourceId: 'agr-a',
      mentionedDid: 'did:web:example.com:dave',
    });

    // Mark all as read
    const markRes = await post(request, cookie, '/mentions/read-all', {});
    expect(markRes.status()).toBe(200);

    // Verify count is 0
    const countRes = await get(request, cookie, '/mentions/count');
    expect(countRes.status()).toBe(200);
    const countData = await countRes.json();
    expect(countData.count).toBe(0);
  });

  test('get unread mention count', async ({ request }) => {
    await post(request, cookie, '/mentions', {
      sourceType: 'task',
      sourceId: 'task-1',
      mentionedDid: 'did:web:example.com:eve',
    });
    await post(request, cookie, '/mentions', {
      sourceType: 'task',
      sourceId: 'task-2',
      mentionedDid: 'did:web:example.com:eve',
    });

    const countRes = await get(request, cookie, '/mentions/count');
    expect(countRes.status()).toBe(200);
    const data = await countRes.json();
    expect(data.count).toBe(2);
  });

  test('create multiple mentions', async ({ request }) => {
    const sources = [
      { sourceType: 'proposal', sourceId: 'p1', mentionedDid: 'did:web:example.com:frank' },
      { sourceType: 'agreement', sourceId: 'a1', mentionedDid: 'did:web:example.com:frank' },
      { sourceType: 'post', sourceId: 'post-1', mentionedDid: 'did:web:example.com:frank' },
      { sourceType: 'task', sourceId: 'task-1', mentionedDid: 'did:web:example.com:frank' },
    ];

    for (const src of sources) {
      const res = await post(request, cookie, '/mentions', src);
      expect(res.status()).toBe(201);
    }

    // All should be in unread
    const listRes = await get(request, cookie, '/mentions');
    const result = await listRes.json();
    expect(result.items).toHaveLength(4);

    // Verify different source types
    const types = result.items.map((m: { sourceType: string }) => m.sourceType);
    expect(types).toContain('proposal');
    expect(types).toContain('agreement');
    expect(types).toContain('post');
    expect(types).toContain('task');
  });
});
