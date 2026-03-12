import type { Express } from "express";
import { hasAdminAccess, requireAdmin, requireAuth, supabaseAdmin } from "./middleware";
import { generateDisplayId } from "./helpers";
import supabase from "../supabaseClient";
import { hashPassword, verifyPassword, logAuditEvent, logFinancialOperation, getClientIP, getUserAgent } from "../utils/security";
import { encryptPasswordForAdminView } from "../utils/admin-password-vault";

async function upsertPasswordRecord(userId: string, password: string) {
  const hashedPassword = hashPassword(password);
  const encryptedPassword = encryptPasswordForAdminView(password);
  const timestamp = new Date().toISOString();

  const { data: existingRecord, error: checkError } = await supabaseAdmin
    .from("user_passwords")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (checkError) {
    throw new Error(checkError.message || "Failed to check password record");
  }

  if (existingRecord) {
    const { error } = await supabaseAdmin
      .from("user_passwords")
      .update({
        password: hashedPassword,
        plaintext_password: encryptedPassword,
        encrypted_at: timestamp,
        last_updated: timestamp,
      })
      .eq("user_id", userId);

    if (error) {
      throw new Error(error.message || "Failed to update password record");
    }

    return;
  }

  const { error } = await supabaseAdmin
    .from("user_passwords")
    .insert({
      user_id: userId,
      password: hashedPassword,
      plaintext_password: encryptedPassword,
      encrypted_at: timestamp,
      last_updated: timestamp,
    });

  if (error) {
    throw new Error(error.message || "Failed to create password record");
  }
}

