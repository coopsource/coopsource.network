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

test.describe('Legal Documents API (E2E)', () => {
  let cookie: string;

  test.beforeEach(async ({ request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
  });

  test('full document lifecycle: create, get, version, status transitions', async ({ request }) => {
    // Create a bylaws document
    const createRes = await post(request, cookie, '/legal/documents', {
      title: 'Cooperative Bylaws',
      body: '# Article 1\n\nPurpose and objectives.',
      documentType: 'bylaws',
    });
    expect(createRes.status()).toBe(201);
    const doc = await createRes.json();
    expect(doc.title).toBe('Cooperative Bylaws');
    expect(doc.documentType).toBe('bylaws');
    expect(doc.version).toBe(1);
    expect(doc.status).toBe('draft');

    // Get by id
    const getRes = await get(request, cookie, `/legal/documents/${doc.id}`);
    expect(getRes.status()).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.id).toBe(doc.id);
    expect(fetched.body).toContain('Article 1');

    // Activate the document
    const activateRes = await request.put(`${API}/legal/documents/${doc.id}`, {
      headers: { Cookie: cookie },
      data: { status: 'active' },
    });
    expect(activateRes.status()).toBe(200);
    const activated = await activateRes.json();
    expect(activated.status).toBe('active');

    // Create a new version (should supersede the old one)
    const v2Res = await request.put(`${API}/legal/documents/${doc.id}`, {
      headers: { Cookie: cookie },
      data: { title: 'Cooperative Bylaws v2', body: '# Article 1 (Revised)\n\nUpdated purpose.' },
    });
    expect(v2Res.status()).toBe(200);
    const v2 = await v2Res.json();
    expect(v2.version).toBe(2);
    expect(v2.title).toBe('Cooperative Bylaws v2');
    expect(v2.previousVersionUri).toBeTruthy();

    // Original should now be superseded
    const supersededRes = await get(request, cookie, `/legal/documents/${doc.id}`);
    expect(supersededRes.status()).toBe(200);
    const superseded = await supersededRes.json();
    expect(superseded.status).toBe('superseded');
  });

  test('list documents with filters', async ({ request }) => {
    await post(request, cookie, '/legal/documents', {
      title: 'Bylaws', documentType: 'bylaws',
    });
    await post(request, cookie, '/legal/documents', {
      title: 'Privacy Policy', documentType: 'policy', status: 'active',
    });
    await post(request, cookie, '/legal/documents', {
      title: 'Board Resolution', documentType: 'resolution',
    });

    // List all
    const allRes = await get(request, cookie, '/legal/documents');
    expect(allRes.status()).toBe(200);
    const all = await allRes.json();
    expect(all.documents).toHaveLength(3);

    // Filter by type
    const bylawsRes = await get(request, cookie, '/legal/documents?documentType=bylaws');
    const bylaws = await bylawsRes.json();
    expect(bylaws.documents).toHaveLength(1);
    expect(bylaws.documents[0].documentType).toBe('bylaws');

    // Filter by status
    const activeRes = await get(request, cookie, '/legal/documents?status=active');
    const active = await activeRes.json();
    expect(active.documents).toHaveLength(1);
    expect(active.documents[0].title).toBe('Privacy Policy');
  });

  test('rejects invalid status transition', async ({ request }) => {
    const createRes = await post(request, cookie, '/legal/documents', {
      title: 'Test', documentType: 'policy',
    });
    const doc = await createRes.json();

    // Activate then archive
    await request.put(`${API}/legal/documents/${doc.id}`, {
      headers: { Cookie: cookie }, data: { status: 'active' },
    });
    await request.put(`${API}/legal/documents/${doc.id}`, {
      headers: { Cookie: cookie }, data: { status: 'archived' },
    });

    // Cannot go from archived back to active
    const badRes = await request.put(`${API}/legal/documents/${doc.id}`, {
      headers: { Cookie: cookie }, data: { status: 'active' },
    });
    expect(badRes.status()).toBe(409);
  });
});

