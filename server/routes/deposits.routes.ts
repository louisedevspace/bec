import type { Express } from "express";
import { requireAuth, requireAdmin, requireUnlockedWallet, supabaseAdmin } from "./middleware";
import { syncManager } from "../sync-manager";
import multer from "multer";
import supabase from "../supabaseClient";
import { logFinancialOperation, getClientIP, getUserAgent } from "../utils/security";
import { adminNotificationService } from "../services/admin-notification.service";
import { buildInternalAssetPath } from "../../shared/supabase-storage";
import { sanitizeUploadFileName } from "../utils/uploads";
import { getServerConfig } from "../config";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

export default function registerDepositsRoutes(app: Express) {
  // POST /api/deposit-requests — submit deposit request
  app.post("/api/deposit-requests", requireAuth, requireUnlockedWallet, upload.single("screenshot"), async (req, res) => {
    try {
      const { symbol, amount } = req.body;
      const userId = req.user.id;
      const file = req.file;
      const ipAddress = getClientIP(req);
      const userAgent = getUserAgent(req);

      if (!symbol || !amount || !file) {
        return res.status(400).json({ message: "Symbol, amount, and screenshot are required" });
      }

      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        return res.status(400).json({ message: "Invalid amount" });
      }

      // Upload screenshot
      const filePath = `${userId}/${Date.now()}-${sanitizeUploadFileName(file.originalname)}`;
      const { error: uploadError } = await supabase.storage
        .from("deposit-screenshots")
        .upload(filePath, file.buffer, { contentType: file.mimetype, upsert: false });

      if (uploadError) {
        return res.status(500).json({ message: "Failed to upload screenshot" });
      }

      const screenshotUrl = buildInternalAssetPath("deposit-screenshots", filePath);

      // Create deposit request — handle sequence issues
      let { data: depositRequest, error: insertError } = await supabaseAdmin
        .from("deposit_requests")
        .insert({
          user_id: userId,
          symbol: symbol.toUpperCase(),
          amount: amountNum.toString(),
          screenshot_url: screenshotUrl,
          status: "pending",
        })
        .select()
        .single();

      if (insertError && insertError.code === "23505") {
        const { data: allIds } = await supabaseAdmin
          .from("deposit_requests")
          .select("id")
          .order("id", { ascending: true });

        const existingIds = (allIds || []).map((row) => row.id);
        const maxId = Math.max(...existingIds, 0);
        let nextAvailableId = maxId + 1;

        for (let i = 1; i <= maxId + 10; i++) {
          if (!existingIds.includes(i)) {
            nextAvailableId = i;
            break;
          }
        }

        const { data: manualResult, error: manualError } = await supabaseAdmin
          .from("deposit_requests")
          .insert({
            id: nextAvailableId,
            user_id: userId,
            symbol: symbol.toUpperCase(),
            amount: amountNum.toString(),
            screenshot_url: screenshotUrl,
            status: "pending",
          })
          .select()
          .single();

        depositRequest = manualResult;
        insertError = manualError;
      }

      if (insertError) {
        await logFinancialOperation({
          userId,
          operation: 'DEPOSIT',
          action: 'CREATE',
          amount: amountNum,
          symbol,
          ipAddress,
          userAgent,
          status: 'failure',
          errorMessage: 'Failed to create deposit request',
        });
        return res.status(500).json({ message: "Failed to create deposit request" });
      }

      // Log successful deposit request
      await logFinancialOperation({
        userId,
        operation: 'DEPOSIT',
        action: 'CREATE',
        resourceId: depositRequest?.id,
        amount: amountNum,
        symbol,
        ipAddress,
        userAgent,
        status: 'pending',
      });

      syncManager.syncDepositRequestCreated(depositRequest);

      // Admin notification
      try {
        await adminNotificationService.notifyDepositRequest(depositRequest, req.user?.email);
      } catch {}

      res.json({ message: "Deposit request submitted successfully", depositRequest });
    } catch (error) {
      res.status(500).json({ message: "Server error", error: (error as Error).message });
    }
  });

  // GET /api/deposit-requests/:userId
  app.get("/api/deposit-requests/:userId", requireAuth, async (req, res) => {
    try {
      const { userId } = req.params;
      if (userId !== req.user.id) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { data, error } = await supabaseAdmin
        .from("deposit_requests")
        .select("*")
        .eq("user_id", userId)
        .order("submitted_at", { ascending: false });

      if (error) {
        return res.status(500).json({ message: "Failed to fetch deposit requests" });
      }

      res.json(data || []);
    } catch (error) {
      res.status(500).json({ message: "Server error", error: (error as Error).message });
    }
  });

  // GET /api/admin/deposit-requests
  app.get("/api/admin/deposit-requests", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { data: requests, error } = await supabaseAdmin
        .from("deposit_requests")
        .select("*")
        .order("submitted_at", { ascending: false });

      if (error) {
        console.error('Error fetching deposit requests:', error);
        return res.status(500).json({ message: "Failed to fetch deposit requests" });
      }

      const userIds = Array.from(new Set((requests || []).map((r: any) => r.user_id).filter(Boolean)));
      let usersById = new Map<string, any>();

      if (userIds.length > 0) {
        const { data: users, error: usersError } = await supabaseAdmin
          .from('users')
          .select('id, email, full_name, display_id')
          .in('id', userIds);

        if (usersError) {
          console.error('Error fetching users for deposit requests:', usersError);
        } else {
          usersById = new Map((users || []).map((u: any) => [u.id, u]));
        }
      }

      const merged = (requests || []).map((r: any) => ({
        ...r,
        users: usersById.get(r.user_id) || null,
      }));

      res.json(merged);
    } catch (error) {
      res.status(500).json({ message: "Server error", error: (error as Error).message });
    }
  });

  // POST /api/admin/deposit-requests/:requestId/review
  app.post("/api/admin/deposit-requests/:requestId/review", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { requestId } = req.params;
      const { action, adminNotes, rejectionReason, requireReverification } = req.body;
      const currentUserId = req.user.id;

      if (!["approve", "reject"].includes(action)) {
        return res.status(400).json({ message: 'Invalid action. Must be "approve" or "reject"' });
      }

      const { data: depositRequest, error: fetchError } = await supabaseAdmin
        .from("deposit_requests")
        .select("*")
        .eq("id", requestId)
        .single();

      if (fetchError || !depositRequest) {
        return res.status(404).json({ message: "Deposit request not found" });
      }
      if (depositRequest.status !== "pending") {
        return res.status(400).json({ message: "Deposit request has already been reviewed" });
      }

      // Get per-asset fee rate ONLY from deposit_addresses settings
      let feeRate = 0;
      const { data: assetConfig } = await supabaseAdmin
        .from("deposit_addresses")
        .select("deposit_fee_rate")
        .eq("asset_symbol", depositRequest.symbol)
        .maybeSingle();
      if (assetConfig && assetConfig.deposit_fee_rate != null && parseFloat(assetConfig.deposit_fee_rate) > 0) {
        feeRate = parseFloat(assetConfig.deposit_fee_rate);
      }

      const grossAmount = parseFloat(depositRequest.amount || "0");
      const feeAmount = action === "approve" ? Math.max(0, grossAmount * feeRate) : 0;
      const netAmount = action === "approve" ? Math.max(0, grossAmount - feeAmount) : grossAmount;

      const updateData: any = {
        status: action === "approve" ? "approved" : "rejected",
        admin_notes: adminNotes,
        reviewed_at: new Date().toISOString(),
        reviewed_by: currentUserId,
      };

      if (action === "reject") {
        updateData.rejection_reason = rejectionReason;
        updateData.require_reverification = requireReverification || false;
      }

      // Try to include fee columns (may not exist in older databases)
      const feeUpdateData: any = {
        ...updateData,
        fee_amount: feeAmount.toFixed(8),
        fee_symbol: depositRequest.symbol,
        fee_rate: feeRate.toFixed(8),
        net_amount: netAmount.toFixed(8),
      };

      let updatedRequest: any = null;
      let updateError: any = null;

      // Attempt update with fee columns first
      const result1 = await supabaseAdmin
        .from("deposit_requests")
        .update(feeUpdateData)
        .eq("id", requestId)
        .select()
        .single();

      if (result1.error) {
        // Fallback: update without fee columns (columns may not exist yet)
        const result2 = await supabaseAdmin
          .from("deposit_requests")
          .update(updateData)
          .eq("id", requestId)
          .select()
          .single();
        updatedRequest = result2.data;
        updateError = result2.error;
      } else {
        updatedRequest = result1.data;
        updateError = result1.error;
      }

      if (updateError) {
        return res.status(500).json({ message: "Failed to update deposit request" });
      }

      // If approved, add to user's portfolio
      if (action === "approve") {
        const depositAmount = netAmount;

        const { data: existingPortfolio, error: fetchErr } = await supabaseAdmin
          .from("portfolios")
          .select("available, frozen")
          .eq("user_id", depositRequest.user_id)
          .eq("symbol", depositRequest.symbol)
          .single();

        let newAvailable = depositAmount;
        let newFrozen = 0;

        if (existingPortfolio && !fetchErr) {
          newAvailable = (parseFloat(existingPortfolio.available) || 0) + depositAmount;
          newFrozen = parseFloat(existingPortfolio.frozen) || 0;
        }

        const { error: portfolioError } = await supabaseAdmin
          .from("portfolios")
          .upsert(
            {
              user_id: depositRequest.user_id,
              symbol: depositRequest.symbol,
              available: newAvailable.toString(),
              frozen: newFrozen.toString(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id,symbol" }
          );

        if (portfolioError) {
          console.error("Deposit approval - portfolio upsert error:", portfolioError);
          console.error("Upsert payload:", { user_id: depositRequest.user_id, symbol: depositRequest.symbol, available: newAvailable, frozen: newFrozen });
          return res.status(500).json({ message: "Failed to update portfolio", error: portfolioError.message });
        }

        // Transaction record — try with fee columns first, fallback without
        let transactionError: any = null;
        const txWithFees = await supabaseAdmin
          .from("transactions")
          .insert({
            user_id: depositRequest.user_id,
            type: "deposit",
            symbol: depositRequest.symbol,
            amount: grossAmount.toFixed(8),
            fee_amount: feeAmount.toFixed(8),
            fee_symbol: depositRequest.symbol,
            fee_rate: feeRate.toFixed(8),
            net_amount: netAmount.toFixed(8),
            status: "completed",
            address: "Manual approval",
          });

        if (txWithFees.error) {
          // Fallback: insert without fee columns
          const txBasic = await supabaseAdmin
            .from("transactions")
            .insert({
              user_id: depositRequest.user_id,
              type: "deposit",
              symbol: depositRequest.symbol,
              amount: grossAmount.toFixed(8),
              status: "completed",
              address: "Manual approval",
            });
          transactionError = txBasic.error;
        }

        if (transactionError) {
          return res.status(500).json({ message: "Failed to create transaction" });
        }

        // Record deposit fee as platform revenue
        if (feeAmount > 0) {
          await supabaseAdmin.from('platform_fees').insert({
            user_id: depositRequest.user_id,
            trade_id: parseInt(requestId, 10),
            trade_type: 'deposit',
            symbol: depositRequest.symbol,
            fee_amount: feeAmount.toFixed(8),
            fee_symbol: depositRequest.symbol,
            fee_rate: feeRate.toFixed(8),
          }).then(() => {}).catch(() => {
            // Non-critical: don't fail the deposit if fee logging fails
          });
        }

        syncManager.syncPortfolioUpdated(depositRequest.user_id, {
          symbol: depositRequest.symbol,
          amount: depositAmount,
        });
      }

      syncManager.syncDepositRequestUpdated(updatedRequest);
      res.json({ message: `Deposit request ${action}d successfully`, depositRequest: updatedRequest });
    } catch (error) {
      res.status(500).json({ message: "Server error", error: (error as Error).message });
    }
  });

  const validateDepositAddress = (assetSymbol: string, address: string, network: string) => {
    const symbol = assetSymbol.toUpperCase();
    if (!address || !network) {
      return "Address and network are required";
    }
    if (address === "0x000000000") {
      return null;
    }
    if (symbol === "BTC") {
      const bech32 = /^bc1[a-z0-9]{11,71}$/;
      const legacy = /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/;
      if (!bech32.test(address) && !legacy.test(address)) {
        return "Invalid BTC address format";
      }
    } else if (symbol === "ETH" || symbol === "USDT") {
      const evm = /^0x[a-fA-F0-9]{40}$/;
      if (!evm.test(address)) {
        return "Invalid EVM address format";
      }
    } else if (symbol === "TRX") {
      const tron = /^T[1-9A-HJ-NP-Za-km-z]{25,34}$/;
      if (!tron.test(address)) {
        return "Invalid TRX address format";
      }
    } else {
      if (address.length < 10) {
        return "Address is too short";
      }
    }
    return null;
  };

  // ===== DEPOSIT ADDRESS MANAGEMENT =====

  // GET /api/admin/deposit-addresses
  app.get("/api/admin/deposit-addresses", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { data: addresses, error } = await supabaseAdmin
        .from("deposit_addresses")
        .select("*")
        .order("asset_symbol");

      if (error) {
        return res.status(500).json({ message: "Failed to fetch deposit addresses" });
      }

      res.json({ addresses });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // PUT /api/admin/deposit-addresses/:asset
  app.put("/api/admin/deposit-addresses/:asset", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { asset } = req.params;
      const { address, network, min_deposit, max_deposit, deposit_fee_rate, withdrawal_fee_rate } = req.body;
      const assetSymbol = asset.toUpperCase();

      const validationError = validateDepositAddress(assetSymbol, address, network);
      if (validationError) {
        return res.status(400).json({ message: validationError });
      }

      // Validate min/max deposit amounts if provided
      const minDep = min_deposit !== undefined && min_deposit !== null && min_deposit !== '' ? parseFloat(min_deposit) : null;
      const maxDep = max_deposit !== undefined && max_deposit !== null && max_deposit !== '' ? parseFloat(max_deposit) : null;

      if (minDep !== null && (isNaN(minDep) || minDep < 0)) {
        return res.status(400).json({ message: "Minimum deposit must be a non-negative number" });
      }
      if (maxDep !== null && (isNaN(maxDep) || maxDep <= 0)) {
        return res.status(400).json({ message: "Maximum deposit must be a positive number" });
      }
      if (minDep !== null && maxDep !== null && minDep >= maxDep) {
        return res.status(400).json({ message: "Minimum deposit must be less than maximum deposit" });
      }

      const depFeeRate = deposit_fee_rate !== undefined && deposit_fee_rate !== null && deposit_fee_rate !== '' ? parseFloat(deposit_fee_rate) : 0;
      const wdFeeRate = withdrawal_fee_rate !== undefined && withdrawal_fee_rate !== null && withdrawal_fee_rate !== '' ? parseFloat(withdrawal_fee_rate) : 0;

      if (isNaN(depFeeRate) || depFeeRate < 0 || depFeeRate > 1) {
        return res.status(400).json({ message: "Deposit fee rate must be between 0 and 1 (e.g., 0.01 = 1%)" });
      }
      if (isNaN(wdFeeRate) || wdFeeRate < 0 || wdFeeRate > 1) {
        return res.status(400).json({ message: "Withdrawal fee rate must be between 0 and 1 (e.g., 0.01 = 1%)" });
      }

      const { data: existing, error: existingError } = await supabaseAdmin
        .from("deposit_addresses")
        .select("*")
        .eq("asset_symbol", assetSymbol)
        .maybeSingle();

      if (existingError) {
        return res.status(500).json({ message: "Failed to load existing deposit address" });
      }

      const { data, error } = await supabaseAdmin
        .from("deposit_addresses")
        .upsert(
          {
            asset_symbol: assetSymbol,
            address,
            network,
            min_deposit: minDep,
            max_deposit: maxDep,
            deposit_fee_rate: depFeeRate,
            withdrawal_fee_rate: wdFeeRate,
            updated_at: new Date().toISOString(),
            updated_by: req.user.id,
          },
          { onConflict: "asset_symbol" }
        )
        .select()
        .single();

      if (error) {
        return res.status(500).json({ message: "Failed to update deposit address" });
      }

      const action = existing ? "update" : "create";

      await supabaseAdmin.from("deposit_address_audit_logs").insert({
        asset_symbol: assetSymbol,
        action,
        old_address: existing ? existing.address : null,
        old_network: existing ? existing.network : null,
        new_address: data.address,
        new_network: data.network,
        admin_id: req.user.id,
      });

      res.json({ message: "Deposit address updated successfully", address: data });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/admin/deposit-addresses/:asset", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { asset } = req.params;
      const assetSymbol = asset.toUpperCase();

      const { data: existing, error: existingError } = await supabaseAdmin
        .from("deposit_addresses")
        .select("*")
        .eq("asset_symbol", assetSymbol)
        .maybeSingle();

      if (existingError) {
        return res.status(500).json({ message: "Failed to load existing deposit address" });
      }

      if (!existing) {
        return res.status(404).json({ message: "Deposit address not found" });
      }

      const { error } = await supabaseAdmin
        .from("deposit_addresses")
        .delete()
        .eq("asset_symbol", assetSymbol);

      if (error) {
        return res.status(500).json({ message: "Failed to delete deposit address" });
      }

      await supabaseAdmin.from("deposit_address_audit_logs").insert({
        asset_symbol: assetSymbol,
        action: "delete",
        old_address: existing.address,
        old_network: existing.network,
        new_address: null,
        new_network: null,
        admin_id: req.user.id,
      });

      res.json({ message: "Deposit address deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/deposit-addresses — active addresses for users
  app.get("/api/deposit-addresses", requireAuth, async (req, res) => {
    try {
      const { data: addresses, error } = await supabase
        .from("deposit_addresses")
        .select("asset_symbol, address, network, min_deposit, max_deposit")
        .eq("is_active", true)
        .order("asset_symbol");

      if (error) {
        return res.status(500).json({ message: "Failed to fetch deposit addresses" });
      }

      res.json({ addresses });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
