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

/** Helper: authenticated PUT */
async function put(request: APIRequestContext, cookie: string, path: string, data: unknown) {
  return request.put(`${API}${path}`, { headers: { Cookie: cookie }, data });
}

/** Helper: authenticated DELETE */
async function del(request: APIRequestContext, cookie: string, path: string) {
  return request.delete(`${API}${path}`, { headers: { Cookie: cookie } });
}

/** Helper: unauthenticated GET (for public endpoints) */
async function publicGet(request: APIRequestContext, path: string) {
  return request.get(`${API}${path}`);
}

// ---------------------------------------------------------------------------
// 1. Commerce Listings API (E2E)
// ---------------------------------------------------------------------------

test.describe('Commerce Listings API (E2E)', () => {
  let cookie: string;

  test.beforeEach(async ({ request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
  });

  test('full listing lifecycle: create, get, update, archive', async ({ request }) => {
    // Create
    const createRes = await post(request, cookie, '/commerce/listings', {
      title: 'Web Development Services',
      description: 'Full-stack web development for cooperatives',
      category: 'services',
      availability: 'available',
      location: 'Remote',
      tags: ['web', 'development'],
    });
    expect(createRes.status()).toBe(201);
    const listing = await createRes.json();
    expect(listing.title).toBe('Web Development Services');
    expect(listing.category).toBe('services');
    expect(listing.status).toBe('active');
    expect(listing.tags).toEqual(['web', 'development']);

    // Get
    const getRes = await get(request, cookie, `/commerce/listings/${listing.id}`);
    expect(getRes.status()).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.id).toBe(listing.id);
    expect(fetched.title).toBe('Web Development Services');

    // Update category
    const updateRes = await put(request, cookie, `/commerce/listings/${listing.id}`, {
      category: 'consulting',
    });
    expect(updateRes.status()).toBe(200);
    const updated = await updateRes.json();
    expect(updated.category).toBe('consulting');

    // Archive (soft delete)
    const archiveRes = await del(request, cookie, `/commerce/listings/${listing.id}`);
    expect(archiveRes.status()).toBe(204);
  });

  test('list and filter listings', async ({ request }) => {
    await post(request, cookie, '/commerce/listings', {
      title: 'Design Services',
      category: 'services',
    });
    await post(request, cookie, '/commerce/listings', {
      title: 'Organic Produce',
      category: 'goods',
    });
    await post(request, cookie, '/commerce/listings', {
      title: 'Consulting',
      category: 'services',
    });

    // List all
    const allRes = await get(request, cookie, '/commerce/listings');
    expect(allRes.status()).toBe(200);
    const all = await allRes.json();
    expect(all.listings).toHaveLength(3);

    // Filter by category
    const servicesRes = await get(request, cookie, '/commerce/listings?category=services');
    const services = await servicesRes.json();
    expect(services.listings).toHaveLength(2);
  });

  test('search public listings', async ({ request }) => {
    await post(request, cookie, '/commerce/listings', {
      title: 'Bakery Products',
      category: 'food',
      location: 'Portland',
    });
    await post(request, cookie, '/commerce/listings', {
      title: 'IT Support',
      category: 'services',
      location: 'Remote',
    });

    // Public search by category
    const searchRes = await publicGet(request, '/commerce/listings/search?category=food');
    expect(searchRes.status()).toBe(200);
    const results = await searchRes.json();
    expect(results.listings).toHaveLength(1);
    expect(results.listings[0].category).toBe('food');
  });

  test('duplicate title is allowed', async ({ request }) => {
    const res1 = await post(request, cookie, '/commerce/listings', {
      title: 'Same Title Listing',
      category: 'services',
    });
    expect(res1.status()).toBe(201);

    const res2 = await post(request, cookie, '/commerce/listings', {
      title: 'Same Title Listing',
      category: 'goods',
    });
    expect(res2.status()).toBe(201);

    const listing1 = await res1.json();
    const listing2 = await res2.json();
    expect(listing1.id).not.toBe(listing2.id);
    expect(listing1.title).toBe(listing2.title);
  });
});

// ---------------------------------------------------------------------------
// 2. Commerce Needs API (E2E)
// ---------------------------------------------------------------------------

