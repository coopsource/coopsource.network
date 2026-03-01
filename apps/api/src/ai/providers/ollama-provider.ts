import type {
  IModelProvider,
  ModelProviderInfo,
  ModelInfo,
  ChatRequest,
  ChatResponse,
  ChatStreamEvent,
} from '@coopsource/common';

interface OllamaModel {
  name: string;
  size: number;
  details?: { parameter_size?: string; family?: string };
}

interface OllamaChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface OllamaChatResponse {
  message: OllamaChatMessage;
  done: boolean;
  total_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

/** Static provider info — available without creating an instance */
export const OLLAMA_PROVIDER_INFO: ModelProviderInfo = {
  id: 'ollama',
  displayName: 'Ollama (Local)',
  supportsStreaming: true,
  supportedModels: [],
};

export class OllamaProvider implements IModelProvider {
  private baseUrl: string;
  private cachedModels: ModelInfo[] | null = null;
  private cacheExpiry = 0;
  private static CACHE_TTL_MS = 60_000;

  readonly info: ModelProviderInfo;

  constructor(baseUrl: string = 'http://localhost:11434') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.info = {
      id: 'ollama',
      displayName: 'Ollama (Local)',
      supportsStreaming: true,
      supportedModels: [],
    };
  }

  /** Discover locally available models from Ollama server */
  async discoverModels(): Promise<ModelInfo[]> {
    const now = Date.now();
    if (this.cachedModels && now < this.cacheExpiry) {
      return this.cachedModels;
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) return [];

      const data = (await response.json()) as { models: OllamaModel[] };
      this.cachedModels = data.models.map((m) => ({
        id: m.name,
        displayName: m.name,
        contextWindow: 128000,
        maxOutputTokens: 32000,
        inputPricePer1M: 0,
        outputPricePer1M: 0,
        capabilities: ['chat'],
      }));
      this.cacheExpiry = now + OllamaProvider.CACHE_TTL_MS;
      this.info.supportedModels = this.cachedModels;
      return this.cachedModels;
    } catch {
      return this.cachedModels ?? [];
    }
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const messages = this.buildMessages(request);

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model,
        messages,
        stream: false,
        options: {
          temperature: request.temperature,
          num_predict: request.maxTokens,
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama API error: ${response.status} ${text}`);
    }

    const data = (await response.json()) as OllamaChatResponse;

    return {
      content: data.message.content,
      inputTokens: data.prompt_eval_count ?? 0,
      outputTokens: data.eval_count ?? 0,
      model: request.model,
      stopReason: 'end_turn',
    };
  }

  async *chatStream(request: ChatRequest): AsyncIterable<ChatStreamEvent> {
    const messages = this.buildMessages(request);

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model,
        messages,
        stream: true,
        options: {
          temperature: request.temperature,
          num_predict: request.maxTokens,
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama API error: ${response.status} ${text}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;
        const chunk = JSON.parse(line) as OllamaChatResponse;

        if (chunk.done) {
          yield {
            type: 'done',
            usage: {
              inputTokens: chunk.prompt_eval_count ?? 0,
              outputTokens: chunk.eval_count ?? 0,
            },
          };
        } else if (chunk.message?.content) {
          yield { type: 'content_delta', content: chunk.message.content };
        }
      }
    }
  }

  // ─── Private ──────────────────────────────────────────────────────────

  private buildMessages(request: ChatRequest): OllamaChatMessage[] {
    const messages: OllamaChatMessage[] = [];

    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }

    for (const msg of request.messages) {
      if (msg.role === 'system') {
        messages.push({ role: 'system', content: msg.content });
      } else if (msg.role === 'user' || msg.role === 'tool') {
        messages.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant') {
        messages.push({ role: 'assistant', content: msg.content });
      }
    }

    return messages;
  }
}
