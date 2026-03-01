import type { Kysely } from 'kysely';
import type { Database } from '@coopsource/db';
import type { IPaymentProvider, PaymentProviderInfo } from '@coopsource/common';
import { NotFoundError, ConflictError } from '@coopsource/common';
import { encryptKey, decryptKey } from '@coopsource/federation/local';
import { StripePaymentProvider } from './stripe-provider.js';

/** Credentials shape stored as encrypted JSON in payment_provider_config */
export type ProviderCredentials = Record<string, string>;

/** Factory function that creates a provider from decrypted credentials */
type ProviderFactory = (
  credentials: ProviderCredentials,
  webhookSecret: string | null,
) => IPaymentProvider;

/** Registry of supported provider types and their factories */
const PROVIDER_FACTORIES: Record<string, ProviderFactory> = {
  stripe: (creds, webhookSecret) =>
    new StripePaymentProvider(creds.secretKey, webhookSecret ?? ''),
};

/**
 * Manages payment provider instances per cooperative.
 *
 * Each cooperative can configure multiple payment providers with their own
 * API keys. Credentials are stored AES-256-GCM encrypted in the DB,
 * using the same KEY_ENC_KEY as federation signing keys.
 */
export class PaymentProviderRegistry {
  constructor(
    private db: Kysely<Database>,
    private keyEncKey: string,
  ) {}

  /** Get all enabled providers for a cooperative */
  async getEnabledProviders(
    cooperativeDid: string,
  ): Promise<PaymentProviderInfo[]> {
    const rows = await this.db
      .selectFrom('payment_provider_config')
      .where('cooperative_did', '=', cooperativeDid)
      .where('enabled', '=', true)
      .select(['provider_id', 'display_name'])
      .execute();

    return rows.map((r) => ({
      id: r.provider_id,
      displayName: r.display_name,
    }));
  }

  /** Get a specific provider instance for a cooperative */
  async getProvider(
    cooperativeDid: string,
    providerId: string,
  ): Promise<IPaymentProvider> {
    const row = await this.db
      .selectFrom('payment_provider_config')
      .where('cooperative_did', '=', cooperativeDid)
      .where('provider_id', '=', providerId)
      .where('enabled', '=', true)
      .selectAll()
      .executeTakeFirst();

    if (!row) {
      throw new NotFoundError(
        `Payment provider '${providerId}' not configured for this cooperative`,
      );
    }

    return this.createProviderFromRow(row);
  }

  /** List all provider configs for a cooperative (admin view, no credentials) */
  async listConfigs(cooperativeDid: string) {
    return this.db
      .selectFrom('payment_provider_config')
      .where('cooperative_did', '=', cooperativeDid)
      .select([
        'id',
        'provider_id',
        'display_name',
        'enabled',
        'config',
        'created_at',
        'updated_at',
      ])
      .orderBy('created_at', 'asc')
      .execute();
  }

  /** Add a payment provider configuration for a cooperative */
  async addConfig(
    cooperativeDid: string,
    providerId: string,
    displayName: string,
    credentials: ProviderCredentials,
    webhookSecret?: string,
    config?: Record<string, unknown>,
  ) {
    if (!PROVIDER_FACTORIES[providerId]) {
      throw new NotFoundError(`Unsupported provider type: '${providerId}'`);
    }

    // Check for existing config
    const existing = await this.db
      .selectFrom('payment_provider_config')
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
    const webhookSecretEnc = webhookSecret
      ? await encryptKey(webhookSecret, this.keyEncKey)
      : null;

    const [row] = await this.db
      .insertInto('payment_provider_config')
      .values({
        cooperative_did: cooperativeDid,
        provider_id: providerId,
        display_name: displayName,
        credentials_enc: credentialsEnc,
        webhook_secret_enc: webhookSecretEnc,
        config: config ?? null,
      })
      .returning([
        'id',
        'provider_id',
        'display_name',
        'enabled',
        'config',
        'created_at',
        'updated_at',
      ])
      .execute();

    return row!;
  }

  /** Update a payment provider configuration */
  async updateConfig(
    cooperativeDid: string,
    providerId: string,
    updates: {
      displayName?: string;
      enabled?: boolean;
      credentials?: ProviderCredentials;
      webhookSecret?: string;
      config?: Record<string, unknown>;
    },
  ) {
    const setValues: Record<string, unknown> = { updated_at: new Date() };

    if (updates.displayName !== undefined)
      setValues.display_name = updates.displayName;
    if (updates.enabled !== undefined) setValues.enabled = updates.enabled;
    if (updates.config !== undefined)
      setValues.config = JSON.stringify(updates.config);
    if (updates.credentials !== undefined) {
      setValues.credentials_enc = await encryptKey(
        JSON.stringify(updates.credentials),
        this.keyEncKey,
      );
    }
    if (updates.webhookSecret !== undefined) {
      setValues.webhook_secret_enc = await encryptKey(
        updates.webhookSecret,
        this.keyEncKey,
      );
    }

    const [row] = await this.db
      .updateTable('payment_provider_config')
      .set(setValues)
      .where('cooperative_did', '=', cooperativeDid)
      .where('provider_id', '=', providerId)
      .returning([
        'id',
        'provider_id',
        'display_name',
        'enabled',
        'config',
        'created_at',
        'updated_at',
      ])
      .execute();

    if (!row) {
      throw new NotFoundError(
        `Payment provider '${providerId}' not found for this cooperative`,
      );
    }

    return row;
  }

  /** Remove a payment provider configuration */
  async removeConfig(cooperativeDid: string, providerId: string) {
    const result = await this.db
      .deleteFrom('payment_provider_config')
      .where('cooperative_did', '=', cooperativeDid)
      .where('provider_id', '=', providerId)
      .executeTakeFirst();

    if (Number(result.numDeletedRows) === 0) {
      throw new NotFoundError(
        `Payment provider '${providerId}' not found for this cooperative`,
      );
    }
  }

  /** Get list of supported provider types */
  static getSupportedProviders(): PaymentProviderInfo[] {
    return [{ id: 'stripe', displayName: 'Stripe' }];
  }

  // ─── Private ──────────────────────────────────────────────────────────

  private async createProviderFromRow(
    row: {
      provider_id: string;
      credentials_enc: string;
      webhook_secret_enc: string | null;
    },
  ): Promise<IPaymentProvider> {
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

    const webhookSecret = row.webhook_secret_enc
      ? await decryptKey(row.webhook_secret_enc, this.keyEncKey)
      : null;

    return factory(credentials, webhookSecret);
  }
}
