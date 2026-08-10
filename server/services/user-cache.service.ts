/**
 * User Cache Service
 * Caches user data (role, active status, wallet lock) to reduce database queries
 * on every authenticated request.
 */

import { REDIS_KEYS, CACHE_TTL, cacheGet, cacheSet, cacheInvalidate, cacheGetOrSet } from '../utils/redis';

// User data that gets cached
export interface CachedUserData {
  id: string;
  role: string;
  isActive: boolean;
  walletLocked: boolean;
  email?: string;
  fullName?: string;
  // Cache metadata
  cachedAt: number;
}

/**
 * Get cached user data by userId
 */
export async function getCachedUserData(userId: string): Promise<CachedUserData | null> {
  const key = `${REDIS_KEYS.USER_DATA}${userId}`;
  return cacheGet<CachedUserData>(key);
}

/**
 * Set user data in cache
 */
export async function setCachedUserData(userData: CachedUserData): Promise<void> {
  const key = `${REDIS_KEYS.USER_DATA}${userData.id}`;
  await cacheSet(key, userData, CACHE_TTL.USER_DATA);
}

/**
 * Invalidate user cache (call after user updates)
 */
export async function invalidateUserCache(userId: string): Promise<void> {
  const key = `${REDIS_KEYS.USER_DATA}${userId}`;
  await cacheInvalidate(key);
}

/**
 * Get user data with cache-through pattern
 * If cached, returns from cache. Otherwise fetches from DB and caches.
 */
export async function getUserDataCached(
  userId: string,
  fetchFromDb: () => Promise<{ role: string; is_active: boolean; wallet_locked: boolean; email?: string; full_name?: string } | null>
): Promise<CachedUserData | null> {
  const key = `${REDIS_KEYS.USER_DATA}${userId}`;

  return cacheGetOrSet<CachedUserData | null>(key, CACHE_TTL.USER_DATA, async () => {
    const dbData = await fetchFromDb();
    if (!dbData) return null;

    return {
      id: userId,
      role: dbData.role || 'user',
      isActive: dbData.is_active !== false,
      walletLocked: dbData.wallet_locked === true,
      email: dbData.email,
      fullName: dbData.full_name,
      cachedAt: Date.now(),
    };
  });
}

/**
 * Batch get multiple users from cache
 * Returns a Map of userId -> CachedUserData (null for misses)
 */
export async function getCachedUsersData(userIds: string[]): Promise<Map<string, CachedUserData | null>> {
  const results = new Map<string, CachedUserData | null>();

  // Fetch from cache in parallel
  const cachePromises = userIds.map(async (userId) => {
    const data = await getCachedUserData(userId);
    results.set(userId, data);
  });

  await Promise.all(cachePromises);
  return results;
}

/**
 * Batch set multiple users in cache
 */
export async function setCachedUsersData(users: CachedUserData[]): Promise<void> {
  const setPromises = users.map(user => setCachedUserData(user));
  await Promise.all(setPromises);
}
