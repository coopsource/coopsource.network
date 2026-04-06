import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import { lexicons as lexiconsInstance, lexiconSchemas } from '@coopsource/lexicons';
import { logger } from '../middleware/logger.js';
import type { HookRegistry } from '../appview/hooks/registry.js';
import { createDeclarativeHandler } from '../appview/hooks/declarative/handler.js';
import type { DeclarativeHookConfig } from '../appview/hooks/declarative/types.js';
import type { HookRegistration } from '../appview/hooks/types.js';

/**
 * Minimal interface for the Lexicons.add() method.
 * Avoids importing @atproto/lexicon directly (not a dependency of the API package).
 */
interface LexiconsAdder {
  add(doc: Record<string, unknown>): void;
}
const lexiconsAdder = lexiconsInstance as unknown as LexiconsAdder;

/**
 * Manages runtime-registered lexicons.
 *
 * Built-in lexicons come from the @coopsource/lexicons package.
 * Admin-registered lexicons are stored in the registered_lexicon table
 * and optionally generate declarative hooks for indexing.
 */
export class LexiconManagementService {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly hookRegistry: HookRegistry,
  ) {}

  /**
   * Register a new lexicon at runtime.
   *
   * - Validates the NSID format
   * - Upserts the lexicon doc into the database
   * - Adds the schema to the runtime Lexicons instance for validation
   * - If fieldMappings are provided, registers a declarative hook
   */
  async registerLexicon(
    nsid: string,
    lexiconDoc: Record<string, unknown>,
    fieldMappings: DeclarativeHookConfig | null,
    registeredBy: string,
  ): Promise<void> {
    // Basic NSID format validation
    if (!nsid || !/^[a-z][a-z0-9.-]*[a-z0-9]$/.test(nsid)) {
      throw new Error(`Invalid NSID format: ${nsid}`);
    }

    // Validate fieldMappings structure if provided
    if (fieldMappings) {
      if (!fieldMappings.collection || !fieldMappings.targetTable) {
        throw new Error('fieldMappings must have collection and targetTable');
      }
      if (!Array.isArray(fieldMappings.fieldMappings)) {
        throw new Error('fieldMappings.fieldMappings must be an array');
      }
    }

    // Upsert to database
    await this.db
      .insertInto('registered_lexicon')
      .values({
        nsid,
        lexicon_doc: JSON.stringify(lexiconDoc),
        field_mappings: fieldMappings ? JSON.stringify(fieldMappings) : null,
        registered_by: registeredBy,
        enabled: true,
      })
      .onConflict((oc) =>
        oc.column('nsid').doUpdateSet({
          lexicon_doc: JSON.stringify(lexiconDoc),
          field_mappings: fieldMappings ? JSON.stringify(fieldMappings) : null,
          registered_by: registeredBy,
          enabled: true,
          updated_at: new Date(),
        }),
      )
      .execute();

    // Add to runtime Lexicons instance
    try {
      lexiconsAdder.add(lexiconDoc);
    } catch (err) {
      logger.warn({ err, nsid }, 'Failed to add lexicon to validator (may already exist)');
    }

    // Register declarative hook if field mappings provided
    if (fieldMappings) {
      this.registerDeclarativeHook(nsid, fieldMappings);
    }

    logger.info({ nsid, registeredBy }, 'Lexicon registered');
  }

  /**
   * Remove a registered lexicon.
   *
   * - Removes from database
   * - Unregisters any associated hook
   *
   * Note: does not remove from the runtime Lexicons instance (no remove API).
   */
  async removeLexicon(nsid: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('registered_lexicon')
      .where('nsid', '=', nsid)
      .execute();

    const deleted = result.length > 0 && (result[0]?.numDeletedRows ?? 0n) > 0n;

    // Unregister hook if exists
    const hookId = `registered:${nsid}`;
    this.hookRegistry.unregister(hookId);

    if (deleted) {
      logger.info({ nsid }, 'Lexicon removed');
    }

    return deleted;
  }

  /**
   * List all known lexicons: built-in (from @coopsource/lexicons) + registered.
   */
  async listLexicons(): Promise<LexiconListEntry[]> {
    const entries: LexiconListEntry[] = [];

    // Built-in lexicons
    for (const schema of lexiconSchemas) {
      const doc = schema as Record<string, unknown>;
      entries.push({
        nsid: (doc.id as string) ?? 'unknown',
        source: 'builtin',
        enabled: true,
        registeredBy: null,
        createdAt: null,
      });
    }

    // Registered lexicons
    const registered = await this.db
      .selectFrom('registered_lexicon')
      .selectAll()
      .orderBy('nsid')
      .execute();

    for (const row of registered) {
      entries.push({
        nsid: row.nsid,
        source: 'registered',
        enabled: row.enabled,
        registeredBy: row.registered_by,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      });
    }

    return entries;
  }

  /**
   * Get a single lexicon document by NSID.
   * Checks built-in schemas first, then registered.
   */
  async getLexicon(nsid: string): Promise<LexiconDetail | null> {
    // Check built-in
    for (const schema of lexiconSchemas) {
      const doc = schema as Record<string, unknown>;
      if (doc.id === nsid) {
        return {
          nsid,
          source: 'builtin',
          lexiconDoc: doc,
          fieldMappings: null,
          enabled: true,
        };
      }
    }

    // Check registered
    const row = await this.db
      .selectFrom('registered_lexicon')
      .where('nsid', '=', nsid)
      .selectAll()
      .executeTakeFirst();

    if (!row) return null;

    return {
      nsid: row.nsid,
      source: 'registered',
      lexiconDoc: row.lexicon_doc,
      fieldMappings: row.field_mappings as DeclarativeHookConfig | null,
      enabled: row.enabled,
    };
  }

  /**
   * Load all registered lexicons from the database at startup.
   * Adds schemas to the validator and registers declarative hooks.
   */
  async loadRegisteredLexicons(): Promise<void> {
    const rows = await this.db
      .selectFrom('registered_lexicon')
      .where('enabled', '=', true)
      .selectAll()
      .execute();

    let loaded = 0;
    for (const row of rows) {
      try {
        lexiconsAdder.add(row.lexicon_doc);
      } catch {
        // May already be loaded or invalid — skip silently
      }

      if (row.field_mappings) {
        const config = row.field_mappings as unknown as DeclarativeHookConfig;
        this.registerDeclarativeHook(row.nsid, config);
      }

      loaded++;
    }

    if (loaded > 0) {
      logger.info({ count: loaded }, 'Loaded registered lexicons from database');
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────

  private registerDeclarativeHook(nsid: string, config: DeclarativeHookConfig): void {
    const hookId = `registered:${nsid}`;

    // Unregister existing hook if present (for re-registration)
    this.hookRegistry.unregister(hookId);

    const hook: HookRegistration = {
      id: hookId,
      name: `Registered declarative indexer for ${nsid}`,
      phase: 'post-storage',
      source: 'declarative',
      collections: [config.collection],
      priority: 150,
      postHandler: createDeclarativeHandler(config),
    };

    this.hookRegistry.register(hook);
    logger.debug({ hookId, collection: config.collection }, 'Registered declarative hook for lexicon');
  }
}

// ─── Response types ──────────────────────────────────────────────────

export interface LexiconListEntry {
  nsid: string;
  source: 'builtin' | 'registered';
  enabled: boolean;
  registeredBy: string | null;
  createdAt: string | null;
}

export interface LexiconDetail {
  nsid: string;
  source: 'builtin' | 'registered';
  lexiconDoc: Record<string, unknown>;
  fieldMappings: DeclarativeHookConfig | null;
  enabled: boolean;
}
