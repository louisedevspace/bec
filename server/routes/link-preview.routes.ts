import type { Express, Request, Response } from 'express';
import { requireAuth } from './middleware';
import { fetchLinkPreview, LinkPreviewData } from '../utils/link-preview';
import { redisGetJSON, redisSetJSON, isRedisConnected, REDIS_KEYS } from '../utils/redis';

interface CacheEntry {
  data: LinkPreviewData;
  timestamp: number;
}

// In-memory cache as fallback when Redis is unavailable
const fallbackCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const REDIS_TTL_SECONDS = 3600; // 1 hour for Redis

/**
 * Generate Redis key for a URL
 */
function getRedisKey(url: string): string {
  return REDIS_KEYS.LINK_PREVIEW + encodeURIComponent(url);
}

/**
 * Clean up expired fallback cache entries (used when Redis is down)
 */
function cleanupFallbackCache(): void {
  const now = Date.now();
  const entries = Array.from(fallbackCache.entries());
  for (const [key, entry] of entries) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      fallbackCache.delete(key);
    }
  }
}

// Run fallback cache cleanup periodically (only matters when Redis is down)
setInterval(cleanupFallbackCache, 10 * 60 * 1000); // Every 10 minutes

/**
 * Get cached preview data - Redis first, Map fallback
 */
async function getCachedPreview(url: string): Promise<LinkPreviewData | null> {
  // Try Redis first
  try {
    if (isRedisConnected()) {
      const redisKey = getRedisKey(url);
      const redisData = await redisGetJSON<LinkPreviewData>(redisKey);
      if (redisData) {
        console.log('[Redis:LinkPreview] Cache hit for:', url.substring(0, 50));
        return redisData;
      }
    }
  } catch (error) {
    console.log('[Redis:LinkPreview] Error reading cache:', (error as Error).message);
  }

  // Fallback to Map cache
  const entry = fallbackCache.get(url);
  if (!entry) return null;

  const now = Date.now();
  if (now - entry.timestamp > CACHE_TTL_MS) {
    fallbackCache.delete(url);
    return null;
  }

  console.log('[Redis:LinkPreview] Fallback cache hit for:', url.substring(0, 50));
  return entry.data;
}

/**
 * Store preview data in cache - write to both Redis and Map
 */
async function setCachedPreview(url: string, data: LinkPreviewData): Promise<void> {
  // Write to Redis (with TTL, Redis handles expiry automatically)
  try {
    if (isRedisConnected()) {
      const redisKey = getRedisKey(url);
      const success = await redisSetJSON(redisKey, data, REDIS_TTL_SECONDS);
      if (success) {
        console.log('[Redis:LinkPreview] Cached:', url.substring(0, 50));
      }
    }
  } catch (error) {
    console.log('[Redis:LinkPreview] Error writing cache:', (error as Error).message);
  }

  // Always write to fallback Map (for when Redis is unavailable)
  fallbackCache.set(url, {
    data,
    timestamp: Date.now(),
  });
}

/**
 * Link preview route handler
 */
async function handleLinkPreview(req: Request, res: Response): Promise<void> {
  try {
    const { url } = req.query;
    
    // Validate URL parameter
    if (!url || typeof url !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Missing or invalid "url" query parameter',
      });
      return;
    }
    
    // Decode URL if encoded
    let decodedUrl: string;
    try {
      decodedUrl = decodeURIComponent(url);
    } catch {
      decodedUrl = url;
    }
    
    // Check cache first (Redis, then Map fallback)
    const cachedData = await getCachedPreview(decodedUrl);
    if (cachedData) {
      res.json({
        success: true,
        data: cachedData,
        cached: true,
      });
      return;
    }
    
    // Fetch fresh preview data
    const previewData = await fetchLinkPreview(decodedUrl);
    
    // Cache the result (writes to both Redis and Map)
    await setCachedPreview(decodedUrl, previewData);
    
    res.json({
      success: true,
      data: previewData,
      cached: false,
    });
  } catch (error: any) {
    const message = error.message || 'Failed to fetch link preview';
    
    // Don't expose internal error details
    const safeMessage = message.includes('Private network') || 
                        message.includes('Internal URLs') ||
                        message.includes('Only HTTP') ||
                        message.includes('Invalid URL') ||
                        message.includes('timed out') ||
                        message.includes('HTTP ') ||
                        message.includes('not found')
      ? message
      : 'Failed to fetch link preview';
    
    res.status(400).json({
      success: false,
      error: safeMessage,
    });
  }
}

/**
 * Register link preview routes
 */
export default function registerLinkPreviewRoutes(app: Express): void {
  app.get('/api/link-preview', requireAuth, handleLinkPreview);
}
