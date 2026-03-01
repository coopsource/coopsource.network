import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';

/**
 * Create an AI SDK LanguageModel for Ollama via OpenAI-compatible API.
 * SSRF validation on baseUrl must be done by the caller (see validateOllamaUrl in model-provider-registry.ts).
 */
export function createOllamaModel(baseUrl: string, modelId: string): LanguageModel {
  const provider = createOpenAICompatible({
    name: 'ollama',
    baseURL: `${baseUrl.replace(/\/$/, '')}/v1`,
    apiKey: 'ollama', // Required by OpenAI-compat format but unused by Ollama
  });
  return provider.chatModel(modelId);
}
