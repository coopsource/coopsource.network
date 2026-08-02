import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import Stripe from 'stripe';
import { truncateAllTables, getTestDb } from './helpers/test-db.js';
import { createTestApp, type TestApp } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';
import { createPaymentWebhookRoutes } from '../src/routes/funding/payment-webhook.js';

/**
 * Audit finding S-06: the webhook verified the caller with the per-cooperative
 * provider config named in the URL, but then resolved the pledge with a global
 * `findPledgeByPaymentSession(sessionId)` lookup. Session IDs are exposed by
 * pledge listing, so a cooperative administrator holding their own webhook
 * secret could forge completion of another cooperative's pledge.
 */
const VICTIM_COOP = 'did:web:victim.example';
const ATTACKER_COOP = 'did:web:attacker.example';
const VICTIM_SECRET = 'whsec_victim_secret';
const ATTACKER_SECRET = 'whsec_attacker_secret';
const VICTIM_SESSION = 'cs_test_victim_session';

describe('Payment webhook cooperative scoping (S-06)', () => {
  let testApp: TestApp;
  let app: express.Express;

  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
    testApp = createTestApp();

    const db = getTestDb();
    for (const [coop, session] of [
      [VICTIM_COOP, VICTIM_SESSION],
      [ATTACKER_COOP, 'cs_test_attacker_session'],
    ] as const) {
      const campaignUri = `at://${coop}/network.coopsource.funding.campaign/c1`;
      await db
        .insertInto('funding_campaign')
        .values({
          uri: campaignUri,
          did: coop,
          rkey: 'c1',
          beneficiary_uri: `at://${coop}/network.coopsource.entity.cooperative/self`,
          title: 'Campaign',
          tier: 'standard',
          campaign_type: 'donation',
          goal_amount: 100000,
          funding_model: 'keep-what-you-raise',
          status: 'active',
        })
        .execute();

      await db
        .insertInto('funding_pledge')
        .values({
          uri: `at://${coop}/network.coopsource.funding.pledge/p1`,
          did: coop,
          rkey: 'p1',
          campaign_uri: campaignUri,
          backer_did: 'did:web:backer.example',
          amount: 5000,
          payment_status: 'pending',
          payment_session_id: session,
          payment_provider: 'stripe',
        })
        .execute();

      await testApp.container.paymentRegistry.addConfig(
        coop,
        'stripe',
        'Stripe',
        { secretKey: 'sk_test_123' },
        coop === VICTIM_COOP ? VICTIM_SECRET : ATTACKER_SECRET,
      );
    }

    app = express();
    app.use(
      '/api/v1/webhooks/payment',
      express.raw({ type: 'application/json' }),
      (req, _res, next) => {
        (req as typeof req & { rawBody?: Buffer }).rawBody = req.body as Buffer;
        next();
      },
    );
    app.use(createPaymentWebhookRoutes(testApp.container));
  });

  /** Build a genuinely signed Stripe webhook for the given session and secret. */
  function signedEvent(sessionId: string, secret: string): { body: string; signature: string } {
    const body = JSON.stringify({
      id: 'evt_test',
      type: 'checkout.session.completed',
      data: { object: { id: sessionId } },
    });
    const signature = new Stripe('sk_test_x').webhooks.generateTestHeaderString({
      payload: body,
      secret,
    });
    return { body, signature };
  }

  async function pledgeStatus(coop: string): Promise<string | undefined> {
    const row = await getTestDb()
      .selectFrom('funding_pledge')
      .where('did', '=', coop)
      .select('payment_status')
      .executeTakeFirst();
    return row?.payment_status;
  }

  it("rejects a cooperative completing another cooperative's payment session", async () => {
    const { body, signature } = signedEvent(VICTIM_SESSION, ATTACKER_SECRET);

    await request(app)
      .post(`/api/v1/webhooks/payment/stripe/${encodeURIComponent(ATTACKER_COOP)}`)
      .set('content-type', 'application/json')
      .set('stripe-signature', signature)
      .send(body);

    expect(await pledgeStatus(VICTIM_COOP)).toBe('pending');
  });

  it('still completes a cooperative’s own payment session', async () => {
    const { body, signature } = signedEvent(VICTIM_SESSION, VICTIM_SECRET);

    await request(app)
      .post(`/api/v1/webhooks/payment/stripe/${encodeURIComponent(VICTIM_COOP)}`)
      .set('content-type', 'application/json')
      .set('stripe-signature', signature)
      .send(body);

    expect(await pledgeStatus(VICTIM_COOP)).toBe('completed');
  });

  it("does not resolve a session through another provider's webhook", async () => {
    const wrongProvider = await testApp.container.fundingService.findPledgeByPaymentSession(
      VICTIM_SESSION,
      VICTIM_COOP,
      'some-other-provider',
    );

    expect(wrongProvider).toBeNull();
  });

  it('does not let any provider claim a session whose provider is unrecorded', async () => {
    // createCheckoutSession always writes payment_session_id and
    // payment_provider together, so this shape should not occur — but the
    // lookup must not fall open if it ever does.
    await getTestDb()
      .updateTable('funding_pledge')
      .set({ payment_provider: null })
      .where('did', '=', VICTIM_COOP)
      .execute();

    const claimed = await testApp.container.fundingService.findPledgeByPaymentSession(
      VICTIM_SESSION,
      VICTIM_COOP,
      'some-other-provider',
    );

    expect(claimed).toBeNull();
  });

  it('scopes the session lookup to the cooperative at the service layer', async () => {
    const asAttacker = await testApp.container.fundingService.findPledgeByPaymentSession(
      VICTIM_SESSION,
      ATTACKER_COOP,
    );
    expect(asAttacker).toBeNull();

    const asVictim = await testApp.container.fundingService.findPledgeByPaymentSession(
      VICTIM_SESSION,
      VICTIM_COOP,
    );
    expect(asVictim?.payment_session_id).toBe(VICTIM_SESSION);
  });
});
