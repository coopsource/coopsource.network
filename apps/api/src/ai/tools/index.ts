/**
 * AI SDK v6 tool definitions — used by ChatEngine for generateText/streamText.
 */
import { tool, type Tool } from 'ai';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { DID } from '@coopsource/common';
import type { MembershipReadModel } from '../../services/membership-read-model.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTool = Tool<any, any>;
type ToolSet = Record<string, AnyTool>;

/** Context available to agent tools */
export interface AgentToolContext {
  db: Kysely<Database>;
  membershipReadModel: MembershipReadModel;
  cooperativeDid: string;
  actorDid: string;
}

/**
 * Build AI SDK v6 tool set from allowed tool names.
 * Returns a Record<string, Tool> suitable for generateText/streamText.
 *
 * Context is closure-captured — each tool receives typed, validated params
 * from the AI SDK (via Zod schemas) instead of untyped Record<string, unknown>.
 */
export function buildAiSdkTools(
  allowedNames: string[],
  context: AgentToolContext,
): ToolSet {
  if (allowedNames.length === 0) return {};

  const allTools = createToolDefinitions(context);
  const result: ToolSet = {};
  for (const name of allowedNames) {
    if (name in allTools) {
      result[name] = allTools[name as keyof typeof allTools];
    }
  }
  return result;
}

/** All available tool names for validation and UI */
export function getAllToolNames(): string[] {
  return [
    'list-members',
    'get-member',
    'list-proposals',
    'get-proposal',
    'list-agreements',
    'get-agreement',
    'list-campaigns',
    'get-campaign',
    'list-posts',
    'get-cooperative-info',
  ];
}

