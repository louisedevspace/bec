import type { Express } from "express";
import { requireAuth, requireAdmin, supabaseAdmin } from "./middleware";
import { generateReferralCode } from "./helpers";

function toPublicSettings(row: any) {
  return {
    isEnabled: !!row.is_enabled,
    rewardType: row.reward_type,
    fixedAmount: row.fixed_amount,
    percentageRate: row.percentage_rate,
    minDepositAmount: row.min_deposit_amount,
    maxRewardAmount: row.max_reward_amount,
    rewardSymbol: row.reward_symbol,
  };
}

async function getOrCreateSettings() {
  const { data, error } = await supabaseAdmin
    .from("referral_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error) throw error;
  if (data) return data;

  const { data: created, error: createError } = await supabaseAdmin
    .from("referral_settings")
    .insert({ id: 1 })
    .select()
    .single();

  if (createError) throw createError;
  return created;
}

export default function registerReferralsRoutes(app: Express) {
  // GET /api/referrals/status — public, no auth. Lets the signup page (no
  // session yet) decide whether to show the referral code field at all.
  app.get("/api/referrals/status", async (_req, res) => {
    try {
      const settings = await getOrCreateSettings();
      res.json({ isEnabled: !!settings.is_enabled });
    } catch (error) {
      console.error("Failed to load referral status:", error);
      res.json({ isEnabled: false });
    }
  });

  // GET /api/referrals/settings — logged-in users see the current reward terms
  app.get("/api/referrals/settings", requireAuth, async (_req, res) => {
    try {
      const settings = await getOrCreateSettings();
      res.json(toPublicSettings(settings));
    } catch (error) {
      console.error("Failed to load referral settings:", error);
      res.status(500).json({ message: "Failed to load referral settings" });
    }
  });

  // GET /api/admin/referral-settings
  app.get("/api/admin/referral-settings", requireAuth, requireAdmin, async (_req, res) => {
    try {
      const settings = await getOrCreateSettings();
      res.json(settings);
    } catch (error) {
      console.error("Failed to load referral settings:", error);
      res.status(500).json({ message: "Failed to load referral settings" });
    }
  });

  // PUT /api/admin/referral-settings
  app.put("/api/admin/referral-settings", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { isEnabled, rewardType, fixedAmount, percentageRate, minDepositAmount, maxRewardAmount, rewardSymbol } = req.body;

      if (rewardType !== "fixed" && rewardType !== "percentage") {
        return res.status(400).json({ message: 'rewardType must be "fixed" or "percentage"' });
      }

      const fixed = parseFloat(fixedAmount);
      if (isNaN(fixed) || fixed < 0) {
        return res.status(400).json({ message: "Fixed amount must be a non-negative number" });
      }

      const pct = parseFloat(percentageRate);
      if (isNaN(pct) || pct < 0 || pct > 1) {
        return res.status(400).json({ message: "Percentage rate must be between 0 and 1 (e.g. 0.10 = 10%)" });
      }

      const minDep = parseFloat(minDepositAmount);
      if (isNaN(minDep) || minDep < 0) {
        return res.status(400).json({ message: "Minimum deposit must be a non-negative number" });
      }

      let maxReward: number | null = null;
      if (maxRewardAmount !== undefined && maxRewardAmount !== null && maxRewardAmount !== "") {
        maxReward = parseFloat(maxRewardAmount);
        if (isNaN(maxReward) || maxReward < 0) {
          return res.status(400).json({ message: "Max reward must be a non-negative number" });
        }
      }

      const symbol = typeof rewardSymbol === "string" && rewardSymbol.trim() ? rewardSymbol.trim().toUpperCase() : "USDT";

      const { data, error } = await supabaseAdmin
        .from("referral_settings")
        .upsert({
          id: 1,
          is_enabled: !!isEnabled,
          reward_type: rewardType,
          fixed_amount: fixed.toString(),
          percentage_rate: pct.toString(),
          min_deposit_amount: minDep.toString(),
          max_reward_amount: maxReward !== null ? maxReward.toString() : null,
          reward_symbol: symbol,
          updated_at: new Date().toISOString(),
          updated_by: req.user.id,
        })
        .select()
        .single();

      if (error) {
        return res.status(500).json({ message: "Failed to update referral settings" });
      }

      res.json(data);
    } catch (error) {
      console.error("Failed to update referral settings:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/admin/referrals — oversight list, newest first
  app.get("/api/admin/referrals", requireAuth, requireAdmin, async (_req, res) => {
    try {
      const { data: rows, error } = await supabaseAdmin
        .from("referrals")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) {
        return res.status(500).json({ message: "Failed to load referrals" });
      }

      const userIds = Array.from(new Set((rows || []).flatMap((r: any) => [r.referrer_id, r.referred_user_id])));
      const { data: users } = userIds.length
        ? await supabaseAdmin.from("users").select("id, username, email").in("id", userIds)
        : { data: [] as any[] };

      const userMap = new Map((users || []).map((u: any) => [u.id, u]));
      const enriched = (rows || []).map((r: any) => ({
        ...r,
        referrer: userMap.get(r.referrer_id) || null,
        referredUser: userMap.get(r.referred_user_id) || null,
      }));

      res.json({ referrals: enriched });
    } catch (error) {
      console.error("Failed to load referrals:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/referrals/me — current user's own code, link, and referral stats
  app.get("/api/referrals/me", requireAuth, async (req, res) => {
    try {
      const userId = req.user.id;

      const { data: user, error: userError } = await supabaseAdmin
        .from("users")
        .select("referral_code")
        .eq("id", userId)
        .maybeSingle();

      if (userError) {
        return res.status(500).json({ message: "Failed to load profile" });
      }

      let referralCode = user?.referral_code;
      if (!referralCode) {
        referralCode = await generateReferralCode();
        const { error: updateError } = await supabaseAdmin
          .from("users")
          .update({ referral_code: referralCode })
          .eq("id", userId);
        if (updateError) {
          return res.status(500).json({ message: "Failed to generate referral code" });
        }
      }

      const { data: referred, error: referredError } = await supabaseAdmin
        .from("referrals")
        .select("id, referred_user_id, status, reward_amount, reward_symbol, created_at, rewarded_at")
        .eq("referrer_id", userId)
        .order("created_at", { ascending: false });

      if (referredError) {
        return res.status(500).json({ message: "Failed to load referral stats" });
      }

      const referredUserIds = (referred || []).map((r: any) => r.referred_user_id);
      const { data: referredUsers } = referredUserIds.length
        ? await supabaseAdmin.from("users").select("id, username, display_id").in("id", referredUserIds)
        : { data: [] as any[] };
      const referredUserMap = new Map((referredUsers || []).map((u: any) => [u.id, u]));

      const rewardedRows = (referred || []).filter((r: any) => r.status === "rewarded");
      const totalEarned = rewardedRows.reduce((sum: number, r: any) => sum + (parseFloat(r.reward_amount) || 0), 0);

      res.json({
        referralCode,
        totalReferred: (referred || []).length,
        totalRewarded: rewardedRows.length,
        totalPending: (referred || []).length - rewardedRows.length,
        totalEarned: totalEarned.toFixed(8),
        rewardSymbol: rewardedRows[0]?.reward_symbol || "USDT",
        referrals: (referred || []).map((r: any) => ({
          ...r,
          referredUser: referredUserMap.get(r.referred_user_id) || null,
        })),
      });
    } catch (error) {
      console.error("Failed to load referral info:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/referrals/link — called once right after a brand-new user profile is created
  app.post("/api/referrals/link", requireAuth, async (req, res) => {
    try {
      const userId = req.user.id;
      const codeInput = typeof req.body?.referralCode === "string" ? req.body.referralCode.trim().toUpperCase() : "";

      if (!codeInput) {
        return res.status(400).json({ message: "referralCode is required" });
      }

      // Already linked (or self-referred previously) — treat as a no-op success
      const { data: existingReferral } = await supabaseAdmin
        .from("referrals")
        .select("id")
        .eq("referred_user_id", userId)
        .maybeSingle();

      if (existingReferral) {
        return res.json({ message: "Already linked" });
      }

      const { data: referrer, error: referrerError } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("referral_code", codeInput)
        .maybeSingle();

      if (referrerError || !referrer) {
        return res.status(400).json({ message: "Invalid referral code" });
      }

      if (referrer.id === userId) {
        return res.status(400).json({ message: "You can't refer yourself" });
      }

      const { error: insertError } = await supabaseAdmin.from("referrals").insert({
        referrer_id: referrer.id,
        referred_user_id: userId,
        referral_code: codeInput,
        status: "pending",
      });

      if (insertError) {
        // Unique constraint race (e.g. double-submit) — not a real failure
        if ((insertError as any).code === "23505") {
          return res.json({ message: "Already linked" });
        }
        return res.status(500).json({ message: "Failed to link referral" });
      }

      res.status(201).json({ message: "Referral linked" });
    } catch (error) {
      console.error("Failed to link referral:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
