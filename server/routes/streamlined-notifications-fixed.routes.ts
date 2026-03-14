import type { Express } from "express";
import { requireAuth, requireAdmin, supabaseAdmin } from "./middleware";
import { sendPushToSubscription, cleanupExpiredSubscriptions } from "./push.routes";

const BATCH_SIZE = 100;

async function getUsersByRole(options: {
  role?: string;
  isVerified?: boolean;
  isActive?: boolean;
}) {
  let allUsers: any[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabaseAdmin
      .from("users")
      .select("id, email, full_name, role, is_verified, is_active")
      .range(from, from + BATCH_SIZE - 1);

    if (options.role && options.role !== "all") {
      query = query.eq("role", options.role);
    }
    if (typeof options.isVerified === "boolean") {
      query = query.eq("is_verified", options.isVerified);
    }
    if (typeof options.isActive === "boolean") {
      query = query.eq("is_active", options.isActive);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allUsers = allUsers.concat(data);
      from += BATCH_SIZE;
    }
  }

  return allUsers;
}

async function getMultiDeviceSubscriptionMap(userIds: string[]) {
  const map = new Map<string, Array<{ endpoint: string; keys: any }>>();

  for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
    const batch = userIds.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabaseAdmin
      .from("push_subscriptions")
      .select("user_id, endpoint, keys")
      .in("user_id", batch);

    if (error || !data) continue;

    for (const row of data) {
      const existing = map.get(row.user_id) || [];
      existing.push({ endpoint: row.endpoint, keys: row.keys });
      map.set(row.user_id, existing);
    }
  }

  return map;
}

async function sendNotificationToUsers(
  users: any[],
  title: string,
  body: string,
  channel: string = "push",
  deeplinkUrl?: string
) {
  const userIds = users.map(u => u.id);
  const subs = await getMultiDeviceSubscriptionMap(userIds);

  let sentCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  const errors: string[] = [];
  const expiredEndpoints: string[] = [];

  if (channel !== "push") {
    return { sentCount: 0, failedCount: users.length, skippedCount: 0, errors: ["Only push channel is supported"] };
  }

  const payload = JSON.stringify({
    title,
    body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: {
      sentAt: new Date().toISOString(),
      ...(deeplinkUrl ? { url: deeplinkUrl } : {}),
    },
    tag: `becxus-broadcast-${Date.now()}`,
  });

  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);

    const promises = batch.map(async (user) => {
      const userSubs = subs.get(user.id);
      if (!userSubs || userSubs.length === 0) {
        skippedCount++;
        return;
      }

      for (const sub of userSubs) {
        try {
          const result = await sendPushToSubscription(sub, payload);
          if (result.success) {
            sentCount++;
          } else {
            failedCount++;
            if (result.expired) {
              expiredEndpoints.push(sub.endpoint);
            }
          }
        } catch (err: any) {
          failedCount++;
          errors.push(`User ${user.id}: ${err?.message || "Push send error"}`);
        }
      }
    });

    await Promise.all(promises);

    if (i + BATCH_SIZE < users.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  await cleanupExpiredSubscriptions(expiredEndpoints);

  return { sentCount, failedCount, skippedCount, errors };
}

