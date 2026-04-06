/**
 * Generic declarative handler factory.
 *
 * Takes a DeclarativeHookConfig and returns a postHandler function that
 * interprets the config to perform database operations via Kysely's sql tag.
 * All dynamic table/column names use sql.ref() or sql.table() — never
 * string interpolation.
 */

import { sql } from 'kysely';
import type { HookContext } from '../types.js';
import type { DeclarativeHookConfig, FieldMapping, CounterMapping } from './types.js';

/**
 * Resolve a field value from the record content, applying transform + default.
 */
function resolveField(
  content: Record<string, unknown> | undefined,
  mapping: FieldMapping,
): unknown {
  const raw = content?.[mapping.recordField];
  const value = raw !== undefined ? raw : mapping.defaultValue;

  if (value === undefined) return null;

  switch (mapping.transform) {
    case 'json_stringify':
      return JSON.stringify(value);
    case 'date_parse':
      return typeof value === 'string' ? new Date(value) : value;
    default:
      return value;
  }
}

/**
 * Resolve the primary key value from the hook context.
 */
function resolvePrimaryKey(
  ctx: HookContext,
  config: DeclarativeHookConfig,
): string {
  return config.primaryKey.source === 'event.uri'
    ? ctx.event.uri
    : ctx.event.did;
}

/**
 * Create a postHandler from a declarative config.
 *
 * The handler interprets the config at runtime:
 * - Delete: applies soft-delete (set timestamp) or hard-delete (DELETE FROM)
 * - Create/Update with 'update-only': SELECT then UPDATE existing rows only
 * - Create/Update with 'upsert': INSERT ON CONFLICT DO UPDATE
 * - Counter mappings: increment on create, decrement on delete
 * - indexedAtColumn: always set to NOW() on writes
 */
export function createDeclarativeHandler(
  config: DeclarativeHookConfig,
): (ctx: HookContext) => Promise<void> {
  return async (ctx: HookContext): Promise<void> => {
    const { db, event, operation } = ctx;
    const content = ctx.record.content;
    const pkValue = resolvePrimaryKey(ctx, config);

    // ── Counter-only mode (e.g., RSVP) ───────────────────────────────
    // When there are counter mappings but no field mappings, this is a
    // counter-only config (like calendar.rsvp).
    if (config.counterMappings && config.counterMappings.length > 0 && config.fieldMappings.length === 0) {
      await handleCounterOnly(ctx, config);
      return;
    }

    // ── Delete handling ──────────────────────────────────────────────
    if (operation === 'delete') {
      await handleDelete(db, config, pkValue);
      await handleCounters(ctx, config, 'delete');
      return;
    }

    // ── Create / Update handling ─────────────────────────────────────
    if (!content) return;

    if (config.writeMode === 'update-only') {
      await handleUpdateOnly(ctx, config, pkValue, content);
    } else {
      await handleUpsert(ctx, config, pkValue, content);
    }

    await handleCounters(ctx, config, operation);
  };
}

// ─── Delete strategy ────────────────────────────────────────────────────

async function handleDelete(
  db: HookContext['db'],
  config: DeclarativeHookConfig,
  pkValue: string,
): Promise<void> {
  if (config.deleteStrategy === 'ignore') return;

  if (config.deleteStrategy === 'soft-delete' && config.softDeleteColumn) {
    await sql`
      UPDATE ${sql.table(config.targetTable)}
      SET ${sql.ref(config.softDeleteColumn)} = NOW()
      WHERE ${sql.ref(config.primaryKey.column)} = ${pkValue}
    `.execute(db);
  } else if (config.deleteStrategy === 'hard-delete') {
    await sql`
      DELETE FROM ${sql.table(config.targetTable)}
      WHERE ${sql.ref(config.primaryKey.column)} = ${pkValue}
    `.execute(db);
  }
}

// ─── Update-only mode ───────────────────────────────────────────────────

async function handleUpdateOnly(
  ctx: HookContext,
  config: DeclarativeHookConfig,
  pkValue: string,
  content: Record<string, unknown>,
): Promise<void> {
  const { db } = ctx;

  // Check if row exists
  const exists = await sql`
    SELECT 1 FROM ${sql.table(config.targetTable)}
    WHERE ${sql.ref(config.primaryKey.column)} = ${pkValue}
    LIMIT 1
  `.execute(db);

  if (exists.rows.length === 0) return;

  // Build SET clause dynamically
  const setClauses: ReturnType<typeof sql>[] = [];

  for (const mapping of config.fieldMappings) {
    const value = resolveField(content, mapping);
    setClauses.push(sql`${sql.ref(mapping.column)} = ${value}`);
  }

  if (config.indexedAtColumn) {
    setClauses.push(sql`${sql.ref(config.indexedAtColumn)} = NOW()`);
  }
  if (config.additionalTimestampColumns) {
    for (const col of config.additionalTimestampColumns) {
      setClauses.push(sql`${sql.ref(col)} = NOW()`);
    }
  }

  if (setClauses.length === 0) return;

  await sql`
    UPDATE ${sql.table(config.targetTable)}
    SET ${sql.join(setClauses, sql`, `)}
    WHERE ${sql.ref(config.primaryKey.column)} = ${pkValue}
  `.execute(db);
}

