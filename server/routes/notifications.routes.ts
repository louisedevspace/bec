import type { Express } from "express";
import { requireAuth, requireAdmin, supabaseAdmin } from "./middleware";
import webpush from "web-push";

type CampaignFilters = {
  segment_role?: string | null;
  segment_is_verified?: boolean | null;
  segment_is_active?: boolean | null;
  segment_min_credit_score?: number | null;
  segment_email_search?: string | null;
};

async function getTargetUsers(filters: CampaignFilters) {
  let query = supabaseAdmin.from("users").select("id, email, full_name, role, is_verified, is_active, credit_score");
  if (filters.segment_role) query = query.eq("role", filters.segment_role);
  if (typeof filters.segment_is_verified === "boolean") query = query.eq("is_verified", filters.segment_is_verified);
  if (typeof filters.segment_is_active === "boolean") query = query.eq("is_active", filters.segment_is_active);
  if (typeof filters.segment_min_credit_score === "number") query = query.gte("credit_score", filters.segment_min_credit_score);
  if (filters.segment_email_search) query = query.ilike("email", `%${filters.segment_email_search}%`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

async function getPushSubscriptionMap(userIds: string[]) {
  const { data, error } = await supabaseAdmin.from("push_subscriptions").select("*").in("user_id", userIds);
  if (error) return new Map<string, any>();
  const map = new Map<string, any>();
  (data || []).forEach((row: any) => map.set(row.user_id, { endpoint: row.endpoint, keys: row.keys }));
  return map;
}

export default function registerNotificationsRoutes(app: Express) {
  app.get("/api/admin/notifications/templates", requireAuth, requireAdmin, async (_req, res) => {
    const { data, error } = await supabaseAdmin.from("notification_templates").select("*").order("updated_at", { ascending: false });
    if (error) return res.status(500).json({ message: error.message });
    res.json(data || []);
  });

  app.post("/api/admin/notifications/templates", requireAuth, requireAdmin, async (req, res) => {
    const { name, title, body, deeplink_url, channel, variant_a_title, variant_a_body, variant_b_title, variant_b_body } = req.body || {};
    const { data, error } = await supabaseAdmin
      .from("notification_templates")
      .insert([{ name, title, body, deeplink_url, channel, variant_a_title, variant_a_body, variant_b_title, variant_b_body }])
      .select()
      .single();
    if (error) return res.status(500).json({ message: error.message });
    res.json(data);
  });

  app.post("/api/admin/notifications/campaigns", requireAuth, requireAdmin, async (req, res) => {
    const payload = req.body || {};
    const { data, error } = await supabaseAdmin.from("notification_campaigns").insert([payload]).select().single();
    if (error) return res.status(500).json({ message: error.message });
    res.json(data);
  });

  app.get("/api/admin/notifications/campaigns/:id/status", requireAuth, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    const { data: logs, error } = await supabaseAdmin
      .from("notification_logs")
      .select("status, channel")
      .eq("campaign_id", id);
    if (error) return res.status(500).json({ message: error.message });
    const summary: Record<string, number> = {};
    (logs || []).forEach((l: any) => {
      const key = `${l.channel}:${l.status}`;
      summary[key] = (summary[key] || 0) + 1;
    });
    res.json({ summary });
  });

  app.post("/api/admin/notifications/campaigns/:id/send", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { data: campaign, error: fetchError } = await supabaseAdmin.from("notification_campaigns").select("*").eq("id", id).single();
      if (fetchError || !campaign) return res.status(404).json({ message: "Campaign not found" });
      await supabaseAdmin
        .from("notification_campaigns")
        .update({ status: "running", updated_at: new Date().toISOString() })
        .eq("id", id);

      const targets = await getTargetUsers({
        segment_role: campaign.segment_role,
        segment_is_verified: campaign.segment_is_verified,
        segment_is_active: campaign.segment_is_active,
        segment_min_credit_score: campaign.segment_min_credit_score,
        segment_email_search: campaign.segment_email_search,
      });
      const userIds = targets.map((t: any) => t.id);
      const subs = await getPushSubscriptionMap(userIds);

      const title = campaign.title;
      const body = campaign.body;
      const deeplink = campaign.deeplink_url;

      const channels: string[] = campaign.channels || ["push"];
      let sentCount = 0;

      for (const user of targets) {
        const uid = user.id;
        for (const ch of channels) {
          const logBase = { campaign_id: id, user_id: uid, channel: ch, status: "queued", created_at: new Date().toISOString() };
          await supabaseAdmin.from("notification_logs").insert([logBase]);
          if (ch === "push") {
            const sub = subs.get(uid);
            if (sub) {
              try {
                const payload = JSON.stringify({ title, body, data: { url: deeplink || "/", campaignId: id } });
                await webpush.sendNotification(sub, payload);
                await supabaseAdmin
                  .from("notification_logs")
                  .update({ status: "sent", sent_at: new Date().toISOString() })
                  .eq("campaign_id", id)
                  .eq("user_id", uid)
                  .eq("channel", "push");
                sentCount++;
              } catch (err: any) {
                await supabaseAdmin
                  .from("notification_logs")
                  .update({ status: "failed", error: err?.message || "push send error" })
                  .eq("campaign_id", id)
                  .eq("user_id", uid)
                  .eq("channel", "push");
              }
            } else {
              await supabaseAdmin
                .from("notification_logs")
                .update({ status: "failed", error: "no subscription" })
                .eq("campaign_id", id)
                .eq("user_id", uid)
                .eq("channel", "push");
            }
          } else if (ch === "email") {
            await supabaseAdmin
              .from("notification_logs")
              .update({ status: "queued" })
              .eq("campaign_id", id)
              .eq("user_id", uid)
              .eq("channel", "email");
          } else if (ch === "sms") {
            await supabaseAdmin
              .from("notification_logs")
              .update({ status: "queued" })
              .eq("campaign_id", id)
              .eq("user_id", uid)
              .eq("channel", "sms");
          }
        }
      }
      await supabaseAdmin
        .from("notification_campaigns")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", id);
      res.json({ success: true, targets: targets.length, sent: sentCount });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to send campaign" });
    }
  });

  app.post("/api/notifications/click", async (req, res) => {
    try {
      const { campaignId } = req.body || {};
      if (!campaignId) return res.status(400).json({ message: "Missing campaignId" });
      await supabaseAdmin
        .from("notification_logs")
        .update({ status: "clicked", clicked_at: new Date().toISOString() })
        .eq("campaign_id", campaignId)
        .eq("status", "sent");
      res.json({ success: true });
    } catch {
      res.status(500).json({ message: "Failed to record click" });
    }
  });
}