export default function registerStreamlinedNotificationsRoutes(app: Express) {
  // Health check
  app.get("/api/admin/notifications/streamlined/health", (_req, res) => {
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      service: "streamlined-notifications",
    });
  });

  // ──────────────────────────────────────────────
  // POST /send — Send notification (upgraded with filters + deeplink)
  // ──────────────────────────────────────────────
  app.post("/api/admin/notifications/streamlined/send", requireAuth, requireAdmin, async (req, res) => {
    const { title, body, role, channel, deeplink_url, is_verified, is_active } = req.body || {};

    if (!title || !body) {
      return res.status(400).json({ message: "Title and body are required" });
    }
    if (title.length > 100) {
      return res.status(400).json({ message: "Title must be 100 characters or less" });
    }
    if (body.length > 500) {
      return res.status(400).json({ message: "Body must be 500 characters or less" });
    }

    try {
      const users = await getUsersByRole({
        role,
        isVerified: typeof is_verified === "boolean" ? is_verified : undefined,
        isActive: typeof is_active === "boolean" ? is_active : undefined,
      });

      if (users.length === 0) {
        return res.json({
          success: true,
          totalUsers: 0,
          sentCount: 0,
          failedCount: 0,
          message: `No users found${role && role !== "all" ? ` with role: ${role}` : ""}`,
        });
      }

      const result = await sendNotificationToUsers(users, title, body, channel || "push", deeplink_url);

      await supabaseAdmin.from("broadcast_notifications").insert([{
        title,
        body,
        deeplink_url: deeplink_url || null,
        target_role: role || "all",
        total_users: users.length,
        sent_count: result.sentCount,
        failed_count: result.failedCount,
        status: "completed",
        sent_by: req.user?.id || null,
        sent_at: new Date().toISOString(),
      }]);

      res.json({
        success: true,
        totalUsers: users.length,
        sentCount: result.sentCount,
        failedCount: result.failedCount,
        skippedCount: result.skippedCount,
        errors: result.errors.slice(0, 10),
        message: `Notification sent to ${result.sentCount} device(s) across ${users.length} users (${result.skippedCount} without push enabled)`,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to send notifications" });
    }
  });

  // ──────────────────────────────────────────────
  // GET /stats — Notification statistics (upgraded with real data)
  // ──────────────────────────────────────────────
  app.get("/api/admin/notifications/streamlined/stats", requireAuth, requireAdmin, async (_req, res) => {
    try {
      const { count: totalUsers } = await supabaseAdmin
        .from("users")
        .select("*", { count: "exact", head: true });

      // Unique subscribers (distinct user_id)
      const { data: subData } = await supabaseAdmin
        .from("push_subscriptions")
        .select("user_id");
      const uniqueSubscribers = new Set((subData || []).map(s => s.user_id)).size;

      // Total subscriptions (all devices)
      const { count: totalSubscriptions } = await supabaseAdmin
        .from("push_subscriptions")
        .select("*", { count: "exact", head: true });

      // Platform breakdown
      const { data: platformData } = await supabaseAdmin
        .from("push_subscriptions")
        .select("platform");
      const platforms: Record<string, number> = {};
      (platformData || []).forEach(s => {
        const p = s.platform || "unknown";
        platforms[p] = (platforms[p] || 0) + 1;
      });

      // Recent broadcasts (last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data: recentBroadcasts } = await supabaseAdmin
        .from("broadcast_notifications")
        .select("sent_count, failed_count")
        .gte("sent_at", thirtyDaysAgo);

      let recentSuccess = 0, recentFailed = 0;
      (recentBroadcasts || []).forEach(b => {
        recentSuccess += b.sent_count || 0;
        recentFailed += b.failed_count || 0;
      });

      // Total broadcasts ever
      const { count: totalBroadcasts } = await supabaseAdmin
        .from("broadcast_notifications")
        .select("*", { count: "exact", head: true });

      res.json({
        totalUsers: totalUsers || 0,
        pushSubscribers: uniqueSubscribers,
        totalSubscriptions: totalSubscriptions || 0,
        platforms,
        totalBroadcasts: totalBroadcasts || 0,
        recentNotifications: (recentBroadcasts || []).length,
        recentSuccess,
        recentFailed,
        subscriptionRate: totalUsers ? ((uniqueSubscribers / totalUsers) * 100).toFixed(1) : "0",
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to get notification statistics" });
    }
  });

  // ──────────────────────────────────────────────
  // GET /history — Paginated broadcast history
  // ──────────────────────────────────────────────
  app.get("/api/admin/notifications/streamlined/history", requireAuth, requireAdmin, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
      const search = (req.query.search as string || "").trim();
      const status = req.query.status as string || "";
      const from = (page - 1) * limit;

      let countQuery = supabaseAdmin
        .from("broadcast_notifications")
        .select("*", { count: "exact", head: true });

      let dataQuery = supabaseAdmin
        .from("broadcast_notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .range(from, from + limit - 1);

      if (search) {
        countQuery = countQuery.ilike("title", `%${search}%`);
        dataQuery = dataQuery.ilike("title", `%${search}%`);
      }
      if (status) {
        countQuery = countQuery.eq("status", status);
        dataQuery = dataQuery.eq("status", status);
      }

      const [{ count }, { data, error }] = await Promise.all([countQuery, dataQuery]);
      if (error) throw new Error(error.message);

      res.json({
        broadcasts: data || [],
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to fetch history" });
    }
  });

  // ──────────────────────────────────────────────
  // GET /history/:id — Single broadcast detail with delivery logs
  // ──────────────────────────────────────────────
  app.get("/api/admin/notifications/streamlined/history/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid broadcast ID" });

      const { data: broadcast, error: bError } = await supabaseAdmin
        .from("broadcast_notifications")
        .select("*")
        .eq("id", id)
        .single();

      if (bError || !broadcast) return res.status(404).json({ message: "Broadcast not found" });

      const { data: logs } = await supabaseAdmin
        .from("broadcast_delivery_logs")
        .select("*")
        .eq("broadcast_id", id)
        .order("created_at", { ascending: false })
        .limit(100);

      const deliveryStats: Record<string, number> = {};
      (logs || []).forEach(log => {
        deliveryStats[log.status] = (deliveryStats[log.status] || 0) + 1;
      });

      res.json({
        broadcast,
        deliveryLogs: logs || [],
        deliveryStats,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to fetch broadcast details" });
    }
  });

  // ──────────────────────────────────────────────
  // GET /subscribers — Push subscriber list with user enrichment
  // ──────────────────────────────────────────────
  app.get("/api/admin/notifications/streamlined/subscribers", requireAuth, requireAdmin, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
      const from = (page - 1) * limit;

      const { count } = await supabaseAdmin
        .from("push_subscriptions")
        .select("*", { count: "exact", head: true });

      const { data, error } = await supabaseAdmin
        .from("push_subscriptions")
        .select("id, user_id, platform, user_agent, created_at, updated_at")
        .order("created_at", { ascending: false })
        .range(from, from + limit - 1);

      if (error) throw new Error(error.message);

      const userIds = [...new Set((data || []).map(s => s.user_id))];
      const { data: users } = await supabaseAdmin
        .from("users")
        .select("id, email, full_name")
        .in("id", userIds.length > 0 ? userIds : ["__none__"]);

      const userMap = new Map((users || []).map(u => [u.id, u]));

      const enriched = (data || []).map(sub => ({
        ...sub,
        user_email: userMap.get(sub.user_id)?.email || "Unknown",
        user_name: userMap.get(sub.user_id)?.full_name || "Unknown",
      }));

      res.json({
        subscribers: enriched,
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to fetch subscribers" });
    }
  });

  // ──────────────────────────────────────────────
  // PUT /templates/:id — Update notification template
  // ──────────────────────────────────────────────
  app.put("/api/admin/notifications/streamlined/templates/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid template ID" });

      const { name, title, body, deeplink_url } = req.body || {};
      if (!name || !title || !body) {
        return res.status(400).json({ message: "Name, title, and body are required" });
      }

      const { data, error } = await supabaseAdmin
        .from("notification_templates")
        .update({
          name,
          title,
          body,
          deeplink_url: deeplink_url || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to update template" });
    }
  });

  // ──────────────────────────────────────────────
  // DELETE /templates/:id — Delete notification template
  // ──────────────────────────────────────────────
  app.delete("/api/admin/notifications/streamlined/templates/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid template ID" });

      const { error } = await supabaseAdmin
        .from("notification_templates")
        .delete()
        .eq("id", id);

      if (error) throw new Error(error.message);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to delete template" });
    }
  });
}
