import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type {
  IModelProvider,
  ModelProviderInfo,
  ModelInfo,
  ModelRoutingConfig,
  TaskType,
} from '@coopsource/common';
import { NotFoundError, ConflictError } from '@coopsource/common';
import { encryptKey, decryptKey } from '@coopsource/federation/local';
import { AnthropicProvider, ANTHROPIC_PROVIDER_INFO } from './providers/anthropic-provider.js';
import { OllamaProvider, OLLAMA_PROVIDER_INFO } from './providers/ollama-provider.js';

type ProviderCredentials = Record<string, string>;

type ProviderFactory = (credentials: ProviderCredentials) => IModelProvider;

/** Validate Ollama base URL to prevent SSRF to internal services */
function validateOllamaUrl(url: string): string {
  const parsed = new URL(url);
  const hostname = parsed.hostname;

  // Allow localhost for local development
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return url;
  }

  // Block cloud metadata endpoints
  const blockedPatterns = [
    /^169\.254\./, // AWS/Azure metadata
    /^10\./, // RFC 1918
    /^172\.(1[6-9]|2\d|3[01])\./, // RFC 1918
    /^192\.168\./, // RFC 1918
    /^0\./, // Current network
    /^fc00:/i, // IPv6 ULA
    /^fe80:/i, // IPv6 link-local
  ];

  for (const pattern of blockedPatterns) {
    if (pattern.test(hostname)) {
      throw new NotFoundError(
        `Ollama base URL '${hostname}' points to a private/internal address. ` +
        'Only localhost and public addresses are allowed.',
      );
    }
  }

  return url;
}

const PROVIDER_FACTORIES: Record<string, ProviderFactory> = {
  anthropic: (creds) => new AnthropicProvider(creds.apiKey),
  ollama: (creds) => new OllamaProvider(validateOllamaUrl(creds.baseUrl || 'http://localhost:11434')),
};

/** Resolved model — ready to call */
export interface ResolvedModel {
  provider: IModelProvider;
  modelId: string;
}

/**
 * Manages AI model provider instances per cooperative.
 *
 * Each cooperative can configure multiple model providers with their own
 * API keys and allowed model lists. Credentials are stored AES-256-GCM
 * encrypted in the DB, using the same KEY_ENC_KEY as federation signing keys.
 */
export class ModelProviderRegistry {
  constructor(
    private db: Kysely<Database>,
    private keyEncKey: string,
  ) {}

  /** Get all enabled providers for a cooperative */
  async getEnabledProviders(
    cooperativeDid: string,
  ): Promise<ModelProviderInfo[]> {
    const rows = await this.db
      .selectFrom('model_provider_config')
      .where('cooperative_did', '=', cooperativeDid)
      .where('enabled', '=', true)
      .select(['provider_id', 'display_name'])
      .execute();

    const results: ModelProviderInfo[] = [];
    for (const r of rows) {
      const factory = PROVIDER_FACTORIES[r.provider_id];
      if (!factory) continue;
      const staticInfo = ModelProviderRegistry.getSupportedProviders().find(
        (p) => p.id === r.provider_id,
      );
      results.push({
        id: r.provider_id,
        displayName: r.display_name,
        supportsStreaming: staticInfo?.supportsStreaming ?? false,
        supportedModels: staticInfo?.supportedModels ?? [],
      });
    }
    return results;
  }

  /** Get a specific provider instance for a cooperative */
  async getProvider(
    cooperativeDid: string,
    providerId: string,
  ): Promise<IModelProvider> {
    const row = await this.db
      .selectFrom('model_provider_config')
      .where('cooperative_did', '=', cooperativeDid)
      .where('provider_id', '=', providerId)
      .where('enabled', '=', true)
      .selectAll()
      .executeTakeFirst();

    if (!row) {
      throw new NotFoundError(
        `Model provider '${providerId}' not configured for this cooperative`,
      );
    }

    return this.createProviderFromRow(row);
  }

