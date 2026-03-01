import { type Kysely, sql } from 'kysely';
import type { Database } from '@coopsource/db';
import type { IClock } from '@coopsource/federation';
import type {
  ChatMessage,
  ChatStreamEvent,
  ModelRoutingConfig,
  TaskType,
} from '@coopsource/common';
import { NotFoundError, AppError } from '@coopsource/common';
import {
  generateText,
  streamText,
  stepCountIs,
  type ModelMessage,
  type StopCondition,
} from 'ai';
import { ModelProviderRegistry } from './model-provider-registry.js';
import {
  buildAiSdkTools,
  type AgentToolContext,
} from './tools/ai-sdk-tools.js';

const MAX_TOOL_LOOPS = 10;
const DOOM_LOOP_THRESHOLD = 3;

// ── Doom loop detection (inspired by opencode's processor.ts) ──────────
// Checks if the last 3 tool calls are identical (same tool, same params).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const detectDoomLoop: StopCondition<any> = ({ steps }) => {
  if (steps.length < DOOM_LOOP_THRESHOLD) return false;
  const recentCalls = steps
    .slice(-DOOM_LOOP_THRESHOLD)
    .flatMap((s) => s.toolCalls ?? [])
    .slice(-DOOM_LOOP_THRESHOLD);
  if (recentCalls.length < DOOM_LOOP_THRESHOLD) return false;
  const [a, b, c] = recentCalls;
  return (
    a.toolName === b.toolName &&
    b.toolName === c.toolName &&
    JSON.stringify(a.input) === JSON.stringify(b.input) &&
    JSON.stringify(b.input) === JSON.stringify(c.input)
  );
};

// ── Tool repair (adopted from opencode's llm.ts) ──────────────────────
// Handles model mistakes: try lowercase, then return null to let AI SDK
// surface the error to the model.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createRepairToolCall(tools: Record<string, any>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (options: { toolCall: any; error: any }) => {
    const { toolCall, error } = options;
    const lower = toolCall.toolName.toLowerCase();
    if (lower !== toolCall.toolName && tools[lower]) {
      return { ...toolCall, toolName: lower };
    }
    // Return null — AI SDK will surface the error to the model
    return null;
  };
}

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

