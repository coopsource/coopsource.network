import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { ToolDefinition } from '@coopsource/common';

/** Context available to agent tools */
export interface AgentToolContext {
  db: Kysely<Database>;
  cooperativeDid: string;
  actorDid: string;
}

/** An internal tool that agents can invoke */
export interface AgentTool {
  definition: ToolDefinition;
  /** Whether this tool only reads data (true) or can modify state (false) */
  readonly: boolean;
  execute(
    input: Record<string, unknown>,
    context: AgentToolContext,
  ): Promise<string>;
}

/** Registry of all internal tools, keyed by tool name */
const TOOL_REGISTRY = new Map<string, AgentTool>();
let initialized = false;

export function registerTool(tool: AgentTool): void {
  TOOL_REGISTRY.set(tool.definition.name, tool);
}

export function getTool(name: string): AgentTool | undefined {
  ensureTools();
  return TOOL_REGISTRY.get(name);
}

export function getToolDefinitions(allowedNames: string[]): ToolDefinition[] {
  ensureTools();
  if (allowedNames.length === 0) return [];
  return allowedNames
    .map((name) => TOOL_REGISTRY.get(name))
    .filter((t): t is AgentTool => t !== undefined)
    .map((t) => t.definition);
}

export function getAllToolNames(): string[] {
  ensureTools();
  return Array.from(TOOL_REGISTRY.keys());
}

/** Lazily initialize built-in tools. Safe to call multiple times. */
export function ensureTools(): void {
  if (initialized) return;
  initialized = true;
  // Register all built-in cooperative tools
  // This is done lazily to avoid circular import issues
  registerCooperativeToolsSync();
}

