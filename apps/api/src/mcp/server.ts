import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response, NextFunction, Router } from 'express';
import { Router as createRouter } from 'express';
import { sql, type Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import { lexiconSchemas } from '@coopsource/lexicons';
import { z } from 'zod';
import crypto from 'node:crypto';
import { getFirehoseHealth } from '../appview/loop.js';

/**
 * MCP Server — exposes cooperative data as MCP resources and tools.
 *
 * Authenticates via bearer token (api_token table).
 * External AI tools (Claude Desktop, etc.) can connect to read co-op data.
 *
 * A fresh McpServer is created per request to avoid cross-request
 * token contamination under concurrent connections.
 */

interface TokenInfo {
  cooperativeDid: string;
  userDid: string;
  scopes: string[];
}

async function resolveToken(
  db: Kysely<Database>,
  token: string,
): Promise<TokenInfo | null> {
  const hash = crypto.createHash('sha256').update(token).digest('hex');

  const row = await db
    .selectFrom('api_token')
    .where('token_hash', '=', hash)
    .selectAll()
    .executeTakeFirst();

  if (!row) return null;

  if (row.expires_at && new Date(row.expires_at as unknown as string) < new Date()) {
    return null;
  }

  await db
    .updateTable('api_token')
    .set({ last_used_at: new Date() })
    .where('id', '=', row.id as string)
    .execute();

  return {
    cooperativeDid: row.cooperative_did,
    userDid: row.user_did,
    scopes: row.scopes as string[],
  };
}

/** Create a per-request MCP server scoped to a specific cooperative */
function createScopedMcpServer(
  db: Kysely<Database>,
  tokenInfo: TokenInfo,
): McpServer {
  const mcpServer = new McpServer({
    name: 'coopsource',
    version: '1.0.0',
  });

  const coopDid = tokenInfo.cooperativeDid;

  mcpServer.tool(
    'list-members',
    'List active members of a cooperative',
    { limit: z.number().optional().describe('Max results (default 50)') },
    async ({ limit }) => {
      const l = Math.min(limit ?? 50, 100);
      const rows = await db
        .selectFrom('membership')
        .innerJoin('entity', 'entity.did', 'membership.member_did')
        .where('membership.cooperative_did', '=', coopDid)
        .where('membership.status', '=', 'active')
        .select(['entity.did', 'entity.display_name', 'entity.handle'])
        .limit(l)
        .execute();
      return { content: [{ type: 'text' as const, text: JSON.stringify(rows, null, 2) }] };
    },
  );

  mcpServer.tool(
    'list-proposals',
    'List governance proposals',
    {
      status: z.string().optional().describe('Filter by status'),
      limit: z.number().optional().describe('Max results (default 20)'),
    },
    async ({ status, limit }) => {
      const l = Math.min(limit ?? 20, 50);
      let query = db
        .selectFrom('proposal')
        .where('cooperative_did', '=', coopDid)
        .select(['uri', 'title', 'status', 'voting_type', 'created_at'])
        .orderBy('created_at', 'desc')
        .limit(l);
      if (status) query = query.where('status', '=', status);
      return { content: [{ type: 'text' as const, text: JSON.stringify(await query.execute(), null, 2) }] };
    },
  );

  mcpServer.tool(
    'list-agreements',
    'List agreements',
    { limit: z.number().optional().describe('Max results (default 20)') },
    async ({ limit }) => {
      const l = Math.min(limit ?? 20, 50);
      const rows = await db
        .selectFrom('agreement')
        .where('project_uri', '=', coopDid)
        .select(['uri', 'title', 'agreement_type', 'created_at'])
        .orderBy('created_at', 'desc')
        .limit(l)
        .execute();
      return { content: [{ type: 'text' as const, text: JSON.stringify(rows, null, 2) }] };
    },
  );

  mcpServer.tool(
    'get-cooperative-info',
    'Get information about the cooperative',
    {},
    async () => {
      const entity = await db
        .selectFrom('entity')
        .where('did', '=', coopDid)
        .select(['did', 'display_name', 'handle', 'type'])
        .executeTakeFirst();
      return { content: [{ type: 'text' as const, text: JSON.stringify(entity, null, 2) }] };
    },
  );

  // ─── Generic record tools ───────────────────────────────────────────────

  mcpServer.tool(
    'query-records',
    'Query indexed ATProto records by collection, with optional DID filter and time range',
    {
      collection: z.string().describe('Collection NSID (required)'),
      did: z.string().optional().describe('Filter by author DID'),
      since: z.string().optional().describe('ISO datetime — records indexed after this time'),
      limit: z.number().optional().describe('Max results (default 50, max 100)'),
      cursor: z.string().optional().describe('Cursor from previous page'),
    },
    async ({ collection, did, since, limit, cursor }) => {
      const l = Math.min(limit ?? 50, 100);

      let query = db
        .selectFrom('pds_record')
        .where('collection', '=', collection)
        .where('deleted_at', 'is', null)
        .select(['uri', 'did', 'collection', 'content', 'indexed_at'])
        .orderBy('indexed_at', 'desc')
        .orderBy('uri', 'desc')
        .limit(l + 1);

      if (did) {
        query = query.where('did', '=', did);
      }

      if (since) {
        query = query.where('indexed_at', '>', new Date(since));
      }

      if (cursor) {
        // cursor format: indexed_at|uri
        const sep = cursor.indexOf('|');
        if (sep !== -1) {
          const cursorTime = cursor.slice(0, sep);
          const cursorUri = cursor.slice(sep + 1);
          query = query.where((eb) =>
            eb.or([
              eb('indexed_at', '<', new Date(cursorTime)),
              eb.and([
                eb('indexed_at', '=', new Date(cursorTime)),
                eb('uri', '<', cursorUri),
              ]),
            ]),
          );
        }
      }

      const rows = await query.execute();

      const hasMore = rows.length > l;
      const page = hasMore ? rows.slice(0, l) : rows;

      let nextCursor: string | undefined;
      if (hasMore && page.length > 0) {
        const last = page[page.length - 1];
        nextCursor = `${new Date(last.indexed_at as unknown as string).toISOString()}|${last.uri}`;
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ records: page, cursor: nextCursor }, null, 2),
        }],
      };
    },
  );

  mcpServer.tool(
    'get-record',
    'Get a single ATProto record by AT URI',
    {
      uri: z.string().describe('AT URI (e.g., at://did:plc:abc/network.coopsource.org.membership/xyz)'),
    },
    async ({ uri }) => {
      const row = await db
        .selectFrom('pds_record')
        .where('uri', '=', uri)
        .where('deleted_at', 'is', null)
        .select(['uri', 'did', 'collection', 'rkey', 'cid', 'content', 'indexed_at'])
        .executeTakeFirst();

      if (!row) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Record not found' }) }],
          isError: true,
        };
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify(row, null, 2) }] };
    },
  );

  mcpServer.tool(
    'search-records',
    'Search across indexed ATProto records using text matching on record content',
    {
      query: z.string().describe('Search term'),
      collection: z.string().optional().describe('Limit to specific collection'),
      limit: z.number().optional().describe('Max results (default 20, max 50)'),
    },
    async ({ query: searchQuery, collection, limit }) => {
      const l = Math.min(limit ?? 20, 50);

      let q = db
        .selectFrom('pds_record')
        .where('deleted_at', 'is', null)
        .where(
          sql<boolean>`content::text ILIKE ${'%' + searchQuery.replace(/[%_\\]/g, '\\$&') + '%'}`,
        )
        .select(['uri', 'did', 'collection', 'content', 'indexed_at'])
        .orderBy('indexed_at', 'desc')
        .limit(l);

      if (collection) {
        q = q.where('collection', '=', collection);
      }

      const rows = await q.execute();

      return { content: [{ type: 'text' as const, text: JSON.stringify(rows, null, 2) }] };
    },
  );

  mcpServer.tool(
    'list-collections',
    'List distinct collections in indexed records with counts',
    {},
    async () => {
      const rows = await db
        .selectFrom('pds_record')
        .where('deleted_at', 'is', null)
        .select([
          'collection',
          db.fn.countAll<string>().as('count'),
        ])
        .groupBy('collection')
        .orderBy(sql`count(*) desc`)
        .execute();

      const result = rows.map((r) => ({
        collection: r.collection,
        count: Number(r.count),
      }));

      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  mcpServer.tool(
    'introspect-lexicon',
    'Return the lexicon schema JSON for a given NSID',
    {
      nsid: z.string().describe('Lexicon NSID (e.g., network.coopsource.org.membership)'),
    },
    async ({ nsid }) => {
      // Check built-in lexicons first
      const builtIn = (lexiconSchemas as unknown[]).find(
        (lex) => typeof lex === 'object' && lex !== null && 'id' in lex && (lex as { id: string }).id === nsid,
      );
      if (builtIn) {
        return { content: [{ type: 'text' as const, text: JSON.stringify(builtIn, null, 2) }] };
      }

      // Try registered_lexicon table (may not exist if P7 hasn't been implemented)
      try {
        const result = await sql<Record<string, unknown>>`
          SELECT * FROM registered_lexicon WHERE nsid = ${nsid} LIMIT 1
        `.execute(db);

        if (result.rows.length > 0) {
          return { content: [{ type: 'text' as const, text: JSON.stringify(result.rows[0], null, 2) }] };
        }
      } catch {
        // registered_lexicon table doesn't exist yet — that's fine
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: `Lexicon not found: ${nsid}` }) }],
        isError: true,
      };
    },
  );

  mcpServer.tool(
    'get-firehose-health',
    'Return current AppView firehose health stats',
    {},
    async () => {
      const health = getFirehoseHealth();
      return { content: [{ type: 'text' as const, text: JSON.stringify(health, null, 2) }] };
    },
  );

  return mcpServer;
}

export function createMcpRoutes(db: Kysely<Database>): Router {
  const router = createRouter();

  router.all('/mcp', async (req: Request, res: Response, _next: NextFunction) => {
    const authHeader = req.headers.authorization;
    let tokenInfo: TokenInfo | null = null;

    if (authHeader?.startsWith('Bearer ')) {
      tokenInfo = await resolveToken(db, authHeader.slice(7));
    }

    if (!tokenInfo) {
      res.status(401).json({ error: 'Invalid or missing API token' });
      return;
    }

    try {
      // Create a fresh server per request — avoids cross-request token leaks
      const mcpServer = createScopedMcpServer(db, tokenInfo);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
      });
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'MCP error',
        });
      }
    }
  });

  return router;
}
