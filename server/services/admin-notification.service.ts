import { supabaseAdmin } from "../routes/middleware";
import { syncManager } from "../sync-manager";
import { redisGetJSON, redisSetJSON, redisDel, REDIS_KEYS } from "../utils/redis";

// Admin notification types
export type AdminNotificationType =
  | "deposit_request"
  | "withdraw_request"
  | "support_ticket"
  | "support_message"
  | "kyc_submission"
  | "trade"
  | "loan_application";

// Sidebar category for dot indicators
export type AdminNotificationCategory =
  | "dashboard"
  | "users"
  | "wallets"
  | "support"
  | "trading_pairs";

export interface CreateAdminNotification {
  type: AdminNotificationType;
  title: string;
  message: string;
  category: AdminNotificationCategory;
  link?: string;
  referenceId?: string;
  userId?: string;
  userEmail?: string;
}

export interface AdminNotification extends CreateAdminNotification {
  id: number;
  is_read: boolean;
  read_at: string | null;
  read_by: string | null;
  created_at: string;
}

/**
 * Central service for creating and managing admin notifications.
 * Notifications are persisted to the database and broadcast via WebSocket.
 */
class AdminNotificationService {
  private static instance: AdminNotificationService;

  private constructor() {}

  static getInstance(): AdminNotificationService {
    if (!AdminNotificationService.instance) {
      AdminNotificationService.instance = new AdminNotificationService();
    }
    return AdminNotificationService.instance;
  }

  /**
   * Create a new admin notification and broadcast it via WebSocket.
   */
  async create(notification: CreateAdminNotification): Promise<void> {
    try {
      const { data, error } = await supabaseAdmin
        .from("admin_notifications")
        .insert({
          type: notification.type,
          title: notification.title,
          message: notification.message,
          category: notification.category,
          link: notification.link || null,
          reference_id: notification.referenceId || null,
          user_id: notification.userId || null,
          user_email: notification.userEmail || null,
        })
        .select()
        .single();

      if (error) {
        console.error("Failed to create admin notification:", error.message);
        return;
      }

      // Invalidate notification counts cache
      try {
        await redisDel(REDIS_KEYS.ADMIN_NOTIF_COUNTS);
        console.log('[Redis:Admin] Invalidated notification counts cache');
      } catch (err) {
        // Redis errors are non-fatal
      }

      // Broadcast via WebSocket so admin clients receive it instantly
      syncManager.broadcastSyncEvent({
        type: "data_sync",
        data: {
          action: "create-deposit-request", // Reuse existing sync action
          timestamp: new Date().toISOString(),
          metadata: {
            adminNotification: true,
            notification: data,
          },
        },
      });

      console.log(`🔔 Admin notification: [${notification.type}] ${notification.title}`);
    } catch (err) {
      console.error("Admin notification service error:", err);
    }
  }

  /**
   * Get all notifications with optional filters.
   */
  async getAll(options: {
    unreadOnly?: boolean;
    category?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ notifications: any[]; unreadCount: number; categoryBadges: Record<string, number> }> {
    const { unreadOnly = false, category, limit = 50, offset = 0 } = options;

    let query = supabaseAdmin
      .from("admin_notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (unreadOnly) {
      query = query.eq("is_read", false);
    }
    if (category) {
      query = query.eq("category", category);
    }

    const { data: notifications, error } = await query;
    if (error) {
      console.error("Failed to fetch admin notifications:", error.message);
      return { notifications: [], unreadCount: 0, categoryBadges: {} };
    }

    // Try to get counts from Redis cache (15s TTL)
    let unreadCount = 0;
    let categoryBadges: Record<string, number> = {};
    
    try {
      const cachedCounts = await redisGetJSON<{ unreadCount: number; categoryBadges: Record<string, number> }>(REDIS_KEYS.ADMIN_NOTIF_COUNTS);
      if (cachedCounts) {
        console.log('[Redis:Admin] Cache HIT for notification counts');
        return {
          notifications: notifications || [],
          unreadCount: cachedCounts.unreadCount,
          categoryBadges: cachedCounts.categoryBadges,
        };
      }
    } catch (err) {
      // Redis errors are non-fatal
    }

    // Get unread count from DB
    const { count: dbUnreadCount } = await supabaseAdmin
      .from("admin_notifications")
      .select("*", { count: "exact", head: true })
      .eq("is_read", false);
    
    unreadCount = dbUnreadCount || 0;

    // Get per-category unread counts for sidebar badges
    const { data: categoryData } = await supabaseAdmin
      .from("admin_notifications")
      .select("category")
      .eq("is_read", false);

    if (categoryData) {
      for (const row of categoryData) {
        categoryBadges[row.category] = (categoryBadges[row.category] || 0) + 1;
      }
    }

    // Store counts in Redis with 15s TTL
    try {
      await redisSetJSON(REDIS_KEYS.ADMIN_NOTIF_COUNTS, { unreadCount, categoryBadges }, 15);
      console.log('[Redis:Admin] Cached notification counts');
    } catch (err) {
      // Redis errors are non-fatal
    }

    return {
      notifications: notifications || [],
      unreadCount,
      categoryBadges,
    };
  }

  /**
   * Mark a single notification as read.
   */
  async markAsRead(notificationId: number, adminUserId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from("admin_notifications")
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
        read_by: adminUserId,
      })
      .eq("id", notificationId);

