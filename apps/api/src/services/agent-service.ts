import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { IClock } from '@coopsource/federation';
import type {
  CreateAgentConfigInput,
  UpdateAgentConfigInput,
  CreateAgentFromTemplateInput,
  ModelRoutingConfig,
} from '@coopsource/common';
import { NotFoundError } from '@coopsource/common';
import type { ModelProviderRegistry } from '../ai/model-provider-registry.js';

/** Default model routing templates per agent type */
const AGENT_TEMPLATES: Record<
  string,
  {
    systemPrompt: string;
    modelConfig: ModelRoutingConfig;
    allowedTools: string[];
  }
> = {
  facilitator: {
    systemPrompt:
      'You are a cooperative facilitator. Help members understand proposals, summarize discussions, and guide consensus-building. Be neutral and inclusive.',
    modelConfig: {
      chat: 'anthropic:claude-opus-4-20250514',
      summarization: 'anthropic:claude-haiku-4-5-20251001',
      automation: 'anthropic:claude-haiku-4-5-20251001',
    },
    allowedTools: [
      'list-proposals',
      'get-proposal',
      'list-posts',
      'list-members',
      'get-cooperative-info',
    ],
  },
  governance: {
    systemPrompt:
      'You are a governance analyst. Help members draft proposals, analyze voting patterns, and understand agreement implications. Provide data-driven insights.',
    modelConfig: {
      chat: 'anthropic:claude-sonnet-4-20250514',
      analysis: 'anthropic:claude-opus-4-20250514',
    },
    allowedTools: [
      'list-proposals',
      'get-proposal',
      'list-agreements',
      'get-agreement',
      'get-cooperative-info',
    ],
  },
  coordinator: {
    systemPrompt:
      'You are a coordination assistant. Help organize work, track action items from discussions, and keep members informed about deadlines and progress.',
    modelConfig: {
      chat: 'anthropic:claude-sonnet-4-20250514',
      summarization: 'anthropic:claude-haiku-4-5-20251001',
    },
    allowedTools: [
      'list-posts',
      'list-members',
      'get-member',
      'list-campaigns',
      'get-cooperative-info',
    ],
  },
  analyst: {
    systemPrompt:
      'You are a cooperative data analyst. Analyze member engagement, campaign performance, agreement compliance, and provide actionable insights.',
    modelConfig: {
      chat: 'anthropic:claude-sonnet-4-20250514',
      analysis: 'anthropic:claude-opus-4-20250514',
      summarization: 'anthropic:claude-haiku-4-5-20251001',
    },
    allowedTools: [
      'list-members',
      'list-proposals',
      'list-agreements',
      'list-campaigns',
      'get-campaign',
      'get-cooperative-info',
    ],
  },
};

export class AgentService {
  constructor(
    private db: Kysely<Database>,
    private clock: IClock,
    private modelProviderRegistry: ModelProviderRegistry,
  ) {}

  // ─── Agent CRUD ───────────────────────────────────────────────────────

  async createAgent(
    actorDid: string,
    cooperativeDid: string,
    data: CreateAgentConfigInput,
  ) {
    const [row] = await this.db
      .insertInto('agent_config')
      .values({
        cooperative_did: cooperativeDid,
        name: data.name,
        description: data.description ?? null,
        agent_type: data.agentType,
        model_config: JSON.stringify(data.modelConfig),
        system_prompt: data.systemPrompt,
        allowed_tools: JSON.stringify(data.allowedTools),
        context_sources: JSON.stringify(data.contextSources),
        temperature: data.temperature,
        max_tokens_per_request: data.maxTokensPerRequest,
        max_tokens_per_session: data.maxTokensPerSession,
        monthly_budget_cents: data.monthlyBudgetCents ?? null,
        enabled: data.enabled,
        created_by: actorDid,
      })
      .returningAll()
      .execute();

    return this.formatAgent(row!);
  }