test.describe('Commerce Needs API (E2E)', () => {
  let cookie: string;

  test.beforeEach(async ({ request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
  });

  test('full need lifecycle: create, get, update, cancel', async ({ request }) => {
    // Create
    const createRes = await post(request, cookie, '/commerce/needs', {
      title: 'Need bulk office supplies',
      description: 'Looking for a cooperative supplier of office supplies',
      category: 'supplies',
      urgency: 'normal',
      location: 'Seattle',
    });
    expect(createRes.status()).toBe(201);
    const need = await createRes.json();
    expect(need.title).toBe('Need bulk office supplies');
    expect(need.urgency).toBe('normal');
    expect(need.status).toBe('open');

    // Get
    const getRes = await get(request, cookie, `/commerce/needs/${need.id}`);
    expect(getRes.status()).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.id).toBe(need.id);

    // Update urgency
    const updateRes = await put(request, cookie, `/commerce/needs/${need.id}`, {
      urgency: 'high',
    });
    expect(updateRes.status()).toBe(200);
    const updated = await updateRes.json();
    expect(updated.urgency).toBe('high');

    // Cancel (soft delete)
    const cancelRes = await del(request, cookie, `/commerce/needs/${need.id}`);
    expect(cancelRes.status()).toBe(204);
  });

  test('list and filter needs', async ({ request }) => {
    await post(request, cookie, '/commerce/needs', {
      title: 'Urgent: Need server hosting',
      category: 'tech',
      urgency: 'high',
    });
    await post(request, cookie, '/commerce/needs', {
      title: 'Looking for designer',
      category: 'services',
      urgency: 'low',
    });
    await post(request, cookie, '/commerce/needs', {
      title: 'Need accounting help',
      category: 'services',
      urgency: 'normal',
    });

    // List all
    const allRes = await get(request, cookie, '/commerce/needs');
    expect(allRes.status()).toBe(200);
    const all = await allRes.json();
    expect(all.needs).toHaveLength(3);

    // Filter by urgency
    const highRes = await get(request, cookie, '/commerce/needs?urgency=high');
    const high = await highRes.json();
    expect(high.needs).toHaveLength(1);
    expect(high.needs[0].urgency).toBe('high');
  });

  test('search public needs', async ({ request }) => {
    await post(request, cookie, '/commerce/needs', {
      title: 'Need legal counsel',
      category: 'legal',
      urgency: 'high',
    });
    await post(request, cookie, '/commerce/needs', {
      title: 'Need marketing help',
      category: 'marketing',
      urgency: 'low',
    });

    // Public search by category
    const searchRes = await publicGet(request, '/commerce/needs/search?category=legal');
    expect(searchRes.status()).toBe(200);
    const results = await searchRes.json();
    expect(results.needs).toHaveLength(1);
    expect(results.needs[0].category).toBe('legal');
  });
});

// ---------------------------------------------------------------------------
// 3. Inter-Coop Agreements API (E2E)
// ---------------------------------------------------------------------------