  /**
   * Resolve a 'provider:model' string against a co-op's configuration.
   * Verifies the co-op has the provider enabled and the model allowed.
   */
  async resolveModel(
    cooperativeDid: string,
    modelString: string,
  ): Promise<ResolvedModel> {
    const colonIdx = modelString.indexOf(':');
    if (colonIdx === -1) {
      throw new NotFoundError(
        `Invalid model format '${modelString}' — expected 'provider:model'`,
      );
    }

    const providerId = modelString.slice(0, colonIdx);
    const modelId = modelString.slice(colonIdx + 1);

    const row = await this.db
      .selectFrom('model_provider_config')
      .where('cooperative_did', '=', cooperativeDid)
      .where('provider_id', '=', providerId)
      .where('enabled', '=', true)
      .selectAll()
      .executeTakeFirst();

    if (!row) {
      throw new NotFoundError(
        `Model provider '${providerId}' not configured for this cooperative`,
      );
    }

    // Check allowed models (empty array = all models allowed)
    const allowed = row.allowed_models as string[];
    if (allowed.length > 0 && !allowed.includes(modelId)) {
      throw new NotFoundError(
        `Model '${modelId}' is not in the allowed list for provider '${providerId}'`,
      );
    }

    const provider = await this.createProviderFromRow(row);
    return { provider, modelId };
  }

  /**
   * Given a ModelRoutingConfig and task type, resolve the appropriate model
   * with fallback chain: task-specific → chat → fallback → error
   */
  async resolveFromRouting(
    cooperativeDid: string,
    routingConfig: ModelRoutingConfig,
    taskType: TaskType,
  ): Promise<ResolvedModel> {
    const candidates: string[] = [];

    // Task-specific model
    const taskModel = routingConfig[taskType];
    if (taskModel) candidates.push(taskModel);

    // Fall back to chat if not the same
    if (taskType !== 'chat' && routingConfig.chat) {
      candidates.push(routingConfig.chat);
    }

    // Fall back to fallback
    if (routingConfig.fallback) {
      candidates.push(routingConfig.fallback);
    }

    for (const modelString of candidates) {
      try {
        return await this.resolveModel(cooperativeDid, modelString);
      } catch {
        // Try next candidate
      }
    }

    throw new NotFoundError(
      `No available model found for task '${taskType}' in routing config`,
    );
  }

  /** Get all models available to a co-op across all enabled providers */
  async getAvailableModels(
    cooperativeDid: string,
  ): Promise<Array<{ providerId: string; models: ModelInfo[] }>> {
    const rows = await this.db
      .selectFrom('model_provider_config')
      .where('cooperative_did', '=', cooperativeDid)
      .where('enabled', '=', true)
      .select(['provider_id', 'allowed_models'])
      .execute();

    const results: Array<{ providerId: string; models: ModelInfo[] }> = [];

    for (const row of rows) {
      const staticInfo = ModelProviderRegistry.getSupportedProviders().find(
        (p) => p.id === row.provider_id,
      );
      if (!staticInfo) continue;

      const allowed = row.allowed_models as string[];
      const models =
        allowed.length > 0
          ? staticInfo.supportedModels.filter((m) => allowed.includes(m.id))
          : staticInfo.supportedModels;

      results.push({ providerId: row.provider_id, models });
    }

    return results;
  }

  /** List all provider configs for a cooperative (admin view, no credentials) */
  async listConfigs(cooperativeDid: string) {
    return this.db
      .selectFrom('model_provider_config')
      .where('cooperative_did', '=', cooperativeDid)
      .select([
        'id',
        'provider_id',
        'display_name',
        'enabled',
        'allowed_models',
        'config',
        'created_at',
        'updated_at',
      ])
      .orderBy('created_at', 'asc')
      .execute();
  }

