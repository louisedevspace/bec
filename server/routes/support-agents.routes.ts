import type { Express } from "express";
import { requireAuth, requireAdmin, supabaseAdmin, invalidateUserCache } from "./middleware";
import { logAuditEvent, getClientIP, getUserAgent, validatePasswordPolicy } from "../utils/security";
import { upsertPasswordRecord } from "../utils/password-record";

const SUPPORT_ROLE = "support";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Columns returned to the admin panel for a support agent
const AGENT_COLUMNS = "id, email, username, full_name, role, is_active, created_at";

/**
 * Build a unique `users.username` from an email local-part.
 * `users.username` is NOT NULL UNIQUE, so collisions get a numeric suffix.
 */
async function buildUniqueUsername(email: string): Promise<string> {
  const base = (email.split("@")[0] || "agent").toLowerCase().replace(/[^a-z0-9._-]/g, "") || "agent";

  for (let attempt = 0; attempt < 25; attempt++) {
    const candidate = attempt === 0 ? base : `${base}${attempt}`;
    const { data } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("username", candidate)
      .maybeSingle();

    if (!data) return candidate;
  }

  return `${base}-${Date.now()}`;
}

/**
 * Attach per-agent activity stats (replies sent, last reply time) to agent rows.
 */
async function withAgentStats(agents: any[]) {
  if (agents.length === 0) return [];

  const ids = agents.map((a) => a.id);
  const { data: messages } = await supabaseAdmin
    .from("support_messages")
    .select("sender_id, created_at")
    .eq("sender_type", "admin")
    .in("sender_id", ids);

  const stats = new Map<string, { replies: number; lastReplyAt: string | null }>();
  for (const msg of messages || []) {
    const current = stats.get(msg.sender_id) || { replies: 0, lastReplyAt: null };
    current.replies += 1;
    if (!current.lastReplyAt || new Date(msg.created_at) > new Date(current.lastReplyAt)) {
      current.lastReplyAt = msg.created_at;
    }
    stats.set(msg.sender_id, current);
  }

  return agents.map((agent) => ({
    ...agent,
    replies: stats.get(agent.id)?.replies || 0,
    last_reply_at: stats.get(agent.id)?.lastReplyAt || null,
  }));
}

