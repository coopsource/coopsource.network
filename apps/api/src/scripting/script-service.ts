import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { IEmailService } from '@coopsource/federation';
import type { HookRegistry } from '../appview/hooks/registry.js';
import type { HookContext, PreStorageResult } from '../appview/hooks/types.js';
import type { OperatorWriteProxy } from '../services/operator-write-proxy.js';
import type { ScriptWorkerPool } from './worker-pool.js';
import type { DID } from '@coopsource/common';
import type {
  ScriptResult,
  SerializableScriptContext,
  ScriptDbQueryFilters,
  ScriptDbCountFilters,
  ScriptEmailParams,
  ScriptPdsCreateParams,
  ScriptHttpOptions,
} from './script-context.js';
import { transpileScript } from './transpiler.js';
import { sseEmitter, emitAppEvent, type AppEvent } from '../appview/sse.js';
import { validateWebhookUrl } from '../utils/url-validation.js';
import { logger } from '../middleware/logger.js';

// ─── Types ──────────────────────────────────────────────────────────────

export interface CreateScriptParams {
  name: string;
  description?: string;
  sourceCode: string;
  phase: 'pre-storage' | 'post-storage' | 'domain-event';
  collections?: string[];
  eventTypes?: string[];
  priority?: number;
  config?: Record<string, unknown>;
  timeoutMs?: number;
}

export interface UpdateScriptParams {
  name?: string;
  description?: string;
  sourceCode?: string;
  phase?: 'pre-storage' | 'post-storage' | 'domain-event';
  collections?: string[];
  eventTypes?: string[];
  priority?: number;
  config?: Record<string, unknown>;
  timeoutMs?: number;
}

export interface CooperativeScript {
  id: string;
  cooperativeDid: string;
  name: string;
  description: string | null;
  sourceCode: string;
  compiledJs: string | null;
  phase: string;
  collections: string[] | null;
  eventTypes: string[] | null;
  priority: number;
  enabled: boolean;
  config: Record<string, unknown> | null;
  timeoutMs: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TestResult {
  success: boolean;
  error?: string;
  durationMs: number;
  logs: Array<{
    level: string;
    message: string;
    data?: Record<string, unknown>;
    timestamp: string;
  }>;
}

// ─── Service ────────────────────────────────────────────────────────────

/**
 * Manages cooperative scripts: CRUD, transpilation, hook registration,
 * and execution lifecycle.
 */
export class ScriptService {
  /** Track domain-event listener cleanup functions by script id */
  private domainEventListeners = new Map<string, (event: AppEvent) => void>();

  constructor(
    private db: Kysely<Database>,
    private hookRegistry: HookRegistry,
    private workerPool: ScriptWorkerPool,
    private emailService: IEmailService,
    private operatorWriteProxy: OperatorWriteProxy,
  ) {}

  // ─── CRUD ─────────────────────────────────────────────────────────────

