import type { Express } from "express";
import { requireAuth, requireAdmin, supabaseAdmin } from "./middleware";
import { logAuditEvent, getClientIP, getUserAgent } from "../utils/security";
import { REDIS_KEYS, CACHE_TTL, cacheGetOrSet, cacheInvalidate } from "../utils/redis";
import { invalidateUserCache } from "../services/user-cache.service";

export default function registerWalletRoutes(app: Express) {

  // =========== USER WALLET ENDPOINTS ===========

  /**
   * GET /api/wallet/summary
   * Returns full wallet summary for the authenticated user:
   * - portfolio balances, total value, P&L, recent transactions
   * CACHED: 30 seconds - reduces DB load on rapid refreshes
   */
  app.get("/api/wallet/summary", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const cacheKey = `${REDIS_KEYS.WALLET_SUMMARY}${userId}`;

      const summary = await cacheGetOrSet(cacheKey, CACHE_TTL.WALLET_SUMMARY, async () => {
        // Fetch data in parallel: aggregate queries (no limit, filtered) + transaction list queries (limited)
        const [
          portfolioRes, pricesRes, stakingRes,
          // Aggregate queries — ALL matching records for accurate totals
          allApprovedDepositsRes, allApprovedWithdrawalsRes, allCompletedTradesRes, allCompletedFuturesRes,
          // All trades/futures (any status) for analytics
          allTradesAnyStatusRes, allFuturesAnyStatusRes,
          // Fee records from platform_fees
          platformFeesRes,
          // Transaction list queries — limited for display
          recentDepositsRes, recentWithdrawalsRes, recentTradesRes, recentFuturesRes,
        ] = await Promise.all([
          supabaseAdmin.from("portfolios").select("*").eq("user_id", userId),
          supabaseAdmin.from("crypto_prices").select("symbol, price, change24h, volume24h"),
          supabaseAdmin.from("staking_positions").select("id, symbol, amount, apy, duration, status, created_at, end_date").eq("user_id", userId),
          // Aggregates: only columns needed for math, status-filtered, no limit
          // Filter out admin-hidden/deleted records so wallet totals are accurate
          supabaseAdmin.from("deposit_requests").select("symbol, amount, fee_amount, fee_symbol, fee_rate, net_amount").eq("user_id", userId).eq("status", "approved").or("hidden_for_user.is.null,hidden_for_user.eq.false"),
          supabaseAdmin.from("withdraw_requests").select("symbol, amount, fee_amount, fee_symbol, fee_rate, net_amount").eq("user_id", userId).eq("status", "approved").or("hidden_for_user.is.null,hidden_for_user.eq.false"),
          supabaseAdmin.from("trades").select("side, amount, price, fee_amount, fee_rate, created_at").eq("user_id", userId).in("status", ["completed", "approved", "executed", "filled"]).or("deleted_for_user.is.null,deleted_for_user.eq.false"),
          supabaseAdmin.from("futures_trades").select("final_result, side, amount, created_at").eq("user_id", userId).in("status", ["completed", "closed"]).or("deleted_for_user.is.null,deleted_for_user.eq.false"),
          // All trades/futures regardless of status for total counts
          supabaseAdmin.from("trades").select("id, symbol, side, amount, price, status, fee_amount, created_at").eq("user_id", userId).or("deleted_for_user.is.null,deleted_for_user.eq.false"),
          supabaseAdmin.from("futures_trades").select("id, symbol, side, amount, status, final_result, created_at").eq("user_id", userId).or("deleted_for_user.is.null,deleted_for_user.eq.false"),
          // Platform fees for this user
          supabaseAdmin.from("platform_fees").select("trade_type, fee_amount, fee_symbol, created_at").eq("user_id", userId),
          // Transaction list: full columns, limited for display
          supabaseAdmin.from("deposit_requests").select("id, symbol, amount, status, submitted_at, wallet_address, fee_amount, fee_symbol, fee_rate, net_amount").eq("user_id", userId).or("hidden_for_user.is.null,hidden_for_user.eq.false").order("submitted_at", { ascending: false }).limit(50),
          supabaseAdmin.from("withdraw_requests").select("id, symbol, amount, status, submitted_at, wallet_address, fee_amount, fee_symbol, fee_rate, net_amount").eq("user_id", userId).or("hidden_for_user.is.null,hidden_for_user.eq.false").order("submitted_at", { ascending: false }).limit(50),
          supabaseAdmin.from("trades").select("id, symbol, side, amount, price, status, created_at, fee_amount, fee_symbol, fee_rate").eq("user_id", userId).or("deleted_for_user.is.null,deleted_for_user.eq.false").order("created_at", { ascending: false }).limit(50),
          supabaseAdmin.from("futures_trades").select("id, symbol, side, amount, status, final_result, created_at").eq("user_id", userId).or("deleted_for_user.is.null,deleted_for_user.eq.false").order("created_at", { ascending: false }).limit(50),
        ]);

        if (portfolioRes.error) {
          console.error("Wallet summary - portfolio query error:", portfolioRes.error);
        }

        const portfolio = portfolioRes.data || [];
        const prices = pricesRes.data || [];
        const staking = stakingRes.data || [];
        // Aggregate data (all matching records)
        const allApprovedDeposits = allApprovedDepositsRes.data || [];
        const allApprovedWithdrawals = allApprovedWithdrawalsRes.data || [];
        const allCompletedTrades = allCompletedTradesRes.data || [];
        const allCompletedFutures = allCompletedFuturesRes.data || [];
        // All trades/futures for analytics
        const allTradesAny = allTradesAnyStatusRes.data || [];
        const allFuturesAny = allFuturesAnyStatusRes.data || [];
        const platformFees = platformFeesRes.data || [];
        // Recent transactions for display
        const deposits = recentDepositsRes.data || [];
        const withdrawals = recentWithdrawalsRes.data || [];
        const trades = recentTradesRes.data || [];
        const futures = recentFuturesRes.data || [];

        // Build price map
        const priceMap: Record<string, number> = {};
        for (const p of prices) {
          priceMap[p.symbol.toUpperCase()] = parseFloat(p.price || "0");
        }

        // Calculate portfolio with USD values
        let totalValue = 0;
        const assets = portfolio.map((asset: any) => {
          const available = parseFloat(asset.available || "0");
          const frozen = parseFloat(asset.frozen || "0");
          const total = available + frozen;
          const sym = asset.symbol.toUpperCase();
          const price = sym === "USDT" ? 1 : (priceMap[sym] || 0);
          const usdValue = total * price;
          totalValue += usdValue;

          return {
            symbol: asset.symbol,
            available,
            frozen,
            total,
            price,
            usdValue,
            change24h: parseFloat(prices.find((p: any) => p.symbol.toUpperCase() === sym)?.change24h || "0"),
          };
        });

        // Calculate total deposits (all approved — use NET amount actually credited to portfolio)
        const totalDeposited = allApprovedDeposits
          .reduce((sum: number, d: any) => {
            const sym = (d.symbol || "USDT").toUpperCase();
            const price = sym === "USDT" ? 1 : (priceMap[sym] || 0);
            // Use net_amount (after fee) since that's what was actually credited
            const amt = parseFloat(d.net_amount || d.amount || "0");
            return sum + amt * price;
          }, 0);

        // Calculate total withdrawals (all approved — use GROSS amount deducted from portfolio)
        const totalWithdrawn = allApprovedWithdrawals
          .reduce((sum: number, w: any) => {
            const sym = (w.symbol || "USDT").toUpperCase();
            const price = sym === "USDT" ? 1 : (priceMap[sym] || 0);
            // Use full amount since that's what was deducted from portfolio
            return sum + parseFloat(w.amount || "0") * price;
          }, 0);

        // Calculate trade P&L (all completed/approved — from aggregate query)
        const tradePnl = allCompletedTrades
          .reduce((sum: number, t: any) => {
            const amt = parseFloat(t.amount || "0");
            const price = parseFloat(t.price || "0");
            return sum + (t.side === "sell" ? amt * price : -(amt * price));
          }, 0);

        // Calculate futures P&L (all completed/closed — from aggregate query)
        const futuresPnl = allCompletedFutures
          .reduce((sum: number, f: any) => sum + parseFloat(f.final_result || "0"), 0);

        // Build unified transaction history
        const allTransactions: any[] = [];

        deposits.forEach((d: any) => {
          allTransactions.push({
            id: `dep-${d.id}`,
            type: "deposit",
            symbol: d.symbol || "USDT",
            amount: parseFloat(d.amount || "0"),
            feeAmount: parseFloat(d.fee_amount || "0"),
            feeSymbol: d.fee_symbol || d.symbol || "USDT",
            feeRate: parseFloat(d.fee_rate || "0"),
            netAmount: parseFloat(d.net_amount || d.amount || "0"),
            status: d.status,
            date: d.submitted_at,
          });
        });

        // Construct partial result - we'll continue building allTransactions outside
        return {
          portfolio,
          prices,
          staking,
          allApprovedDeposits,
          allApprovedWithdrawals,
          allCompletedTrades,
          allCompletedFutures,
          allTradesAny,
          allFuturesAny,
          platformFees,
          deposits,
          withdrawals,
          trades,
          futures,
          priceMap,
          assets,
          totalValue,
          totalDeposited,
          totalWithdrawn,
          tradePnl,
          futuresPnl,
        };
      });

      // Continue building the response from cached/fetched data
      const {
        staking, allApprovedDeposits, allApprovedWithdrawals, allCompletedTrades, allCompletedFutures,
        allTradesAny, allFuturesAny, platformFees, deposits, withdrawals, trades, futures,
        priceMap, assets, totalValue, totalDeposited, totalWithdrawn, tradePnl, futuresPnl,
      } = summary;

      // Build unified transaction history (continued from cached data)
      const allTransactions: any[] = [];

      deposits.forEach((d: any) => {
        allTransactions.push({
          id: `dep-${d.id}`,
          type: "deposit",
          symbol: d.symbol || "USDT",
          amount: parseFloat(d.amount || "0"),
          feeAmount: parseFloat(d.fee_amount || "0"),
          feeSymbol: d.fee_symbol || d.symbol || "USDT",
          feeRate: parseFloat(d.fee_rate || "0"),
          netAmount: parseFloat(d.net_amount || d.amount || "0"),
          status: d.status,
          date: d.submitted_at,
        });
      });

      withdrawals.forEach((w: any) => {
        allTransactions.push({
          id: `wd-${w.id}`,
          type: "withdrawal",
          symbol: w.symbol || "USDT",
          amount: parseFloat(w.amount || "0"),
          feeAmount: parseFloat(w.fee_amount || "0"),
          feeSymbol: w.fee_symbol || w.symbol || "USDT",
          feeRate: parseFloat(w.fee_rate || "0"),
          netAmount: parseFloat(w.net_amount || w.amount || "0"),
          status: w.status,
          date: w.submitted_at,
          walletAddress: w.wallet_address,
        });
      });

      trades.forEach((t: any) => {
        allTransactions.push({
          id: `trade-${t.id}`,
          type: "trade",
          symbol: t.symbol,
          amount: parseFloat(t.amount || "0"),
          price: parseFloat(t.price || "0"),
          feeAmount: parseFloat(t.fee_amount || "0"),
          feeSymbol: t.fee_symbol || "USDT",
          feeRate: parseFloat(t.fee_rate || "0"),
          side: t.side,
          status: t.status,
          date: t.created_at,
        });
      });

      futures.forEach((f: any) => {
        allTransactions.push({
          id: `futures-${f.id}`,
          type: "futures",
          symbol: f.symbol,
          amount: parseFloat(f.amount || "0"),
          side: f.side,
          status: f.status,
          result: parseFloat(f.final_result || "0"),
          date: f.created_at,
        });
      });

      // Sort all transactions by date descending
      allTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // Estimated profit/loss = current value - total deposited + total withdrawn
      const estimatedPnl = totalValue - totalDeposited + totalWithdrawn;

      // Wallet lock status
      const { data: userData } = await supabaseAdmin
        .from("users")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      // ===== ANALYTICS COMPUTATION =====

      // --- Fee Summary ---
      let totalTradingFees = 0, totalDepositFees = 0, totalWithdrawalFees = 0;
      for (const f of platformFees) {
        const amt = parseFloat(f.fee_amount || "0");
        if (f.trade_type === "spot") totalTradingFees += amt;
        else if (f.trade_type === "deposit") totalDepositFees += amt;
        else if (f.trade_type === "withdrawal") totalWithdrawalFees += amt;
      }
      // Also sum from source tables as fallback (platform_fees might be incomplete for older records)
      if (totalTradingFees === 0) {
        totalTradingFees = allCompletedTrades.reduce((s: number, t: any) => s + parseFloat(t.fee_amount || "0"), 0);
      }
      if (totalDepositFees === 0) {
        totalDepositFees = allApprovedDeposits.reduce((s: number, d: any) => s + parseFloat(d.fee_amount || "0"), 0);
      }
      if (totalWithdrawalFees === 0) {
        totalWithdrawalFees = allApprovedWithdrawals.reduce((s: number, w: any) => s + parseFloat(w.fee_amount || "0"), 0);
      }
      const totalFeesAll = totalTradingFees + totalDepositFees + totalWithdrawalFees;

      // --- Trade Analytics ---
      const executedTrades = allTradesAny.filter((t: any) => ["completed", "approved", "executed", "filled"].includes(t.status));
      const buyTrades = executedTrades.filter((t: any) => t.side === "buy");
      const sellTrades = executedTrades.filter((t: any) => t.side === "sell");

      let totalBuyVolume = 0, totalSellVolume = 0;
      for (const t of buyTrades) {
        totalBuyVolume += parseFloat(t.amount || "0") * parseFloat(t.price || "0");
      }
      for (const t of sellTrades) {
        totalSellVolume += parseFloat(t.amount || "0") * parseFloat(t.price || "0");
      }

      // Profitable vs unprofitable sell trades (compare sell value vs average buy cost)
      const profitableTrades = sellTrades.filter((t: any) => {
        const sellValue = parseFloat(t.amount || "0") * parseFloat(t.price || "0");
        const fee = parseFloat(t.fee_amount || "0");
        return (sellValue - fee) > 0;
      }).length;

      // Average trade size
      const avgTradeSize = executedTrades.length > 0
        ? executedTrades.reduce((s: number, t: any) => s + parseFloat(t.amount || "0") * parseFloat(t.price || "0"), 0) / executedTrades.length
        : 0;

      // Most traded symbols
      const symbolCounts: Record<string, { count: number; volume: number }> = {};
      for (const t of executedTrades) {
        const sym = t.symbol || "Unknown";
        if (!symbolCounts[sym]) symbolCounts[sym] = { count: 0, volume: 0 };
        symbolCounts[sym].count++;
        symbolCounts[sym].volume += parseFloat(t.amount || "0") * parseFloat(t.price || "0");
      }
      const topTradedPairs = Object.entries(symbolCounts)
        .map(([symbol, data]) => ({ symbol, count: data.count, volume: data.volume }))
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 5);

      // --- Futures Analytics ---
      const completedFutures = allFuturesAny.filter((f: any) => ["completed", "closed"].includes(f.status));
      const futuresWins = completedFutures.filter((f: any) => parseFloat(f.final_result || "0") > 0).length;
      const futuresLosses = completedFutures.filter((f: any) => parseFloat(f.final_result || "0") < 0).length;
      const futuresVolume = completedFutures.reduce((s: number, f: any) => s + parseFloat(f.amount || "0"), 0);
      const biggestWin = completedFutures.reduce((max: number, f: any) => Math.max(max, parseFloat(f.final_result || "0")), 0);
      const biggestLoss = completedFutures.reduce((min: number, f: any) => Math.min(min, parseFloat(f.final_result || "0")), 0);

      // --- Monthly Performance (last 6 months) ---
      const now = new Date();
      const monthlyPerformance: { month: string; trades: number; volume: number; pnl: number; fees: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthStart = d.toISOString();
        const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString();
        const label = d.toLocaleString("default", { month: "short", year: "2-digit" });

        const monthTrades = executedTrades.filter((t: any) => t.created_at >= monthStart && t.created_at < monthEnd);
        const monthVolume = monthTrades.reduce((s: number, t: any) => s + parseFloat(t.amount || "0") * parseFloat(t.price || "0"), 0);
        const monthPnl = monthTrades.reduce((s: number, t: any) => {
          const val = parseFloat(t.amount || "0") * parseFloat(t.price || "0");
          return s + (t.side === "sell" ? val : -val);
        }, 0);
        const monthFees = monthTrades.reduce((s: number, t: any) => s + parseFloat(t.fee_amount || "0"), 0);

        monthlyPerformance.push({ month: label, trades: monthTrades.length, volume: monthVolume, pnl: monthPnl, fees: monthFees });
      }

      // --- Counts (all statuses) ---
      const totalTradesAll = allTradesAny.length;
      const totalFuturesAll = allFuturesAny.length;
      const pendingTradesCount = allTradesAny.filter((t: any) => ["pending", "pending_approval"].includes(t.status)).length;
      const cancelledTradesCount = allTradesAny.filter((t: any) => ["cancelled", "rejected"].includes(t.status)).length;

      // Build analytics object
      const analytics = {
        fees: {
          total: totalFeesAll,
          trading: totalTradingFees,
          deposit: totalDepositFees,
          withdrawal: totalWithdrawalFees,
        },
        trading: {
          totalTrades: totalTradesAll,
          executedTrades: executedTrades.length,
          pendingTrades: pendingTradesCount,
          cancelledTrades: cancelledTradesCount,
          buyCount: buyTrades.length,
          sellCount: sellTrades.length,
          buyVolume: totalBuyVolume,
          sellVolume: totalSellVolume,
          totalVolume: totalBuyVolume + totalSellVolume,
          avgTradeSize,
          profitableTrades,
          topTradedPairs,
        },
        futures: {
          totalFutures: totalFuturesAll,
          completedFutures: completedFutures.length,
          wins: futuresWins,
          losses: futuresLosses,
          winRate: completedFutures.length > 0 ? (futuresWins / completedFutures.length) * 100 : 0,
          totalVolume: futuresVolume,
          pnl: futuresPnl,
          biggestWin,
          biggestLoss,
        },
        portfolio: {
          totalAssets: assets.filter((a: any) => a.total > 0).length,
          totalValue,
          totalDeposited,
          totalWithdrawn,
          netFlow: totalDeposited - totalWithdrawn,
        },
        monthlyPerformance,
      };

      res.json({
        assets: assets.sort((a: any, b: any) => b.usdValue - a.usdValue),
        totalValue,
        totalDeposited,
        totalWithdrawn,
        tradePnl,
        futuresPnl,
        estimatedPnl,
        totalPnl: tradePnl + futuresPnl,
        walletLocked: userData?.wallet_locked || false,
        staking: staking.map((s: any) => ({
          ...s,
          amount: parseFloat(s.amount || "0"),
          apy: parseFloat(s.apy || "0"),
        })),
        transactions: allTransactions.slice(0, 100),
        transactionCounts: {
          deposits: deposits.length,
          withdrawals: withdrawals.length,
          trades: trades.length,
          futures: futures.length,
        },
        analytics,
      });
    } catch (err) {
      console.error("Wallet summary error:", err);
      res.status(500).json({ message: "Failed to fetch wallet summary" });
    }
  });

  // =========== ADMIN WALLET ENDPOINTS ===========

  /**
   * GET /api/admin/wallets
   * Returns all user wallets with balances, transaction stats, and P&L
   */
  app.get("/api/admin/wallets", requireAuth, requireAdmin, async (req, res) => {
    try {
      // Fetch all data in parallel
      const [usersRes, portfoliosRes, depositsRes, withdrawalsRes, tradesRes, futuresRes, pricesRes] = await Promise.all([
        supabaseAdmin.from("users").select("*").neq("role", "admin").order("created_at", { ascending: false }),
        supabaseAdmin.from("portfolios").select("user_id, symbol, available, frozen"),
        supabaseAdmin.from("deposit_requests").select("user_id, symbol, amount, net_amount, status"),
        supabaseAdmin.from("withdraw_requests").select("user_id, symbol, amount, status"),
        supabaseAdmin.from("trades").select("user_id, symbol, side, amount, price, status"),
        supabaseAdmin.from("futures_trades").select("user_id, symbol, amount, status, final_result"),
        supabaseAdmin.from("crypto_prices").select("symbol, price"),
      ]);

      if (usersRes.error) {
        console.error("Admin wallets - users query error:", usersRes.error);
        return res.status(500).json({ message: "Failed to fetch users", error: usersRes.error.message });
      }

      const users = usersRes.data || [];
      const portfolios = portfoliosRes.data || [];
      const deposits = depositsRes.data || [];
      const withdrawals = withdrawalsRes.data || [];
      const allTrades = tradesRes.data || [];
      const allFutures = futuresRes.data || [];
      const prices = pricesRes.data || [];

      // Build price map
      const priceMap: Record<string, number> = {};
      for (const p of prices) {
        priceMap[p.symbol.toUpperCase()] = parseFloat(p.price || "0");
      }

      // Build user wallets
      const wallets = users.map((user: any) => {
        const userPortfolio = portfolios.filter((p: any) => p.user_id === user.id);
        const userDeposits = deposits.filter((d: any) => d.user_id === user.id);
        const userWithdrawals = withdrawals.filter((w: any) => w.user_id === user.id);
        const userTrades = allTrades.filter((t: any) => t.user_id === user.id);
        const userFutures = allFutures.filter((f: any) => f.user_id === user.id);

        // Portfolio value
        let totalValue = 0;
        const assets = userPortfolio.map((asset: any) => {
          const available = parseFloat(asset.available || "0");
          const frozen = parseFloat(asset.frozen || "0");
          const total = available + frozen;
          const sym = asset.symbol.toUpperCase();
          const price = sym === "USDT" ? 1 : (priceMap[sym] || 0);
          const usdValue = total * price;
          totalValue += usdValue;
          return { symbol: asset.symbol, available, frozen, total, usdValue };
        });

        // Total deposited (approved — use net amount credited)
        const totalDeposited = userDeposits
          .filter((d: any) => d.status === "approved")
          .reduce((sum: number, d: any) => {
            const sym = (d.symbol || "USDT").toUpperCase();
            const price = sym === "USDT" ? 1 : (priceMap[sym] || 0);
            const amt = parseFloat(d.net_amount || d.amount || "0");
            return sum + amt * price;
          }, 0);

        // Total withdrawn (approved)
        const totalWithdrawn = userWithdrawals
          .filter((w: any) => w.status === "approved")
          .reduce((sum: number, w: any) => {
            const sym = (w.symbol || "USDT").toUpperCase();
            const price = sym === "USDT" ? 1 : (priceMap[sym] || 0);
            return sum + parseFloat(w.amount || "0") * price;
          }, 0);

        // Trade earnings (completed sells)
        const tradeEarnings = userTrades
          .filter((t: any) => (t.status === "completed" || t.status === "approved") && t.side === "sell")
          .reduce((sum: number, t: any) => sum + parseFloat(t.amount || "0") * parseFloat(t.price || "0"), 0);

        // Futures P&L
        const futuresPnl = userFutures
          .filter((f: any) => f.status === "completed" || f.status === "closed")
          .reduce((sum: number, f: any) => sum + parseFloat(f.final_result || "0"), 0);

        // Estimated P&L
        const estimatedPnl = totalValue - totalDeposited + totalWithdrawn;

        return {
          userId: user.id,
          username: user.username,
          email: user.email,
          fullName: user.full_name,
          isActive: user.is_active,
          isVerified: user.is_verified,
          walletLocked: user.wallet_locked || false,
          createdAt: user.created_at,
          assets,
          totalValue,
          totalDeposited,
          totalWithdrawn,
          tradeEarnings,
          futuresPnl,
          estimatedPnl,
          tradeCount: userTrades.length,
          depositCount: userDeposits.filter((d: any) => d.status === "approved").length,
          withdrawalCount: userWithdrawals.filter((w: any) => w.status === "approved").length,
          pendingDeposits: userDeposits.filter((d: any) => d.status === "pending").length,
          pendingWithdrawals: userWithdrawals.filter((w: any) => w.status === "pending").length,
        };
      });

      // Platform-wide aggregates
      const platformStats = {
        totalUsers: wallets.length,
        totalPlatformValue: wallets.reduce((s: number, w: any) => s + w.totalValue, 0),
        totalPlatformDeposited: wallets.reduce((s: number, w: any) => s + w.totalDeposited, 0),
        totalPlatformWithdrawn: wallets.reduce((s: number, w: any) => s + w.totalWithdrawn, 0),
        totalTradeEarnings: wallets.reduce((s: number, w: any) => s + w.tradeEarnings, 0),
        totalFuturesPnl: wallets.reduce((s: number, w: any) => s + w.futuresPnl, 0),
        lockedWallets: wallets.filter((w: any) => w.walletLocked).length,
        activeWallets: wallets.filter((w: any) => w.totalValue > 0).length,
      };

      res.json({ users: wallets, platformStats });
    } catch (err) {
      console.error("Admin wallets error:", err);
      res.status(500).json({ message: "Failed to fetch wallets" });
    }
  });

  /**
   * GET /api/admin/wallets/:userId
   * Detailed wallet view for a specific user (admin)
   */
  app.get("/api/admin/wallets/:userId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;

      const [userRes, portfolioRes, depositsRes, withdrawalsRes, tradesRes, futuresRes, stakingRes, pricesRes] = await Promise.all([
        supabaseAdmin.from("users").select("*").eq("id", userId).maybeSingle(),
        supabaseAdmin.from("portfolios").select("*").eq("user_id", userId),
        supabaseAdmin.from("deposit_requests").select("*").eq("user_id", userId).order("submitted_at", { ascending: false }),
        supabaseAdmin.from("withdraw_requests").select("*").eq("user_id", userId).order("submitted_at", { ascending: false }),
        supabaseAdmin.from("trades").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        supabaseAdmin.from("futures_trades").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        supabaseAdmin.from("staking_positions").select("*").eq("user_id", userId),
        supabaseAdmin.from("crypto_prices").select("symbol, price, change24h"),
      ]);

      if (!userRes.data) {
        return res.status(404).json({ message: "User not found" });
      }

      const priceMap: Record<string, number> = {};
      for (const p of (pricesRes.data || [])) {
        priceMap[p.symbol.toUpperCase()] = parseFloat(p.price || "0");
      }

      const portfolio = (portfolioRes.data || []).map((asset: any) => {
        const available = parseFloat(asset.available || "0");
        const frozen = parseFloat(asset.frozen || "0");
        const sym = asset.symbol.toUpperCase();
        const price = sym === "USDT" ? 1 : (priceMap[sym] || 0);
        return {
          ...asset,
          available,
          frozen,
          total: available + frozen,
          price,
          usdValue: (available + frozen) * price,
        };
      });

      const totalValue = portfolio.reduce((s: number, a: any) => s + a.usdValue, 0);

      const deposits = depositsRes.data || [];
      const withdrawals = withdrawalsRes.data || [];
      const trades = tradesRes.data || [];
      const futures = futuresRes.data || [];
      const staking = stakingRes.data || [];

      // Compute financials matching what client expects
      const totalDeposited = deposits
        .filter((d: any) => d.status === "approved")
        .reduce((sum: number, d: any) => {
          const sym = (d.symbol || "USDT").toUpperCase();
          const price = sym === "USDT" ? 1 : (priceMap[sym] || 0);
          const amt = parseFloat(d.net_amount || d.amount || "0");
          return sum + amt * price;
        }, 0);

      const totalWithdrawn = withdrawals
        .filter((w: any) => w.status === "approved")
        .reduce((sum: number, w: any) => {
          const sym = (w.symbol || "USDT").toUpperCase();
          const price = sym === "USDT" ? 1 : (priceMap[sym] || 0);
          return sum + parseFloat(w.amount || "0") * price;
        }, 0);

      const tradePnl = trades
        .filter((t: any) => t.status === "completed" || t.status === "approved")
        .reduce((sum: number, t: any) => {
          const amt = parseFloat(t.amount || "0");
          const price = parseFloat(t.price || "0");
          return sum + (t.side === "sell" ? amt * price : -(amt * price));
        }, 0);

      const futuresPnl = futures
        .filter((f: any) => f.status === "completed" || f.status === "closed")
        .reduce((sum: number, f: any) => sum + parseFloat(f.final_result || "0"), 0);

      const estimatedPnl = totalValue - totalDeposited + totalWithdrawn;

      res.json({
        user: userRes.data,
        assets: portfolio,
        totalValue,
        totalDeposited,
        totalWithdrawn,
        tradePnl,
        futuresPnl,
        estimatedPnl,
        walletLocked: userRes.data?.wallet_locked || false,
        deposits,
        withdrawals,
        trades,
        futures,
        staking,
      });
    } catch (err) {
      console.error("Admin wallet detail error:", err);
      res.status(500).json({ message: "Failed to fetch wallet details" });
    }
  });

  /**
   * POST /api/admin/wallets/:userId/lock
   * Lock/unlock a user's wallet
   */
  app.post("/api/admin/wallets/:userId/lock", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const { locked, lock } = req.body;
      const isLocked = typeof locked === "boolean" ? locked : lock;
      const adminId = req.user.id;
      const ipAddress = getClientIP(req);
      const userAgent = getUserAgent(req);

      if (typeof isLocked !== "boolean") {
        return res.status(400).json({ message: "'locked' (or 'lock') must be a boolean" });
      }

      // Get user info for audit
      const { data: targetUser } = await supabaseAdmin.from("users").select("username, email").eq("id", userId).maybeSingle();

      const { error } = await supabaseAdmin
        .from("users")
        .update({ wallet_locked: isLocked })
        .eq("id", userId);

      if (error) throw error;

      // Invalidate user cache since wallet_locked status changed
      await invalidateUserCache(userId);

      // Audit log
      await logAuditEvent({
        userId: adminId,
        action: isLocked ? 'WALLET_LOCKED' : 'WALLET_UNLOCKED',
        resourceType: 'wallet',
        resourceId: userId,
        details: {
          targetUserId: userId,
          targetUsername: targetUser?.username,
          targetEmail: targetUser?.email,
          locked: isLocked,
        },
        ipAddress,
        userAgent,
        status: 'success',
      });

      res.json({ message: isLocked ? "Wallet locked" : "Wallet unlocked", walletLocked: isLocked });
    } catch (err) {
      console.error("Wallet lock error:", err);
      res.status(500).json({ message: "Failed to update wallet lock status" });
    }
  });

  /**
   * POST /api/admin/wallets/:userId/freeze-asset
   * Freeze/unfreeze a specific asset for a user
   */
  app.post("/api/admin/wallets/:userId/freeze-asset", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const { symbol, freeze, amount: freezeAmount } = req.body;
      const adminId = req.user.id;
      const ipAddress = getClientIP(req);
      const userAgent = getUserAgent(req);

      if (!symbol || typeof freeze !== "boolean") {
        return res.status(400).json({ message: "'symbol' and 'freeze' are required" });
      }

      // Get user info for audit
      const { data: targetUser } = await supabaseAdmin.from("users").select("username, email").eq("id", userId).maybeSingle();

      // Get current portfolio entry
      const { data: portfolio, error: fetchError } = await supabaseAdmin
        .from("portfolios")
        .select("available, frozen")
        .eq("user_id", userId)
        .eq("symbol", symbol.toUpperCase())
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!portfolio) {
        return res.status(404).json({ message: `No ${symbol} balance found for this user` });
      }

      const available = parseFloat(portfolio.available || "0");
      const frozen = parseFloat(portfolio.frozen || "0");
      const total = available + frozen;

      let newAvailable: string;
      let newFrozen: string;

      if (freeze) {
        // If a specific amount is provided, freeze only that amount
        if (freezeAmount && parseFloat(freezeAmount) > 0) {
          const amountToFreeze = Math.min(parseFloat(freezeAmount), available);
          newAvailable = (available - amountToFreeze).toFixed(8);
          newFrozen = (frozen + amountToFreeze).toFixed(8);
        } else {
          // Move all available to frozen
          newAvailable = "0";
          newFrozen = total.toFixed(8);
        }
      } else {
        // Move all frozen back to available
        newAvailable = total.toFixed(8);
        newFrozen = "0";
      }

      const { error } = await supabaseAdmin
        .from("portfolios")
        .update({ available: newAvailable, frozen: newFrozen })
        .eq("user_id", userId)
        .eq("symbol", symbol.toUpperCase());
      if (error) throw error;

      // Audit log
      await logAuditEvent({
        userId: adminId,
        action: freeze ? 'ASSET_FROZEN' : 'ASSET_UNFROZEN',
        resourceType: 'portfolio',
        resourceId: `${userId}:${symbol}`,
        details: {
          targetUserId: userId,
          targetUsername: targetUser?.username,
          symbol: symbol.toUpperCase(),
          previousAvailable: available,
          previousFrozen: frozen,
          newAvailable: parseFloat(newAvailable),
          newFrozen: parseFloat(newFrozen),
          freezeAmount: freezeAmount ? parseFloat(freezeAmount) : 'all',
        },
        ipAddress,
        userAgent,
        status: 'success',
      });

      res.json({
        message: freeze ? `${symbol} funds frozen` : `${symbol} funds unfrozen`,
        symbol,
        frozen: freeze,
        available: parseFloat(newAvailable),
        frozenAmount: parseFloat(newFrozen),
      });
    } catch (err) {
      console.error("Freeze asset error:", err);
      res.status(500).json({ message: "Failed to freeze/unfreeze asset" });
    }
  });
}
