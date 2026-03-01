import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

/**
 * Create an AI SDK LanguageModel for OpenAI.
 */
export function createOpenAIModel(apiKey: string, modelId: string): LanguageModel {
  const provider = createOpenAI({ apiKey });
  return provider(modelId);
}
