import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response, NextFunction, Router } from 'express';
import { Router as createRouter } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import { z } from 'zod';
import crypto from 'node:crypto';

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
