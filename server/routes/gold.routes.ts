import type { Express } from "express";
import { requireAuth, requireAdmin, supabaseAdmin } from "./middleware";
import { updatePortfolioBalance } from "./helpers";
import { getGoldPrice } from "../services/gold-price.service";

export default function registerGoldRoutes(app: Express) {
  // GET /api/gold/price — current gold spot price
  app.get("/api/gold/price", async (_req, res) => {
    try {
      const data = await getGoldPrice();
      res.json(data);
    } catch {
      res.status(500).json({ message: "Failed to fetch gold price" });
    }
  });

  // GET /api/trading-pairs/gold — enabled gold pairs (public)
  app.get("/api/trading-pairs/gold", async (_req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("trading_pairs")
        .select("*")
        .eq("pair_type", "gold")
        .eq("is_enabled", true)
        .order("sort_order");
      if (error) return res.status(500).json({ message: "Database error" });
      res.json(data || []);
    } catch {
      res.status(500).json({ message: "Failed to fetch gold pairs" });
    }
  });

  // GET /api/admin/trading-pairs/gold — all gold pairs including disabled (admin)
  app.get("/api/admin/trading-pairs/gold", requireAuth, requireAdmin, async (_req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("trading_pairs")
        .select("*")
        .eq("pair_type", "gold")
        .order("sort_order");
      if (error) return res.status(500).json({ message: "Database error" });
      res.json(data || []);
    } catch {
      res.status(500).json({ message: "Failed to fetch gold pairs" });
    }
  });

  // POST /api/gold/trades — submit a gold trade
  app.post("/api/gold/trades", requireAuth, async (req, res) => {
    try {
      const userId = req.user.id;
      const { pairSymbol, side, goldQuantity, pricePerOz } = req.body;

      if (!["buy", "sell"].includes(side)) {
        return res.status(400).json({ message: "Invalid side — must be buy or sell" });
      }

      const parsedGoldQty = parseFloat(goldQuantity);
      const parsedClientPrice = parseFloat(pricePerOz);

      if (isNaN(parsedGoldQty) || parsedGoldQty <= 0) {
        return res.status(400).json({ message: "Invalid gold quantity" });
      }
      if (isNaN(parsedClientPrice) || parsedClientPrice <= 0) {
        return res.status(400).json({ message: "Invalid price" });
      }

      // Validate price against server (5% tolerance)
      const serverGoldData = await getGoldPrice();
      const priceDeviation = Math.abs(parsedClientPrice - serverGoldData.price) / serverGoldData.price;
      if (priceDeviation > 0.05) {
        return res.status(400).json({
          message: "Price is stale. Please refresh and try again.",
          code: "PRICE_DEVIATION",
        });
      }

      // Always use server-authoritative price
      const serverPrice = serverGoldData.price;

      // Fetch fee rate from trading_pairs
      const { data: pairData } = await supabaseAdmin
        .from("trading_pairs")
        .select("trading_fee, min_trade_amount, max_trade_amount, is_enabled")
        .eq("symbol", pairSymbol || "XAU/USDT")
        .eq("pair_type", "gold")
        .maybeSingle();

      if (!pairData?.is_enabled) {
        return res.status(400).json({ message: "This gold trading pair is not available" });
      }

      const feeRate = parseFloat(pairData?.trading_fee || "0.002");
      const amountUsdt = parsedGoldQty * serverPrice;
      const feeUsdt = amountUsdt * feeRate;

      // Validate against pair limits (min/max in USDT)
      const minAmount = parseFloat(pairData?.min_trade_amount || "10");
      const maxAmount = parseFloat(pairData?.max_trade_amount || "500000");
      if (amountUsdt < minAmount) {
        return res.status(400).json({ message: `Minimum trade amount is $${minAmount} USDT` });
      }
      if (amountUsdt > maxAmount) {
        return res.status(400).json({ message: `Maximum trade amount is $${maxAmount} USDT` });
      }

      if (side === "buy") {
        // Deduct USDT (amount + fee) immediately — held until approved
        const totalCost = amountUsdt + feeUsdt;
        const { data: usdtPortfolio } = await supabaseAdmin
          .from("portfolios")
          .select("available")
          .eq("user_id", userId)
          .eq("symbol", "USDT")
          .maybeSingle();

        const usdtBalance = parseFloat(usdtPortfolio?.available || "0");
        if (usdtBalance < totalCost) {
          return res.status(400).json({
            message: `Insufficient USDT. Need $${totalCost.toFixed(2)} (incl. fee), available $${usdtBalance.toFixed(2)}`,
          });
        }
        await updatePortfolioBalance(userId, "USDT", (usdtBalance - totalCost).toFixed(8));
      } else {
        // Deduct XAU immediately — held until approved
        const { data: xauPortfolio } = await supabaseAdmin
          .from("portfolios")
          .select("available")
          .eq("user_id", userId)
          .eq("symbol", "XAU")
          .maybeSingle();

        const xauBalance = parseFloat(xauPortfolio?.available || "0");
        if (xauBalance < parsedGoldQty) {
          return res.status(400).json({
            message: `Insufficient XAU. Need ${parsedGoldQty.toFixed(6)} oz, available ${xauBalance.toFixed(6)} oz`,
          });
        }
        await updatePortfolioBalance(userId, "XAU", (xauBalance - parsedGoldQty).toFixed(8));
      }

      const { data: trade, error: insertError } = await supabaseAdmin
        .from("gold_trades")
        .insert({
          user_id: userId,
          pair_symbol: pairSymbol || "XAU/USDT",
          side,
          amount_usdt: amountUsdt.toFixed(8),
          gold_quantity: parsedGoldQty.toFixed(8),
          price_per_oz: serverPrice.toFixed(8),
          fee_usdt: feeUsdt.toFixed(8),
          trading_fee_rate: feeRate.toFixed(8),
          status: "pending",
        })
        .select()
        .single();

      if (insertError) {
        // Rollback held funds on DB failure
        if (side === "buy") {
          const totalCost = amountUsdt + feeUsdt;
          const { data: usdtPortfolio } = await supabaseAdmin
            .from("portfolios")
            .select("available")
            .eq("user_id", userId)
            .eq("symbol", "USDT")
            .maybeSingle();
          await updatePortfolioBalance(
            userId,
            "USDT",
            (parseFloat(usdtPortfolio?.available || "0") + totalCost).toFixed(8)
          );
        } else {
          const { data: xauPortfolio } = await supabaseAdmin
            .from("portfolios")
            .select("available")
            .eq("user_id", userId)
            .eq("symbol", "XAU")
            .maybeSingle();
          await updatePortfolioBalance(
            userId,
            "XAU",
            (parseFloat(xauPortfolio?.available || "0") + parsedGoldQty).toFixed(8)
          );
        }
        return res.status(500).json({ message: "Failed to create trade. Funds have been returned." });
      }

      res.json(trade);
    } catch (error) {
      res.status(500).json({ message: "Failed to submit gold trade" });
    }
  });

  // GET /api/gold/trades — user's own trade history
  app.get("/api/gold/trades", requireAuth, async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("gold_trades")
        .select("*")
        .eq("user_id", req.user.id)
        .order("created_at", { ascending: false });
      if (error) return res.status(500).json({ message: "Database error" });
      res.json(data || []);
    } catch {
      res.status(500).json({ message: "Failed to fetch gold trades" });
    }
  });

  // PUT /api/gold/trades/:id/cancel — user cancels a pending trade
  app.put("/api/gold/trades/:id/cancel", requireAuth, async (req, res) => {
    try {
      const tradeId = parseInt(req.params.id);
      const userId = req.user.id;

      if (isNaN(tradeId)) return res.status(400).json({ message: "Invalid trade ID" });

      const { data: trade, error: fetchError } = await supabaseAdmin
        .from("gold_trades")
        .select("*")
        .eq("id", tradeId)
        .eq("user_id", userId)
        .maybeSingle();

      if (fetchError || !trade) return res.status(404).json({ message: "Trade not found" });
      if (trade.status !== "pending") {
        return res.status(400).json({ message: "Only pending trades can be cancelled" });
      }

      // Refund held funds
      if (trade.side === "buy") {
        const totalPaid = parseFloat(trade.amount_usdt) + parseFloat(trade.fee_usdt);
        const { data: usdtPortfolio } = await supabaseAdmin
          .from("portfolios")
          .select("available")
          .eq("user_id", userId)
          .eq("symbol", "USDT")
          .maybeSingle();
        await updatePortfolioBalance(
          userId,
          "USDT",
          (parseFloat(usdtPortfolio?.available || "0") + totalPaid).toFixed(8)
        );
      } else {
        const { data: xauPortfolio } = await supabaseAdmin
          .from("portfolios")
          .select("available")
          .eq("user_id", userId)
          .eq("symbol", "XAU")
          .maybeSingle();
        await updatePortfolioBalance(
          userId,
          "XAU",
          (parseFloat(xauPortfolio?.available || "0") + parseFloat(trade.gold_quantity)).toFixed(8)
        );
      }

      const { data: updated, error } = await supabaseAdmin
        .from("gold_trades")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", tradeId)
        .select()
        .single();

      if (error) return res.status(500).json({ message: "Failed to cancel trade" });
      res.json(updated);
    } catch {
      res.status(500).json({ message: "Failed to cancel trade" });
    }
  });

  // GET /api/admin/gold/trades — all gold trades with user details
  app.get("/api/admin/gold/trades", requireAuth, requireAdmin, async (_req, res) => {
    try {
      const { data: trades, error } = await supabaseAdmin
        .from("gold_trades")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) return res.status(500).json({ message: "Database error" });

      const userIds = [...new Set((trades || []).map((t: any) => t.user_id))] as string[];
      const userMap = new Map<string, any>();

      if (userIds.length > 0) {
        const { data: users } = await supabaseAdmin
          .from("users")
          .select("id, email, full_name")
          .in("id", userIds);
        (users || []).forEach((u: any) => userMap.set(u.id, u));
      }

      res.json(
        (trades || []).map((t: any) => ({
          ...t,
          userDetails: userMap.get(t.user_id) || null,
        }))
      );
    } catch {
      res.status(500).json({ message: "Failed to fetch gold trades" });
    }
  });

  // PUT /api/admin/gold/trades/:id/approve — approve and execute trade
  app.put("/api/admin/gold/trades/:id/approve", requireAuth, requireAdmin, async (req, res) => {
    try {
      const tradeId = parseInt(req.params.id);
      if (isNaN(tradeId)) return res.status(400).json({ message: "Invalid trade ID" });

      const { data: trade, error: fetchError } = await supabaseAdmin
        .from("gold_trades")
        .select("*")
        .eq("id", tradeId)
        .maybeSingle();

      if (fetchError || !trade) return res.status(404).json({ message: "Trade not found" });
      if (trade.status !== "pending") {
        return res.status(400).json({ message: `Cannot approve trade with status: ${trade.status}` });
      }

      const userId = trade.user_id;
      const goldQty = parseFloat(trade.gold_quantity);
      const amountUsdt = parseFloat(trade.amount_usdt);
      const feeUsdt = parseFloat(trade.fee_usdt);

      if (trade.side === "buy") {
        // Credit XAU to user (USDT was already deducted on submit)
        const { data: xauPortfolio } = await supabaseAdmin
          .from("portfolios")
          .select("available")
          .eq("user_id", userId)
          .eq("symbol", "XAU")
          .maybeSingle();
        await updatePortfolioBalance(
          userId,
          "XAU",
          (parseFloat(xauPortfolio?.available || "0") + goldQty).toFixed(8)
        );
      } else {
        // Credit USDT net of fee (XAU was already deducted on submit)
        const netUsdt = amountUsdt - feeUsdt;
        const { data: usdtPortfolio } = await supabaseAdmin
          .from("portfolios")
          .select("available")
          .eq("user_id", userId)
          .eq("symbol", "USDT")
          .maybeSingle();
        await updatePortfolioBalance(
          userId,
          "USDT",
          (parseFloat(usdtPortfolio?.available || "0") + netUsdt).toFixed(8)
        );
      }

      // Record platform fee
      if (feeUsdt > 0) {
        await supabaseAdmin
          .from("platform_fees")
          .insert({
            user_id: userId,
            trade_id: tradeId,
            trade_type: "gold",
            symbol: trade.pair_symbol,
            fee_amount: feeUsdt.toFixed(8),
            fee_symbol: "USDT",
            fee_rate: trade.trading_fee_rate,
          })
          .catch((err: any) => console.error("Failed to log gold fee:", err));
      }

      const { data: updated, error } = await supabaseAdmin
        .from("gold_trades")
        .update({ status: "approved", updated_at: new Date().toISOString() })
        .eq("id", tradeId)
        .select()
        .single();

      if (error) return res.status(500).json({ message: "Failed to approve trade" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({
        message: "Failed to approve trade",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // PUT /api/admin/gold/trades/:id/reject — reject and refund trade
  app.put("/api/admin/gold/trades/:id/reject", requireAuth, requireAdmin, async (req, res) => {
    try {
      const tradeId = parseInt(req.params.id);
      if (isNaN(tradeId)) return res.status(400).json({ message: "Invalid trade ID" });

      const { rejectReason } = req.body;

      const { data: trade, error: fetchError } = await supabaseAdmin
        .from("gold_trades")
        .select("*")
        .eq("id", tradeId)
        .maybeSingle();

      if (fetchError || !trade) return res.status(404).json({ message: "Trade not found" });
      if (trade.status !== "pending") {
        return res.status(400).json({ message: `Cannot reject trade with status: ${trade.status}` });
      }

      const userId = trade.user_id;

      // Refund held funds
      if (trade.side === "buy") {
        const totalPaid = parseFloat(trade.amount_usdt) + parseFloat(trade.fee_usdt);
        const { data: usdtPortfolio } = await supabaseAdmin
          .from("portfolios")
          .select("available")
          .eq("user_id", userId)
          .eq("symbol", "USDT")
          .maybeSingle();
        await updatePortfolioBalance(
          userId,
          "USDT",
          (parseFloat(usdtPortfolio?.available || "0") + totalPaid).toFixed(8)
        );
      } else {
        const { data: xauPortfolio } = await supabaseAdmin
          .from("portfolios")
          .select("available")
          .eq("user_id", userId)
          .eq("symbol", "XAU")
          .maybeSingle();
        await updatePortfolioBalance(
          userId,
          "XAU",
          (parseFloat(xauPortfolio?.available || "0") + parseFloat(trade.gold_quantity)).toFixed(8)
        );
      }

      const { data: updated, error } = await supabaseAdmin
        .from("gold_trades")
        .update({
          status: "rejected",
          reject_reason: rejectReason || "Rejected by admin",
          updated_at: new Date().toISOString(),
        })
        .eq("id", tradeId)
        .select()
        .single();

      if (error) return res.status(500).json({ message: "Failed to reject trade" });
      res.json(updated);
    } catch {
      res.status(500).json({ message: "Failed to reject trade" });
    }
  });
}