export { detectDoomLoop, createRepairToolCall };

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

    // Save user message
    await this.saveMessage(sessionId, 'user', options.message);

    // Resolve AI SDK model
    const taskType = options.taskType ?? 'chat';
    const { model, modelId } = options.modelOverride
      ? await this.modelProviderRegistry.resolveLanguageModel(
          options.cooperativeDid,
          options.modelOverride,
        )
      : await this.modelProviderRegistry.resolveLanguageModelFromRouting(
          options.cooperativeDid,
          agent.modelConfig,
          taskType,
        );

    // Build AI SDK tools
    const toolContext: AgentToolContext = {
      db: this.db,
      cooperativeDid: options.cooperativeDid,
      actorDid: options.userDid,
    };
    const tools = buildAiSdkTools(agent.allowedTools, toolContext);
    const hasTools = Object.keys(tools).length > 0;

    // Convert history to AI SDK CoreMessage format
    const messages: ModelMessage[] = [
      ...this.toCoreMessages(history),
      { role: 'user' as const, content: options.message },
    ];

    // AI SDK handles the tool loop internally via stopWhen
    const result = await generateText({
      model,
      system: agent.systemPrompt,
      messages,
      tools: hasTools ? tools : undefined,
      temperature: agent.temperature,
      maxOutputTokens: agent.maxTokensPerRequest,
      stopWhen: hasTools
        ? [stepCountIs(MAX_TOOL_LOOPS), detectDoomLoop]
        : undefined,
      experimental_repairToolCall: hasTools
        ? createRepairToolCall(tools)
        : undefined,
    });

    const totalInputTokens = result.totalUsage.inputTokens ?? 0;
    const totalOutputTokens = result.totalUsage.outputTokens ?? 0;
    const finalContent = result.text;

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

  /** Send a message and stream the response — now supports tools via AI SDK v6 */
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

    await this.saveMessage(sessionId, 'user', options.message);

    const taskType = options.taskType ?? 'chat';
    const { model, modelId } = options.modelOverride
      ? await this.modelProviderRegistry.resolveLanguageModel(
          options.cooperativeDid,
          options.modelOverride,
        )
      : await this.modelProviderRegistry.resolveLanguageModelFromRouting(
          options.cooperativeDid,
          agent.modelConfig,
          taskType,
        );

    // Build AI SDK tools — streaming now supports tools natively
    const toolContext: AgentToolContext = {
      db: this.db,
      cooperativeDid: options.cooperativeDid,
      actorDid: options.userDid,
    };
    const tools = buildAiSdkTools(agent.allowedTools, toolContext);
    const hasTools = Object.keys(tools).length > 0;

    const messages: ModelMessage[] = [
      ...this.toCoreMessages(history),
      { role: 'user' as const, content: options.message },
    ];

    const result = streamText({
      model,
      system: agent.systemPrompt,
      messages,
      tools: hasTools ? tools : undefined,
      temperature: agent.temperature,
      maxOutputTokens: agent.maxTokensPerRequest,
      stopWhen: hasTools
        ? [stepCountIs(MAX_TOOL_LOOPS), detectDoomLoop]
        : undefined,
      experimental_repairToolCall: hasTools
        ? createRepairToolCall(tools)
        : undefined,
    });

    let fullContent = '';
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    try {
      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          fullContent += part.text;
          yield { type: 'content_delta', content: part.text };
        } else if (part.type === 'tool-call') {
          yield {
            type: 'tool_call_start',
            toolCall: { id: part.toolCallId, name: part.toolName },
          };
        }
        // tool-result parts are handled automatically by AI SDK
      }

      // totalUsage on streamText result is a Promise — must await
      const usage = await result.totalUsage;
      totalInputTokens = usage.inputTokens ?? 0;
      totalOutputTokens = usage.outputTokens ?? 0;
    } catch (streamError) {
      // On stream error, try to capture partial usage for billing accuracy
      try {
        const usage = await result.totalUsage;
        totalInputTokens = usage.inputTokens ?? 0;
        totalOutputTokens = usage.outputTokens ?? 0;
      } catch {
        // Usage unavailable — use whatever was accumulated
      }
      // Save partial content before re-throwing
      if (fullContent || totalInputTokens > 0) {
        const costMicrodollars = this.calculateCost(totalInputTokens, totalOutputTokens, modelId);
        await this.saveMessage(sessionId, 'assistant', fullContent, null,
          totalInputTokens, totalOutputTokens, costMicrodollars, modelId);
        await this.updateSessionUsage(sessionId, totalInputTokens, totalOutputTokens, costMicrodollars);
        await this.updateMonthlyUsage(options.cooperativeDid, agent.id,
          totalInputTokens, totalOutputTokens, costMicrodollars);
      }
      throw streamError;
    }

    yield {
      type: 'done',
      usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
    };

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

  /** Convert DB ChatMessage history to AI SDK CoreMessage format */
  private toCoreMessages(history: ChatMessage[]): ModelMessage[] {
    return history
      .filter((msg) => msg.role !== 'system') // system handled via system param
      .map((msg): ModelMessage => {
        if (msg.role === 'user') {
          return { role: 'user' as const, content: msg.content };
        }
        if (msg.role === 'assistant') {
          return { role: 'assistant' as const, content: msg.content };
        }
        // tool result messages
        return {
          role: 'tool' as const,
          content: [
            {
              type: 'tool-result' as const,
              toolCallId: msg.toolCallId ?? '',
              toolName: '',
              output: { type: 'text' as const, value: msg.content },
            },
          ],
        };
      });
  }

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
