/**
 * Model provider abstraction layer.
 *
 * Allows cooperatives to configure multiple AI model providers (Anthropic, OpenAI, Ollama, etc.)
 * with per-agent model routing — different tasks (chat, automation, summarization, analysis)
 * can use different models. Co-ops control which providers and models are available.
 */

// ─── Provider & Model Info ──────────────────────────────────────────────

export interface ModelProviderInfo {
  /** Provider identifier, e.g. 'anthropic', 'openai', 'ollama' */
  id: string;
  /** Human-readable name, e.g. 'Anthropic', 'OpenAI', 'Ollama' */
  displayName: string;
  /** Whether this provider supports streaming responses */
  supportsStreaming: boolean;
  /** Models available from this provider */
  supportedModels: ModelInfo[];
}

export interface ModelInfo {
  /** Model identifier, e.g. 'claude-opus-4-20250514' */
  id: string;
  /** Human-readable name, e.g. 'Claude Opus 4' */
  displayName: string;
  /** Maximum input context window in tokens */
  contextWindow: number;
  /** Maximum output tokens */
  maxOutputTokens: number;
  /** Input price per 1M tokens in microdollars */
  inputPricePer1M: number;
  /** Output price per 1M tokens in microdollars */
  outputPricePer1M: number;
  /** Capabilities this model supports */
  capabilities: string[];
}

// ─── Model Routing ──────────────────────────────────────────────────────

/** Model routing config per agent — maps task types to provider:model strings */
export interface ModelRoutingConfig {
  /** Model for interactive chat (required). Format: 'provider:model' */
  chat: string;
  /** Model for event-driven automation (optional, falls back to chat) */
  automation?: string;
  /** Model for summaries/digests (optional, falls back to chat) */
  summarization?: string;
  /** Model for data analysis (optional, falls back to chat) */
  analysis?: string;
  /** Fallback if primary model is unavailable */
  fallback?: string;
}

export type TaskType = 'chat' | 'automation' | 'summarization' | 'analysis';

// ─── Chat Messages & Tools ──────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

// ─── Chat Request & Response ────────────────────────────────────────────

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface ChatResponse {
  content: string;
  toolCalls?: ToolCall[];
  inputTokens: number;
  outputTokens: number;
  model: string;
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens';
}

// ─── Streaming ──────────────────────────────────────────────────────────

export interface ChatStreamEvent {
  type: 'content_delta' | 'tool_call_start' | 'tool_call_delta' | 'done';
  content?: string;
  toolCall?: Partial<ToolCall>;
  usage?: { inputTokens: number; outputTokens: number };
}

// ─── Provider Interface ─────────────────────────────────────────────────

export interface IModelProvider {
  /** Provider identity and supported models */
  readonly info: ModelProviderInfo;

  /** Send a chat request and get a complete response */
  chat(request: ChatRequest): Promise<ChatResponse>;

  /** Send a chat request and stream the response */
  chatStream(request: ChatRequest): AsyncIterable<ChatStreamEvent>;
}