test.describe('Inter-Coop Agreements API (E2E)', () => {
  let cookie: string;

  test.beforeEach(async ({ request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
  });

  test('create and get agreement', async ({ request }) => {
    const createRes = await post(request, cookie, '/commerce/agreements', {
      responderDid: 'did:web:partner-coop.example',
      title: 'Joint Marketing Agreement',
      description: 'Cross-promotion partnership',
      agreementType: 'other',
      terms: { duration: '12 months', scope: 'regional' },
    });
    expect(createRes.status()).toBe(201);
    const agreement = await createRes.json();
    expect(agreement.title).toBe('Joint Marketing Agreement');
    expect(agreement.status).toBe('proposed');
    expect(agreement.agreementType).toBe('other');

    // Get
    const getRes = await get(request, cookie, `/commerce/agreements/${agreement.id}`);
    expect(getRes.status()).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.id).toBe(agreement.id);
    expect(fetched.status).toBe('proposed');
  });

  test('accept agreement', async ({ request }) => {
    const createRes = await post(request, cookie, '/commerce/agreements', {
      responderDid: 'did:web:partner-coop.example',
      title: 'Supply Agreement',
      agreementType: 'supply',
    });
    const agreement = await createRes.json();

    // Accept
    const acceptRes = await post(request, cookie, `/commerce/agreements/${agreement.id}/respond`, {
      accept: true,
    });
    expect(acceptRes.status()).toBe(200);
    const accepted = await acceptRes.json();
    expect(accepted.status).toBe('active');
  });

  test('reject agreement', async ({ request }) => {
    const createRes = await post(request, cookie, '/commerce/agreements', {
      responderDid: 'did:web:partner-coop.example',
      title: 'Bad Deal Agreement',
      agreementType: 'other',
    });
    const agreement = await createRes.json();

    // Reject
    const rejectRes = await post(request, cookie, `/commerce/agreements/${agreement.id}/respond`, {
      accept: false,
    });
    expect(rejectRes.status()).toBe(200);
    const rejected = await rejectRes.json();
    expect(rejected.status).toBe('cancelled');
  });

  test('complete agreement', async ({ request }) => {
    const createRes = await post(request, cookie, '/commerce/agreements', {
      responderDid: 'did:web:partner-coop.example',
      title: 'Short Term Contract',
      agreementType: 'service',
    });
    const agreement = await createRes.json();

    // Accept first
    await post(request, cookie, `/commerce/agreements/${agreement.id}/respond`, {
      accept: true,
    });

    // Complete
    const completeRes = await post(
      request,
      cookie,
      `/commerce/agreements/${agreement.id}/complete`,
    );
    expect(completeRes.status()).toBe(200);
    const completed = await completeRes.json();
    expect(completed.status).toBe('completed');
  });

  test('list agreements with filters', async ({ request }) => {
    // Create multiple agreements
    const res1 = await post(request, cookie, '/commerce/agreements', {
      responderDid: 'did:web:coop-a.example',
      title: 'Agreement A',
      agreementType: 'other',
    });
    const a1 = await res1.json();

    await post(request, cookie, '/commerce/agreements', {
      responderDid: 'did:web:coop-b.example',
      title: 'Agreement B',
      agreementType: 'supply',
    });

    // Accept first agreement to change its status
    await post(request, cookie, `/commerce/agreements/${a1.id}/respond`, {
      accept: true,
    });

    // List all
    const allRes = await get(request, cookie, '/commerce/agreements');
    expect(allRes.status()).toBe(200);
    const all = await allRes.json();
    expect(all.agreements).toHaveLength(2);

    // Filter by status
    const activeRes = await get(request, cookie, '/commerce/agreements?status=active');
    const active = await activeRes.json();
    expect(active.agreements).toHaveLength(1);
    expect(active.agreements[0].title).toBe('Agreement A');

    const proposedRes = await get(request, cookie, '/commerce/agreements?status=proposed');
    const proposed = await proposedRes.json();
    expect(proposed.agreements).toHaveLength(1);
    expect(proposed.agreements[0].title).toBe('Agreement B');
  });
});

// ---------------------------------------------------------------------------
// 4. Collaborative Projects API (E2E)
// ---------------------------------------------------------------------------

