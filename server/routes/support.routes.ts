import type { Express } from "express";
import { requireAuth, requireAdmin, supabaseAdmin } from "./middleware";
import { syncManager } from "../sync-manager";

export default function registerSupportRoutes(app: Express) {
  // GET /api/support/conversation — get user's support conversations
  app.get("/api/support/conversation", requireAuth, async (req, res) => {
    try {
      const userId = req.user.id;

      const { data: conversations, error } = await supabaseAdmin
        .from("support_conversations")
        .select(`
          *,
          support_messages (
            id, message, sender_type, created_at, is_read
          )
        `)
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });

      if (error) {
        return res.status(500).json({ message: "Failed to fetch support conversations" });
      }

      res.json(conversations || []);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/support/conversation — create new support conversation
  app.post("/api/support/conversation", requireAuth, async (req, res) => {
    try {
      const { subject, priority = "medium", message } = req.body;
      const userId = req.user.id;

      // Input validation done - proceed to create conversation

      if (!subject || !message) {
        return res.status(400).json({ 
          message: "Subject and message are required",
          received: { subject: !!subject, message: !!message }
        });
      }

      const { data: conversation, error: conversationError } = await supabaseAdmin
        .from("support_conversations")
        .insert({ user_id: userId, subject, priority, status: "open", is_active: true })
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
        return res.status(500).json({
          message: "Failed to create support message.",
          error: messageError.message,
        });
      }

      await supabaseAdmin
        .from("support_conversations")
        .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", conversation.id);

      syncManager.syncData("create-support-conversation", { ...conversation, userId });
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
        .select("user_id")
        .eq("id", conversationId)
        .single();

      if (conversationError || !conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      if (conversation.user_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
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

      await supabaseAdmin
        .from("support_conversations")
        .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", conversationId);

      syncManager.syncData("create-support-message", { ...supportMessage, userId });
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

  // ==================== ADMIN SUPPORT ENDPOINTS ====================

  // GET /api/admin/support/conversations
  app.get("/api/admin/support/conversations", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { data: conversations, error } = await supabaseAdmin
        .from("support_conversations")
        .select(`
          *,
          support_messages (
            id, message, sender_type, created_at, is_read
          )
        `)
        .order("last_message_at", { ascending: false });

      if (error) {
        console.error('Error fetching conversations:', error);
        return res.status(500).json({ message: "Failed to fetch support conversations", error: error.message });
      }

      // Fetch user details separately for each conversation
      const conversationsWithUsers = await Promise.all(
        (conversations || []).map(async (conversation: any) => {
          const { data: userData, error: userError } = await supabaseAdmin
            .from("users")
            .select("id, email, full_name, username")
            .eq("id", conversation.user_id)
            .single();

          if (userError) {
            console.error(`Error fetching user ${conversation.user_id}:`, userError);
          }

          // Use full_name if available, otherwise fall back to username or email
          const displayName = userData?.full_name || userData?.username || userData?.email?.split('@')[0] || 'Unknown User';

          return {
            ...conversation,
            users: {
              id: conversation.user_id,
              email: userData?.email || 'Unknown',
              full_name: displayName
            }
          };
        })
      );

      res.json(conversationsWithUsers);
    } catch (error) {
      console.error('Error in admin support conversations:', error);
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
        .select("user_id, is_active")
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

      await supabaseAdmin
        .from("support_conversations")
        .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", conversationId);

      syncManager.syncData("create-support-message", { ...supportMessage, userId: conversation.user_id });
      res.json(supportMessage);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/admin/support/stats
  app.get("/api/admin/support/stats", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { data: totalConversations } = await supabaseAdmin.from("support_conversations").select("id");
      const { data: activeConversations } = await supabaseAdmin
        .from("support_conversations")
        .select("id")
        .eq("is_active", true);
      const { data: unreadMessages } = await supabaseAdmin
        .from("support_messages")
        .select("id")
        .eq("is_read", false)
        .eq("sender_type", "user");

      res.json({
        totalConversations: totalConversations?.length || 0,
        activeConversations: activeConversations?.length || 0,
        unreadMessages: unreadMessages?.length || 0,
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
}
