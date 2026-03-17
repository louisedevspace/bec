import Redis from 'ioredis';

// Redis URL from environment (default to localhost for development)
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Connection state tracking
let isRedisAvailable = false;
let redisClient: Redis | null = null;
let hasLoggedWarning = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

/**
 * Key naming convention constants for consistent Redis key usage
 */
export const REDIS_KEYS = {
  RATE_LIMIT: 'rl:', // rl:ip:endpoint
  SESSION: 'session:', // session:userId:tokenPrefix
  PRICES: 'cache:prices',
  PRICE_HISTORY: 'cache:price-history:',
  LINK_PREVIEW: 'cache:link-preview:',
  ADMIN_USERS: 'cache:admin:users',
  ADMIN_PENDING: 'cache:admin:pending-counts',
  ADMIN_STATS: 'cache:admin:dashboard-stats',
  ADMIN_NOTIF_COUNTS: 'cache:admin:notif-counts',
  WS_CHANNEL_PRICES: 'ws:prices',
  WS_CHANNEL_SYNC: 'ws:sync',
} as const;

/**
 * Create the singleton Redis client with proper configuration
 */
function createRedisClient(): Redis {
  const client = new Redis(REDIS_URL, {
    lazyConnect: true, // Don't connect until first use
    maxRetriesPerRequest: 3,
    retryStrategy: (times: number) => {
      reconnectAttempts = times;
      
      if (times > MAX_RECONNECT_ATTEMPTS) {
        console.log('[Redis] Max reconnection attempts reached, giving up');
        isRedisAvailable = false;
        return null; // Stop retrying
      }
      
      // Exponential backoff: 100ms, 200ms, 400ms, 800ms, 1600ms
      const delay = Math.min(times * 100 * Math.pow(2, times - 1), 5000);
      console.log(`[Redis] Reconnecting in ${delay}ms (attempt ${times}/${MAX_RECONNECT_ATTEMPTS})`);
      return delay;
    },
    enableOfflineQueue: false, // Don't queue commands when disconnected
  });

  // Event listeners for connection status
  client.on('connect', () => {
    console.log('[Redis] Connected successfully');
    isRedisAvailable = true;
    hasLoggedWarning = false;
    reconnectAttempts = 0;
  });

  client.on('ready', () => {
    console.log('[Redis] Ready to accept commands');
    isRedisAvailable = true;
  });

  client.on('error', (err: Error) => {
    // Only log the first error to avoid spam
    if (!hasLoggedWarning) {
      console.log('[Redis] Connection error:', err.message);
      hasLoggedWarning = true;
    }
    isRedisAvailable = false;
  });

  client.on('close', () => {
    console.log('[Redis] Connection closed');
    isRedisAvailable = false;
  });

  client.on('reconnecting', () => {
    console.log(`[Redis] Reconnecting... (attempt ${reconnectAttempts + 1})`);
  });

  client.on('end', () => {
    console.log('[Redis] Connection ended');
    isRedisAvailable = false;
  });

  return client;
}

/**
 * Get the singleton Redis client instance
 * Returns null if Redis is not available
 */
export function getRedisClient(): Redis | null {
  if (!redisClient) {
    redisClient = createRedisClient();
  }
  return isRedisAvailable ? redisClient : null;
}

/**
 * Check if Redis is currently connected and available
 */
export function isRedisConnected(): boolean {
  return isRedisAvailable;
}

/**
 * Initialize Redis connection (call on server startup)
 * Returns true if connection successful, false otherwise
 */
export async function initRedis(): Promise<boolean> {
  try {
    if (!redisClient) {
      redisClient = createRedisClient();
    }

    console.log('[Redis] Initializing connection to:', REDIS_URL.replace(/\/\/.*@/, '//*****@')); // Hide password in logs
    
    await redisClient.connect();
    
    // Test the connection with a PING
    const pong = await redisClient.ping();
    if (pong === 'PONG') {
      console.log('[Redis] Connection verified (PING successful)');
      isRedisAvailable = true;
      return true;
    }
    
    return false;
  } catch (error) {
    const err = error as Error;
    console.log('[Redis] Failed to initialize:', err.message);
    console.log('[Redis] Application will continue without Redis caching');
    isRedisAvailable = false;
    hasLoggedWarning = true;
    return false;
  }
}

/**
 * Graceful shutdown - close Redis connection
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    try {
      console.log('[Redis] Closing connection...');
      await redisClient.quit();
      console.log('[Redis] Connection closed gracefully');
    } catch (error) {
      const err = error as Error;
      console.log('[Redis] Error during shutdown:', err.message);
      // Force disconnect if quit fails
      redisClient.disconnect();
    } finally {
      redisClient = null;
      isRedisAvailable = false;
    }
  }
}

/**
 * Safe GET operation - returns null if Redis unavailable or key doesn't exist
 */
export async function redisGet(key: string): Promise<string | null> {
  if (!isRedisAvailable || !redisClient) {
    return null;
  }

  try {
    return await redisClient.get(key);
  } catch (error) {
    if (!hasLoggedWarning) {
      console.log('[Redis] GET error:', (error as Error).message);
      hasLoggedWarning = true;
    }
    return null;
  }
}

/**
 * Safe SET operation with optional TTL in seconds
 * Returns true on success, false on failure
 */
