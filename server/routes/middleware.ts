import type { Request, Response, NextFunction } from "express";
import { createClient } from '@supabase/supabase-js';
import { validateSession, getClientIP, getUserAgent, logAuditEvent, invalidateSession } from '../utils/security';

// Augment Express Request to include Supabase auth user and session info
declare global {
  namespace Express {
    interface Request {
      user: {
        id: string;
        email?: string;
        email_confirmed_at?: string | null;
        [key: string]: any;
      };
      sessionInfo?: {
        userId: string;
        createdAt: Date;
        lastActivityAt: Date;
        ipAddress?: string;
        userAgent?: string;
      };
    }
  }
}

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

/**
 * Auth middleware — verifies Bearer token via Supabase and attaches user to req.
 * Also validates session for activity tracking and security.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ message: 'Missing Authorization header' });
  }

  const token = authHeader.replace('Bearer ', '');
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    req.user = data.user;

    // Validate and track session
    const sessionInfo = await validateSession(token, data.user.id, ipAddress, userAgent);
    if (!sessionInfo) {
      // Session expired due to inactivity
      return res.status(401).json({ message: 'Session expired due to inactivity. Please log in again.' });
    }

    req.sessionInfo = sessionInfo;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Authentication failed' });
  }
}

/**
 * Admin-only middleware — must run after requireAuth.
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Not authenticated' });
    }
    const isAdmin = await hasAdminAccess(userId);
    if (!isAdmin) {
      const ipAddress = getClientIP(req);
      const userAgent = getUserAgent(req);
      await logAuditEvent({
        userId,
        action: 'ADMIN_ACCESS_DENIED',
        ipAddress,
        userAgent,
        status: 'failure',
      });
      return res.status(403).json({ message: 'Admin access required' });
    }
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Admin access check failed' });
  }
}

/**
 * Verified user middleware — requires confirmed email. Must run after requireAuth.
 */
export async function requireVerifiedUser(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    if (!req.user.email_confirmed_at) {
      return res.status(403).json({ message: 'Email verification required. Please verify your email first.' });
    }

    next();
  } catch (error) {
    return res.status(403).json({ message: 'Verification check failed' });
  }
}

/**
 * Check if user has admin role in the database.
 */
export async function hasAdminAccess(userId: string): Promise<boolean> {
  try {
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();

    if (error || !user) {
      return false;
    }

    return user.role === 'admin';
  } catch (error) {
    return false;
  }
}

/**
 * Wallet lock middleware — blocks financial operations when wallet is locked.
 * Must run after requireAuth. Admins bypass this check.
 */
export async function requireUnlockedWallet(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('wallet_locked, role')
      .eq('id', userId)
      .single();

    if (error || !user) {
      return next(); // If user not found in custom table, let through (fail-open for schema issues)
    }

    // Admins bypass wallet lock
    if (user.role === 'admin') {
      return next();
    }

    if (user.wallet_locked) {
      return res.status(403).json({
        message: 'Your wallet is currently locked. All financial operations are restricted. Please contact support for assistance.',
        code: 'WALLET_LOCKED',
      });
    }

    next();
  } catch (error) {
    // Fail-open: don't block user if the check itself fails
    next();
  }
}

/**
 * Check if a specific asset is frozen for a user.
 * Returns { frozen: boolean, available: number, frozenAmount: number }
 */
export async function checkAssetFrozen(userId: string, symbol: string): Promise<{ frozen: boolean; available: number; frozenAmount: number }> {
  try {
    const { data: portfolio } = await supabaseAdmin
      .from('portfolios')
      .select('available, frozen')
      .eq('user_id', userId)
      .eq('symbol', symbol.toUpperCase())
      .maybeSingle();

    if (!portfolio) {
      return { frozen: false, available: 0, frozenAmount: 0 };
    }

    const available = parseFloat(portfolio.available || '0');
    const frozenAmount = parseFloat(portfolio.frozen || '0');

    return {
      frozen: frozenAmount > 0 && available === 0, // Fully frozen
      available,
      frozenAmount,
    };
  } catch {
    return { frozen: false, available: 0, frozenAmount: 0 };
  }
}

/**
 * Export session invalidation for logout endpoints
 */
export { invalidateSession };
