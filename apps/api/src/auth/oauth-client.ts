import { NodeOAuthClient } from '@atproto/oauth-client-node';
import type {
  RuntimeLock,
  NodeSavedState,
  NodeSavedSession,
  NodeSavedStateStore,
  NodeSavedSessionStore,
} from '@atproto/oauth-client-node';
import { atprotoLoopbackClientMetadata } from '@atproto/oauth-types';
import { Redis } from 'ioredis';
import type { AppConfig } from '../config.js';

export let redis: Redis;

export class RedisStateStore implements NodeSavedStateStore {
  constructor(private redis: Redis) {}

  async get(key: string): Promise<NodeSavedState | undefined> {
    const data = await this.redis.get(`oauth:state:${key}`);
    return data ? JSON.parse(data) : undefined;
  }

  async set(key: string, value: NodeSavedState): Promise<void> {
    await this.redis.setex(`oauth:state:${key}`, 3600, JSON.stringify(value));
  }

  async del(key: string): Promise<void> {
    await this.redis.del(`oauth:state:${key}`);
  }
}

export class RedisSessionStore implements NodeSavedSessionStore {
  constructor(private redis: Redis) {}

  async get(key: string): Promise<NodeSavedSession | undefined> {
    const data = await this.redis.get(`oauth:session:${key}`);
    return data ? JSON.parse(data) : undefined;
  }

  async set(key: string, value: NodeSavedSession): Promise<void> {
    await this.redis.set(`oauth:session:${key}`, JSON.stringify(value));
  }

  async del(key: string): Promise<void> {
    await this.redis.del(`oauth:session:${key}`);
  }
}

function createRequestLock(redisInstance: Redis): RuntimeLock {
  return async <T>(name: string, fn: () => T | PromiseLike<T>): Promise<T> => {
    const lockKey = `oauth:lock:${name}`;
    const lockValue = `${Date.now()}-${Math.random()}`;

    // Try to acquire lock with 30s expiry
    let acquired = await redisInstance.set(lockKey, lockValue, 'EX', 30, 'NX');
    if (!acquired) {
      // Retry once after 1 second
      await new Promise((resolve) => setTimeout(resolve, 1000));
      acquired = await redisInstance.set(lockKey, lockValue, 'EX', 30, 'NX');
      if (!acquired) {
        throw new Error(`Failed to acquire lock: ${name}`);
      }
    }

    try {
      return await fn();
    } finally {
      // Release lock only if we still own it
      const currentValue = await redisInstance.get(lockKey);
      if (currentValue === lockValue) {
        await redisInstance.del(lockKey);
      }
    }
  };
}

export async function createOAuthClient(
  config: AppConfig,
): Promise<NodeOAuthClient> {
  redis = new Redis(config.REDIS_URL ?? 'redis://localhost:6379');

  const stateStore = new RedisStateStore(redis);
  const sessionStore = new RedisSessionStore(redis);
  const requestLock = createRequestLock(redis);

  if (config.NODE_ENV === 'development' || !config.OAUTH_CLIENT_ID) {
    // Loopback client ID for development
    const redirectUri = `http://127.0.0.1:${config.PORT}/auth/callback`;
    const clientId = `http://localhost?redirect_uri=${encodeURIComponent(redirectUri)}&scope=atproto+transition%3Ageneric`;
    const clientMetadata = atprotoLoopbackClientMetadata(clientId);

    return new NodeOAuthClient({
      clientMetadata,
      stateStore,
      sessionStore,
      requestLock,
    });
  }

  // Production: fetch metadata from discoverable client ID
  const clientMetadata = await NodeOAuthClient.fetchMetadata({
    clientId: config.OAUTH_CLIENT_ID as `https://${string}/${string}`,
  });

  return new NodeOAuthClient({
    clientMetadata,
    stateStore,
    sessionStore,
    requestLock,
  });
}
