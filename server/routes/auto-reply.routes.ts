import type { Express } from "express";
import { requireAuth, requireAdmin, supabaseAdmin } from "./middleware";
import {
  autoReplyService,
  type AutoReplySettings,
  type ReplySuggestion,
} from "../services/auto-reply.service";
import { syncManager } from "../sync-manager";

export default function registerAutoReplyRoutes(app: Express): void {
  // ─────────────────────────────────────────────────────────────────────────
  //  GET /api/admin/support/auto-reply/settings
  //  Returns current AutoReplySettings
  // ─────────────────────────────────────────────────────────────────────────
  app.get(
    "/api/admin/support/auto-reply/settings",
    requireAuth,
    requireAdmin,
    async (_req, res) => {
      try {
        const settings = await autoReplyService.getSettings();
        res.json(settings);
      } catch (error) {
        console.error("[AutoReply] Error fetching settings:", error);
        res.status(500).json({ message: "Failed to fetch auto-reply settings" });
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  //  PUT /api/admin/support/auto-reply/settings
  //  Updates settings (merge, not replace)
  //  Body: Partial<AutoReplySettings>
  // ─────────────────────────────────────────────────────────────────────────
  app.put(
    "/api/admin/support/auto-reply/settings",
    requireAuth,
    requireAdmin,
    async (req, res) => {
      try {
        const updates: Partial<AutoReplySettings> = req.body;

        // Validate updates
        if (updates.enabled !== undefined && typeof updates.enabled !== "boolean") {
          return res.status(400).json({ message: "enabled must be a boolean" });
        }
        if (
          updates.confidenceThreshold !== undefined &&
          (typeof updates.confidenceThreshold !== "number" ||
            updates.confidenceThreshold < 0 ||
            updates.confidenceThreshold > 1)
        ) {
          return res
            .status(400)
            .json({ message: "confidenceThreshold must be a number between 0 and 1" });
        }
        if (
          updates.cooldownMinutes !== undefined &&
          (typeof updates.cooldownMinutes !== "number" || updates.cooldownMinutes < 0)
        ) {
          return res
            .status(400)
            .json({ message: "cooldownMinutes must be a non-negative number" });
        }
        if (
          updates.maxAutoRepliesPerConversation !== undefined &&
          (typeof updates.maxAutoRepliesPerConversation !== "number" ||
            updates.maxAutoRepliesPerConversation < 0)
        ) {
          return res
            .status(400)
            .json({ message: "maxAutoRepliesPerConversation must be a non-negative number" });
        }
        if (updates.rules !== undefined && !Array.isArray(updates.rules)) {
          return res.status(400).json({ message: "rules must be an array" });
        }

        const newSettings = await autoReplyService.updateSettings(updates);
        console.log(`[AutoReply] Settings updated by admin ${req.user.id}`);

        res.json(newSettings);
      } catch (error) {
        console.error("[AutoReply] Error updating settings:", error);
        res.status(500).json({ message: "Failed to update auto-reply settings" });
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  //  GET /api/admin/support/auto-reply/suggestions/:conversationId
  //  Returns ReplySuggestion[] for a specific conversation
  // ─────────────────────────────────────────────────────────────────────────
  app.get(
    "/api/admin/support/auto-reply/suggestions/:conversationId",
    requireAuth,
    requireAdmin,
    async (req, res) => {
      try {
        const { conversationId } = req.params;

        if (!conversationId) {
          return res.status(400).json({ message: "Conversation ID is required" });
        }

        // Verify conversation exists
        const { data: conversation, error: convError } = await supabaseAdmin
          .from("support_conversations")
          .select("id, status, category")
          .eq("id", conversationId)
          .single();

        if (convError || !conversation) {
          return res.status(404).json({ message: "Conversation not found" });
        }

        const suggestions = await autoReplyService.getSuggestions(conversationId);

        res.json({
          conversationId,
          suggestions,
          // Include a custom reply option placeholder
          customReplyOption: {
            ruleId: "custom",
            response: "",
            confidence: 0,
            category: "custom",
            matchedKeywords: [],
          },
        });
      } catch (error) {
        console.error("[AutoReply] Error fetching suggestions:", error);
        res.status(500).json({ message: "Failed to fetch suggestions" });
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  //  POST /api/admin/support/auto-reply/send-suggestion
  //  Admin manually sends a suggested reply (uses admin's own ID as sender)
  //  Body: { conversationId, message, ruleId? }
  // ─────────────────────────────────────────────────────────────────────────
  app.post(
    "/api/admin/support/auto-reply/send-suggestion",
    requireAuth,
    requireAdmin,
    async (req, res) => {
      try {
        const { conversationId, message, ruleId } = req.body;
        const adminId = req.user.id;

        if (!conversationId || !message) {
          return res
            .status(400)
            .json({ message: "Conversation ID and message are required" });
        }

        // Verify conversation exists
        const { data: conversation, error: convError } = await supabaseAdmin
          .from("support_conversations")
          .select("id, user_id, status")
          .eq("id", conversationId)
          .single();

        if (convError || !conversation) {
          return res.status(404).json({ message: "Conversation not found" });
        }

        // Don't allow messages to closed conversations
        if (conversation.status === "closed") {
          return res
            .status(400)
            .json({ message: "Cannot send messages to a closed conversation" });
        }

        // Insert the message (admin's own ID, not bot)
        const { data: supportMessage, error: messageError } = await supabaseAdmin
          .from("support_messages")
          .insert({
            conversation_id: parseInt(conversationId, 10),
            sender_id: adminId,
            sender_type: "admin",
            message,
            message_type: "text",
          })
          .select()
          .single();

        if (messageError) {
          console.error("[AutoReply] Failed to send suggestion:", messageError.message);
          return res.status(500).json({ message: "Failed to send message" });
        }

        // Update conversation timestamps and status
        const now = new Date().toISOString();
        const updateData: any = { last_message_at: now, updated_at: now };
        if (conversation.status === "open") {
          updateData.status = "in_progress";
        }

        await supabaseAdmin
          .from("support_conversations")
          .update(updateData)
          .eq("id", conversationId);

        // Clear stored suggestions for this conversation
        await autoReplyService.clearSuggestions(conversationId);

        // Sync to other clients
        syncManager.syncData("create-support-message", {
          ...supportMessage,
          userId: conversation.user_id,
        });

        console.log(
          `[AutoReply] Admin ${adminId} sent suggestion to conversation ${conversationId}${ruleId ? ` (rule: ${ruleId})` : ""}`
        );

        res.json({
          success: true,
          message: supportMessage,
          ruleId: ruleId || null,
        });
      } catch (error) {
        console.error("[AutoReply] Error sending suggestion:", error);
        res.status(500).json({ message: "Failed to send suggestion" });
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  //  POST /api/admin/support/auto-reply/toggle
  //  Quick toggle for enabling/disabling auto-reply
  //  Body: { enabled: boolean }
  // ─────────────────────────────────────────────────────────────────────────
  app.post(
    "/api/admin/support/auto-reply/toggle",
    requireAuth,
    requireAdmin,
    async (req, res) => {
      try {
        const { enabled } = req.body;

        if (typeof enabled !== "boolean") {
          return res.status(400).json({ message: "enabled must be a boolean" });
        }

        const newSettings = await autoReplyService.updateSettings({ enabled });
        console.log(`[AutoReply] ${enabled ? "Enabled" : "Disabled"} by admin ${req.user.id}`);

        res.json({ success: true, enabled: newSettings.enabled });
      } catch (error) {
        console.error("[AutoReply] Error toggling auto-reply:", error);
        res.status(500).json({ message: "Failed to toggle auto-reply" });
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  //  GET /api/admin/support/auto-reply/rules
  //  Returns just the rules array for easier management
  // ─────────────────────────────────────────────────────────────────────────
  app.get(
    "/api/admin/support/auto-reply/rules",
    requireAuth,
    requireAdmin,
    async (_req, res) => {
      try {
        const settings = await autoReplyService.getSettings();
        res.json(settings.rules);
      } catch (error) {
        console.error("[AutoReply] Error fetching rules:", error);
        res.status(500).json({ message: "Failed to fetch auto-reply rules" });
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  //  PUT /api/admin/support/auto-reply/rules/:ruleId
  //  Update a specific rule
  //  Body: Partial<AutoReplyRule>
  // ─────────────────────────────────────────────────────────────────────────
  app.put(
    "/api/admin/support/auto-reply/rules/:ruleId",
    requireAuth,
    requireAdmin,
    async (req, res) => {
      try {
        const { ruleId } = req.params;
        const updates = req.body;

        const settings = await autoReplyService.getSettings();
        const ruleIndex = settings.rules.findIndex((r) => r.id === ruleId);

        if (ruleIndex === -1) {
          return res.status(404).json({ message: "Rule not found" });
        }

        // Merge updates into existing rule
        settings.rules[ruleIndex] = {
          ...settings.rules[ruleIndex],
          ...updates,
          id: ruleId, // Ensure ID doesn't change
        };

        await autoReplyService.updateSettings({ rules: settings.rules });
        console.log(`[AutoReply] Rule ${ruleId} updated by admin ${req.user.id}`);

        res.json(settings.rules[ruleIndex]);
      } catch (error) {
        console.error("[AutoReply] Error updating rule:", error);
        res.status(500).json({ message: "Failed to update rule" });
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  //  POST /api/admin/support/auto-reply/rules
  //  Create a new rule
  //  Body: AutoReplyRule (without id, will be generated)
  // ─────────────────────────────────────────────────────────────────────────
  app.post(
    "/api/admin/support/auto-reply/rules",
    requireAuth,
    requireAdmin,
    async (req, res) => {
      try {
        const { category, keywords, response, priority, enabled } = req.body;

        // Validate required fields
        if (!category || !keywords || !response) {
          return res
            .status(400)
            .json({ message: "category, keywords, and response are required" });
        }
        if (!Array.isArray(keywords) || keywords.length === 0) {
          return res.status(400).json({ message: "keywords must be a non-empty array" });
        }

        // Generate unique ID
        const ruleId = `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const newRule = {
          id: ruleId,
          category,
          keywords,
          response,
          priority: priority ?? 10,
          enabled: enabled ?? true,
        };

        const settings = await autoReplyService.getSettings();
        settings.rules.push(newRule);

        await autoReplyService.updateSettings({ rules: settings.rules });
        console.log(`[AutoReply] New rule ${ruleId} created by admin ${req.user.id}`);

        res.json(newRule);
      } catch (error) {
        console.error("[AutoReply] Error creating rule:", error);
        res.status(500).json({ message: "Failed to create rule" });
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  //  DELETE /api/admin/support/auto-reply/rules/:ruleId
  //  Delete a rule
  // ─────────────────────────────────────────────────────────────────────────
  app.delete(
    "/api/admin/support/auto-reply/rules/:ruleId",
    requireAuth,
    requireAdmin,
    async (req, res) => {
      try {
        const { ruleId } = req.params;

        const settings = await autoReplyService.getSettings();
        const ruleIndex = settings.rules.findIndex((r) => r.id === ruleId);

        if (ruleIndex === -1) {
          return res.status(404).json({ message: "Rule not found" });
        }

        settings.rules.splice(ruleIndex, 1);
        await autoReplyService.updateSettings({ rules: settings.rules });

        console.log(`[AutoReply] Rule ${ruleId} deleted by admin ${req.user.id}`);

        res.json({ success: true, deletedRuleId: ruleId });
      } catch (error) {
        console.error("[AutoReply] Error deleting rule:", error);
        res.status(500).json({ message: "Failed to delete rule" });
      }
    }
  );
}
