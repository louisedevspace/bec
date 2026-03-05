import type { Express } from "express";
import { requireAuth, requireAdmin, requireUnlockedWallet, supabaseAdmin } from "./middleware";
import { updatePortfolioBalance } from "./helpers";
import LiveCryptoService from "../services/live-crypto-service";
import { logFinancialOperation, getClientIP, getUserAgent } from "../utils/security";

export default function registerFuturesRoutes(app: Express) {
  // GET /api/futures-settings — get current user's futures min amount
  app.get("/api/futures-settings", requireAuth, async (req, res) => {
    try {
      const userId = req.user.id;
      const { data: user, error } = await supabaseAdmin
        .from("users")
        .select("futures_min_amount")
        .eq("id", userId)
        .single();

      if (error || !user) {
        return res.json({ futures_min_amount: 50 }); // default
      }

      res.json({ futures_min_amount: parseFloat(user.futures_min_amount) || 50 });
    } catch {
      res.json({ futures_min_amount: 50 });
    }
  });

  // PUT /api/future-trade/approve/:tradeId
  app.put("/api/future-trade/approve/:tradeId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const tradeId = parseInt(req.params.tradeId);
      if (isNaN(tradeId)) {
        return res.status(400).json({ message: "Invalid trade ID" });
      }

      const { data: futureTrade, error: fetchError } = await supabaseAdmin
        .from("futures_trades")
        .select("*")
        .eq("id", tradeId)
        .single();

      if (fetchError || !futureTrade) {
        return res.status(404).json({ message: "Future trade not found" });
      }
      if (futureTrade.status !== "pending") {
        return res.status(400).json({ message: "Trade is not pending approval" });
      }

      // Get current price
      const liveCryptoService = LiveCryptoService.getInstance();
      const livePrices = await liveCryptoService.getCurrentPrices();
      const symbolKey = futureTrade.symbol.split("/")[0];
      const priceData = livePrices.find((p) => p.symbol === symbolKey);
      const currentPrice = Number(priceData?.price) || parseFloat(futureTrade.entry_price);

      const profitAmount = parseFloat(futureTrade.amount) * (parseFloat(futureTrade.profit_ratio) / 100);
      const exitPrice =
        futureTrade.side === "long"
          ? currentPrice * (1 + parseFloat(futureTrade.profit_ratio) / 100)
          : currentPrice * (1 - parseFloat(futureTrade.profit_ratio) / 100);

      const { data: updatedTrade, error: updateError } = await supabaseAdmin
        .from("futures_trades")
        .update({
          status: "completed",
          exit_price: exitPrice.toString(),
          profit_loss: profitAmount.toString(),
          is_admin_approved: true,
        })
        .eq("id", tradeId)
        .select()
        .single();

      if (updateError) {
        return res.status(500).json({ message: "Failed to update future trade" });
      }

      // Get and consolidate USDT portfolio
      const { data: portfolios, error: portfolioError } = await supabaseAdmin
        .from("portfolios")
        .select("available, id")
        .eq("user_id", futureTrade.user_id)
        .eq("symbol", "USDT");

      if (portfolioError) {
        return res.status(500).json({ message: "Failed to fetch portfolio" });
      }

      let currentBalance = 0;
      let existingPortfolioId: number | null = null;

      if (portfolios && portfolios.length > 0) {
        currentBalance = portfolios.reduce((sum, p) => sum + parseFloat(p.available), 0);
        existingPortfolioId = portfolios[0].id;

        if (portfolios.length > 1) {
          const duplicateIds = portfolios.slice(1).map((p) => p.id);
          await supabaseAdmin.from("portfolios").delete().in("id", duplicateIds);
        }
      }

      const newBalance = currentBalance + profitAmount;
      if (existingPortfolioId) {
        await supabaseAdmin
          .from("portfolios")
          .update({ available: newBalance.toString(), updated_at: new Date().toISOString() })
          .eq("id", existingPortfolioId);
      } else {
        await supabaseAdmin.from("portfolios").insert({
          user_id: futureTrade.user_id,
          symbol: "USDT",
          available: newBalance.toString(),
          frozen: "0",
        });
      }

      res.json(updatedTrade);
    } catch (error) {
      res.status(500).json({
        message: "Failed to approve future trade",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // PUT /api/future-trade/reject/:tradeId
  app.put("/api/future-trade/reject/:tradeId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const tradeId = parseInt(req.params.tradeId);
      if (isNaN(tradeId)) {
        return res.status(400).json({ message: "Invalid trade ID" });
      }

      const { rejectionReason } = req.body;

      const { data: futureTrade, error: fetchError } = await supabaseAdmin
        .from("futures_trades")
        .select("*")
        .eq("id", tradeId)
        .single();

      if (fetchError || !futureTrade) {
        return res.status(404).json({ message: "Future trade not found" });
      }
      if (futureTrade.status !== "pending") {
        return res.status(400).json({ message: "Trade is not pending approval" });
      }

      const { data: updatedTrade, error } = await supabaseAdmin
        .from("futures_trades")
        .update({
          status: "rejected",
          rejection_reason: rejectionReason || "Trade rejected by admin",
        })
        .eq("id", tradeId)
        .select()
        .single();

      if (error) {
        return res.status(500).json({ message: "Failed to reject future trade" });
      }

      // Refund user's balance
      const { data: portfolios, error: portfolioError } = await supabaseAdmin
        .from("portfolios")
        .select("available, id")
        .eq("user_id", futureTrade.user_id)
        .eq("symbol", "USDT");

      if (portfolioError) {
        return res.status(500).json({ message: "Failed to fetch portfolio" });
      }

      let currentBalance = 0;
      let existingPortfolioId: number | null = null;

      if (portfolios && portfolios.length > 0) {
        currentBalance = portfolios.reduce((sum, p) => sum + parseFloat(p.available), 0);
        existingPortfolioId = portfolios[0].id;

        if (portfolios.length > 1) {
          const duplicateIds = portfolios.slice(1).map((p) => p.id);
          await supabaseAdmin.from("portfolios").delete().in("id", duplicateIds);
        }
      }

      const refundAmount = parseFloat(futureTrade.amount);
      const newBalance = currentBalance + refundAmount;

      if (existingPortfolioId) {
        await supabaseAdmin
          .from("portfolios")
          .update({ available: newBalance.toString(), updated_at: new Date().toISOString() })
          .eq("id", existingPortfolioId);
      } else {
        await supabaseAdmin.from("portfolios").insert({
          user_id: futureTrade.user_id,
          symbol: "USDT",
          available: newBalance.toString(),
          frozen: "0",
        });
      }

      res.json(updatedTrade);
    } catch (error) {
      res.status(500).json({
        message: "Failed to reject future trade",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // POST /api/future-trade/submit
  app.post("/api/future-trade/submit", requireAuth, requireUnlockedWallet, async (req, res) => {
    try {
      const {
        symbol, side, amount, duration, profitRatio,
        isAdminApproval, isDirectTrade, lossAmount, finalAmount,
      } = req.body;
      const userId = req.user.id;
      const ipAddress = getClientIP(req);
      const userAgent = getUserAgent(req);

      if (!symbol || !side || !amount || !duration || !profitRatio) {
        return res.status(400).json({ message: "All fields are required" });
      }
      if (!["long", "short"].includes(side)) {
        return res.status(400).json({ message: "Invalid side. Must be long or short" });
      }

      const validDurations = [60, 120, 180, 240, 360, 480, 600];
      if (!validDurations.includes(parseInt(duration))) {
        return res.status(400).json({ message: "Invalid duration" });
      }

      const validProfitRatios = [30, 40, 50, 60, 70, 80, 100];
      if (!validProfitRatios.includes(parseInt(profitRatio))) {
        return res.status(400).json({ message: "Invalid profit ratio" });
      }

      // Check balance
      const { data: portfolio, error: portfolioError } = await supabaseAdmin
        .from("portfolios")
        .select("available")
        .eq("user_id", userId)
        .eq("symbol", "USDT")
        .single();

      if (portfolioError && portfolioError.code !== "PGRST116") {
        return res.status(500).json({ message: "Database error" });
      }

      const availableBalance = portfolio ? parseFloat(portfolio.available) : 0;
      if (availableBalance < parseFloat(amount)) {
        await logFinancialOperation({
          userId,
          operation: 'FUTURES_TRADE',
          action: 'CREATE',
          amount: parseFloat(amount),
          symbol,
          details: { side, duration, profitRatio, reason: 'insufficient_balance' },
          ipAddress,
          userAgent,
          status: 'failure',
          errorMessage: 'Insufficient USDT balance',
        });
        return res.status(400).json({ message: "Insufficient USDT balance" });
      }

      // Get current price
      let currentPrice = 0;
      try {
        const liveCryptoService = LiveCryptoService.getInstance();
        const livePrices = await liveCryptoService.getCurrentPrices();
        const symbolKey = symbol.split("/")[0];
        const priceData = livePrices.find((p) => p.symbol === symbolKey);
        currentPrice = parseFloat(priceData?.price || "0");
      } catch {
        currentPrice = 50000;
      }

      const expiresAt = new Date(Date.now() + parseInt(duration) * 1000);

      let status = "pending";
      const tradeData: any = {
        user_id: userId,
        symbol,
        side,
        amount: parseFloat(amount),
        duration: parseInt(duration),
        profit_ratio: parseInt(profitRatio),
        entry_price: currentPrice,
        expires_at: expiresAt.toISOString(),
        status,
      };

      if (isDirectTrade) {
        tradeData.status = "completed";
        tradeData.profit_loss = -parseFloat(lossAmount || 0);
        tradeData.exit_price = finalAmount || 0;
        tradeData.is_admin_approved = false;
      } else if (isAdminApproval) {
        tradeData.status = "pending";
        tradeData.is_admin_approved = false;
      }

      const { data, error } = await supabaseAdmin
        .from("futures_trades")
        .insert(tradeData)
        .select()
        .single();

      if (error) {
        await logFinancialOperation({
          userId,
          operation: 'FUTURES_TRADE',
          action: 'CREATE',
          amount: parseFloat(amount),
          symbol,
          details: { side, duration, profitRatio },
          ipAddress,
          userAgent,
          status: 'failure',
          errorMessage: error.message,
        });
        return res.status(500).json({ message: "Failed to submit future trade", error: error.message });
      }

      // Log successful futures trade submission
      await logFinancialOperation({
        userId,
        operation: 'FUTURES_TRADE',
        action: 'CREATE',
        resourceId: data?.id,
        amount: parseFloat(amount),
        symbol,
        details: { side, duration, profitRatio, isDirectTrade, isAdminApproval },
        ipAddress,
        userAgent,
        status: 'success',
      });

      res.json({ message: "Future trade submitted successfully", trade: data });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/future-trades
  app.get("/api/future-trades", requireAuth, async (req, res) => {
    try {
      const userId = req.user.id;
      const { status, admin } = req.query;

      let query = supabaseAdmin
        .from("futures_trades")
        .select("*")
        .order("created_at", { ascending: false });

      if (admin === "true") {
        const { data: user } = await supabaseAdmin
          .from("users")
          .select("role")
          .eq("id", userId)
          .maybeSingle();

        if (user?.role !== "admin") {
          return res.status(403).json({ message: "Admin access required" });
        }
      } else {
        query = query.eq("user_id", userId);
        query = query.or("deleted_for_user.is.null,deleted_for_user.eq.false");
      }

      if (status) {
        query = query.eq("status", status);
      }

      const { data, error } = await query;

      if (error) {
        return res.status(500).json({ message: "Failed to fetch future trades" });
      }

      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/future-trade/complete — called when timer expires
  app.post("/api/future-trade/complete", requireAuth, async (req, res) => {
    try {
      const { tradeId } = req.body;
      const userId = req.user.id;

      if (!tradeId) {
        return res.status(400).json({ message: "Trade ID is required" });
      }

      const { data: trade, error: tradeError } = await supabaseAdmin
        .from("futures_trades")
        .select("*")
        .eq("id", tradeId)
        .eq("user_id", userId)
        .eq("status", "pending")
        .single();

      if (tradeError || !trade) {
        return res.status(404).json({ message: "Trade not found or already completed" });
      }

      // Get current price
      let currentPrice = 0;
      try {
        const liveCryptoService = LiveCryptoService.getInstance();
        const livePrices = await liveCryptoService.getCurrentPrices();
        const symbolKey = trade.symbol.split("/")[0];
        const priceData = livePrices.find((p) => p.symbol === symbolKey);
        currentPrice = parseFloat(priceData?.price || "0");
      } catch {
        currentPrice = parseFloat(trade.entry_price || "0");
      }

      // Check user status and per-user futures settings
      const { data: userData, error: userError } = await supabaseAdmin
        .from("users")
        .select("is_active, futures_trade_result")
        .eq("id", userId)
        .single();

      if (userError) {
        return res.status(500).json({ message: "Failed to fetch user data" });
      }

      // Check balance
      const { data: portfolio, error: portfolioError } = await supabaseAdmin
        .from("portfolios")
        .select("available")
        .eq("user_id", userId)
        .eq("symbol", "USDT")
        .single();

      if (portfolioError && portfolioError.code !== "PGRST116") {
        return res.status(500).json({ message: "Database error" });
      }

      const availableBalance = portfolio ? parseFloat(portfolio.available) : 0;
      const tradeAmount = parseFloat(trade.amount);

      let profitLoss = 0;
      let isWin = false;
      let exitPrice = currentPrice;

      // Determine outcome: per-user forced result takes priority
      const forcedResult = userData.futures_trade_result; // null, 'win', or 'loss'
      let shouldWin: boolean;

      if (availableBalance < tradeAmount) {
        // Insufficient balance always loses
        shouldWin = false;
      } else if (forcedResult === 'win') {
        shouldWin = true;
      } else if (forcedResult === 'loss') {
        shouldWin = false;
      } else {
        // Default: use is_active flag
        shouldWin = userData.is_active !== false;
      }

      if (!shouldWin) {
        const lossPercentage = 0.7 + Math.random() * 0.2;
        profitLoss = -(tradeAmount * lossPercentage);
        isWin = false;
        const priceChange = (Math.random() - 0.5) * 0.02;
        exitPrice =
          trade.side === "long"
            ? currentPrice * (1 - Math.abs(priceChange))
            : currentPrice * (1 + Math.abs(priceChange));
      } else {
        const profitPercentage = trade.profit_ratio / 100;
        profitLoss = tradeAmount * profitPercentage;
        isWin = true;
        const priceChange = (Math.random() - 0.5) * 0.02;
        exitPrice =
          trade.side === "long"
            ? currentPrice * (1 + Math.abs(priceChange))
            : currentPrice * (1 - Math.abs(priceChange));
      }

      const newBalance = availableBalance + profitLoss;
      await updatePortfolioBalance(userId, "USDT", newBalance.toString());

      const { error: updateError } = await supabaseAdmin
        .from("futures_trades")
        .update({
          status: "completed",
          exit_price: exitPrice.toString(),
          profit_loss: profitLoss.toString(),
        })
        .eq("id", tradeId);

      if (updateError) {
        return res.status(500).json({ message: "Failed to complete trade" });
      }

      res.json({
        message: "Trade completed successfully",
        isWin,
        finalProfitLoss: profitLoss,
        exitPrice: currentPrice,
      });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/admin/delete-futures-trade-history
  app.post("/api/admin/delete-futures-trade-history", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }

      const { error } = await supabaseAdmin
        .from("futures_trades")
        .update({ deleted_for_user: true })
        .eq("user_id", userId);

      if (error) {
        return res.status(500).json({ message: "Failed to delete futures trade history" });
      }

      res.json({ message: "Futures trade history deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/future-trades/process-expired — admin or scheduled task
  app.post("/api/future-trades/process-expired", async (req, res, next) => {
    const internalKey = req.headers["x-internal-key"];
    if (internalKey === process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return next();
    }
    requireAuth(req, res, () => requireAdmin(req, res, next));
  }, async (req, res) => {
    try {
      const { data: expiredTrades, error: fetchError } = await supabaseAdmin
        .from("futures_trades")
        .select("*")
        .eq("status", "pending")
        .lt("expires_at", new Date().toISOString());

      if (fetchError) {
        return res.status(500).json({ message: "Database error" });
      }

      if (!expiredTrades || expiredTrades.length === 0) {
        return res.json({ processed: 0, message: "No expired trades found" });
      }

      let processedCount = 0;

      for (const trade of expiredTrades) {
        try {
          let currentPrice = 0;
          try {
            const liveCryptoService = LiveCryptoService.getInstance();
            const livePrices = await liveCryptoService.getCurrentPrices();
            const symbolKey = trade.symbol.split("/")[0];
            const priceData = livePrices.find((p) => p.symbol === symbolKey);
            currentPrice = parseFloat(priceData?.price || "0");
          } catch {
            currentPrice = parseFloat(trade.entry_price || "0");
          }

          const { data: userData, error: userError } = await supabaseAdmin
            .from("users")
            .select("is_active, futures_trade_result")
            .eq("id", trade.user_id)
            .single();

          if (userError) continue;

          const { data: portfolio, error: portfolioError } = await supabaseAdmin
            .from("portfolios")
            .select("available")
            .eq("user_id", trade.user_id)
            .eq("symbol", "USDT")
            .single();

          if (portfolioError && portfolioError.code !== "PGRST116") continue;

          const availableBalance = portfolio ? parseFloat(portfolio.available) : 0;

          let profitLoss = 0;
          let exitPrice = currentPrice;

          // Determine outcome: per-user forced result takes priority
          const forcedResult = userData.futures_trade_result;
          let shouldWin: boolean;

          if (availableBalance < trade.amount) {
            shouldWin = false;
          } else if (forcedResult === 'win') {
            shouldWin = true;
          } else if (forcedResult === 'loss') {
            shouldWin = false;
          } else {
            shouldWin = userData.is_active !== false;
          }

          if (!shouldWin) {
            profitLoss = -trade.amount;
            const lossPercentage = 0.7 + Math.random() * 0.2;
            profitLoss = -(trade.amount * lossPercentage);
            const priceChange = (Math.random() - 0.5) * 0.02;
            exitPrice =
              trade.side === "long"
                ? currentPrice * (1 - Math.abs(priceChange))
                : currentPrice * (1 + Math.abs(priceChange));
          } else {
            const profitPercentage = trade.profit_ratio / 100;
            profitLoss = trade.amount * profitPercentage;
            const priceChange = (Math.random() - 0.5) * 0.02;
            exitPrice =
              trade.side === "long"
                ? currentPrice * (1 + Math.abs(priceChange))
                : currentPrice * (1 - Math.abs(priceChange));
          }

          const newBalance = availableBalance + profitLoss;
          await updatePortfolioBalance(trade.user_id, "USDT", newBalance.toString());

          await supabaseAdmin
            .from("futures_trades")
            .update({ status: "completed", exit_price: exitPrice, profit_loss: profitLoss })
            .eq("id", trade.id);

          processedCount++;
        } catch {
          continue;
        }
      }

      res.json({
        processed: processedCount,
        message: `Successfully processed ${processedCount} expired trades`,
      });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
