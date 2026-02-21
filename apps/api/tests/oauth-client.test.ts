import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RedisStateStore, RedisSessionStore } from '../src/auth/oauth-client.js';

// Mock Redis instance
function createMockRedis() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
      return 'OK';
    }),
    setex: vi.fn(async (key: string, _ttl: number, value: string) => {
      store.set(key, value);
      return 'OK';
    }),
    del: vi.fn(async (key: string) => {
      store.delete(key);
      return 1;
    }),
    _store: store,
  };
}

describe('RedisStateStore', () => {
  let mockRedis: ReturnType<typeof createMockRedis>;
  let stateStore: RedisStateStore;

  beforeEach(() => {
    mockRedis = createMockRedis();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stateStore = new RedisStateStore(mockRedis as any);
  });

  it('should return undefined for missing key', async () => {
    const result = await stateStore.get('missing-key');
    expect(result).toBeUndefined();
    expect(mockRedis.get).toHaveBeenCalledWith('oauth:state:missing-key');
  });

  it('should set and get a value', async () => {
    const testValue = { dpopJwk: { kty: 'EC' }, iss: 'test' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await stateStore.set('test-key', testValue as any);
    expect(mockRedis.setex).toHaveBeenCalledWith(
      'oauth:state:test-key',
      3600,
      JSON.stringify(testValue),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await stateStore.get('test-key') as any;
    expect(result).toEqual(testValue);
  });

  it('should delete a key', async () => {
    await stateStore.del('test-key');
    expect(mockRedis.del).toHaveBeenCalledWith('oauth:state:test-key');
  });
});

describe('RedisSessionStore', () => {
  let mockRedis: ReturnType<typeof createMockRedis>;
  let sessionStore: RedisSessionStore;

  beforeEach(() => {
    mockRedis = createMockRedis();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sessionStore = new RedisSessionStore(mockRedis as any);
  });

  it('should return undefined for missing key', async () => {
    const result = await sessionStore.get('missing-did');
    expect(result).toBeUndefined();
    expect(mockRedis.get).toHaveBeenCalledWith('oauth:session:missing-did');
  });

  it('should set and get a value', async () => {
    const testSession = { dpopJwk: { kty: 'EC' }, tokenSet: {} };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await sessionStore.set('did:plc:test', testSession as any);
    expect(mockRedis.set).toHaveBeenCalledWith(
      'oauth:session:did:plc:test',
      JSON.stringify(testSession),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await sessionStore.get('did:plc:test') as any;
    expect(result).toEqual(testSession);
  });

  it('should delete a key', async () => {
    await sessionStore.del('did:plc:test');
    expect(mockRedis.del).toHaveBeenCalledWith('oauth:session:did:plc:test');
  });
});
