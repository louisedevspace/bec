import type { Express } from "express";
import { requireAuth, requireAdmin, supabaseAdmin } from "./middleware";
import { REDIS_KEYS, CACHE_TTL, cacheGetOrSet, cacheInvalidate } from "../utils/redis";

async function invalidateStakingProductsCache(): Promise<void> {
  await cacheInvalidate(REDIS_KEYS.STAKING_PRODUCTS);
}

// Merges a participantCount field onto each product — total staking_positions rows
// (any status) whose product_id matches, tallied in JS since row counts are small.
async function withParticipantCounts(products: any[]): Promise<any[]> {
  const { data: positionRows } = await supabaseAdmin
    .from("staking_positions")
    .select("product_id")
    .not("product_id", "is", null);

  const countByProductId = new Map<number, number>();
  for (const row of positionRows || []) {
    countByProductId.set(row.product_id, (countByProductId.get(row.product_id) || 0) + 1);
  }

  return products.map((product) => ({
    ...product,
    participantCount: countByProductId.get(product.id) || 0,
  }));
}

async function getOrCreateRoiCalculatorSettings() {
  const { data, error } = await supabaseAdmin
    .from("roi_calculator_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error) throw error;
  if (data) return data;

  const { data: created, error: createError } = await supabaseAdmin
    .from("roi_calculator_settings")
    .insert({ id: 1 })
    .select()
    .single();

  if (createError) throw createError;
  return created;
}

export default function registerStakingProductsRoutes(app: Express) {

  // GET /api/staking-products — public: returns enabled products sorted by sort_order (CACHED)
  app.get("/api/staking-products", async (_req, res) => {
    try {
      const data = await cacheGetOrSet(REDIS_KEYS.STAKING_PRODUCTS, CACHE_TTL.STAKING_PRODUCTS, async () => {
        const { data, error } = await supabaseAdmin
          .from("staking_products")
          .select("*")
          .eq("is_enabled", true)
          .order("sort_order", { ascending: true });

        if (error) throw error;
        return await withParticipantCounts(data || []);
      });

      res.json(data);
    } catch (error) {
      console.error("Error fetching staking products:", error);
      res.status(500).json({ message: "Failed to fetch staking products" });
    }
  });

  // ───── ADMIN ENDPOINTS ─────

  // GET /api/admin/staking-products — admin: returns ALL products (including disabled)
  app.get("/api/admin/staking-products", requireAuth, requireAdmin, async (_req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("staking_products")
        .select("*")
        .order("sort_order", { ascending: true });

      if (error) {
        return res.status(500).json({ message: "Failed to fetch staking products" });
      }

      res.json(await withParticipantCounts(data || []));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch staking products" });
    }
  });

  // POST /api/admin/staking-products — admin: create new product
  app.post("/api/admin/staking-products", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { title, duration, apy, type, minAmount, maxAmount, isEnabled, sortOrder, apyMax, maxParticipants, requiresApproval } = req.body;

      if (!title || !duration || apy === undefined || !minAmount || !maxAmount) {
        return res.status(400).json({ message: "title, duration, apy, minAmount, and maxAmount are required" });
      }
      if (type !== undefined && type !== "fixed" && type !== "flexible") {
        return res.status(400).json({ message: 'type must be "fixed" or "flexible"' });
      }
      if (apyMax !== undefined && apyMax !== null) {
        const apyMaxNum = parseFloat(apyMax);
        if (isNaN(apyMaxNum) || apyMaxNum < parseFloat(apy)) {
          return res.status(400).json({ message: "apyMax must be a number greater than or equal to apy" });
        }
      }
      if (maxParticipants !== undefined && maxParticipants !== null) {
        const maxParticipantsNum = Number(maxParticipants);
        if (!Number.isInteger(maxParticipantsNum) || maxParticipantsNum <= 0) {
          return res.status(400).json({ message: "maxParticipants must be a positive integer" });
        }
      }
      if (requiresApproval !== undefined && typeof requiresApproval !== "boolean") {
        return res.status(400).json({ message: "requiresApproval must be a boolean" });
      }

      const { data, error } = await supabaseAdmin
        .from("staking_products")
        .insert({
          title,
          duration: parseInt(duration),
          apy: parseFloat(apy).toFixed(2),
          apy_max: apyMax !== undefined && apyMax !== null ? parseFloat(apyMax).toFixed(2) : null,
          type: type || "fixed",
          min_amount: minAmount,
          max_amount: maxAmount,
          is_enabled: isEnabled !== undefined ? isEnabled : true,
          sort_order: sortOrder || 0,
          max_participants: maxParticipants !== undefined && maxParticipants !== null ? Number(maxParticipants) : null,
          requires_approval: requiresApproval !== undefined ? requiresApproval : false,
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating staking product:", error);
        return res.status(500).json({ message: "Failed to create staking product" });
      }

      await invalidateStakingProductsCache();
      res.json(data);
    } catch (error) {
      console.error("Error creating staking product:", error);
      res.status(500).json({ message: "Failed to create staking product" });
    }
  });

  // PUT /api/admin/staking-products/:id — admin: update product
  app.put("/api/admin/staking-products/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid product ID" });
      }

      const { title, duration, apy, type, minAmount, maxAmount, isEnabled, sortOrder, apyMax, maxParticipants, requiresApproval } = req.body;

      if (type !== undefined && type !== "fixed" && type !== "flexible") {
        return res.status(400).json({ message: 'type must be "fixed" or "flexible"' });
      }
      if (maxParticipants !== undefined && maxParticipants !== null) {
        const maxParticipantsNum = Number(maxParticipants);
        if (!Number.isInteger(maxParticipantsNum) || maxParticipantsNum <= 0) {
          return res.status(400).json({ message: "maxParticipants must be a positive integer" });
        }
      }
      if (requiresApproval !== undefined && typeof requiresApproval !== "boolean") {
        return res.status(400).json({ message: "requiresApproval must be a boolean" });
      }
      if (apyMax !== undefined && apyMax !== null) {
        const apyMaxNum = parseFloat(apyMax);
        if (isNaN(apyMaxNum)) {
          return res.status(400).json({ message: "apyMax must be a number" });
        }
        let baseApy = apy !== undefined ? parseFloat(apy) : undefined;
        if (baseApy === undefined) {
          const { data: existingProduct } = await supabaseAdmin
            .from("staking_products")
            .select("apy")
            .eq("id", id)
            .single();
          baseApy = existingProduct ? parseFloat(existingProduct.apy) : undefined;
        }
        if (baseApy !== undefined && apyMaxNum < baseApy) {
          return res.status(400).json({ message: "apyMax must be a number greater than or equal to apy" });
        }
      }

      const updateData: any = { updated_at: new Date().toISOString() };
      if (title !== undefined) updateData.title = title;
      if (duration !== undefined) updateData.duration = parseInt(duration);
      if (apy !== undefined) updateData.apy = parseFloat(apy).toFixed(2);
      if (type !== undefined) updateData.type = type;
      if (minAmount !== undefined) updateData.min_amount = minAmount;
      if (maxAmount !== undefined) updateData.max_amount = maxAmount;
      if (isEnabled !== undefined) updateData.is_enabled = isEnabled;
      if (sortOrder !== undefined) updateData.sort_order = sortOrder;
      if (apyMax !== undefined) updateData.apy_max = apyMax === null ? null : parseFloat(apyMax).toFixed(2);
      if (maxParticipants !== undefined) updateData.max_participants = maxParticipants === null ? null : Number(maxParticipants);
      if (requiresApproval !== undefined) updateData.requires_approval = requiresApproval;

      const { data, error } = await supabaseAdmin
        .from("staking_products")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        console.error("Error updating staking product:", error);
        return res.status(500).json({ message: "Failed to update staking product" });
      }

      await invalidateStakingProductsCache();
      res.json(data);
    } catch (error) {
      console.error("Error updating staking product:", error);
      res.status(500).json({ message: "Failed to update staking product" });
    }
  });

  // DELETE /api/admin/staking-products/:id — admin: delete product
  app.delete("/api/admin/staking-products/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid product ID" });
      }

      const { error } = await supabaseAdmin
        .from("staking_products")
        .delete()
        .eq("id", id);

      if (error) {
        console.error("Error deleting staking product:", error);
        return res.status(500).json({ message: "Failed to delete staking product" });
      }

      await invalidateStakingProductsCache();
      res.json({ message: "Staking product deleted successfully" });
    } catch (error) {
      console.error("Error deleting staking product:", error);
      res.status(500).json({ message: "Failed to delete staking product" });
    }
  });

  // PUT /api/admin/staking-products/:id/toggle — admin: quick enable/disable
  app.put("/api/admin/staking-products/:id/toggle", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid product ID" });
      }

      const { data: current, error: fetchError } = await supabaseAdmin
        .from("staking_products")
        .select("is_enabled")
        .eq("id", id)
        .single();

      if (fetchError || !current) {
        return res.status(404).json({ message: "Staking product not found" });
      }

      const { data, error } = await supabaseAdmin
        .from("staking_products")
        .update({ is_enabled: !current.is_enabled, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        return res.status(500).json({ message: "Failed to toggle staking product" });
      }

      await invalidateStakingProductsCache();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to toggle staking product" });
    }
  });

  // POST /api/admin/staking-products/seed — admin: seed default products if empty
  app.post("/api/admin/staking-products/seed", requireAuth, requireAdmin, async (_req, res) => {
    try {
      const { count } = await supabaseAdmin
        .from("staking_products")
        .select("*", { count: "exact", head: true });

      if (count && count > 0) {
        return res.json({ message: "Staking products already seeded", count });
      }

      const defaultProducts = [
        { title: "7 Days",   duration: 7,   apy: "0.50",  min_amount: "10",    max_amount: "10000",   sort_order: 1 },
        { title: "15 Days",  duration: 15,  apy: "0.80",  min_amount: "100",   max_amount: "50000",   sort_order: 2 },
        { title: "30 Days",  duration: 30,  apy: "1.20",  min_amount: "500",   max_amount: "100000",  sort_order: 3 },
        { title: "60 Days",  duration: 60,  apy: "1.80",  min_amount: "1000",  max_amount: "500000",  sort_order: 4 },
        { title: "90 Days",  duration: 90,  apy: "2.50",  min_amount: "5000",  max_amount: "1000000", sort_order: 5 },
        { title: "180 Days", duration: 180, apy: "4.00",  min_amount: "10000", max_amount: "5000000", sort_order: 6 },
      ];

      const { data, error } = await supabaseAdmin
        .from("staking_products")
        .insert(defaultProducts)
        .select();

      if (error) {
        console.error("Error seeding staking products:", error);
        return res.status(500).json({ message: "Failed to seed staking products" });
      }

      await invalidateStakingProductsCache();
      res.json({ message: "Staking products seeded successfully", count: data.length, products: data });
    } catch (error) {
      res.status(500).json({ message: "Failed to seed staking products" });
    }
  });

  // ───── ROI CALCULATOR TOGGLE ─────

  // GET /api/roi-calculator/status — public, no auth. Lets the staking page
  // decide whether to show the "Calculator" tab at all.
  app.get("/api/roi-calculator/status", async (_req, res) => {
    try {
      const settings = await getOrCreateRoiCalculatorSettings();
      res.json({ isEnabled: !!settings.is_enabled });
    } catch (error) {
      console.error("Failed to load ROI calculator status:", error);
      res.json({ isEnabled: false });
    }
  });

  // GET /api/admin/roi-calculator-settings
  app.get("/api/admin/roi-calculator-settings", requireAuth, requireAdmin, async (_req, res) => {
    try {
      const settings = await getOrCreateRoiCalculatorSettings();
      res.json({ isEnabled: !!settings.is_enabled });
    } catch (error) {
      res.status(500).json({ message: "Failed to load ROI calculator settings" });
    }
  });

  // PUT /api/admin/roi-calculator-settings
  app.put("/api/admin/roi-calculator-settings", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { isEnabled } = req.body;

      const { data, error } = await supabaseAdmin
        .from("roi_calculator_settings")
        .upsert({
          id: 1,
          is_enabled: !!isEnabled,
          updated_at: new Date().toISOString(),
          updated_by: req.user.id,
        })
        .select()
        .single();

      if (error) {
        return res.status(500).json({ message: "Failed to update ROI calculator settings" });
      }

      res.json({ isEnabled: !!data.is_enabled });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