export default function registerSupportAgentRoutes(app: Express) {
  // GET /api/admin/support-agents — list all chat support accounts
  app.get("/api/admin/support-agents", requireAuth, requireAdmin, async (_req, res) => {
    try {
      const { data: agents, error } = await supabaseAdmin
        .from("users")
        .select(AGENT_COLUMNS)
        .eq("role", SUPPORT_ROLE)
        .order("created_at", { ascending: false });

      if (error) {
        return res.status(500).json({ message: "Failed to fetch support agents", error: error.message });
      }

      res.json({ agents: await withAgentStats(agents || []) });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/admin/support-agents — create a chat support account
  app.post("/api/admin/support-agents", requireAuth, requireAdmin, async (req, res) => {
    const adminUserId = req.user.id;
    const ipAddress = getClientIP(req);
    const userAgent = getUserAgent(req);

    try {
      const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      const fullName = typeof req.body?.fullName === "string" ? req.body.fullName.trim() : "";

      if (!email || !EMAIL_PATTERN.test(email)) {
        return res.status(400).json({ message: "A valid email address is required" });
      }
      if (!fullName) {
        return res.status(400).json({ message: "Agent name is required" });
      }

      const passwordValidation = validatePasswordPolicy(password);
      if (!passwordValidation.valid) {
        return res.status(400).json({ message: passwordValidation.message });
      }

      const { data: existing } = await supabaseAdmin
        .from("users")
        .select("id, role")
        .eq("email", email)
        .maybeSingle();

      if (existing) {
        return res.status(409).json({
          message: existing.role === SUPPORT_ROLE
            ? "A support agent with this email already exists"
            : "This email is already used by another account",
        });
      }

      // 1. Create the Supabase Auth identity (pre-confirmed — no email loop for staff)
      const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, role: SUPPORT_ROLE },
      });

      if (authError || !authUser?.user) {
        const duplicate = /already|registered|exists/i.test(authError?.message || "");
        return res.status(duplicate ? 409 : 500).json({
          message: duplicate
            ? "This email is already registered"
            : "Failed to create the support agent login",
          error: authError?.message,
        });
      }

      const agentId = authUser.user.id;

      // 2. Create the application profile row with the support role
      const { data: agent, error: insertError } = await supabaseAdmin
        .from("users")
        .insert({
          id: agentId,
          username: await buildUniqueUsername(email),
          email,
          password: "--supabase-auth--",
          full_name: fullName,
          role: SUPPORT_ROLE,
          is_active: true,
          is_verified: true,
        })
        .select(AGENT_COLUMNS)
        .single();

      if (insertError) {
        // Roll back the auth identity so the email stays free
        await supabaseAdmin.auth.admin.deleteUser(agentId).catch(() => {});
        return res.status(500).json({ message: "Failed to create support agent profile", error: insertError.message });
      }

      // 3. Store the password so admins can reveal it later from the vault
      try {
        await upsertPasswordRecord(agentId, password);
      } catch (err) {
        console.error("Failed to store support agent password record:", (err as Error).message);
      }

      await invalidateUserCache(agentId);

      await logAuditEvent({
        userId: adminUserId,
        action: "SUPPORT_AGENT_CREATED",
        resourceType: "users",
        resourceId: agentId,
        details: { email, fullName },
        ipAddress,
        userAgent,
        status: "success",
      });

      res.status(201).json({
        message: "Support agent created",
        agent: { ...agent, replies: 0, last_reply_at: null },
      });
    } catch (error) {
      res.status(500).json({ message: "Internal server error", error: (error as Error).message });
    }
  });

  // PATCH /api/admin/support-agents/:agentId — rename, activate/deactivate, reset password
  app.patch("/api/admin/support-agents/:agentId", requireAuth, requireAdmin, async (req, res) => {
    const adminUserId = req.user.id;

    try {
      const { agentId } = req.params;
      const { data: agent, error: lookupError } = await supabaseAdmin
        .from("users")
        .select("id, role")
        .eq("id", agentId)
        .maybeSingle();

      if (lookupError) {
        return res.status(500).json({ message: "Failed to load support agent" });
      }
      if (!agent || agent.role !== SUPPORT_ROLE) {
        return res.status(404).json({ message: "Support agent not found" });
      }

      const updates: Record<string, any> = {};
      if (typeof req.body?.fullName === "string") {
        const fullName = req.body.fullName.trim();
        if (!fullName) return res.status(400).json({ message: "Agent name cannot be empty" });
        updates.full_name = fullName;
      }
      if (typeof req.body?.isActive === "boolean") {
        updates.is_active = req.body.isActive;
      }

      const newPassword = typeof req.body?.password === "string" && req.body.password.length > 0
        ? req.body.password
        : null;

      if (newPassword) {
        const passwordValidation = validatePasswordPolicy(newPassword);
        if (!passwordValidation.valid) {
          return res.status(400).json({ message: passwordValidation.message });
        }

        const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(agentId, {
          password: newPassword,
        });
        if (authError) {
          return res.status(500).json({ message: "Failed to update the agent password" });
        }
        await upsertPasswordRecord(agentId, newPassword);
      }

      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabaseAdmin.from("users").update(updates).eq("id", agentId);
        if (updateError) {
          return res.status(500).json({ message: "Failed to update support agent", error: updateError.message });
        }
      }

      // Role/active state is cached per request — drop it so the change takes effect now
      await invalidateUserCache(agentId);

      await logAuditEvent({
        userId: adminUserId,
        action: "SUPPORT_AGENT_UPDATED",
        resourceType: "users",
        resourceId: agentId,
        details: { fields: Object.keys(updates), passwordReset: !!newPassword },
        ipAddress: getClientIP(req),
        userAgent: getUserAgent(req),
        status: "success",
      });

      const { data: updated } = await supabaseAdmin
        .from("users")
        .select(AGENT_COLUMNS)
        .eq("id", agentId)
        .maybeSingle();

      res.json({ message: "Support agent updated", agent: updated });
    } catch (error) {
      res.status(500).json({ message: "Internal server error", error: (error as Error).message });
    }
  });

  // DELETE /api/admin/support-agents/:agentId — remove the account (ticket history is kept)
  app.delete("/api/admin/support-agents/:agentId", requireAuth, requireAdmin, async (req, res) => {
    const adminUserId = req.user.id;

    try {
      const { agentId } = req.params;

      if (agentId === adminUserId) {
        return res.status(400).json({ message: "You cannot delete your own account" });
      }

      const { data: agent } = await supabaseAdmin
        .from("users")
        .select("id, email, full_name, role")
        .eq("id", agentId)
        .maybeSingle();

      if (!agent || agent.role !== SUPPORT_ROLE) {
        return res.status(404).json({ message: "Support agent not found" });
      }

      await supabaseAdmin.from("user_passwords").delete().eq("user_id", agentId);

      const { error: deleteError } = await supabaseAdmin.from("users").delete().eq("id", agentId);
      if (deleteError) {
        return res.status(500).json({ message: "Failed to delete support agent", error: deleteError.message });
      }

      try {
        await supabaseAdmin.auth.admin.deleteUser(agentId);
      } catch (authDeleteErr) {
        console.error("Failed to delete support agent auth user:", (authDeleteErr as Error).message);
      }

      await invalidateUserCache(agentId);

      await logAuditEvent({
        userId: adminUserId,
        action: "SUPPORT_AGENT_DELETED",
        resourceType: "users",
        resourceId: agentId,
        details: { email: agent.email, fullName: agent.full_name },
        ipAddress: getClientIP(req),
        userAgent: getUserAgent(req),
        status: "success",
      });

      res.json({ message: "Support agent deleted. Their replies stay in the ticket history." });
    } catch (error) {
      res.status(500).json({ message: "Internal server error", error: (error as Error).message });
    }
  });
}
