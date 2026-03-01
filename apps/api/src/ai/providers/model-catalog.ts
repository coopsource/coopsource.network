import type { ModelProviderInfo } from '@coopsource/common';

/**
 * Static model catalog for provider info, pricing, and capabilities.
 * Used by getSupportedProviders() for the UI and calculateCost() for billing.
 *
 * Future: replace with runtime models.dev registry for live pricing/capabilities.
 */
export const PROVIDER_CATALOG: ModelProviderInfo[] = [
  {
    id: 'anthropic',
    displayName: 'Anthropic',
    supportsStreaming: true,
    supportedModels: [
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
    ],
  },
  {
    id: 'openai',
    displayName: 'OpenAI',
    supportsStreaming: true,
    supportedModels: [
      {
        id: 'gpt-4o',
        displayName: 'GPT-4o',
        contextWindow: 128000,
        maxOutputTokens: 16384,
        inputPricePer1M: 2_500_000,
        outputPricePer1M: 10_000_000,
        capabilities: ['chat', 'tool_use', 'vision'],
      },
      {
        id: 'gpt-4o-mini',
        displayName: 'GPT-4o mini',
        contextWindow: 128000,
        maxOutputTokens: 16384,
        inputPricePer1M: 150_000,
        outputPricePer1M: 600_000,
        capabilities: ['chat', 'tool_use', 'vision'],
      },
      {
        id: 'o3-mini',
        displayName: 'o3-mini',
        contextWindow: 200000,
        maxOutputTokens: 100000,
        inputPricePer1M: 1_100_000,
        outputPricePer1M: 4_400_000,
        capabilities: ['chat', 'tool_use', 'reasoning'],
      },
    ],
  },
  {
    id: 'ollama',
    displayName: 'Ollama (Local)',
    supportsStreaming: true,
    supportedModels: [], // Discovered at runtime via /api/tags
  },
];
