import { describe, it, expect, beforeEach } from 'vitest';
import type {
  KyselyPlugin,
  PluginTransformQueryArgs,
  PluginTransformResultArgs,
  QueryResult,
  RootOperationNode,
  UnknownRow,
} from 'kysely';
import type { IPdsService, RepositoryStreamEvent } from '@coopsource/federation';
import { truncateAllTables, getTestDb } from './helpers/test-db.js';
import { resetSetupCache } from '../src/auth/middleware.js';
import { HookRegistry } from '../src/appview/hooks/registry.js';
import { processFirehoseEvent } from '../src/appview/hooks/pipeline.js';
import { startAppViewLoop, handleTapRecordEvent } from '../src/appview/loop.js';
import type { RecordEvent } from '@atproto/tap';
import { makeEvent } from './helpers/make-event.js';

/**
 * Audit C-05 — a firehose event may only be acknowledged, or its cursor
 * advanced, once the AppView has either stored it or recorded why it could not.
 *
 * Failure is injected by throwing from a Kysely plugin's `transformQuery`,
 * which runs at compile time before the statement is sent. Throwing from
 * `transformResult` instead would let the row land and only then fail, which
 * models nothing.
 */
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

/**
 * Fails only the first `count` inserts into `tables`, so a later event in the
 * same stream can succeed. That is the shape of the C-05 defect: the failure
 * itself is invisible, and it is the *next* success that carries the cursor
 * past it.
 */
function failFirstInsertsInto(count: number, ...tables: string[]): KyselyPlugin {
  let remaining = count;
  return {
    transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
      const node = args.node as {
        kind: string;
        into?: { table?: { identifier?: { name?: string } } };
      };
      const target = node.into?.table?.identifier?.name;
      if (
        node.kind === 'InsertQueryNode' &&
        target &&
        tables.includes(target) &&
        remaining > 0
      ) {
        remaining--;
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

const COLLECTION = 'delivery.ns.thing';

function registryWithPostHook(onCall: () => void): HookRegistry {
  const registry = new HookRegistry();
  registry.register({
    id: 'test:post',
    name: 'test post hook',
    phase: 'post-storage',
    source: 'builtin',
    collections: [COLLECTION],
    priority: 10,
    postHandler: async () => onCall(),
  });
  return registry;
}

async function deadLetters() {
  return getTestDb()
    .selectFrom('hook_dead_letter')
    .selectAll()
    .execute();
}

async function cursorSeq(): Promise<number | undefined> {
  const row = await getTestDb()
    .selectFrom('pds_firehose_cursor')
    .where('subscriber_id', '=', 'appview-local')
    .select('last_global_seq')
    .executeTakeFirst();
  // bigint comes back from PostgreSQL as a string.
  return row === undefined ? undefined : Number(row.last_global_seq);
}

describe('AppView delivery integrity (C-05)', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  it('dead-letters an event whose pds_record write fails', async () => {
    const db = getTestDb().withPlugin(failInsertsInto('pds_record'));
    const registry = registryWithPostHook(() => {});

    await processFirehoseEvent(db, registry, makeEvent(COLLECTION));

    const entries = await deadLetters();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.hook_phase).toBe('storage');
    expect(entries[0]!.event_uri).toBe(`at://did:plc:test/${COLLECTION}/rkey1`);
    expect(entries[0]!.event_data).toBeTruthy();
  });

  it('does not run post-storage hooks after a failed pds_record write', async () => {
    const db = getTestDb().withPlugin(failInsertsInto('pds_record'));
    let postHookRan = false;
    const registry = registryWithPostHook(() => {
      postHookRan = true;
    });

    await processFirehoseEvent(db, registry, makeEvent(COLLECTION));

    // A materialized view must not be built from a record that was never stored.
    expect(postHookRan).toBe(false);
  });

  it('throws when it can store neither the record nor the reason', async () => {
    const db = getTestDb().withPlugin(
      failInsertsInto('pds_record', 'hook_dead_letter'),
    );
    const registry = registryWithPostHook(() => {});

    // Nothing was recorded anywhere, so the event must be redelivered rather
    // than acknowledged.
    await expect(
      processFirehoseEvent(db, registry, makeEvent(COLLECTION)),
    ).rejects.toThrow();
  });

  it('throws when a hook failure cannot be dead-lettered', async () => {
    const db = getTestDb().withPlugin(failInsertsInto('hook_dead_letter'));
    const registry = new HookRegistry();
    registry.register({
      id: 'test:failing-post',
      name: 'failing post hook',
      phase: 'post-storage',
      source: 'builtin',
      collections: [COLLECTION],
      priority: 10,
      postHandler: async () => {
        throw new Error('projector exploded');
      },
    });

    await expect(
      processFirehoseEvent(db, registry, makeEvent(COLLECTION)),
    ).rejects.toThrow();
  });

  it('does not acknowledge a Tap event it could not record', async () => {
    const db = getTestDb().withPlugin(
      failInsertsInto('pds_record', 'hook_dead_letter'),
    );
    const registry = new HookRegistry();

    const evt = {
      id: 7,
      type: 'record',
      action: 'create',
      did: 'did:plc:test',
      rev: 'rev1',
      collection: COLLECTION,
      rkey: 'rkey1',
      record: { $type: COLLECTION },
      cid: 'bafytest',
      live: true,
    } as unknown as RecordEvent;

    // SimpleIndexer calls opts.ack() only after this resolves, and TapChannel
    // skips the ack when the handler throws — so throwing is what makes Tap
    // redeliver instead of dropping the event.
    await expect(handleTapRecordEvent(db, registry, evt)).rejects.toThrow();
  });

  it('does not let a later success carry the cursor past a failed event', async () => {
    // Event 101's record write fails and so does its dead letter, so nothing
    // about it was recorded. Event 102 would succeed.
    const db = getTestDb().withPlugin(
      failFirstInsertsInto(2, 'pds_record', 'hook_dead_letter'),
    );
    const registry = new HookRegistry();

    let subscriptions = 0;
    const pdsService = {
      async *subscribeRepos(): AsyncIterable<RepositoryStreamEvent> {
        subscriptions++;
        if (subscriptions === 1) {
          yield makeEvent(COLLECTION, 'create', undefined, {
            seq: 101,
            uri: `at://did:plc:test/${COLLECTION}/one`,
          });
          yield makeEvent(COLLECTION, 'create', undefined, {
            seq: 102,
            uri: `at://did:plc:test/${COLLECTION}/two`,
          });
        }
        // Park on every later subscription so the loop does not spin.
        await new Promise(() => {});
      },
    } as unknown as IPdsService;

    await startAppViewLoop(pdsService, db, { hookRegistry: registry });
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(await cursorSeq()).toBe(0);
  });

  it('advances the cursor for an event it did process', async () => {
    const db = getTestDb();
    const registry = new HookRegistry();

    let subscriptions = 0;
    const pdsService = {
      async *subscribeRepos(): AsyncIterable<RepositoryStreamEvent> {
        subscriptions++;
        if (subscriptions === 1) {
          yield makeEvent(COLLECTION, 'create', undefined, {
            seq: 201,
            uri: `at://did:plc:test/${COLLECTION}/good`,
          });
        }
        await new Promise(() => {});
      },
    } as unknown as IPdsService;

    await startAppViewLoop(pdsService, db, { hookRegistry: registry });
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(await cursorSeq()).toBe(201);
  });
});
