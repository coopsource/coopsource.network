import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('Meeting Records', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  it('creates a meeting record (201)', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    const res = await testApp.agent
      .post('/api/v1/legal/meetings')
      .send({
        title: 'Q1 Board Meeting',
        meetingDate: '2026-03-15T14:00:00.000Z',
        meetingType: 'board',
        attendees: [adminDid],
        quorumMet: true,
        resolutions: ['Approve Q1 budget', 'Elect new treasurer'],
        minutes: 'Meeting called to order at 2pm...',
      })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.title).toBe('Q1 Board Meeting');
    expect(res.body.meetingType).toBe('board');
    expect(res.body.attendees).toHaveLength(1);
    expect(res.body.quorumMet).toBe(true);
    expect(res.body.resolutions).toHaveLength(2);
    expect(res.body.certifiedBy).toBeNull();
  });

  it('lists meetings', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/legal/meetings')
      .send({ title: 'Meeting 1', meetingDate: '2026-01-15T14:00:00.000Z', meetingType: 'board' })
      .expect(201);

    await testApp.agent
      .post('/api/v1/legal/meetings')
      .send({ title: 'Meeting 2', meetingDate: '2026-02-15T14:00:00.000Z', meetingType: 'general' })
      .expect(201);

    const res = await testApp.agent
      .get('/api/v1/legal/meetings')
      .expect(200);

    expect(res.body.meetings).toHaveLength(2);
    // Should be ordered by meeting_date desc
    expect(res.body.meetings[0].title).toBe('Meeting 2');
  });

  it('filters meetings by type', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/legal/meetings')
      .send({ title: 'Board', meetingDate: '2026-01-15T14:00:00.000Z', meetingType: 'board' })
      .expect(201);

    await testApp.agent
      .post('/api/v1/legal/meetings')
      .send({ title: 'General', meetingDate: '2026-02-15T14:00:00.000Z', meetingType: 'general' })
      .expect(201);

    const res = await testApp.agent
      .get('/api/v1/legal/meetings?meetingType=board')
      .expect(200);

    expect(res.body.meetings).toHaveLength(1);
    expect(res.body.meetings[0].meetingType).toBe('board');
  });

  it('certifies a meeting record', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const meeting = await testApp.agent
      .post('/api/v1/legal/meetings')
      .send({ title: 'Test Meeting', meetingDate: '2026-03-01T10:00:00.000Z', meetingType: 'board' })
      .expect(201);

    const res = await testApp.agent
      .post(`/api/v1/legal/meetings/${meeting.body.id}/certify`)
      .expect(200);

    expect(res.body.certifiedBy).toBeDefined();
  });

  it('rejects certifying an already-certified meeting', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const meeting = await testApp.agent
      .post('/api/v1/legal/meetings')
      .send({ title: 'Test Meeting', meetingDate: '2026-03-01T10:00:00.000Z', meetingType: 'board' })
      .expect(201);

    await testApp.agent
      .post(`/api/v1/legal/meetings/${meeting.body.id}/certify`)
      .expect(200);

    await testApp.agent
      .post(`/api/v1/legal/meetings/${meeting.body.id}/certify`)
      .expect(409);
  });

  it('creates a meeting with minimal fields', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const res = await testApp.agent
      .post('/api/v1/legal/meetings')
      .send({
        title: 'Quick Meeting',
        meetingDate: '2026-03-01T10:00:00.000Z',
        meetingType: 'committee',
      })
      .expect(201);

    expect(res.body.attendees).toEqual([]);
    expect(res.body.resolutions).toEqual([]);
    expect(res.body.minutes).toBeNull();
    expect(res.body.quorumMet).toBeNull();
  });
});
