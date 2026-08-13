import { useState, useEffect, useRef, useMemo } from "react";
import { formatDate } from '@/lib/date-utils';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  MessageSquare, Send, User, Shield, Search, MessageCircle, ArrowLeft,
  AlertTriangle, CheckCircle, Clock, XCircle, ChevronDown, Filter,
  Zap, FileText, Tag, BarChart3, RefreshCw, CheckSquare, Square,
  ArrowUpRight, Inbox, Loader2, Paperclip, X, UserCheck,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDataSync } from "@/hooks/use-data-sync";
import { supabase } from "@/lib/supabaseClient";
import AdminLayout from "./admin-layout";
import type { SupportMessage, SendSupportMessageData } from "@/types/support";
import { compressAdminImage } from "@/lib/image-compress";
import { getImageDisplayUrl, openImageViewer } from "@/lib/image";
import { EnablePushButton } from "@/components/notifications/enable-push-button";
import { getSystemMessageDisplay, isAutoReplyMessage, stripAutoReplyPrefix, AutoReplyIcon } from "@/lib/support-message-icons";

// ─── Types ───────────────────────────────────────────────────────
interface ConversationUser {
  id: string;
  email: string;
  full_name: string;
  is_verified?: boolean;
  is_active?: boolean;
  created_at?: string;
}

interface AdminConversation {
  id: number;
  user_id: string;
  subject: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "low" | "medium" | "high" | "urgent";
  category?: string;
  assigned_to?: string;
  is_active: boolean;
  last_message_at: string;
  created_at: string;
  updated_at: string;
  support_messages: SupportMessage[];
  users: ConversationUser;
  unreadCount: number;
}

interface AdminStats {
  totalConversations: number;
  activeConversations: number;
  openTickets: number;
  inProgressTickets: number;
  resolvedTickets: number;
  closedTickets: number;
  unreadMessages: number;
  urgentTickets: number;
  highPriorityTickets: number;
  todayTickets: number;
  categories: Record<string, number>;
}

type TemplateCategory = string;
type Template = { name: string; message: string };

