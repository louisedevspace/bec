import type { Express } from "express";
import { requireAuth, requireAdmin, supabaseAdmin } from "./middleware";
import { syncManager } from "../sync-manager";
import { adminNotificationService } from "../services/admin-notification.service";

// ─── Auto-categorization helpers ─────────────────────────────────
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  deposit: ["deposit", "fund", "add money", "payment", "top up", "topup", "bank transfer"],
  withdrawal: ["withdraw", "withdrawal", "cashout", "cash out", "payout", "pay out"],
  trading: ["trade", "trading", "buy", "sell", "order", "futures", "margin", "leverage"],
  account: ["account", "login", "password", "2fa", "verify", "verification", "kyc", "profile", "email"],
  staking: ["stake", "staking", "apy", "yield", "lock", "locked"],
  technical: ["bug", "error", "crash", "glitch", "slow", "loading", "issue", "broken", "not working"],
  security: ["hack", "hacked", "stolen", "unauthorized", "suspicious", "fraud", "scam", "phishing"],
};

function autoCategorizTicket(subject: string, message: string): string {
  const text = `${subject} ${message}`.toLowerCase();
  let bestCategory = "general";
  let bestScore = 0;
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const score = keywords.filter((kw) => text.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }
  return bestCategory;
}

// ─── Response templates ──────────────────────────────────────────
const RESPONSE_TEMPLATES: Record<string, { name: string; message: string }[]> = {
  greeting: [
    { name: "Welcome", message: "Hello! Thank you for contacting Becxus Support. How can I help you today?" },
    { name: "Follow-up", message: "Hi there! I'm following up on your recent inquiry. Is there anything else I can assist you with?" },
  ],
  deposit: [
    { name: "Deposit Processing", message: "Your deposit is currently being processed. Please allow up to 24 hours for the funds to reflect in your account. If you're still experiencing issues after this period, please provide your transaction ID and we'll investigate further." },
    { name: "Deposit Methods", message: "We support deposits via bank transfer and cryptocurrency. To make a deposit, go to your wallet page and select the deposit option. Please ensure you use the correct deposit address and network." },
  ],
  withdrawal: [
    { name: "Withdrawal Processing", message: "Withdrawal requests are typically processed within 1-24 hours. Please ensure your withdrawal address is correct. For security purposes, large withdrawals may require additional verification." },
    { name: "Withdrawal Limits", message: "Our withdrawal limits depend on your verification level. Please complete KYC verification to increase your withdrawal limits. If you need assistance with verification, I'd be happy to guide you through the process." },
  ],
  account: [
    { name: "Password Reset", message: "To reset your password, please click on 'Forgot Password' on the login page. You'll receive a reset link via email. If you're not receiving the email, please check your spam folder." },
    { name: "KYC Verification", message: "To complete KYC verification, please go to your profile settings and upload a valid government-issued ID (front and back) along with a selfie holding your ID. Verification typically takes 1-3 business days." },
  ],
  technical: [
    { name: "Clear Cache", message: "Please try clearing your browser cache and cookies, then refresh the page. If the issue persists, try using a different browser or device. Could you also share a screenshot of the error you're seeing?" },
    { name: "App Update", message: "Please ensure you're using the latest version of our platform. Try refreshing the page with Ctrl+Shift+R (or Cmd+Shift+R on Mac) to force a clean reload." },
  ],
  closing: [
    { name: "Resolution", message: "I'm glad I could help resolve your issue! If you have any other questions in the future, don't hesitate to reach out. Have a great day!" },
    { name: "Pending Info", message: "I'll keep this ticket open while we wait for the additional information. Please reply at your convenience and we'll continue from here." },
  ],
};

