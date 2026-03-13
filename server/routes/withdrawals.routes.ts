import type { Express } from "express";
import { requireAuth, requireAdmin, supabaseAdmin, requireUnlockedWallet } from "./middleware";
import { syncManager } from "../sync-manager";
import multer from "multer";
import supabase from "../supabaseClient";
import { logFinancialOperation, getClientIP, getUserAgent } from "../utils/security";
import { adminNotificationService } from "../services/admin-notification.service";
import { buildInternalAssetPath } from "../../shared/supabase-storage";
import { sanitizeUploadFileName } from "../utils/uploads";
import { getServerConfig } from "../config";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

export default function registerWithdrawalsRoutes(app: Express) {
  // POST /api/withdraw-requests
  app.post("/api/withdraw-requests", requireAuth, requireUnlockedWallet, async (req, res) => {
    try {
      const { symbol, amount, walletAddress } = req.body;
      const userId = req.user.id;
      const ipAddress = getClientIP(req);
      const userAgent = getUserAgent(req);

      if (!symbol || !amount || !walletAddress) {
        return res.status(400).json({ message: "Missing required fields: symbol, amount, walletAddress" });
      }

      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        return res.status(400).json({ message: "Invalid amount" });
      }

      // Check balance
      const { data: portfolio, error: portfolioError } = await supabaseAdmin
        .from("portfolios")
        .select("available")
        .eq("user_id", userId)
        .eq("symbol", symbol)
        .single();

      if (portfolioError) {
        return res.status(500).json({ message: "Failed to fetch portfolio" });
      }

      const availableBalance = portfolio ? parseFloat(portfolio.available) : 0;
      if (amountNum > availableBalance) {
        return res.status(400).json({
          message: `Insufficient balance. You have ${availableBalance.toFixed(8)} ${symbol} available but trying to withdraw ${amountNum.toFixed(8)} ${symbol}.`,
        });
      }

      const feeRate = getServerConfig().withdrawalFeeRate;
      const feeAmount = Math.max(0, amountNum * feeRate);
      const netAmount = Math.max(0, amountNum - feeAmount);

      const withdrawData = {
        user_id: userId,
        symbol: symbol.toUpperCase(),
        amount: amountNum.toString(),
        fee_amount: feeAmount.toFixed(8),
        fee_symbol: symbol.toUpperCase(),
        fee_rate: feeRate.toFixed(8),
        net_amount: netAmount.toFixed(8),
        wallet_address: walletAddress.trim(),
        status: "pending",
      };

      let { data: withdrawRequest, error: insertError } = await supabaseAdmin
        .from("withdraw_requests")
        .insert(withdrawData)
        .select()
        .single();

      // Handle duplicate key
      if (insertError && insertError.code === "23505") {
        const { data: maxIdResult } = await supabaseAdmin
          .from("withdraw_requests")
          .select("id")
          .order("id", { ascending: false })
          .limit(1);

        const nextId = maxIdResult && maxIdResult.length > 0 ? maxIdResult[0].id + 1 : 1;

        const { data: retryResult, error: retryError } = await supabaseAdmin
          .from("withdraw_requests")
          .insert({ ...withdrawData, id: nextId })
          .select()
          .single();

        withdrawRequest = retryResult;
        insertError = retryError;
      }

      if (insertError) {
        await logFinancialOperation({
          userId,
          operation: 'WITHDRAWAL',
          action: 'CREATE',
          details: { symbol, amount: amountNum, walletAddress },
          ipAddress,
          userAgent,
          status: 'failure',
          errorMessage: 'Failed to create withdraw request',
        });
        return res.status(500).json({ message: "Failed to create withdraw request" });
      }

      // Log successful withdrawal request
      await logFinancialOperation({
        userId,
        operation: 'WITHDRAWAL',
        action: 'CREATE',
        resourceId: withdrawRequest?.id,
        amount: amountNum,
        symbol,
        details: { walletAddress },
        ipAddress,
        userAgent,
        status: 'pending',
      });

      try {
        syncManager.syncWithdrawRequestCreated(withdrawRequest);
      } catch {
        // Continue even if sync fails
      }

      // Admin notification
      try {
        await adminNotificationService.notifyWithdrawRequest(withdrawRequest, req.user?.email);
      } catch {}

      res.json({ message: "Withdraw request submitted successfully", withdrawRequest });
    } catch (error) {
      res.status(500).json({ message: "Server error", error: (error as Error).message });
    }
  });

  // GET /api/withdraw-requests/:userId
  app.get("/api/withdraw-requests/:userId", requireAuth, async (req, res) => {
    try {
      const { userId } = req.params;
      if (userId !== req.user.id) {
        return res.status(403).json({ message: "You can only view your own withdraw requests" });
      }

      const { data, error } = await supabaseAdmin
        .from("withdraw_requests")
        .select("*")
        .eq("user_id", userId)
        .order("submitted_at", { ascending: false });

      if (error) {
        return res.status(500).json({ message: "Failed to fetch withdraw requests" });
      }

      res.json(data || []);
    } catch (error) {
      res.status(500).json({ message: "Server error", error: (error as Error).message });
    }
  });

  // GET /api/admin/withdraw-requests
  app.get("/api/admin/withdraw-requests", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("withdraw_requests")
        .select("*")
        .order("submitted_at", { ascending: false });

      if (error) {
        return res.status(500).json({ message: "Failed to fetch withdraw requests" });
      }

      res.json(data || []);
    } catch (error) {
      res.status(500).json({ message: "Server error", error: (error as Error).message });
    }
  });

  // POST /api/admin/withdraw-requests/:requestId/review
  app.post(
    "/api/admin/withdraw-requests/:requestId/review",
    requireAuth, requireAdmin,
    upload.single("screenshot"),
    async (req, res) => {
      try {
        const { requestId } = req.params;
        const { action, adminNotes, rejectionReason, requireReverification } = req.body;
        const currentUserId = req.user.id;

        if (!action || !["approve", "reject"].includes(action)) {
          return res.status(400).json({ message: 'Invalid action. Must be "approve" or "reject"' });
        }

        const parsedId = parseInt(requestId);
        const { data: withdrawRequest, error: fetchError } = await supabase
          .from("withdraw_requests")
          .select("*")
          .eq("id", parsedId)
          .single();

        if (fetchError || !withdrawRequest) {
          return res.status(404).json({ message: "Withdraw request not found" });
        }
        if (withdrawRequest.status !== "pending") {
          return res.status(400).json({ message: "Withdraw request has already been reviewed" });
        }

        let adminScreenshotUrl = null;

        if (action === "approve" && req.file) {
          const filePath = `${Date.now()}-${sanitizeUploadFileName(req.file.originalname)}`;
          const { error: uploadError } = await supabase.storage
            .from("withdraw-screenshots")
            .upload(filePath, req.file.buffer, { contentType: req.file.mimetype, cacheControl: "3600" });

          if (uploadError) {
            return res.status(500).json({ message: "Failed to upload screenshot" });
          }

          adminScreenshotUrl = buildInternalAssetPath("withdraw-screenshots", filePath);
        }

        const updateData: any = {
          status: action === "approve" ? "approved" : "rejected",
          admin_notes: adminNotes,
          reviewed_at: new Date().toISOString(),
          reviewed_by: currentUserId,
        };

        if (action === "approve") {
          updateData.admin_screenshot_url = adminScreenshotUrl;
        } else {
          updateData.rejection_reason = rejectionReason;
          updateData.require_reverification = requireReverification || false;
        }

        const { data: updatedRequest, error: updateError } = await supabase
          .from("withdraw_requests")
          .update(updateData)
          .eq("id", parsedId)
          .select()
          .single();

        if (updateError) {
          return res.status(500).json({ message: "Failed to update withdraw request" });
        }

        // If approved, deduct from portfolio
        if (action === "approve") {
          const { data: portfolios, error: portfolioError } = await supabaseAdmin
            .from("portfolios")
            .select("available, id, user_id, symbol")
            .eq("user_id", withdrawRequest.user_id)
            .eq("symbol", withdrawRequest.symbol);

          if (portfolioError || !portfolios || portfolios.length === 0) {
            return res.status(400).json({ message: "No portfolio found for this symbol" });
          }

          const portfolio = portfolios[0];
          const currentBalance = parseFloat(portfolio.available);
          const withdrawAmount = parseFloat(withdrawRequest.amount);
          const withdrawFeeAmount = parseFloat(withdrawRequest.fee_amount || "0");
          const withdrawFeeRate = parseFloat(withdrawRequest.fee_rate || "0");
          const withdrawNetAmount = parseFloat(withdrawRequest.net_amount || withdrawRequest.amount);
          const newBalance = Math.max(0, currentBalance - withdrawAmount);

          const { error: portfolioUpdateError } = await supabaseAdmin
            .from("portfolios")
            .update({ available: newBalance.toString(), updated_at: new Date().toISOString() })
            .eq("user_id", withdrawRequest.user_id)
            .eq("symbol", withdrawRequest.symbol);

          if (portfolioUpdateError) {
            return res.status(500).json({ message: "Failed to update portfolio" });
          }

          // Transaction record
          const { error: transactionError } = await supabaseAdmin
            .from("transactions")
            .insert({
              user_id: withdrawRequest.user_id,
              type: "withdraw",
              symbol: withdrawRequest.symbol,
              amount: withdrawRequest.amount,
              fee_amount: withdrawFeeAmount.toFixed(8),
              fee_symbol: withdrawRequest.symbol,
              fee_rate: withdrawFeeRate.toFixed(8),
              net_amount: withdrawNetAmount.toFixed(8),
              status: "completed",
              address: "Manual withdrawal",
            });

          if (transactionError) {
            return res.status(500).json({ message: "Failed to create transaction" });
          }

          if (withdrawFeeAmount > 0) {
            await supabaseAdmin.from("platform_fees").insert({
              user_id: withdrawRequest.user_id,
              trade_id: parsedId,
              trade_type: "withdrawal",
              symbol: withdrawRequest.symbol,
              fee_amount: withdrawFeeAmount.toFixed(8),
              fee_symbol: withdrawRequest.symbol,
              fee_rate: withdrawFeeRate.toFixed(8),
            }).then(() => {}).catch((err: any) => {
              console.error("Failed to log withdrawal fee:", err);
            });
          }

          syncManager.syncPortfolioUpdated(withdrawRequest.user_id, {
            symbol: withdrawRequest.symbol,
            amount: -parseFloat(withdrawRequest.amount),
          });
        }

        syncManager.syncWithdrawRequestUpdated(updatedRequest);
        res.json({ message: `Withdraw request ${action}d successfully`, withdrawRequest: updatedRequest });
      } catch (error) {
        res.status(500).json({ message: "Server error", error: (error as Error).message });
      }
    }
  );
}
