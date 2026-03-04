import type { Express } from "express";
import { requireAuth, requireAdmin, supabaseAdmin } from "./middleware";

export default function registerTradingPairsRoutes(app: Express) {

  // GET /api/trading-pairs — public: returns enabled pairs for users
  app.get("/api/trading-pairs", async (_req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("trading_pairs")
        .select("*")
        .eq("is_enabled", true)
        .order("sort_order", { ascending: true });

      if (error) {
        console.error("Error fetching trading pairs:", error);
        return res.status(500).json({ message: "Failed to fetch trading pairs" });
      }

      res.json(data || []);
    } catch (error) {
      console.error("Error fetching trading pairs:", error);
      res.status(500).json({ message: "Failed to fetch trading pairs" });
    }
  });

  // GET /api/trading-pairs/spot — returns enabled spot pairs
  app.get("/api/trading-pairs/spot", async (_req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("trading_pairs")
        .select("*")
        .eq("is_enabled", true)
        .in("pair_type", ["spot", "both"])
        .order("sort_order", { ascending: true });

      if (error) {
        return res.status(500).json({ message: "Failed to fetch spot pairs" });
      }

      res.json(data || []);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch spot pairs" });
    }
  });

  // GET /api/trading-pairs/futures — returns enabled futures pairs
  app.get("/api/trading-pairs/futures", async (_req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("trading_pairs")
        .select("*")
        .eq("is_enabled", true)
        .in("pair_type", ["futures", "both"])
        .order("sort_order", { ascending: true });

      if (error) {
        return res.status(500).json({ message: "Failed to fetch futures pairs" });
      }

      res.json(data || []);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch futures pairs" });
    }
  });

  // ───── ADMIN ENDPOINTS ─────

  // GET /api/admin/trading-pairs — admin: returns ALL pairs (including disabled)
  app.get("/api/admin/trading-pairs", requireAuth, requireAdmin, async (_req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("trading_pairs")
        .select("*")
        .order("sort_order", { ascending: true });

      if (error) {
        return res.status(500).json({ message: "Failed to fetch trading pairs" });
      }

      res.json(data || []);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch trading pairs" });
    }
  });

  // POST /api/admin/trading-pairs — admin: create new pair
  app.post("/api/admin/trading-pairs", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { symbol, baseAsset, quoteAsset, isEnabled, minTradeAmount, maxTradeAmount, tradingFee, sortOrder, pairType } = req.body;

      if (!symbol || !baseAsset || !quoteAsset) {
        return res.status(400).json({ message: "symbol, baseAsset, and quoteAsset are required" });
      }

      // Normalize
      const normalizedSymbol = `${baseAsset.toUpperCase()}/${quoteAsset.toUpperCase()}`;

      const { data, error } = await supabaseAdmin
        .from("trading_pairs")
        .insert({
          symbol: normalizedSymbol,
          base_asset: baseAsset.toUpperCase(),
          quote_asset: quoteAsset.toUpperCase(),
          is_enabled: isEnabled !== undefined ? isEnabled : true,
          min_trade_amount: minTradeAmount || "0.0001",
          max_trade_amount: maxTradeAmount || "100",
          trading_fee: tradingFee || "0.001",
          sort_order: sortOrder || 0,
          pair_type: pairType || "spot",
        })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          return res.status(409).json({ message: "Trading pair already exists" });
        }
        console.error("Error creating trading pair:", error);
        return res.status(500).json({ message: "Failed to create trading pair" });
      }

      res.json(data);
    } catch (error) {
      console.error("Error creating trading pair:", error);
      res.status(500).json({ message: "Failed to create trading pair" });
    }
  });

  // PUT /api/admin/trading-pairs/:id — admin: update pair
  app.put("/api/admin/trading-pairs/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid pair ID" });
      }

      const { isEnabled, minTradeAmount, maxTradeAmount, tradingFee, sortOrder, pairType } = req.body;

      const updateData: any = { updated_at: new Date().toISOString() };
      if (isEnabled !== undefined) updateData.is_enabled = isEnabled;
      if (minTradeAmount !== undefined) updateData.min_trade_amount = minTradeAmount;
      if (maxTradeAmount !== undefined) updateData.max_trade_amount = maxTradeAmount;
      if (tradingFee !== undefined) updateData.trading_fee = tradingFee;
      if (sortOrder !== undefined) updateData.sort_order = sortOrder;
      if (pairType !== undefined) updateData.pair_type = pairType;

      const { data, error } = await supabaseAdmin
        .from("trading_pairs")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        console.error("Error updating trading pair:", error);
        return res.status(500).json({ message: "Failed to update trading pair" });
      }

      res.json(data);
    } catch (error) {
      console.error("Error updating trading pair:", error);
      res.status(500).json({ message: "Failed to update trading pair" });
    }
  });

  // DELETE /api/admin/trading-pairs/:id — admin: delete pair
  app.delete("/api/admin/trading-pairs/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid pair ID" });
      }

      const { error } = await supabaseAdmin
        .from("trading_pairs")
        .delete()
        .eq("id", id);

      if (error) {
        console.error("Error deleting trading pair:", error);
        return res.status(500).json({ message: "Failed to delete trading pair" });
      }

      res.json({ message: "Trading pair deleted successfully" });
    } catch (error) {
      console.error("Error deleting trading pair:", error);
      res.status(500).json({ message: "Failed to delete trading pair" });
    }
  });

  // PUT /api/admin/trading-pairs/:id/toggle — admin: quick enable/disable
  app.put("/api/admin/trading-pairs/:id/toggle", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid pair ID" });
      }

      // Fetch current state
      const { data: current, error: fetchError } = await supabaseAdmin
        .from("trading_pairs")
        .select("is_enabled")
        .eq("id", id)
        .single();

      if (fetchError || !current) {
        return res.status(404).json({ message: "Trading pair not found" });
      }

      const { data, error } = await supabaseAdmin
        .from("trading_pairs")
        .update({ is_enabled: !current.is_enabled, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        return res.status(500).json({ message: "Failed to toggle trading pair" });
      }

      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to toggle trading pair" });
    }
  });

  // POST /api/admin/trading-pairs/seed — admin: seed defaults if empty
  app.post("/api/admin/trading-pairs/seed", requireAuth, requireAdmin, async (_req, res) => {
    try {
      const { count } = await supabaseAdmin
        .from("trading_pairs")
        .select("*", { count: "exact", head: true });

      if (count && count > 0) {
        return res.json({ message: "Trading pairs already seeded", count });
      }

      const defaultPairs = [
        { symbol: 'BTC/USDT',  base_asset: 'BTC',  quote_asset: 'USDT', sort_order: 1,  pair_type: 'both', min_trade_amount: '0.0001', max_trade_amount: '10' },
        { symbol: 'ETH/USDT',  base_asset: 'ETH',  quote_asset: 'USDT', sort_order: 2,  pair_type: 'both', min_trade_amount: '0.001',  max_trade_amount: '100' },
        { symbol: 'BNB/USDT',  base_asset: 'BNB',  quote_asset: 'USDT', sort_order: 3,  pair_type: 'both', min_trade_amount: '0.01',   max_trade_amount: '500' },
        { symbol: 'SOL/USDT',  base_asset: 'SOL',  quote_asset: 'USDT', sort_order: 4,  pair_type: 'both', min_trade_amount: '0.1',    max_trade_amount: '1000' },
        { symbol: 'XRP/USDT',  base_asset: 'XRP',  quote_asset: 'USDT', sort_order: 5,  pair_type: 'both', min_trade_amount: '1',      max_trade_amount: '10000' },
        { symbol: 'ADA/USDT',  base_asset: 'ADA',  quote_asset: 'USDT', sort_order: 6,  pair_type: 'both', min_trade_amount: '1',      max_trade_amount: '10000' },
        { symbol: 'DOT/USDT',  base_asset: 'DOT',  quote_asset: 'USDT', sort_order: 7,  pair_type: 'both', min_trade_amount: '0.1',    max_trade_amount: '5000' },
        { symbol: 'DOGE/USDT', base_asset: 'DOGE', quote_asset: 'USDT', sort_order: 8,  pair_type: 'both', min_trade_amount: '10',     max_trade_amount: '100000' },
        { symbol: 'AVAX/USDT', base_asset: 'AVAX', quote_asset: 'USDT', sort_order: 9,  pair_type: 'both', min_trade_amount: '0.1',    max_trade_amount: '5000' },
        { symbol: 'LINK/USDT', base_asset: 'LINK', quote_asset: 'USDT', sort_order: 10, pair_type: 'both', min_trade_amount: '0.1',    max_trade_amount: '5000' },
        { symbol: 'LTC/USDT',  base_asset: 'LTC',  quote_asset: 'USDT', sort_order: 11, pair_type: 'spot', min_trade_amount: '0.01',   max_trade_amount: '500' },
        { symbol: 'TRX/USDT',  base_asset: 'TRX',  quote_asset: 'USDT', sort_order: 12, pair_type: 'spot', min_trade_amount: '10',     max_trade_amount: '100000' },
      ];

      const { data, error } = await supabaseAdmin
        .from("trading_pairs")
        .insert(defaultPairs)
        .select();

      if (error) {
        console.error("Error seeding trading pairs:", error);
        return res.status(500).json({ message: "Failed to seed trading pairs" });
      }

      res.json({ message: "Trading pairs seeded successfully", count: data.length, pairs: data });
    } catch (error) {
      res.status(500).json({ message: "Failed to seed trading pairs" });
    }
  });

  // ============================================================
  // USER TRADING LIMITS
  // ============================================================

  // GET /api/admin/trading-limits — all limits (admin)
  app.get("/api/admin/trading-limits", requireAuth, requireAdmin, async (_req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("user_trading_limits")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        return res.status(500).json({ message: "Failed to fetch trading limits" });
      }
      res.json(data || []);
    } catch {
      res.status(500).json({ message: "Failed to fetch trading limits" });
    }
  });

  // GET /api/admin/trading-limits/user/:userId — limits for a specific user
  app.get("/api/admin/trading-limits/user/:userId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const { data, error } = await supabaseAdmin
        .from("user_trading_limits")
        .select("*")
        .eq("user_id", userId)
        .order("symbol");

      if (error) {
        return res.status(500).json({ message: "Failed to fetch user limits" });
      }
      res.json(data || []);
    } catch {
      res.status(500).json({ message: "Failed to fetch user limits" });
    }
  });

  // POST /api/admin/trading-limits — create or upsert a limit
  app.post("/api/admin/trading-limits", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { userId, symbol, tradeType, minAmount, maxAmount, isEnabled } = req.body;

      if (!userId || !symbol) {
        return res.status(400).json({ message: "userId and symbol are required" });
      }

      const limitData: any = {
        user_id: userId,
        symbol: symbol || '*',
        trade_type: tradeType || 'both',
        min_amount: parseFloat(minAmount) || 0,
        max_amount: parseFloat(maxAmount) || 1000000,
        is_enabled: isEnabled !== false,
        updated_at: new Date().toISOString(),
      };

      // Upsert based on user_id + symbol + trade_type
      const { data: existing } = await supabaseAdmin
        .from("user_trading_limits")
        .select("id")
        .eq("user_id", userId)
        .eq("symbol", symbol || '*')
        .eq("trade_type", tradeType || 'both')
        .maybeSingle();

      let result;
      if (existing) {
        const { data, error } = await supabaseAdmin
          .from("user_trading_limits")
          .update(limitData)
          .eq("id", existing.id)
          .select()
          .single();
        if (error) throw error;
        result = data;
      } else {
        const { data, error } = await supabaseAdmin
          .from("user_trading_limits")
          .insert(limitData)
          .select()
          .single();
        if (error) throw error;
        result = data;
      }

      res.json(result);
    } catch (error: any) {
      console.error("Error saving trading limit:", error);
      res.status(500).json({ message: error.message || "Failed to save trading limit" });
    }
  });

  // PUT /api/admin/trading-limits/:id — update a limit
  app.put("/api/admin/trading-limits/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { minAmount, maxAmount, isEnabled, tradeType } = req.body;

      const updateData: any = { updated_at: new Date().toISOString() };
      if (minAmount !== undefined) updateData.min_amount = parseFloat(minAmount);
      if (maxAmount !== undefined) updateData.max_amount = parseFloat(maxAmount);
      if (isEnabled !== undefined) updateData.is_enabled = isEnabled;
      if (tradeType !== undefined) updateData.trade_type = tradeType;

      const { data, error } = await supabaseAdmin
        .from("user_trading_limits")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      res.json(data);
    } catch {
      res.status(500).json({ message: "Failed to update trading limit" });
    }
  });

  // DELETE /api/admin/trading-limits/:id — remove a limit
  app.delete("/api/admin/trading-limits/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { error } = await supabaseAdmin
        .from("user_trading_limits")
        .delete()
        .eq("id", id);

      if (error) throw error;
      res.json({ message: "Limit deleted" });
    } catch {
      res.status(500).json({ message: "Failed to delete trading limit" });
    }
  });

  // GET /api/trading-limits/me — current user's effective limits for a pair
  // Query: ?symbol=BTC/USDT&type=spot
  app.get("/api/trading-limits/me", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const symbol = (req.query.symbol as string) || '*';
      const tradeType = (req.query.type as string) || 'spot';

      // Fetch all applicable limits in priority order
      // 1. Per-user + per-pair
      // 2. Per-user + wildcard pair
      // 3. Global + per-pair
      // 4. Global + wildcard pair
      const { data: limits } = await supabaseAdmin
        .from("user_trading_limits")
        .select("*")
        .or(`user_id.eq.${userId},user_id.eq.*`)
        .or(`symbol.eq.${symbol},symbol.eq.*`)
        .in("trade_type", [tradeType, 'both']);

      // Resolve effective limit (most specific wins)
      let effective = { min_amount: 0, max_amount: 1000000, is_enabled: true };

      if (limits && limits.length > 0) {
        // Score each limit by specificity
        const scored = limits.map(l => ({
          ...l,
          score: (l.user_id !== '*' ? 2 : 0) + (l.symbol !== '*' ? 1 : 0),
        }));
        scored.sort((a, b) => b.score - a.score);
        const best = scored[0];
        effective = {
          min_amount: parseFloat(best.min_amount) || 0,
          max_amount: parseFloat(best.max_amount) || 1000000,
          is_enabled: best.is_enabled,
        };
      }

      // Also check the trading pair's own limits
      if (symbol !== '*') {
        const { data: pair } = await supabaseAdmin
          .from("trading_pairs")
          .select("min_trade_amount, max_trade_amount")
          .eq("symbol", symbol)
          .single();

        if (pair) {
          // Use the larger min and smaller max between pair defaults and user limits
          effective.min_amount = Math.max(effective.min_amount, parseFloat(pair.min_trade_amount) || 0);
          effective.max_amount = Math.min(effective.max_amount, parseFloat(pair.max_trade_amount) || 1000000);
        }
      }

      res.json(effective);
    } catch {
      res.json({ min_amount: 0, max_amount: 1000000, is_enabled: true });
    }
  });
}
