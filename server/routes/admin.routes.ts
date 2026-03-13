import type { Express } from "express";
import { requireAuth, requireAdmin, supabaseAdmin } from "./middleware";
import { syncManager } from "../sync-manager";
import supabase from "../supabaseClient";
import { logAuditEvent, getClientIP, getUserAgent } from "../utils/security";
import { decryptPasswordForAdminView, encryptPasswordForAdminView, isEncryptedPasswordRecord } from "../utils/admin-password-vault";

// Cache for admin users data
let adminUsersCache: any = null;
let adminUsersCacheTime = 0;
const ADMIN_CACHE_DURATION = 60000; // 1 minute

function invalidateAdminUsersCache() {
  adminUsersCache = null;
  adminUsersCacheTime = 0;
}

export default function registerAdminRoutes(app: Express) {
  // POST /api/admin/users/:userId/reveal-password — reveal decrypted password for a single user
  app.post("/api/admin/users/:userId/reveal-password", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = req.params.userId;
      const adminUserId = req.user.id;
      const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
      const ipAddress = getClientIP(req);
      const userAgent = getUserAgent(req);

      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }

      if (action !== "delete-user") {
        const { data: targetUser, error: targetUserError } = await supabaseAdmin
          .from("users")
          .select("id")
          .eq("id", userId)
          .maybeSingle();

        if (targetUserError) {
          return res.status(500).json({ message: "Failed to validate target user" });
        }

        if (!targetUser) {
          return res.status(404).json({ message: "User not found" });
        }
      }

      if (!reason || reason.length < 6) {
        return res.status(400).json({ message: "A valid access reason is required" });
      }

      const { data: passwordRecord, error } = await supabaseAdmin
        .from("user_passwords")
        .select("id, user_id, plaintext_password, last_updated")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        return res.status(500).json({ message: "Failed to load password record" });
      }

      if (!passwordRecord || !passwordRecord.plaintext_password) {
        return res.status(404).json({ message: "No password available for this user" });
      }

      let decryptedPassword: string;

      if (isEncryptedPasswordRecord(passwordRecord.plaintext_password)) {
        decryptedPassword = decryptPasswordForAdminView(passwordRecord.plaintext_password);
      } else {
        // Legacy fallback for historical plaintext rows; re-encrypt in-place immediately.
        decryptedPassword = passwordRecord.plaintext_password;
        const { error: migrateError } = await supabaseAdmin
          .from("user_passwords")
          .update({
            plaintext_password: encryptPasswordForAdminView(decryptedPassword),
            encrypted_at: new Date().toISOString(),
          })
          .eq("id", passwordRecord.id);

        if (migrateError) {
          console.error("Failed to migrate legacy password row:", migrateError.message);
        }
      }

      if (!decryptedPassword) {
        return res.status(404).json({ message: "Password is not available for this user" });
      }

      await logAuditEvent({
        userId: adminUserId,
        action: "ADMIN_PASSWORD_VIEWED",
        resourceType: "user_passwords",
        resourceId: userId,
        details: {
          targetUserId: userId,
          reason,
        },
        ipAddress,
        userAgent,
        status: "success",
      });

      res.setHeader("Cache-Control", "no-store");
      return res.json({
        password: decryptedPassword,
        last_updated: passwordRecord.last_updated,
      });
    } catch (error) {
      const adminUserId = req.user?.id;
      if (adminUserId) {
        await logAuditEvent({
          userId: adminUserId,
          action: "ADMIN_PASSWORD_VIEW_FAILED",
          resourceType: "user_passwords",
          resourceId: req.params.userId,
          details: {
            targetUserId: req.params.userId,
          },
          ipAddress: getClientIP(req),
          userAgent: getUserAgent(req),
          status: "failure",
          errorMessage: (error as Error).message,
        });
      }

      const errorMessage = (error as Error).message || "Failed to reveal password";
      return res.status(500).json({ message: errorMessage });
    }
  });

  // GET /api/admin/users — merged user data with portfolio, KYC, loans, staking
  app.get("/api/admin/users", requireAuth, requireAdmin, async (req, res) => {
    try {
      const now = Date.now();
      const forceRefresh = req.query.refresh === 'true' || typeof req.query.t === 'string';
      
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
        .select("user_id, encrypted_at, last_updated");

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
          has_password_record: !!userPassword,
          password_encrypted_at: userPassword?.encrypted_at || null,
          password_last_updated: userPassword?.last_updated || null,
          email_confirmed_at: authUser?.email_confirmed_at,
          last_sign_in_at: authUser?.last_sign_in_at,
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
      const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";

      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
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

        case "delete-user": {
          const adminUserId = req.user.id;
          const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
          const ipAddress = getClientIP(req);
          const userAgent = getUserAgent(req);

          const { data: targetUser, error: targetUserError } = await supabaseAdmin
            .from("users")
            .select("id, email, full_name, display_id, role")
            .eq("id", userId)
            .maybeSingle();

          if (targetUserError) {
            return res.status(500).json({ message: "Failed to fetch target user" });
          }

          // Idempotent response for stale UI/cache cases where user was already removed.
          if (!targetUser) {
            invalidateAdminUsersCache();
            return res.json({ message: "User was already deleted", alreadyDeleted: true });
          }

          if (targetUser.role === "admin") {
            return res.status(403).json({ message: "Admin users cannot be deleted from this action" });
          }

          // Remove dependent rows first to satisfy FK constraints.
          const cleanupSteps: Array<{ table: string; column: string }> = [
            { table: "user_passwords", column: "user_id" },
            { table: "user_news_seen", column: "user_id" },
            { table: "kyc_documents", column: "user_id" },
            { table: "portfolios", column: "user_id" },
            { table: "transactions", column: "user_id" },
            { table: "trades", column: "user_id" },
            { table: "futures_trades", column: "user_id" },
            { table: "staking_positions", column: "user_id" },
            { table: "loan_applications", column: "user_id" },
            { table: "kyc_verifications", column: "user_id" },
            { table: "deposit_requests", column: "user_id" },
            { table: "withdraw_requests", column: "user_id" },
            { table: "support_conversations", column: "user_id" },
            { table: "support_messages", column: "sender_id" },
            { table: "admin_notifications", column: "user_id" },
          ];

          for (const step of cleanupSteps) {
            const { error: cleanupError } = await supabaseAdmin
              .from(step.table)
              .delete()
              .eq(step.column, userId);

            if (cleanupError) {
              return res.status(500).json({
                message: `Failed to clean up ${step.table} before user deletion`,
                error: cleanupError.message,
              });
            }
          }

          const { error: deleteUserError } = await supabaseAdmin
            .from("users")
            .delete()
            .eq("id", userId);

          if (deleteUserError) {
            return res.status(500).json({ message: "Failed to delete user", error: deleteUserError.message });
          }

          await logAuditEvent({
            userId: adminUserId,
            action: "ADMIN_USER_DELETED",
            resourceType: "users",
            resourceId: targetUser.id,
            details: {
              deletionType: "admin",
              reason: reason || null,
              targetUser: {
                id: targetUser.id,
                email: targetUser.email,
                full_name: targetUser.full_name,
                display_id: targetUser.display_id,
              },
            },
            ipAddress,
            userAgent,
            status: "success",
          });

          invalidateAdminUsersCache();

          message = "User deleted successfully";
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

  // GET /api/admin/deleted-users - list users deleted by admin and self-deleted users
  app.get("/api/admin/deleted-users", requireAuth, requireAdmin, async (_req, res) => {
    try {
      const { data: logs, error: logsError } = await supabaseAdmin
        .from("audit_logs")
        .select("id, user_id, action, details, created_at, status")
        .in("action", ["ADMIN_USER_DELETED", "USER_SELF_DELETED"])
        .order("created_at", { ascending: false })
        .limit(1000);

      if (logsError) {
        return res.status(500).json({ message: "Failed to fetch deleted users", error: logsError.message });
      }

      const actorIds = Array.from(
        new Set(
          (logs || [])
            .filter((log) => log.action === "ADMIN_USER_DELETED" && typeof log.user_id === "string")
            .map((log) => log.user_id)
        )
      );

      let actorsById = new Map<string, { id: string; email: string | null; full_name: string | null }>();
      if (actorIds.length > 0) {
        const { data: actorRows } = await supabaseAdmin
          .from("users")
          .select("id, email, full_name")
          .in("id", actorIds);

        actorsById = new Map(
          (actorRows || []).map((row: any) => [row.id, { id: row.id, email: row.email || null, full_name: row.full_name || null }])
        );
      }

      const deletedUsers = (logs || []).map((log: any) => {
        const details = (log.details || {}) as Record<string, any>;
        const targetUser = (details.targetUser || {}) as Record<string, any>;
        const deletionType = log.action === "ADMIN_USER_DELETED" ? "admin" : "self";
        const actor = actorsById.get(log.user_id);

        return {
          id: log.id,
          deleted_at: log.created_at,
          deletion_type: deletionType,
          reason: details.reason || null,
          target_user_id: targetUser.id || details.targetUserId || null,
          target_email: targetUser.email || details.email || null,
          target_full_name: targetUser.full_name || details.full_name || null,
          target_display_id: targetUser.display_id || details.display_id || null,
          actor_user_id: deletionType === "admin" ? log.user_id : null,
          actor_email: deletionType === "admin" ? actor?.email || null : null,
          actor_full_name: deletionType === "admin" ? actor?.full_name || null : null,
        };
      });

      return res.json({ deletedUsers });
    } catch (error: any) {
      return res.status(500).json({ message: "Server error", error: error.message });
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

      invalidateAdminUsersCache();

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

  // GET /api/admin/pending-counts — lightweight pending item counts for badges
  app.get("/api/admin/pending-counts", requireAuth, requireAdmin, async (req, res) => {
    try {
      const [
        depositsRes, withdrawalsRes, tradesRes, futuresRes,
        loansRes, kycRes, supportRes
      ] = await Promise.all([
        supabaseAdmin.from("deposit_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabaseAdmin.from("withdraw_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabaseAdmin.from("trades").select("id", { count: "exact", head: true }).in("status", ["pending_approval", "pending"]),
        supabaseAdmin.from("futures_trades").select("id", { count: "exact", head: true }).eq("status", "pending_approval"),
        supabaseAdmin.from("loan_applications").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabaseAdmin.from("kyc_verifications").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabaseAdmin.from("support_messages").select("conversation_id").eq("sender_type", "user").eq("is_read", false),
      ]);

      const unreadSupportConversationCount = new Set(
        (supportRes.data || []).map((message: any) => message.conversation_id)
      ).size;

      res.json({
        deposits: depositsRes.count ?? 0,
        withdrawals: withdrawalsRes.count ?? 0,
        trades: tradesRes.count ?? 0,
        futures: futuresRes.count ?? 0,
        loans: loansRes.count ?? 0,
        kyc: kycRes.count ?? 0,
        support: unreadSupportConversationCount,
      });
    } catch (error: any) {
      console.error("Pending counts error:", error);
      res.status(500).json({ message: "Failed to fetch pending counts" });
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
        supabaseAdmin.from("users").select("id, username, email, created_at, is_active, is_verified, role"),
        supabaseAdmin.from("deposit_requests").select("id, user_id, amount, status, submitted_at, symbol, fee_amount, fee_rate, fee_symbol, net_amount"),
        supabaseAdmin.from("withdraw_requests").select("id, user_id, amount, status, submitted_at, symbol, fee_amount, fee_rate, fee_symbol, net_amount"),
        supabaseAdmin.from("trades").select("id, user_id, amount, price, status, side, symbol, created_at, fee_amount, fee_rate, fee_symbol"),
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

      const priceMap = new Map(prices.map(p => [p.symbol?.toUpperCase(), parseFloat(p.price || '0')]));
      const toUsdt = (amount: number, symbol?: string | null) => {
        const safeAmount = Number.isFinite(amount) ? amount : 0;
        const sym = (symbol || 'USDT').toUpperCase();
        if (sym === 'USDT') return safeAmount;
        const px = priceMap.get(sym) || 0;
        return safeAmount * px;
      };
      const tradeBaseSymbol = (pair?: string | null) => (pair || '').split('/')[0]?.toUpperCase() || 'USDT';
      const finalTradeStatuses = new Set(['approved', 'executed', 'filled', 'completed']);
      const tradeNotionalUsdt = (trade: any) => {
        const amount = parseFloat(trade.amount || '0');
        const price = parseFloat(trade.price || '0');
        if (price > 0) {
          return amount * price;
        }
        return toUsdt(amount, tradeBaseSymbol(trade.symbol));
      };
      const settledTrades = trades.filter(t => finalTradeStatuses.has(t.status));

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
      const totalDepositAmount = deposits
        .filter(d => d.status === 'approved')
        .reduce((s, d) => s + toUsdt(parseFloat(d.amount || '0'), d.symbol), 0);
      const pendingDeposits = deposits.filter(d => d.status === 'pending').length;
      const totalWithdrawalAmount = withdrawals
        .filter(w => w.status === 'approved')
        .reduce((s, w) => s + toUsdt(parseFloat(w.amount || '0'), w.symbol), 0);
      const pendingWithdrawals = withdrawals.filter(w => w.status === 'pending').length;

      // === FEE STATS ===
      const approvedDepositsWithFees = deposits.filter(d => d.status === 'approved');
      const approvedWithdrawalsWithFees = withdrawals.filter(w => w.status === 'approved');
      const completedTradesWithFees = trades.filter(t => ['completed', 'approved', 'executed', 'filled'].includes(t.status));

      const depositFeesTotal = approvedDepositsWithFees
        .reduce((s, d) => s + toUsdt(parseFloat(d.fee_amount || '0'), d.fee_symbol || d.symbol), 0);
      const withdrawalFeesTotal = approvedWithdrawalsWithFees
        .reduce((s, w) => s + toUsdt(parseFloat(w.fee_amount || '0'), w.fee_symbol || w.symbol), 0);
      const tradingFeesTotal = completedTradesWithFees
        .reduce((s, t) => s + toUsdt(parseFloat(t.fee_amount || '0'), t.fee_symbol || 'USDT'), 0);
      const totalFeesCollected = depositFeesTotal + withdrawalFeesTotal + tradingFeesTotal;

      // === TRADING STATS ===
      const totalTrades = trades.length;
      const pendingTrades = trades.filter(t => ['pending_approval', 'pending'].includes(t.status)).length;
      const completedTrades = settledTrades.length;
      const totalTradeVolume = settledTrades.reduce((sum, trade) => sum + tradeNotionalUsdt(trade), 0);

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
      const uniqueUsers = new Set(portfolios.map(p => p.user_id));
      let totalPlatformValue = 0;
      portfolios.forEach(p => {
        const amount = parseFloat(p.available || '0') + parseFloat(p.frozen || '0');
        totalPlatformValue += toUsdt(amount, p.symbol);
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
        const dayTrades = settledTrades.filter(t => new Date(t.created_at) >= d && new Date(t.created_at) < next);
        const vol = dayTrades.reduce((sum, trade) => sum + tradeNotionalUsdt(trade), 0);
        volumeTrend.push({ date: dateStr, volume: vol, count: dayTrades.length });
      }

      // === DEPOSIT/WITHDRAWAL TREND (last 30 days) ===
      const financialTrend: Array<{ date: string; deposits: number; withdrawals: number }> = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(today.getTime() - i * 86400000);
        const dateStr = d.toISOString().split('T')[0];
        const next = new Date(d.getTime() + 86400000);
        const dayDeposits = deposits
          .filter(dep => dep.status === 'approved' && new Date(dep.submitted_at) >= d && new Date(dep.submitted_at) < next)
          .reduce((s, dep) => s + toUsdt(parseFloat(dep.amount || '0'), dep.symbol), 0);
        const dayWithdrawals = withdrawals
          .filter(w => w.status === 'approved' && new Date(w.submitted_at) >= d && new Date(w.submitted_at) < next)
          .reduce((s, w) => s + toUsdt(parseFloat(w.amount || '0'), w.symbol), 0);
        financialTrend.push({ date: dateStr, deposits: dayDeposits, withdrawals: dayWithdrawals });
      }

      // === FEE TRENDS ===
      const feeDailyTrend: Array<{ date: string; deposits: number; withdrawals: number; trading: number; total: number }> = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(today.getTime() - i * 86400000);
        const dateStr = d.toISOString().split('T')[0];
        const next = new Date(d.getTime() + 86400000);

        const dayDepositFees = approvedDepositsWithFees
          .filter(dep => new Date(dep.submitted_at) >= d && new Date(dep.submitted_at) < next)
          .reduce((s, dep) => s + toUsdt(parseFloat(dep.fee_amount || '0'), dep.fee_symbol || dep.symbol), 0);
        const dayWithdrawalFees = approvedWithdrawalsWithFees
          .filter(w => new Date(w.submitted_at) >= d && new Date(w.submitted_at) < next)
          .reduce((s, w) => s + toUsdt(parseFloat(w.fee_amount || '0'), w.fee_symbol || w.symbol), 0);
        const dayTradingFees = completedTradesWithFees
          .filter(t => new Date(t.created_at) >= d && new Date(t.created_at) < next)
          .reduce((s, t) => s + toUsdt(parseFloat(t.fee_amount || '0'), t.fee_symbol || 'USDT'), 0);
        const dayTotal = dayDepositFees + dayWithdrawalFees + dayTradingFees;

        feeDailyTrend.push({
          date: dateStr,
          deposits: dayDepositFees,
          withdrawals: dayWithdrawalFees,
          trading: dayTradingFees,
          total: dayTotal,
        });
      }

      const feeMonthlyTrend: Array<{ month: string; deposits: number; withdrawals: number; trading: number; total: number }> = [];
      for (let i = 5; i >= 0; i--) {
        const monthStart = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const monthEnd = new Date(today.getFullYear(), today.getMonth() - i + 1, 1);
        const monthLabel = monthStart.toLocaleString('en-US', { month: 'short', year: '2-digit' });

        const monthDepositFees = approvedDepositsWithFees
          .filter(dep => new Date(dep.submitted_at) >= monthStart && new Date(dep.submitted_at) < monthEnd)
          .reduce((s, dep) => s + toUsdt(parseFloat(dep.fee_amount || '0'), dep.fee_symbol || dep.symbol), 0);
        const monthWithdrawalFees = approvedWithdrawalsWithFees
          .filter(w => new Date(w.submitted_at) >= monthStart && new Date(w.submitted_at) < monthEnd)
          .reduce((s, w) => s + toUsdt(parseFloat(w.fee_amount || '0'), w.fee_symbol || w.symbol), 0);
        const monthTradingFees = completedTradesWithFees
          .filter(t => new Date(t.created_at) >= monthStart && new Date(t.created_at) < monthEnd)
          .reduce((s, t) => s + toUsdt(parseFloat(t.fee_amount || '0'), t.fee_symbol || 'USDT'), 0);

        feeMonthlyTrend.push({
          month: monthLabel,
          deposits: monthDepositFees,
          withdrawals: monthWithdrawalFees,
          trading: monthTradingFees,
          total: monthDepositFees + monthWithdrawalFees + monthTradingFees,
        });
      }

      const feeByUserMap = new Map<string, { userId: string; username: string; email: string; totalFees: number; depositFees: number; withdrawalFees: number; tradingFees: number }>();
      const userLookup = new Map((users || []).map((u: any) => [u.id, u]));

      const upsertUserFee = (userId: string, kind: 'deposit' | 'withdrawal' | 'trading', feeUsdt: number) => {
        if (!userId || feeUsdt <= 0) return;
        const user = userLookup.get(userId);
        const entry = feeByUserMap.get(userId) || {
          userId,
          username: user?.username || 'N/A',
          email: user?.email || 'N/A',
          totalFees: 0,
          depositFees: 0,
          withdrawalFees: 0,
          tradingFees: 0,
        };
        entry.totalFees += feeUsdt;
        if (kind === 'deposit') entry.depositFees += feeUsdt;
        if (kind === 'withdrawal') entry.withdrawalFees += feeUsdt;
        if (kind === 'trading') entry.tradingFees += feeUsdt;
        feeByUserMap.set(userId, entry);
      };

      approvedDepositsWithFees.forEach((d: any) => upsertUserFee(d.user_id, 'deposit', toUsdt(parseFloat(d.fee_amount || '0'), d.fee_symbol || d.symbol)));
      approvedWithdrawalsWithFees.forEach((w: any) => upsertUserFee(w.user_id, 'withdrawal', toUsdt(parseFloat(w.fee_amount || '0'), w.fee_symbol || w.symbol)));
      completedTradesWithFees.forEach((t: any) => upsertUserFee(t.user_id, 'trading', toUsdt(parseFloat(t.fee_amount || '0'), t.fee_symbol || 'USDT')));

      const topUsersByFees = Array.from(feeByUserMap.values())
        .sort((a, b) => b.totalFees - a.totalFees)
        .slice(0, 10);

      // === RECENT ACTIVITY (last 20 events) ===
      type ActivityItem = { type: string; description: string; time: string; status: string };
      const recentActivity: ActivityItem[] = [];
      
      // Recent deposits
      deposits.slice(0, 5).forEach(d => {
        const originalAmount = parseFloat(d.amount || '0');
        const usdtAmount = toUsdt(originalAmount, d.symbol);
        const symbol = (d.symbol || 'USDT').toUpperCase();
        recentActivity.push({
          type: 'deposit',
          description: symbol === 'USDT'
            ? `Deposit of ${originalAmount.toFixed(2)} USDT`
            : `Deposit of ${originalAmount.toFixed(8)} ${symbol} (~${usdtAmount.toFixed(2)} USDT)`,
          time: d.submitted_at,
          status: d.status,
        });
      });
      // Recent withdrawals
      withdrawals.slice(0, 5).forEach(w => {
        const originalAmount = parseFloat(w.amount || '0');
        const usdtAmount = toUsdt(originalAmount, w.symbol);
        const symbol = (w.symbol || 'USDT').toUpperCase();
        recentActivity.push({
          type: 'withdrawal',
          description: symbol === 'USDT'
            ? `Withdrawal of ${originalAmount.toFixed(2)} USDT`
            : `Withdrawal of ${originalAmount.toFixed(8)} ${symbol} (~${usdtAmount.toFixed(2)} USDT)`,
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
          fees: {
            total: totalFeesCollected,
            byType: {
              deposits: depositFeesTotal,
              withdrawals: withdrawalFeesTotal,
              trading: tradingFeesTotal,
            },
            trends: {
              daily: feeDailyTrend,
              monthly: feeMonthlyTrend,
            },
            byUser: topUsersByFees,
          },
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

  // =============================================
  // GET /api/admin/analytics — advanced financial analytics
  // =============================================
  app.get("/api/admin/analytics", requireAuth, requireAdmin, async (req, res) => {
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // Fetch all approved deposits & withdrawals, plus futures results and prices for USDT conversion
      const [depositsRes, withdrawalsRes, futuresRes, pricesRes] = await Promise.all([
        supabaseAdmin.from("deposit_requests").select("id, amount, status, submitted_at, symbol, reviewed_at"),
        supabaseAdmin.from("withdraw_requests").select("id, amount, status, submitted_at, symbol, reviewed_at"),
        supabaseAdmin.from("futures_trades").select("id, amount, status, final_result, final_profit, created_at, completed_at"),
        supabaseAdmin.from("crypto_prices").select("symbol, price"),
      ]);

      const allDeposits = depositsRes.data || [];
      const allWithdrawals = withdrawalsRes.data || [];
      const allFutures = futuresRes.data || [];
      const prices = pricesRes.data || [];

      const approvedDeposits = allDeposits.filter(d => d.status === 'approved');
      const approvedWithdrawals = allWithdrawals.filter(w => w.status === 'approved');
      const completedFutures = allFutures.filter(f => f.status === 'completed');

      const priceMap = new Map(prices.map((p: any) => [p.symbol?.toUpperCase(), parseFloat(p.price || '0')]));
      const toUsdt = (amount: number, symbol?: string | null) => {
        const safeAmount = Number.isFinite(amount) ? amount : 0;
        const sym = (symbol || 'USDT').toUpperCase();
        if (sym === 'USDT') return safeAmount;
        const px = priceMap.get(sym) || 0;
        return safeAmount * px;
      };

      // Helper: get date string from timestamp
      const toDateStr = (ts: string) => new Date(ts).toISOString().split('T')[0];
      const daysBetween = (start: Date, end: Date) => Math.ceil((end.getTime() - start.getTime()) / 86400000);

      // ==================
      // 1) DEPOSIT TRACKING — daily breakdown (last 90 days)
      // ==================
      const depositDaily: Array<{ date: string; usdtAmount: number; count: number }> = [];
      for (let i = 89; i >= 0; i--) {
        const d = new Date(today.getTime() - i * 86400000);
        const dateStr = d.toISOString().split('T')[0];
        const next = new Date(d.getTime() + 86400000);
        const dayDeps = approvedDeposits.filter(dep => {
          const t = new Date(dep.submitted_at || dep.reviewed_at);
          return t >= d && t < next;
        });
        const usdtAmount = dayDeps.reduce((s, dep) => s + toUsdt(parseFloat(dep.amount || '0'), dep.symbol), 0);
        depositDaily.push({ date: dateStr, usdtAmount, count: dayDeps.length });
      }

      // ==================
      // 2) WITHDRAWAL TRACKING — daily breakdown (last 90 days)
      // ==================
      const withdrawalDaily: Array<{ date: string; usdtAmount: number; count: number }> = [];
      for (let i = 89; i >= 0; i--) {
        const d = new Date(today.getTime() - i * 86400000);
        const dateStr = d.toISOString().split('T')[0];
        const next = new Date(d.getTime() + 86400000);
        const dayWds = approvedWithdrawals.filter(w => {
          const t = new Date(w.submitted_at || w.reviewed_at);
          return t >= d && t < next;
        });
        const usdtAmount = dayWds.reduce((s, w) => s + toUsdt(parseFloat(w.amount || '0'), w.symbol), 0);
        withdrawalDaily.push({ date: dateStr, usdtAmount, count: dayWds.length });
      }

      // ==================
      // 3) PROFIT (NET FLOW) — daily deposits minus withdrawals + futures losses (platform keeps losses)
      // ==================
      const profitDaily: Array<{ date: string; netFlow: number; cumulativeProfit: number; deposits: number; withdrawals: number; futuresRevenue: number }> = [];
      let cumulativeProfit = 0;
      for (let i = 89; i >= 0; i--) {
        const d = new Date(today.getTime() - i * 86400000);
        const dateStr = d.toISOString().split('T')[0];
        const next = new Date(d.getTime() + 86400000);

        const dayDepAmt = approvedDeposits
          .filter(dep => { const t = new Date(dep.submitted_at || dep.reviewed_at); return t >= d && t < next; })
          .reduce((s, dep) => s + toUsdt(parseFloat(dep.amount || '0'), dep.symbol), 0);
        const dayWdAmt = approvedWithdrawals
          .filter(w => { const t = new Date(w.submitted_at || w.reviewed_at); return t >= d && t < next; })
          .reduce((s, w) => s + toUsdt(parseFloat(w.amount || '0'), w.symbol), 0);

        // Futures revenue: platform earns from user losses
        const dayFuturesRevenue = completedFutures
          .filter(f => {
            const t = new Date(f.completed_at || f.created_at);
            return t >= d && t < next && f.final_result === 'loss';
          })
          .reduce((s, f) => s + Math.abs(parseFloat(f.final_profit || f.amount || '0')), 0);

        const netFlow = dayDepAmt - dayWdAmt;
        const dayProfit = netFlow + dayFuturesRevenue;
        cumulativeProfit += dayProfit;
        profitDaily.push({
          date: dateStr,
          netFlow,
          cumulativeProfit,
          deposits: dayDepAmt,
          withdrawals: dayWdAmt,
          futuresRevenue: dayFuturesRevenue
        });
      }

      // ==================
      // 4) MONTHLY COMPARISON — current month vs previous months (up to 6 months)
      // ==================
      const monthlyData: Array<{
        month: string; monthLabel: string;
        deposits: number; withdrawals: number; netFlow: number; profit: number;
        depositCount: number; withdrawalCount: number;
        dailyBreakdown: Array<{ day: number; deposits: number; withdrawals: number; net: number }>;
      }> = [];

      for (let m = 5; m >= 0; m--) {
        const monthStart = new Date(now.getFullYear(), now.getMonth() - m, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - m + 1, 0, 23, 59, 59, 999);
        const monthLabel = monthStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        const monthKey = monthStart.toISOString().split('T')[0].substring(0, 7); // YYYY-MM

        const mDeps = approvedDeposits.filter(dep => {
          const t = new Date(dep.submitted_at || dep.reviewed_at);
          return t >= monthStart && t <= monthEnd;
        });
        const mWds = approvedWithdrawals.filter(w => {
          const t = new Date(w.submitted_at || w.reviewed_at);
          return t >= monthStart && t <= monthEnd;
        });
        const mFutRev = completedFutures
          .filter(f => {
            const t = new Date(f.completed_at || f.created_at);
            return t >= monthStart && t <= monthEnd && f.final_result === 'loss';
          })
          .reduce((s, f) => s + Math.abs(parseFloat(f.final_profit || f.amount || '0')), 0);

        const mDepTotal = mDeps.reduce((s, d) => s + toUsdt(parseFloat(d.amount || '0'), d.symbol), 0);
        const mWdTotal = mWds.reduce((s, w) => s + toUsdt(parseFloat(w.amount || '0'), w.symbol), 0);

        // Daily breakdown within the month (for overlay comparison)
        const daysInMonth = monthEnd.getDate();
        const dailyBreakdown: Array<{ day: number; deposits: number; withdrawals: number; net: number }> = [];
        for (let day = 1; day <= daysInMonth; day++) {
          const dayStart = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
          const dayEnd = new Date(monthStart.getFullYear(), monthStart.getMonth(), day + 1);
          const dDep = mDeps.filter(dep => {
            const t = new Date(dep.submitted_at || dep.reviewed_at);
            return t >= dayStart && t < dayEnd;
          }).reduce((s, d) => s + toUsdt(parseFloat(d.amount || '0'), d.symbol), 0);
          const dWd = mWds.filter(w => {
            const t = new Date(w.submitted_at || w.reviewed_at);
            return t >= dayStart && t < dayEnd;
          }).reduce((s, w) => s + toUsdt(parseFloat(w.amount || '0'), w.symbol), 0);
          dailyBreakdown.push({ day, deposits: dDep, withdrawals: dWd, net: dDep - dWd });
        }

        monthlyData.push({
          month: monthKey,
          monthLabel,
          deposits: mDepTotal,
          withdrawals: mWdTotal,
          netFlow: mDepTotal - mWdTotal,
          profit: mDepTotal - mWdTotal + mFutRev,
          depositCount: mDeps.length,
          withdrawalCount: mWds.length,
          dailyBreakdown,
        });
      }

      // ==================
      // 5) DAY-OVER-DAY COMPARISON — today vs yesterday vs 7d ago
      // ==================
      const getDayStats = (targetDate: Date) => {
        const dayStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
        const dayEnd = new Date(dayStart.getTime() + 86400000);
        const dDeps = approvedDeposits.filter(dep => {
          const t = new Date(dep.submitted_at || dep.reviewed_at);
          return t >= dayStart && t < dayEnd;
        });
        const dWds = approvedWithdrawals.filter(w => {
          const t = new Date(w.submitted_at || w.reviewed_at);
          return t >= dayStart && t < dayEnd;
        });
        const depTotal = dDeps.reduce((s, d) => s + toUsdt(parseFloat(d.amount || '0'), d.symbol), 0);
        const wdTotal = dWds.reduce((s, w) => s + toUsdt(parseFloat(w.amount || '0'), w.symbol), 0);
        return { deposits: depTotal, withdrawals: wdTotal, netFlow: depTotal - wdTotal, depositCount: dDeps.length, withdrawalCount: dWds.length };
      };

      const dayComparison = {
        today: { label: 'Today', ...getDayStats(today) },
        yesterday: { label: 'Yesterday', ...getDayStats(new Date(today.getTime() - 86400000)) },
        weekAgo: { label: '7 Days Ago', ...getDayStats(new Date(today.getTime() - 7 * 86400000)) },
      };

      // ==================
      // 6) SUMMARY TOTALS
      // ==================
      const totalDeposits = approvedDeposits.reduce((s, d) => s + toUsdt(parseFloat(d.amount || '0'), d.symbol), 0);
      const totalWithdrawals = approvedWithdrawals.reduce((s, w) => s + toUsdt(parseFloat(w.amount || '0'), w.symbol), 0);
      const totalFuturesRevenue = completedFutures
        .filter(f => f.final_result === 'loss')
        .reduce((s, f) => s + Math.abs(parseFloat(f.final_profit || f.amount || '0')), 0);

      // Symbol breakdown with original and USDT equivalent
      const depositsBySymbol: Record<string, { originalAmount: number; usdtAmount: number }> = {};
      approvedDeposits.forEach(d => {
        const sym = (d.symbol || 'USDT').toUpperCase();
        const originalAmount = parseFloat(d.amount || '0');
        const usdtAmount = toUsdt(originalAmount, sym);
        const existing = depositsBySymbol[sym] || { originalAmount: 0, usdtAmount: 0 };
        depositsBySymbol[sym] = {
          originalAmount: existing.originalAmount + originalAmount,
          usdtAmount: existing.usdtAmount + usdtAmount,
        };
      });
      const withdrawalsBySymbol: Record<string, { originalAmount: number; usdtAmount: number }> = {};
      approvedWithdrawals.forEach(w => {
        const sym = (w.symbol || 'USDT').toUpperCase();
        const originalAmount = parseFloat(w.amount || '0');
        const usdtAmount = toUsdt(originalAmount, sym);
        const existing = withdrawalsBySymbol[sym] || { originalAmount: 0, usdtAmount: 0 };
        withdrawalsBySymbol[sym] = {
          originalAmount: existing.originalAmount + originalAmount,
          usdtAmount: existing.usdtAmount + usdtAmount,
        };
      });

      res.json({
        depositDaily,
        withdrawalDaily,
        profitDaily,
        monthlyData,
        dayComparison,
        summary: {
          totalDeposits,
          totalWithdrawals,
          totalNetFlow: totalDeposits - totalWithdrawals,
          totalFuturesRevenue,
          totalProfit: totalDeposits - totalWithdrawals + totalFuturesRevenue,
          depositsBySymbol,
          withdrawalsBySymbol,
          totalDepositCount: approvedDeposits.length,
          totalWithdrawalCount: approvedWithdrawals.length,
          allTimeDepositCount: allDeposits.length,
          allTimeWithdrawalCount: allWithdrawals.length,
        },
      });
    } catch (error: any) {
      console.error('Analytics error:', error);
      res.status(500).json({ message: "Failed to fetch analytics", error: error.message });
    }
  });
}
