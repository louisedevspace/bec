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

  // Subscribe to push notifications
  app.post("/api/push/subscribe", requireAuth, async (req, res) => {
    try {
      const userId = req.user.id;
      const subscription = req.body;

      if (!subscription?.endpoint || !subscription?.keys) {
        return res.status(400).json({ message: "Invalid subscription data" });
      }

      // Save to database
      const { error } = await supabaseAdmin.from("push_subscriptions").upsert({
        user_id: userId,
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

      if (error) {
        console.error('Failed to save push subscription:', error);
        return res.status(500).json({ message: "Failed to save subscription" });
      }

      console.log(`✅ Push subscription saved for user ${userId}`);
      res.json({ success: true });
    } catch (error) {
      console.error('Push subscribe error:', error);
      res.status(500).json({ message: "Failed to subscribe" });
    }
  });

  // Unsubscribe from push notifications
  app.post("/api/push/unsubscribe", requireAuth, async (req, res) => {
    try {
      const userId = req.user.id;
      
      const { error } = await supabaseAdmin
        .from("push_subscriptions")
        .delete()
        .eq("user_id", userId);

      if (error) {
        console.error('Failed to delete push subscription:', error);
      }

      console.log(`✅ Push subscription removed for user ${userId}`);
      res.json({ success: true });
    } catch (error) {
      console.error('Push unsubscribe error:', error);
      res.status(500).json({ message: "Failed to unsubscribe" });
    }
  });

  // Test push notification (admin only)
  app.post("/api/push/test", requireAuth, requireAdmin, async (req, res) => {
    if (!pushConfigured) {
      return res.status(503).json({ message: "Push notifications not configured" });
    }

    try {
      // Get all subscriptions from database
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
        title: "Becxus",
        body: "Test notification - Push is working!",
        data: { url: "/" },
      });

      let sent = 0;
      let failed = 0;
      const expiredSubscriptions: string[] = [];

      for (const sub of subscriptions) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: sub.keys },
            payload
          );
          sent++;
        } catch (err: any) {
          failed++;
          // 410 Gone means subscription is expired/invalid - mark for deletion
          if (err.statusCode === 410 || err.statusCode === 404) {
            expiredSubscriptions.push(sub.user_id);
          }
        }
      }

      // Clean up expired subscriptions
      if (expiredSubscriptions.length > 0) {
        await supabaseAdmin
          .from("push_subscriptions")
          .delete()
          .in("user_id", expiredSubscriptions);
        console.log(`🧹 Cleaned up ${expiredSubscriptions.length} expired subscriptions`);
      }

      res.json({ 
        success: true, 
        sent, 
        failed,
        cleaned: expiredSubscriptions.length,
        total: subscriptions.length 
      });
    } catch (error) {
      console.error('Push test error:', error);
      res.status(500).json({ message: "Failed to send test push" });
    }
  });

  // Check push subscription status
  app.get("/api/push/status", requireAuth, async (req, res) => {
    try {
      const userId = req.user.id;
      
      const { data, error } = await supabaseAdmin
        .from("push_subscriptions")
        .select("endpoint, updated_at")
        .eq("user_id", userId)
        .single();

      res.json({
        configured: pushConfigured,
        subscribed: !error && !!data,
        lastUpdated: data?.updated_at || null
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to check status" });
    }
  });
}
