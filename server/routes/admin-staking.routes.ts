import type { Express } from "express";
import { requireAuth, requireAdmin, supabaseAdmin } from "./middleware";
import { z } from "zod";
import { logAuditEvent, getClientIP, getUserAgent } from "../utils/security";

export default function registerAdminStakingRoutes(app: Express) {

  // ───────────────────────────────────────────────────────────────────
  // GET /api/admin/staking/positions — all staking positions (with user info)
  // ───────────────────────────────────────────────────────────────────
  app.get("/api/admin/staking/positions", requireAuth, requireAdmin, async (req, res) => {
    try {
      const status = req.query.status as string | undefined; // active, completed, or empty for all
      const userId = req.query.userId as string | undefined;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = (page - 1) * limit;

      let query = supabaseAdmin
        .from("staking_positions")
        .select("*, users!inner(id, email, full_name, username, display_id)", { count: "exact" });

      if (status) {
        query = query.eq("status", status);
      }
      if (userId) {
        query = query.eq("user_id", userId);
      }

      query = query.order("start_date", { ascending: false }).range(offset, offset + limit - 1);

      const { data: positions, error, count } = await query;

      if (error) {
        // Fallback: try without join if foreign key not set up
        const fallbackQuery = supabaseAdmin
          .from("staking_positions")
          .select("*", { count: "exact" });

        if (status) fallbackQuery.eq("status", status);
        if (userId) fallbackQuery.eq("user_id", userId);
        fallbackQuery.order("start_date", { ascending: false }).range(offset, offset + limit - 1);

        const { data: fbPositions, error: fbError, count: fbCount } = await fallbackQuery;

        if (fbError) {
          return res.status(500).json({ message: "Failed to fetch staking positions", error: fbError.message });
        }

        // Manually fetch user info
        const userIds = Array.from(new Set((fbPositions || []).map((p: any) => p.user_id)));
        const { data: users } = await supabaseAdmin
          .from("users")
          .select("id, email, full_name, username, display_id")
          .in("id", userIds);

        const userMap = new Map((users || []).map((u: any) => [u.id, u]));

        const enriched = (fbPositions || []).map((p: any) => ({
          id: p.id,
          userId: p.user_id,
          symbol: p.symbol,
          amount: p.amount,
          apy: p.apy,
          duration: p.duration,
          startDate: p.start_date,
          endDate: p.end_date,
          status: p.status,
          user: userMap.get(p.user_id) || null,
        }));

        return res.json({
          positions: enriched,
          total: fbCount || 0,
          page,
          limit,
        });
      }

      const transformed = (positions || []).map((p: any) => ({
        id: p.id,
        userId: p.user_id,
        symbol: p.symbol,
        amount: p.amount,
        apy: p.apy,
        duration: p.duration,
        startDate: p.start_date,
        endDate: p.end_date,
        status: p.status,
        user: p.users || null,
      }));

      res.json({
        positions: transformed,
        total: count || 0,
        page,
        limit,
      });
    } catch (error) {
      console.error("Admin staking positions error:", error);
      res.status(500).json({ message: "Failed to fetch staking positions" });
    }
  });

  // ───────────────────────────────────────────────────────────────────
  // GET /api/admin/staking/stats — aggregated staking statistics
  // ───────────────────────────────────────────────────────────────────
  app.get("/api/admin/staking/stats", requireAuth, requireAdmin, async (req, res) => {
    try {
      const [activeResult, completedResult, allResult] = await Promise.all([
        supabaseAdmin.from("staking_positions").select("amount").eq("status", "active"),
        supabaseAdmin.from("staking_positions").select("amount").eq("status", "completed"),
        supabaseAdmin.from("staking_positions").select("user_id, amount, status, apy, duration"),
      ]);

      const activePositions = activeResult.data || [];
      const completedPositions = completedResult.data || [];
      const allPositions = allResult.data || [];

      const totalActiveStaked = activePositions.reduce(
        (sum: number, p: any) => sum + parseFloat(p.amount || "0"), 0
      );
      const totalCompletedStaked = completedPositions.reduce(
        (sum: number, p: any) => sum + parseFloat(p.amount || "0"), 0
      );

      // Calculate total rewards paid
      const totalRewardsPaid = completedPositions.reduce((sum: number, p: any) => {
        // We don't have the individual reward in this query, so estimate from allPositions
        return sum;
      }, 0);

      // More accurate reward calculation from completed positions
      let estimatedRewardsPaid = 0;
      for (const p of (allResult.data || []).filter((x: any) => x.status === "completed")) {
        const amount = parseFloat(p.amount || "0");
        const apy = parseFloat(p.apy || "0");
        const duration = parseInt(p.duration || "0");
        const dailyRate = apy / 100 / 365;
        estimatedRewardsPaid += amount * dailyRate * duration;
      }

      const uniqueStakers = new Set(allPositions.map((p: any) => p.user_id)).size;
      const activeStakers = new Set(activePositions.map((p: any) => p.user_id) as unknown as string[]).size;

      // Average APY of active positions
      const avgApy = activePositions.length > 0
        ? allPositions
            .filter((p: any) => p.status === "active")
            .reduce((sum: number, p: any) => sum + parseFloat(p.apy || "0"), 0) / activePositions.length
        : 0;

      // Average duration
      const avgDuration = allPositions.length > 0
        ? allPositions.reduce((sum: number, p: any) => sum + parseInt(p.duration || "0"), 0) / allPositions.length
        : 0;

      res.json({
        activePositions: activePositions.length,
        completedPositions: completedPositions.length,
        totalPositions: allPositions.length,
        totalActiveStaked,
        totalCompletedStaked,
        estimatedRewardsPaid: Math.round(estimatedRewardsPaid * 100) / 100,
        uniqueStakers,
        activeStakers,
        averageApy: Math.round(avgApy * 100) / 100,
        averageDuration: Math.round(avgDuration),
      });
    } catch (error) {
      console.error("Admin staking stats error:", error);
      res.status(500).json({ message: "Failed to fetch staking stats" });
    }
  });

  // ───────────────────────────────────────────────────────────────────
  // PUT /api/admin/staking/positions/:id/status — update position status
  // ───────────────────────────────────────────────────────────────────
  app.put("/api/admin/staking/positions/:id/status", requireAuth, requireAdmin, async (req, res) => {
    try {
      const positionId = parseInt(req.params.id);
      const { status } = z.object({ status: z.enum(["active", "completed"]) }).parse(req.body);

      // Get current position
      const { data: position, error: fetchError } = await supabaseAdmin
        .from("staking_positions")
        .select("*")
        .eq("id", positionId)
        .single();

      if (fetchError || !position) {
        return res.status(404).json({ message: "Staking position not found" });
      }

      if (position.status === status) {
        return res.status(400).json({ message: `Position is already ${status}` });
      }

      // If completing early, handle the financial settlement
      if (status === "completed" && position.status === "active") {
        const stakeAmount = parseFloat(position.amount);
        const apy = parseFloat(position.apy);
        const duration = position.duration;

        const startDate = new Date(position.start_date);
        const now = new Date();
        const actualDays = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        const effectiveDays = Math.min(actualDays, duration);

        const dailyRate = apy / 100 / 365;
        const totalInterest = stakeAmount * dailyRate * effectiveDays;
        const totalReturn = stakeAmount + totalInterest;

        // Update portfolio
        const { data: portfolio } = await supabaseAdmin
          .from("portfolios")
          .select("available, frozen")
          .eq("user_id", position.user_id)
          .eq("symbol", "USDT")
          .single();

        if (portfolio) {
          const currentFrozen = parseFloat(portfolio.frozen || "0");
          const newFrozen = Math.max(0, currentFrozen - stakeAmount);
          const currentAvailable = parseFloat(portfolio.available || "0");

          await supabaseAdmin
            .from("portfolios")
            .update({
              frozen: newFrozen.toString(),
              available: (currentAvailable + totalReturn).toString(),
            })
            .eq("user_id", position.user_id)
            .eq("symbol", "USDT");

          // Create transaction record
          await supabaseAdmin.from("transactions").insert({
            user_id: position.user_id,
            type: "staking_reward",
            symbol: "USDT",
            amount: totalReturn.toString(),
            status: "completed",
            metadata: {
              staking_position_id: position.id,
              original_stake: stakeAmount,
              profit: totalInterest,
              effective_days: effectiveDays,
              duration,
              apy,
              admin_completed: true,
              admin_id: req.user.id,
            },
          });
        }
      }

      // If reactivating from completed
      if (status === "active" && position.status === "completed") {
        const stakeAmount = parseFloat(position.amount);

        const { data: portfolio } = await supabaseAdmin
          .from("portfolios")
          .select("available, frozen")
          .eq("user_id", position.user_id)
          .eq("symbol", "USDT")
          .single();

        if (portfolio) {
          const currentAvailable = parseFloat(portfolio.available || "0");
          if (currentAvailable < stakeAmount) {
            return res.status(400).json({ message: "User has insufficient USDT balance to reactivate this position" });
          }

          await supabaseAdmin
            .from("portfolios")
            .update({
              available: (currentAvailable - stakeAmount).toString(),
              frozen: (parseFloat(portfolio.frozen || "0") + stakeAmount).toString(),
            })
            .eq("user_id", position.user_id)
            .eq("symbol", "USDT");
        }
      }

      const { error: updateError } = await supabaseAdmin
        .from("staking_positions")
        .update({ status })
        .eq("id", positionId);

      if (updateError) {
        return res.status(500).json({ message: "Failed to update position status", error: updateError.message });
      }

      await logAuditEvent({
        userId: req.user.id,
        action: "ADMIN_STAKING_STATUS_CHANGE",
        details: { positionId, oldStatus: position.status, newStatus: status, targetUserId: position.user_id },
        ipAddress: getClientIP(req),
        userAgent: getUserAgent(req),
        status: "success",
      });

      res.json({ message: `Position ${positionId} updated to ${status}` });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Admin staking status update error:", error);
      res.status(500).json({ message: "Failed to update staking position status" });
    }
  });

  // ───────────────────────────────────────────────────────────────────
  // PUT /api/admin/staking/positions/:id/extend — extend position duration
  // ───────────────────────────────────────────────────────────────────
  app.put("/api/admin/staking/positions/:id/extend", requireAuth, requireAdmin, async (req, res) => {
    try {
      const positionId = parseInt(req.params.id);
      const { additionalDays } = z.object({
        additionalDays: z.number().min(1).max(365),
      }).parse(req.body);

      const { data: position, error: fetchError } = await supabaseAdmin
        .from("staking_positions")
        .select("*")
        .eq("id", positionId)
        .single();

      if (fetchError || !position) {
        return res.status(404).json({ message: "Staking position not found" });
      }

      if (position.status !== "active") {
        return res.status(400).json({ message: "Only active positions can be extended" });
      }

      const currentEndDate = new Date(position.end_date);
      const newEndDate = new Date(currentEndDate.getTime() + additionalDays * 24 * 60 * 60 * 1000);
      const newDuration = position.duration + additionalDays;

      const { error: updateError } = await supabaseAdmin
        .from("staking_positions")
        .update({
          end_date: newEndDate.toISOString(),
          duration: newDuration,
        })
        .eq("id", positionId);

      if (updateError) {
        return res.status(500).json({ message: "Failed to extend position", error: updateError.message });
      }

      await logAuditEvent({
        userId: req.user.id,
        action: "ADMIN_STAKING_EXTEND",
        details: {
          positionId,
          additionalDays,
          oldEndDate: position.end_date,
          newEndDate: newEndDate.toISOString(),
          oldDuration: position.duration,
          newDuration,
          targetUserId: position.user_id,
        },
        ipAddress: getClientIP(req),
        userAgent: getUserAgent(req),
        status: "success",
      });

      res.json({ message: `Position ${positionId} extended by ${additionalDays} days`, newEndDate, newDuration });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Admin staking extend error:", error);
      res.status(500).json({ message: "Failed to extend staking position" });
    }
  });

  // ───────────────────────────────────────────────────────────────────
  // DELETE /api/admin/staking/positions/:id — delete (cancel) a position
  // ───────────────────────────────────────────────────────────────────
  app.delete("/api/admin/staking/positions/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const positionId = parseInt(req.params.id);

      const { data: position, error: fetchError } = await supabaseAdmin
        .from("staking_positions")
        .select("*")
        .eq("id", positionId)
        .single();

      if (fetchError || !position) {
        return res.status(404).json({ message: "Staking position not found" });
      }

      // If active, return funds to user
      if (position.status === "active") {
        const stakeAmount = parseFloat(position.amount);
        const { data: portfolio } = await supabaseAdmin
          .from("portfolios")
          .select("available, frozen")
          .eq("user_id", position.user_id)
          .eq("symbol", "USDT")
          .single();

        if (portfolio) {
          const currentFrozen = parseFloat(portfolio.frozen || "0");
          const newFrozen = Math.max(0, currentFrozen - stakeAmount);
          const currentAvailable = parseFloat(portfolio.available || "0");

          await supabaseAdmin
            .from("portfolios")
            .update({
              frozen: newFrozen.toString(),
              available: (currentAvailable + stakeAmount).toString(),
            })
            .eq("user_id", position.user_id)
            .eq("symbol", "USDT");
        }
      }

      const { error: deleteError } = await supabaseAdmin
        .from("staking_positions")
        .delete()
        .eq("id", positionId);

      if (deleteError) {
        return res.status(500).json({ message: "Failed to delete position", error: deleteError.message });
      }

      await logAuditEvent({
        userId: req.user.id,
        action: "ADMIN_STAKING_DELETE",
        details: { positionId, amount: position.amount, userId: position.user_id, status: position.status },
        ipAddress: getClientIP(req),
        userAgent: getUserAgent(req),
        status: "success",
      });

      res.json({ message: `Position ${positionId} deleted successfully` });
    } catch (error) {
      console.error("Admin staking delete error:", error);
      res.status(500).json({ message: "Failed to delete staking position" });
    }
  });

}
