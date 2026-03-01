import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables } from './helpers/test-db.js';
import { createTestApp, setupAndLogin } from './helpers/test-app.js';
import { resetSetupCache } from '../src/auth/middleware.js';
import { PaymentProviderRegistry } from '../src/payment/registry.js';
import { getTestDb } from './helpers/test-db.js';

const TEST_KEY_ENC_KEY = 'yIknTzhyTfVpR7cc/ZrwSpewmhyiOJA97leVbKqccsY=';

describe('PaymentProviderRegistry', () => {
  beforeEach(async () => {
    await truncateAllTables();
    resetSetupCache();
  });

  it('returns empty list when no providers configured', async () => {
    const db = getTestDb();
    const registry = new PaymentProviderRegistry(db, TEST_KEY_ENC_KEY);

    const providers = await registry.getEnabledProviders('did:web:test.example');
    expect(providers).toEqual([]);
  });

  it('adds and lists a provider config', async () => {
    const db = getTestDb();
    const registry = new PaymentProviderRegistry(db, TEST_KEY_ENC_KEY);

    const config = await registry.addConfig(
      'did:web:test.example',
      'stripe',
      'Stripe',
      { secretKey: 'sk_test_123' },
      'whsec_test_456',
    );

    expect(config.provider_id).toBe('stripe');
    expect(config.display_name).toBe('Stripe');
    expect(config.enabled).toBe(true);

    const providers = await registry.getEnabledProviders('did:web:test.example');
    expect(providers).toHaveLength(1);
    expect(providers[0]).toEqual({ id: 'stripe', displayName: 'Stripe' });
  });

  it('creates a provider instance from encrypted credentials', async () => {
    const db = getTestDb();
    const registry = new PaymentProviderRegistry(db, TEST_KEY_ENC_KEY);

    await registry.addConfig(
      'did:web:test.example',
      'stripe',
      'Stripe',
      { secretKey: 'sk_test_123' },
      'whsec_test_456',
    );

    const provider = await registry.getProvider('did:web:test.example', 'stripe');
    expect(provider.info.id).toBe('stripe');
    expect(provider.info.displayName).toBe('Stripe');
  });

  it('throws NotFoundError for unconfigured provider', async () => {
    const db = getTestDb();
    const registry = new PaymentProviderRegistry(db, TEST_KEY_ENC_KEY);

    await expect(
      registry.getProvider('did:web:test.example', 'paypal'),
    ).rejects.toThrow('not configured');
  });

  it('throws NotFoundError for unsupported provider type', async () => {
    const db = getTestDb();
    const registry = new PaymentProviderRegistry(db, TEST_KEY_ENC_KEY);

    await expect(
      registry.addConfig(
        'did:web:test.example',
        'unsupported-provider',
        'Unknown',
        { secretKey: 'sk_test' },
      ),
    ).rejects.toThrow('Unsupported');
  });

  it('updates a provider config', async () => {
    const db = getTestDb();
    const registry = new PaymentProviderRegistry(db, TEST_KEY_ENC_KEY);

    await registry.addConfig(
      'did:web:test.example',
      'stripe',
      'Stripe',
      { secretKey: 'sk_test_123' },
    );

    const updated = await registry.updateConfig(
      'did:web:test.example',
      'stripe',
      { displayName: 'Stripe (Live)', enabled: false },
    );

    expect(updated.display_name).toBe('Stripe (Live)');
    expect(updated.enabled).toBe(false);

    // Should not appear in enabled providers
    const providers = await registry.getEnabledProviders('did:web:test.example');
    expect(providers).toHaveLength(0);
  });

  it('removes a provider config', async () => {
    const db = getTestDb();
    const registry = new PaymentProviderRegistry(db, TEST_KEY_ENC_KEY);

    await registry.addConfig(
      'did:web:test.example',
      'stripe',
      'Stripe',
      { secretKey: 'sk_test_123' },
    );

    await registry.removeConfig('did:web:test.example', 'stripe');

    const providers = await registry.getEnabledProviders('did:web:test.example');
    expect(providers).toHaveLength(0);
  });

  it('throws when removing non-existent config', async () => {
    const db = getTestDb();
    const registry = new PaymentProviderRegistry(db, TEST_KEY_ENC_KEY);

    await expect(
      registry.removeConfig('did:web:test.example', 'stripe'),
    ).rejects.toThrow('not found');
  });

  it('returns supported providers list', () => {
    const supported = PaymentProviderRegistry.getSupportedProviders();
    expect(supported).toEqual([{ id: 'stripe', displayName: 'Stripe' }]);
  });

  it('isolates providers between cooperatives', async () => {
    const db = getTestDb();
    const registry = new PaymentProviderRegistry(db, TEST_KEY_ENC_KEY);

    await registry.addConfig(
      'did:web:coop-a.example',
      'stripe',
      'Stripe A',
      { secretKey: 'sk_test_aaa' },
    );

    await registry.addConfig(
      'did:web:coop-b.example',
      'stripe',
      'Stripe B',
      { secretKey: 'sk_test_bbb' },
    );

    const aProviders = await registry.getEnabledProviders('did:web:coop-a.example');
    expect(aProviders).toHaveLength(1);
    expect(aProviders[0].displayName).toBe('Stripe A');

    const bProviders = await registry.getEnabledProviders('did:web:coop-b.example');
    expect(bProviders).toHaveLength(1);
    expect(bProviders[0].displayName).toBe('Stripe B');
  });
});
