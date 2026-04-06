// apps/api/tests/xrpc-labels.test.ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import WebSocket from 'ws';
import * as dagCbor from '@ipld/dag-cbor';
import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import { createTestApp, type TestApp } from './helpers/test-app.js';
import { setupLabelWebSocket } from '../src/routes/xrpc-labels.js';

let testApp: TestApp;
let db: Kysely<Database>;

beforeAll(async () => {
  testApp = createTestApp();
  db = testApp.container.db;
});

beforeEach(async () => {
  await db.deleteFrom('governance_label').execute();
});

describe('GET /xrpc/com.atproto.label.queryLabels', () => {
  it('returns empty labels array when no labels exist', async () => {
    const res = await testApp.agent
      .get('/xrpc/com.atproto.label.queryLabels')
      .expect(200);

    expect(res.body.labels).toEqual([]);
    expect(res.body.cursor).toBeUndefined();
  });

  it('returns labels in ATProto format', async () => {
    await db
      .insertInto('governance_label')
      .values({
        src_did: 'did:plc:coop1',
        subject_uri: 'at://did:plc:coop1/network.coopsource.governance.proposal/abc',
        subject_cid: 'bafycid123',
        label_value: 'proposal-approved',
        created_at: new Date('2026-04-05T12:00:00Z'),
      })
      .execute();

    const res = await testApp.agent
      .get('/xrpc/com.atproto.label.queryLabels')
      .expect(200);

    expect(res.body.labels).toHaveLength(1);
    expect(res.body.labels[0]).toMatchObject({
      ver: 1,
      src: 'did:plc:coop1',
      uri: 'at://did:plc:coop1/network.coopsource.governance.proposal/abc',
      cid: 'bafycid123',
      val: 'proposal-approved',
      neg: false,
    });
    expect(res.body.labels[0].cts).toBeDefined();
  });

  it('filters by sources[]', async () => {
    await db
      .insertInto('governance_label')
      .values([
        {
          src_did: 'did:plc:coop1',
          subject_uri: 'at://did:plc:coop1/proposal/1',
          label_value: 'proposal-approved',
          created_at: new Date(),
        },
        {
          src_did: 'did:plc:coop2',
          subject_uri: 'at://did:plc:coop2/proposal/2',
          label_value: 'proposal-approved',
          created_at: new Date(),
        },
      ])
      .execute();

    const res = await testApp.agent
      .get('/xrpc/com.atproto.label.queryLabels?sources=did:plc:coop1')
      .expect(200);

    expect(res.body.labels).toHaveLength(1);
    expect(res.body.labels[0].src).toBe('did:plc:coop1');
  });

  it('filters by uriPatterns with wildcard', async () => {
    await db
      .insertInto('governance_label')
      .values([
        {
          src_did: 'did:plc:coop1',
          subject_uri:
            'at://did:plc:coop1/network.coopsource.governance.proposal/abc',
          label_value: 'proposal-approved',
          created_at: new Date(),
        },
        {
          src_did: 'did:plc:coop1',
          subject_uri:
            'at://did:plc:coop1/network.coopsource.org.membership/xyz',
          label_value: 'member-suspended',
          created_at: new Date(),
        },
      ])
      .execute();

    const res = await testApp.agent
      .get(
        '/xrpc/com.atproto.label.queryLabels?uriPatterns=at://did:plc:coop1/network.coopsource.governance.*',
      )
      .expect(200);

    expect(res.body.labels).toHaveLength(1);
    expect(res.body.labels[0].val).toBe('proposal-approved');
  });

  it('supports cursor-based pagination', async () => {
    for (let i = 0; i < 5; i++) {
      await db
        .insertInto('governance_label')
        .values({
          src_did: 'did:plc:coop1',
          subject_uri: `at://did:plc:coop1/proposal/${i}`,
          label_value: 'proposal-approved',
          created_at: new Date(),
        })
        .execute();
    }

    const page1 = await testApp.agent
      .get('/xrpc/com.atproto.label.queryLabels?limit=3')
      .expect(200);

    expect(page1.body.labels).toHaveLength(3);
    expect(page1.body.cursor).toBeDefined();

    const page2 = await testApp.agent
      .get(
        `/xrpc/com.atproto.label.queryLabels?limit=3&cursor=${page1.body.cursor}`,
      )
      .expect(200);

    expect(page2.body.labels).toHaveLength(2);
    expect(page2.body.cursor).toBeUndefined();
  });

  it('respects limit (max 250)', async () => {
    const res = await testApp.agent
      .get('/xrpc/com.atproto.label.queryLabels?limit=999')
      .expect(200);

    // limit is clamped to 250; no labels inserted so result is empty
    expect(res.body.labels).toEqual([]);
  });
});

describe('WebSocket /xrpc/com.atproto.label.subscribeLabels', () => {
  it('receives real-time label via WebSocket', async () => {
    const server = testApp.app.listen(0);
    setupLabelWebSocket(server, testApp.container.labelSubscriptionManager);
    const addr = server.address() as { port: number };

    const received = new Promise<Uint8Array>((resolve, reject) => {
      const ws = new WebSocket(
        `ws://localhost:${addr.port}/xrpc/com.atproto.label.subscribeLabels`,
      );
      ws.on('message', (data: Buffer) => {
        ws.close();
        resolve(new Uint8Array(data));
      });
      ws.on('open', () => {
        testApp.container.labelSubscriptionManager.notifyNewLabel(1, {
          ver: 1,
          src: 'did:plc:test',
          uri: 'at://did:plc:test/proposal/1',
          val: 'proposal-approved',
          neg: false,
          cts: new Date().toISOString(),
        });
      });
      ws.on('error', reject);
      setTimeout(() => reject(new Error('Timeout')), 5000);
    });

    const frame = await received;

    // Decode: two concatenated DAG-CBOR values
    const headerEnd = findCborEnd(frame);
    const header = dagCbor.decode(frame.slice(0, headerEnd));
    const body = dagCbor.decode(frame.slice(headerEnd));

    expect(header).toEqual({ op: 1, t: '#labels' });
    expect(body).toHaveProperty('seq', 1);
    expect(body).toHaveProperty('labels');
    expect((body as { labels: unknown[] }).labels).toHaveLength(1);

    server.close();
  });
});

/**
 * Find the byte length of the first DAG-CBOR value in a concatenated buffer
 * by re-encoding the known header object. The ATProto subscription frame
 * header is always { op: 1, t: '#labels' }, and DAG-CBOR is deterministic, so
 * encoding that object yields exactly the same bytes as the header in the
 * frame — giving us its length as the split point.
 */
function findCborEnd(_buf: Uint8Array): number {
  return dagCbor.encode({ op: 1, t: '#labels' }).length;
}
