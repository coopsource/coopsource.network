import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('Officer Records', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  it('appoints an officer (201)', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    const res = await testApp.agent
      .post('/api/v1/admin/officers')
      .send({
        officerDid: adminDid,
        title: 'president',
        appointedAt: '2026-01-01T00:00:00.000Z',
        termEndsAt: '2027-01-01T00:00:00.000Z',
        appointmentType: 'elected',
        responsibilities: 'Lead the cooperative',
      })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.officerDid).toBe(adminDid);
    expect(res.body.title).toBe('president');
    expect(res.body.appointmentType).toBe('elected');
    expect(res.body.status).toBe('active');
    expect(res.body.responsibilities).toBe('Lead the cooperative');
  });

  it('lists officers', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/admin/officers')
      .send({ officerDid: adminDid, title: 'president', appointedAt: '2026-01-01T00:00:00.000Z', appointmentType: 'elected' })
      .expect(201);

    await testApp.agent
      .post('/api/v1/admin/officers')
      .send({ officerDid: adminDid, title: 'secretary', appointedAt: '2026-01-01T00:00:00.000Z', appointmentType: 'appointed' })
      .expect(201);

    const res = await testApp.agent
      .get('/api/v1/admin/officers')
      .expect(200);

    expect(res.body.officers).toHaveLength(2);
  });

  it('ends an officer term', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    const officer = await testApp.agent
      .post('/api/v1/admin/officers')
      .send({ officerDid: adminDid, title: 'treasurer', appointedAt: '2026-01-01T00:00:00.000Z', appointmentType: 'elected' })
      .expect(201);

    const res = await testApp.agent
      .post(`/api/v1/admin/officers/${officer.body.id}/end-term`)
      .expect(200);

    expect(res.body.status).toBe('ended');
    expect(res.body.termEndsAt).toBeDefined();
  });

  it('rejects ending an already-ended term', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    const officer = await testApp.agent
      .post('/api/v1/admin/officers')
      .send({ officerDid: adminDid, title: 'director', appointedAt: '2026-01-01T00:00:00.000Z', appointmentType: 'elected' })
      .expect(201);

    await testApp.agent
      .post(`/api/v1/admin/officers/${officer.body.id}/end-term`)
      .expect(200);

    await testApp.agent
      .post(`/api/v1/admin/officers/${officer.body.id}/end-term`)
      .expect(409);
  });

  it('filters officers by status', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    const active = await testApp.agent
      .post('/api/v1/admin/officers')
      .send({ officerDid: adminDid, title: 'president', appointedAt: '2026-01-01T00:00:00.000Z', appointmentType: 'elected' })
      .expect(201);

    const ended = await testApp.agent
      .post('/api/v1/admin/officers')
      .send({ officerDid: adminDid, title: 'secretary', appointedAt: '2025-01-01T00:00:00.000Z', appointmentType: 'appointed' })
      .expect(201);

    await testApp.agent
      .post(`/api/v1/admin/officers/${ended.body.id}/end-term`)
      .expect(200);

    const res = await testApp.agent
      .get('/api/v1/admin/officers?status=active')
      .expect(200);

    expect(res.body.officers).toHaveLength(1);
    expect(res.body.officers[0].title).toBe('president');
  });

  it('gets current officers via service', async () => {
    const testApp = createTestApp();
    const { adminDid, coopDid } = await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/admin/officers')
      .send({ officerDid: adminDid, title: 'president', appointedAt: '2026-01-01T00:00:00.000Z', appointmentType: 'elected' })
      .expect(201);

    const current = await testApp.container.officerRecordService.getCurrent(coopDid);
    expect(current).toHaveLength(1);
    expect(current[0]!.title).toBe('president');
  });
});
