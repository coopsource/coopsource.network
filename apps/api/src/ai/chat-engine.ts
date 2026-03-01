import { type Kysely, sql } from 'kysely';
import type { Database } from '@coopsource/db';
import type { IClock } from '@coopsource/federation';
import type {
  ChatMessage,
  ChatResponse,
  ChatStreamEvent,
  ModelRoutingConfig,
  TaskType,
} from '@coopsource/common';
import { NotFoundError, AppError } from '@coopsource/common';
import { ModelProviderRegistry } from './model-provider-registry.js';
import {
  getTool,
  getToolDefinitions,
  type AgentToolContext,
} from './tools/index.js';

const MAX_TOOL_LOOPS = 10;

interface AgentConfig {
  id: string;
  cooperativeDid: string;
  modelConfig: ModelRoutingConfig;
  systemPrompt: string;
  allowedTools: string[];
  temperature: number;
  maxTokensPerRequest: number;
  maxTokensPerSession: number;
  monthlyBudgetCents: number | null;
  enabled: boolean;
}

interface SendOptions {
  agentId: string;
  userDid: string;
  cooperativeDid: string;
  message: string;
  sessionId?: string;
  modelOverride?: string;
  taskType?: TaskType;
}

interface ChatResult {
  sessionId: string;
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export class ChatEngine {
  constructor(
    private db: Kysely<Database>,
    private clock: IClock,
    private modelProviderRegistry: ModelProviderRegistry,
  ) {}

  /** Send a message and get a complete response */
  async send(options: SendOptions): Promise<ChatResult> {
    const agent = await this.loadAgent(options.agentId, options.cooperativeDid);
    this.ensureEnabled(agent);

    const sessionId = await this.ensureSession(
      options.sessionId,
      agent.id,
      options.userDid,
    );

    // Check budgets
    await this.checkSessionBudget(sessionId, agent);
    await this.checkMonthlyBudget(agent);

    // Build message history
    const history = await this.loadHistory(sessionId);
    history.push({ role: 'user', content: options.message });

    // Save user message
    await this.saveMessage(sessionId, 'user', options.message);

    // Resolve model
    const taskType = options.taskType ?? 'chat';
    const { provider, modelId } = options.modelOverride
      ? await this.modelProviderRegistry.resolveModel(
          options.cooperativeDid,
          options.modelOverride,
        )
      : await this.modelProviderRegistry.resolveFromRouting(
          options.cooperativeDid,
          agent.modelConfig,
          taskType,
        );

    // Build tools
    const toolDefs = getToolDefinitions(agent.allowedTools);

    // Execute with tool loop
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let finalContent = '';
    let loopCount = 0;

    const messages = [...history];

    while (loopCount < MAX_TOOL_LOOPS) {
      loopCount++;

      const response: ChatResponse = await provider.chat({
        model: modelId,
        messages,
        tools: toolDefs.length > 0 ? toolDefs : undefined,
        temperature: agent.temperature,
        maxTokens: agent.maxTokensPerRequest,
        systemPrompt: agent.systemPrompt,
      });

      totalInputTokens += response.inputTokens;
      totalOutputTokens += response.outputTokens;

      if (
        response.stopReason === 'tool_use' &&
        response.toolCalls &&
        response.toolCalls.length > 0
      ) {
        // Add assistant message with tool calls
        messages.push({
          role: 'assistant',
          content: response.content,
          toolCalls: response.toolCalls,
        });

        // Execute each tool call
        const toolContext: AgentToolContext = {
          db: this.db,
          cooperativeDid: options.cooperativeDid,
          actorDid: options.userDid,
        };

        for (const tc of response.toolCalls) {
          const tool = getTool(tc.name);
          let result: string;
          if (tool && agent.allowedTools.includes(tc.name)) {
            try {
              result = await tool.execute(tc.input, toolContext);
            } catch (err) {
              result = JSON.stringify({
                error: err instanceof Error ? err.message : 'Tool execution failed',
              });
            }
          } else {
            result = JSON.stringify({ error: `Tool '${tc.name}' not available` });
          }

          messages.push({
            role: 'tool',
            content: result,
            toolCallId: tc.id,
          });
        }
        // Continue loop for next model call
      } else {
        // Done — end_turn or max_tokens
        finalContent = response.content;
        break;
      }
    }

    // Calculate cost
    const costMicrodollars = this.calculateCost(
      totalInputTokens,
      totalOutputTokens,
      modelId,
    );

    // Save assistant message
    await this.saveMessage(
      sessionId,
      'assistant',
      finalContent,
      null,
      totalInputTokens,
      totalOutputTokens,
      costMicrodollars,
      modelId,
    );

    // Update session totals
    await this.updateSessionUsage(
      sessionId,
      totalInputTokens,
      totalOutputTokens,
      costMicrodollars,
    );

    // Update monthly usage
    await this.updateMonthlyUsage(
      options.cooperativeDid,
      agent.id,
      totalInputTokens,
      totalOutputTokens,
      costMicrodollars,
    );

    return {
      sessionId,
      content: finalContent,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      model: modelId,
    };
  }

  /** Send a message and stream the response */
  async *sendStream(options: SendOptions): AsyncIterable<ChatStreamEvent> {
    const agent = await this.loadAgent(options.agentId, options.cooperativeDid);
    this.ensureEnabled(agent);

    const sessionId = await this.ensureSession(
      options.sessionId,
      agent.id,
      options.userDid,
    );

    await this.checkSessionBudget(sessionId, agent);
    await this.checkMonthlyBudget(agent);

    const history = await this.loadHistory(sessionId);
    history.push({ role: 'user', content: options.message });

    await this.saveMessage(sessionId, 'user', options.message);

    const taskType = options.taskType ?? 'chat';
    const { provider, modelId } = options.modelOverride
      ? await this.modelProviderRegistry.resolveModel(
          options.cooperativeDid,
          options.modelOverride,
        )
      : await this.modelProviderRegistry.resolveFromRouting(
          options.cooperativeDid,
          agent.modelConfig,
          taskType,
        );

    // Streaming does not support tool-use loops — tools are disabled
    // to avoid partial tool-call events with no execution.
    // Use the non-streaming send() method for tool-enabled agents.

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let fullContent = '';
    for await (const event of provider.chatStream({
      model: modelId,
      messages: history,
      temperature: agent.temperature,
      maxTokens: agent.maxTokensPerRequest,
      systemPrompt: agent.systemPrompt,
    })) {
      if (event.type === 'content_delta' && event.content) {
        fullContent += event.content;
      }
      if (event.type === 'done' && event.usage) {
        totalInputTokens = event.usage.inputTokens;
        totalOutputTokens = event.usage.outputTokens;
      }
      yield event;
    }

    const costMicrodollars = this.calculateCost(
      totalInputTokens,
      totalOutputTokens,
      modelId,
    );

    await this.saveMessage(
      sessionId,
      'assistant',
      fullContent,
      null,
      totalInputTokens,
      totalOutputTokens,
      costMicrodollars,
      modelId,
    );

    await this.updateSessionUsage(
      sessionId,
      totalInputTokens,
      totalOutputTokens,
      costMicrodollars,
    );

    await this.updateMonthlyUsage(
      options.cooperativeDid,
      agent.id,
      totalInputTokens,
      totalOutputTokens,
      costMicrodollars,
    );
  }

  // ─── Private ──────────────────────────────────────────────────────────

  private async loadAgent(
    agentId: string,
    cooperativeDid: string,
  ): Promise<AgentConfig> {
    const row = await this.db
      .selectFrom('agent_config')
      .where('id', '=', agentId)
      .where('cooperative_did', '=', cooperativeDid)
      .selectAll()
      .executeTakeFirst();

    if (!row) throw new NotFoundError('Agent not found');

    return {
      id: row.id as string,
      cooperativeDid: row.cooperative_did,
      modelConfig: row.model_config as unknown as ModelRoutingConfig,
      systemPrompt: row.system_prompt,
      allowedTools: row.allowed_tools as string[],
      temperature: row.temperature,
      maxTokensPerRequest: row.max_tokens_per_request,
      maxTokensPerSession: row.max_tokens_per_session,
      monthlyBudgetCents: row.monthly_budget_cents,
      enabled: row.enabled as boolean,
    };
  }

  private ensureEnabled(agent: AgentConfig): void {
    if (!agent.enabled) {
      throw new AppError('Agent is disabled', 403, 'AgentDisabled');
    }
  }

  private async ensureSession(
    sessionId: string | undefined,
    agentConfigId: string,
    userDid: string,
  ): Promise<string> {
    if (sessionId) {
      const existing = await this.db
        .selectFrom('agent_session')
        .where('id', '=', sessionId)
        .where('agent_config_id', '=', agentConfigId)
        .where('user_did', '=', userDid)
        .select('id')
        .executeTakeFirst();

      if (existing) return existing.id as string;
    }

    const [session] = await this.db
      .insertInto('agent_session')
      .values({
        agent_config_id: agentConfigId,
        user_did: userDid,
        status: 'active',
        total_input_tokens: 0,
        total_output_tokens: 0,
        total_cost_microdollars: 0,
        memory: '{}',
      })
      .returning('id')
      .execute();

    return session!.id as string;
  }

  private async loadHistory(sessionId: string): Promise<ChatMessage[]> {
    const rows = await this.db
      .selectFrom('agent_message')
      .where('session_id', '=', sessionId)
      .selectAll()
      .orderBy('created_at', 'asc')
      .limit(100)
      .execute();

    return rows.map((r) => ({
      role: r.role as ChatMessage['role'],
      content: r.content,
      toolCalls: r.tool_calls as ChatMessage['toolCalls'],
    }));
  }

  private async checkSessionBudget(
    sessionId: string,
    agent: AgentConfig,
  ): Promise<void> {
    const session = await this.db
      .selectFrom('agent_session')
      .where('id', '=', sessionId)
      .select([
        'total_input_tokens',
        'total_output_tokens',
      ])
      .executeTakeFirst();

    if (!session) return;

    const totalTokens =
      session.total_input_tokens + session.total_output_tokens;
    if (totalTokens >= agent.maxTokensPerSession) {
      throw new AppError(
        'Session token budget exceeded. Please start a new session.',
        429,
        'BudgetExceeded',
      );
    }
  }

  private async checkMonthlyBudget(agent: AgentConfig): Promise<void> {
    if (!agent.monthlyBudgetCents) return;

    const now = this.clock.now();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const usage = await this.db
      .selectFrom('agent_usage')
      .where('agent_config_id', '=', agent.id)
      .where('period', '=', period)
      .select('total_cost_microdollars')
      .executeTakeFirst();

    if (!usage) return;

    // Convert budget from cents to microdollars (1 cent = 10,000 microdollars)
    const budgetMicrodollars = agent.monthlyBudgetCents * 10_000;
    if (usage.total_cost_microdollars >= budgetMicrodollars) {
      throw new AppError(
        'Monthly budget exceeded for this agent.',
        429,
        'BudgetExceeded',
      );
    }
  }

  private async saveMessage(
    sessionId: string,
    role: string,
    content: string,
    toolCalls?: unknown[] | null,
    inputTokens = 0,
    outputTokens = 0,
    costMicrodollars = 0,
    model?: string,
  ): Promise<void> {
    await this.db
      .insertInto('agent_message')
      .values({
        session_id: sessionId,
        role,
        content,
        tool_calls: toolCalls ? JSON.stringify(toolCalls) : null,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_microdollars: costMicrodollars,
        model: model ?? null,
      })
      .execute();
  }

  private async updateSessionUsage(
    sessionId: string,
    inputTokens: number,
    outputTokens: number,
    costMicrodollars: number,
  ): Promise<void> {
    await sql`
      UPDATE agent_session SET
        total_input_tokens = total_input_tokens + ${inputTokens}::int,
        total_output_tokens = total_output_tokens + ${outputTokens}::int,
        total_cost_microdollars = total_cost_microdollars + ${costMicrodollars}::int,
        updated_at = NOW()
      WHERE id = ${sessionId}
    `.execute(this.db);
  }

  private async updateMonthlyUsage(
    cooperativeDid: string,
    agentConfigId: string,
    inputTokens: number,
    outputTokens: number,
    costMicrodollars: number,
  ): Promise<void> {
    const now = this.clock.now();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Atomic upsert — INSERT ON CONFLICT to avoid TOCTOU race condition
    await sql`
      INSERT INTO agent_usage (cooperative_did, agent_config_id, period, total_requests, total_input_tokens, total_output_tokens, total_cost_microdollars)
      VALUES (${cooperativeDid}, ${agentConfigId}, ${period}, 1, ${inputTokens}::int, ${outputTokens}::int, ${costMicrodollars}::int)
      ON CONFLICT (cooperative_did, agent_config_id, period) DO UPDATE SET
        total_requests = agent_usage.total_requests + 1,
        total_input_tokens = agent_usage.total_input_tokens + ${inputTokens}::int,
        total_output_tokens = agent_usage.total_output_tokens + ${outputTokens}::int,
        total_cost_microdollars = agent_usage.total_cost_microdollars + ${costMicrodollars}::int,
        updated_at = NOW()
    `.execute(this.db);
  }

  private calculateCost(
    inputTokens: number,
    outputTokens: number,
    modelId: string,
  ): number {
    // Look up pricing from provider info
    const allProviders = ModelProviderRegistry.getSupportedProviders();
    let inputPrice = 3_000_000; // Default: Sonnet-level
    let outputPrice = 15_000_000;

    for (const provider of allProviders) {
      const model = provider.supportedModels.find((m) => m.id === modelId);
      if (model) {
        inputPrice = model.inputPricePer1M;
        outputPrice = model.outputPricePer1M;
        break;
      }
    }

    // Local models (Ollama) have $0 pricing
    const inputCost = Math.round((inputTokens / 1_000_000) * inputPrice);
    const outputCost = Math.round((outputTokens / 1_000_000) * outputPrice);
    return inputCost + outputCost;
  }
}