// ─── Helper: auth header ─────────────────────────────────────────
async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("No authentication token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

// ─── Component ───────────────────────────────────────────────────
export default function AdminSupportPage() {
  const [selectedConversation, setSelectedConversation] = useState<AdminConversation | null>(null);
  const [message, setMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showTemplates, setShowTemplates] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Real-time delivery. useDataSync already invalidates the conversation
  // queries; the explicit refetch makes the open thread update immediately
  // instead of on the next poll.
  const [typingConversationId, setTypingConversationId] = useState<number | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const { invalidateQueries } = useDataSync({
    onSync: (action, data) => {
      if (action.startsWith("create-support") || action.startsWith("update-support")) {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/support/conversations"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/support/stats"] });
      } else if (action === "support-typing") {
        const conversationId = typeof data?.entityId === "number" ? data.entityId : parseInt(data?.entityId, 10);
        if (isNaN(conversationId)) return;
        setTypingConversationId(conversationId);
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => setTypingConversationId(null), 4000);
      }
    },
  });

  // ─── Queries ─────────────────────────────────────────────────
  const { data: stats } = useQuery<AdminStats>({
    queryKey: ["/api/admin/support/stats"],
    queryFn: async () => {
      const headers = await authHeaders();
      const res = await fetch("/api/admin/support/stats", { headers });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: conversations, isLoading, refetch } = useQuery<AdminConversation[]>({
    queryKey: ["/api/admin/support/conversations"],
    queryFn: async () => {
      const headers = await authHeaders();
      const res = await fetch("/api/admin/support/conversations", { headers });
      if (!res.ok) throw new Error("Failed to fetch conversations");
      const data = await res.json();
      return data.map((c: any) => ({
        ...c,
        unreadCount: c.support_messages?.filter((m: any) => !m.is_read && m.sender_type === "user").length || 0,
      }));
    },
    // Fallback only — the sync socket drives the instant path
    refetchInterval: 20000,
  });

  const { data: staffData } = useQuery<{ staff: { id: string; username: string; full_name: string | null; role: string }[] }>({
    queryKey: ["/api/admin/support/staff"],
    queryFn: async () => {
      const headers = await authHeaders();
      const res = await fetch("/api/admin/support/staff", { headers });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 60 * 1000,
  });
  const staffList = staffData?.staff || [];
  const staffMap = useMemo(() => new Map(staffList.map((s) => [s.id, s.full_name || s.username])), [staffList]);

  const { data: templates } = useQuery<Record<TemplateCategory, Template[]>>({
    queryKey: ["/api/admin/support/templates"],
    queryFn: async () => {
      const headers = await authHeaders();
      const res = await fetch("/api/admin/support/templates", { headers });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: Infinity,
  });

  // ─── Mutations ───────────────────────────────────────────────
  const refetchAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/support/conversations"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/support/stats"] });
    invalidateQueries("create-support-message");
    refetch();
  };

  const sendMessageMutation = useMutation({
    mutationFn: async (data: SendSupportMessageData) => {
      const headers = await authHeaders();
      const res = await fetch("/api/admin/support/messages", { method: "POST", headers, body: JSON.stringify(data) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed"); }
      return res.json();
    },
    onSuccess: () => { setMessage(""); refetchAll(); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const headers = await authHeaders();
      const res = await fetch(`/api/admin/support/conversations/${id}/status`, { method: "PUT", headers, body: JSON.stringify({ status }) });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => { refetchAll(); toast({ title: "Status updated" }); },
    onError: () => toast({ title: "Error", description: "Failed to update status", variant: "destructive" }),
  });

  const updatePriorityMutation = useMutation({
    mutationFn: async ({ id, priority }: { id: number; priority: string }) => {
      const headers = await authHeaders();
      const res = await fetch(`/api/admin/support/conversations/${id}/priority`, { method: "PUT", headers, body: JSON.stringify({ priority }) });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => { refetchAll(); toast({ title: "Priority updated" }); },
    onError: () => toast({ title: "Error", description: "Failed to update priority", variant: "destructive" }),
  });

  const bulkStatusMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: number[]; status: string }) => {
      const headers = await authHeaders();
      const res = await fetch("/api/admin/support/conversations/bulk-status", { method: "POST", headers, body: JSON.stringify({ conversationIds: ids, status }) });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (data) => { setSelectedIds(new Set()); refetchAll(); toast({ title: `Updated ${data.count} tickets` }); },
    onError: () => toast({ title: "Error", description: "Bulk update failed", variant: "destructive" }),
  });

  const escalateMutation = useMutation({
    mutationFn: async (id: number) => {
      const headers = await authHeaders();
      const res = await fetch(`/api/admin/support/conversations/${id}/escalate`, { method: "POST", headers });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => { refetchAll(); toast({ title: "Ticket escalated to urgent" }); },
    onError: () => toast({ title: "Error", description: "Failed to escalate", variant: "destructive" }),
  });

  const assignMutation = useMutation({
    mutationFn: async ({ id, assignedTo }: { id: number; assignedTo: string | null }) => {
      const headers = await authHeaders();
      const res = await fetch(`/api/admin/support/conversations/${id}/assign`, { method: "PUT", headers, body: JSON.stringify({ assignedTo }) });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => { refetchAll(); toast({ title: "Assignment updated" }); },
    onError: () => toast({ title: "Error", description: "Failed to update assignment", variant: "destructive" }),
  });

  // ─── Mark messages as read (bulk) ───────────────────────────
  useEffect(() => {
    if (!selectedConversation || selectedConversation.unreadCount === 0) return;
    let cancelled = false;

    const markRead = async () => {
      try {
        const headers = await authHeaders();
        const conversationId = selectedConversation.id;
        const unreadCount = selectedConversation.unreadCount;
        const res = await fetch(`/api/admin/support/conversations/${conversationId}/bulk-read`, { method: "PUT", headers });
        if (!res.ok || cancelled) return;

        // Update cache
        queryClient.setQueryData(["/api/admin/support/conversations"], (old: any) =>
          old?.map((c: any) => c.id === conversationId ? { ...c, support_messages: c.support_messages.map((m: any) => m.sender_type === "user" ? { ...m, is_read: true } : m), unreadCount: 0 } : c)
        );
        queryClient.setQueryData(["/api/admin/support/stats"], (old: AdminStats | undefined) => {
          if (!old) return old;
          return {
            ...old,
            unreadMessages: Math.max(0, old.unreadMessages - unreadCount),
          };
        });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-counts"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/support/stats"] });
        setSelectedConversation(prev => prev ? { ...prev, unreadCount: 0, support_messages: prev.support_messages.map(m => m.sender_type === "user" ? { ...m, is_read: true } : m) } : null);
      } catch {}
    };

    markRead();
    return () => {
      cancelled = true;
    };
  }, [selectedConversation?.id, selectedConversation?.unreadCount, queryClient]);

  // Keep selectedConversation in sync with refetched data
  useEffect(() => {
    if (selectedConversation && conversations) {
      const updated = conversations.find(c => c.id === selectedConversation.id);
      if (updated && JSON.stringify(updated.support_messages) !== JSON.stringify(selectedConversation.support_messages)) {
        setSelectedConversation(updated);
      }
    }
  }, [conversations]);

  // Auto-scroll
  // `block: "nearest"` keeps the scroll inside the message list instead of
  // yanking the whole page on mobile.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedConversation?.support_messages]);

  // ─── Filtering ───────────────────────────────────────────────
  const filteredConversations = useMemo(() => {
    if (!conversations) return [];
    return conversations.filter((c) => {
      const matchesSearch = !searchTerm ||
        c.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.users.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.users.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        `#${c.id}`.includes(searchTerm);
      const matchesStatus = filterStatus === "all" || c.status === filterStatus;
      const matchesPriority = filterPriority === "all" || c.priority === filterPriority;
      const matchesCategory = filterCategory === "all" || (c.category || "general") === filterCategory;
      return matchesSearch && matchesStatus && matchesPriority && matchesCategory;
    });
  }, [conversations, searchTerm, filterStatus, filterPriority, filterCategory]);

  // ─── Handlers ────────────────────────────────────────────────
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!message.trim() && !pendingImage) || !selectedConversation || sendMessageMutation.isPending || uploading) return;

    let messageType: "text" | "image" = "text";
    let attachmentUrl: string | undefined;

    if (pendingImage) {
      try {
        setUploading(true);
        const compressed = await compressAdminImage(pendingImage);
        const form = new FormData();
        form.append("file", compressed);

        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) throw new Error("No authentication token");

        const res = await fetch("/api/admin/support/upload-image", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: "Upload failed" }));
          throw new Error(err.message || "Upload failed");
        }
        const data = await res.json();
        attachmentUrl = data.attachmentUrl;
        messageType = "image";
        clearPendingImage();
      } catch (err: any) {
        toast({ title: "Image upload failed", description: err.message, variant: "destructive" });
        return;
      } finally {
        setUploading(false);
      }
    }

    const text = message.trim() || (messageType === "image" ? "(Image)" : "");
    if (!text) return;

    sendMessageMutation.mutate({
      conversationId: selectedConversation.id,
      message: text,
      messageType,
      attachmentUrl,
    });
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Only image files are allowed", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Image must be under 5 MB", variant: "destructive" });
      return;
    }
    setPendingImage(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPendingImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const clearPendingImage = () => {
    setPendingImage(null);
    setPendingImagePreview(null);
  };

  const handleTemplateSelect = (templateMessage: string) => {
    setMessage(templateMessage);
    setShowTemplates(false);
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filteredConversations.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredConversations.map(c => c.id)));
    }
  };

  // ─── Helpers ─────────────────────────────────────────────────
  const formatTime = (ts: string) => {
    const d = new Date(ts);
    const diff = (Date.now() - d.getTime()) / 3600000;
    if (diff < 1) return `${Math.max(1, Math.floor(diff * 60))}m ago`;
    if (diff < 24) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (diff < 168) return d.toLocaleDateString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString();
  };

  const statusConfig: Record<string, { icon: typeof Clock; color: string; bg: string }> = {
    open: { icon: Inbox, color: "text-info", bg: "bg-info/10 border-info/20" },
    in_progress: { icon: Clock, color: "text-warning", bg: "bg-warning/10 border-warning/20" },
    resolved: { icon: CheckCircle, color: "text-success", bg: "bg-success/10 border-success/20" },
    closed: { icon: XCircle, color: "text-muted-foreground", bg: "bg-muted border-border" },
  };

  const priorityConfig: Record<string, { color: string; bg: string }> = {
    low: { color: "text-muted-foreground", bg: "bg-muted border-border" },
    medium: { color: "text-info", bg: "bg-info/10 border-info/20" },
    high: { color: "text-warning", bg: "bg-warning/10 border-warning/20" },
    urgent: { color: "text-danger", bg: "bg-danger/10 border-danger/20" },
  };

  const categoryLabels: Record<string, string> = {
    general: "General", deposit: "Deposit", withdrawal: "Withdrawal", trading: "Trading",
    account: "Account", staking: "Staking", technical: "Technical", security: "Security",
  };

  // ─── Loading ─────────────────────────────────────────────────
  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Loading support system...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  // ─── Render ──────────────────────────────────────────────────
  return (
    <AdminLayout>
      <div className="w-full space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Support Center</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage customer conversations and provide assistance</p>
          </div>
          <div className="flex items-center gap-2">
            <EnablePushButton />
            <Button variant="outline" size="sm" onClick={() => refetchAll()} className="border-border text-muted-foreground hover:text-foreground hover:bg-muted">
              <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Total", value: stats.totalConversations, icon: MessageSquare, color: "text-muted-foreground", iconBg: "bg-muted" },
              { label: "Open", value: stats.openTickets, icon: Inbox, color: "text-info", iconBg: "bg-info/10" },
              { label: "In Progress", value: stats.inProgressTickets, icon: Clock, color: "text-warning", iconBg: "bg-warning/10" },
              { label: "Unread", value: stats.unreadMessages, icon: MessageCircle, color: "text-danger", iconBg: "bg-danger/10" },
              { label: "Urgent", value: stats.urgentTickets, icon: AlertTriangle, color: "text-danger", iconBg: "bg-danger/10" },
              { label: "Today", value: stats.todayTickets, icon: BarChart3, color: "text-success", iconBg: "bg-success/10" },
            ].map((s) => (
              <div key={s.label} className="bg-card rounded-xl border border-border shadow-sm p-3 hover:border-border/80 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{s.label}</p>
                  <div className={`w-7 h-7 ${s.iconBg} rounded-lg flex items-center justify-center`}>
                    <s.icon className={`h-3.5 w-3.5 ${s.color}`} />
                  </div>
                </div>
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Main Chat Layout — a fixed 70vh box left the mobile composer under the
            bottom navigation, so mobile gets a viewport-relative height instead. */}
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden h-[calc(100dvh-22rem)] min-h-[360px] lg:h-[70vh]">
          <div className="h-full grid grid-cols-1 lg:grid-cols-3 gap-0">
            {/* ─── Left Sidebar: Ticket list ────────────────────── */}
            <div className={`lg:border-r border-border flex flex-col overflow-hidden ${selectedConversation ? "hidden lg:flex" : "flex"}`}>
              {/* Search & Filters */}
              <div className="p-3 border-b border-border space-y-2">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search tickets..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9 rounded-lg border-border bg-background text-base sm:text-sm h-11 sm:h-9 text-foreground placeholder:text-muted-foreground focus:border-primary/40"
                    />
                  </div>
                  <Button
                    variant="outline" size="sm"
                    onClick={() => setShowFilters(!showFilters)}
                    className={`h-11 sm:h-9 px-3 rounded-lg border-border bg-background ${showFilters ? "text-primary border-primary/30" : "text-muted-foreground"} hover:text-foreground hover:bg-muted`}
                  >
                    <Filter className="h-4 w-4" />
                  </Button>
                </div>

                {showFilters && (
                  <div className="flex gap-2 flex-wrap">
                    <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="bg-background border border-border rounded-lg px-2 py-1 text-xs text-muted-foreground focus:outline-none">
                      <option value="all">All Status</option>
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                    <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="bg-background border border-border rounded-lg px-2 py-1 text-xs text-muted-foreground focus:outline-none">
                      <option value="all">All Priority</option>
                      <option value="urgent">Urgent</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                    <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="bg-background border border-border rounded-lg px-2 py-1 text-xs text-muted-foreground focus:outline-none">
                      <option value="all">All Categories</option>
                      {Object.entries(categoryLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                )}

                {/* Bulk actions */}
                {selectedIds.size > 0 && (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[11px] text-muted-foreground">{selectedIds.size} selected</span>
                    <Button size="sm" variant="outline" onClick={() => bulkStatusMutation.mutate({ ids: Array.from(selectedIds), status: "resolved" })} className="h-6 px-2 text-[10px] border-success/20 text-success hover:bg-success/10">
                      Resolve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => bulkStatusMutation.mutate({ ids: Array.from(selectedIds), status: "closed" })} className="h-6 px-2 text-[10px] border-border text-muted-foreground hover:bg-muted">
                      Close
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())} className="h-6 px-2 text-[10px] border-border text-muted-foreground hover:bg-muted">
                      Clear
                    </Button>
                  </div>
                )}
              </div>

              {/* Select All */}
              {filteredConversations.length > 0 && (
                <button onClick={selectAll} className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-muted-foreground hover:text-foreground border-b border-border transition-colors">
                  {selectedIds.size === filteredConversations.length ? <CheckSquare className="h-3 w-3" /> : <Square className="h-3 w-3" />}
                  {selectedIds.size === filteredConversations.length ? "Deselect all" : "Select all"}
                </button>
              )}

              {/* Conversation List */}
              <ScrollArea className="flex-1">
                {filteredConversations.length > 0 ? (
                  <div>
                    {filteredConversations.map((conv) => {
                      const sc = statusConfig[conv.status];
                      const pc = priorityConfig[conv.priority];
                      const StatusIcon = sc.icon;
                      const isSelected = selectedConversation?.id === conv.id;
                      const lastMsg = conv.support_messages[conv.support_messages.length - 1];

                      return (
                        <div
                          key={conv.id}
                          className={`relative p-3 border-b border-border cursor-pointer transition-colors group ${isSelected ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-muted/50"}`}
                        >
                          <div className="flex items-start gap-2.5">
                            {/* Checkbox */}
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleSelect(conv.id); }}
                              className="mt-1 text-muted-foreground/60 hover:text-muted-foreground transition-colors flex-shrink-0"
                            >
                              {selectedIds.has(conv.id) ? <CheckSquare className="h-3.5 w-3.5 text-primary" /> : <Square className="h-3.5 w-3.5" />}
                            </button>

                            {/* Content */}
                            <div className="flex-1 min-w-0" onClick={() => setSelectedConversation(conv)}>
                              <div className="flex items-center gap-2 mb-0.5">
                                <StatusIcon className={`h-3 w-3 ${sc.color} flex-shrink-0`} />
                                <h4 className="text-sm font-medium text-foreground truncate flex-1">{conv.users.full_name}</h4>
                                {conv.unreadCount > 0 && (
                                  <Badge className="bg-danger text-danger-foreground text-[9px] px-1.5 py-0 h-4 rounded-full border-transparent hover:bg-danger">{conv.unreadCount} new</Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground truncate mb-1">{conv.subject}</p>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`text-[9px] px-1.5 py-0.5 rounded border ${pc.bg} ${pc.color}`}>{conv.priority}</span>
                                {conv.category && conv.category !== "general" && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded border border-border text-muted-foreground">{categoryLabels[conv.category] || conv.category}</span>
                                )}
                                {conv.assigned_to && staffMap.get(conv.assigned_to) && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded border border-border text-muted-foreground flex items-center gap-0.5">
                                    <UserCheck className="h-2 w-2" /> {staffMap.get(conv.assigned_to)}
                                  </span>
                                )}
                                <span className="text-[10px] text-muted-foreground/70 ml-auto">{formatTime(conv.last_message_at)}</span>
                              </div>
                              {lastMsg && (
                                <p className={`text-[11px] truncate mt-1 ${conv.unreadCount > 0 ? "text-danger" : "text-muted-foreground"}`}>
                                  {lastMsg.sender_type === "admin" ? "You: " : ""}{lastMsg.message.substring(0, 60)}
                                </p>
                              )}
                              {conv.unreadCount > 0 && (
                                <p className="text-[10px] text-danger mt-1">Unread user messages in this chat</p>
                              )}
                            </div>
                          </div>

                          {/* Urgent indicator */}
                          {conv.priority === "urgent" && (
                            <div className="absolute top-0 right-0 w-0 h-0 border-t-[16px] border-t-danger border-l-[16px] border-l-transparent" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-8 text-center">
                    <MessageSquare className="h-8 w-8 mx-auto mb-3 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">{searchTerm || filterStatus !== "all" ? "No matching tickets" : "No conversations yet"}</p>
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* ─── Right: Chat area ─────────────────────────────
                 On mobile the open ticket takes over the screen so the reply box
                 always sits above the bottom navigation. */}
            <div
              className={`lg:col-span-2 flex flex-col overflow-hidden min-h-0 ${
                selectedConversation
                  ? "fixed inset-0 z-[70] bg-background lg:static lg:z-auto lg:bg-transparent flex"
                  : "hidden lg:flex"
              }`}
            >
              {selectedConversation ? (
                <>
                  {/* Chat Header */}
                  <div className="p-3 border-b border-border flex items-start gap-2 sm:gap-3 flex-shrink-0 bg-card chat-safe-top lg:pt-3">
                    <button
                      onClick={() => setSelectedConversation(null)}
                      className="lg:hidden h-10 w-10 flex-shrink-0 flex items-center justify-center rounded-lg active:bg-muted text-foreground"
                      aria-label="Back to ticket list"
                    >
                      <ArrowLeft size={20} />
                    </button>
                    <div className="hidden sm:flex w-9 h-9 bg-primary/10 rounded-xl items-center justify-center flex-shrink-0">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-sm text-foreground truncate">{selectedConversation.users.full_name}</h3>
                        <span className="text-[10px] text-muted-foreground/70">#{selectedConversation.id}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">{selectedConversation.users.email}</p>
                      <p className="text-[11px] text-muted-foreground/70 truncate mt-0.5">{selectedConversation.subject}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      {/* Status dropdown */}
                      <div className="relative">
                        <select
                          value={selectedConversation.status}
                          onChange={(e) => updateStatusMutation.mutate({ id: selectedConversation.id, status: e.target.value })}
                          className={`text-[11px] min-h-[34px] px-2 py-1 rounded-lg border appearance-none cursor-pointer pr-5 ${statusConfig[selectedConversation.status].bg} ${statusConfig[selectedConversation.status].color} bg-transparent focus:outline-none`}
                        >
                          <option value="open" className="bg-card text-foreground">Open</option>
                          <option value="in_progress" className="bg-card text-foreground">In Progress</option>
                          <option value="resolved" className="bg-card text-foreground">Resolved</option>
                          <option value="closed" className="bg-card text-foreground">Closed</option>
                        </select>
                        <ChevronDown className="h-3 w-3 absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
                      </div>
                      {/* Priority dropdown */}
                      <div className="relative">
                        <select
                          value={selectedConversation.priority}
                          onChange={(e) => updatePriorityMutation.mutate({ id: selectedConversation.id, priority: e.target.value })}
                          className={`text-[11px] min-h-[34px] px-2 py-1 rounded-lg border appearance-none cursor-pointer pr-5 ${priorityConfig[selectedConversation.priority].bg} ${priorityConfig[selectedConversation.priority].color} bg-transparent focus:outline-none`}
                        >
                          <option value="low" className="bg-card text-foreground">Low</option>
                          <option value="medium" className="bg-card text-foreground">Medium</option>
                          <option value="high" className="bg-card text-foreground">High</option>
                          <option value="urgent" className="bg-card text-foreground">Urgent</option>
                        </select>
                        <ChevronDown className="h-3 w-3 absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
                      </div>
                    </div>
                  </div>

                  {/* Ticket Info Bar */}
                  <div className="px-3 py-2 border-b border-border flex items-center gap-2 flex-wrap bg-muted/40">
                    {selectedConversation.category && (
                      <span className="text-[10px] px-2 py-0.5 rounded border border-border text-muted-foreground flex items-center gap-1">
                        <Tag className="h-2.5 w-2.5" /> {categoryLabels[selectedConversation.category] || selectedConversation.category}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground/70">Created: {formatDate(selectedConversation.created_at)}</span>
                    {selectedConversation.users.is_verified !== undefined && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${selectedConversation.users.is_verified ? "bg-success/10 text-success" : "bg-warning/10 text-warning"} border ${selectedConversation.users.is_verified ? "border-success/20" : "border-warning/20"}`}>
                        {selectedConversation.users.is_verified ? "Verified" : "Unverified"}
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-1.5">
                      <div className="relative">
                        <select
                          value={selectedConversation.assigned_to || ""}
                          onChange={(e) => assignMutation.mutate({ id: selectedConversation.id, assignedTo: e.target.value || null })}
                          className="text-[10px] h-6 pl-2 pr-5 rounded-lg border border-border text-muted-foreground bg-transparent appearance-none cursor-pointer focus:outline-none"
                          title="Assign ticket"
                        >
                          <option value="" className="bg-card text-foreground">Unassigned</option>
                          {staffList.map((s) => (
                            <option key={s.id} value={s.id} className="bg-card text-foreground">{s.full_name || s.username}</option>
                          ))}
                        </select>
                        <ChevronDown className="h-2.5 w-2.5 absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
                      </div>
                      {selectedConversation.priority !== "urgent" && (
                        <Button size="sm" variant="outline" onClick={() => escalateMutation.mutate(selectedConversation.id)} className="h-6 px-2 text-[10px] border-danger/20 text-danger hover:bg-danger/10 rounded-lg">
                          <Zap className="h-2.5 w-2.5 mr-1" /> Escalate
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Messages */}
                  <ScrollArea className="flex-1 min-h-0 px-4 py-3">
                    <div className="space-y-3">
                      {selectedConversation.support_messages?.length > 0 ? (
                        selectedConversation.support_messages.map((msg: SupportMessage) => {
                          const isSystem = (msg as any).message_type === "system";
                          if (isSystem) {
                            const { Icon: SystemIcon, text: systemText, tone } = getSystemMessageDisplay(msg.message);
                            const toneClasses = {
                              default: "bg-muted border-border text-muted-foreground",
                              success: "bg-success/10 border-success/25 text-success",
                              warning: "bg-warning/10 border-warning/25 text-warning",
                              danger: "bg-danger/10 border-danger/25 text-danger",
                            }[tone];
                            return (
                              <div key={msg.id} className="flex justify-center">
                                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-medium ${toneClasses}`}>
                                  <SystemIcon className="h-3 w-3 flex-shrink-0" />
                                  {systemText}
                                </div>
                              </div>
                            );
                          }

                          const isAdmin = msg.sender_type === "admin";
                          const isAutoReply = isAutoReplyMessage(msg.message);
                          const displayText = isAutoReply ? stripAutoReplyPrefix(msg.message) : msg.message;
                          return (
                            <div key={msg.id} className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}>
                              <div className={`flex items-end gap-2 max-w-[88%] sm:max-w-[80%] ${isAdmin ? "flex-row-reverse" : "flex-row"}`}>
                                <Avatar className="h-7 w-7 flex-shrink-0 ring-2 ring-background">
                                  <AvatarFallback className={`text-[10px] ${isAdmin ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                                    {isAdmin ? <Shield className="h-3 w-3" /> : <User className="h-3 w-3" />}
                                  </AvatarFallback>
                                </Avatar>
                                {/* Message text always reads left-to-right — only the
                                    bubble and its timestamp sit on the right. */}
                                <div className="space-y-0.5 text-left min-w-0">
                                  <div className={`px-3.5 py-2.5 rounded-2xl text-sm shadow-sm ${
                                    isAdmin ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted text-foreground rounded-bl-md border border-border"
                                  }`}>
                                    {msg.message_type === "image" && msg.attachment_url && (
                                      <div className="mb-1">
                                        <img
                                          src={getImageDisplayUrl(msg.attachment_url)}
                                          alt="Attachment"
                                          className="w-auto max-w-full sm:max-w-[16rem] md:max-w-xs max-h-52 rounded-xl cursor-pointer object-cover"
                                          onClick={() => openImageViewer(msg.attachment_url!, "Support Attachment")}
                                          loading="lazy"
                                          decoding="async"
                                        />
                                      </div>
                                    )}
                                    {displayText && displayText !== "(Image)" && (
                                      <p className="whitespace-pre-wrap break-words text-left leading-relaxed">{displayText}</p>
                                    )}
                                  </div>
                                  <div className={`flex items-center gap-1.5 text-[10px] text-muted-foreground ${isAdmin ? "justify-end" : "justify-start"}`}>
                                    {isAutoReply && (
                                      <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full flex items-center gap-1">
                                        <AutoReplyIcon className="h-2.5 w-2.5" /> Auto-Reply
                                      </span>
                                    )}
                                    <span>{formatTime(msg.created_at)}</span>
                                    {!isAdmin && !msg.is_read && <span className="w-1.5 h-1.5 bg-primary rounded-full" />}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-center py-12">
                          <MessageSquare className="h-8 w-8 mx-auto mb-3 text-muted-foreground/40" />
                          <p className="text-sm text-muted-foreground">No messages yet</p>
                        </div>
                      )}
                      {typingConversationId === selectedConversation.id && (
                        <div className="flex justify-start">
                          <div className="flex items-end gap-2 max-w-[88%] sm:max-w-[80%]">
                            <Avatar className="h-7 w-7 flex-shrink-0 ring-2 ring-background">
                              <AvatarFallback className="text-[10px] bg-muted text-muted-foreground">
                                <User className="h-3 w-3" />
                              </AvatarFallback>
                            </Avatar>
                            <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-muted border border-border shadow-sm">
                              <span className="flex gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "300ms" }} />
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                  </ScrollArea>

                  {/* Response Templates */}
                  {showTemplates && templates && (
                    <div className="border-t border-border bg-card max-h-56 overflow-y-auto shadow-[0_-4px_12px_-4px_rgba(0,0,0,0.08)]">
                      <div className="p-2.5">
                        <p className="text-[11px] text-muted-foreground font-semibold mb-2 px-1.5 flex items-center gap-1.5">
                          <FileText className="h-3 w-3" /> Quick Response Templates
                        </p>
                        {Object.entries(templates).map(([category, items]) => (
                          <div key={category} className="mb-2.5 last:mb-0">
                            <p className="text-[9px] text-muted-foreground/70 uppercase tracking-wider px-1.5 mb-1 font-semibold">{category}</p>
                            <div className="space-y-0.5">
                              {items.map((t, i) => (
                                <button
                                  key={i}
                                  onClick={() => handleTemplateSelect(t.message)}
                                  className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-muted transition-colors group"
                                >
                                  <p className="text-xs font-medium text-foreground/90 group-hover:text-foreground">{t.name}</p>
                                  <p className="text-[10px] text-muted-foreground/70 truncate">{t.message.substring(0, 80)}...</p>
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Message Input */}
                  <form onSubmit={handleSendMessage} className="p-3 border-t border-border flex-shrink-0 bg-card chat-safe-bottom lg:pb-3">
                    {/* Image preview strip */}
                    {pendingImagePreview && (
                      <div className="mb-2 flex items-center gap-2">
                        <div className="relative inline-block">
                          <img src={pendingImagePreview} alt="Preview" className="h-16 w-16 object-cover rounded-lg border border-border" />
                          <button
                            type="button"
                            onClick={clearPendingImage}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-danger rounded-full flex items-center justify-center hover:bg-danger/90 transition-colors"
                          >
                            <X className="h-3 w-3 text-danger-foreground" />
                          </button>
                        </div>
                        <span className="text-xs text-muted-foreground truncate max-w-[200px]">{pendingImage?.name}</span>
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageSelect}
                      className="hidden"
                    />
                    <div className="flex items-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowTemplates(!showTemplates)}
                        className={`rounded-lg self-end h-11 px-3 border-border ${showTemplates ? "text-primary bg-primary/5" : "text-muted-foreground"} hover:text-foreground hover:bg-muted`}
                        title="Response Templates"
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="rounded-lg self-end h-11 px-3 border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                        title="Attach Image"
                      >
                        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                      </Button>
                      <Textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Type your response..."
                        rows={1}
                        data-reply-input
                        /* text-base on mobile stops iOS Safari zooming in on focus */
                        className="flex-1 resize-none rounded-lg border-border bg-background text-base sm:text-sm min-h-[44px] max-h-28 text-foreground placeholder:text-muted-foreground focus:border-primary/40"
                        disabled={sendMessageMutation.isPending || uploading}
                        onKeyDown={(e) => {
                          // On touch keyboards Enter must insert a newline instead of sending
                          const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
                          if (isDesktop && e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            if (message.trim() || pendingImage) handleSendMessage(e);
                          }
                        }}
                      />
                      <Button
                        type="submit"
                        disabled={(!message.trim() && !pendingImage) || sendMessageMutation.isPending || uploading}
                        className="rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground self-end h-11 w-11 p-0 flex-shrink-0"
                      >
                        {sendMessageMutation.isPending || uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </Button>
                    </div>
                  </form>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-muted rounded-xl mx-auto mb-4 flex items-center justify-center">
                      <MessageSquare className="h-8 w-8 text-muted-foreground/60" />
                    </div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-1">Select a Conversation</h3>
                    <p className="text-xs text-muted-foreground/70">Choose a ticket from the list to start responding</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
