import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin, type TestApp } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';
import { HookRegistry } from '../src/appview/hooks/registry.js';
import { processFirehoseEvent } from '../src/appview/hooks/pipeline.js';
import { registerBuiltinHooks } from '../src/appview/hooks/builtin/index.js';
import { makeEvent } from './helpers/make-event.js';
import type { HookRegistration, PreStorageResult, HookContext } from '../src/appview/hooks/types.js';
import { getTestDb } from './helpers/test-db.js';
import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';

describe('Hook pipeline (P6)', () => {
  let db: Kysely<Database>;
  let testApp: TestApp;
  let coopDid: string;

  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
    db = getTestDb();
    testApp = createTestApp();
    const result = await setupAndLogin(testApp);
    coopDid = result.coopDid;
  });

  // ─── Core pipeline behavior ──────────────────────────────────────────

  it('stores pds_record when post-storage hook fires', async () => {
    const registry = new HookRegistry();
    let hookFired = false;

    registry.register({
      id: 'test:post-hook',
      name: 'Test post-storage hook',
      phase: 'post-storage',
      source: 'builtin',
      collections: ['test.ns.collection'],
      priority: 10,
      postHandler: async () => {
        hookFired = true;
      },
    });

    const event = makeEvent('test.ns.collection', 'create', { $type: 'test.ns.collection', title: 'hello' });
    await processFirehoseEvent(db, registry, event);

    expect(hookFired).toBe(true);

    const rows = await db
      .selectFrom('pds_record')
      .where('uri', '=', event.uri)
      .selectAll()
      .execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.collection).toBe('test.ns.collection');
  });

  it('stores pds_record even when no hooks match', async () => {
    const registry = new HookRegistry();
    const event = makeEvent('unknown.collection', 'create', { $type: 'unknown.collection', data: 1 });

    await processFirehoseEvent(db, registry, event);

    const rows = await db
      .selectFrom('pds_record')
      .where('uri', '=', event.uri)
      .selectAll()
      .execute();
    expect(rows).toHaveLength(1);
  });

  it('pre-storage hook returning skip prevents pds_record storage', async () => {
    const registry = new HookRegistry();

    registry.register({
      id: 'test:skip-hook',
      name: 'Skip hook',
      phase: 'pre-storage',
      source: 'builtin',
      collections: ['test.skip.collection'],
      priority: 10,
      preHandler: async (): Promise<PreStorageResult> => {
        return { action: 'skip', reason: 'blocked by test' };
      },
    });

    const event = makeEvent('test.skip.collection');
    await processFirehoseEvent(db, registry, event);

    const rows = await db
      .selectFrom('pds_record')
      .where('uri', '=', event.uri)
      .selectAll()
      .execute();
    expect(rows).toHaveLength(0);
  });

  it('pre-storage hook returning transform stores transformed content', async () => {
    const registry = new HookRegistry();

    registry.register({
      id: 'test:transform-hook',
      name: 'Transform hook',
      phase: 'pre-storage',
      source: 'builtin',
      collections: ['test.transform.collection'],
      priority: 10,
      preHandler: async (): Promise<PreStorageResult> => {
        return {
          action: 'transform',
          transformedRecord: { $type: 'test.transform.collection', injected: true },
        };
      },
    });

    const event = makeEvent('test.transform.collection', 'create', { $type: 'test.transform.collection', original: true });
    await processFirehoseEvent(db, registry, event);

    const row = await db
      .selectFrom('pds_record')
      .where('uri', '=', event.uri)
      .selectAll()
      .executeTakeFirst();
    expect(row).toBeDefined();

    const content = typeof row!.content === 'string' ? JSON.parse(row!.content) : row!.content;
    expect(content.injected).toBe(true);
    expect(content.original).toBeUndefined();
  });

  it('pre-storage hook error creates dead letter and stores original record (fail-open)', async () => {
    const registry = new HookRegistry();

    registry.register({
      id: 'test:error-pre-hook',
      name: 'Error pre-hook',
      phase: 'pre-storage',
      source: 'builtin',
      collections: ['test.error.pre'],
      priority: 10,
      preHandler: async (): Promise<PreStorageResult> => {
        throw new Error('pre-hook test failure');
      },
    });

    const event = makeEvent('test.error.pre');
    await processFirehoseEvent(db, registry, event);

    // Record should still be stored (fail-open)
    const pdsRows = await db
      .selectFrom('pds_record')
      .where('uri', '=', event.uri)
      .selectAll()
      .execute();
    expect(pdsRows).toHaveLength(1);

    // Dead letter entry should exist
    const dlRows = await db
      .selectFrom('hook_dead_letter')
      .where('hook_id', '=', 'test:error-pre-hook')
      .selectAll()
      .execute();
    expect(dlRows).toHaveLength(1);
    expect(dlRows[0]!.error_message).toBe('pre-hook test failure');
    expect(dlRows[0]!.hook_phase).toBe('pre-storage');
  });

  it('post-storage hook error creates dead letter but record remains safe', async () => {
    const registry = new HookRegistry();

    registry.register({
      id: 'test:error-post-hook',
      name: 'Error post-hook',
      phase: 'post-storage',
      source: 'builtin',
      collections: ['test.error.post'],
      priority: 10,
      postHandler: async () => {
        throw new Error('post-hook test failure');
      },
    });

    const event = makeEvent('test.error.post');
    await processFirehoseEvent(db, registry, event);

    // Record should be stored
    const pdsRows = await db
      .selectFrom('pds_record')
      .where('uri', '=', event.uri)
      .selectAll()
      .execute();
    expect(pdsRows).toHaveLength(1);

    // Dead letter entry should exist
    const dlRows = await db
      .selectFrom('hook_dead_letter')
      .where('hook_id', '=', 'test:error-post-hook')
      .selectAll()
      .execute();
    expect(dlRows).toHaveLength(1);
    expect(dlRows[0]!.error_message).toBe('post-hook test failure');
    expect(dlRows[0]!.hook_phase).toBe('post-storage');
  });

  it('multiple hooks execute in priority order (lower priority first)', async () => {
    const registry = new HookRegistry();
    const executionOrder: string[] = [];

    registry.register({
      id: 'test:priority-50',
      name: 'Priority 50',
      phase: 'post-storage',
      source: 'builtin',
      collections: ['test.priority.order'],
      priority: 50,
      postHandler: async () => {
        executionOrder.push('50');
      },
    });

    registry.register({
      id: 'test:priority-10',
      name: 'Priority 10',
      phase: 'post-storage',
      source: 'builtin',
      collections: ['test.priority.order'],
      priority: 10,
      postHandler: async () => {
        executionOrder.push('10');
      },
    });

    const event = makeEvent('test.priority.order');
    await processFirehoseEvent(db, registry, event);

    expect(executionOrder).toEqual(['10', '50']);
  });

  it('wildcard collection pattern matches sub-collections', async () => {
    const registry = new HookRegistry();
    let hookFired = false;

    registry.register({
      id: 'test:wildcard',
      name: 'Wildcard hook',
      phase: 'post-storage',
      source: 'builtin',
      collections: ['test.ns.*'],
      priority: 10,
      postHandler: async () => {
        hookFired = true;
      },
    });

    const event = makeEvent('test.ns.sub');
    await processFirehoseEvent(db, registry, event);

    expect(hookFired).toBe(true);
  });

  // ─── Admin routes ────────────────────────────────────────────────────

  it('GET /admin/hooks returns registered hooks', async () => {
    const res = await testApp.agent
      .get('/api/v1/admin/hooks')
      .expect(200);

    expect(res.body.hooks).toBeDefined();
    expect(Array.isArray(res.body.hooks)).toBe(true);
    // Should have builtin hooks registered by the test app
    expect(res.body.hooks.length).toBeGreaterThan(0);

    // Each hook has expected fields
    const hook = res.body.hooks[0];
    expect(hook).toHaveProperty('id');
    expect(hook).toHaveProperty('name');
    expect(hook).toHaveProperty('phase');
    expect(hook).toHaveProperty('source');
    expect(hook).toHaveProperty('collections');
    expect(hook).toHaveProperty('priority');
  });

  it('GET /admin/hooks/dead-letter returns entries', async () => {
    const res = await testApp.agent
      .get('/api/v1/admin/hooks/dead-letter')
      .expect(200);

    expect(res.body.entries).toBeDefined();
    expect(Array.isArray(res.body.entries)).toBe(true);
  });

  it('POST /admin/hooks/dead-letter/:id/resolve marks entry as resolved', async () => {
    // Create a dead letter entry by processing an event with a failing hook
    const registry = new HookRegistry();
    registry.register({
      id: 'test:dl-resolve',
      name: 'Failing hook for resolve test',
      phase: 'post-storage',
      source: 'builtin',
      collections: ['test.dl.resolve'],
      priority: 10,
      postHandler: async () => {
        throw new Error('intentional failure');
      },
    });

    const event = makeEvent('test.dl.resolve');
    await processFirehoseEvent(db, registry, event);

    // Get the dead letter entry
    const dlRow = await db
      .selectFrom('hook_dead_letter')
      .where('hook_id', '=', 'test:dl-resolve')
      .selectAll()
      .executeTakeFirst();
    expect(dlRow).toBeDefined();

    // Resolve it via the admin API
    const res = await testApp.agent
      .post(`/api/v1/admin/hooks/dead-letter/${dlRow!.id}/resolve`)
      .expect(200);

    expect(res.body.ok).toBe(true);

    // Verify it's resolved
    const resolved = await db
      .selectFrom('hook_dead_letter')
      .where('id', '=', dlRow!.id as string)
      .selectAll()
      .executeTakeFirst();
    expect(resolved!.resolved_at).not.toBeNull();
  });

  // ─── Registry unit tests ─────────────────────────────────────────────

  it('HookRegistry.listAll returns all registered hooks sorted by priority', () => {
    const registry = new HookRegistry();
    registerBuiltinHooks(registry);

    const all = registry.listAll();
    expect(all.length).toBeGreaterThan(0);

    // Check sorted by priority
    for (let i = 1; i < all.length; i++) {
      expect(all[i]!.priority).toBeGreaterThanOrEqual(all[i - 1]!.priority);
    }
  });

  it('HookRegistry.unregister removes a hook', () => {
    const registry = new HookRegistry();

    registry.register({
      id: 'test:removable',
      name: 'Removable',
      phase: 'post-storage',
      source: 'builtin',
      collections: ['test.removable'],
      priority: 10,
      postHandler: async () => {},
    });

    expect(registry.getById('test:removable')).toBeDefined();
    registry.unregister('test:removable');
    expect(registry.getById('test:removable')).toBeUndefined();
  });
});