// ─── Upsert mode ────────────────────────────────────────────────────────

async function handleUpsert(
  ctx: HookContext,
  config: DeclarativeHookConfig,
  pkValue: string,
  content: Record<string, unknown>,
): Promise<void> {
  const { db, event } = ctx;

  // Build column list and value list for INSERT
  const insertColumns: ReturnType<typeof sql>[] = [sql.ref(config.primaryKey.column)];
  const insertValues: ReturnType<typeof sql>[] = [sql`${pkValue}`];

  // Build SET clause for ON CONFLICT UPDATE
  const updateClauses: ReturnType<typeof sql>[] = [];

  for (const mapping of config.fieldMappings) {
    const value = resolveField(content, mapping);

    // Special case: fields sourced from event.did
    const effectiveValue = mapping.recordField === '$did' ? event.did : value;

    insertColumns.push(sql.ref(mapping.column));
    insertValues.push(sql`${effectiveValue}`);
    updateClauses.push(sql`${sql.ref(mapping.column)} = ${effectiveValue}`);
  }

  if (config.indexedAtColumn) {
    insertColumns.push(sql.ref(config.indexedAtColumn));
    insertValues.push(sql`NOW()`);
    updateClauses.push(sql`${sql.ref(config.indexedAtColumn)} = NOW()`);
  }
  if (config.additionalTimestampColumns) {
    for (const col of config.additionalTimestampColumns) {
      insertColumns.push(sql.ref(col));
      insertValues.push(sql`NOW()`);
      updateClauses.push(sql`${sql.ref(col)} = NOW()`);
    }
  }

  await sql`
    INSERT INTO ${sql.table(config.targetTable)} (${sql.join(insertColumns, sql`, `)})
    VALUES (${sql.join(insertValues, sql`, `)})
    ON CONFLICT (${sql.ref(config.primaryKey.column)}) DO UPDATE
    SET ${sql.join(updateClauses, sql`, `)}
  `.execute(db);
}

// ─── Counter handling ───────────────────────────────────────────────────

async function handleCounters(
  ctx: HookContext,
  config: DeclarativeHookConfig,
  operation: 'create' | 'update' | 'delete',
): Promise<void> {
  if (!config.counterMappings || config.counterMappings.length === 0) return;

  for (const counter of config.counterMappings) {
    await applyCounter(ctx, counter, operation);
  }
}

async function applyCounter(
  ctx: HookContext,
  counter: CounterMapping,
  operation: 'create' | 'update' | 'delete',
): Promise<void> {
  const { db } = ctx;
  const content = ctx.record.content;

  const fkValue = typeof content?.[counter.foreignKey.recordField] === 'string'
    ? content[counter.foreignKey.recordField] as string
    : null;

  if (!fkValue) return;

  if (operation === 'create') {
    await sql`
      UPDATE ${sql.table(counter.targetTable)}
      SET ${sql.ref(counter.column)} = ${sql.ref(counter.column)} + 1
      WHERE ${sql.ref(counter.foreignKey.column)} = ${fkValue}
    `.execute(db);
  } else if (operation === 'delete') {
    await sql`
      UPDATE ${sql.table(counter.targetTable)}
      SET ${sql.ref(counter.column)} = ${sql.ref(counter.column)} - 1
      WHERE ${sql.ref(counter.foreignKey.column)} = ${fkValue}
        AND ${sql.ref(counter.column)} > 0
    `.execute(db);
  }
}

// ─── Counter-only mode ──────────────────────────────────────────────────

/**
 * Handle records that only affect counters on related tables
 * (no direct table write). E.g., calendar.rsvp increments rsvp_count.
 */
async function handleCounterOnly(
  ctx: HookContext,
  config: DeclarativeHookConfig,
): Promise<void> {
  const { operation } = ctx;

  if (!config.counterMappings) return;

  // Counter-only records: create → increment, delete → decrement, update → no-op
  if (operation === 'create' || operation === 'delete') {
    for (const counter of config.counterMappings) {
      await applyCounter(ctx, counter, operation);
    }
  }
}
