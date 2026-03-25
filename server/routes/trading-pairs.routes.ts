import type { Express } from "express";
import { requireAuth, requireAdmin, supabaseAdmin } from "./middleware";
import { REDIS_KEYS, CACHE_TTL, cacheGetOrSet, cacheInvalidate, cacheInvalidatePattern } from "../utils/redis";

function normalizeTradingFeeRate(value: unknown, unit?: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }

  const normalizedRate = unit === "percent" ? numeric / 100 : numeric;

  if (!Number.isFinite(normalizedRate) || normalizedRate < 0 || normalizedRate > 1) {
    return null;
  }

  return normalizedRate.toFixed(8);
}

/**
 * Invalidate all trading pairs caches (call after any trading pair update)
 */
async function invalidateTradingPairsCache(): Promise<void> {
  await Promise.all([
    cacheInvalidate(REDIS_KEYS.TRADING_PAIRS),
    cacheInvalidate(REDIS_KEYS.TRADING_PAIRS_SPOT),
    cacheInvalidate(REDIS_KEYS.TRADING_PAIRS_FUTURES),
    cacheInvalidatePattern(`${REDIS_KEYS.TRADING_FEE}*`),
  ]);
}

export default function registerTradingPairsRoutes(app: Express) {

  // GET /api/trading-pairs — public: returns enabled pairs for users (CACHED)
  app.get("/api/trading-pairs", async (_req, res) => {
    try {
      const data = await cacheGetOrSet(REDIS_KEYS.TRADING_PAIRS, CACHE_TTL.TRADING_PAIRS, async () => {
        const { data, error } = await supabaseAdmin
          .from("trading_pairs")
          .select("*")
          .eq("is_enabled", true)
          .order("sort_order", { ascending: true });

        if (error) throw error;
        return data || [];
      });

      res.json(data);
    } catch (error) {
      console.error("Error fetching trading pairs:", error);
      res.status(500).json({ message: "Failed to fetch trading pairs" });
    }
  });

  // GET /api/trading-pairs/spot — returns enabled spot pairs (CACHED)
  app.get("/api/trading-pairs/spot", async (_req, res) => {
    try {
      const data = await cacheGetOrSet(REDIS_KEYS.TRADING_PAIRS_SPOT, CACHE_TTL.TRADING_PAIRS, async () => {
        const { data, error } = await supabaseAdmin
          .from("trading_pairs")
          .select("*")
          .eq("is_enabled", true)
          .in("pair_type", ["spot", "both"])
          .order("sort_order", { ascending: true });

        if (error) throw error;
        return data || [];
      });

      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch spot pairs" });
    }
  });

  // GET /api/trading-pairs/futures — returns enabled futures pairs (CACHED)
  app.get("/api/trading-pairs/futures", async (_req, res) => {
    try {
      const data = await cacheGetOrSet(REDIS_KEYS.TRADING_PAIRS_FUTURES, CACHE_TTL.TRADING_PAIRS, async () => {
        const { data, error } = await supabaseAdmin
          .from("trading_pairs")
          .select("*")
          .eq("is_enabled", true)
          .in("pair_type", ["futures", "both"])
          .order("sort_order", { ascending: true });

        if (error) throw error;
        return data || [];
      });

      res.json(data);
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
      const { symbol, baseAsset, quoteAsset, isEnabled, minTradeAmount, maxTradeAmount, tradingFee, tradingFeeUnit, sortOrder, pairType } = req.body;

      if (!symbol || !baseAsset || !quoteAsset) {
        return res.status(400).json({ message: "symbol, baseAsset, and quoteAsset are required" });
      }

      const normalizedTradingFee = normalizeTradingFeeRate(tradingFee, tradingFeeUnit);
      if (tradingFee !== undefined && normalizedTradingFee === null) {
        return res.status(400).json({ message: "Invalid trading fee. Use a percentage value between 0 and 100." });
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
          trading_fee: normalizedTradingFee || "0.001",
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

      // Invalidate trading pairs cache after creating new pair
      await invalidateTradingPairsCache();

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

      const { isEnabled, minTradeAmount, maxTradeAmount, tradingFee, tradingFeeUnit, sortOrder, pairType } = req.body;

      const updateData: any = { updated_at: new Date().toISOString() };
      if (isEnabled !== undefined) updateData.is_enabled = isEnabled;
      if (minTradeAmount !== undefined) updateData.min_trade_amount = minTradeAmount;
      if (maxTradeAmount !== undefined) updateData.max_trade_amount = maxTradeAmount;
      if (tradingFee !== undefined) {
        const normalizedTradingFee = normalizeTradingFeeRate(tradingFee, tradingFeeUnit);
        if (normalizedTradingFee === null) {
          return res.status(400).json({ message: "Invalid trading fee. Use a percentage value between 0 and 100." });
        }
        updateData.trading_fee = normalizedTradingFee;
      }
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

      // Invalidate trading pairs cache after update
      await invalidateTradingPairsCache();

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

      // Invalidate trading pairs cache after delete
      await invalidateTradingPairsCache();

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

      // Invalidate trading pairs cache after toggle
      await invalidateTradingPairsCache();

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

      // Invalidate trading pairs cache after seeding
      await invalidateTradingPairsCache();

      res.json({ message: "Trading pairs seeded successfully", count: data.length, pairs: data });
    } catch (error) {
      res.status(500).json({ message: "Failed to seed trading pairs" });
    }
  });

  // GET /api/trading-limits/me — returns trading pair limits for spot trading
  // Query: ?symbol=BTC/USDT&type=spot
  // Spot trades use ONLY the trading pair min/max from the trading_pairs table (admin-configured)
  app.get("/api/trading-limits/me", requireAuth, async (req: any, res) => {
    try {
      const symbol = (req.query.symbol as string) || '';

      // Default limits if pair not found
      let effective = { min_amount: 0.0001, max_amount: 1000000, is_enabled: true };

      if (symbol && symbol !== '*') {
        const { data: pair } = await supabaseAdmin
          .from("trading_pairs")
          .select("min_trade_amount, max_trade_amount, is_enabled")
          .eq("symbol", symbol)
          .single();

        if (pair) {
          effective = {
            min_amount: parseFloat(pair.min_trade_amount) || 0.0001,
            max_amount: parseFloat(pair.max_trade_amount) || 1000000,
            is_enabled: pair.is_enabled,
          };
        }
      }

      res.json(effective);
    } catch {
      res.json({ min_amount: 0.0001, max_amount: 1000000, is_enabled: true });
    }
  });
}