  async updateAgent(
    cooperativeDid: string,
    agentId: string,
    data: UpdateAgentConfigInput,
  ) {
    const setValues: Record<string, unknown> = {
      updated_at: this.clock.now(),
    };

    if (data.name !== undefined) setValues.name = data.name;
    if (data.description !== undefined) setValues.description = data.description;
    if (data.agentType !== undefined) setValues.agent_type = data.agentType;
    if (data.modelConfig !== undefined)
      setValues.model_config = JSON.stringify(data.modelConfig);
    if (data.systemPrompt !== undefined)
      setValues.system_prompt = data.systemPrompt;
    if (data.allowedTools !== undefined)
      setValues.allowed_tools = JSON.stringify(data.allowedTools);
    if (data.contextSources !== undefined)
      setValues.context_sources = JSON.stringify(data.contextSources);
    if (data.temperature !== undefined) setValues.temperature = data.temperature;
    if (data.maxTokensPerRequest !== undefined)
      setValues.max_tokens_per_request = data.maxTokensPerRequest;
    if (data.maxTokensPerSession !== undefined)
      setValues.max_tokens_per_session = data.maxTokensPerSession;
    if (data.monthlyBudgetCents !== undefined)
      setValues.monthly_budget_cents = data.monthlyBudgetCents;
    if (data.enabled !== undefined) setValues.enabled = data.enabled;

    const [row] = await this.db
      .updateTable('agent_config')
      .set(setValues)
      .where('id', '=', agentId)
      .where('cooperative_did', '=', cooperativeDid)
      .returningAll()
      .execute();

    if (!row) {
      throw new NotFoundError('Agent not found');
    }

    return this.formatAgent(row);
  }

  async deleteAgent(cooperativeDid: string, agentId: string) {
    const result = await this.db
      .deleteFrom('agent_config')
      .where('id', '=', agentId)
      .where('cooperative_did', '=', cooperativeDid)
      .executeTakeFirst();

    if (Number(result.numDeletedRows) === 0) {
      throw new NotFoundError('Agent not found');
    }
  }

  async getAgent(cooperativeDid: string, agentId: string) {
    const row = await this.db
      .selectFrom('agent_config')
      .where('id', '=', agentId)
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .executeTakeFirst();

    if (!row) {
      throw new NotFoundError('Agent not found');
    }

    return this.formatAgent(row);
  }

  async listAgents(cooperativeDid: string, cursor?: string) {
    let query = this.db
      .selectFrom('agent_config')
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .orderBy('created_at', 'asc')
      .limit(50);

    if (cursor) {
      query = query.where('created_at', '>', new Date(cursor));
    }

    const rows = await query.execute();
    return rows.map((r) => this.formatAgent(r));
  }

  // ─── Templates ────────────────────────────────────────────────────────

  async createFromTemplate(
    actorDid: string,
    cooperativeDid: string,
    data: CreateAgentFromTemplateInput,
  ) {
    const template = AGENT_TEMPLATES[data.agentType];
    if (!template) {
      throw new NotFoundError(`No template for agent type '${data.agentType}'`);
    }

    // Validate template models against available providers, keeping what works
    const resolvedConfig = await this.resolveTemplateModels(
      cooperativeDid,
      template.modelConfig,
    );

    return this.createAgent(actorDid, cooperativeDid, {
      name: data.name ?? `${data.agentType.charAt(0).toUpperCase() + data.agentType.slice(1)} Agent`,
      agentType: data.agentType,
      modelConfig: resolvedConfig,
      systemPrompt: template.systemPrompt,
      allowedTools: template.allowedTools,
      contextSources: [],
      temperature: 0.7,
      maxTokensPerRequest: 4096,
      maxTokensPerSession: 100000,
      monthlyBudgetCents: data.monthlyBudgetCents,
      enabled: true,
    });
  }

  // ─── Available Models ─────────────────────────────────────────────────

  async getAvailableModels(cooperativeDid: string) {
    return this.modelProviderRegistry.getAvailableModels(cooperativeDid);
  }

  // ─── Sessions ─────────────────────────────────────────────────────────

  async listSessions(agentId: string, userDid: string, cursor?: string) {
    let query = this.db
      .selectFrom('agent_session')
      .where('agent_config_id', '=', agentId)
      .where('user_did', '=', userDid)
      .selectAll()
      .orderBy('updated_at', 'desc')
      .limit(50);

    if (cursor) {
      query = query.where('updated_at', '<', new Date(cursor));
    }

    return query.execute();
  }