function createToolDefinitions(ctx: AgentToolContext) {
  return {
    'list-members': tool({
      description: 'List all active members of the cooperative.',
      inputSchema: z.object({
        limit: z
          .number()
          .optional()
          .describe('Max members to return (default 50)'),
      }),
      execute: async ({ limit }) => {
        const l = Math.min(limit ?? 50, 100);
        const result = await ctx.membershipReadModel.listMembersResult(
          ctx.cooperativeDid as DID,
          { limit: l },
        );
        if (!result.ok) return JSON.stringify(result);

        const dids = result.page.items.map((member) => member.did);
        const handles =
          dids.length > 0
            ? await ctx.db
                .selectFrom('entity')
                .where('did', 'in', dids)
                .select(['did', 'handle'])
                .execute()
            : [];
        const handleMap = new Map(handles.map((row) => [row.did, row.handle]));

        return JSON.stringify(
          result.page.items.map((member) => ({
            did: member.did,
            displayName: member.displayName,
            handle: handleMap.get(member.did) ?? null,
            status: member.status,
            joinedAt: member.joinedAt,
          })),
        );
      },
    }),

    'get-member': tool({
      description: 'Get details about a specific member by DID.',
      inputSchema: z.object({
        did: z.string().describe('The member DID'),
      }),
      execute: async ({ did }) => {
        const result = await ctx.membershipReadModel.getMemberResult(
          ctx.cooperativeDid as DID,
          did as DID,
        );
        if (!result.ok) return JSON.stringify(result);
        if (!result.member)
          return JSON.stringify({ error: 'Member not found' });

        const entity = await ctx.db
          .selectFrom('entity')
          .where('did', '=', did)
          .select(['handle'])
          .executeTakeFirst();
        return JSON.stringify({
          did: result.member.did,
          displayName: result.member.displayName,
          handle: entity?.handle ?? null,
          status: result.member.status,
          joinedAt: result.member.joinedAt,
        });
      },
    }),

    'list-proposals': tool({
      description: 'List governance proposals for the cooperative.',
      inputSchema: z.object({
        status: z
          .string()
          .optional()
          .describe('Filter by status: draft, open, closed, resolved'),
        limit: z
          .number()
          .optional()
          .describe('Max proposals to return (default 20)'),
      }),
      execute: async ({ status, limit }) => {
        const l = Math.min(limit ?? 20, 50);
        let query = ctx.db
          .selectFrom('proposal')
          .where('cooperative_did', '=', ctx.cooperativeDid)
          .selectAll()
          .orderBy('created_at', 'desc')
          .limit(l);
        if (status) query = query.where('status', '=', status);
        return JSON.stringify(await query.execute());
      },
    }),

    'get-proposal': tool({
      description: 'Get details about a specific proposal by URI.',
      inputSchema: z.object({
        uri: z.string().describe('The proposal AT URI'),
      }),
      execute: async ({ uri }) => {
        const row = await ctx.db
          .selectFrom('proposal')
          .where('uri', '=', uri)
          .where('cooperative_did', '=', ctx.cooperativeDid)
          .selectAll()
          .executeTakeFirst();
        if (!row) return JSON.stringify({ error: 'Proposal not found' });
        const votes = await ctx.db
          .selectFrom('vote')
          .where('proposal_uri', '=', uri)
          .select(['choice'])
          .execute();
        return JSON.stringify({ ...row, votes });
      },
    }),

    'list-agreements': tool({
      description: 'List agreements for the cooperative.',
      inputSchema: z.object({
        limit: z
          .number()
          .optional()
          .describe('Max agreements to return (default 20)'),
      }),
      execute: async ({ limit }) => {
        const l = Math.min(limit ?? 20, 50);
        const rows = await ctx.db
          .selectFrom('agreement')
          .where('project_uri', '=', ctx.cooperativeDid)
          .selectAll()
          .orderBy('created_at', 'desc')
          .limit(l)
          .execute();
        return JSON.stringify(rows);
      },
    }),

    'get-agreement': tool({
      description: 'Get details about a specific agreement by URI.',
      inputSchema: z.object({
        uri: z.string().describe('The agreement AT URI'),
      }),
      execute: async ({ uri }) => {
        const row = await ctx.db
          .selectFrom('agreement')
          .where('uri', '=', uri)
          .where('project_uri', '=', ctx.cooperativeDid)
          .selectAll()
          .executeTakeFirst();
        if (!row) return JSON.stringify({ error: 'Agreement not found' });
        const signatures = await ctx.db
          .selectFrom('agreement_signature')
          .where('agreement_uri', '=', uri)
          .selectAll()
          .execute();
        return JSON.stringify({ ...row, signatures });
      },
    }),

    'list-campaigns': tool({
      description: 'List funding campaigns for the cooperative.',
      inputSchema: z.object({
        limit: z
          .number()
          .optional()
          .describe('Max campaigns to return (default 20)'),
      }),
      execute: async ({ limit }) => {
        const l = Math.min(limit ?? 20, 50);
        const rows = await ctx.db
          .selectFrom('funding_campaign')
          .where('beneficiary_uri', '=', ctx.cooperativeDid)
          .selectAll()
          .orderBy('created_at', 'desc')
          .limit(l)
          .execute();
        return JSON.stringify(rows);
      },
    }),

    'get-campaign': tool({
      description: 'Get details about a specific campaign by URI.',
      inputSchema: z.object({
        uri: z.string().describe('The campaign AT URI'),
      }),
      execute: async ({ uri }) => {
        const row = await ctx.db
          .selectFrom('funding_campaign')
          .where('uri', '=', uri)
          .where('beneficiary_uri', '=', ctx.cooperativeDid)
          .selectAll()
          .executeTakeFirst();
        if (!row) return JSON.stringify({ error: 'Campaign not found' });
        const pledges = await ctx.db
          .selectFrom('funding_pledge')
          .where('campaign_uri', '=', uri)
          .selectAll()
          .execute();
        return JSON.stringify({ ...row, pledgeCount: pledges.length, pledges });
      },
    }),

    'list-posts': tool({
      description: 'List recent discussion posts in the cooperative.',
      inputSchema: z.object({
        limit: z
          .number()
          .optional()
          .describe('Max posts to return (default 20)'),
      }),
      execute: async ({ limit }) => {
        const l = Math.min(limit ?? 20, 50);
        const rows = await ctx.db
          .selectFrom('post')
          .innerJoin('thread', 'thread.id', 'post.thread_id')
          .where('thread.cooperative_did', '=', ctx.cooperativeDid)
          .select([
            'post.id',
            'post.body',
            'post.author_did',
            'post.created_at',
            'thread.title',
          ])
          .orderBy('post.created_at', 'desc')
          .limit(l)
          .execute();
        return JSON.stringify(rows);
      },
    }),

    'get-cooperative-info': tool({
      description: 'Get information about the current cooperative.',
      inputSchema: z.object({}),
      execute: async () => {
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
        const memberCounts =
          await ctx.membershipReadModel.countProjectedActiveMembersByCooperative(
            [ctx.cooperativeDid as DID],
          );
        return JSON.stringify({
          ...entity,
          profile,
          activeMemberCount: memberCounts.get(ctx.cooperativeDid) ?? 0,
        });
      },
    }),
  } as const;
}
