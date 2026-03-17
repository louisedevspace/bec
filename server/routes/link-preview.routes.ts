import type { Express, Request, Response } from 'express';
import { requireAuth } from './middleware';
import { fetchLinkPreview, LinkPreviewData } from '../utils/link-preview';

interface CacheEntry {
  data: LinkPreviewData;
  timestamp: number;
}

// In-memory cache with TTL
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_SIZE = 500;

/**
 * Clean up expired cache entries and enforce max size
 */
function cleanupCache(): void {
  const now = Date.now();
  
  // Remove expired entries
  const entries = Array.from(cache.entries());
  for (const [key, entry] of entries) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      cache.delete(key);
    }
  }
  
  // If still over max size, remove oldest entries
  if (cache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(cache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    const toRemove = entries.slice(0, cache.size - MAX_CACHE_SIZE);
    for (const [key] of toRemove) {
      cache.delete(key);
    }
  }
}

/**
 * Get cached preview data if valid
 */
function getCachedPreview(url: string): LinkPreviewData | null {
  const entry = cache.get(url);
  if (!entry) return null;
  
  const now = Date.now();
  if (now - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(url);
    return null;
  }
  
  return entry.data;
}

/**
 * Store preview data in cache
 */
function setCachedPreview(url: string, data: LinkPreviewData): void {
  // Cleanup before adding new entry
  if (cache.size >= MAX_CACHE_SIZE) {
    cleanupCache();
  }
  
  cache.set(url, {
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
    
    // Check cache first
    const cachedData = getCachedPreview(decodedUrl);
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
    
    // Cache the result
    setCachedPreview(decodedUrl, previewData);
    
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
