import type { Express } from "express";
import { requireAuth, requireAdmin, requireInternalTask, requireVerifiedUser, requireUnlockedWallet, supabaseAdmin } from "./middleware";
import { insertStakingPositionSchema } from "@shared/schema";
import { z } from "zod";
import { syncManager } from "../sync-manager";
import { logFinancialOperation, getClientIP, getUserAgent, logAuditEvent } from "../utils/security";

export default function registerStakingRoutes(app: Express) {
  // POST /api/staking — create staking position
  app.post("/api/staking", requireAuth, requireVerifiedUser, requireUnlockedWallet, async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Authorization header required" });
      }

      const token = authHeader.substring(7);
      let userId: string;

      try {
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !user) {
          return res.status(401).json({ message: "Invalid token" });
        }
        userId = user.id;
      } catch {
        return res.status(401).json({ message: "Invalid token" });
      }

      const validatedData = insertStakingPositionSchema.parse(req.body);
      (validatedData as any).userId = userId;

      // Validate against staking products table
      const stakeAmount = parseFloat(validatedData.amount);
      const stakeDuration = validatedData.duration;
      const stakeApy = parseFloat(validatedData.apy);

      const { data: product } = await supabaseAdmin
        .from("staking_products")
        .select("*")
        .eq("duration", stakeDuration)
        .eq("is_enabled", true)
        .single();

      if (product) {
        // Validate APY matches the product
        const productApy = parseFloat(product.apy);
        if (Math.abs(stakeApy - productApy) > 0.01) {
          return res.status(400).json({ message: "Invalid APY for the selected staking duration" });
        }
        // Validate amount within product limits
        const minAmount = parseFloat(product.min_amount);
        const maxAmount = parseFloat(product.max_amount);
        if (stakeAmount < minAmount) {
          return res.status(400).json({ message: `Minimum staking amount for this product is ${minAmount} USDT` });
        }
        if (stakeAmount > maxAmount) {
          return res.status(400).json({ message: `Maximum staking amount for this product is ${maxAmount} USDT` });
        }
      }

      // Check balance
      const { data: portfolio } = await supabaseAdmin
        .from("portfolios")
        .select("available, frozen")
        .eq("user_id", userId)
        .eq("symbol", "USDT")
        .single();

      if (!portfolio) {
        return res.status(400).json({ message: "USDT portfolio not found" });
      }

      const availableBalance = parseFloat(portfolio.available);

      if (availableBalance < stakeAmount) {
        return res.status(400).json({
          message: "Insufficient USDT balance",
          available: availableBalance,
          required: stakeAmount,
        });
      }

      // Deduct from available, add to frozen
      const { error: updateError } = await supabaseAdmin
        .from("portfolios")
        .update({
          available: (availableBalance - stakeAmount).toString(),
          frozen: (parseFloat(portfolio.frozen || "0") + stakeAmount).toString(),
        })
        .eq("user_id", userId)
        .eq("symbol", "USDT");

      if (updateError) {
        return res.status(500).json({ message: "Failed to update portfolio balance" });
      }

      const startDate = new Date();
      const endDate = new Date(startDate.getTime() + validatedData.duration * 24 * 60 * 60 * 1000);

      const { data: position, error: positionError } = await supabaseAdmin
        .from("staking_positions")
        .insert([
          {
            user_id: userId,
            symbol: validatedData.symbol,
            amount: validatedData.amount,
            apy: validatedData.apy,
            duration: validatedData.duration,
            start_date: startDate,
            end_date: endDate,
            status: validatedData.status,
          },
        ])
        .select()
        .single();

      if (positionError || !position) {
        // SECURITY: Rollback balance deduction if position creation fails
        await supabaseAdmin
          .from("portfolios")
          .update({
            available: availableBalance.toString(),
            frozen: (parseFloat(portfolio.frozen || "0")).toString(),
          })
          .eq("user_id", userId)
          .eq("symbol", "USDT");
        return res.status(500).json({
          message: "Failed to create staking position. Balance has been restored.",
        });
      }

      // Transaction record
      await supabaseAdmin.from("transactions").insert({
        user_id: userId,
        type: "stake",
        symbol: "USDT",
        amount: validatedData.amount,
        status: "completed",
        metadata: {
          staking_position_id: position.id,
          duration: validatedData.duration,
          apy: validatedData.apy,
        },
      });

      syncManager.syncStakingCreated(position);

      res.json({
        id: position.id,
        userId: position.user_id,
        symbol: position.symbol,
        amount: position.amount,
        apy: position.apy,
        duration: position.duration,
        startDate: position.start_date,
        endDate: position.end_date,
        status: position.status,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid staking data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create staking position" });
    }
  });

  // GET /api/staking/:userId
  app.get("/api/staking/:userId", requireAuth, async (req, res) => {
    try {
      const userId = req.params.userId;
      const currentUserId = req.user.id;
      const ipAddress = getClientIP(req);
      const userAgent = getUserAgent(req);

      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }

      // SECURITY FIX: Check if user is authorized to view these staking positions
      // Users can only view their own positions, admins can view anyone's
      const { data: currentUser } = await supabaseAdmin
        .from("users")
        .select("role")
        .eq("id", currentUserId)
        .maybeSingle();

      const isAdmin = currentUser?.role === "admin";

      if (!isAdmin && userId !== currentUserId) {
        await logAuditEvent({
          userId: currentUserId,
          action: 'STAKING_ACCESS_DENIED',
          details: { attemptedUserId: userId },
          ipAddress,
          userAgent,
          status: 'failure',
        });
        return res.status(403).json({ message: "Access denied - you can only view your own staking positions" });
      }

      const { data: positions, error } = await supabaseAdmin
        .from("staking_positions")
        .select("*")
        .eq("user_id", userId)
        .order("start_date", { ascending: false });

      if (error) {
        return res.status(500).json({ message: "Failed to fetch staking positions", code: error.code });
      }

      const transformed = (positions || []).map((p) => ({
        id: p.id,
        userId: p.user_id,
        symbol: p.symbol,
        amount: p.amount,
        apy: p.apy,
        duration: p.duration,
        startDate: p.start_date,
        endDate: p.end_date,
        status: p.status,
      }));

      res.json(transformed);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch staking positions" });
    }
  });

  // POST /api/staking/process-completed — admin or scheduled task
  app.post("/api/staking/process-completed", requireInternalTask, async (req, res) => {
    try {
      const now = new Date();

      const { data: completedPositions, error: fetchError } = await supabaseAdmin
        .from("staking_positions")
        .select("*")
        .eq("status", "active")
        .lte("end_date", now.toISOString());

      if (fetchError) {
        return res.status(500).json({ message: "Failed to fetch completed positions" });
      }

      if (!completedPositions || completedPositions.length === 0) {
        return res.json({ message: "No completed positions to process", processed: 0 });
      }

      let processedCount = 0;

      for (const position of completedPositions) {
        try {
          const stakeAmount = parseFloat(position.amount);
          const apy = parseFloat(position.apy);
          const duration = position.duration;

          const dailyRate = apy / 100 / 365;
          const totalInterest = stakeAmount * dailyRate * duration;
          const totalReturn = stakeAmount + totalInterest;

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

            await supabaseAdmin
              .from("staking_positions")
              .update({ status: "completed" })
              .eq("id", position.id);

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
                duration,
                apy,
              },
            });

            processedCount++;
          }
        } catch {
          // continue processing other positions
        }
      }

      res.json({
        message: `Processed ${processedCount} completed staking positions`,
        processed: processedCount,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to process completed staking positions" });
    }
  });
}