    if (error) {
      console.error("Failed to mark notification as read:", error.message);
    } else {
      // Invalidate counts cache
      try {
        await redisDel(REDIS_KEYS.ADMIN_NOTIF_COUNTS);
      } catch (err) {
        // Redis errors are non-fatal
      }
    }
  }

  /**
   * Mark all notifications as read, optionally filtered by category.
   */
  async markAllAsRead(adminUserId: string, category?: string): Promise<void> {
    let query = supabaseAdmin
      .from("admin_notifications")
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
        read_by: adminUserId,
      })
      .eq("is_read", false);

    if (category) {
      query = query.eq("category", category);
    }

    const { error } = await query;
    if (error) {
      console.error("Failed to mark all notifications as read:", error.message);
    } else {
      // Invalidate counts cache
      try {
        await redisDel(REDIS_KEYS.ADMIN_NOTIF_COUNTS);
      } catch (err) {
        // Redis errors are non-fatal
      }
    }
  }

  /**
   * Mark all notifications in a category as read (for sidebar badge clearing).
   */
  async markCategoryAsRead(category: string, adminUserId: string): Promise<void> {
    await this.markAllAsRead(adminUserId, category);
  }

  // ─── Convenience methods for specific event types ───

  async notifyDepositRequest(deposit: any, userEmail?: string): Promise<void> {
    await this.create({
      type: "deposit_request",
      title: "New Deposit Request",
      message: `${userEmail || "A user"} submitted a ${deposit.symbol} deposit of ${deposit.amount}`,
      category: "users",
      link: "/admin/users",
      referenceId: String(deposit.id),
      userId: deposit.user_id,
      userEmail,
    });
  }

  async notifyWithdrawRequest(withdraw: any, userEmail?: string): Promise<void> {
    await this.create({
      type: "withdraw_request",
      title: "New Withdrawal Request",
      message: `${userEmail || "A user"} requested withdrawal of ${withdraw.amount} ${withdraw.symbol}`,
      category: "users",
      link: "/admin/users",
      referenceId: String(withdraw.id),
      userId: withdraw.user_id,
      userEmail,
    });
  }

  async notifySupportTicket(ticket: any, userEmail?: string): Promise<void> {
    await this.create({
      type: "support_ticket",
      title: "New Support Ticket",
      message: `${userEmail || "A user"} opened: "${ticket.subject}"`,
      category: "support",
      link: "/admin/support",
      referenceId: String(ticket.id),
      userId: ticket.user_id,
      userEmail,
    });
  }

  async notifySupportMessage(message: any, conversationSubject: string, userEmail?: string): Promise<void> {
    await this.create({
      type: "support_message",
      title: "New Support Message",
      message: `${userEmail || "A user"} replied in "${conversationSubject}"`,
      category: "support",
      link: "/admin/support",
      referenceId: String(message.conversation_id),
      userId: message.sender_id,
      userEmail,
    });
  }

  async notifyKycSubmission(userId: string, userEmail?: string): Promise<void> {
    await this.create({
      type: "kyc_submission",
      title: "KYC Verification Submitted",
      message: `${userEmail || "A user"} submitted identity verification documents`,
      category: "users",
      link: "/admin/users",
      userId,
      userEmail,
    });
  }

  async notifyLoanApplication(loan: any, userEmail?: string): Promise<void> {
    await this.create({
      type: "loan_application",
      title: "New Loan Application",
      message: `${userEmail || "A user"} applied for a loan of $${loan.amount}`,
      category: "users",
      link: "/admin/users",
      referenceId: String(loan.id),
      userId: loan.user_id,
      userEmail,
    });
  }
}

export const adminNotificationService = AdminNotificationService.getInstance();
