import { supabaseAdmin } from "../routes/middleware";
import { redisGet, redisSet, redisGetJSON, redisSetJSON, redisDel } from "../utils/redis";

// ─── Auto-Reply Types ────────────────────────────────────────────────────────

export interface AutoReplyRule {
  id: string;
  category: string; // matches conversation category
  keywords: string[]; // trigger keywords in message
  response: string; // the auto-reply message
  priority: number; // higher = checked first
  enabled: boolean;
}

export interface ReplySuggestion {
  ruleId: string;
  response: string;
  confidence: number; // 0-1
  category: string;
  matchedKeywords: string[];
}

export interface AutoReplySettings {
  enabled: boolean; // master toggle
  confidenceThreshold: number; // 0.6 default — below this, suggest instead of auto-send
  cooldownMinutes: number; // 5 min default — don't auto-reply same conversation within this period
  maxAutoRepliesPerConversation: number; // 2 default — after this, stop auto-replying and let admin handle
  rules: AutoReplyRule[];
}

// ─── Redis Keys ──────────────────────────────────────────────────────────────

const REDIS_KEYS = {
  SETTINGS: "auto-reply:settings",
  COOLDOWN: "auto-reply:cooldown:", // + conversationId
  COUNT: "auto-reply:count:", // + conversationId
  SUGGESTIONS: "auto-reply:suggestions:", // + conversationId
} as const;

// ─── In-Memory Fallbacks ─────────────────────────────────────────────────────

const cooldownMap = new Map<string, number>(); // conversationId -> timestamp
const countMap = new Map<string, number>(); // conversationId -> count

// ─── Default Auto-Reply Rules ────────────────────────────────────────────────

const DEFAULT_AUTO_REPLY_RULES: AutoReplyRule[] = [
  {
    id: "greeting-general",
    category: "general",
    keywords: ["hello", "hi", "hey", "help", "support", "assistance"],
    response:
      "Hello! Thank you for reaching out to Becxus Support. Our team is reviewing your message and will respond shortly. In the meantime, you can check our FAQ section for quick answers.",
    priority: 10,
    enabled: true,
  },
  {
    id: "deposit-issues",
    category: "deposit",
    keywords: ["deposit", "fund", "payment", "not received", "missing", "pending", "transaction id", "txid"],
    response:
      "Thank you for contacting us about your deposit. Deposits typically process within 24 hours. Please ensure you used the correct deposit address and network. If your deposit hasn't appeared after 24 hours, please share your transaction ID and we'll investigate immediately.",
    priority: 20,
    enabled: true,
  },
  {
    id: "withdrawal-issues",
    category: "withdrawal",
    keywords: ["withdraw", "withdrawal", "cashout", "payout", "pending withdrawal", "withdrawal status"],
    response:
      "We've received your withdrawal inquiry. Withdrawals are processed within 1-24 hours. For security, large withdrawals may need additional verification. Please ensure your withdrawal address is correct. If you're experiencing delays, our team will review your case shortly.",
    priority: 20,
    enabled: true,
  },
  {
    id: "trading-questions",
    category: "trading",
    keywords: ["trade", "trading", "buy", "sell", "order", "futures", "margin", "leverage", "position"],
    response:
      "Thank you for your trading inquiry. Our team will review your question and get back to you shortly. For urgent trading issues, please include your order ID and the trading pair involved.",
    priority: 15,
    enabled: true,
  },
  {
    id: "account-login",
    category: "account",
    keywords: ["account", "login", "password", "forgot", "reset", "2fa", "verification", "kyc", "verify", "locked"],
    response:
      "We understand you're having account issues. For password resets, use the 'Forgot Password' link on the login page. For KYC verification, go to Profile > Verification. Our team will assist you further shortly.",
    priority: 15,
    enabled: true,
  },
  {
    id: "staking-questions",
    category: "staking",
    keywords: ["stake", "staking", "apy", "yield", "lock", "locked", "rewards", "unstake"],
    response:
      "Thank you for your staking inquiry. Staking rewards are calculated based on your locked amount and the current APY rate. Our team will provide more specific details about your staking position shortly.",
    priority: 15,
    enabled: true,
  },
  {
    id: "technical-issues",
    category: "technical",
    keywords: ["bug", "error", "crash", "glitch", "slow", "loading", "issue", "broken", "not working", "screen"],
    response:
      "We're sorry you're experiencing technical difficulties. Please try: 1) Clear your browser cache 2) Refresh the page with Ctrl+Shift+R 3) Try a different browser. If the issue persists, our team will investigate further.",
    priority: 18,
    enabled: true,
  },
  {
    id: "security-concerns",
    category: "security",
    keywords: ["hack", "hacked", "stolen", "unauthorized", "suspicious", "fraud", "scam", "phishing", "security"],
    response:
      "⚠️ We take security concerns very seriously. Your report has been flagged for immediate review. Please do NOT share any passwords or private keys. Our security team will respond to this ticket as a priority.",
    priority: 25,
    enabled: true,
  },
];

