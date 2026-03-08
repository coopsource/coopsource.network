import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';

describe('Onboarding API', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  // ─── Config CRUD ────────────────────────────────────────────────────

  it('creates onboarding config (201)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const res = await testApp.agent
      .post('/api/v1/onboarding/config')
      .send({
        probationDurationDays: 60,
        requireTraining: true,
        requireBuyIn: true,
        buyInAmount: 500,
        buddySystemEnabled: true,
        milestones: [
          { name: 'Orientation', description: 'Attend orientation', order: 0 },
          { name: 'Shadow', description: 'Shadow a member', order: 1 },
        ],
      })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.probationDurationDays).toBe(60);
    expect(res.body.requireTraining).toBe(true);
    expect(res.body.requireBuyIn).toBe(true);
    expect(res.body.buyInAmount).toBe(500);
    expect(res.body.buddySystemEnabled).toBe(true);
    expect(res.body.milestones).toHaveLength(2);
  });

  it('gets onboarding config (200)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/onboarding/config')
      .send({ probationDurationDays: 30 })
      .expect(201);

    const res = await testApp.agent
      .get('/api/v1/onboarding/config')
      .expect(200);

    expect(res.body.probationDurationDays).toBe(30);
  });

  it('returns null when no config exists (200)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    const res = await testApp.agent
      .get('/api/v1/onboarding/config')
      .expect(200);

    expect(res.body).toBeNull();
  });

  it('updates onboarding config (200)', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/onboarding/config')
      .send({ probationDurationDays: 90 })
      .expect(201);

    const res = await testApp.agent
      .put('/api/v1/onboarding/config')
      .send({ probationDurationDays: 45, requireTraining: true })
      .expect(200);

    expect(res.body.probationDurationDays).toBe(45);
    expect(res.body.requireTraining).toBe(true);
  });

  // ─── Onboarding Progress ────────────────────────────────────────────

  it('starts onboarding for a member (201)', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/onboarding/config')
      .send({ probationDurationDays: 30 })
      .expect(201);

    const res = await testApp.agent
      .post('/api/v1/onboarding/start')
      .send({ memberDid: adminDid })
      .expect(201);

    expect(res.body.memberDid).toBe(adminDid);
    expect(res.body.status).toBe('in_progress');
    expect(res.body.probationStartsAt).toBeDefined();
    expect(res.body.probationEndsAt).toBeDefined();
  });

  it('calculates probation end date from config', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/onboarding/config')
      .send({ probationDurationDays: 60 })
      .expect(201);

    const res = await testApp.agent
      .post('/api/v1/onboarding/start')
      .send({ memberDid: adminDid })
      .expect(201);

    const start = new Date(res.body.probationStartsAt);
    const end = new Date(res.body.probationEndsAt);
    const diffDays = Math.round(
      (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
    );
    expect(diffDays).toBe(60);
  });

  it('completes training (200)', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/onboarding/config')
      .send({ probationDurationDays: 30 })
      .expect(201);

    await testApp.agent
      .post('/api/v1/onboarding/start')
      .send({ memberDid: adminDid })
      .expect(201);

    const res = await testApp.agent
      .post('/api/v1/onboarding/training/complete')
      .send({ memberDid: adminDid })
      .expect(200);

    expect(res.body.trainingCompleted).toBe(true);
    expect(res.body.trainingCompletedAt).toBeDefined();
  });

  it('completes buy-in (200)', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/onboarding/config')
      .send({ probationDurationDays: 30 })
      .expect(201);

    await testApp.agent
      .post('/api/v1/onboarding/start')
      .send({ memberDid: adminDid })
      .expect(201);

    const res = await testApp.agent
      .post('/api/v1/onboarding/buy-in/complete')
      .send({ memberDid: adminDid })
      .expect(200);

    expect(res.body.buyInCompleted).toBe(true);
    expect(res.body.buyInCompletedAt).toBeDefined();
  });

  it('completes milestone (200)', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/onboarding/config')
      .send({
        probationDurationDays: 30,
        milestones: [{ name: 'Orientation', description: 'Attend', order: 0 }],
      })
      .expect(201);

    await testApp.agent
      .post('/api/v1/onboarding/start')
      .send({ memberDid: adminDid })
      .expect(201);

    const res = await testApp.agent
      .post('/api/v1/onboarding/milestone/complete')
      .send({ memberDid: adminDid, milestoneName: 'Orientation' })
      .expect(200);

    expect(res.body.milestonesCompleted).toContain('Orientation');
  });

  it('assigns buddy (200)', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/onboarding/config')
      .send({ probationDurationDays: 30, buddySystemEnabled: true })
      .expect(201);

    await testApp.agent
      .post('/api/v1/onboarding/start')
      .send({ memberDid: adminDid })
      .expect(201);

    const res = await testApp.agent
      .post('/api/v1/onboarding/buddy/assign')
      .send({ memberDid: adminDid, buddyDid: 'did:web:buddy.example.com' })
      .expect(200);

    expect(res.body.buddyDid).toBe('did:web:buddy.example.com');
  });

  // ─── Reviews ────────────────────────────────────────────────────────

  it('creates and lists reviews (201/200)', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/onboarding/config')
      .send({ probationDurationDays: 30 })
      .expect(201);

    await testApp.agent
      .post('/api/v1/onboarding/start')
      .send({ memberDid: adminDid })
      .expect(201);

    const reviewRes = await testApp.agent
      .post('/api/v1/onboarding/review')
      .send({
        memberDid: adminDid,
        reviewType: 'periodic',
        outcome: 'pass',
        comments: 'Good progress',
      })
      .expect(201);

    expect(reviewRes.body.reviewType).toBe('periodic');
    expect(reviewRes.body.outcome).toBe('pass');
    expect(reviewRes.body.comments).toBe('Good progress');

    const listRes = await testApp.agent
      .get(`/api/v1/onboarding/reviews/${encodeURIComponent(adminDid)}`)
      .expect(200);

    expect(listRes.body.reviews).toHaveLength(1);
  });

  // ─── Completion ─────────────────────────────────────────────────────

  it('auto-completes onboarding when all requirements met (200)', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/onboarding/config')
      .send({
        probationDurationDays: 30,
        requireTraining: true,
        requireBuyIn: true,
        milestones: [{ name: 'Orientation', description: 'Attend', order: 0 }],
      })
      .expect(201);

    await testApp.agent
      .post('/api/v1/onboarding/start')
      .send({ memberDid: adminDid })
      .expect(201);

    // Complete all requirements — auto-completion should fire after last one
    await testApp.agent
      .post('/api/v1/onboarding/training/complete')
      .send({ memberDid: adminDid })
      .expect(200);

    await testApp.agent
      .post('/api/v1/onboarding/buy-in/complete')
      .send({ memberDid: adminDid })
      .expect(200);

    await testApp.agent
      .post('/api/v1/onboarding/milestone/complete')
      .send({ memberDid: adminDid, milestoneName: 'Orientation' })
      .expect(200);

    // Verify auto-completion happened
    const res = await testApp.agent
      .get(`/api/v1/onboarding/progress/${encodeURIComponent(adminDid)}`)
      .expect(200);

    expect(res.body.status).toBe('completed');
    expect(res.body.completedAt).toBeDefined();
  });

  it('completes onboarding explicitly when no auto-complete requirements (200)', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    // Config with no training, no buy-in, no milestones
    await testApp.agent
      .post('/api/v1/onboarding/config')
      .send({ probationDurationDays: 30 })
      .expect(201);

    await testApp.agent
      .post('/api/v1/onboarding/start')
      .send({ memberDid: adminDid })
      .expect(201);

    const res = await testApp.agent
      .post('/api/v1/onboarding/complete')
      .send({ memberDid: adminDid })
      .expect(200);

    expect(res.body.status).toBe('completed');
    expect(res.body.completedAt).toBeDefined();
  });

  it('rejects completion when requirements not met (400)', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/onboarding/config')
      .send({ probationDurationDays: 30, requireTraining: true })
      .expect(201);

    await testApp.agent
      .post('/api/v1/onboarding/start')
      .send({ memberDid: adminDid })
      .expect(201);

    // Try to complete without finishing training
    const res = await testApp.agent
      .post('/api/v1/onboarding/complete')
      .send({ memberDid: adminDid })
      .expect(400);

    expect(res.body.message).toContain('Training must be completed');
  });

  it('lists onboarding progress (200)', async () => {
    const testApp = createTestApp();
    const { adminDid } = await setupAndLogin(testApp);

    await testApp.agent
      .post('/api/v1/onboarding/config')
      .send({ probationDurationDays: 30 })
      .expect(201);

    await testApp.agent
      .post('/api/v1/onboarding/start')
      .send({ memberDid: adminDid })
      .expect(201);

    const res = await testApp.agent
      .get('/api/v1/onboarding/progress')
      .expect(200);

    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].memberDid).toBe(adminDid);
  });
});
