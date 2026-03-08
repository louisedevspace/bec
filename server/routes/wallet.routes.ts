import type { Express } from "express";
import { requireAuth, requireAdmin, supabaseAdmin } from "./middleware";
import { logAuditEvent, getClientIP, getUserAgent } from "../utils/security";

export default function registerWalletRoutes(app: Express) {

  // =========== USER WALLET ENDPOINTS ===========

  /**
   * GET /api/wallet/summary
   * Returns full wallet summary for the authenticated user:
   * - portfolio balances, total value, P&L, recent transactions
   */
  app.get("/api/wallet/summary", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;

      // Fetch data in parallel: aggregate queries (no limit, filtered) + transaction list queries (limited)
      const [
        portfolioRes, pricesRes, stakingRes,
        // Aggregate queries — ALL matching records for accurate totals
        allApprovedDepositsRes, allApprovedWithdrawalsRes, allCompletedTradesRes, allCompletedFuturesRes,
        // Transaction list queries — limited for display
        recentDepositsRes, recentWithdrawalsRes, recentTradesRes, recentFuturesRes,
      ] = await Promise.all([
        supabaseAdmin.from("portfolios").select("*").eq("user_id", userId),
        supabaseAdmin.from("crypto_prices").select("symbol, price, change24h, volume24h"),
        supabaseAdmin.from("staking_positions").select("id, symbol, amount, apy, duration, status, created_at, end_date").eq("user_id", userId),
        // Aggregates: only columns needed for math, status-filtered, no limit
        supabaseAdmin.from("deposit_requests").select("symbol, amount").eq("user_id", userId).eq("status", "approved"),
        supabaseAdmin.from("withdraw_requests").select("symbol, amount").eq("user_id", userId).eq("status", "approved"),
        supabaseAdmin.from("trades").select("side, amount, price").eq("user_id", userId).in("status", ["completed", "approved"]),
        supabaseAdmin.from("futures_trades").select("final_result").eq("user_id", userId).in("status", ["completed", "closed"]),
        // Transaction list: full columns, limited for display
        supabaseAdmin.from("deposit_requests").select("id, symbol, amount, status, submitted_at, wallet_address").eq("user_id", userId).order("submitted_at", { ascending: false }).limit(50),
        supabaseAdmin.from("withdraw_requests").select("id, symbol, amount, status, submitted_at, wallet_address").eq("user_id", userId).order("submitted_at", { ascending: false }).limit(50),
        supabaseAdmin.from("trades").select("id, symbol, side, amount, price, status, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
        supabaseAdmin.from("futures_trades").select("id, symbol, side, amount, status, final_result, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
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

      // Calculate total deposits (all approved — from aggregate query)
      const totalDeposited = allApprovedDeposits
        .reduce((sum: number, d: any) => {
          const sym = (d.symbol || "USDT").toUpperCase();
          const price = sym === "USDT" ? 1 : (priceMap[sym] || 0);
          return sum + parseFloat(d.amount || "0") * price;
        }, 0);

      // Calculate total withdrawals (all approved — from aggregate query)
      const totalWithdrawn = allApprovedWithdrawals
        .reduce((sum: number, w: any) => {
          const sym = (w.symbol || "USDT").toUpperCase();
          const price = sym === "USDT" ? 1 : (priceMap[sym] || 0);
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
        supabaseAdmin.from("deposit_requests").select("user_id, symbol, amount, status"),
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

        // Total deposited (approved)
        const totalDeposited = userDeposits
          .filter((d: any) => d.status === "approved")
          .reduce((sum: number, d: any) => {
            const sym = (d.symbol || "USDT").toUpperCase();
            const price = sym === "USDT" ? 1 : (priceMap[sym] || 0);
            return sum + parseFloat(d.amount || "0") * price;
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
          return sum + parseFloat(d.amount || "0") * price;
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
