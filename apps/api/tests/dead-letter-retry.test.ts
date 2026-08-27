import { describe, it, expect, beforeEach } from 'vitest';
import type {
  KyselyPlugin,
  PluginTransformQueryArgs,
  PluginTransformResultArgs,
  QueryResult,
  RootOperationNode,
  UnknownRow,
} from 'kysely';
import { truncateAllTables, getTestDb } from './helpers/test-db.js';
import { createTestApp, setupAndLogin, type TestApp } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';
import { processFirehoseEvent } from '../src/appview/hooks/pipeline.js';
import { retryDeadLetter } from '../src/appview/hooks/dead-letter.js';
import { HookRegistry } from '../src/appview/hooks/registry.js';
import { makeEvent } from './helpers/make-event.js';

/**
 * Audit O-12 — a dead letter has to be replayable, or it is only a record that
 * something was lost. `retry_count` had no writer anywhere in the tree and no
 * retry route existed; the queue could only be listed or dismissed.
 */

const COLLECTION = 'retry.ns.thing';

function failInsertsInto(...tables: string[]): KyselyPlugin {
  return {
    transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
      const node = args.node as {
        kind: string;
        into?: { table?: { identifier?: { name?: string } } };
      };
      const target = node.into?.table?.identifier?.name;
      if (node.kind === 'InsertQueryNode' && target && tables.includes(target)) {
        throw new Error(`simulated write failure on ${target}`);
      }
      return args.node;
    },
    async transformResult(
      args: PluginTransformResultArgs,
    ): Promise<QueryResult<UnknownRow>> {
      return args.result;
    },
  };
}

/** Produce a real storage-phase dead letter through the pipeline. */
async function deadLetterAStorageFailure(uri: string): Promise<string> {
  const db = getTestDb().withPlugin(failInsertsInto('pds_record'));
  await processFirehoseEvent(
    db,
    new HookRegistry(),
    makeEvent(COLLECTION, 'create', { $type: COLLECTION, title: 'replay me' }, { uri }),
  );

  const entry = await getTestDb()
    .selectFrom('hook_dead_letter')
    .where('event_uri', '=', uri)
    .select(['id'])
    .executeTakeFirstOrThrow();
  return entry.id;
}

async function entryById(id: string) {
  return getTestDb()
    .selectFrom('hook_dead_letter')
    .where('id', '=', id)
    .selectAll()
    .executeTakeFirst();
}

function retry(testApp: TestApp, id: string) {
  return testApp.agent.post(`/api/v1/admin/hooks/dead-letter/${id}/retry`).send();
}

describe('Dead letter retry (O-12)', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  it('replays a storage failure and stores the record', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);
    const uri = `at://did:plc:test/${COLLECTION}/one`;
    const id = await deadLetterAStorageFailure(uri);

    expect(
      await getTestDb().selectFrom('pds_record').where('uri', '=', uri).selectAll().execute(),
    ).toHaveLength(0);

    const res = await retry(testApp, id);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const stored = await getTestDb()
      .selectFrom('pds_record')
      .where('uri', '=', uri)
      .selectAll()
      .execute();
    expect(stored).toHaveLength(1);
    expect(stored[0]!.collection).toBe(COLLECTION);
  });

  it('resolves the entry once its event has been replayed', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);
    const id = await deadLetterAStorageFailure(`at://did:plc:test/${COLLECTION}/two`);

    await retry(testApp, id).expect(200);

    expect((await entryById(id))?.resolved_at).not.toBeNull();
  });

  it('counts every retry attempt', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);
    const id = await deadLetterAStorageFailure(`at://did:plc:test/${COLLECTION}/three`);

    await retry(testApp, id).expect(200);

    expect((await entryById(id))?.retry_count).toBe(1);
  });

  it('does not resolve an entry whose event still cannot be stored', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);
    const uri = `at://did:plc:test/${COLLECTION}/four`;
    const id = await deadLetterAStorageFailure(uri);

    // Remove the destination so the replay fails the same way again.
    await getTestDb()
      .updateTable('hook_dead_letter')
      .set({ event_data: JSON.stringify({ malformed: true }) })
      .where('id', '=', id)
      .execute();

    const res = await retry(testApp, id);
    expect(res.status).toBe(422);
    expect(res.body.ok).toBe(false);

    const entry = await entryById(id);
    expect(entry?.resolved_at).toBeNull();
    expect(entry?.retry_count).toBe(1);
  });

  it('does not resolve a storage entry whose record still will not store', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);
    const id = await deadLetterAStorageFailure(`at://did:plc:test/${COLLECTION}/stuck`);

    // The replay runs and the pipeline returns — it dead-letters the storage
    // failure rather than throwing — but the record is still not stored, so the
    // entry must stay open.
    const result = await retryDeadLetter(
      getTestDb().withPlugin(failInsertsInto('pds_record')),
      testApp.container.hookRegistry,
      id,
    );

    expect(result?.ok).toBe(false);
    const entry = await entryById(id);
    expect(entry?.resolved_at).toBeNull();
    expect(entry?.retry_count).toBe(1);
  });

  it('answers an unknown or already-resolved entry with 404', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);
    const id = await deadLetterAStorageFailure(`at://did:plc:test/${COLLECTION}/five`);

    await retry(testApp, id).expect(200);
    await retry(testApp, id).expect(404);
  });

  it('requires an authenticated admin', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);
    const id = await deadLetterAStorageFailure(`at://did:plc:test/${COLLECTION}/six`);

    const anonymous = createTestApp();
    const res = await anonymous.agent
      .post(`/api/v1/admin/hooks/dead-letter/${id}/retry`)
      .send();
    expect([401, 403]).toContain(res.status);
    expect((await entryById(id))?.retry_count).toBe(0);
  });
});
