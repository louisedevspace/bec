import type { Express } from "express";
import webpush from "web-push";
import { requireAuth, requireAdmin, supabaseAdmin } from "./middleware";

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || "";
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || "";
const vapidSubject = process.env.VAPID_SUBJECT || "mailto:admin@becxus.com";

// Configure web-push if VAPID keys are available
let pushConfigured = false;
if (vapidPublicKey && vapidPrivateKey) {
  try {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    pushConfigured = true;
    console.log('✅ Web Push configured with VAPID keys');
  } catch (error) {
    console.error('❌ Failed to configure Web Push:', error);
  }
} else {
  console.warn('⚠️ VAPID keys not configured - push notifications disabled');
  console.warn('   To enable, add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to .env');
  console.warn('   Generate keys with: npx web-push generate-vapid-keys');
}

/** Check if VAPID/web-push is ready (used by other route files) */
export function isPushConfigured() {
  return pushConfigured;
}

/**
 * Send a push notification to a single subscription and return success/failure.
 * Handles 410/404 (expired) subscriptions and cleans them up.
 */
export async function sendPushToSubscription(
  sub: { endpoint: string; keys: any },
  payload: string
): Promise<{ success: boolean; expired: boolean }> {
  try {
    await webpush.sendNotification(sub, payload);
    return { success: true, expired: false };
  } catch (err: any) {
    const expired = err.statusCode === 410 || err.statusCode === 404;
    return { success: false, expired };
  }
}

/**
 * Clean up expired/invalid push subscriptions by endpoint.
 */
export async function cleanupExpiredSubscriptions(endpoints: string[]) {
  if (endpoints.length === 0) return;
  await supabaseAdmin
    .from("push_subscriptions")
    .delete()
    .in("endpoint", endpoints);
  console.log(`🧹 Cleaned up ${endpoints.length} expired push subscriptions`);
}

export default function registerPushRoutes(app: Express) {
  // Get VAPID public key for client subscription
  app.get("/api/push/public-key", (_req, res) => {
    if (!pushConfigured || !vapidPublicKey) {
      return res.status(503).json({ 
        message: "Push notifications not configured. VAPID keys are missing." 
      });
    }
    res.json({ publicKey: vapidPublicKey });
  });

  // Subscribe to push notifications (multi-device: upsert by user_id + endpoint)
  app.post("/api/push/subscribe", requireAuth, async (req, res) => {
    try {
      const userId = req.user.id;
      const subscription = req.body;

      if (!subscription?.endpoint || !subscription?.keys) {
        return res.status(400).json({ message: "Invalid subscription data" });
      }

      // Detect platform from User-Agent
      const ua = (req.headers['user-agent'] || '').toLowerCase();
      let platform = 'unknown';
      if (/iphone|ipad|ipod/.test(ua)) platform = 'ios';
      else if (/android/.test(ua)) platform = 'android';
      else if (/windows|macintosh|linux/.test(ua)) platform = 'desktop';

      // Upsert: if same user + endpoint exists, update keys/timestamps
      const { error } = await supabaseAdmin.from("push_subscriptions").upsert({
        user_id: userId,
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        platform,
        user_agent: (req.headers['user-agent'] || '').substring(0, 500),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,endpoint' });

      if (error) {
        console.error('Failed to save push subscription:', error);
        return res.status(500).json({ message: "Failed to save subscription" });
      }

      console.log(`✅ Push subscription saved for user ${userId} (${platform})`);
      res.json({ success: true, platform });
    } catch (error) {
      console.error('Push subscribe error:', error);
      res.status(500).json({ message: "Failed to subscribe" });
    }
  });

  // Unsubscribe from push notifications (remove specific endpoint, not all devices)
  app.post("/api/push/unsubscribe", requireAuth, async (req, res) => {
    try {
      const userId = req.user.id;
      const { endpoint } = req.body || {};

      if (endpoint) {
        // Remove specific subscription (single device)
        await supabaseAdmin
          .from("push_subscriptions")
          .delete()
          .eq("user_id", userId)
          .eq("endpoint", endpoint);
      } else {
        // Fallback: remove ALL subscriptions for this user
        await supabaseAdmin
          .from("push_subscriptions")
          .delete()
          .eq("user_id", userId);
      }

      console.log(`✅ Push subscription removed for user ${userId}`);
      res.json({ success: true });
    } catch (error) {
      console.error('Push unsubscribe error:', error);
      res.status(500).json({ message: "Failed to unsubscribe" });
    }
  });

  // Test push notification (admin only) — sends to ALL subscriptions across ALL devices
  app.post("/api/push/test", requireAuth, requireAdmin, async (req, res) => {
    if (!pushConfigured) {
      return res.status(503).json({ message: "Push notifications not configured" });
    }

    try {
      const { data: subscriptions, error } = await supabaseAdmin
        .from("push_subscriptions")
        .select("*");

      if (error) {
        return res.status(500).json({ message: "Failed to fetch subscriptions" });
      }

      if (!subscriptions || subscriptions.length === 0) {
        return res.json({ success: true, sent: 0, message: "No subscriptions found" });
      }

      const payload = JSON.stringify({
        title: "Becxus Exchange",
        body: "Test notification - Push is working!",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        data: { url: "/" },
      });

      let sent = 0;
      let failed = 0;
      const expiredEndpoints: string[] = [];

      for (const sub of subscriptions) {
        const result = await sendPushToSubscription(
          { endpoint: sub.endpoint, keys: sub.keys },
          payload
        );
        if (result.success) {
          sent++;
        } else {
          failed++;
          if (result.expired) {
            expiredEndpoints.push(sub.endpoint);
          }
        }
      }

      await cleanupExpiredSubscriptions(expiredEndpoints);

      res.json({ 
        success: true, 
        sent, 
        failed,
        cleaned: expiredEndpoints.length,
        total: subscriptions.length 
      });
    } catch (error) {
      console.error('Push test error:', error);
      res.status(500).json({ message: "Failed to send test push" });
    }
  });

  // Check push subscription status (multi-device aware)
  app.get("/api/push/status", requireAuth, async (req, res) => {
    try {
      const userId = req.user.id;
      
      const { data, error } = await supabaseAdmin
        .from("push_subscriptions")
        .select("endpoint, platform, updated_at")
        .eq("user_id", userId);

      const subscriptions = (!error && data) ? data : [];

      res.json({
        configured: pushConfigured,
        subscribed: subscriptions.length > 0,
        deviceCount: subscriptions.length,
        devices: subscriptions.map(s => ({
          platform: s.platform || 'unknown',
          lastUpdated: s.updated_at,
        })),
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to check status" });
    }
  });
}
