import type { Express } from "express";
import { requireAuth, requireAdmin, supabaseAdmin } from "./middleware";
import { syncManager } from "../sync-manager";
import supabase from "../supabaseClient";

// Cache for admin users data
let adminUsersCache: any = null;
let adminUsersCacheTime = 0;
const ADMIN_CACHE_DURATION = 60000; // 1 minute

export default function registerAdminRoutes(app: Express) {
  // GET /api/admin/users — merged user data with portfolio, KYC, loans, staking
  app.get("/api/admin/users", requireAuth, requireAdmin, async (req, res) => {
    try {
      const now = Date.now();
      const forceRefresh = req.query.refresh === 'true';
      
      // Return cached data if available and not force refreshing
      if (!forceRefresh && adminUsersCache && (now - adminUsersCacheTime) < ADMIN_CACHE_DURATION) {
        res.setHeader('X-Cache', 'HIT');
        return res.json({ users: adminUsersCache });
      }

      // Fetch only essential user columns
      const { data: customUsers, error: customError } = await supabase
        .from("users")
        .select("id, username, email, full_name, credit_score, is_verified, is_active, role, created_at, display_id, profile_picture, phone, futures_min_amount, futures_trade_result")
        .neq("role", "admin")
        .order("created_at", { ascending: false });

      if (customError) {
        return res.status(500).json({ message: "Failed to fetch users", error: customError.message });
      }

      const { data: passwords } = await supabaseAdmin
        .from("user_passwords")
        .select("user_id, password, plaintext_password, encrypted_at, last_updated");

      const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();

      // Fetch related data in parallel
      const [portfoliosData, tradesData, kycData, loansData, stakingData, pricesData] = await Promise.all([
        supabaseAdmin.from("portfolios").select("user_id, symbol, available, frozen"),
        supabaseAdmin.from("trades").select("user_id"),
        supabaseAdmin.from("kyc_verifications").select("user_id, status, submitted_at, reviewed_at, rejection_reason"),
        supabaseAdmin.from("loan_applications").select("user_id, amount, status"),
        supabaseAdmin.from("staking_positions").select("user_id, amount, status"),
        supabaseAdmin.from("crypto_prices").select("symbol, price, change24h, volume24h")
      ]);

      const portfolios = portfoliosData.data || [];
      const trades = tradesData.data || [];
      const kycVerifications = kycData.data || [];
      const loans = loansData.data || [];
      const staking = stakingData.data || [];
      const currentPrices = pricesData.data || [];

      const mergedUsers = customUsers.map((customUser) => {
        const authUser = authUsers?.users.find((au) => au.id === customUser.id);
        const userPassword = passwords?.find((p) => p.user_id === customUser.id);
        const userPortfolio = portfolios.filter((p) => p.user_id === customUser.id);
        const userTrades = trades.filter((t) => t.user_id === customUser.id);
        const userKyc = kycVerifications.find((k) => k.user_id === customUser.id);
        const userLoans = loans.filter((l) => l.user_id === customUser.id);
        const userStaking = staking.filter((s) => s.user_id === customUser.id);

        const totalPortfolioValue = userPortfolio.reduce((total, asset) => {
          const available = parseFloat(asset.available || "0");
          const frozen = parseFloat(asset.frozen || "0");
          const totalAmount = available + frozen;
          if (totalAmount === 0) return total;

          const priceData = currentPrices.find(
            (price) => price.symbol.toLowerCase() === asset.symbol.toLowerCase()
          );

          if (asset.symbol.toUpperCase() === "USDT") {
            return total + totalAmount;
          } else if (priceData?.price) {
            return total + totalAmount * parseFloat(priceData.price);
          }
          return total + totalAmount;
        }, 0);

        const totalLoanAmount = userLoans.reduce((total, loan) => total + parseFloat(loan.amount || "0"), 0);
        const totalStakingAmount = userStaking.reduce((total, pos) => total + parseFloat(pos.amount || "0"), 0);

        return {
          id: customUser.id,
          username: customUser.username,
          email: customUser.email,
          full_name: customUser.full_name,
          credit_score: customUser.credit_score,
          is_verified: customUser.is_verified,
          is_active: customUser.is_active,
          role: customUser.role,
          created_at: customUser.created_at,
          display_id: customUser.display_id,
          profile_picture: customUser.profile_picture,
          phone: customUser.phone,
          futures_min_amount: customUser.futures_min_amount,
          futures_trade_result: customUser.futures_trade_result,
          password: userPassword?.plaintext_password || userPassword?.password || null,
          password_hash: userPassword?.password || null,
          password_encrypted_at: userPassword?.encrypted_at || null,
          password_last_updated: userPassword?.last_updated || null,
          email_confirmed_at: authUser?.email_confirmed_at,
          last_sign_in_at: authUser?.last_sign_in_at,
          encrypted_password: (authUser as any)?.encrypted_password,
          app_metadata: authUser?.app_metadata,
          user_metadata: authUser?.user_metadata,
          portfolio: userPortfolio,
          total_portfolio_value: totalPortfolioValue,
          trade_count: userTrades.length,
          assets_count: userPortfolio.length,
          kyc_status: userKyc?.status || "not_submitted",
          kyc_submitted_at: userKyc?.submitted_at,
          kyc_reviewed_at: userKyc?.reviewed_at,
          kyc_rejection_reason: userKyc?.rejection_reason,
          loans: userLoans,
          total_loan_amount: totalLoanAmount,
          active_loans_count: userLoans.filter((l) => l.status === "approved").length,
          staking_positions: userStaking,
          total_staking_amount: totalStakingAmount,
          active_staking_count: userStaking.filter((s) => s.status === "active").length,
        };
      });

      // Update cache
      adminUsersCache = mergedUsers;
      adminUsersCacheTime = now;

      res.setHeader('X-Cache', 'MISS');
      res.setHeader('Cache-Control', 'private, max-age=60');
      res.json({ users: mergedUsers });
    } catch (err) {
      res.status(500).json({ message: "Server error", error: (err as Error).message });
    }
  });

  // POST /api/admin/user-management/:action
  app.post("/api/admin/user-management/:action", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { action } = req.params;
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }

      const { data: targetUser, error: targetUserError } = await supabaseAdmin
        .from("users")
        .select("id, email")
        .eq("id", userId)
        .single();

      if (targetUserError || !targetUser) {
        return res.status(404).json({ message: "User not found" });
      }

      let message;

      switch (action) {
        case "delete-trades": {
          const { error } = await supabaseAdmin
            .from("trades")
            .update({ deleted_for_user: true })
            .eq("user_id", userId);
          if (error) return res.status(500).json({ message: "Failed to delete trade history" });
          syncManager.syncTradesDeleted(userId);
          message = "Trade history deleted successfully (hidden from user view)";
          break;
        }

        case "delete-transactions": {
          const { error } = await supabaseAdmin.from("transactions").delete().eq("user_id", userId);
          if (error) return res.status(500).json({ message: "Failed to delete transaction history" });
          syncManager.syncTransactionsDeleted(userId);
          message = "Transaction history deleted successfully";
          break;
        }

        case "reset-verification": {
          const { error: verificationError } = await supabaseAdmin
            .from("users")
            .update({ is_verified: false, email_confirmed_at: null })
            .eq("id", userId);
          if (verificationError) return res.status(500).json({ message: "Failed to reset verification status" });

          await supabaseAdmin.from("kyc_verifications").delete().eq("user_id", userId);
          message = "Verification status reset successfully. User will need to re-verify email and submit KYC again.";
          break;
        }

        case "delete-kyc": {
          const { error } = await supabaseAdmin.from("kyc_verifications").delete().eq("user_id", userId);
          if (error) return res.status(500).json({ message: "Failed to delete KYC data" });
          message = "KYC data deleted successfully";
          break;
        }

        case "delete-portfolio": {
          const { error } = await supabaseAdmin.from("portfolios").delete().eq("user_id", userId);
          if (error) return res.status(500).json({ message: "Failed to delete portfolio data" });
          message = "Portfolio data deleted successfully";
          break;
        }

        case "update-credit-score": {
          const { creditScore } = req.body;
          // Validate credit score
          if (creditScore === undefined || creditScore === null) {
            return res.status(400).json({ message: "Credit score is required" });
          }
          const creditScoreValue = parseInt(creditScore);
          if (isNaN(creditScoreValue) || creditScoreValue < 0 || creditScoreValue > 850) {
            return res.status(400).json({ message: "Credit score must be between 0 and 850" });
          }
          const { error } = await supabaseAdmin.from("users").update({ credit_score: creditScoreValue }).eq("id", userId);
          if (error) {
            return res.status(500).json({ message: "Failed to update credit score", error: error.message });
          }
          message = `Credit score updated to ${creditScoreValue}`;
          break;
        }

        default:
          return res.status(400).json({ message: "Invalid action" });
      }

      res.json({ message });
    } catch (error: any) {
      res.status(500).json({ message: "Server error", error: error.message });
    }
  });

  // POST /api/admin/edit-portfolio-balances
  app.post("/api/admin/edit-portfolio-balances", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { userId, btcBalance, usdtBalance } = req.body;

      if (!userId || typeof btcBalance !== "number" || typeof usdtBalance !== "number") {
        return res.status(400).json({ message: "Invalid input parameters" });
      }

      // Update or create BTC balance
      const { data: existingBtc, error: btcCheckError } = await supabaseAdmin
        .from("portfolios")
        .select("id")
        .eq("user_id", userId)
        .eq("symbol", "BTC")
        .single();

      if (btcCheckError && btcCheckError.code !== "PGRST116") {
        return res.status(500).json({ message: "Failed to check BTC portfolio" });
      }

      if (existingBtc) {
        const { error } = await supabaseAdmin
          .from("portfolios")
          .update({ available: btcBalance.toString(), updated_at: new Date().toISOString() })
          .eq("user_id", userId)
          .eq("symbol", "BTC");
        if (error) return res.status(500).json({ message: "Failed to update BTC balance" });
      } else {
        const { error } = await supabaseAdmin.from("portfolios").insert({
          user_id: userId,
          symbol: "BTC",
          available: btcBalance.toString(),
          frozen: "0",
          updated_at: new Date().toISOString(),
        });
        if (error) return res.status(500).json({ message: "Failed to create BTC balance" });
      }

      // Update or create USDT balance
      const { data: existingUsdt, error: usdtCheckError } = await supabaseAdmin
        .from("portfolios")
        .select("id")
        .eq("user_id", userId)
        .eq("symbol", "USDT")
        .single();

      if (usdtCheckError && usdtCheckError.code !== "PGRST116") {
        return res.status(500).json({ message: "Failed to check USDT portfolio" });
      }

      if (existingUsdt) {
        const { error } = await supabaseAdmin
          .from("portfolios")
          .update({ available: usdtBalance.toString(), updated_at: new Date().toISOString() })
          .eq("user_id", userId)
          .eq("symbol", "USDT");
        if (error) return res.status(500).json({ message: "Failed to update USDT balance" });
      } else {
        const { error } = await supabaseAdmin.from("portfolios").insert({
          user_id: userId,
          symbol: "USDT",
          available: usdtBalance.toString(),
          frozen: "0",
          updated_at: new Date().toISOString(),
        });
        if (error) return res.status(500).json({ message: "Failed to create USDT balance" });
      }

      syncManager.syncPortfolioUpdated(userId, { btc: btcBalance, usdt: usdtBalance });
      res.json({ message: "Portfolio balances updated successfully" });
    } catch (error: any) {
      res.status(500).json({ message: "Server error", error: error.message });
    }
  });

  // GET /api/admin/portfolio-balances/:userId
  app.get("/api/admin/portfolio-balances/:userId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;

      const { data: btcPortfolio } = await supabaseAdmin
        .from("portfolios")
        .select("available")
        .eq("user_id", userId)
        .eq("symbol", "BTC")
        .single();

      const { data: usdtPortfolio } = await supabaseAdmin
        .from("portfolios")
        .select("available")
        .eq("user_id", userId)
        .eq("symbol", "USDT")
        .single();

      res.json({
        btc_balance: btcPortfolio?.available ? parseFloat(btcPortfolio.available) : 0,
        usdt_balance: usdtPortfolio?.available ? parseFloat(usdtPortfolio.available) : 0,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Server error", error: error.message });
    }
  });

  // POST /api/admin/toggle-user-status
  app.post("/api/admin/toggle-user-status", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { userId, isActive } = req.body;

      if (!userId || typeof isActive !== "boolean") {
        return res.status(400).json({ message: "User ID and isActive status are required" });
      }

      const { data: updatedUser, error: updateError } = await supabaseAdmin
        .from("users")
        .update({ is_active: isActive })
        .eq("id", userId)
        .select("id, email, is_active")
        .single();

      if (updateError) {
        return res.status(500).json({ message: "Failed to update user status" });
      }

      res.json({
        message: `User ${isActive ? "enabled" : "disabled"} successfully`,
        user: updatedUser,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Server error", error: error.message });
    }
  });

  // POST /api/admin/cleanup-portfolio
  app.post("/api/admin/cleanup-portfolio", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = req.body.userId;
      if (!userId) {
        return res.status(400).json({ message: "userId is required" });
      }

      // Fix NaN values
      await supabaseAdmin
        .from("portfolios")
        .update({ available: "0" })
        .eq("user_id", userId)
        .or("available.eq.NaN,available.is.null");

      const { data: portfolios, error: fetchError } = await supabaseAdmin
        .from("portfolios")
        .select("*")
        .eq("user_id", userId);

      if (fetchError) throw new Error("Failed to fetch portfolios");

      // Consolidate duplicates
      for (const symbol of ["BTC", "USDT"]) {
        const entries = portfolios.filter((p) => p.symbol === symbol);
        if (entries.length > 1) {
          const total = entries.reduce((sum, entry) => sum + (parseFloat(entry.available) || 0), 0);
          for (const entry of entries) {
            await supabaseAdmin.from("portfolios").delete().eq("id", entry.id);
          }
          await supabaseAdmin.from("portfolios").insert({
            user_id: userId,
            symbol,
            available: total.toString(),
            frozen: "0",
          });
        }
      }

      const { data: finalPortfolios } = await supabaseAdmin
        .from("portfolios")
        .select("*")
        .eq("user_id", userId);

      res.json({ message: "Portfolio cleanup completed", portfolios: finalPortfolios });
    } catch (error) {
      res.status(500).json({
        message: "Failed to cleanup portfolio",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // PUT /api/admin/user-futures-settings — update per-user futures trade controls
  app.put("/api/admin/user-futures-settings", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { userId, futuresMinAmount, futuresTradeResult } = req.body;

      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }

      const updateData: any = {};

      if (futuresMinAmount !== undefined) {
        const minAmount = parseFloat(futuresMinAmount);
        if (isNaN(minAmount) || minAmount < 0) {
          return res.status(400).json({ message: "Invalid minimum amount" });
        }
        updateData.futures_min_amount = minAmount;
      }

      if (futuresTradeResult !== undefined) {
        if (futuresTradeResult !== null && futuresTradeResult !== 'win' && futuresTradeResult !== 'loss') {
          return res.status(400).json({ message: "Trade result must be null, 'win', or 'loss'" });
        }
        updateData.futures_trade_result = futuresTradeResult;
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: "No settings to update" });
      }

      const { data: updatedUser, error: updateError } = await supabaseAdmin
        .from("users")
        .update(updateData)
        .eq("id", userId)
        .select("id, email, futures_min_amount, futures_trade_result")
        .single();

      if (updateError) {
        return res.status(500).json({ message: "Failed to update futures settings" });
      }

      res.json({
        message: "Futures settings updated successfully",
        user: updatedUser,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Server error", error: error.message });
    }
  });

  // GET /api/admin/user-futures-settings/:userId — get per-user futures settings
  app.get("/api/admin/user-futures-settings/:userId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;

      const { data: user, error } = await supabaseAdmin
        .from("users")
        .select("id, email, futures_min_amount, futures_trade_result, is_active")
        .eq("id", userId)
        .single();

      if (error || !user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json(user);
    } catch (error: any) {
      res.status(500).json({ message: "Server error", error: error.message });
    }
  });

  // GET /api/admin/dashboard-stats — comprehensive dashboard statistics
  app.get("/api/admin/dashboard-stats", requireAuth, requireAdmin, async (req, res) => {
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterday = new Date(today.getTime() - 86400000);
      const sevenDaysAgo = new Date(today.getTime() - 7 * 86400000);
      const thirtyDaysAgo = new Date(today.getTime() - 30 * 86400000);

      // Parallel fetch all data
      const [
        usersRes, depositsRes, withdrawalsRes, tradesRes, futuresRes,
        stakingRes, loansRes, supportRes, kycRes, portfoliosRes, pricesRes
      ] = await Promise.all([
        supabaseAdmin.from("users").select("id, created_at, is_active, is_verified, role"),
        supabaseAdmin.from("deposit_requests").select("id, amount, status, submitted_at, symbol"),
        supabaseAdmin.from("withdraw_requests").select("id, amount, status, submitted_at, symbol"),
        supabaseAdmin.from("trades").select("id, amount, price, status, side, symbol, created_at"),
        supabaseAdmin.from("futures_trades").select("id, amount, status, side, symbol, created_at, final_result, final_profit"),
        supabaseAdmin.from("staking_positions").select("id, amount, status, symbol, start_date"),
        supabaseAdmin.from("loan_applications").select("id, amount, status, created_at"),
        supabaseAdmin.from("support_conversations").select("id, status, priority, created_at"),
        supabaseAdmin.from("kyc_verifications").select("id, status, submitted_at"),
        supabaseAdmin.from("portfolios").select("user_id, symbol, available, frozen"),
        supabaseAdmin.from("crypto_prices").select("symbol, price"),
      ]);

      const users = usersRes.data || [];
      const deposits = depositsRes.data || [];
      const withdrawals = withdrawalsRes.data || [];
      const trades = tradesRes.data || [];
      const futures = futuresRes.data || [];
      const staking = stakingRes.data || [];
      const loans = loansRes.data || [];
      const support = supportRes.data || [];
      const kyc = kycRes.data || [];
      const portfolios = portfoliosRes.data || [];
      const prices = pricesRes.data || [];

      // === USER STATS ===
      const totalUsers = users.filter(u => u.role !== 'admin').length;
      const activeUsers = users.filter(u => u.is_active && u.role !== 'admin').length;
      const inactiveUsers = totalUsers - activeUsers;
      const verifiedUsers = users.filter(u => u.is_verified && u.role !== 'admin').length;
      const newUsersToday = users.filter(u => u.role !== 'admin' && new Date(u.created_at) >= today).length;
      const newUsersYesterday = users.filter(u => u.role !== 'admin' && new Date(u.created_at) >= yesterday && new Date(u.created_at) < today).length;
      const newUsersThisWeek = users.filter(u => u.role !== 'admin' && new Date(u.created_at) >= sevenDaysAgo).length;
      const newUsersThisMonth = users.filter(u => u.role !== 'admin' && new Date(u.created_at) >= thirtyDaysAgo).length;

      // === FINANCIAL STATS ===
      const totalDepositAmount = deposits.filter(d => d.status === 'approved').reduce((s, d) => s + parseFloat(d.amount || '0'), 0);
      const pendingDeposits = deposits.filter(d => d.status === 'pending').length;
      const totalWithdrawalAmount = withdrawals.filter(w => w.status === 'approved').reduce((s, w) => s + parseFloat(w.amount || '0'), 0);
      const pendingWithdrawals = withdrawals.filter(w => w.status === 'pending').length;

      // === TRADING STATS ===
      const totalTrades = trades.length;
      const pendingTrades = trades.filter(t => t.status === 'pending_approval').length;
      const completedTrades = trades.filter(t => ['executed', 'filled'].includes(t.status)).length;
      const totalTradeVolume = trades.reduce((s, t) => {
        const amount = parseFloat(t.amount || '0');
        const price = parseFloat(t.price || '0');
        return s + (price > 0 ? amount * price : amount);
      }, 0);

      // === FUTURES STATS ===
      const totalFutures = futures.length;
      const activeFutures = futures.filter(f => f.status === 'active').length;
      const completedFutures = futures.filter(f => f.status === 'completed').length;
      const futuresWins = futures.filter(f => f.final_result === 'win').length;
      const futuresLosses = futures.filter(f => f.final_result === 'loss').length;

      // === STAKING STATS ===
      const activeStaking = staking.filter(s => s.status === 'active').length;
      const totalStaked = staking.filter(s => s.status === 'active').reduce((sum, s) => sum + parseFloat(s.amount || '0'), 0);

      // === LOAN STATS ===
      const pendingLoans = loans.filter(l => l.status === 'pending').length;
      const approvedLoans = loans.filter(l => l.status === 'approved').length;
      const totalLoanValue = loans.filter(l => l.status === 'approved').reduce((s, l) => s + parseFloat(l.amount || '0'), 0);

      // === SUPPORT STATS ===
      const openTickets = support.filter(s => s.status === 'open').length;
      const inProgressTickets = support.filter(s => s.status === 'in_progress').length;
      const resolvedTickets = support.filter(s => ['resolved', 'closed'].includes(s.status)).length;
      const urgentTickets = support.filter(s => s.priority === 'urgent' && ['open', 'in_progress'].includes(s.status)).length;

      // === KYC STATS ===
      const pendingKyc = kyc.filter(k => k.status === 'pending').length;
      const approvedKyc = kyc.filter(k => k.status === 'approved').length;
      const rejectedKyc = kyc.filter(k => k.status === 'rejected').length;

      // === PLATFORM VALUE (total portfolios) ===
      const priceMap = new Map(prices.map(p => [p.symbol?.toUpperCase(), parseFloat(p.price || '0')]));
      const uniqueUsers = new Set(portfolios.map(p => p.user_id));
      let totalPlatformValue = 0;
      portfolios.forEach(p => {
        const amount = parseFloat(p.available || '0') + parseFloat(p.frozen || '0');
        if (p.symbol?.toUpperCase() === 'USDT') {
          totalPlatformValue += amount;
        } else {
          totalPlatformValue += amount * (priceMap.get(p.symbol?.toUpperCase()) || 0);
        }
      });

      // === REGISTRATION TREND (last 30 days) ===
      const registrationTrend: Array<{ date: string; count: number }> = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(today.getTime() - i * 86400000);
        const dateStr = d.toISOString().split('T')[0];
        const next = new Date(d.getTime() + 86400000);
        const count = users.filter(u => u.role !== 'admin' && new Date(u.created_at) >= d && new Date(u.created_at) < next).length;
        registrationTrend.push({ date: dateStr, count });
      }

      // === TRADE VOLUME TREND (last 30 days) ===
      const volumeTrend: Array<{ date: string; volume: number; count: number }> = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(today.getTime() - i * 86400000);
        const dateStr = d.toISOString().split('T')[0];
        const next = new Date(d.getTime() + 86400000);
        const dayTrades = trades.filter(t => new Date(t.created_at) >= d && new Date(t.created_at) < next);
        const vol = dayTrades.reduce((s, t) => s + parseFloat(t.amount || '0'), 0);
        volumeTrend.push({ date: dateStr, volume: vol, count: dayTrades.length });
      }

      // === DEPOSIT/WITHDRAWAL TREND (last 30 days) ===
      const financialTrend: Array<{ date: string; deposits: number; withdrawals: number }> = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(today.getTime() - i * 86400000);
        const dateStr = d.toISOString().split('T')[0];
        const next = new Date(d.getTime() + 86400000);
        const dayDeposits = deposits.filter(dep => dep.status === 'approved' && new Date(dep.submitted_at) >= d && new Date(dep.submitted_at) < next).reduce((s, dep) => s + parseFloat(dep.amount || '0'), 0);
        const dayWithdrawals = withdrawals.filter(w => w.status === 'approved' && new Date(w.submitted_at) >= d && new Date(w.submitted_at) < next).reduce((s, w) => s + parseFloat(w.amount || '0'), 0);
        financialTrend.push({ date: dateStr, deposits: dayDeposits, withdrawals: dayWithdrawals });
      }

      // === RECENT ACTIVITY (last 20 events) ===
      type ActivityItem = { type: string; description: string; time: string; status: string };
      const recentActivity: ActivityItem[] = [];
      
      // Recent deposits
      deposits.slice(0, 5).forEach(d => {
        recentActivity.push({
          type: 'deposit',
          description: `Deposit of ${parseFloat(d.amount || '0').toFixed(2)} ${d.symbol || 'USDT'}`,
          time: d.submitted_at,
          status: d.status,
        });
      });
      // Recent withdrawals
      withdrawals.slice(0, 5).forEach(w => {
        recentActivity.push({
          type: 'withdrawal',
          description: `Withdrawal of ${parseFloat(w.amount || '0').toFixed(2)} ${w.symbol || 'USDT'}`,
          time: w.submitted_at,
          status: w.status,
        });
      });
      // Recent trades
      trades.slice(0, 5).forEach(t => {
        recentActivity.push({
          type: 'trade',
          description: `${t.side?.toUpperCase()} ${parseFloat(t.amount || '0').toFixed(4)} ${t.symbol || ''}`,
          time: t.created_at,
          status: t.status,
        });
      });
      // Recent support tickets
      support.slice(0, 5).forEach(s => {
        recentActivity.push({
          type: 'support',
          description: `Support ticket #${s.id}`,
          time: s.created_at,
          status: s.status,
        });
      });

      // Sort by time descending
      recentActivity.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

      res.json({
        users: {
          total: totalUsers,
          active: activeUsers,
          inactive: inactiveUsers,
          verified: verifiedUsers,
          newToday: newUsersToday,
          newYesterday: newUsersYesterday,
          newThisWeek: newUsersThisWeek,
          newThisMonth: newUsersThisMonth,
          usersWithPortfolio: uniqueUsers.size,
        },
        financial: {
          totalDeposits: totalDepositAmount,
          pendingDeposits,
          totalDepositsCount: deposits.length,
          totalWithdrawals: totalWithdrawalAmount,
          pendingWithdrawals,
          totalWithdrawalsCount: withdrawals.length,
          totalPlatformValue,
          netFlow: totalDepositAmount - totalWithdrawalAmount,
        },
        trading: {
          totalTrades,
          pendingTrades,
          completedTrades,
          totalVolume: totalTradeVolume,
          totalFutures,
          activeFutures,
          completedFutures,
          futuresWins,
          futuresLosses,
          futuresWinRate: completedFutures > 0 ? ((futuresWins / completedFutures) * 100).toFixed(1) : '0',
        },
        staking: {
          activePositions: activeStaking,
          totalStaked,
        },
        loans: {
          pending: pendingLoans,
          approved: approvedLoans,
          totalValue: totalLoanValue,
        },
        support: {
          open: openTickets,
          inProgress: inProgressTickets,
          resolved: resolvedTickets,
          urgent: urgentTickets,
          total: support.length,
        },
        kyc: {
          pending: pendingKyc,
          approved: approvedKyc,
          rejected: rejectedKyc,
        },
        charts: {
          registrationTrend,
          volumeTrend,
          financialTrend,
        },
        recentActivity: recentActivity.slice(0, 20),
      });
    } catch (error: any) {
      console.error('Dashboard stats error:', error);
      res.status(500).json({ message: "Failed to fetch dashboard stats", error: error.message });
    }
  });
}