export default function registerSupportRoutes(app: Express) {
  // ====================================================================
  //  USER ENDPOINTS
  // ====================================================================

  // GET /api/support/conversation — get user's support conversations
  app.get("/api/support/conversation", requireAuth, async (req, res) => {
    try {
      const userId = req.user.id;

      const { data: conversations, error } = await supabaseAdmin
        .from("support_conversations")
        .select(`
          *,
          support_messages (
            id, message, sender_type, created_at, is_read, sender_id, message_type
          )
        `)
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });

      if (error) {
        return res.status(500).json({ message: "Failed to fetch support conversations" });
      }

      // Sort messages by created_at for each conversation
      const sorted = (conversations || []).map((c: any) => ({
        ...c,
        support_messages: (c.support_messages || []).sort(
          (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        ),
      }));

      res.json(sorted);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/support/conversation — create new support conversation
  app.post("/api/support/conversation", requireAuth, async (req, res) => {
    try {
      const { subject, priority = "medium", message } = req.body;
      const userId = req.user.id;

      if (!subject || !message) {
        return res.status(400).json({
          message: "Subject and message are required",
          received: { subject: !!subject, message: !!message },
        });
      }

      // Auto-categorize
      const category = autoCategorizTicket(subject, message);

      const { data: conversation, error: conversationError } = await supabaseAdmin
        .from("support_conversations")
        .insert({
          user_id: userId,
          subject,
          priority,
          status: "open",
          is_active: true,
          category,
        })
        .select()
        .single();

      if (conversationError) {
        return res.status(500).json({
          message: "Failed to create support conversation.",
          error: conversationError.message,
        });
      }

      const { data: supportMessage, error: messageError } = await supabaseAdmin
        .from("support_messages")
        .insert({
          conversation_id: conversation.id,
          sender_id: userId,
          sender_type: "user",
          message,
          message_type: "text",
        })
        .select()
        .single();

      if (messageError) {
        // Rollback conversation if message fails
        await supabaseAdmin.from("support_conversations").delete().eq("id", conversation.id);
        return res.status(500).json({
          message: "Failed to create support message.",
          error: messageError.message,
        });
      }

      const now = new Date().toISOString();
      await supabaseAdmin
        .from("support_conversations")
        .update({ last_message_at: now, updated_at: now })
        .eq("id", conversation.id);

      syncManager.syncData("create-support-conversation", { ...conversation, userId });

      // Admin notification
      try {
        await adminNotificationService.notifySupportTicket(conversation, req.user?.email);
      } catch {}

      res.json({ ...conversation, support_messages: [supportMessage] });
    } catch (error) {
      res.status(500).json({
        message: "Internal server error.",
        error: (error as Error).message,
      });
    }
  });

  // POST /api/support/messages — send message to support conversation
  app.post("/api/support/messages", requireAuth, async (req, res) => {
    try {
      const { conversationId, message, messageType = "text", attachmentUrl } = req.body;
      const userId = req.user.id;

      if (!conversationId || !message) {
        return res.status(400).json({ message: "Conversation ID and message are required" });
      }

      const { data: conversation, error: conversationError } = await supabaseAdmin
        .from("support_conversations")
        .select("user_id, status")
        .eq("id", conversationId)
        .single();

      if (conversationError || !conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      if (conversation.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Don't allow messages on closed tickets
      if (conversation.status === "closed") {
        return res.status(400).json({ message: "This conversation has been closed. Please create a new ticket." });
      }

      const { data: supportMessage, error: messageError } = await supabaseAdmin
        .from("support_messages")
        .insert({
          conversation_id: conversationId,
          sender_id: userId,
          sender_type: "user",
          message,
          message_type: messageType,
          attachment_url: attachmentUrl,
        })
        .select()
        .single();

      if (messageError) {
        return res.status(500).json({ message: "Failed to send message.", error: messageError.message });
      }

      // Reopen resolved tickets when user replies
      const now = new Date().toISOString();
      const updateData: any = { last_message_at: now, updated_at: now };
      if (conversation.status === "resolved") {
        updateData.status = "open";
      }

      await supabaseAdmin.from("support_conversations").update(updateData).eq("id", conversationId);

      syncManager.syncData("create-support-message", { ...supportMessage, userId });

      // Admin notification — user replied in support conversation
      try {
        const { data: conv } = await supabaseAdmin
          .from("support_conversations")
          .select("subject")
          .eq("id", conversationId)
          .single();
        await adminNotificationService.notifySupportMessage(supportMessage, conv?.subject || "Support Ticket", req.user?.email);
      } catch {}

      res.json(supportMessage);
    } catch (error) {
      res.status(500).json({ message: "Internal server error", error: (error as Error).message });
    }
  });

  // PUT /api/support/messages/:messageId/read — user marks message as read
  app.put("/api/support/messages/:messageId/read", requireAuth, async (req, res) => {
    try {
      const { messageId } = req.params;
      const userId = req.user.id;

      const { data: message, error: messageError } = await supabaseAdmin
        .from("support_messages")
        .select(`*, support_conversations!inner(user_id)`)
        .eq("id", messageId)
        .single();

      if (messageError || !message) {
        return res.status(404).json({ message: "Message not found" });
      }

      if (message.support_conversations.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { error: updateError } = await supabaseAdmin
        .from("support_messages")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", messageId);

      if (updateError) {
        return res.status(500).json({ message: "Failed to mark message as read" });
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/support/conversation/:id/confirm-resolution — user confirms resolution
  app.post("/api/support/conversation/:id/confirm-resolution", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const { data: conversation, error } = await supabaseAdmin
        .from("support_conversations")
        .select("user_id, status")
        .eq("id", id)
        .single();

      if (error || !conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      if (conversation.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      if (conversation.status !== "resolved") {
        return res.status(400).json({ message: "Ticket is not in resolved state" });
      }

      const now = new Date().toISOString();
      await supabaseAdmin
        .from("support_conversations")
        .update({ status: "closed", is_active: false, updated_at: now })
        .eq("id", id);

      await supabaseAdmin.from("support_messages").insert({
        conversation_id: parseInt(id),
        sender_id: userId,
        sender_type: "user",
        message: "✅ User confirmed the issue has been resolved. Ticket closed.",
        message_type: "system",
      });

      syncManager.syncData("update-support-conversation", { conversationId: id, userId });
      res.json({ success: true, message: "Ticket closed after confirmation" });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/support/conversation/:id/reopen — user reopens resolved ticket
  app.post("/api/support/conversation/:id/reopen", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const { data: conversation, error } = await supabaseAdmin
        .from("support_conversations")
        .select("user_id, status")
        .eq("id", id)
        .single();

      if (error || !conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      if (conversation.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      if (conversation.status !== "resolved") {
        return res.status(400).json({ message: "Only resolved tickets can be reopened" });
      }

      const now = new Date().toISOString();
      await supabaseAdmin
        .from("support_conversations")
        .update({ status: "open", updated_at: now })
        .eq("id", id);

      await supabaseAdmin.from("support_messages").insert({
        conversation_id: parseInt(id),
        sender_id: userId,
        sender_type: "user",
        message: "🔄 User reopened this ticket — issue not resolved.",
        message_type: "system",
      });

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ====================================================================
  //  ADMIN ENDPOINTS
  // ====================================================================

  // GET /api/admin/support/conversations
  app.get("/api/admin/support/conversations", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { data: conversations, error } = await supabaseAdmin
        .from("support_conversations")
        .select(`
          *,
          support_messages (
            id, message, sender_type, created_at, is_read, sender_id, message_type
          )
        `)
        .order("last_message_at", { ascending: false });

      if (error) {
        console.error("Error fetching conversations:", error);
        return res.status(500).json({ message: "Failed to fetch support conversations", error: error.message });
      }

      // Fetch user details separately for each conversation
      const conversationsWithUsers = await Promise.all(
        (conversations || []).map(async (conversation: any) => {
          const { data: userData, error: userError } = await supabaseAdmin
            .from("users")
            .select("id, email, full_name, username, is_verified, is_active, created_at")
            .eq("id", conversation.user_id)
            .single();

          if (userError) {
            console.error(`Error fetching user ${conversation.user_id}:`, userError);
          }

          const displayName = userData?.full_name || userData?.username || userData?.email?.split("@")[0] || "Unknown User";

          // Sort messages chronologically
          const sortedMessages = (conversation.support_messages || []).sort(
            (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );

          return {
            ...conversation,
            support_messages: sortedMessages,
            users: {
              id: conversation.user_id,
              email: userData?.email || "Unknown",
              full_name: displayName,
              is_verified: userData?.is_verified ?? false,
              is_active: userData?.is_active ?? true,
              created_at: userData?.created_at || conversation.created_at,
            },
          };
        })
      );

      res.json(conversationsWithUsers);
    } catch (error) {
      console.error("Error in admin support conversations:", error);
      res.status(500).json({ message: "Internal server error", error: (error as Error).message });
    }
  });

  // POST /api/admin/support/messages — admin reply
  app.post("/api/admin/support/messages", requireAuth, requireAdmin, async (req, res) => {
    try {
      const currentUserId = req.user.id;
      const { conversationId, message, messageType = "text", attachmentUrl } = req.body;

      if (!conversationId || !message) {
        return res.status(400).json({ message: "Conversation ID and message are required" });
      }

      const { data: conversation, error: conversationError } = await supabaseAdmin
        .from("support_conversations")
        .select("user_id, is_active, status")
        .eq("id", conversationId)
        .single();

      if (conversationError || !conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const { data: supportMessage, error: messageError } = await supabaseAdmin
        .from("support_messages")
        .insert({
          conversation_id: conversationId,
          sender_id: currentUserId,
          sender_type: "admin",
          message,
          message_type: messageType,
          attachment_url: attachmentUrl,
        })
        .select()
        .single();

      if (messageError) {
        return res.status(500).json({ message: "Failed to send message" });
      }

      // Auto-set status to in_progress when admin first replies to an open ticket
      const now = new Date().toISOString();
      const updateData: any = { last_message_at: now, updated_at: now };
      if (conversation.status === "open") {
        updateData.status = "in_progress";
      }

      await supabaseAdmin.from("support_conversations").update(updateData).eq("id", conversationId);

      syncManager.syncData("create-support-message", { ...supportMessage, userId: conversation.user_id });
      res.json(supportMessage);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/admin/support/stats
  app.get("/api/admin/support/stats", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { data: allConversations } = await supabaseAdmin
        .from("support_conversations")
        .select("id, status, priority, created_at, category");

      const { data: unreadMessages } = await supabaseAdmin
        .from("support_messages")
        .select("id")
        .eq("is_read", false)
        .eq("sender_type", "user");

      const conversations = allConversations || [];
      const total = conversations.length;
      const open = conversations.filter((c: any) => c.status === "open").length;
      const inProgress = conversations.filter((c: any) => c.status === "in_progress").length;
      const resolved = conversations.filter((c: any) => c.status === "resolved").length;
      const closed = conversations.filter((c: any) => c.status === "closed").length;
      const urgent = conversations.filter((c: any) => c.priority === "urgent" && c.status !== "closed" && c.status !== "resolved").length;
      const high = conversations.filter((c: any) => c.priority === "high" && c.status !== "closed" && c.status !== "resolved").length;

      // Category breakdown
      const categories: Record<string, number> = {};
      conversations.forEach((c: any) => {
        const cat = c.category || "general";
        categories[cat] = (categories[cat] || 0) + 1;
      });

      // Tickets created today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayCount = conversations.filter((c: any) => new Date(c.created_at) >= today).length;

      res.json({
        totalConversations: total,
        activeConversations: open + inProgress,
        openTickets: open,
        inProgressTickets: inProgress,
        resolvedTickets: resolved,
        closedTickets: closed,
        unreadMessages: unreadMessages?.length || 0,
        urgentTickets: urgent,
        highPriorityTickets: high,
        todayTickets: todayCount,
        categories,
      });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // PUT /api/admin/support/messages/:messageId/read
  app.put("/api/admin/support/messages/:messageId/read", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { messageId } = req.params;

      const { data: updateData, error: updateError } = await supabaseAdmin
        .from("support_messages")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", messageId)
        .select();

      if (updateError) {
        return res.status(500).json({ message: "Failed to mark message as read", error: updateError.message });
      }

      res.json({ success: true, updatedMessage: updateData });
    } catch (error) {
      res.status(500).json({ message: "Internal server error", error: (error as Error).message });
    }
  });

  // PUT /api/admin/support/conversations/:id/status — update ticket status
  app.put("/api/admin/support/conversations/:id/status", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const adminId = req.user.id;

      const validStatuses = ["open", "in_progress", "resolved", "closed"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const now = new Date().toISOString();
      const updateData: any = { status, updated_at: now };
      if (status === "closed" || status === "resolved") {
        updateData.is_active = status !== "closed";
      }
      if (status === "open") {
        updateData.is_active = true;
      }

      const { error } = await supabaseAdmin.from("support_conversations").update(updateData).eq("id", id);

      if (error) {
        return res.status(500).json({ message: "Failed to update status" });
      }

      // Add system message for status change
      const statusLabels: Record<string, string> = {
        open: "Open",
        in_progress: "In Progress",
        resolved: "Resolved",
        closed: "Closed",
      };
      await supabaseAdmin.from("support_messages").insert({
        conversation_id: parseInt(id),
        sender_id: adminId,
        sender_type: "admin",
        message: `📋 Ticket status changed to "${statusLabels[status]}"`,
        message_type: "system",
      });

      syncManager.syncData("update-support-conversation", { conversationId: id, status });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // PUT /api/admin/support/conversations/:id/priority — update ticket priority
  app.put("/api/admin/support/conversations/:id/priority", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { priority } = req.body;
      const adminId = req.user.id;

      const validPriorities = ["low", "medium", "high", "urgent"];
      if (!validPriorities.includes(priority)) {
        return res.status(400).json({ message: "Invalid priority" });
      }

      const { error } = await supabaseAdmin
        .from("support_conversations")
        .update({ priority, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) {
        return res.status(500).json({ message: "Failed to update priority" });
      }

      await supabaseAdmin.from("support_messages").insert({
        conversation_id: parseInt(id),
        sender_id: adminId,
        sender_type: "admin",
        message: `🔔 Ticket priority changed to "${priority.charAt(0).toUpperCase() + priority.slice(1)}"`,
        message_type: "system",
      });

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/admin/support/conversations/bulk-status — bulk status update
  app.post("/api/admin/support/conversations/bulk-status", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { conversationIds, status } = req.body;
      const adminId = req.user.id;

      if (!Array.isArray(conversationIds) || conversationIds.length === 0) {
        return res.status(400).json({ message: "Conversation IDs required" });
      }

      const validStatuses = ["open", "in_progress", "resolved", "closed"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const now = new Date().toISOString();
      const updateData: any = { status, updated_at: now };
      if (status === "closed") updateData.is_active = false;

      const { error } = await supabaseAdmin
        .from("support_conversations")
        .update(updateData)
        .in("id", conversationIds);

      if (error) {
        return res.status(500).json({ message: "Failed to update tickets" });
      }

      // Add system messages for each
      const statusLabels: Record<string, string> = { open: "Open", in_progress: "In Progress", resolved: "Resolved", closed: "Closed" };
      const insertPromises = conversationIds.map((cid: number) =>
        supabaseAdmin.from("support_messages").insert({
          conversation_id: cid,
          sender_id: adminId,
          sender_type: "admin",
          message: `📋 Ticket status changed to "${statusLabels[status]}" (bulk action)`,
          message_type: "system",
        })
      );
      await Promise.all(insertPromises);

      res.json({ success: true, count: conversationIds.length });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/admin/support/templates — get response templates
  app.get("/api/admin/support/templates", requireAuth, requireAdmin, async (_req, res) => {
    res.json(RESPONSE_TEMPLATES);
  });

  // PUT /api/admin/support/conversations/:id/assign — assign ticket
  app.put("/api/admin/support/conversations/:id/assign", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { assignedTo } = req.body;
      const adminId = req.user.id;

      const { error } = await supabaseAdmin
        .from("support_conversations")
        .update({ assigned_to: assignedTo || null, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) {
        return res.status(500).json({ message: "Failed to assign ticket" });
      }

      const action = assignedTo ? "assigned" : "unassigned";
      await supabaseAdmin.from("support_messages").insert({
        conversation_id: parseInt(id),
        sender_id: adminId,
        sender_type: "admin",
        message: `👤 Ticket ${action}${assignedTo ? " to admin" : ""}`,
        message_type: "system",
      });

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // PUT /api/admin/support/conversations/:id/category — update category
  app.put("/api/admin/support/conversations/:id/category", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { category } = req.body;

      const { error } = await supabaseAdmin
        .from("support_conversations")
        .update({ category, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) {
        return res.status(500).json({ message: "Failed to update category" });
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/admin/support/conversations/:id/escalate — escalate ticket
  app.post("/api/admin/support/conversations/:id/escalate", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const adminId = req.user.id;

      const { error } = await supabaseAdmin
        .from("support_conversations")
        .update({ priority: "urgent", updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) {
        return res.status(500).json({ message: "Failed to escalate ticket" });
      }

      await supabaseAdmin.from("support_messages").insert({
        conversation_id: parseInt(id),
        sender_id: adminId,
        sender_type: "admin",
        message: "🚨 This ticket has been escalated to URGENT priority.",
        message_type: "system",
      });

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // PUT /api/admin/support/conversations/:id/bulk-read — mark all messages as read in conversation
  app.put("/api/admin/support/conversations/:id/bulk-read", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;

      const { error } = await supabaseAdmin
        .from("support_messages")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("conversation_id", id)
        .eq("sender_type", "user")
        .eq("is_read", false);

      if (error) {
        return res.status(500).json({ message: "Failed to mark messages as read" });
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
