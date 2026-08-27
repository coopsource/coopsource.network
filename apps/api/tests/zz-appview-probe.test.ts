/**
 * THROWAWAY PROBE — audit C-05 + O-12. Delete after capturing output.
 */
import { describe, it, beforeEach } from 'vitest';
import { appendFileSync } from 'node:fs';
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
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';
import { HookRegistry } from '../src/appview/hooks/registry.js';
import { processFirehoseEvent } from '../src/appview/hooks/pipeline.js';
import { startAppViewLoop } from '../src/appview/loop.js';
import { makeEvent } from './helpers/make-event.js';

const OUT = process.env.PROBE_OUT ?? '/tmp/probe2.txt';
const log = (...args: unknown[]) =>
  appendFileSync(
    OUT,
    args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ') + '\n',
  );

/**
 * Makes every INSERT into `table` fail, modelling a database write failure.
 * The throw is in `transformQuery`, which Kysely runs at compile time before
 * the statement is sent — throwing from `transformResult` instead would let
 * the row land and only then fail, which models nothing.
 */
function failInsertsInto(table: string): KyselyPlugin {
  return {
    transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
      const node = args.node as {
        kind: string;
        into?: { table?: { identifier?: { name?: string } } };
      };
      if (node.kind === 'InsertQueryNode' && node.into?.table?.identifier?.name === table) {
        throw new Error(`simulated write failure on ${table}`);
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

function countRows(table: 'pds_record' | 'hook_dead_letter') {
  return getTestDb()
    .selectFrom(table)
    .select(getTestDb().fn.countAll().as('n'))
    .executeTakeFirst();
}

describe('zz appview probe', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  it('C-05a: a failed pds_record write is silent', async () => {
    const db = getTestDb().withPlugin(failInsertsInto('pds_record'));
    const registry = new HookRegistry();
    let postHookRan = false;
    registry.register({
      id: 'probe:post',
      name: 'probe post hook',
      phase: 'post-storage',
      source: 'builtin',
      collections: ['probe.ns.thing'],
      priority: 10,
      postHandler: async () => {
        postHookRan = true;
      },
    });

    const event = makeEvent('probe.ns.thing', 'create', { $type: 'probe.ns.thing' });

    let threw = false;
    try {
      await processFirehoseEvent(db, registry, event);
    } catch {
      threw = true;
    }

    log('C-05a processFirehoseEvent threw:', threw);
    log('C-05a post-storage hook still ran:', postHookRan);
    log('C-05a pds_record rows:', (await countRows('pds_record'))?.n);
    log('C-05a hook_dead_letter rows:', (await countRows('hook_dead_letter'))?.n);
  });

  it('C-05b: a failed dead-letter write leaves no trace at all', async () => {
    const db = getTestDb().withPlugin(failInsertsInto('hook_dead_letter'));
    const registry = new HookRegistry();
    registry.register({
      id: 'probe:failing-post',
      name: 'probe failing post hook',
      phase: 'post-storage',
      source: 'builtin',
      collections: ['probe.ns.thing'],
      priority: 10,
      postHandler: async () => {
        throw new Error('projector exploded');
      },
    });

    const event = makeEvent('probe.ns.thing', 'create', { $type: 'probe.ns.thing' });

    let threw = false;
    try {
      await processFirehoseEvent(db, registry, event);
    } catch {
      threw = true;
    }

    log('C-05b processFirehoseEvent threw:', threw);
    log('C-05b hook_dead_letter rows:', (await countRows('hook_dead_letter'))?.n);
  });

  it('C-05c: the local loop advances its cursor past a failed event', async () => {
    const db = getTestDb().withPlugin(failInsertsInto('pds_record'));
    const registry = new HookRegistry();

    const first = makeEvent('probe.ns.thing', 'create', { $type: 'probe.ns.thing' }, {
      seq: 101,
      uri: 'at://did:plc:test/probe.ns.thing/one',
    });
    const second = makeEvent('probe.ns.thing', 'create', { $type: 'probe.ns.thing' }, {
      seq: 102,
      uri: 'at://did:plc:test/probe.ns.thing/two',
    });

    const pdsService = {
      async *subscribeRepos(): AsyncIterable<RepositoryStreamEvent> {
        yield first;
        yield second;
        // Hold the stream open so the loop does not restart.
        await new Promise(() => {});
      },
    } as unknown as IPdsService;

    await startAppViewLoop(pdsService, db, { hookRegistry: registry });

    // Give the loop time to drain both events.
    await new Promise((resolve) => setTimeout(resolve, 500));

    const cursor = await getTestDb()
      .selectFrom('pds_firehose_cursor')
      .where('subscriber_id', '=', 'appview-local')
      .select('last_global_seq')
      .executeTakeFirst();

    log('C-05c events yielded: seq 101 (storage fails), seq 102 (storage fails)');
    log('C-05c cursor now:', cursor?.last_global_seq, '(0 would mean it held)');
    log('C-05c pds_record rows:', (await countRows('pds_record'))?.n);
    log('C-05c hook_dead_letter rows:', (await countRows('hook_dead_letter'))?.n);
  });

  it('O-12: dead letters cannot be retried', async () => {
    const testApp = createTestApp();
    await setupAndLogin(testApp);
    const db = getTestDb();

    await db
      .insertInto('hook_dead_letter')
      .values({
        event_uri: 'at://did:plc:test/probe.ns.thing/one',
        event_did: 'did:plc:test',
        collection: 'probe.ns.thing',
        operation: 'create',
        hook_id: 'probe:post',
        hook_phase: 'post-storage',
        error_message: 'projector exploded',
        error_stack: null,
        event_data: JSON.stringify({ seq: 1 }),
      })
      .execute();

    const list = await testApp.agent
      .get('/api/v1/admin/hooks/dead-letter')
      .send();
    log('O-12 list status:', list.status, 'entries:', list.body?.entries?.length);
    const id = list.body?.entries?.[0]?.id;

    const retry = await testApp.agent
      .post(`/api/v1/admin/hooks/dead-letter/${id}/retry`)
      .send();
    log('O-12 retry route status:', retry.status, '(404 = no such route)');

    const row = await db
      .selectFrom('hook_dead_letter')
      .select(['retry_count', 'resolved_at'])
      .executeTakeFirst();
    log('O-12 retry_count:', row?.retry_count, 'resolved_at:', String(row?.resolved_at));
  });
});
