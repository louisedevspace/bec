import crypto from 'crypto';
import { supabaseAdmin } from '../routes/middleware';

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

// Session cache with expiration (in-memory for now, can be moved to Redis)
const sessionCache = new Map<string, SessionInfo>();
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes of inactivity

/**
 * Validate and refresh session, returns session info or null if invalid
 */
export async function validateSession(
  token: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<SessionInfo | null> {
  const cacheKey = `${userId}:${token.substring(0, 16)}`;
  const cached = sessionCache.get(cacheKey);
  const now = new Date();

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
 */
export function invalidateSession(token: string, userId: string): void {
  const cacheKey = `${userId}:${token.substring(0, 16)}`;
  sessionCache.delete(cacheKey);
}

/**
 * Clean up expired sessions (run periodically)
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

// Run cleanup every 5 minutes
setInterval(() => {
  const cleaned = cleanupExpiredSessions();
  if (cleaned > 0) {
    console.log(`[Security] Cleaned up ${cleaned} expired sessions`);
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
 */
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Check if request should be rate limited
 * @param identifier - Usually IP address or user ID
 * @param maxRequests - Max requests allowed
 * @param windowMs - Time window in milliseconds
 */
export function checkRateLimit(identifier: string, maxRequests: number = 5, windowMs: number = 60000): boolean {
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
 */
export function getRateLimitRemaining(identifier: string, maxRequests: number = 5): number {
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
