import crypto from 'crypto';
import { supabaseAdmin } from '../routes/middleware';
import { 
  isRedisConnected, 
  redisGet, 
  redisIncr, 
  redisGetJSON, 
  redisSetJSON, 
  redisDel, 
  redisDelPattern,
  REDIS_KEYS 
} from './redis';

// ==================== PASSWORD HASHING ====================

const SALT_LENGTH = 32;
const KEY_LENGTH = 64;
const ITERATIONS = 100000;
const DIGEST = 'sha512';

/**
 * Hash a password using PBKDF2 with a random salt
 * Returns format: salt:hash (both hex encoded)
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(SALT_LENGTH).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verify a password against a stored hash
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [salt, hash] = storedHash.split(':');
    if (!salt || !hash) return false;
    
    const verifyHash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(verifyHash, 'hex'));
  } catch {
    return false;
  }
}

// ==================== SESSION MANAGEMENT ====================

export interface SessionInfo {
  userId: string;
  email?: string;
  role?: string;
  createdAt: Date;
  lastActivityAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

// Redis-serializable session format (dates as ISO strings)
interface RedisSessionInfo {
  userId: string;
  email?: string;
  role?: string;
  createdAt: string;
  lastActivityAt: string;
  ipAddress?: string;
  userAgent?: string;
}

// Session cache with expiration (in-memory fallback when Redis unavailable)
const sessionCache = new Map<string, SessionInfo>();
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes of inactivity
const SESSION_TIMEOUT_SECONDS = 30 * 60; // 30 minutes for Redis TTL

/**
 * Helper: Convert SessionInfo to Redis-serializable format
 */
function toRedisSession(session: SessionInfo): RedisSessionInfo {
  return {
    ...session,
    createdAt: session.createdAt.toISOString(),
    lastActivityAt: session.lastActivityAt.toISOString(),
  };
}

/**
 * Helper: Convert Redis session to SessionInfo
 */
function fromRedisSession(redisSession: RedisSessionInfo): SessionInfo {
  return {
    ...redisSession,
    createdAt: new Date(redisSession.createdAt),
    lastActivityAt: new Date(redisSession.lastActivityAt),
  };
}

/**
 * Build Redis session key
 */
function buildSessionKey(userId: string, tokenPrefix: string): string {
  return REDIS_KEYS.SESSION + userId + ':' + tokenPrefix;
}

/**
 * Validate and refresh session, returns session info or null if invalid
 * Uses Redis if available, falls back to in-memory Map
 */
