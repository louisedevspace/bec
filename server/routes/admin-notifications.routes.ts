import type { Express } from "express";
import { requireAuth, requireSupportStaff, isSupportOnlyRole } from "./middleware";
import { adminNotificationService } from "../services/admin-notification.service";

// Support agents (role='support', not full admins) only ever see and act on
// the 'support' category — everything else (deposits, KYC, users, etc.) is
// admin-only data they don't have access to anywhere else in the app either.
const SUPPORT_AGENT_CATEGORY = "support";

export default function registerAdminNotificationRoutes(app: Express) {
  // GET /api/admin/admin-notifications — list admin notifications + badge counts
  app.get("/api/admin/admin-notifications", requireAuth, requireSupportStaff, async (req, res) => {
    try {
      const unreadOnly = req.query.unread === "true";
      let category = req.query.category as string | undefined;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      if (await isSupportOnlyRole(req.user.id)) {
        category = SUPPORT_AGENT_CATEGORY;
      }

      const result = await adminNotificationService.getAll({
        unreadOnly,
        category,
        limit,
        offset,
      });

      res.json(result);
    } catch (error) {
      console.error("Error fetching admin notifications:", error);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  // POST /api/admin/admin-notifications/:id/read — mark one as read
  app.post("/api/admin/admin-notifications/:id/read", requireAuth, requireSupportStaff, async (req, res) => {
    try {
      const notificationId = parseInt(req.params.id);
      if (isNaN(notificationId)) {
        return res.status(400).json({ message: "Invalid notification ID" });
      }

      await adminNotificationService.markAsRead(notificationId, req.user.id);
      res.json({ message: "Notification marked as read" });
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  // POST /api/admin/admin-notifications/read-all — mark all as read (optionally per category)
  app.post("/api/admin/admin-notifications/read-all", requireAuth, requireSupportStaff, async (req, res) => {
    try {
      let { category } = req.body;
      if (await isSupportOnlyRole(req.user.id)) {
        category = SUPPORT_AGENT_CATEGORY;
      }
      await adminNotificationService.markAllAsRead(req.user.id, category);
      res.json({ message: "All notifications marked as read" });
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
      res.status(500).json({ message: "Failed to mark all notifications as read" });
    }
  });

  // POST /api/admin/admin-notifications/category/:category/read — clear badge for sidebar section
  app.post("/api/admin/admin-notifications/category/:category/read", requireAuth, requireSupportStaff, async (req, res) => {
    try {
      const { category } = req.params;
      if (await isSupportOnlyRole(req.user.id) && category !== SUPPORT_AGENT_CATEGORY) {
        return res.status(403).json({ message: "Support agents may only clear support notifications" });
      }
      await adminNotificationService.markCategoryAsRead(category, req.user.id);
      res.json({ message: `Category '${category}' notifications marked as read` });
    } catch (error) {
      console.error("Error clearing category notifications:", error);
      res.status(500).json({ message: "Failed to clear category notifications" });
    }
  });
}