  /** Add a model provider configuration for a cooperative */
  async addConfig(
    cooperativeDid: string,
    providerId: string,
    displayName: string,
    credentials: ProviderCredentials,
    allowedModels: string[] = [],
    config?: Record<string, unknown>,
  ) {
    if (!PROVIDER_FACTORIES[providerId]) {
      throw new NotFoundError(`Unsupported provider type: '${providerId}'`);
    }

    const existing = await this.db
      .selectFrom('model_provider_config')
      .where('cooperative_did', '=', cooperativeDid)
      .where('provider_id', '=', providerId)
      .select('id')
      .executeTakeFirst();

    if (existing) {
      throw new ConflictError(
        `Provider '${providerId}' is already configured for this cooperative`,
      );
    }

    const credentialsEnc = await encryptKey(
      JSON.stringify(credentials),
      this.keyEncKey,
    );

    const [row] = await this.db
      .insertInto('model_provider_config')
      .values({
        cooperative_did: cooperativeDid,
        provider_id: providerId,
        display_name: displayName,
        credentials_enc: credentialsEnc,
        allowed_models: JSON.stringify(allowedModels),
        config: config ? JSON.stringify(config) : null,
      })
      .returning([
        'id',
        'provider_id',
        'display_name',
        'enabled',
        'allowed_models',
        'config',
        'created_at',
        'updated_at',
      ])
      .execute();

    return row!;
  }

  /** Update a model provider configuration */
  async updateConfig(
    cooperativeDid: string,
    providerId: string,
    updates: {
      displayName?: string;
      enabled?: boolean;
      credentials?: ProviderCredentials;
      allowedModels?: string[];
      config?: Record<string, unknown>;
    },
  ) {
    const setValues: Record<string, unknown> = { updated_at: new Date() };

    if (updates.displayName !== undefined)
      setValues.display_name = updates.displayName;
    if (updates.enabled !== undefined) setValues.enabled = updates.enabled;
    if (updates.config !== undefined)
      setValues.config = JSON.stringify(updates.config);
    if (updates.allowedModels !== undefined)
      setValues.allowed_models = JSON.stringify(updates.allowedModels);
    if (updates.credentials !== undefined) {
      setValues.credentials_enc = await encryptKey(
        JSON.stringify(updates.credentials),
        this.keyEncKey,
      );
    }

    const [row] = await this.db
      .updateTable('model_provider_config')
      .set(setValues)
      .where('cooperative_did', '=', cooperativeDid)
      .where('provider_id', '=', providerId)
      .returning([
        'id',
        'provider_id',
        'display_name',
        'enabled',
        'allowed_models',
        'config',
        'created_at',
        'updated_at',
      ])
      .execute();

    if (!row) {
      throw new NotFoundError(
        `Model provider '${providerId}' not found for this cooperative`,
      );
    }

    return row;
  }

  /** Remove a model provider configuration */
  async removeConfig(cooperativeDid: string, providerId: string) {
    const result = await this.db
      .deleteFrom('model_provider_config')
      .where('cooperative_did', '=', cooperativeDid)
      .where('provider_id', '=', providerId)
      .executeTakeFirst();

    if (Number(result.numDeletedRows) === 0) {
      throw new NotFoundError(
        `Model provider '${providerId}' not found for this cooperative`,
      );
    }
  }

  /** Get list of supported provider types with their static model info */
  static getSupportedProviders(): ModelProviderInfo[] {
    return [ANTHROPIC_PROVIDER_INFO, OLLAMA_PROVIDER_INFO];
  }

  // ─── Private ──────────────────────────────────────────────────────────

  private async createProviderFromRow(row: {
    provider_id: string;
    credentials_enc: string;
  }): Promise<IModelProvider> {
    const factory = PROVIDER_FACTORIES[row.provider_id];
    if (!factory) {
      throw new NotFoundError(
        `Unsupported provider type: '${row.provider_id}'`,
      );
    }

    const credentialsJson = await decryptKey(
      row.credentials_enc,
      this.keyEncKey,
    );
    const credentials = JSON.parse(credentialsJson) as ProviderCredentials;

    return factory(credentials);
  }
}