// Default settings
const DEFAULT_SETTINGS: AutoReplySettings = {
  enabled: true,
  confidenceThreshold: 0.6,
  cooldownMinutes: 5,
  maxAutoRepliesPerConversation: 2,
  rules: DEFAULT_AUTO_REPLY_RULES,
};

// ─── Auto-Reply Service ──────────────────────────────────────────────────────

class AutoReplyService {
  private static instance: AutoReplyService;
  private cachedSettings: AutoReplySettings | null = null;
  private botAdminId: string | null = null;

  private constructor() {}

  static getInstance(): AutoReplyService {
    if (!AutoReplyService.instance) {
      AutoReplyService.instance = new AutoReplyService();
    }
    return AutoReplyService.instance;
  }

  // ─── Settings Management ─────────────────────────────────────────────────

  async getSettings(): Promise<AutoReplySettings> {
    // Try Redis first
    try {
      const cached = await redisGetJSON<AutoReplySettings>(REDIS_KEYS.SETTINGS);
      if (cached) {
        this.cachedSettings = cached;
        return cached;
      }
    } catch (err) {
      // Redis error, fall through to memory/defaults
    }

    // Return cached or defaults
    return this.cachedSettings || { ...DEFAULT_SETTINGS };
  }

  async updateSettings(updates: Partial<AutoReplySettings>): Promise<AutoReplySettings> {
    const current = await this.getSettings();
    const newSettings: AutoReplySettings = {
      ...current,
      ...updates,
      // Merge rules if provided, otherwise keep current
      rules: updates.rules !== undefined ? updates.rules : current.rules,
    };

    // Save to Redis
    try {
      await redisSetJSON(REDIS_KEYS.SETTINGS, newSettings);
      console.log("[AutoReply] Settings saved to Redis");
    } catch (err) {
      console.log("[AutoReply] Redis unavailable, using in-memory settings");
    }

    this.cachedSettings = newSettings;
    return newSettings;
  }

  // ─── Bot Admin ID ────────────────────────────────────────────────────────

  private async getBotAdminId(): Promise<string | null> {
    if (this.botAdminId) {
      return this.botAdminId;
    }

    try {
      // Get the first admin user to use as the bot sender
      const { data: admin, error } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("role", "admin")
        .limit(1)
        .single();

      if (error || !admin) {
        console.warn("[AutoReply] No admin user found for bot messages");
        return null;
      }

      this.botAdminId = admin.id;
      return this.botAdminId;
    } catch (err) {
      console.error("[AutoReply] Error fetching admin ID:", err);
      return null;
    }
  }

  // ─── Cooldown Management ─────────────────────────────────────────────────

  private async isOnCooldown(conversationId: string, cooldownMinutes: number): Promise<boolean> {
    const cooldownKey = `${REDIS_KEYS.COOLDOWN}${conversationId}`;

    // Try Redis
    try {
      const value = await redisGet(cooldownKey);
      if (value) {
        return true;
      }
    } catch (err) {
      // Fall through to memory
    }

    // In-memory fallback
    const timestamp = cooldownMap.get(conversationId);
    if (timestamp) {
      const elapsed = Date.now() - timestamp;
      if (elapsed < cooldownMinutes * 60 * 1000) {
        return true;
      }
      cooldownMap.delete(conversationId);
    }

    return false;
  }