// Inline the tool registration to avoid circular dependency with cooperative-tools.ts
function registerCooperativeToolsSync(): void {
  // We register simple tools that just run DB queries
  // Each tool definition + executor is self-contained

  registerTool({
    definition: {
      name: 'list-members',
      description: 'List all active members of the cooperative.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max members to return (default 50)' },
        },
      },
    },
    readonly: true,
    async execute(input, ctx) {
      const limit = Math.min(Number(input.limit) || 50, 100);
      const rows = await ctx.db
        .selectFrom('membership')
        .innerJoin('entity', 'entity.did', 'membership.member_did')
        .where('membership.cooperative_did', '=', ctx.cooperativeDid)
        .where('membership.status', '=', 'active')
        .select(['entity.did', 'entity.display_name', 'entity.handle', 'membership.created_at'])
        .limit(limit)
        .execute();
      return JSON.stringify(rows);
    },
  });

  registerTool({
    definition: {
      name: 'get-member',
      description: 'Get details about a specific member by DID.',
      inputSchema: {
        type: 'object',
        properties: { did: { type: 'string', description: 'The member DID' } },
        required: ['did'],
      },
    },
    readonly: true,
    async execute(input, ctx) {
      const row = await ctx.db
        .selectFrom('membership')
        .innerJoin('entity', 'entity.did', 'membership.member_did')
        .where('membership.cooperative_did', '=', ctx.cooperativeDid)
        .where('membership.member_did', '=', String(input.did))
        .select(['entity.did', 'entity.display_name', 'entity.handle', 'membership.status', 'membership.created_at'])
        .executeTakeFirst();
      if (!row) return JSON.stringify({ error: 'Member not found' });
      return JSON.stringify(row);
    },
  });

  registerTool({
    definition: {
      name: 'list-proposals',
      description: 'List governance proposals for the cooperative.',
      inputSchema: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'Filter by status: draft, open, closed, resolved' },
          limit: { type: 'number', description: 'Max proposals to return (default 20)' },
        },
      },
    },
    readonly: true,
    async execute(input, ctx) {
      const limit = Math.min(Number(input.limit) || 20, 50);
      let query = ctx.db
        .selectFrom('proposal')
        .where('cooperative_did', '=', ctx.cooperativeDid)
        .selectAll()
        .orderBy('created_at', 'desc')
        .limit(limit);
      if (input.status) query = query.where('status', '=', String(input.status));
      return JSON.stringify(await query.execute());
    },
  });

  registerTool({
    definition: {
      name: 'get-proposal',
      description: 'Get details about a specific proposal by URI.',
      inputSchema: {
        type: 'object',
        properties: { uri: { type: 'string', description: 'The proposal AT URI' } },
        required: ['uri'],
      },
    },
    readonly: true,
    async execute(input, ctx) {
      const row = await ctx.db
        .selectFrom('proposal')
        .where('uri', '=', String(input.uri))
        .where('cooperative_did', '=', ctx.cooperativeDid)
        .selectAll()
        .executeTakeFirst();
      if (!row) return JSON.stringify({ error: 'Proposal not found' });
      const votes = await ctx.db
        .selectFrom('vote')
        .where('proposal_uri', '=', String(input.uri))
        .select(['choice'])
        .execute();
      return JSON.stringify({ ...row, votes });
    },
  });

  registerTool({
    definition: {
      name: 'list-agreements',
      description: 'List agreements for the cooperative.',
      inputSchema: {
        type: 'object',
        properties: { limit: { type: 'number', description: 'Max agreements to return (default 20)' } },
      },
    },
    readonly: true,
    async execute(input, ctx) {
      const limit = Math.min(Number(input.limit) || 20, 50);
      const rows = await ctx.db
        .selectFrom('agreement')
        .where('project_uri', '=', ctx.cooperativeDid)
        .selectAll()
        .orderBy('created_at', 'desc')
        .limit(limit)
        .execute();
      return JSON.stringify(rows);
    },
  });

  registerTool({
    definition: {
      name: 'get-agreement',
      description: 'Get details about a specific agreement by URI.',
      inputSchema: {
        type: 'object',
        properties: { uri: { type: 'string', description: 'The agreement AT URI' } },
        required: ['uri'],
      },
    },
    readonly: true,
    async execute(input, ctx) {
      const row = await ctx.db
        .selectFrom('agreement')
        .where('uri', '=', String(input.uri))
        .where('project_uri', '=', ctx.cooperativeDid)
        .selectAll()
        .executeTakeFirst();
      if (!row) return JSON.stringify({ error: 'Agreement not found' });
      const signatures = await ctx.db
        .selectFrom('agreement_signature')
        .where('agreement_uri', '=', String(input.uri))
        .selectAll()
        .execute();
      return JSON.stringify({ ...row, signatures });
    },
  });

  registerTool({
    definition: {
      name: 'list-campaigns',
      description: 'List funding campaigns for the cooperative.',
      inputSchema: {
        type: 'object',
        properties: { limit: { type: 'number', description: 'Max campaigns to return (default 20)' } },
      },
    },
    readonly: true,
    async execute(input, ctx) {
      const limit = Math.min(Number(input.limit) || 20, 50);
      const rows = await ctx.db
        .selectFrom('funding_campaign')
        .where('beneficiary_uri', '=', ctx.cooperativeDid)
        .selectAll()
        .orderBy('created_at', 'desc')
        .limit(limit)
        .execute();
      return JSON.stringify(rows);
    },
  });

  registerTool({
    definition: {
      name: 'get-campaign',
      description: 'Get details about a specific campaign by URI.',
      inputSchema: {
        type: 'object',
        properties: { uri: { type: 'string', description: 'The campaign AT URI' } },
        required: ['uri'],
      },
    },
    readonly: true,
    async execute(input, ctx) {
      const row = await ctx.db
        .selectFrom('funding_campaign')
        .where('uri', '=', String(input.uri))
        .where('beneficiary_uri', '=', ctx.cooperativeDid)
        .selectAll()
        .executeTakeFirst();
      if (!row) return JSON.stringify({ error: 'Campaign not found' });
      const pledges = await ctx.db
        .selectFrom('funding_pledge')
        .where('campaign_uri', '=', String(input.uri))
        .selectAll()
        .execute();
      return JSON.stringify({ ...row, pledgeCount: pledges.length, pledges });
    },
  });

  registerTool({
    definition: {
      name: 'list-posts',
      description: 'List recent discussion posts in the cooperative.',
      inputSchema: {
        type: 'object',
        properties: { limit: { type: 'number', description: 'Max posts to return (default 20)' } },
      },
    },
    readonly: true,
    async execute(input, ctx) {
      const limit = Math.min(Number(input.limit) || 20, 50);
      const rows = await ctx.db
        .selectFrom('post')
        .innerJoin('thread', 'thread.id', 'post.thread_id')
        .where('thread.cooperative_did', '=', ctx.cooperativeDid)
        .select(['post.id', 'post.body', 'post.author_did', 'post.created_at', 'thread.title'])
        .orderBy('post.created_at', 'desc')
        .limit(limit)
        .execute();
      return JSON.stringify(rows);
    },
  });

  registerTool({
    definition: {
      name: 'get-cooperative-info',
      description: 'Get information about the current cooperative.',
      inputSchema: { type: 'object', properties: {} },
    },
    readonly: true,
    async execute(_input, ctx) {
      const entity = await ctx.db
        .selectFrom('entity')
        .where('did', '=', ctx.cooperativeDid)
        .selectAll()
        .executeTakeFirst();
      const profile = await ctx.db
        .selectFrom('cooperative_profile')
        .where('entity_did', '=', ctx.cooperativeDid)
        .selectAll()
        .executeTakeFirst();
      const memberCount = await ctx.db
        .selectFrom('membership')
        .where('cooperative_did', '=', ctx.cooperativeDid)
        .where('status', '=', 'active')
        .select(ctx.db.fn.count('id').as('count'))
        .executeTakeFirst();
      return JSON.stringify({
        ...entity,
        profile,
        activeMemberCount: Number(memberCount?.count ?? 0),
      });
    },
  });
}
