import type { Express } from "express";
import { requireAuth, requireAdmin, supabaseAdmin } from "./middleware";
import { sendPushToSubscription, cleanupExpiredSubscriptions } from "./push.routes";

// Batch size for processing large user bases
const BATCH_SIZE = 100;

async function getUsersByRole(role?: string) {
  let allUsers: any[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabaseAdmin
      .from("users")
      .select("id, email, full_name, role, is_verified, is_active")
      .range(from, from + BATCH_SIZE - 1);

    // Filter by role if specified
    if (role && role !== "all") {
      query = query.eq("role", role);
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

/**
 * Get ALL push subscriptions for the given user IDs.
 * Returns a Map of userId → array of subscriptions (multi-device).
 */
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

async function sendNotificationToUsers(users: any[], title: string, body: string, channel: string = "push") {
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
    data: { sentAt: new Date().toISOString() },
    tag: `becxus-broadcast-${Date.now()}`,
  });

  // Process users in batches
  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);
    
    const promises = batch.map(async (user) => {
      const userSubs = subs.get(user.id);
      
      if (!userSubs || userSubs.length === 0) {
        skippedCount++;
        return;
      }

      // Send to ALL devices for this user
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

    // Small delay between batches
    if (i + BATCH_SIZE < users.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Clean up expired subscriptions
  await cleanupExpiredSubscriptions(expiredEndpoints);

  return { sentCount, failedCount, skippedCount, errors };
}

export default function registerStreamlinedNotificationsRoutes(app: Express) {
  console.log('Registering streamlined notification routes...');
  
  // Health check endpoint
  app.get("/api/admin/notifications/streamlined/health", (_req, res) => {
    console.log('Health check requested');
    res.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      service: 'streamlined-notifications'
    });
  });
  
  // Send notification to users (with optional role filtering)
  app.post("/api/admin/notifications/streamlined/send", requireAuth, requireAdmin, async (req, res) => {
    console.log('POST /api/admin/notifications/send - received request');
    
    const { title, body, role, channel } = req.body || {};
    
    if (!title || !body) {
      console.log('Missing title or body');
      return res.status(400).json({ 
        message: "Title and body are required" 
      });
    }

    if (title.length > 100) {
      console.log('Title too long:', title.length);
      return res.status(400).json({ 
        message: "Title must be 100 characters or less" 
      });
    }

    if (body.length > 500) {
      console.log('Body too long:', body.length);
      return res.status(400).json({ 
        message: "Body must be 500 characters or less" 
      });
    }

    try {
      console.log('Fetching users by role:', role);
      // Get users by role (or all users if no role specified)
      const users = await getUsersByRole(role);
      console.log('Found users:', users.length);
      
      if (users.length === 0) {
        console.log('No users found');
        return res.json({ 
          success: true, 
          totalUsers: 0, 
          sentCount: 0, 
          failedCount: 0,
          message: `No users found${role && role !== 'all' ? ` with role: ${role}` : ''}` 
        });
      }

      console.log('Sending notifications...');
      // Send notifications to selected users
      const result = await sendNotificationToUsers(users, title, body, channel || "push");
      console.log('Notification sending complete:', result);

      console.log('Logging broadcast...');
      // Log the broadcast for audit purposes
      await supabaseAdmin.from("broadcast_notifications").insert([{
        title,
        body,
        target_role: role || 'all',
        total_users: users.length,
        sent_count: result.sentCount,
        failed_count: result.failedCount,
        status: "completed",
        sent_by: req.user?.id || null,
        sent_at: new Date().toISOString()
      }]);

      console.log('Sending response...');
      res.json({ 
        success: true, 
        totalUsers: users.length,
        sentCount: result.sentCount,
        failedCount: result.failedCount,
        skippedCount: result.skippedCount,
        errors: result.errors.slice(0, 10),
        message: `Notification sent to ${result.sentCount} device(s) across ${users.length} users (${result.skippedCount} without push enabled)`
      });

    } catch (error: any) {
      console.error('Error sending notification:', error);
      res.status(500).json({ 
        message: error.message || "Failed to send notifications" 
      });
    }
  });

  // Get notification statistics
  app.get("/api/admin/notifications/streamlined/stats", requireAuth, requireAdmin, async (_req, res) => {
    console.log('GET /api/admin/notifications/stats - received request');
    
    try {
      console.log('Fetching stats...');
      // Get total users count
      const { count: totalUsers } = await supabaseAdmin
        .from("users")
        .select("*", { count: "exact", head: true });

      // Get users with push subscriptions
      const { count: pushUsers } = await supabaseAdmin
        .from("push_subscriptions")
        .select("*", { count: "exact", head: true });

      console.log('Stats fetched:', { totalUsers, pushUsers });

      const stats = {
        totalUsers: totalUsers || 0,
        pushSubscribers: pushUsers || 0,
        recentNotifications: 0, // Simplified for now
        recentSuccess: 0,
        recentFailed: 0
      };

      console.log('Sending stats response:', stats);
      res.json(stats);
      
    } catch (error: any) {
      console.error('Error getting notification stats:', error);
      res.status(500).json({ 
        message: error.message || "Failed to get notification statistics" 
      });
    }
  });

  console.log('Streamlined notification routes registered successfully');
}