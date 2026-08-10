import type { Express } from "express";
import { requireAuth, requireAdmin } from "./middleware";
import { adminNotificationService } from "../services/admin-notification.service";

export default function registerAdminNotificationRoutes(app: Express) {
  // GET /api/admin/admin-notifications — list admin notifications + badge counts
  app.get("/api/admin/admin-notifications", requireAuth, requireAdmin, async (req, res) => {
    try {
      const unreadOnly = req.query.unread === "true";
      const category = req.query.category as string | undefined;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

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
  app.post("/api/admin/admin-notifications/:id/read", requireAuth, requireAdmin, async (req, res) => {
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
  app.post("/api/admin/admin-notifications/read-all", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { category } = req.body;
      await adminNotificationService.markAllAsRead(req.user.id, category);
      res.json({ message: "All notifications marked as read" });
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
      res.status(500).json({ message: "Failed to mark all notifications as read" });
    }
  });

  // POST /api/admin/admin-notifications/category/:category/read — clear badge for sidebar section
  app.post("/api/admin/admin-notifications/category/:category/read", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { category } = req.params;
      await adminNotificationService.markCategoryAsRead(category, req.user.id);
      res.json({ message: `Category '${category}' notifications marked as read` });
    } catch (error) {
      console.error("Error clearing category notifications:", error);
      res.status(500).json({ message: "Failed to clear category notifications" });
    }
  });
}
