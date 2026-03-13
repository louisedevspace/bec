import type { Express } from "express";
import { requireAuth, requireAdmin, requireVerifiedUser, requireUnlockedWallet, checkAssetFrozen, supabaseAdmin } from "./middleware";
import { validateTradeBalance, executeTradeAndUpdatePortfolio, ensurePortfolioExists, updatePortfolioBalance } from "./helpers";
import { insertTradeSchema } from "@shared/schema";
import { z } from "zod";
import { storage } from "../storage";
import { syncManager } from "../sync-manager";
import { logFinancialOperation, getClientIP, getUserAgent } from "../utils/security";

export default function registerTradingRoutes(app: Express) {
  // GET /api/portfolio/:userId
  app.get("/api/portfolio/:userId", requireAuth, async (req, res) => {
    try {
      const requestedUserId = req.params.userId;
      const currentUserId = req.user.id;

      // Check if user is admin (missing user row = non-admin)
      const { data: currentUser } = await supabaseAdmin
        .from("users")
        .select("role")
        .eq("id", currentUserId)
        .maybeSingle();

      const isAdmin = currentUser?.role === "admin";

      if (!isAdmin && requestedUserId !== currentUserId) {
        return res.status(403).json({ message: "Access denied - you can only view your own portfolio" });
      }

      const portfolio = await storage.getPortfolio(requestedUserId);
      res.json(portfolio);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch portfolio" });
    }
  });

  // GET /api/portfolio — current user
  app.get("/api/portfolio", requireAuth, async (req, res) => {
    try {
      const currentUserId = req.user.id;

      const { data: portfolioData, error } = await supabaseAdmin
        .from("portfolios")
        .select("*")
        .eq("user_id", currentUserId);

      if (error) {
        return res.status(500).json({ message: "Database error" });
      }

      if (!portfolioData || portfolioData.length === 0) {
        await updatePortfolioBalance(currentUserId, "USDT", "0.00");
        await updatePortfolioBalance(currentUserId, "BTC", "0.00");
        await updatePortfolioBalance(currentUserId, "ETH", "0.00");

        const { data: createdPortfolio, error: fetchError } = await supabaseAdmin
          .from("portfolios")
          .select("*")
          .eq("user_id", currentUserId);

        if (fetchError) {
          return res.status(500).json({ message: "Failed to fetch created portfolio" });
        }

        return res.json(createdPortfolio);
      }

      res.json(portfolioData);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch portfolio" });
    }
  });

  // GET /api/transactions/:userId
  app.get("/api/transactions/:userId", requireAuth, async (req, res) => {
    try {
      const requestedUserId = req.params.userId;
      const currentUserId = req.user.id;
      const { type } = req.query;

      const { data: currentUser } = await supabaseAdmin
        .from("users")
        .select("role")
        .eq("id", currentUserId)
        .maybeSingle();

      const isAdmin = currentUser?.role === "admin";

      if (!isAdmin && requestedUserId !== currentUserId) {
        return res.status(403).json({ message: "Access denied - you can only view your own transactions" });
      }

      const transactions = await storage.getTransactions(requestedUserId, type as string);
      res.json(transactions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  // POST /api/transactions — create deposit/withdraw transaction
  app.post("/api/transactions", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { insertTransactionSchema } = await import("@shared/schema");
      const validatedData = insertTransactionSchema.parse(req.body);
      const transaction = await storage.createTransaction(validatedData);

      if (validatedData.type === "deposit" && validatedData.status === "completed") {
        const portfolio = await storage.getPortfolioBySymbol(validatedData.userId, validatedData.symbol);
        const currentAvailable = parseFloat(portfolio?.available || "0");
        const newAmount = parseFloat(validatedData.amount);

        const updatedPortfolio = await storage.updatePortfolio(
          validatedData.userId,
          validatedData.symbol,
          { available: (currentAvailable + newAmount).toString() }
        );
        syncManager.syncPortfolioUpdated(validatedData.userId, updatedPortfolio);
      }

      syncManager.syncTransactionCreated(transaction);
      res.json(transaction);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid transaction data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create transaction" });
    }
  });

  // POST /api/trades — create trade order
  app.post("/api/trades", requireAuth, requireVerifiedUser, requireUnlockedWallet, async (req, res) => {
    try {
      const validatedData = insertTradeSchema.parse(req.body);
      const tradeData = {
        ...validatedData,
        userId: req.user.id,
        status: "pending",
        deletedForUser: false,
        rejectionReason: null,
      };
      const ipAddress = getClientIP(req);
      const userAgent = getUserAgent(req);

      const balanceValidation = await validateTradeBalance(tradeData);
      if (!balanceValidation.valid) {
        await logFinancialOperation({
          userId: tradeData.userId,
          operation: 'TRADE',
          action: 'CREATE',
          amount: tradeData.amount,
          symbol: tradeData.symbol,
          details: { side: tradeData.side, reason: 'insufficient_balance' },
          ipAddress,
          userAgent,
          status: 'failure',
          errorMessage: balanceValidation.error,
        });
        return res.status(400).json({
          message: "Insufficient balance for this trade",
          error: balanceValidation.error,
        });
      }

      const trade = await storage.createTrade(tradeData);
      await ensurePortfolioExists(tradeData.userId, tradeData.symbol);

      // Log successful trade creation
      await logFinancialOperation({
        userId: tradeData.userId,
        operation: 'TRADE',
        action: 'CREATE',
        resourceId: trade.id,
        amount: tradeData.amount,
        symbol: tradeData.symbol,
        details: { side: tradeData.side, price: tradeData.price },
        ipAddress,
        userAgent,
        status: 'success',
      });

      syncManager.syncTradeCreated(trade);
      res.json(trade);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid trade data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create trade" });
    }
  });

  // GET /api/trades/:userId — user trades (excluding soft-deleted)
  app.get("/api/trades/:userId", requireAuth, async (req, res) => {
    try {
      const requestedUserId = req.params.userId;
      const currentUserId = req.user.id;

      const { data: currentUser } = await supabaseAdmin
        .from("users")
        .select("role")
        .eq("id", currentUserId)
        .maybeSingle();

      const isAdmin = currentUser?.role === "admin";

      if (!isAdmin && requestedUserId !== currentUserId) {
        return res.status(403).json({ message: "Access denied - you can only view your own trades" });
      }

      const { data: trades, error } = await supabaseAdmin
        .from("trades")
        .select("*")
        .eq("user_id", requestedUserId)
        .eq("deleted_for_user", false)
        .order("created_at", { ascending: false });

      if (error) {
        return res.status(500).json({ message: "Failed to fetch trades" });
      }

      res.json(trades || []);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch trades" });
    }
  });

  // PUT /api/trades/:tradeId/cancel
  app.put("/api/trades/:tradeId/cancel", requireAuth, requireVerifiedUser, async (req, res) => {
    try {
      const tradeId = parseInt(req.params.tradeId);
      const currentUserId = req.user.id;
      if (isNaN(tradeId)) {
        return res.status(400).json({ message: "Invalid trade ID" });
      }

      const { data: currentUser } = await supabaseAdmin
        .from("users")
        .select("role")
        .eq("id", currentUserId)
        .maybeSingle();

      const { data: existingTrade, error: tradeLookupError } = await supabaseAdmin
        .from("trades")
        .select("id, user_id, status")
        .eq("id", tradeId)
        .single();

      if (tradeLookupError || !existingTrade) {
        return res.status(404).json({ message: "Trade not found" });
      }

      const isAdmin = currentUser?.role === "admin";
      if (!isAdmin && existingTrade.user_id !== currentUserId) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (!["pending", "approved"].includes(existingTrade.status)) {
        return res.status(400).json({ message: "Only pending or approved trades can be cancelled" });
      }

      const updatedTrade = await storage.updateTrade(tradeId, { status: "cancelled" });
      if (!updatedTrade) {
        return res.status(404).json({ message: "Trade not found" });
      }

      syncManager.syncTradeUpdated(updatedTrade);
      res.json(updatedTrade);
    } catch (error) {
      res.status(500).json({ message: "Failed to cancel trade" });
    }
  });

  // GET /api/admin/stats
  app.get("/api/admin/stats", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { count: totalUsers } = await supabaseAdmin
        .from("users")
        .select("*", { count: "exact", head: true });

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { count: newSignups } = await supabaseAdmin
        .from("users")
        .select("*", { count: "exact", head: true })
        .gte("created_at", sevenDaysAgo.toISOString());

      const { count: activeUsers } = await supabaseAdmin
        .from("users")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true);

      res.json({
        total: totalUsers || 0,
        newSignups: newSignups || 0,
        active: activeUsers || 0,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch admin stats" });
    }
  });

  // GET /api/admin/pending-orders
  app.get("/api/admin/pending-orders", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { data: trades, error } = await supabaseAdmin
        .from("trades")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        return res.status(500).json({ message: "Database error", error: error.message });
      }

      const pendingOrders = trades?.filter(
        (t) => t.status === "pending_approval" || t.status === "pending"
      ) || [];

      const ordersWithUserDetails = await Promise.all(
        pendingOrders.map(async (trade) => {
          try {
            const user = await storage.getUser(trade.user_id);
            return {
              ...trade,
              userDetails: user
                ? { id: user.id, email: user.email, fullName: user.full_name, phone: user.phone }
                : null,
            };
          } catch {
            return { ...trade, userDetails: null };
          }
        })
      );

      res.json(ordersWithUserDetails);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch pending orders" });
    }
  });

  // GET /api/admin/all-orders
  app.get("/api/admin/all-orders", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { data: trades, error } = await supabaseAdmin
        .from("trades")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        return res.status(500).json({ message: "Failed to fetch all orders" });
      }

      const ordersWithUserDetails = await Promise.all(
        trades.map(async (trade) => {
          try {
            const user = await storage.getUser(trade.user_id);
            return {
              ...trade,
              userDetails: user
                ? { id: user.id, email: user.email, fullName: user.full_name, phone: user.phone }
                : null,
            };
          } catch {
            return { ...trade, userDetails: null };
          }
        })
      );

      res.json(ordersWithUserDetails);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch all orders" });
    }
  });

  // PUT /api/admin/orders/:orderId/approve
  app.put("/api/admin/orders/:orderId/approve", requireAuth, requireAdmin, async (req, res) => {
    try {
      const orderId = parseInt(req.params.orderId);
      if (isNaN(orderId)) {
        return res.status(400).json({ message: "Invalid order ID" });
      }

      const trade = await storage.getTradeById(orderId);
      if (!trade) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (!trade.user_id || !trade.symbol || !trade.side || !trade.amount) {
        return res.status(400).json({ message: "Invalid trade data" });
      }

      if (trade.status === "approved" || trade.status === "executed") {
        return res.status(400).json({ message: `Trade is already ${trade.status}` });
      }
      if (!["pending_approval", "pending"].includes(trade.status)) {
        return res.status(400).json({ message: `Cannot approve trade with status: ${trade.status}` });
      }

      const updatedTrade = await storage.updateTrade(orderId, { status: "approved" });
      if (!updatedTrade) {
        return res.status(500).json({ message: "Failed to update order status" });
      }

      const executionResult = await executeTradeAndUpdatePortfolio(trade);
      const executedTrade = await storage.updateTrade(orderId, {
        status: "executed",
        feeAmount: executionResult.feeAmount.toFixed(8),
        feeRate: executionResult.feeRate.toFixed(8),
        feeSymbol: executionResult.feeSymbol,
      });
      syncManager.syncTradeUpdated(executedTrade);
      res.json(executedTrade);
    } catch (error) {
      res.status(500).json({
        message: "Failed to approve order",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // PUT /api/admin/orders/:orderId/reject
  app.put("/api/admin/orders/:orderId/reject", requireAuth, requireAdmin, async (req, res) => {
    try {
      const orderId = parseInt(req.params.orderId);
      if (isNaN(orderId)) {
        return res.status(400).json({ message: "Invalid order ID" });
      }

      const trade = await storage.getTradeById(orderId);
      if (!trade) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (["approved", "executed", "rejected"].includes(trade.status)) {
        return res.status(400).json({ message: `Cannot reject trade with status: ${trade.status}` });
      }
      if (!["pending_approval", "pending"].includes(trade.status)) {
        return res.status(400).json({ message: `Cannot reject trade with status: ${trade.status}` });
      }

      const { rejectionReason } = req.body;
      const updatedTrade = await storage.updateTrade(orderId, {
        status: "rejected",
        rejectionReason: rejectionReason || "Order rejected by admin",
      });

      if (!updatedTrade) {
        return res.status(404).json({ message: "Order not found" });
      }

      syncManager.syncTradeUpdated(updatedTrade);
      res.json(updatedTrade);
    } catch (error) {
      res.status(500).json({ message: "Failed to reject order" });
    }
  });

  // POST /api/convert — convert one cryptocurrency to another
  app.post("/api/convert", requireAuth, requireVerifiedUser, requireUnlockedWallet, async (req, res) => {
    try {
      const { fromSymbol, toSymbol, amount, fromPrice, toPrice } = req.body;
      const userId = req.user.id;
      const ipAddress = getClientIP(req);
      const userAgent = getUserAgent(req);

      // --- Validation ---
      if (!fromSymbol || !toSymbol || !amount || fromPrice == null || toPrice == null) {
        return res.status(400).json({ message: "Missing required fields: fromSymbol, toSymbol, amount, fromPrice, toPrice" });
      }

      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ message: "Amount must be a positive number" });
      }

      const parsedFromPrice = parseFloat(fromPrice);
      const parsedToPrice = parseFloat(toPrice);
      if (isNaN(parsedFromPrice) || parsedFromPrice <= 0 || isNaN(parsedToPrice) || parsedToPrice <= 0) {
        return res.status(400).json({ message: "Prices must be positive numbers" });
      }

      if (fromSymbol.toUpperCase() === toSymbol.toUpperCase()) {
        return res.status(400).json({ message: "Cannot convert a currency to itself" });
      }

      // --- Check if assets are frozen ---
      const [fromAssetStatus, toAssetStatus] = await Promise.all([
        checkAssetFrozen(userId, fromSymbol),
        checkAssetFrozen(userId, toSymbol),
      ]);

      if (fromAssetStatus.frozenAmount > 0) {
        return res.status(403).json({
          message: `Your ${fromSymbol.toUpperCase()} assets are currently frozen. Conversions are not allowed for frozen assets. Please contact support for assistance.`,
          code: 'ASSET_FROZEN',
        });
      }

      if (toAssetStatus.frozenAmount > 0) {
        return res.status(403).json({
          message: `Your ${toSymbol.toUpperCase()} assets are currently frozen. Conversions into frozen assets are not allowed. Please contact support for assistance.`,
          code: 'ASSET_FROZEN',
        });
      }

      // --- Check source balance ---
      const { data: fromPortfolio } = await supabaseAdmin
        .from("portfolios")
        .select("available")
        .eq("user_id", userId)
        .eq("symbol", fromSymbol.toUpperCase())
        .maybeSingle();

      const availableBalance = fromPortfolio ? parseFloat(fromPortfolio.available) : 0;
      if (availableBalance < parsedAmount) {
        return res.status(400).json({
          message: `Insufficient ${fromSymbol} balance. Available: ${availableBalance.toFixed(8)}, Required: ${parsedAmount.toFixed(8)}`,
        });
      }

      // --- Calculate conversion ---
      const usdValue = parsedAmount * parsedFromPrice;
      const receivedAmount = usdValue / parsedToPrice;

      if (isNaN(receivedAmount) || receivedAmount <= 0) {
        return res.status(400).json({ message: "Invalid conversion result. Please refresh prices and try again." });
      }

      // --- Deduct from source portfolio ---
      const newFromBalance = availableBalance - parsedAmount;
      await updatePortfolioBalance(userId, fromSymbol.toUpperCase(), newFromBalance.toFixed(8));

      // --- Add to destination portfolio (upsert) ---
      const { data: toPortfolio } = await supabaseAdmin
        .from("portfolios")
        .select("available")
        .eq("user_id", userId)
        .eq("symbol", toSymbol.toUpperCase())
        .maybeSingle();

      const currentToBalance = toPortfolio ? parseFloat(toPortfolio.available) : 0;
      const newToBalance = currentToBalance + receivedAmount;
      await updatePortfolioBalance(userId, toSymbol.toUpperCase(), newToBalance.toFixed(8));

      // --- Create transaction record ---
      const { error: txError } = await supabaseAdmin
        .from("transactions")
        .insert({
          user_id: userId,
          type: "convert",
          symbol: `${fromSymbol.toUpperCase()}/${toSymbol.toUpperCase()}`,
          amount: parsedAmount.toString(),
          status: "completed",
          metadata: JSON.stringify({
            fromSymbol: fromSymbol.toUpperCase(),
            toSymbol: toSymbol.toUpperCase(),
            fromAmount: parsedAmount.toFixed(8),
            toAmount: receivedAmount.toFixed(8),
            fromPrice: parsedFromPrice,
            toPrice: parsedToPrice,
            usdValue: usdValue.toFixed(2),
          }),
        });

      if (txError) {
        console.error("Failed to create conversion transaction record:", txError);
        // Non-critical — balances already updated, so don't fail the conversion
      }

      // --- Audit log ---
      await logFinancialOperation({
        userId,
        operation: "TRADE",
        action: "CREATE",
        amount: parsedAmount.toString(),
        symbol: `${fromSymbol.toUpperCase()}/${toSymbol.toUpperCase()}`,
        details: {
          fromSymbol: fromSymbol.toUpperCase(),
          toSymbol: toSymbol.toUpperCase(),
          fromAmount: parsedAmount.toFixed(8),
          receivedAmount: receivedAmount.toFixed(8),
          fromPrice: parsedFromPrice,
          toPrice: parsedToPrice,
          usdValue: usdValue.toFixed(2),
        },
        ipAddress,
        userAgent,
        status: "success",
      });

      // --- Sync portfolio updates ---
      const updatedPortfolio = await storage.getPortfolio(userId);
      syncManager.syncPortfolioUpdated(userId, updatedPortfolio);

      res.json({
        success: true,
        fromSymbol: fromSymbol.toUpperCase(),
        toSymbol: toSymbol.toUpperCase(),
        fromAmount: parsedAmount.toFixed(8),
        receivedAmount: receivedAmount.toFixed(8),
        usdValue: usdValue.toFixed(2),
      });
    } catch (error: any) {
      console.error("Conversion error:", error);
      res.status(500).json({ message: error.message || "Failed to execute conversion" });
    }
  });
}