export default function registerAuthRoutes(app: Express) {
  // POST /api/auth/store-password
  app.post("/api/auth/store-password", requireAuth, async (req, res) => {
    const { password } = req.body;
    const userId = req.user.id;
    const ipAddress = getClientIP(req);
    const userAgent = getUserAgent(req);

    try {
      if (!password || typeof password !== "string") {
        return res.status(400).json({ message: "Password is required" });
      }

      try {
        await upsertPasswordRecord(userId, password);
      } catch (error) {
        await logAuditEvent({
          userId,
          action: 'PASSWORD_STORE_FAILED',
          ipAddress,
          userAgent,
          status: 'failure',
          errorMessage: (error as Error).message,
        });
        return res.status(500).json({ message: "Failed to store password" });
      }

      await logAuditEvent({
        userId,
        action: 'PASSWORD_STORED',
        ipAddress,
        userAgent,
        status: 'success',
      });

      res.json({ message: "Password stored successfully" });
    } catch (err) {
      res.status(500).json({ message: "Failed to store password" });
    }
  });

  // POST /api/auth/login
  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    });
    if (error) return res.status(400).json({ message: error.message });
    res.json({ session: data.session, user: data.user });
  });

  // POST /api/auth/logout
  app.post("/api/auth/logout", (_req, res) => {
    res.json({ message: "Logged out" });
  });

  // GET /api/auth/me
  app.get("/api/auth/me", requireAuth, async (req, res) => {
    res.json({ user: req.user });
  });

  // POST /api/signup-profile — upsert user profile after login
  app.post("/api/signup-profile", requireAuth, async (req, res) => {
    const { full_name, phone } = req.body;
    const supabaseUserId = req.user.id;

    try {
      const { data: existingUser, error: checkError } = await supabaseAdmin
        .from("users")
        .select("id, display_id")
        .eq("id", supabaseUserId)
        .maybeSingle();

      if (checkError) {
        return res
          .status(500)
          .json({ message: "Database error", error: checkError.message });
      }

      let displayId = existingUser?.display_id;
      if (!displayId) {
        displayId = await generateDisplayId();
      }

      // User role is always 'user' for self-registration
      // Admin accounts must be created through database seeding or admin panel
      const userRole = "user";

      const { error } = await supabaseAdmin.from("users").upsert(
        [
          {
            id: supabaseUserId,
            username: (req.user.email || "").split("@")[0],
            email: req.user.email,
            password: "--supabase-auth--",
            full_name,
            phone,
            role: userRole,
            is_active: true,
            is_verified: false,
            credit_score: 0.60,
            display_id: displayId,
          },
        ],
        { onConflict: "id" }
      );

      if (error) {
        console.error("signup-profile insert error:", JSON.stringify(error));
        return res
          .status(500)
          .json({ message: "Insert error", error: error.message, details: error.details, code: error.code });
      }

      // Create default portfolios for major cryptos
      const defaultPortfolios = ["BTC", "USDT", "ETH"];
      for (const symbol of defaultPortfolios) {
        const { data: existing } = await supabaseAdmin
          .from("portfolios")
          .select("id")
          .eq("user_id", supabaseUserId)
          .eq("symbol", symbol)
          .maybeSingle();

        if (!existing) {
          await supabaseAdmin.from("portfolios").insert({
            user_id: supabaseUserId,
            symbol,
            available: "0.00000000",
            frozen: "0.00000000",
          });
        }
      }

      res.status(201).json({ message: "Profile upserted" });
    } catch (err) {
      res
        .status(500)
        .json({ message: "Server error", error: (err as Error).message });
    }
  });

  // GET /api/user-profile — current user's profile
  app.get("/api/user-profile", requireAuth, async (req, res) => {
    const supabaseUserId = req.user.id;

    try {
      const { data: customUser, error: customError } = await supabase
        .from("users")
        .select("*")
        .eq("id", supabaseUserId)
        .maybeSingle();

      if (customError) {
        return res
          .status(500)
          .json({ message: "DB error", error: customError.message });
      }

      if (!customUser) {
        const { data: newUser, error: createError } = await supabase
          .from("users")
          .insert({
            id: supabaseUserId,
            email: req.user.email || "unknown@email.com",
            full_name: req.user.email?.split("@")[0] || "User",
            role: "user",
          })
          .select()
          .single();

        if (createError) {
          return res
            .status(500)
            .json({
              message: "Failed to create profile",
              error: createError.message,
            });
        }

        return res.json(newUser);
      }

      res.json(customUser);
    } catch (err) {
      res
        .status(500)
        .json({ message: "Server error", error: (err as Error).message });
    }
  });

  // DELETE /api/user/delete-account
  app.delete("/api/user/delete-account", requireAuth, async (req, res) => {
    try {
      const supabaseUserId = req.user.id;

      const { data: currentUser } = await supabaseAdmin
        .from("users")
        .select("role")
        .eq("id", supabaseUserId)
        .maybeSingle();

      if (currentUser?.role === "admin") {
        return res
          .status(403)
          .json({
            message: "Admin accounts cannot be deleted through this endpoint",
          });
      }

      const tablesToClean = [
        "portfolios",
        "transactions",
        "trades",
        "staking_positions",
        "loan_applications",
        "deposit_requests",
        "withdraw_requests",
        "kyc_documents",
        "support_messages",
        "user_passwords",
      ];

      for (const table of tablesToClean) {
        try {
          await supabaseAdmin
            .from(table)
            .delete()
            .eq("user_id", supabaseUserId);
        } catch {
          // continue
        }
      }

      const { error: deleteUserError } = await supabaseAdmin
        .from("users")
        .delete()
        .eq("id", supabaseUserId);

      if (deleteUserError) {
        return res
          .status(500)
          .json({ message: "Failed to delete user account" });
      }

      res.json({ message: "Account deleted successfully" });
    } catch (error) {
      res
        .status(500)
        .json({ message: "Server error", error: (error as Error).message });
    }
  });

  // GET /api/users/:userId — user info
  app.get("/api/users/:userId", requireAuth, async (req, res) => {
    try {
      const requestedUserId = req.params.userId;
      if (!requestedUserId) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      const currentUserId = req.user.id;
      const isAdmin = await hasAdminAccess(currentUserId);

      if (!isAdmin && requestedUserId !== currentUserId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { data: user, error } = await supabaseAdmin
        .from("users")
        .select("*")
        .eq("id", requestedUserId)
        .single();

      if (error || !user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // POST /api/save-user-password
  app.post("/api/save-user-password", requireAuth, async (req, res) => {
    try {
      const { password } = req.body;
      const userId = req.user.id;
      const ipAddress = getClientIP(req);
      const userAgent = getUserAgent(req);

      if (!password || typeof password !== "string") {
        return res.status(400).json({ message: "Missing password" });
      }

      await upsertPasswordRecord(userId, password);

      await logAuditEvent({
        userId,
        action: 'PASSWORD_SAVED',
        ipAddress,
        userAgent,
        status: 'success',
      });

      return res.json({ message: "Password saved successfully" });
    } catch (error) {
      res
        .status(500)
        .json({ message: "Server error", error: (error as Error).message });
    }
  });

  // POST /api/update-user-password
  app.post("/api/update-user-password", requireAuth, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const ipAddress = getClientIP(req);
      const userAgent = getUserAgent(req);

      if (!currentPassword || !newPassword) {
        return res
          .status(400)
          .json({ message: "Missing current password or new password" });
      }
      if (newPassword.length < 6) {
        return res
          .status(400)
          .json({ message: "New password must be at least 6 characters long" });
      }

      const userId = req.user.id;
      const userEmail = req.user.email;
      if (!userEmail) {
        return res.status(400).json({ message: "User email not found" });
      }

      const { data: currentPasswordData, error: checkError } =
        await supabaseAdmin
          .from("user_passwords")
          .select("password")
          .eq("user_id", userId)
          .single();

      if (checkError) {
        return res.status(500).json({ message: "Database error" });
      }

      // Verify the current password using hash comparison
      if (
        !currentPasswordData ||
        !verifyPassword(currentPassword, currentPasswordData.password)
      ) {
        await logAuditEvent({
          userId,
          action: 'PASSWORD_UPDATE_FAILED',
          details: { reason: 'incorrect_current_password' },
          ipAddress,
          userAgent,
          status: 'failure',
        });
        return res
          .status(400)
          .json({ message: "Current password is incorrect" });
      }

      const { error: authUpdateError } =
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          password: newPassword,
        });

      if (authUpdateError) {
        return res
          .status(500)
          .json({ message: "Failed to update authentication password" });
      }

      await upsertPasswordRecord(userId, newPassword);

      await logAuditEvent({
        userId,
        action: 'PASSWORD_CHANGED',
        ipAddress,
        userAgent,
        status: 'success',
      });

      res.json({ message: "Password updated successfully" });
    } catch (error) {
      res
        .status(500)
        .json({ message: "Server error", error: (error as Error).message });
    }
  });

  // POST /api/admin/update-user-password — admin changes any user's password
  app.post("/api/admin/update-user-password", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { userId, newPassword } = req.body;
      const ipAddress = getClientIP(req);
      const userAgent = getUserAgent(req);

      if (!userId || !newPassword) {
        return res
          .status(400)
          .json({ message: "User ID and new password are required" });
      }
      if (newPassword.length < 6) {
        return res
          .status(400)
          .json({ message: "Password must be at least 6 characters long" });
      }

      const currentUserId = req.user.id;

      const { error: authUpdateError } =
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          password: newPassword,
        });

      if (authUpdateError) {
        return res
          .status(500)
          .json({ message: "Failed to update authentication password" });
      }

      await upsertPasswordRecord(userId, newPassword);

      await logAuditEvent({
        userId: currentUserId,
        action: 'ADMIN_PASSWORD_CHANGED',
        details: { targetUserId: userId },
        ipAddress,
        userAgent,
        status: 'success',
      });

      res.json({ message: "Password updated successfully" });
    } catch (error) {
      res
        .status(500)
        .json({ message: "Server error", error: (error as Error).message });
    }
  });
}
