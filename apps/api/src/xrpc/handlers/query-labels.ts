import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { XrpcContext } from '../dispatcher.js';

interface ATProtoLabel {
  ver: number;
  src: string;
  uri: string;
  cid?: string;
  val: string;
  neg: boolean;
  cts: string;
}

function rowToAtprotoLabel(row: {
  src_did: string;
  subject_uri: string;
  subject_cid: string | null;
  label_value: string;
  neg: boolean;
  created_at: Date | string;
}): ATProtoLabel {
  return {
    ver: 1,
    src: row.src_did,
    uri: row.subject_uri,
    cid: row.subject_cid ?? undefined,
    val: row.label_value,
    neg: row.neg,
    cts: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : new Date(row.created_at).toISOString(),
  };
}

function asArray(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(String);
  return [String(val)];
}

/**
 * Migrated from apps/api/src/routes/xrpc-labels.ts.
 * Returns a handler function that closes over the db instance.
 */
export function handleQueryLabels(
  db: Kysely<Database>,
): (ctx: XrpcContext) => Promise<unknown> {
  return async (ctx: XrpcContext) => {
    const uriPatterns = asArray(ctx.params.uriPatterns);
    const sources = asArray(ctx.params.sources);
    const limit = Math.min(
      Math.max(Number(ctx.params.limit) || 50, 1),
      250,
    );
    const cursor = ctx.params.cursor as string | undefined;

    let query = db
      .selectFrom('governance_label')
      .orderBy('seq', 'asc')
      .limit(limit + 1)
      .selectAll();

    if (cursor) {
      query = query.where('seq', '>', Number(cursor));
    }

    if (sources.length > 0) {
      query = query.where('src_did', 'in', sources);
    }

    if (uriPatterns.length > 0) {
      query = query.where((eb) =>
        eb.or(
          uriPatterns.map((pattern) => {
            if (pattern.includes('*')) {
              return eb(
                'subject_uri',
                'like',
                pattern.replace(/\*/g, '%'),
              );
            }
            return eb('subject_uri', '=', pattern);
          }),
        ),
      );
    }

    const rows = await query.execute();

    const hasMore = rows.length > limit;
    const results = hasMore ? rows.slice(0, limit) : rows;
    const labels = results.map(rowToAtprotoLabel);
    const nextCursor =
      hasMore && results.length > 0
        ? String(results[results.length - 1]!.seq)
        : undefined;

    return {
      cursor: nextCursor,
      labels,
    };
  };
}