test.describe('Collaborative Projects API (E2E)', () => {
  let cookie: string;

  test.beforeEach(async ({ request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
  });

  test('create and get project', async ({ request }) => {
    const createRes = await post(request, cookie, '/commerce/projects', {
      title: 'Community Garden App',
      description: 'A shared app for managing community gardens',
      participantDids: ['did:web:coop-a.example', 'did:web:coop-b.example'],
      revenueSplit: { 'host': 50, 'coop-a': 25, 'coop-b': 25 },
    });
    expect(createRes.status()).toBe(201);
    const project = await createRes.json();
    expect(project.title).toBe('Community Garden App');
    expect(project.status).toBe('active');
    expect(project.participantDids).toEqual(['did:web:coop-a.example', 'did:web:coop-b.example']);
    expect(project.revenueSplit).toBeTruthy();

    // Get with contributions
    const getRes = await get(request, cookie, `/commerce/projects/${project.id}`);
    expect(getRes.status()).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.id).toBe(project.id);
    expect(fetched.contributions).toBeDefined();
    expect(fetched.contributions).toHaveLength(0);
  });

  test('record contribution', async ({ request }) => {
    const createRes = await post(request, cookie, '/commerce/projects', {
      title: 'Shared Infrastructure',
      description: 'Co-hosting infrastructure project',
      participantDids: ['did:web:coop-a.example'],
    });
    const project = await createRes.json();

    // Record contribution
    const periodStart = new Date(Date.now() - 7 * 86400000).toISOString();
    const periodEnd = new Date().toISOString();
    const contribRes = await post(
      request,
      cookie,
      `/commerce/projects/${project.id}/contributions`,
      {
        cooperativeDid: 'did:web:coop-a.example',
        hoursContributed: 40,
        revenueEarned: 2000,
        expenseIncurred: 500,
        periodStart,
        periodEnd,
      },
    );
    expect(contribRes.status()).toBe(201);
    const contribution = await contribRes.json();
    expect(contribution.hoursContributed).toBe(40);
    expect(contribution.revenueEarned).toBe(2000);
    expect(contribution.expenseIncurred).toBe(500);
    expect(contribution.projectId).toBe(project.id);

    // Verify contribution shows up in project detail
    const getRes = await get(request, cookie, `/commerce/projects/${project.id}`);
    const fetched = await getRes.json();
    expect(fetched.contributions).toHaveLength(1);
  });

  test('list projects', async ({ request }) => {
    await post(request, cookie, '/commerce/projects', {
      title: 'Project Alpha',
      description: 'First project',
      participantDids: ['did:web:participant.example'],
    });
    await post(request, cookie, '/commerce/projects', {
      title: 'Project Beta',
      description: 'Second project',
      participantDids: ['did:web:participant.example'],
    });

    const allRes = await get(request, cookie, '/commerce/projects');
    expect(allRes.status()).toBe(200);
    const all = await allRes.json();
    expect(all.projects).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 5. Shared Resources API (E2E)
// ---------------------------------------------------------------------------

test.describe('Shared Resources API (E2E)', () => {
  let cookie: string;

  test.beforeEach(async ({ request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
  });

  test('create and list resources', async ({ request }) => {
    const res1 = await post(request, cookie, '/commerce/resources', {
      title: 'Conference Room A',
      description: 'Large meeting room with projector',
      resourceType: 'space',
      location: 'Downtown Office',
      costPerUnit: 50,
      costUnit: 'hour',
    });
    expect(res1.status()).toBe(201);
    const resource1 = await res1.json();
    expect(resource1.title).toBe('Conference Room A');
    expect(resource1.resourceType).toBe('space');
    expect(resource1.costPerUnit).toBe(50);

    await post(request, cookie, '/commerce/resources', {
      title: '3D Printer',
      description: 'Industrial 3D printer for prototyping',
      resourceType: 'equipment',
      location: 'Maker Space',
    });

    // List
    const listRes = await get(request, cookie, '/commerce/resources');
    expect(listRes.status()).toBe(200);
    const list = await listRes.json();
    expect(list.resources).toHaveLength(2);
  });

  test('book a resource', async ({ request }) => {
    // Create resource
    const createRes = await post(request, cookie, '/commerce/resources', {
      title: 'Van',
      description: 'Cargo van for deliveries',
      resourceType: 'vehicle',
      costPerUnit: 100,
      costUnit: 'day',
    });
    const resource = await createRes.json();

    // Create booking
    const startsAt = new Date(Date.now() + 86400000).toISOString();
    const endsAt = new Date(Date.now() + 172800000).toISOString();
    const bookingRes = await post(
      request,
      cookie,
      `/commerce/resources/${resource.id}/bookings`,
      {
        startsAt,
        endsAt,
        purpose: 'Delivery run to partner cooperative',
      },
    );
    expect(bookingRes.status()).toBe(201);
    const booking = await bookingRes.json();
    expect(booking.resourceId).toBe(resource.id);
    expect(booking.purpose).toBe('Delivery run to partner cooperative');
    expect(booking.status).toBe('pending');

    // List bookings
    const listRes = await get(request, cookie, '/commerce/bookings');
    expect(listRes.status()).toBe(200);
    const list = await listRes.json();
    expect(list.bookings).toHaveLength(1);
  });

  test('search public resources', async ({ request }) => {
    await post(request, cookie, '/commerce/resources', {
      title: 'Workshop Space',
      resourceType: 'space',
      location: 'Brooklyn',
    });
    await post(request, cookie, '/commerce/resources', {
      title: 'CNC Machine',
      resourceType: 'equipment',
      location: 'Queens',
    });

    // Public search by resource type
    const searchRes = await publicGet(request, '/commerce/resources/search?resourceType=space');
    expect(searchRes.status()).toBe(200);
    const results = await searchRes.json();
    expect(results.resources).toHaveLength(1);
    expect(results.resources[0].resourceType).toBe('space');
  });

  test('review booking: approve', async ({ request }) => {
    // Create resource and booking
    const createRes = await post(request, cookie, '/commerce/resources', {
      title: 'Meeting Room',
      resourceType: 'space',
    });
    const resource = await createRes.json();

    const startsAt = new Date(Date.now() + 86400000).toISOString();
    const endsAt = new Date(Date.now() + 90000000).toISOString();
    const bookingRes = await post(
      request,
      cookie,
      `/commerce/resources/${resource.id}/bookings`,
      {
        startsAt,
        endsAt,
        purpose: 'Team standup',
      },
    );
    const booking = await bookingRes.json();

    // Approve
    const approveRes = await post(request, cookie, `/commerce/bookings/${booking.id}/review`, {
      action: 'approve',
    });
    expect(approveRes.status()).toBe(200);
    const approved = await approveRes.json();
    expect(approved.status).toBe('approved');
    expect(approved.approvedBy).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 6. Connector Framework API (E2E)
// ---------------------------------------------------------------------------

test.describe('Connector Framework API (E2E)', () => {
  let cookie: string;

  test.beforeEach(async ({ request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
  });

  test('connector config lifecycle', async ({ request }) => {
    // Create
    const createRes = await post(request, cookie, '/connectors/configs', {
      connectorType: 'loomio',
      displayName: 'Loomio Integration',
      config: { apiUrl: 'https://loomio.example.com', apiKey: 'test-key' },
    });
    expect(createRes.status()).toBe(201);
    const config = await createRes.json();
    expect(config.connectorType).toBe('loomio');
    expect(config.displayName).toBe('Loomio Integration');
    expect(config.enabled).toBe(true);

    // List
    const listRes = await get(request, cookie, '/connectors/configs');
    expect(listRes.status()).toBe(200);
    const list = await listRes.json();
    expect(list.configs).toHaveLength(1);

    // Delete
    const delRes = await del(request, cookie, `/connectors/configs/${config.id}`);
    expect(delRes.status()).toBe(204);

    // Confirm deletion
    const listRes2 = await get(request, cookie, '/connectors/configs');
    const list2 = await listRes2.json();
    expect(list2.configs).toHaveLength(0);
  });

  test('update connector config', async ({ request }) => {
    const createRes = await post(request, cookie, '/connectors/configs', {
      connectorType: 'odoo',
      displayName: 'Odoo ERP',
      config: { url: 'https://odoo.example.com' },
    });
    const config = await createRes.json();

    const updateRes = await put(request, cookie, `/connectors/configs/${config.id}`, {
      displayName: 'Odoo ERP (Production)',
      enabled: false,
    });
    expect(updateRes.status()).toBe(200);
    const updated = await updateRes.json();
    expect(updated.displayName).toBe('Odoo ERP (Production)');
    expect(updated.enabled).toBe(false);
  });

  test('field mapping lifecycle', async ({ request }) => {
    // Create connector first
    const configRes = await post(request, cookie, '/connectors/configs', {
      connectorType: 'open_collective',
      displayName: 'Open Collective',
      config: { slug: 'my-coop' },
    });
    const config = await configRes.json();

    // Add field mapping
    const mapRes = await post(request, cookie, `/connectors/configs/${config.id}/mappings`, {
      localField: 'member.email',
      remoteField: 'backer.email',
      transform: 'lowercase',
    });
    expect(mapRes.status()).toBe(201);
    const mapping = await mapRes.json();
    expect(mapping.localField).toBe('member.email');
    expect(mapping.remoteField).toBe('backer.email');

    // List mappings
    const listRes = await get(request, cookie, `/connectors/configs/${config.id}/mappings`);
    expect(listRes.status()).toBe(200);
    const list = await listRes.json();
    expect(list.mappings).toHaveLength(1);

    // Delete mapping
    const delRes = await del(request, cookie, `/connectors/mappings/${mapping.id}`);
    expect(delRes.status()).toBe(204);
  });

  test('trigger sync and view sync logs', async ({ request }) => {
    // Create connector
    const configRes = await post(request, cookie, '/connectors/configs', {
      connectorType: 'loomio',
      displayName: 'Loomio Sync',
      config: {},
    });
    const config = await configRes.json();

    // Trigger sync
    const syncRes = await post(request, cookie, `/connectors/configs/${config.id}/sync`, {
      direction: 'outbound',
    });
    expect(syncRes.status()).toBe(201);
    const syncLog = await syncRes.json();
    expect(syncLog.direction).toBe('outbound');
    expect(syncLog.connectorConfigId).toBe(config.id);

    // List sync logs
    const logsRes = await get(request, cookie, `/connectors/configs/${config.id}/sync-logs`);
    expect(logsRes.status()).toBe(200);
    const logs = await logsRes.json();
    expect(logs.syncLogs).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 7. Webhook Endpoints API (E2E)
// ---------------------------------------------------------------------------

test.describe('Webhook Endpoints API (E2E)', () => {
  let cookie: string;

  test.beforeEach(async ({ request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
  });

  test('webhook endpoint lifecycle', async ({ request }) => {
    // Create
    const createRes = await post(request, cookie, '/webhooks/endpoints', {
      url: 'https://hooks.example.com/coop-events',
      eventTypes: ['membership.created', 'proposal.passed'],
      secret: 'test-secret-key-minimum-16-chars',
    });
    expect(createRes.status()).toBe(201);
    const endpoint = await createRes.json();
    expect(endpoint.url).toBe('https://hooks.example.com/coop-events');
    expect(endpoint.eventTypes).toEqual(['membership.created', 'proposal.passed']);
    expect(endpoint.enabled).toBe(true);

    // List
    const listRes = await get(request, cookie, '/webhooks/endpoints');
    expect(listRes.status()).toBe(200);
    const list = await listRes.json();
    expect(list.endpoints).toHaveLength(1);

    // Delete
    const delRes = await del(request, cookie, `/webhooks/endpoints/${endpoint.id}`);
    expect(delRes.status()).toBe(204);

    // Confirm deletion
    const listRes2 = await get(request, cookie, '/webhooks/endpoints');
    const list2 = await listRes2.json();
    expect(list2.endpoints).toHaveLength(0);
  });

  test('update webhook endpoint', async ({ request }) => {
    const createRes = await post(request, cookie, '/webhooks/endpoints', {
      url: 'https://hooks.example.com/v1',
      eventTypes: ['membership.created'],
      secret: 'test-secret-key-minimum-16-chars',
    });
    const endpoint = await createRes.json();

    const updateRes = await put(request, cookie, `/webhooks/endpoints/${endpoint.id}`, {
      url: 'https://hooks.example.com/v2',
      eventTypes: ['membership.created', 'membership.revoked'],
      enabled: false,
    });
    expect(updateRes.status()).toBe(200);
    const updated = await updateRes.json();
    expect(updated.url).toBe('https://hooks.example.com/v2');
    expect(updated.eventTypes).toContain('membership.revoked');
    expect(updated.enabled).toBe(false);
  });

  test('event catalog', async ({ request }) => {
    const catalogRes = await get(request, cookie, '/webhooks/events');
    expect(catalogRes.status()).toBe(200);
    const catalog = await catalogRes.json();
    expect(catalog.events).toBeDefined();
    expect(Array.isArray(catalog.events)).toBe(true);
    expect(catalog.events.length).toBeGreaterThan(0);
  });

  test('delivery logs for endpoint', async ({ request }) => {
    const createRes = await post(request, cookie, '/webhooks/endpoints', {
      url: 'https://hooks.example.com/logs-test',
      eventTypes: ['proposal.created'],
      secret: 'test-secret-key-minimum-16-chars',
    });
    const endpoint = await createRes.json();

    // Delivery logs should be empty initially
    const logsRes = await get(request, cookie, `/webhooks/endpoints/${endpoint.id}/deliveries`);
    expect(logsRes.status()).toBe(200);
    const logs = await logsRes.json();
    expect(logs.deliveries).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 8. Procurement API (E2E)
// ---------------------------------------------------------------------------

test.describe('Procurement API (E2E)', () => {
  let cookie: string;

  test.beforeEach(async ({ request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
  });

  test('procurement group with demands', async ({ request }) => {
    const deadline = new Date(Date.now() + 30 * 86400000).toISOString();

    // Create group
    const createRes = await post(request, cookie, '/commerce/procurement', {
      title: 'Bulk Paper Order',
      description: 'Joint procurement of recycled paper',
      category: 'office-supplies',
      targetQuantity: 1000,
      deadline,
    });
    expect(createRes.status()).toBe(201);
    const group = await createRes.json();
    expect(group.title).toBe('Bulk Paper Order');
    expect(group.category).toBe('office-supplies');
    expect(group.targetQuantity).toBe(1000);
    expect(group.status).toBe('open');

    // Add demand
    const demandRes = await post(request, cookie, `/commerce/procurement/${group.id}/demand`, {
      quantity: 250,
      notes: 'Need A4 and A3 sizes',
    });
    expect(demandRes.status()).toBe(201);
    const demand = await demandRes.json();
    expect(demand.quantity).toBe(250);
    expect(demand.groupId).toBe(group.id);

    // Get group with aggregation
    const getRes = await get(request, cookie, `/commerce/procurement/${group.id}`);
    expect(getRes.status()).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.totalQuantity).toBe(250);
    expect(fetched.demandCount).toBe(1);
  });

  test('list procurement groups', async ({ request }) => {
    const deadline = new Date(Date.now() + 30 * 86400000).toISOString();

    await post(request, cookie, '/commerce/procurement', {
      title: 'Laptop Bulk Order',
      category: 'electronics',
      targetQuantity: 50,
      deadline,
    });
    await post(request, cookie, '/commerce/procurement', {
      title: 'Coffee Beans Order',
      category: 'food',
      targetQuantity: 200,
      deadline,
    });

    // List all
    const allRes = await get(request, cookie, '/commerce/procurement');
    expect(allRes.status()).toBe(200);
    const all = await allRes.json();
    expect(all.groups).toHaveLength(2);

    // Filter by category
    const foodRes = await get(request, cookie, '/commerce/procurement?category=food');
    const food = await foodRes.json();
    expect(food.groups).toHaveLength(1);
    expect(food.groups[0].title).toBe('Coffee Beans Order');
  });

  test('list demands for a procurement group', async ({ request }) => {
    const deadline = new Date(Date.now() + 30 * 86400000).toISOString();

    const createRes = await post(request, cookie, '/commerce/procurement', {
      title: 'Multi-Demand Group',
      category: 'misc',
      targetQuantity: 500,
      deadline,
    });
    const group = await createRes.json();

    // Add two demands
    await post(request, cookie, `/commerce/procurement/${group.id}/demand`, {
      quantity: 100,
      notes: 'First demand',
    });
    await post(request, cookie, `/commerce/procurement/${group.id}/demand`, {
      quantity: 150,
      notes: 'Second demand',
    });

    // List demands
    const demandsRes = await get(request, cookie, `/commerce/procurement/${group.id}/demands`);
    expect(demandsRes.status()).toBe(200);
    const demands = await demandsRes.json();
    expect(demands.demands).toHaveLength(2);
  });

  test('remove demand from procurement group', async ({ request }) => {
    const deadline = new Date(Date.now() + 30 * 86400000).toISOString();

    const createRes = await post(request, cookie, '/commerce/procurement', {
      title: 'Removable Demand Group',
      category: 'misc',
      targetQuantity: 100,
      deadline,
    });
    const group = await createRes.json();

    // Add demand
    await post(request, cookie, `/commerce/procurement/${group.id}/demand`, {
      quantity: 50,
    });

    // Remove demand
    const removeRes = await del(request, cookie, `/commerce/procurement/${group.id}/demand`);
    expect(removeRes.status()).toBe(204);

    // Verify demand count is 0
    const getRes = await get(request, cookie, `/commerce/procurement/${group.id}`);
    const fetched = await getRes.json();
    expect(fetched.demandCount).toBe(0);
    expect(fetched.totalQuantity).toBe(0);
  });
});
