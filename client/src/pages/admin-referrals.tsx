import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Gift, Users, CheckCircle, Clock } from "lucide-react";
import AdminLayout from "./admin-layout";
import { apiRequest } from "@/lib/queryClient";
import { formatDateTime } from "@/lib/date-utils";

interface ReferralUser {
  id: string;
  username: string | null;
  email?: string | null;
  display_id?: string | null;
}

interface ReferralRow {
  id: number;
  referrer_id: string;
  referred_user_id: string;
  referral_code: string;
  status: "pending" | "rewarded";
  reward_amount: string | null;
  reward_symbol: string | null;
  created_at: string;
  rewarded_at: string | null;
  referrer: ReferralUser | null;
  referredUser: ReferralUser | null;
}

function displayName(user: ReferralUser | null) {
  if (!user) return "Deleted user";
  return user.username || user.display_id || user.email || "Unknown";
}

export default function AdminReferralsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "rewarded">("all");

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-referrals"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/referrals");
      return res.json() as Promise<{ referrals: ReferralRow[] }>;
    },
    staleTime: 30 * 1000,
  });

  const referrals = data?.referrals || [];

  const stats = useMemo(() => {
    const rewarded = referrals.filter((r) => r.status === "rewarded");
    const totalPaid = rewarded.reduce((sum, r) => sum + (parseFloat(r.reward_amount || "0") || 0), 0);
    const rewardSymbol = rewarded[0]?.reward_symbol || "USDT";
    return {
      total: referrals.length,
      rewarded: rewarded.length,
      pending: referrals.length - rewarded.length,
      totalPaid: totalPaid.toFixed(2),
      rewardSymbol,
    };
  }, [referrals]);

  const filtered = referrals.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      displayName(r.referrer).toLowerCase().includes(q) ||
      displayName(r.referredUser).toLowerCase().includes(q) ||
      r.referral_code.toLowerCase().includes(q)
    );
  });

  return (
    <AdminLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Gift className="h-5 w-5" /> Referral Program
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Every referral relationship, its status, and reward paid out.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Users className="h-3.5 w-3.5" /> Total Referrals</div>
            <div className="text-xl font-bold text-foreground">{stats.total}</div>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><CheckCircle className="h-3.5 w-3.5" /> Rewarded</div>
            <div className="text-xl font-bold text-success">{stats.rewarded}</div>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Clock className="h-3.5 w-3.5" /> Pending Deposit</div>
            <div className="text-xl font-bold text-foreground">{stats.pending}</div>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Gift className="h-3.5 w-3.5" /> Total Paid Out</div>
            <div className="text-xl font-bold text-foreground">{stats.totalPaid} {stats.rewardSymbol}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            placeholder="Search by username or referral code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:max-w-xs"
          />
          <div className="flex gap-1.5">
            {(["all", "pending", "rewarded"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                  statusFilter === s ? "bg-primary/10 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground border border-transparent"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading referrals...</div>
          ) : error ? (
            <div className="p-8 text-center text-sm text-danger">Failed to load referrals.</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No referrals match this view.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Referrer</th>
                    <th className="px-4 py-3 font-medium">Referred User</th>
                    <th className="px-4 py-3 font-medium">Code</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Reward</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-3 text-foreground font-medium">{displayName(r.referrer)}</td>
                      <td className="px-4 py-3 text-foreground">{displayName(r.referredUser)}</td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{r.referral_code}</td>
                      <td className="px-4 py-3">
                        {r.status === "rewarded" ? (
                          <Badge className="bg-success/10 text-success border-success/30">Rewarded</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">Pending deposit</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        {r.status === "rewarded" ? `+${r.reward_amount} ${r.reward_symbol}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {formatDateTime(r.rewarded_at || r.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