  async getSession(sessionId: string) {
    const row = await this.db
      .selectFrom('agent_session')
      .where('id', '=', sessionId)
      .selectAll()
      .executeTakeFirst();

    if (!row) {
      throw new NotFoundError('Session not found');
    }

    return row;
  }

  async getSessionMessages(sessionId: string, userDid: string, cursor?: string) {
    // Verify session belongs to the requesting user
    const session = await this.db
      .selectFrom('agent_session')
      .where('id', '=', sessionId)
      .where('user_did', '=', userDid)
      .select('id')
      .executeTakeFirst();

    if (!session) {
      return [];
    }

    let query = this.db
      .selectFrom('agent_message')
      .where('session_id', '=', sessionId)
      .selectAll()
      .orderBy('created_at', 'asc')
      .limit(200);

    if (cursor) {
      query = query.where('created_at', '>', new Date(cursor));
    }

    return query.execute();
  }

  // ─── Usage ────────────────────────────────────────────────────────────

  async getUsage(cooperativeDid: string, period?: string) {
    const targetPeriod = period ?? this.getCurrentPeriod();

    return this.db
      .selectFrom('agent_usage')
      .where('cooperative_did', '=', cooperativeDid)
      .where('period', '=', targetPeriod)
      .selectAll()
      .execute();
  }

  async getAgentUsage(agentId: string, period?: string) {
    const targetPeriod = period ?? this.getCurrentPeriod();

    return this.db
      .selectFrom('agent_usage')
      .where('agent_config_id', '=', agentId)
      .where('period', '=', targetPeriod)
      .selectAll()
      .executeTakeFirst();
  }

  // ─── Private ──────────────────────────────────────────────────────────

  private getCurrentPeriod(): string {
    const now = this.clock.now();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private async resolveTemplateModels(
    cooperativeDid: string,
    templateConfig: ModelRoutingConfig,
  ): Promise<ModelRoutingConfig> {
    // Try to resolve each model in the template; keep the ones that work
    const config: ModelRoutingConfig = { chat: templateConfig.chat };

    // Check if template's chat model is available
    try {
      await this.modelProviderRegistry.resolveModel(
        cooperativeDid,
        templateConfig.chat,
      );
    } catch {
      // Chat model not available — use first available model from any provider
      const available =
        await this.modelProviderRegistry.getAvailableModels(cooperativeDid);
      if (available.length > 0 && available[0].models.length > 0) {
        config.chat = `${available[0].providerId}:${available[0].models[0].id}`;
      }
      // If no models at all, keep template value — it'll fail at runtime
    }

    // Copy optional routing entries that are resolvable
    for (const key of ['automation', 'summarization', 'analysis', 'fallback'] as const) {
      const val = templateConfig[key];
      if (val) {
        try {
          await this.modelProviderRegistry.resolveModel(cooperativeDid, val);
          config[key] = val;
        } catch {
          // Skip unavailable optional models
        }
      }
    }

    return config;
  }

  private formatAgent(row: Record<string, unknown>) {
    return {
      id: row.id as string,
      cooperativeDid: row.cooperative_did as string,
      name: row.name as string,
      description: row.description as string | null,
      agentType: row.agent_type as string,
      modelConfig: row.model_config as ModelRoutingConfig,
      systemPrompt: row.system_prompt as string,
      allowedTools: row.allowed_tools as string[],
      contextSources: row.context_sources as string[],
      temperature: row.temperature as number,
      maxTokensPerRequest: row.max_tokens_per_request as number,
      maxTokensPerSession: row.max_tokens_per_session as number,
      monthlyBudgetCents: row.monthly_budget_cents as number | null,
      enabled: row.enabled as boolean,
      createdBy: row.created_by as string,
      createdAt:
        row.created_at instanceof Date
          ? (row.created_at as Date).toISOString()
          : (row.created_at as string),
      updatedAt:
        row.updated_at instanceof Date
          ? (row.updated_at as Date).toISOString()
          : (row.updated_at as string),
    };
  }
}
