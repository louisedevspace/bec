import type { Express } from "express";
import { requireAuth, requireAdmin, supabaseAdmin } from "./middleware";
import webpush from "web-push";

// Batch size for processing large user bases
const BATCH_SIZE = 100;

async function getAllUsers() {
  let allUsers: any[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabaseAdmin
      .from("users")
      .select("id, email, full_name, role, is_verified, is_active")
      .range(from, from + BATCH_SIZE - 1);

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

async function getPushSubscriptionMap(userIds: string[]) {
  const { data, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("*")
    .in("user_id", userIds);

  if (error) return new Map<string, any>();
  
  const map = new Map<string, any>();
  (data || []).forEach((row: any) => map.set(row.user_id, { endpoint: row.endpoint, keys: row.keys }));
  return map;
}

async function sendNotificationToUsers(users: any[], title: string, body: string, deeplink?: string) {
  const userIds = users.map(u => u.id);
  const subs = await getPushSubscriptionMap(userIds);
  
  let sentCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  // Process users in batches for better performance
  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);
    
    // Process each user in the batch
    for (const user of batch) {
      try {
        const uid = user.id;
        const sub = subs.get(uid);
        
        if (sub) {
          try {
            const payload = JSON.stringify({ 
              title, 
              body, 
              data: { url: deeplink || "/", sentAt: new Date().toISOString() } 
            });
            await webpush.sendNotification(sub, payload);
            sentCount++;
          } catch (err: any) {
            failedCount++;
            const errorMsg = err?.message || "Push send error";
            errors.push(`User ${uid}: ${errorMsg}`);
          }
        } else {
          // User doesn't have push subscription, count as failed but don't log error
          failedCount++;
        }
      } catch (userError: any) {
        failedCount++;
        errors.push(`User ${user.id}: ${userError.message}`);
      }
    }

    // Small delay between batches to prevent overwhelming the system
    if (i + BATCH_SIZE < users.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return { sentCount, failedCount, errors };
}

export default function registerSimpleNotificationsRoutes(app: Express) {
  // Send notification to all users
  app.post("/api/admin/notifications/send-to-all", requireAuth, requireAdmin, async (req, res) => {
    const { title, body, deeplink } = req.body || {};
    
    if (!title || !body) {
      return res.status(400).json({ 
        message: "Title and body are required" 
      });
    }

    if (title.length > 100) {
      return res.status(400).json({ 
        message: "Title must be 100 characters or less" 
      });
    }

    if (body.length > 500) {
      return res.status(400).json({ 
        message: "Body must be 500 characters or less" 
      });
    }

    try {
      // Get all users
      const users = await getAllUsers();
      
      if (users.length === 0) {
        return res.json({ 
          success: true, 
          totalUsers: 0, 
          sentCount: 0, 
          failedCount: 0,
          message: "No users to notify" 
        });
      }

      // Send notifications to all users
      const result = await sendNotificationToUsers(users, title, body, deeplink);

      // Log the broadcast for audit purposes
      await supabaseAdmin.from("notification_logs").insert([{
        campaign_id: null,
        user_id: null,
        channel: "push",
        status: "broadcast_completed",
        created_at: new Date().toISOString()
      }]);

      res.json({ 
        success: true, 
        totalUsers: users.length,
        sentCount: result.sentCount,
        failedCount: result.failedCount,
        errors: result.errors.slice(0, 10), // Limit errors returned
        message: `Notification sent to ${result.sentCount} users successfully`
      });

    } catch (error: any) {
      console.error("Error sending notification to all users:", error);
      res.status(500).json({ 
        message: error.message || "Failed to send notifications" 
      });
    }
  });

  // Get notification statistics
  app.get("/api/admin/notifications/stats", requireAuth, requireAdmin, async (_req, res) => {
    try {
      // Get total users count
      const { count: totalUsers } = await supabaseAdmin
        .from("users")
        .select("*", { count: "exact", head: true });

      // Get users with push subscriptions
      const { count: pushUsers } = await supabaseAdmin
        .from("push_subscriptions")
        .select("*", { count: "exact", head: true });

      // Get recent notification logs (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: recentLogs } = await supabaseAdmin
        .from("notification_logs")
        .select("status, created_at")
        .gte("created_at", thirtyDaysAgo.toISOString());

      const stats = {
        totalUsers: totalUsers || 0,
        pushSubscribers: pushUsers || 0,
        recentNotifications: recentLogs?.length || 0,
        recentSuccess: recentLogs?.filter(log => log.status === "sent").length || 0,
        recentFailed: recentLogs?.filter(log => log.status === "failed").length || 0
      };

      res.json(stats);
    } catch (error: any) {
      console.error("Error getting notification stats:", error);
      res.status(500).json({ 
        message: error.message || "Failed to get notification statistics" 
      });
    }
  });
}