import type { Express } from "express";
import { requireAuth, requireAdmin, requireVerifiedUser, supabaseAdmin } from "./middleware";
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
  app.post("/api/transactions", requireAuth, requireVerifiedUser, async (req, res) => {
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
  app.post("/api/trades", requireAuth, requireVerifiedUser, async (req, res) => {
    try {
      const validatedData = insertTradeSchema.parse(req.body);
      const ipAddress = getClientIP(req);
      const userAgent = getUserAgent(req);

      const balanceValidation = await validateTradeBalance(validatedData);
      if (!balanceValidation.valid) {
        await logFinancialOperation({
          userId: validatedData.userId,
          operation: 'TRADE',
          action: 'CREATE',
          amount: validatedData.amount,
          symbol: validatedData.symbol,
          details: { side: validatedData.side, reason: 'insufficient_balance' },
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

      const trade = await storage.createTrade(validatedData);
      await ensurePortfolioExists(validatedData.userId, validatedData.symbol);

      // Log successful trade creation
      await logFinancialOperation({
        userId: validatedData.userId,
        operation: 'TRADE',
        action: 'CREATE',
        resourceId: trade.id,
        amount: validatedData.amount,
        symbol: validatedData.symbol,
        details: { side: validatedData.side, price: validatedData.price },
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
      if (isNaN(tradeId)) {
        return res.status(400).json({ message: "Invalid trade ID" });
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

      const pendingOrders = trades?.filter((t) => t.status === "pending_approval") || [];

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
      if (trade.status !== "pending_approval") {
        return res.status(400).json({ message: `Cannot approve trade with status: ${trade.status}` });
      }

      const updatedTrade = await storage.updateTrade(orderId, { status: "approved" });
      if (!updatedTrade) {
        return res.status(500).json({ message: "Failed to update order status" });
      }

      await executeTradeAndUpdatePortfolio(trade);
      const executedTrade = await storage.updateTrade(orderId, { status: "executed" });
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
      if (trade.status !== "pending_approval") {
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
}
