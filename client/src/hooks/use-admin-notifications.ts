import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

export interface AdminNotification {
  id: number;
  type: string;
  title: string;
  message: string;
  category: string;
  link: string | null;
  reference_id: string | null;
  user_id: string | null;
  user_email: string | null;
  is_read: boolean;
  read_at: string | null;
  read_by: string | null;
  created_at: string;
}

export interface AdminNotificationData {
  notifications: AdminNotification[];
  unreadCount: number;
  categoryBadges: Record<string, number>;
  loading: boolean;
  markAsRead: (id: number) => Promise<void>;
  markAllAsRead: (category?: string) => Promise<void>;
  markCategoryRead: (category: string) => Promise<void>;
  refetch: () => Promise<void>;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("No authentication token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export function useAdminNotifications(pollInterval = 30000): AdminNotificationData {
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [categoryBadges, setCategoryBadges] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/admin/admin-notifications?limit=50", { headers });
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
      setCategoryBadges(data.categoryBadges || {});
    } catch {
      // Silently fail — admin might not be logged in
    } finally {
      setLoading(false);
    }
  }, []);

  const markAsRead = useCallback(async (id: number) => {
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/admin/admin-notifications/${id}/read`, {
        method: "POST",
        headers,
      });
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
      // Recalculate category badges
      setCategoryBadges(prev => {
        const notification = notifications.find(n => n.id === id);
        if (notification && !notification.is_read && prev[notification.category]) {
          return { ...prev, [notification.category]: Math.max(0, prev[notification.category] - 1) };
        }
        return prev;
      });
    } catch {}
  }, [notifications]);

  const markAllAsRead = useCallback(async (category?: string) => {
    try {
      const headers = await getAuthHeaders();
      const body = category ? JSON.stringify({ category }) : "{}";
      await fetch("/api/admin/admin-notifications/read-all", {
        method: "POST",
        headers,
        body,
      });
      if (category) {
        setNotifications(prev =>
          prev.map(n => (n.category === category ? { ...n, is_read: true } : n))
        );
        setCategoryBadges(prev => ({ ...prev, [category]: 0 }));
      } else {
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        setUnreadCount(0);
        setCategoryBadges({});
      }
      // Refresh to get accurate counts
      await fetchNotifications();
    } catch {}
  }, [fetchNotifications]);

  const markCategoryRead = useCallback(async (category: string) => {
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/admin/admin-notifications/category/${category}/read`, {
        method: "POST",
        headers,
      });
      setCategoryBadges(prev => ({ ...prev, [category]: 0 }));
      setNotifications(prev =>
        prev.map(n => (n.category === category ? { ...n, is_read: true } : n))
      );
      setUnreadCount(prev => {
        const cleared = notifications.filter(n => n.category === category && !n.is_read).length;
        return Math.max(0, prev - cleared);
      });
    } catch {}
  }, [notifications]);

  // Initial fetch + polling
  useEffect(() => {
    fetchNotifications();

    if (pollInterval > 0) {
      intervalRef.current = setInterval(fetchNotifications, pollInterval);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchNotifications, pollInterval]);

  // Listen for WebSocket events for instant updates
  useEffect(() => {
    function handleWsMessage(event: MessageEvent) {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed?.data?.metadata?.adminNotification) {
          // New admin notification received — refetch for accurate data
          fetchNotifications();
        }
      } catch {}
    }

    // Find existing WebSocket connections
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(wsUrl);
      ws.addEventListener("message", handleWsMessage);
    } catch {}

    return () => {
      if (ws) {
        ws.removeEventListener("message", handleWsMessage);
        ws.close();
      }
    };
  }, [fetchNotifications]);

  return {
    notifications,
    unreadCount,
    categoryBadges,
    loading,
    markAsRead,
    markAllAsRead,
    markCategoryRead,
    refetch: fetchNotifications,
  };
}