  private async setCooldown(conversationId: string, cooldownMinutes: number): Promise<void> {
    const cooldownKey = `${REDIS_KEYS.COOLDOWN}${conversationId}`;

    // Try Redis (TTL in seconds)
    try {
      await redisSet(cooldownKey, "1", cooldownMinutes * 60);
    } catch (err) {
      // Fallback to memory
    }

    // Always set in memory as fallback
    cooldownMap.set(conversationId, Date.now());
  }

  // ─── Auto-Reply Count Management ─────────────────────────────────────────

  private async getAutoReplyCount(conversationId: string): Promise<number> {
    const countKey = `${REDIS_KEYS.COUNT}${conversationId}`;

    // Try Redis
    try {
      const value = await redisGet(countKey);
      if (value) {
        return parseInt(value, 10) || 0;
      }
    } catch (err) {
      // Fall through to memory
    }

    // In-memory fallback
    return countMap.get(conversationId) || 0;
  }

  private async incrementAutoReplyCount(conversationId: string): Promise<void> {
    const countKey = `${REDIS_KEYS.COUNT}${conversationId}`;
    const currentCount = await this.getAutoReplyCount(conversationId);

    // Try Redis (24h TTL)
    try {
      await redisSet(countKey, String(currentCount + 1), 24 * 60 * 60);
    } catch (err) {
      // Fallback to memory
    }

    // Always set in memory as fallback
    countMap.set(conversationId, currentCount + 1);
  }

  // ─── Scoring Algorithm ───────────────────────────────────────────────────