  async create(
    cooperativeDid: string,
    params: CreateScriptParams,
  ): Promise<CooperativeScript> {
    const compiledJs = await transpileScript(params.sourceCode);

    const row = await this.db
      .insertInto('cooperative_script')
      .values({
        cooperative_did: cooperativeDid,
        name: params.name,
        description: params.description ?? null,
        source_code: params.sourceCode,
        compiled_js: compiledJs,
        phase: params.phase,
        collections: params.collections ?? null,
        event_types: params.eventTypes ?? null,
        priority: params.priority ?? 200,
        config: params.config ? JSON.stringify(params.config) : null,
        timeout_ms: params.timeoutMs ?? 5000,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.rowToScript(row);
  }

  async get(cooperativeDid: string, id: string): Promise<CooperativeScript | null> {
    const row = await this.db
      .selectFrom('cooperative_script')
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .executeTakeFirst();

    return row ? this.rowToScript(row) : null;
  }

  async list(cooperativeDid: string): Promise<CooperativeScript[]> {
    const rows = await this.db
      .selectFrom('cooperative_script')
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .orderBy('created_at', 'desc')
      .execute();

    return rows.map((r) => this.rowToScript(r));
  }

  async update(
    cooperativeDid: string,
    id: string,
    params: UpdateScriptParams,
  ): Promise<CooperativeScript> {
    // If source code changed, re-transpile
    let compiledJs: string | undefined;
    if (params.sourceCode) {
      compiledJs = await transpileScript(params.sourceCode);
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (params.name !== undefined) updates.name = params.name;
    if (params.description !== undefined) updates.description = params.description;
    if (params.sourceCode !== undefined) updates.source_code = params.sourceCode;
    if (compiledJs !== undefined) updates.compiled_js = compiledJs;
    if (params.phase !== undefined) updates.phase = params.phase;
    if (params.collections !== undefined) updates.collections = params.collections;
    if (params.eventTypes !== undefined) updates.event_types = params.eventTypes;
    if (params.priority !== undefined) updates.priority = params.priority;
    if (params.config !== undefined) updates.config = JSON.stringify(params.config);
    if (params.timeoutMs !== undefined) updates.timeout_ms = params.timeoutMs;

    const row = await this.db
      .updateTable('cooperative_script')
      .set(updates)
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .returningAll()
      .executeTakeFirstOrThrow();

    // If the script was enabled and we updated it, re-register
    if (row.enabled) {
      this.unregisterScript(id);
      this.registerScript(this.rowToScript(row));
    }

    return this.rowToScript(row);
  }

  async delete(cooperativeDid: string, id: string): Promise<void> {
    this.unregisterScript(id);

    await this.db
      .deleteFrom('cooperative_script')
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .execute();
  }

  async enable(cooperativeDid: string, id: string): Promise<void> {
    const row = await this.db
      .updateTable('cooperative_script')
      .set({ enabled: true, updated_at: new Date() })
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .returningAll()
      .executeTakeFirstOrThrow();

    this.registerScript(this.rowToScript(row));
  }

  async disable(cooperativeDid: string, id: string): Promise<void> {
    await this.db
      .updateTable('cooperative_script')
      .set({ enabled: false, updated_at: new Date() })
      .where('id', '=', id)
      .where('cooperative_did', '=', cooperativeDid)
      .execute();

    this.unregisterScript(id);
  }

  /**
   * Test a script with a mock event without enabling it.
   */
  async test(
    cooperativeDid: string,
    id: string,
    mockEvent: Record<string, unknown>,
  ): Promise<TestResult> {
    const script = await this.get(cooperativeDid, id);
    if (!script) {
      throw new Error('Script not found');
    }

    if (!script.compiledJs) {
      throw new Error('Script has not been compiled');
    }

    const contextData: SerializableScriptContext = {
      event: {
        type: (mockEvent.type as string) ?? 'test',
        operation: mockEvent.operation as string | undefined,
        uri: mockEvent.uri as string | undefined,
        did: (mockEvent.did as string) ?? cooperativeDid,
        record: mockEvent.record as Record<string, unknown> | undefined,
        cooperativeDid,
      },
      config: script.config ?? {},
      cooperativeDid,
    };

    const result = await this.workerPool.execute({
      compiledJs: script.compiledJs,
      contextData,
      cooperativeDid,
      timeoutMs: script.timeoutMs,
      callbackHandler: (method, args) =>
        this.handleCallback(cooperativeDid, method, args),
    });

    return {
      success: result.success,
      error: result.error,
      durationMs: result.durationMs,
      logs: result.logs,
    };
  }

  /**
   * Load all enabled scripts from the database and register them.
   * Called at startup.
   */
  async loadEnabledScripts(): Promise<void> {
    const rows = await this.db
      .selectFrom('cooperative_script')
      .where('enabled', '=', true)
      .selectAll()
      .execute();

    let loaded = 0;
    for (const row of rows) {
      try {
        this.registerScript(this.rowToScript(row));
        loaded++;
      } catch (err) {
        logger.error(
          { err, scriptId: row.id, cooperativeDid: row.cooperative_did },
          'Failed to register script at startup',
        );
      }
    }

    if (loaded > 0) {
      logger.info({ count: loaded }, 'Loaded cooperative scripts');
    }
  }

  // ─── Registration ─────────────────────────────────────────────────────

  private registerScript(script: CooperativeScript): void {
    if (script.phase === 'domain-event') {
      this.registerDomainEventScript(script);
    } else {
      this.registerHookScript(script);
    }
  }

  private unregisterScript(id: string): void {
    // Try removing from hook registry
    this.hookRegistry.unregister(`script:${id}`);

    // Try removing domain-event listener
    const listener = this.domainEventListeners.get(id);
    if (listener) {
      sseEmitter.off('event', listener);
      this.domainEventListeners.delete(id);
    }
  }

  /**
   * Register a pre-storage or post-storage script as a hook.
   */
  private registerHookScript(script: CooperativeScript): void {
    const hookId = `script:${script.id}`;
    const collections = script.collections ?? ['*'];

    if (script.phase === 'pre-storage') {
      this.hookRegistry.register({
        id: hookId,
        name: `Script: ${script.name}`,
        phase: 'pre-storage',
        source: 'script',
        collections,
        priority: script.priority,
        preHandler: async (ctx: HookContext) => {
          return this.executeAsPreStorageHook(script, ctx);
        },
      });
    } else {
      this.hookRegistry.register({
        id: hookId,
        name: `Script: ${script.name}`,
        phase: 'post-storage',
        source: 'script',
        collections,
        priority: script.priority,
        postHandler: async (ctx: HookContext) => {
          await this.executeAsPostStorageHook(script, ctx);
        },
      });
    }
  }

  /**
   * Register a domain-event script as an sseEmitter listener.
   */
  private registerDomainEventScript(script: CooperativeScript): void {
    const eventTypes = new Set(script.eventTypes ?? []);

    const listener = (event: AppEvent) => {
      // Filter: only fire for this cooperative's events
      if (event.cooperativeDid !== script.cooperativeDid) return;
      // Filter: only fire for matching event types (empty = all)
      if (eventTypes.size > 0 && !eventTypes.has(event.type)) return;

      this.executeDomainEventScript(script, event).catch((err) => {
        logger.error(
          { err, scriptId: script.id, eventType: event.type },
          'Domain event script execution failed',
        );
      });
    };

    sseEmitter.on('event', listener);
    this.domainEventListeners.set(script.id, listener);
  }

  // ─── Execution ────────────────────────────────────────────────────────

  private async executeAsPreStorageHook(
    script: CooperativeScript,
    ctx: HookContext,
  ): Promise<PreStorageResult> {
    if (!script.compiledJs) {
      return { action: 'store' };
    }

    const contextData: SerializableScriptContext = {
      event: {
        type: ctx.collection,
        operation: ctx.operation,
        uri: ctx.record.uri,
        did: ctx.did,
        record: ctx.record.content,
        cooperativeDid: script.cooperativeDid,
      },
      config: script.config ?? {},
      cooperativeDid: script.cooperativeDid,
    };

    const result = await this.executeAndLog(script, contextData, 'pre-storage', ctx.collection);

    // Pre-storage scripts default to 'store' unless they explicitly error
    if (!result.success) {
      logger.warn(
        { scriptId: script.id, error: result.error },
        'Pre-storage script failed, proceeding with store',
      );
    }

    return { action: 'store' };
  }

  private async executeAsPostStorageHook(
    script: CooperativeScript,
    ctx: HookContext,
  ): Promise<void> {
    if (!script.compiledJs) return;

    const contextData: SerializableScriptContext = {
      event: {
        type: ctx.collection,
        operation: ctx.operation,
        uri: ctx.record.uri,
        did: ctx.did,
        record: ctx.record.content,
        cooperativeDid: script.cooperativeDid,
      },
      config: script.config ?? {},
      cooperativeDid: script.cooperativeDid,
    };

    await this.executeAndLog(script, contextData, 'post-storage', ctx.collection);
  }

  private async executeDomainEventScript(
    script: CooperativeScript,
    event: AppEvent,
  ): Promise<void> {
    if (!script.compiledJs) return;

    const contextData: SerializableScriptContext = {
      event: {
        type: event.type,
        did: event.cooperativeDid,
        record: event.data,
        cooperativeDid: event.cooperativeDid,
      },
      config: script.config ?? {},
      cooperativeDid: script.cooperativeDid,
    };

    await this.executeAndLog(script, contextData, 'domain-event', event.type);
  }

  /**
   * Execute a script in the worker pool and log the result.
   */
  private async executeAndLog(
    script: CooperativeScript,
    contextData: SerializableScriptContext,
    triggerType: string,
    triggerDetail: string,
  ): Promise<ScriptResult> {
    const result = await this.workerPool.execute({
      compiledJs: script.compiledJs!,
      contextData,
      cooperativeDid: script.cooperativeDid,
      timeoutMs: script.timeoutMs,
      callbackHandler: (method, args) =>
        this.handleCallback(script.cooperativeDid, method, args),
    });

    // Log execution
    const status = result.success
      ? 'success'
      : result.error?.includes('timed out')
        ? 'timeout'
        : 'error';

    await this.db
      .insertInto('script_execution_log')
      .values({
        script_id: script.id,
        cooperative_did: script.cooperativeDid,
        trigger_type: triggerType,
        trigger_detail: triggerDetail,
        duration_ms: result.durationMs,
        status,
        error: result.error ?? null,
      })
      .execute()
      .catch((err) => {
        logger.error({ err, scriptId: script.id }, 'Failed to log script execution');
      });

    return result;
  }

  // ─── Callback handler ─────────────────────────────────────────────────

  /**
   * Handle callback requests from the worker thread.
   * Each method is scoped to the cooperative's data.
   */
  private async handleCallback(
    cooperativeDid: string,
    method: string,
    args: unknown[],
  ): Promise<unknown> {
    switch (method) {
      case 'db.query':
        return this.handleDbQuery(cooperativeDid, args);
      case 'db.get':
        return this.handleDbGet(cooperativeDid, args);
      case 'db.count':
        return this.handleDbCount(cooperativeDid, args);
      case 'http.fetch':
        return this.handleHttpFetch(args);
      case 'email.send':
        return this.handleEmailSend(args);
      case 'pds.createRecord':
        return this.handlePdsCreateRecord(cooperativeDid, args);
      case 'emitEvent':
        return this.handleEmitEvent(cooperativeDid, args);
      default:
        throw new Error(`Unknown callback method: ${method}`);
    }
  }

  private async handleDbQuery(
    cooperativeDid: string,
    args: unknown[],
  ): Promise<unknown> {
    const collection = args[0] as string;
    const filters = (args[1] as ScriptDbQueryFilters | undefined) ?? {};

    // Scripts can only query records from their cooperative or their members
    let query = this.db
      .selectFrom('pds_record')
      .where('collection', '=', collection)
      .where('deleted_at', 'is', null)
      .select(['uri', 'did', 'collection', 'content']);

    if (filters.did) {
      query = query.where('did', '=', filters.did);
    } else {
      // Scope to cooperative's own records or its members' records
      query = query.where((eb) =>
        eb.or([
          eb('did', '=', cooperativeDid),
          eb.exists(
            eb
              .selectFrom('membership')
              .whereRef('membership.member_did', '=', 'pds_record.did')
              .where('membership.cooperative_did', '=', cooperativeDid)
              .where('membership.status', '=', 'active')
              .select('membership.id'),
          ),
        ]),
      );
    }

    const limit = Math.min(filters.limit ?? 100, 1000);
    const offset = filters.offset ?? 0;

    const rows = await query.limit(limit).offset(offset).execute();

    return rows.map((r) => ({
      uri: r.uri,
      did: r.did,
      collection: r.collection,
      content: typeof r.content === 'string' ? JSON.parse(r.content) : r.content,
    }));
  }

  private async handleDbGet(
    cooperativeDid: string,
    args: unknown[],
  ): Promise<unknown> {
    const uri = args[0] as string;

    const row = await this.db
      .selectFrom('pds_record')
      .where('uri', '=', uri)
      .where('deleted_at', 'is', null)
      .where((eb) =>
        eb.or([
          eb('did', '=', cooperativeDid),
          eb.exists(
            eb
              .selectFrom('membership')
              .whereRef('membership.member_did', '=', 'pds_record.did')
              .where('membership.cooperative_did', '=', cooperativeDid)
              .where('membership.status', '=', 'active')
              .select('membership.id'),
          ),
        ]),
      )
      .select(['uri', 'did', 'collection', 'content'])
      .executeTakeFirst();

    if (!row) return null;

    return {
      uri: row.uri,
      did: row.did,
      collection: row.collection,
      content: typeof row.content === 'string' ? JSON.parse(row.content) : row.content,
    };
  }

  private async handleDbCount(
    cooperativeDid: string,
    args: unknown[],
  ): Promise<unknown> {
    const collection = args[0] as string;
    const filters = (args[1] as ScriptDbCountFilters | undefined) ?? {};

    let query = this.db
      .selectFrom('pds_record')
      .where('collection', '=', collection)
      .where('deleted_at', 'is', null);

    if (filters.did) {
      query = query.where('did', '=', filters.did);
    } else {
      query = query.where((eb) =>
        eb.or([
          eb('did', '=', cooperativeDid),
          eb.exists(
            eb
              .selectFrom('membership')
              .whereRef('membership.member_did', '=', 'pds_record.did')
              .where('membership.cooperative_did', '=', cooperativeDid)
              .where('membership.status', '=', 'active')
              .select('membership.id'),
          ),
        ]),
      );
    }

    const result = await query
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .executeTakeFirst();

    return result?.count ?? 0;
  }

  private async handleHttpFetch(args: unknown[]): Promise<unknown> {
    const url = args[0] as string;
    const options = (args[1] as ScriptHttpOptions | undefined) ?? {};

    // SSRF protection
    validateWebhookUrl(url);

    const res = await fetch(url, {
      method: options.method ?? 'GET',
      headers: options.headers,
      body: options.body,
      signal: AbortSignal.timeout(10_000),
    });

    const body = await res.text();

    // Convert headers to plain object
    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return {
      status: res.status,
      headers,
      body,
    };
  }

  private async handleEmailSend(args: unknown[]): Promise<unknown> {
    const params = args[0] as ScriptEmailParams;

    await this.emailService.sendNotification({
      to: params.to,
      subject: params.subject,
      textBody: params.textBody,
      htmlBody: params.htmlBody,
    });

    return undefined;
  }

  private async handlePdsCreateRecord(
    cooperativeDid: string,
    args: unknown[],
  ): Promise<unknown> {
    const params = args[0] as ScriptPdsCreateParams;

    // Use a system operator DID — scripts run with cooperative authority
    const ref = await this.operatorWriteProxy.writeCoopRecord({
      operatorDid: cooperativeDid, // Cooperative is its own operator for scripts
      cooperativeDid: cooperativeDid as DID,
      collection: params.collection,
      record: params.record,
      rkey: params.rkey,
    });

    return { uri: ref.uri, cid: ref.cid };
  }

  private handleEmitEvent(
    cooperativeDid: string,
    args: unknown[],
  ): Promise<unknown> {
    const type = args[0] as string;
    const data = (args[1] as Record<string, unknown>) ?? {};

    emitAppEvent({
      // Domain events from scripts use a script-prefixed type
      type: `script.${type}` as AppEvent['type'],
      data,
      cooperativeDid,
    });

    return Promise.resolve(undefined);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private rowToScript(row: {
    id: string;
    cooperative_did: string;
    name: string;
    description: string | null;
    source_code: string;
    compiled_js: string | null;
    phase: string;
    collections: string[] | null;
    event_types: string[] | null;
    priority: number;
    enabled: boolean;
    config: Record<string, unknown> | null;
    timeout_ms: number;
    created_at: Date | string;
    updated_at: Date | string;
  }): CooperativeScript {
    return {
      id: row.id,
      cooperativeDid: row.cooperative_did,
      name: row.name,
      description: row.description,
      sourceCode: row.source_code,
      compiledJs: row.compiled_js,
      phase: row.phase,
      collections: row.collections,
      eventTypes: row.event_types,
      priority: row.priority,
      enabled: row.enabled,
      config: row.config,
      timeoutMs: row.timeout_ms,
      createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
      updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
    };
  }
}
