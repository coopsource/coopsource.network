import Anthropic from '@anthropic-ai/sdk';
import type {
  IModelProvider,
  ModelProviderInfo,
  ChatRequest,
  ChatResponse,
  ChatStreamEvent,
} from '@coopsource/common';

const ANTHROPIC_MODELS = [
  {
    id: 'claude-opus-4-20250514',
    displayName: 'Claude Opus 4',
    contextWindow: 200000,
    maxOutputTokens: 32000,
    inputPricePer1M: 15_000_000,
    outputPricePer1M: 75_000_000,
    capabilities: ['chat', 'tool_use', 'vision', 'long_context'],
  },
  {
    id: 'claude-sonnet-4-20250514',
    displayName: 'Claude Sonnet 4',
    contextWindow: 200000,
    maxOutputTokens: 16000,
    inputPricePer1M: 3_000_000,
    outputPricePer1M: 15_000_000,
    capabilities: ['chat', 'tool_use', 'vision', 'long_context'],
  },
  {
    id: 'claude-haiku-4-5-20251001',
    displayName: 'Claude Haiku 4.5',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    inputPricePer1M: 800_000,
    outputPricePer1M: 4_000_000,
    capabilities: ['chat', 'tool_use', 'vision', 'long_context'],
  },
];

/** Static provider info — available without creating an instance */
export const ANTHROPIC_PROVIDER_INFO: ModelProviderInfo = {
  id: 'anthropic',
  displayName: 'Anthropic',
  supportsStreaming: true,
  supportedModels: ANTHROPIC_MODELS,
};

export class AnthropicProvider implements IModelProvider {
  private client: Anthropic;

  readonly info: ModelProviderInfo = {
    id: 'anthropic',
    displayName: 'Anthropic',
    supportsStreaming: true,
    supportedModels: ANTHROPIC_MODELS,
  };

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const { system, messages } = this.buildMessages(request);

    const response = await this.client.messages.create({
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature,
      system: system || undefined,
      messages,
      tools: request.tools?.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema as Anthropic.Tool['input_schema'],
      })),
    });

    return this.mapResponse(response);
  }

  async *chatStream(request: ChatRequest): AsyncIterable<ChatStreamEvent> {
    const { system, messages } = this.buildMessages(request);

    const stream = this.client.messages.stream({
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature,
      system: system || undefined,
      messages,
      tools: request.tools?.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema as Anthropic.Tool['input_schema'],
      })),
    });

    let currentToolCallId: string | undefined;
    let currentToolName: string | undefined;

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          currentToolCallId = event.content_block.id;
          currentToolName = event.content_block.name;
          yield {
            type: 'tool_call_start',
            toolCall: { id: currentToolCallId, name: currentToolName },
          };
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          yield { type: 'content_delta', content: event.delta.text };
        } else if (event.delta.type === 'input_json_delta') {
          yield {
            type: 'tool_call_delta',
            toolCall: { id: currentToolCallId },
            content: event.delta.partial_json,
          };
        }
      } else if (event.type === 'message_delta') {
        // Final event with usage
        const msg = await stream.finalMessage();
        yield {
          type: 'done',
          usage: {
            inputTokens: msg.usage.input_tokens,
            outputTokens: msg.usage.output_tokens,
          },
        };
      }
    }
  }

  // ─── Private ──────────────────────────────────────────────────────────

  private buildMessages(request: ChatRequest): {
    system: string;
    messages: Anthropic.MessageParam[];
  } {
    const system = request.systemPrompt ?? '';
    const messages: Anthropic.MessageParam[] = [];

    for (const msg of request.messages) {
      if (msg.role === 'system') continue; // System is passed separately

      if (msg.role === 'user') {
        messages.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant') {
        const content: Anthropic.ContentBlockParam[] = [];
        if (msg.content) {
          content.push({ type: 'text', text: msg.content });
        }
        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            content.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.name,
              input: tc.input,
            });
          }
        }
        messages.push({ role: 'assistant', content });
      } else if (msg.role === 'tool') {
        messages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: msg.toolCallId!,
              content: msg.content,
            },
          ],
        });
      }
    }

    return { system, messages };
  }

  private mapResponse(response: Anthropic.Message): ChatResponse {
    let content = '';
    const toolCalls: ChatResponse['toolCalls'] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        content += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
    }

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      model: response.model,
      stopReason:
        response.stop_reason === 'tool_use'
          ? 'tool_use'
          : response.stop_reason === 'max_tokens'
            ? 'max_tokens'
            : 'end_turn',
    };
  }
}