  private scoreMessage(
    messageText: string,
    conversationCategory: string,
    rule: AutoReplyRule
  ): { confidence: number; matchedKeywords: string[] } {
    const lowerMessage = messageText.toLowerCase();
    const matchedKeywords: string[] = [];

    // Count keyword matches
    for (const keyword of rule.keywords) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        matchedKeywords.push(keyword);
      }
    }

    if (matchedKeywords.length === 0) {
      return { confidence: 0, matchedKeywords: [] };
    }

    // Base confidence from keyword match ratio
    let confidence = matchedKeywords.length / rule.keywords.length;

    // Category match bonus (+0.3)
    if (rule.category === conversationCategory || rule.category === "general") {
      confidence += 0.3;
    }

    // Boost for multiple keyword matches (up to +0.2)
    if (matchedKeywords.length >= 2) {
      confidence += Math.min(matchedKeywords.length * 0.05, 0.2);
    }

    // Cap at 1.0
    confidence = Math.min(confidence, 1.0);

    return { confidence, matchedKeywords };
  }

  // ─── Main Processing ─────────────────────────────────────────────────────

  async processNewMessage(
    conversationId: string,
    messageText: string,
    category: string
  ): Promise<void> {
    const settings = await this.getSettings();

    // Check master toggle
    if (!settings.enabled) {
      console.log("[AutoReply] Auto-reply is disabled");
      return;
    }

    // Check if conversation is valid for auto-reply
    const canAutoReply = await this.canAutoReply(conversationId, settings);
    if (!canAutoReply.allowed) {
      console.log(`[AutoReply] Skipping: ${canAutoReply.reason}`);
      return;
    }

    // Score message against all enabled rules
    const enabledRules = settings.rules
      .filter((r) => r.enabled)
      .sort((a, b) => b.priority - a.priority);

    let bestMatch: {
      rule: AutoReplyRule;
      confidence: number;
      matchedKeywords: string[];
    } | null = null;

    for (const rule of enabledRules) {
      const { confidence, matchedKeywords } = this.scoreMessage(messageText, category, rule);

      if (confidence > 0 && (!bestMatch || confidence > bestMatch.confidence)) {
        bestMatch = { rule, confidence, matchedKeywords };
      }
    }

    if (!bestMatch) {
      console.log("[AutoReply] No matching rules found");
      return;
    }

    console.log(
      `[AutoReply] Best match: rule=${bestMatch.rule.id}, confidence=${bestMatch.confidence.toFixed(2)}, keywords=${bestMatch.matchedKeywords.join(", ")}`
    );

    // Check confidence threshold
    if (bestMatch.confidence >= settings.confidenceThreshold) {
      // Auto-send the reply
      await this.sendAutoReply(conversationId, bestMatch.rule.response, bestMatch.rule.id);
    } else {
      // Store as suggestion for admin
      await this.storeSuggestion(conversationId, {
        ruleId: bestMatch.rule.id,
        response: bestMatch.rule.response,
        confidence: bestMatch.confidence,
        category: bestMatch.rule.category,
        matchedKeywords: bestMatch.matchedKeywords,
      });
      console.log(
        `[AutoReply] Stored suggestion for conversation ${conversationId} (confidence ${bestMatch.confidence.toFixed(2)} below threshold ${settings.confidenceThreshold})`
      );
    }
  }

  private async canAutoReply(
    conversationId: string,
    settings: AutoReplySettings
  ): Promise<{ allowed: boolean; reason?: string }> {
    // Check cooldown
    if (await this.isOnCooldown(conversationId, settings.cooldownMinutes)) {
      return { allowed: false, reason: "Conversation is on cooldown" };
    }

    // Check max auto-replies
    const count = await this.getAutoReplyCount(conversationId);
    if (count >= settings.maxAutoRepliesPerConversation) {
      return {
        allowed: false,
        reason: `Max auto-replies reached (${count}/${settings.maxAutoRepliesPerConversation})`,
      };
    }

    // Check conversation status and existing admin replies
    try {
      const { data: conversation, error } = await supabaseAdmin
        .from("support_conversations")
        .select("status")
        .eq("id", conversationId)
        .single();

      if (error || !conversation) {
        return { allowed: false, reason: "Conversation not found" };
      }

      // Don't auto-reply to closed conversations
      if (conversation.status === "closed") {
        return { allowed: false, reason: "Conversation is closed" };
      }

      // Check for existing admin replies (non-auto-reply ones)
      const { data: adminMessages } = await supabaseAdmin
        .from("support_messages")
        .select("id, message")
        .eq("conversation_id", conversationId)
        .eq("sender_type", "admin")
        .eq("message_type", "text")
        .limit(5);

      // If there are admin messages that don't start with auto-reply prefix, skip
      const hasManualAdminReply = adminMessages?.some(
        (m: any) => !m.message.startsWith("🤖 [Auto-Reply]")
      );
      if (hasManualAdminReply) {
        return { allowed: false, reason: "Conversation has manual admin replies" };
      }
    } catch (err) {
      console.error("[AutoReply] Error checking conversation:", err);
      return { allowed: false, reason: "Error checking conversation" };
    }

    return { allowed: true };
  }

  // ─── Send Auto-Reply ─────────────────────────────────────────────────────

  async sendAutoReply(conversationId: string, message: string, ruleId: string): Promise<boolean> {
    const botAdminId = await this.getBotAdminId();
    if (!botAdminId) {
      console.error("[AutoReply] Cannot send auto-reply: No bot admin ID available");
      return false;
    }

    const settings = await this.getSettings();
    const prefixedMessage = `🤖 [Auto-Reply] ${message}`;

    try {
      // Insert the auto-reply message
      const { error: messageError } = await supabaseAdmin
        .from("support_messages")
        .insert({
          conversation_id: parseInt(conversationId, 10),
          sender_id: botAdminId,
          sender_type: "admin",
          message: prefixedMessage,
          message_type: "text",
        });

      if (messageError) {
        console.error("[AutoReply] Failed to insert message:", messageError.message);
        return false;
      }

      // Update conversation
      const now = new Date().toISOString();
      await supabaseAdmin
        .from("support_conversations")
        .update({
          last_message_at: now,
          updated_at: now,
          status: "in_progress",
        })
        .eq("id", conversationId)
        .eq("status", "open"); // Only update if status is 'open'

      // Mark user's last message as read
      const { data: lastUserMessage } = await supabaseAdmin
        .from("support_messages")
        .select("id")
        .eq("conversation_id", conversationId)
        .eq("sender_type", "user")
        .eq("is_read", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (lastUserMessage) {
        await supabaseAdmin
          .from("support_messages")
          .update({ is_read: true, read_at: now })
          .eq("id", lastUserMessage.id);
      }

      // Set cooldown
      await this.setCooldown(conversationId, settings.cooldownMinutes);

      // Increment count
      await this.incrementAutoReplyCount(conversationId);

      console.log(`[AutoReply] Sent auto-reply to conversation ${conversationId} using rule ${ruleId}`);
      return true;
    } catch (err) {
      console.error("[AutoReply] Error sending auto-reply:", err);
      return false;
    }
  }

  // ─── Suggestions Management ──────────────────────────────────────────────

  private async storeSuggestion(conversationId: string, suggestion: ReplySuggestion): Promise<void> {
    const suggestionsKey = `${REDIS_KEYS.SUGGESTIONS}${conversationId}`;

    try {
      // Get existing suggestions
      let suggestions = (await redisGetJSON<ReplySuggestion[]>(suggestionsKey)) || [];

      // Add new suggestion (avoid duplicates by ruleId)
      suggestions = suggestions.filter((s) => s.ruleId !== suggestion.ruleId);
      suggestions.push(suggestion);

      // Keep only top 5 by confidence
      suggestions.sort((a, b) => b.confidence - a.confidence);
      suggestions = suggestions.slice(0, 5);

      // Save with 24h TTL
      await redisSetJSON(suggestionsKey, suggestions, 24 * 60 * 60);
    } catch (err) {
      console.warn("[AutoReply] Failed to store suggestion in Redis");
    }
  }

  async getSuggestions(conversationId: string): Promise<ReplySuggestion[]> {
    const suggestionsKey = `${REDIS_KEYS.SUGGESTIONS}${conversationId}`;

    try {
      const suggestions = await redisGetJSON<ReplySuggestion[]>(suggestionsKey);
      if (suggestions && suggestions.length > 0) {
        // Sort by confidence and return top 3
        return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
      }
    } catch (err) {
      // Redis unavailable
    }

    // If no stored suggestions, generate fresh ones from latest unread message
    try {
      const settings = await this.getSettings();

      // Get latest unread user message
      const { data: latestMessage } = await supabaseAdmin
        .from("support_messages")
        .select("message")
        .eq("conversation_id", conversationId)
        .eq("sender_type", "user")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!latestMessage) {
        return [];
      }

      // Get conversation category
      const { data: conversation } = await supabaseAdmin
        .from("support_conversations")
        .select("category")
        .eq("id", conversationId)
        .single();

      const category = conversation?.category || "general";

      // Score against all enabled rules
      const enabledRules = settings.rules.filter((r) => r.enabled);
      const suggestions: ReplySuggestion[] = [];

      for (const rule of enabledRules) {
        const { confidence, matchedKeywords } = this.scoreMessage(
          latestMessage.message,
          category,
          rule
        );

        if (confidence > 0) {
          suggestions.push({
            ruleId: rule.id,
            response: rule.response,
            confidence,
            category: rule.category,
            matchedKeywords,
          });
        }
      }

      // Sort by confidence and return top 3
      return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
    } catch (err) {
      console.error("[AutoReply] Error generating suggestions:", err);
      return [];
    }
  }

  async clearSuggestions(conversationId: string): Promise<void> {
    const suggestionsKey = `${REDIS_KEYS.SUGGESTIONS}${conversationId}`;
    try {
      await redisDel(suggestionsKey);
    } catch (err) {
      // Ignore Redis errors
    }
  }
}

export const autoReplyService = AutoReplyService.getInstance();