export async function redisSet(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
  if (!isRedisAvailable || !redisClient) {
    return false;
  }

  try {
    if (ttlSeconds && ttlSeconds > 0) {
      await redisClient.setex(key, ttlSeconds, value);
    } else {
      await redisClient.set(key, value);
    }
    return true;
  } catch (error) {
    if (!hasLoggedWarning) {
      console.log('[Redis] SET error:', (error as Error).message);
      hasLoggedWarning = true;
    }
    return false;
  }
}

/**
 * Safe DEL operation
 * Returns true if key was deleted, false otherwise
 */
export async function redisDel(key: string): Promise<boolean> {
  if (!isRedisAvailable || !redisClient) {
    return false;
  }

  try {
    const result = await redisClient.del(key);
    return result > 0;
  } catch (error) {
    if (!hasLoggedWarning) {
      console.log('[Redis] DEL error:', (error as Error).message);
      hasLoggedWarning = true;
    }
    return false;
  }
}

/**
 * Safe atomic INCR with TTL - useful for rate limiting
 * Sets TTL on first creation of the key
 * Returns the incremented value, or null on failure
 */
export async function redisIncr(key: string, ttlSeconds: number): Promise<number | null> {
  if (!isRedisAvailable || !redisClient) {
    return null;
  }

  try {
    // Use MULTI/EXEC for atomic increment + conditional TTL
    const result = await redisClient
      .multi()
      .incr(key)
      .ttl(key)
      .exec();

    if (!result) {
      return null;
    }

    const [incrResult, ttlResult] = result;
    const count = incrResult[1] as number;
    const currentTtl = ttlResult[1] as number;

    // If TTL is -1 (no expiry set), set the TTL now
    if (currentTtl === -1 && ttlSeconds > 0) {
      await redisClient.expire(key, ttlSeconds);
    }

    return count;
  } catch (error) {
    if (!hasLoggedWarning) {
      console.log('[Redis] INCR error:', (error as Error).message);
      hasLoggedWarning = true;
    }
    return null;
  }
}

/**
 * Safe GET and parse as JSON
 * Returns null if Redis unavailable, key doesn't exist, or JSON parse fails
 */
export async function redisGetJSON<T>(key: string): Promise<T | null> {
  const value = await redisGet(key);
  if (value === null) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch (error) {
    if (!hasLoggedWarning) {
      console.log('[Redis] JSON parse error for key:', key);
      hasLoggedWarning = true;
    }
    return null;
  }
}

/**
 * Safe SET as JSON with optional TTL
 * Returns true on success, false on failure
 */
export async function redisSetJSON(key: string, value: any, ttlSeconds?: number): Promise<boolean> {
  try {
    const jsonString = JSON.stringify(value);
    return await redisSet(key, jsonString, ttlSeconds);
  } catch (error) {
    if (!hasLoggedWarning) {
      console.log('[Redis] JSON stringify error:', (error as Error).message);
      hasLoggedWarning = true;
    }
    return false;
  }
}

/**
 * Get multiple keys at once using MGET
 * Returns array of values (null for missing keys)
 */
export async function redisGetMulti(keys: string[]): Promise<(string | null)[]> {
  if (!isRedisAvailable || !redisClient || keys.length === 0) {
    return keys.map(() => null);
  }

  try {
    return await redisClient.mget(...keys);
  } catch (error) {
    if (!hasLoggedWarning) {
      console.log('[Redis] MGET error:', (error as Error).message);
      hasLoggedWarning = true;
    }
    return keys.map(() => null);
  }
}

/**
 * Delete keys by pattern using SCAN (safe for production, doesn't block)
 * Returns count of deleted keys
 */
export async function redisDelPattern(pattern: string): Promise<number> {
  if (!isRedisAvailable || !redisClient) {
    return 0;
  }

  try {
    let deletedCount = 0;
    let cursor = '0';

    // Use SCAN to safely iterate through keys matching pattern
    do {
      const [nextCursor, keys] = await redisClient.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;

      if (keys.length > 0) {
        const result = await redisClient.del(...keys);
        deletedCount += result;
      }
    } while (cursor !== '0');

    return deletedCount;
  } catch (error) {
    if (!hasLoggedWarning) {
      console.log('[Redis] DEL pattern error:', (error as Error).message);
      hasLoggedWarning = true;
    }
    return 0;
  }
}

/**
 * Create a separate Redis client for Pub/Sub subscriber
 * Pub/Sub needs a dedicated connection because the client goes into subscriber mode
 * Returns null if Redis is not available
 */
export function createRedisSubscriber(): Redis | null {
  if (!isRedisAvailable) {
    return null;
  }

  try {
    const subscriber = new Redis(REDIS_URL, {
      lazyConnect: false,
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        if (times > MAX_RECONNECT_ATTEMPTS) {
          return null;
        }
        return Math.min(times * 100 * Math.pow(2, times - 1), 5000);
      },
    });

    subscriber.on('error', (err: Error) => {
      console.log('[Redis Subscriber] Error:', err.message);
    });

    subscriber.on('connect', () => {
      console.log('[Redis Subscriber] Connected');
    });

    return subscriber;
  } catch (error) {
    console.log('[Redis] Failed to create subscriber:', (error as Error).message);
    return null;
  }
}