test.describe('Meeting Records API (E2E)', () => {
  let cookie: string;
  let adminDid: string;

  test.beforeEach(async ({ request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
    adminDid = setup.adminDid;
  });

  test('create, list, and certify meeting records', async ({ request }) => {
    // Create a board meeting
    const createRes = await post(request, cookie, '/legal/meetings', {
      title: 'Q1 Board Meeting',
      meetingDate: '2026-03-15T14:00:00.000Z',
      meetingType: 'board',
      attendees: [adminDid],
      quorumMet: true,
      resolutions: ['Approve Q1 budget'],
      minutes: 'Meeting called to order at 2pm...',
    });
    expect(createRes.status()).toBe(201);
    const meeting = await createRes.json();
    expect(meeting.title).toBe('Q1 Board Meeting');
    expect(meeting.meetingType).toBe('board');
    expect(meeting.attendees).toContain(adminDid);
    expect(meeting.certifiedBy).toBeNull();

    // List meetings
    const listRes = await get(request, cookie, '/legal/meetings');
    expect(listRes.status()).toBe(200);
    const list = await listRes.json();
    expect(list.meetings).toHaveLength(1);

    // Certify the meeting
    const certifyRes = await post(request, cookie, `/legal/meetings/${meeting.id}/certify`, {});
    expect(certifyRes.status()).toBe(200);
    const certified = await certifyRes.json();
    expect(certified.certifiedBy).toBeTruthy();

    // Cannot certify again
    const reCertifyRes = await post(request, cookie, `/legal/meetings/${meeting.id}/certify`, {});
    expect(reCertifyRes.status()).toBe(409);
  });

  test('filter meetings by type', async ({ request }) => {
    await post(request, cookie, '/legal/meetings', {
      title: 'Board', meetingDate: '2026-01-15T10:00:00.000Z', meetingType: 'board',
    });
    await post(request, cookie, '/legal/meetings', {
      title: 'General', meetingDate: '2026-02-15T10:00:00.000Z', meetingType: 'general',
    });

    const res = await get(request, cookie, '/legal/meetings?meetingType=board');
    const body = await res.json();
    expect(body.meetings).toHaveLength(1);
    expect(body.meetings[0].meetingType).toBe('board');
  });
});

test.describe('Officer Records API (E2E)', () => {
  let cookie: string;
  let adminDid: string;

  test.beforeEach(async ({ request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
    adminDid = setup.adminDid;
  });

  test('appoint officer, list, and end term', async ({ request }) => {
    // Appoint
    const appointRes = await post(request, cookie, '/admin/officers', {
      officerDid: adminDid,
      title: 'president',
      appointedAt: '2026-01-01T00:00:00.000Z',
      termEndsAt: '2027-01-01T00:00:00.000Z',
      appointmentType: 'elected',
      responsibilities: 'Lead the cooperative',
    });
    expect(appointRes.status()).toBe(201);
    const officer = await appointRes.json();
    expect(officer.title).toBe('president');
    expect(officer.status).toBe('active');

    // List
    const listRes = await get(request, cookie, '/admin/officers');
    expect(listRes.status()).toBe(200);
    const list = await listRes.json();
    expect(list.officers).toHaveLength(1);

    // End term
    const endRes = await post(request, cookie, `/admin/officers/${officer.id}/end-term`, {});
    expect(endRes.status()).toBe(200);
    const ended = await endRes.json();
    expect(ended.status).toBe('ended');

    // Cannot end again
    const reEndRes = await post(request, cookie, `/admin/officers/${officer.id}/end-term`, {});
    expect(reEndRes.status()).toBe(409);
  });

  test('filter officers by status', async ({ request }) => {
    const o1 = await post(request, cookie, '/admin/officers', {
      officerDid: adminDid, title: 'president',
      appointedAt: '2026-01-01T00:00:00.000Z', appointmentType: 'elected',
    });
    const o2 = await post(request, cookie, '/admin/officers', {
      officerDid: adminDid, title: 'secretary',
      appointedAt: '2026-01-01T00:00:00.000Z', appointmentType: 'appointed',
    });

    // End one officer
    const o2Body = await o2.json();
    await post(request, cookie, `/admin/officers/${o2Body.id}/end-term`, {});

    const activeRes = await get(request, cookie, '/admin/officers?status=active');
    const active = await activeRes.json();
    expect(active.officers).toHaveLength(1);
    expect(active.officers[0].title).toBe('president');
  });
});

test.describe('Compliance Calendar API (E2E)', () => {
  let cookie: string;

  test.beforeEach(async ({ request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
  });

  test('create compliance item, list, and mark completed', async ({ request }) => {
    // Create
    const createRes = await post(request, cookie, '/admin/compliance', {
      title: 'Annual Report 2026',
      description: 'File annual report with state',
      dueDate: '2026-04-15T00:00:00.000Z',
      filingType: 'annual_report',
    });
    expect(createRes.status()).toBe(201);
    const item = await createRes.json();
    expect(item.title).toBe('Annual Report 2026');
    expect(item.status).toBe('pending');

    // List
    const listRes = await get(request, cookie, '/admin/compliance');
    expect(listRes.status()).toBe(200);
    const list = await listRes.json();
    expect(list.items).toHaveLength(1);

    // Mark completed
    const completeRes = await post(request, cookie, `/admin/compliance/${item.id}/complete`, {});
    expect(completeRes.status()).toBe(200);
    const completed = await completeRes.json();
    expect(completed.status).toBe('completed');
    expect(completed.completedAt).toBeTruthy();

    // Cannot complete again
    const reCompleteRes = await post(request, cookie, `/admin/compliance/${item.id}/complete`, {});
    expect(reCompleteRes.status()).toBe(409);
  });

  test('filter compliance items by status', async ({ request }) => {
    const c1 = await post(request, cookie, '/admin/compliance', {
      title: 'Pending Item', dueDate: '2027-01-01T00:00:00.000Z', filingType: 'annual_report',
    });
    const c2 = await post(request, cookie, '/admin/compliance', {
      title: 'Done Item', dueDate: '2026-06-01T00:00:00.000Z', filingType: 'tax_filing',
    });
    const c2Body = await c2.json();
    await post(request, cookie, `/admin/compliance/${c2Body.id}/complete`, {});

    const completedRes = await get(request, cookie, '/admin/compliance?status=completed');
    const completed = await completedRes.json();
    expect(completed.items).toHaveLength(1);
    expect(completed.items[0].title).toBe('Done Item');
  });
});

test.describe('Member Notices API (E2E)', () => {
  let cookie: string;

  test.beforeEach(async ({ request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
  });

  test('create and list member notices', async ({ request }) => {
    const createRes = await post(request, cookie, '/admin/notices', {
      title: 'Annual Meeting Notice',
      body: 'The annual meeting is scheduled for April 1, 2026.',
      noticeType: 'meeting',
      targetAudience: 'all',
    });
    expect(createRes.status()).toBe(201);
    const notice = await createRes.json();
    expect(notice.title).toBe('Annual Meeting Notice');
    expect(notice.noticeType).toBe('meeting');
    expect(notice.targetAudience).toBe('all');
    expect(notice.sentAt).toBeTruthy();

    const listRes = await get(request, cookie, '/admin/notices');
    expect(listRes.status()).toBe(200);
    const list = await listRes.json();
    expect(list.notices).toHaveLength(1);
  });
});

test.describe('Fiscal Periods API (E2E)', () => {
  let cookie: string;

  test.beforeEach(async ({ request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
  });

  test('create fiscal period, list, and close', async ({ request }) => {
    const createRes = await post(request, cookie, '/admin/fiscal-periods', {
      label: 'FY2026',
      startsAt: '2026-01-01T00:00:00.000Z',
      endsAt: '2026-12-31T23:59:59.999Z',
    });
    expect(createRes.status()).toBe(201);
    const period = await createRes.json();
    expect(period.label).toBe('FY2026');
    expect(period.status).toBe('open');

    // List
    const listRes = await get(request, cookie, '/admin/fiscal-periods');
    expect(listRes.status()).toBe(200);
    const list = await listRes.json();
    expect(list.fiscalPeriods).toHaveLength(1);

    // Close
    const closeRes = await post(request, cookie, `/admin/fiscal-periods/${period.id}/close`, {});
    expect(closeRes.status()).toBe(200);
    const closed = await closeRes.json();
    expect(closed.status).toBe('closed');

    // Cannot close again
    const reCloseRes = await post(request, cookie, `/admin/fiscal-periods/${period.id}/close`, {});
    expect(reCloseRes.status()).toBe(409);
  });
});
