import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

export interface PendingCounts {
  deposits: number;
  withdrawals: number;
  trades: number;
  futures: number;
  loans: number;
  kyc: number;
  support: number;
}

// Badge keys that map to nav items
export type BadgeKey = 'dashboard' | 'wallets' | 'users' | 'support';

// Map badge keys to their corresponding count fields
const BADGE_KEY_COUNTS: Record<BadgeKey, (keyof PendingCounts)[]> = {
  dashboard: ['trades', 'futures'],
  wallets: ['deposits', 'withdrawals'],
  users: ['kyc', 'loans'],
  support: ['support'],
};

const EMPTY_COUNTS: PendingCounts = {
  deposits: 0,
  withdrawals: 0,
  trades: 0,
  futures: 0,
  loans: 0,
  kyc: 0,
  support: 0,
};

// LocalStorage key for acknowledged counts
const ACKNOWLEDGED_KEY = 'admin_acknowledged_counts';

interface AcknowledgedCounts {
  dashboard: number;
  wallets: number;
  users: number;
  support: number;
  timestamp: number;
}

const EMPTY_ACKNOWLEDGED: AcknowledgedCounts = {
  dashboard: 0,
  wallets: 0,
  users: 0,
  support: 0,
  timestamp: 0,
};

function loadAcknowledged(): AcknowledgedCounts {
  try {
    const stored = localStorage.getItem(ACKNOWLEDGED_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Reset acknowledged if more than 24 hours old
      if (Date.now() - parsed.timestamp > 24 * 60 * 60 * 1000) {
        return { ...EMPTY_ACKNOWLEDGED, timestamp: Date.now() };
      }
      return parsed;
    }
  } catch {}
  return { ...EMPTY_ACKNOWLEDGED, timestamp: Date.now() };
}

function saveAcknowledged(ack: AcknowledgedCounts) {
  try {
    localStorage.setItem(ACKNOWLEDGED_KEY, JSON.stringify({ ...ack, timestamp: Date.now() }));
  } catch {}
}

export function useAdminPendingCounts(pollInterval = 15000) {
  const [counts, setCounts] = useState<PendingCounts>(EMPTY_COUNTS);
  const [acknowledged, setAcknowledged] = useState<AcknowledgedCounts>(loadAcknowledged);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchCounts = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const res = await fetch("/api/admin/pending-counts", {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (!res.ok) return;
      const data = await res.json();
      setCounts({
        deposits: data.deposits ?? 0,
        withdrawals: data.withdrawals ?? 0,
        trades: data.trades ?? 0,
        futures: data.futures ?? 0,
        loans: data.loans ?? 0,
        kyc: data.kyc ?? 0,
        support: data.support ?? 0,
      });
    } catch {
      // Silently fail — admin might not be logged in
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCounts();
    if (pollInterval > 0) {
      intervalRef.current = setInterval(fetchCounts, pollInterval);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchCounts, pollInterval]);

  // Calculate the total pending count for a badge key
  const getTotalForBadgeKey = useCallback((key: BadgeKey): number => {
    const fields = BADGE_KEY_COUNTS[key];
    return fields.reduce((sum, field) => sum + counts[field], 0);
  }, [counts]);

  // Get badge count (total - acknowledged, min 0)
  const getBadgeCount = useCallback((key: BadgeKey): number => {
    const total = getTotalForBadgeKey(key);
    const ack = acknowledged[key] || 0;
    // Only show badge if current total exceeds what was acknowledged
    return Math.max(0, total - ack);
  }, [getTotalForBadgeKey, acknowledged]);

  // Acknowledge a section (call when user navigates to that section)
  const acknowledgeSection = useCallback((key: BadgeKey) => {
    const total = getTotalForBadgeKey(key);
    setAcknowledged(prev => {
      const updated = { ...prev, [key]: total };
      saveAcknowledged(updated);
      return updated;
    });
  }, [getTotalForBadgeKey]);

  // Reset acknowledged count for a section (used when total drops below acknowledged)
  useEffect(() => {
    // Auto-adjust acknowledged if total drops (items were processed)
    let needsUpdate = false;
    const updated = { ...acknowledged };

    (['dashboard', 'wallets', 'users', 'support'] as BadgeKey[]).forEach(key => {
      const total = getTotalForBadgeKey(key);
      if (updated[key] > total) {
        updated[key] = total;
        needsUpdate = true;
      }
    });

    if (needsUpdate) {
      setAcknowledged(updated);
      saveAcknowledged(updated);
    }
  }, [counts, getTotalForBadgeKey, acknowledged]);

  // Total pending across all sections
  const totalPending = counts.deposits + counts.withdrawals + counts.trades +
    counts.futures + counts.loans + counts.kyc + counts.support;

  // Total unacknowledged (for bell icon)
  const totalUnacknowledged = (['dashboard', 'wallets', 'users', 'support'] as BadgeKey[])
    .reduce((sum, key) => sum + getBadgeCount(key), 0);

  return {
    counts,
    totalPending,
    totalUnacknowledged,
    loading,
    refetch: fetchCounts,
    getBadgeCount,
    acknowledgeSection,
  };
}
