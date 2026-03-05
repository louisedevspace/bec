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

const EMPTY_COUNTS: PendingCounts = {
  deposits: 0,
  withdrawals: 0,
  trades: 0,
  futures: 0,
  loans: 0,
  kyc: 0,
  support: 0,
};

export function useAdminPendingCounts(pollInterval = 15000) {
  const [counts, setCounts] = useState<PendingCounts>(EMPTY_COUNTS);
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

  // Total pending across all sections
  const totalPending = counts.deposits + counts.withdrawals + counts.trades +
    counts.futures + counts.loans + counts.kyc + counts.support;

  return { counts, totalPending, loading, refetch: fetchCounts };
}
