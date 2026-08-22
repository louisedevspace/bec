import { PriceTicker } from "@/components/crypto/price-ticker";
import { CryptoList } from "@/components/crypto/crypto-list";
import { lazy, Suspense, useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { apiRequest } from "@/lib/queryClient";
import { cryptoApi } from "@/services/crypto-api";
import { formatUsdNumber } from "@/utils/format-utils";
import { timeAgo } from "@/lib/date-utils";
import { StatusBadge } from "@/components/ui/status-badge";
import { useLocation } from "wouter";
import type { Trade } from "@/types/crypto";
import {
  Wallet,
  ArrowRightLeft,
  CreditCard,
  UserPlus,
  Banknote,
  PieChart,
  History,
  Shield,
  TrendingUp,
  TrendingDown,
  Star,
  ArrowDownLeft,
  ArrowUpRight,
  ListOrdered,
  ChevronRight,
} from "lucide-react";
import { IlluminatedHero } from "@/components/ui/illuminated-hero";

const StakingModal = lazy(() =>
  import("@/components/modals/staking-modal").then((m) => ({
    default: m.StakingModal,
  })),
);
const VerificationModal = lazy(() =>
  import("@/components/modals/verification-modal").then((m) => ({
    default: m.VerificationModal,
  })),
);
const LoanApplicationModal = lazy(() =>
  import("@/components/modals/loan-application-modal").then((m) => ({
    default: m.LoanApplicationModal,
  })),
);
const UserLoanHistoryModal = lazy(() =>
  import("@/components/modals/user-loan-history-modal").then((m) => ({
    default: m.UserLoanHistoryModal,
  })),
);

interface WalletAsset {
  symbol: string;
  available: number;
  frozen: number;
  total: number;
  price: number;
  usdValue: number;
  change24h: number;
}

interface WalletTransaction {
  id: string;
  type: "deposit" | "withdrawal" | "trade" | "futures";
  symbol: string;
  amount: number;
  status: string;
  date: string;
}

interface WalletSummary {
  assets: WalletAsset[];
  totalValue: number;
  estimatedPnl: number;
  totalPnl: number;
  walletLocked: boolean;
  transactions: WalletTransaction[];
}

export default function HomePage() {
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const [stakingInfo, setStakingInfo] = useState({ maxApy: "4.0", durationRange: "7-180", minStake: "10" });
  const [hideBalances, setHideBalances] = useState(false);

  const openModal = (modalId: string) => {
    // Financial modals now live on the wallet page — navigate with deep-link params
    const walletActions: Record<string, string> = {
      deposit: "/wallet?action=deposit",
      withdraw: "/wallet?action=withdraw",
      convert: "/wallet?action=convert",
      portfolio: "/wallet?action=portfolio",
      "transaction-history": "/wallet?tab=history",
    };
    if (walletActions[modalId]) {
      setLocation(walletActions[modalId]);
      return;
    }
    setActiveModal(modalId);
  };
  const closeModal = () => setActiveModal(null);

  // Get current user ID
  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
      }
    };
    getCurrentUser();
  }, []);

  // Fetch staking products for dynamic display
  useEffect(() => {
    fetch("/api/staking-products")
      .then(res => res.ok ? res.json() : [])
      .then((products: any[]) => {
        if (products.length > 0) {
          const apys = products.map(p => parseFloat(p.apy));
          const durations = products.map(p => p.duration);
          const mins = products.map(p => parseFloat(p.min_amount));
          setStakingInfo({
            maxApy: Math.max(...apys).toFixed(1),
            durationRange: `${Math.min(...durations)}-${Math.max(...durations)}`,
            minStake: Math.min(...mins).toLocaleString(),
          });
        }
      })
      .catch(() => {}); // keep defaults on error
  }, []);

  // Portfolio summary — total value, available balance, P&L, recent transactions.
  // Same query key/endpoint as the wallet page, so the cache is shared.
  const { data: wallet } = useQuery<WalletSummary>({
    queryKey: ["/api/wallet/summary"],
    queryFn: () => apiRequest("GET", "/api/wallet/summary").then(r => r.json()),
    enabled: !!userId,
    staleTime: 30000,
    refetchInterval: 60000,
  });

  // Open orders — same query key/endpoint as the order management panel.
  const { data: openOrders } = useQuery({
    queryKey: ["/api/trades", userId, "current"],
    queryFn: () => userId ? cryptoApi.getTrades(userId) : Promise.resolve([]),
    select: (trades: Trade[]) => trades.filter(t => t.status === "pending" || t.status === "pending_approval"),
    enabled: !!userId,
    refetchInterval: 10000,
  });

  // Available (non-frozen) portion of the portfolio, in USD.
  const availableBalance = useMemo(() => {
    if (!wallet?.assets) return 0;
    return wallet.assets.reduce((sum, a) => {
      if (a.total <= 0) return sum;
      return sum + (a.available / a.total) * a.usdValue;
    }, 0);
  }, [wallet?.assets]);

  const recentTransactions = wallet?.transactions?.slice(0, 5) ?? [];

  const handleStartTrading = () => {
    window.location.href = "/futures";
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section — now carries the live portfolio glance + quick actions,
          so the marketing banner and the account summary are one surface
          instead of two stacked blocks. */}
      <IlluminatedHero
        greeting={`${getGreeting()} · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
        onStartTrading={handleStartTrading}
        onViewWallet={() => setLocation('/wallet')}
        totalValue={wallet?.totalValue ?? 0}
        estimatedPnl={wallet?.estimatedPnl ?? 0}
        hideBalances={hideBalances}
        onToggleHideBalances={() => setHideBalances(v => !v)}
        onQuickAction={openModal}
        formattedTotalValue={`$${formatUsdNumber(wallet?.totalValue ?? 0)}`}
        formattedPnl={`$${formatUsdNumber(Math.abs(wallet?.estimatedPnl ?? 0))}`}
      />

      <div className="max-w-[1200px] mx-auto px-4 py-6 lg:py-8 lg:grid lg:grid-cols-[320px_1fr] lg:gap-6 lg:items-start">
        {/* Account rail — available balance/P&L recap, full quick-action grid,
            and loans. Sticky on desktop so it stays in view while market/
            activity content scrolls alongside it. */}
        <aside className="space-y-4 lg:sticky lg:top-24">
          {/* Balance recap — the two figures the hero card doesn't show */}
          <div className="bg-card rounded-2xl border border-border p-4 shadow-sm grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] text-muted-foreground mb-0.5">Available Balance</p>
              <p className="text-base font-semibold text-foreground tabular-nums">
                {hideBalances ? "••••" : `$${formatUsdNumber(availableBalance)}`}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground mb-0.5">Total P&L</p>
              <p className={`text-base font-semibold tabular-nums ${(wallet?.totalPnl ?? 0) >= 0 ? "text-success" : "text-danger"}`}>
                {wallet && !hideBalances
                  ? `${wallet.totalPnl >= 0 ? "+" : "-"}$${formatUsdNumber(Math.abs(wallet.totalPnl))}`
                  : hideBalances ? "••••" : "$0.00"}
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-card rounded-2xl border border-border p-4 shadow-sm">
            <p className="text-xs font-medium text-muted-foreground mb-3">Quick Actions</p>
            <div className="grid grid-cols-4 gap-2.5">
              <ActionButton icon={Wallet} label="Deposit" onClick={() => openModal('deposit')} />
              <ActionButton icon={ArrowRightLeft} label="Convert" onClick={() => openModal('convert')} />
              <ActionButton icon={CreditCard} label="Loan" onClick={() => openModal('loan-application')} />
              <ActionButton icon={UserPlus} label="Invite" onClick={() => setLocation('/profile?tab=referrals')} />
              <ActionButton icon={Banknote} label="Withdraw" onClick={() => openModal('withdraw')} />
              <ActionButton icon={PieChart} label="Portfolio" onClick={() => openModal('portfolio')} />
              <ActionButton icon={History} label="History" onClick={() => openModal('transaction-history')} />
              <ActionButton icon={Shield} label="Verify" onClick={() => openModal('verification')} />
            </div>
          </div>

          {/* My Loans */}
          <button
            onClick={() => openModal('loan-history')}
            className="w-full bg-card rounded-2xl border border-border hover:border-primary/40 p-4 flex items-center justify-between transition-colors shadow-sm"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-muted border border-border rounded-lg flex items-center justify-center">
                <CreditCard size={14} className="text-muted-foreground" />
              </div>
              <span className="text-sm font-medium text-foreground">My Loans</span>
            </div>
            <span className="text-muted-foreground text-xs flex items-center gap-0.5">
              View History <ChevronRight size={12} />
            </span>
          </button>
        </aside>

        {/* Main content — market data leads, personal activity follows */}
        <div className="mt-4 lg:mt-0 space-y-4">
          {/* Watchlist */}
          <div>
            <div className="flex items-center gap-2 mb-2 px-0.5">
              <Star size={13} className="text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Watchlist</span>
            </div>
            <PriceTicker symbols={["BTC", "ETH", "TRX"]} />
          </div>

          {/* Featured Staking Section — simplified, single accent, no decorative gradients */}
          <button
            onClick={() => setLocation('/staking')}
            className="w-full text-left bg-card rounded-2xl border border-border p-4 hover:border-primary/40 transition-colors group shadow-sm"
          >
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <TrendingUp size={20} className="text-primary" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-foreground font-semibold text-sm">USDT Staking</h3>
                  <p className="text-muted-foreground text-xs">Flexible &amp; fixed terms · {stakingInfo.durationRange} days · Min ${stakingInfo.minStake}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <div className="text-success font-bold text-lg tabular-nums leading-none">{stakingInfo.maxApy}%</div>
                  <div className="text-muted-foreground text-[10px] mt-0.5">Max APY</div>
                </div>
                <ChevronRight size={16} className="text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
              </div>
            </div>
          </button>

          {/* Market Movements */}
          <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
            <div className="px-4 py-3 flex items-center gap-2 border-b border-border">
              <TrendingUp size={14} className="text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">Market Movements</span>
            </div>
            <CryptoList limit={8} />
          </div>

          {/* Activity — recent transactions and open orders side-by-side on wide screens */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {/* Recent Transactions */}
            <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
              <div className="px-4 py-3 flex items-center justify-between border-b border-border">
                <div className="flex items-center gap-2">
                  <History size={14} className="text-muted-foreground" />
                  <span className="text-sm font-semibold text-foreground">Recent Transactions</span>
                </div>
                <button
                  onClick={() => openModal('transaction-history')}
                  className="text-[11px] text-muted-foreground hover:text-primary transition-colors flex items-center gap-0.5"
                >
                  View All <ChevronRight size={12} />
                </button>
              </div>
              {recentTransactions.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                  No transactions yet
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {recentTransactions.map((tx) => (
                    <TransactionRow key={tx.id} tx={tx} />
                  ))}
                </div>
              )}
            </div>

            {/* Open Orders */}
            <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
              <div className="px-4 py-3 flex items-center gap-2 border-b border-border">
                <ListOrdered size={14} className="text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">Open Orders</span>
              </div>
              {!openOrders || openOrders.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                  No open orders
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {openOrders.slice(0, 5).map((order) => (
                    <OrderRow key={order.id} order={order} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Suspense fallback={null}>
        <StakingModal
          isOpen={activeModal === "staking"}
          onClose={closeModal}
          userId={userId}
        />
        <VerificationModal
          isOpen={activeModal === "verification"}
          onClose={closeModal}
        />
        <LoanApplicationModal
          isOpen={activeModal === "loan-application"}
          onClose={closeModal}
          userId={userId || ""}
        />
        <UserLoanHistoryModal
          isOpen={activeModal === "loan-history"}
          onClose={closeModal}
          userId={userId || ""}
        />
      </Suspense>
    </div>
  );
}

interface ActionButtonProps {
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  label: string;
  onClick?: () => void;
  href?: string;
}

function ActionButton({ icon: Icon, label, onClick, href }: ActionButtonProps) {
  const content = (
    <div className="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-background border border-border hover:border-primary/40 hover:bg-muted transition-all cursor-pointer group">
      <div className="w-8 h-8 bg-muted border border-border rounded-lg flex items-center justify-center group-hover:border-primary/40 transition-colors">
        <Icon size={14} className="text-muted-foreground group-hover:text-primary transition-colors" />
      </div>
      <span className="text-[10px] md:text-xs font-medium text-muted-foreground text-center leading-tight">{label}</span>
    </div>
  );

  if (href) {
    return <a href={href}>{content}</a>;
  }

  return <div onClick={onClick}>{content}</div>;
}

function TransactionRow({ tx }: { tx: WalletTransaction }) {
  const isCredit = tx.type === "deposit";
  const Icon = isCredit ? ArrowDownLeft : tx.type === "withdrawal" ? ArrowUpRight : ArrowRightLeft;
  const iconColor = isCredit ? "text-success" : tx.type === "withdrawal" ? "text-danger" : "text-info";
  const iconBg = isCredit ? "bg-success/10" : tx.type === "withdrawal" ? "bg-danger/10" : "bg-info/10";

  return (
    <div className="px-4 py-2.5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
          <Icon size={14} className={iconColor} />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground capitalize truncate">{tx.type}</div>
          <div className="text-[11px] text-muted-foreground">{timeAgo(tx.date)}</div>
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-semibold text-foreground tabular-nums">
          {tx.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })} {tx.symbol}
        </div>
        <StatusBadge status={tx.status} size="sm" />
      </div>
    </div>
  );
}

function OrderRow({ order }: { order: Trade }) {
  const isBuy = order.side === "buy" || order.side === "long";
  return (
    <div className="px-4 py-2.5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isBuy ? "bg-success/10" : "bg-danger/10"}`}>
          {isBuy ? (
            <TrendingUp size={14} className="text-success" />
          ) : (
            <TrendingDown size={14} className="text-danger" />
          )}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground truncate">{order.symbol}</div>
          <div className={`text-[11px] capitalize ${isBuy ? "text-success" : "text-danger"}`}>{order.side}</div>
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-semibold text-foreground tabular-nums">{order.amount}</div>
        <StatusBadge status={order.status} size="sm" />
      </div>
    </div>
  );
}