export async function validateSession(
  token: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<SessionInfo | null> {
  const tokenPrefix = token.substring(0, 16);
  const cacheKey = `${userId}:${tokenPrefix}`;
  const redisKey = buildSessionKey(userId, tokenPrefix);
  const now = new Date();

  // Try Redis first
  if (isRedisConnected()) {
    try {
      const redisSession = await redisGetJSON<RedisSessionInfo>(redisKey);
      
      if (redisSession) {
        const session = fromRedisSession(redisSession);
        
        // Check if session has expired due to inactivity
        const inactiveTime = now.getTime() - session.lastActivityAt.getTime();
        if (inactiveTime > SESSION_TIMEOUT_MS) {
          await redisDel(redisKey);
          await logAuditEvent({
            userId,
            action: 'SESSION_EXPIRED',
            details: { reason: 'inactivity', inactiveMinutes: Math.floor(inactiveTime / 60000) },
            ipAddress,
            userAgent,
          });
          console.log(`[Redis:Security] Session expired for user ${userId}`);
          return null;
        }

        // Update last activity and refresh TTL
        session.lastActivityAt = now;
        await redisSetJSON(redisKey, toRedisSession(session), SESSION_TIMEOUT_SECONDS);
        return session;
      }

      // No session in Redis, create new one
      const sessionInfo: SessionInfo = {
        userId,
        createdAt: now,
        lastActivityAt: now,
        ipAddress,
        userAgent,
      };
      await redisSetJSON(redisKey, toRedisSession(sessionInfo), SESSION_TIMEOUT_SECONDS);
      console.log(`[Redis:Security] Created new session for user ${userId}`);
      return sessionInfo;
    } catch (error) {
      console.log('[Redis:Security] Session validation error, falling back to Map:', (error as Error).message);
    }
  }

  // Map fallback
  const cached = sessionCache.get(cacheKey);

  if (cached) {
    // Check if session has expired due to inactivity
    const inactiveTime = now.getTime() - cached.lastActivityAt.getTime();
    if (inactiveTime > SESSION_TIMEOUT_MS) {
      sessionCache.delete(cacheKey);
      await logAuditEvent({
        userId,
        action: 'SESSION_EXPIRED',
        details: { reason: 'inactivity', inactiveMinutes: Math.floor(inactiveTime / 60000) },
        ipAddress,
        userAgent,
      });
      return null;
    }

    // Update last activity
    cached.lastActivityAt = now;
    return cached;
  }

  // Create new session entry
  const sessionInfo: SessionInfo = {
    userId,
    createdAt: now,
    lastActivityAt: now,
    ipAddress,
    userAgent,
  };
  sessionCache.set(cacheKey, sessionInfo);

  return sessionInfo;
}

/**
 * Invalidate a session (logout)
 * Uses Redis if available, falls back to in-memory Map
 */
export async function invalidateSession(token: string, userId: string): Promise<void> {
  const tokenPrefix = token.substring(0, 16);
  const cacheKey = `${userId}:${tokenPrefix}`;
  const redisKey = buildSessionKey(userId, tokenPrefix);

  // Try Redis first
  if (isRedisConnected()) {
    try {
      const deleted = await redisDel(redisKey);
      if (deleted) {
        console.log(`[Redis:Security] Invalidated session for user ${userId}`);
      }
    } catch (error) {
      console.log('[Redis:Security] Session invalidation error:', (error as Error).message);
    }
  }

  // Always clean up Map fallback as well
  sessionCache.delete(cacheKey);
}

/**
 * Invalidate all sessions for a user (logout from all devices)
 * Uses Redis pattern delete if available, falls back to in-memory Map
 */
export async function invalidateUserSessions(userId: string): Promise<number> {
  let deletedCount = 0;

  // Try Redis first
  if (isRedisConnected()) {
    try {
      const pattern = REDIS_KEYS.SESSION + userId + ':*';
      deletedCount = await redisDelPattern(pattern);
      if (deletedCount > 0) {
        console.log(`[Redis:Security] Invalidated ${deletedCount} sessions for user ${userId}`);
      }
    } catch (error) {
      console.log('[Redis:Security] User sessions invalidation error:', (error as Error).message);
    }
  }

  // Also clean up Map fallback
  const mapEntries = Array.from(sessionCache.keys());
  for (const key of mapEntries) {
    if (key.startsWith(`${userId}:`)) {
      sessionCache.delete(key);
      deletedCount++;
    }
  }

  return deletedCount;
}

/**
 * Clean up expired sessions (run periodically)
 * Only cleans Map fallback - Redis handles TTL automatically
 */
export function cleanupExpiredSessions(): number {
  const now = Date.now();
  let cleaned = 0;
  
  const entries = Array.from(sessionCache.entries());
  for (const [key, session] of entries) {
    if (now - session.lastActivityAt.getTime() > SESSION_TIMEOUT_MS) {
      sessionCache.delete(key);
      cleaned++;
    }
  }
  
  return cleaned;
}

// Run cleanup every 5 minutes (for Map fallback)
setInterval(() => {
  const cleaned = cleanupExpiredSessions();
  if (cleaned > 0) {
    console.log(`[Security] Cleaned up ${cleaned} expired sessions from Map fallback`);
  }
}, 5 * 60 * 1000);

// ==================== AUDIT LOGGING ====================

export interface AuditLogEntry {
  userId: string;
  action: string;
  resourceType?: string;
  resourceId?: string | number;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  status?: 'success' | 'failure' | 'pending';
  errorMessage?: string;
}

/**
 * Log an audit event to the database
 */
export async function logAuditEvent(entry: AuditLogEntry): Promise<void> {
  try {
    // Sanitize details to remove sensitive information
    const sanitizedDetails = entry.details ? sanitizeAuditDetails(entry.details) : null;

    await supabaseAdmin.from('audit_logs').insert({
      user_id: entry.userId,
      action: entry.action,
      resource_type: entry.resourceType || null,
      resource_id: entry.resourceId?.toString() || null,
      details: sanitizedDetails,
      ip_address: entry.ipAddress || null,
      user_agent: entry.userAgent ? entry.userAgent.substring(0, 500) : null,
      status: entry.status || 'success',
      error_message: entry.errorMessage || null,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    // Don't throw - audit logging should not break the main flow
    console.error('[Audit] Failed to log audit event:', entry.action, error);
  }
}

/**
 * Sanitize audit details to remove sensitive information
 */
function sanitizeAuditDetails(details: Record<string, any>): Record<string, any> {
  const sensitiveKeys = ['password', 'ssn', 'token', 'secret', 'key', 'authorization'];
  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(details)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeAuditDetails(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

// ==================== FINANCIAL OPERATION AUDIT HELPERS ====================

export async function logFinancialOperation(params: {
  userId: string;
  operation: 'DEPOSIT' | 'WITHDRAWAL' | 'TRADE' | 'FUTURES_TRADE' | 'STAKING' | 'LOAN' | 'PORTFOLIO_UPDATE';
  action: 'CREATE' | 'UPDATE' | 'APPROVE' | 'REJECT' | 'COMPLETE' | 'CANCEL';
  resourceId?: string | number;
  amount?: string | number;
  symbol?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  status?: 'success' | 'failure' | 'pending';
  errorMessage?: string;
}): Promise<void> {
  await logAuditEvent({
    userId: params.userId,
    action: `${params.operation}_${params.action}`,
    resourceType: params.operation,
    resourceId: params.resourceId,
    details: {
      amount: params.amount,
      symbol: params.symbol,
      ...params.details,
    },
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    status: params.status,
    errorMessage: params.errorMessage,
  });
}

// ==================== REQUEST HELPERS ====================

/**
 * Extract client IP from request
 */
export function getClientIP(req: any): string {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         'unknown';
}

/**
 * Extract user agent from request
 */
export function getUserAgent(req: any): string {
  return req.headers['user-agent'] || 'unknown';
}

// ==================== PASSWORD POLICY ====================

/**
 * SECURITY FIX M4: Validate password against policy requirements
 */
export function validatePasswordPolicy(password: string): { valid: boolean; message: string } {
  // Minimum 8 characters
  if (!password || password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long' };
  }

  // Maximum 128 characters
  if (password.length > 128) {
    return { valid: false, message: 'Password must not exceed 128 characters' };
  }

  // At least one uppercase letter
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }

  // At least one lowercase letter
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }

  // At least one digit
  if (!/\d/.test(password)) {
    return { valid: false, message: 'Password must contain at least one digit' };
  }

  // At least one special character
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one special character' };
  }

  return { valid: true, message: 'Password is valid' };
}

// ==================== RATE LIMITING ====================

/**
 * SECURITY FIX M3: Simple in-memory rate limiting by IP
 * Now with Redis-first, Map-fallback pattern
 */
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Check if request should be rate limited
 * Uses Redis if available, falls back to in-memory Map
 * @param identifier - Usually IP address or user ID
 * @param maxRequests - Max requests allowed
 * @param windowMs - Time window in milliseconds
 */
export async function checkRateLimit(identifier: string, maxRequests: number = 5, windowMs: number = 60000): Promise<boolean> {
  const windowSeconds = Math.ceil(windowMs / 1000);
  const redisKey = REDIS_KEYS.RATE_LIMIT + identifier;

  // Try Redis first
  if (isRedisConnected()) {
    try {
      const count = await redisIncr(redisKey, windowSeconds);
      if (count !== null) {
        const allowed = count <= maxRequests;
        if (!allowed) {
          console.log(`[Redis:Security] Rate limit exceeded for ${identifier}: ${count}/${maxRequests}`);
        }
        return allowed;
      }
      // If redisIncr returned null, fall through to Map fallback
      console.log('[Redis:Security] INCR returned null, falling back to Map');
    } catch (error) {
      console.log('[Redis:Security] Rate limit check error, falling back to Map:', (error as Error).message);
    }
  }

  // Map fallback
  const now = Date.now();
  const entry = rateLimitStore.get(identifier);

  if (!entry || now >= entry.resetTime) {
    // Create new entry
    rateLimitStore.set(identifier, { count: 1, resetTime: now + windowMs });
    return true;
  }

  entry.count++;
  return entry.count <= maxRequests;
}

/**
 * Get remaining requests for identifier
 * Uses Redis if available, falls back to in-memory Map
 */
export async function getRateLimitRemaining(identifier: string, maxRequests: number = 5, windowMs: number = 60000): Promise<number> {
  const redisKey = REDIS_KEYS.RATE_LIMIT + identifier;

  // Try Redis first
  if (isRedisConnected()) {
    try {
      const countStr = await redisGet(redisKey);
      if (countStr !== null) {
        const count = parseInt(countStr, 10);
        return Math.max(0, maxRequests - count);
      }
      // Key doesn't exist, full quota available
      return maxRequests;
    } catch (error) {
      console.log('[Redis:Security] Get rate limit remaining error, falling back to Map:', (error as Error).message);
    }
  }

  // Map fallback
  const entry = rateLimitStore.get(identifier);
  if (!entry || Date.now() >= entry.resetTime) {
    return maxRequests;
  }
  return Math.max(0, maxRequests - entry.count);
}

// Clean up expired rate limit entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  const entries = Array.from(rateLimitStore.entries());
  for (const [key, entry] of entries) {
    if (now >= entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 10 * 60 * 1000);

// ==================== ERROR SANITIZATION ====================

/**
 * SECURITY FIX M2: Sanitize error responses to prevent information leakage
 */
export function sanitizeErrorResponse(error: any, isDevelopment: boolean = false): string {
  // In production, return generic error message
  if (!isDevelopment) {
    return 'An error occurred. Please try again later.';
  }

  // In development, return the actual error
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
