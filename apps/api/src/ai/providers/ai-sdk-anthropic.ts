import { createAnthropic } from '@ai-sdk/anthropic';
import type { LanguageModel } from 'ai';

/**
 * Create an AI SDK LanguageModel for Anthropic.
 * All message mapping is handled internally by @ai-sdk/anthropic.
 */
export function createAnthropicModel(apiKey: string, modelId: string): LanguageModel {
  const provider = createAnthropic({ apiKey });
  return provider(modelId);
}
