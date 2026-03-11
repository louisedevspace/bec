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
  ArrowUpRight, Inbox, Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDataSync } from "@/hooks/use-data-sync";
import { supabase } from "@/lib/supabaseClient";
import AdminLayout from "./admin-layout";
import type { SupportMessage, SendSupportMessageData } from "@/types/support";

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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { invalidateQueries } = useDataSync();

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
    refetchInterval: 5000,
  });

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
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [selectedConversation?.support_messages]);

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
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !selectedConversation || sendMessageMutation.isPending) return;
    sendMessageMutation.mutate({ conversationId: selectedConversation.id, message: message.trim(), messageType: "text" });
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
    open: { icon: Inbox, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
    in_progress: { icon: Clock, color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20" },
    resolved: { icon: CheckCircle, color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" },
    closed: { icon: XCircle, color: "text-gray-500", bg: "bg-gray-500/10 border-gray-500/20" },
  };

  const priorityConfig: Record<string, { color: string; bg: string }> = {
    low: { color: "text-gray-400", bg: "bg-gray-500/10 border-gray-500/20" },
    medium: { color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
    high: { color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
    urgent: { color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
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
            <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Loading support system...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  // ─── Render ──────────────────────────────────────────────────
  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-white">Support Center</h1>
            <p className="text-sm text-gray-500 mt-1">Manage customer conversations and provide assistance</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetchAll()} className="bg-transparent border-[#2a2a2a] text-gray-400 hover:text-white hover:bg-[#1a1a1a]">
            <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
          </Button>
        </div>

        {/* Stats Grid */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Total", value: stats.totalConversations, icon: MessageSquare, color: "text-gray-400", iconBg: "bg-[#1a1a1a]" },
              { label: "Open", value: stats.openTickets, icon: Inbox, color: "text-blue-400", iconBg: "bg-blue-500/10" },
              { label: "In Progress", value: stats.inProgressTickets, icon: Clock, color: "text-yellow-400", iconBg: "bg-yellow-500/10" },
              { label: "Unread", value: stats.unreadMessages, icon: MessageCircle, color: "text-red-400", iconBg: "bg-red-500/10" },
              { label: "Urgent", value: stats.urgentTickets, icon: AlertTriangle, color: "text-red-400", iconBg: "bg-red-500/10" },
              { label: "Today", value: stats.todayTickets, icon: BarChart3, color: "text-green-400", iconBg: "bg-green-500/10" },
            ].map((s) => (
              <div key={s.label} className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-3 hover:border-[#2a2a2a] transition-all">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">{s.label}</p>
                  <div className={`w-7 h-7 ${s.iconBg} rounded-lg flex items-center justify-center`}>
                    <s.icon className={`h-3.5 w-3.5 ${s.color}`} />
                  </div>
                </div>
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Main Chat Layout */}
        <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-3 h-[68vh]">
            {/* ─── Left Sidebar: Ticket list ────────────────────── */}
            <div className={`lg:border-r border-[#1e1e1e] flex flex-col min-h-0 ${selectedConversation ? "hidden lg:flex" : "flex"}`}>
              {/* Search & Filters */}
              <div className="p-3 border-b border-[#1e1e1e] space-y-2">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <Input
                      placeholder="Search tickets..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9 rounded-xl border-[#1e1e1e] bg-[#0a0a0a] text-sm h-9 text-white placeholder:text-gray-500 focus:border-[#2a2a2a]"
                    />
                  </div>
                  <Button
                    variant="outline" size="sm"
                    onClick={() => setShowFilters(!showFilters)}
                    className={`h-9 px-2.5 rounded-xl border-[#1e1e1e] bg-[#0a0a0a] ${showFilters ? "text-blue-400 border-blue-500/30" : "text-gray-500"} hover:text-white hover:bg-[#1a1a1a]`}
                  >
                    <Filter className="h-4 w-4" />
                  </Button>
                </div>

                {showFilters && (
                  <div className="flex gap-2 flex-wrap">
                    <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="bg-[#0a0a0a] border border-[#1e1e1e] rounded-lg px-2 py-1 text-xs text-gray-400 focus:outline-none">
                      <option value="all">All Status</option>
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                    <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="bg-[#0a0a0a] border border-[#1e1e1e] rounded-lg px-2 py-1 text-xs text-gray-400 focus:outline-none">
                      <option value="all">All Priority</option>
                      <option value="urgent">Urgent</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                    <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="bg-[#0a0a0a] border border-[#1e1e1e] rounded-lg px-2 py-1 text-xs text-gray-400 focus:outline-none">
                      <option value="all">All Categories</option>
                      {Object.entries(categoryLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                )}

                {/* Bulk actions */}
                {selectedIds.size > 0 && (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[11px] text-gray-500">{selectedIds.size} selected</span>
                    <Button size="sm" variant="outline" onClick={() => bulkStatusMutation.mutate({ ids: Array.from(selectedIds), status: "resolved" })} className="h-6 px-2 text-[10px] border-green-500/20 text-green-400 hover:bg-green-500/10">
                      Resolve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => bulkStatusMutation.mutate({ ids: Array.from(selectedIds), status: "closed" })} className="h-6 px-2 text-[10px] border-gray-500/20 text-gray-400 hover:bg-gray-500/10">
                      Close
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())} className="h-6 px-2 text-[10px] border-[#1e1e1e] text-gray-500 hover:bg-[#1a1a1a]">
                      Clear
                    </Button>
                  </div>
                )}
              </div>

              {/* Select All */}
              {filteredConversations.length > 0 && (
                <button onClick={selectAll} className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-gray-500 hover:text-gray-300 border-b border-[#1e1e1e] transition-colors">
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
                          className={`relative p-3 border-b border-[#1e1e1e] cursor-pointer transition-colors group ${isSelected ? "bg-blue-500/5 border-l-2 border-l-blue-500" : "hover:bg-[#0d0d0d]"}`}
                        >
                          <div className="flex items-start gap-2.5">
                            {/* Checkbox */}
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleSelect(conv.id); }}
                              className="mt-1 text-gray-600 hover:text-gray-300 transition-colors flex-shrink-0"
                            >
                              {selectedIds.has(conv.id) ? <CheckSquare className="h-3.5 w-3.5 text-blue-400" /> : <Square className="h-3.5 w-3.5" />}
                            </button>

                            {/* Content */}
                            <div className="flex-1 min-w-0" onClick={() => setSelectedConversation(conv)}>
                              <div className="flex items-center gap-2 mb-0.5">
                                <StatusIcon className={`h-3 w-3 ${sc.color} flex-shrink-0`} />
                                <h4 className="text-sm font-medium text-white truncate flex-1">{conv.users.full_name}</h4>
                                {conv.unreadCount > 0 && (
                                  <Badge className="bg-red-500 text-white text-[9px] px-1.5 py-0 h-4 rounded-full">{conv.unreadCount} new</Badge>
                                )}
                              </div>
                              <p className="text-xs text-gray-400 truncate mb-1">{conv.subject}</p>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`text-[9px] px-1.5 py-0.5 rounded border ${pc.bg} ${pc.color}`}>{conv.priority}</span>
                                {conv.category && conv.category !== "general" && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded border border-[#2a2a2a] text-gray-500">{categoryLabels[conv.category] || conv.category}</span>
                                )}
                                <span className="text-[10px] text-gray-600 ml-auto">{formatTime(conv.last_message_at)}</span>
                              </div>
                              {lastMsg && (
                                <p className={`text-[11px] truncate mt-1 ${conv.unreadCount > 0 ? "text-red-300" : "text-gray-500"}`}>
                                  {lastMsg.sender_type === "admin" ? "You: " : ""}{lastMsg.message.substring(0, 60)}
                                </p>
                              )}
                              {conv.unreadCount > 0 && (
                                <p className="text-[10px] text-red-400 mt-1">Unread user messages in this chat</p>
                              )}
                            </div>
                          </div>

                          {/* Urgent indicator */}
                          {conv.priority === "urgent" && (
                            <div className="absolute top-0 right-0 w-0 h-0 border-t-[16px] border-t-red-500 border-l-[16px] border-l-transparent" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-8 text-center">
                    <MessageSquare className="h-8 w-8 mx-auto mb-3 text-gray-700" />
                    <p className="text-sm text-gray-500">{searchTerm || filterStatus !== "all" ? "No matching tickets" : "No conversations yet"}</p>
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* ─── Right: Chat area ─────────────────────────────── */}
            <div className={`lg:col-span-2 flex flex-col min-h-0 overflow-hidden ${selectedConversation ? "flex" : "hidden lg:flex"}`}>
              {selectedConversation ? (
                <>
                  {/* Chat Header */}
                  <div className="p-3 border-b border-[#1e1e1e] flex items-start gap-3">
                    <button onClick={() => setSelectedConversation(null)} className="lg:hidden p-1.5 rounded-lg hover:bg-[#1a1a1a] text-gray-400 mt-0.5">
                      <ArrowLeft size={18} />
                    </button>
                    <div className="w-9 h-9 bg-gradient-to-br from-blue-500/20 to-indigo-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                      <User className="h-4 w-4 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-sm text-white truncate">{selectedConversation.users.full_name}</h3>
                        <span className="text-[10px] text-gray-600">#{selectedConversation.id}</span>
                      </div>
                      <p className="text-[11px] text-gray-500 truncate">{selectedConversation.users.email}</p>
                      <p className="text-[11px] text-gray-600 truncate mt-0.5">{selectedConversation.subject}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      {/* Status dropdown */}
                      <div className="relative">
                        <select
                          value={selectedConversation.status}
                          onChange={(e) => updateStatusMutation.mutate({ id: selectedConversation.id, status: e.target.value })}
                          className={`text-[10px] px-2 py-1 rounded-lg border appearance-none cursor-pointer pr-5 ${statusConfig[selectedConversation.status].bg} ${statusConfig[selectedConversation.status].color} bg-transparent focus:outline-none`}
                        >
                          <option value="open" className="bg-[#111] text-white">Open</option>
                          <option value="in_progress" className="bg-[#111] text-white">In Progress</option>
                          <option value="resolved" className="bg-[#111] text-white">Resolved</option>
                          <option value="closed" className="bg-[#111] text-white">Closed</option>
                        </select>
                        <ChevronDown className="h-3 w-3 absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500" />
                      </div>
                      {/* Priority dropdown */}
                      <div className="relative">
                        <select
                          value={selectedConversation.priority}
                          onChange={(e) => updatePriorityMutation.mutate({ id: selectedConversation.id, priority: e.target.value })}
                          className={`text-[10px] px-2 py-1 rounded-lg border appearance-none cursor-pointer pr-5 ${priorityConfig[selectedConversation.priority].bg} ${priorityConfig[selectedConversation.priority].color} bg-transparent focus:outline-none`}
                        >
                          <option value="low" className="bg-[#111] text-white">Low</option>
                          <option value="medium" className="bg-[#111] text-white">Medium</option>
                          <option value="high" className="bg-[#111] text-white">High</option>
                          <option value="urgent" className="bg-[#111] text-white">Urgent</option>
                        </select>
                        <ChevronDown className="h-3 w-3 absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500" />
                      </div>
                    </div>
                  </div>

                  {/* Ticket Info Bar */}
                  <div className="px-3 py-2 border-b border-[#1e1e1e] flex items-center gap-2 flex-wrap bg-[#0d0d0d]">
                    {selectedConversation.category && (
                      <span className="text-[10px] px-2 py-0.5 rounded border border-[#2a2a2a] text-gray-500 flex items-center gap-1">
                        <Tag className="h-2.5 w-2.5" /> {categoryLabels[selectedConversation.category] || selectedConversation.category}
                      </span>
                    )}
                    <span className="text-[10px] text-gray-600">Created: {formatDate(selectedConversation.created_at)}</span>
                    {selectedConversation.users.is_verified !== undefined && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${selectedConversation.users.is_verified ? "bg-green-500/10 text-green-400" : "bg-yellow-500/10 text-yellow-400"} border ${selectedConversation.users.is_verified ? "border-green-500/20" : "border-yellow-500/20"}`}>
                        {selectedConversation.users.is_verified ? "Verified" : "Unverified"}
                      </span>
                    )}
                    <div className="ml-auto flex gap-1.5">
                      {selectedConversation.priority !== "urgent" && (
                        <Button size="sm" variant="outline" onClick={() => escalateMutation.mutate(selectedConversation.id)} className="h-6 px-2 text-[10px] border-red-500/20 text-red-400 hover:bg-red-500/10 rounded-lg">
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
                            return (
                              <div key={msg.id} className="flex justify-center">
                                <div className="px-3 py-1.5 rounded-full bg-[#1a1a1a] border border-[#2a2a2a]">
                                  <p className="text-[11px] text-gray-500">{msg.message}</p>
                                </div>
                              </div>
                            );
                          }

                          const isAdmin = msg.sender_type === "admin";
                          return (
                            <div key={msg.id} className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}>
                              <div className={`flex items-end gap-2 max-w-[80%] ${isAdmin ? "flex-row-reverse" : "flex-row"}`}>
                                <Avatar className="h-7 w-7 flex-shrink-0">
                                  <AvatarFallback className={`text-[10px] ${isAdmin ? "bg-blue-600 text-white" : "bg-[#1a1a1a] text-gray-400"}`}>
                                    {isAdmin ? <Shield className="h-3 w-3" /> : <User className="h-3 w-3" />}
                                  </AvatarFallback>
                                </Avatar>
                                <div className={`space-y-0.5 ${isAdmin ? "text-right" : "text-left"}`}>
                                  <div className={`px-3.5 py-2.5 rounded-2xl text-sm ${
                                    isAdmin ? "bg-blue-600 text-white rounded-br-md" : "bg-[#1a1a1a] text-gray-300 rounded-bl-md border border-[#2a2a2a]"
                                  }`}>
                                    <p className="whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                                  </div>
                                  <div className={`flex items-center gap-1.5 text-[10px] text-gray-500 ${isAdmin ? "justify-end" : "justify-start"}`}>
                                    <span>{formatTime(msg.created_at)}</span>
                                    {!isAdmin && !msg.is_read && <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-center py-12">
                          <MessageSquare className="h-8 w-8 mx-auto mb-3 text-gray-700" />
                          <p className="text-sm text-gray-500">No messages yet</p>
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                  </ScrollArea>

                  {/* Response Templates */}
                  {showTemplates && templates && (
                    <div className="border-t border-[#1e1e1e] bg-[#0d0d0d] max-h-48 overflow-y-auto">
                      <div className="p-2">
                        <p className="text-[11px] text-gray-500 font-medium mb-2 px-2">Quick Response Templates</p>
                        {Object.entries(templates).map(([category, items]) => (
                          <div key={category} className="mb-2">
                            <p className="text-[10px] text-gray-600 uppercase tracking-wider px-2 mb-1">{category}</p>
                            {items.map((t, i) => (
                              <button
                                key={i}
                                onClick={() => handleTemplateSelect(t.message)}
                                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-[#1a1a1a] transition-colors group"
                              >
                                <p className="text-xs text-gray-300 group-hover:text-white">{t.name}</p>
                                <p className="text-[10px] text-gray-600 truncate">{t.message.substring(0, 80)}...</p>
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Message Input */}
                  <form onSubmit={handleSendMessage} className="p-3 border-t border-[#1e1e1e]">
                    <div className="flex items-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowTemplates(!showTemplates)}
                        className={`rounded-xl self-end h-10 px-3 border-[#1e1e1e] ${showTemplates ? "text-blue-400 bg-blue-500/5" : "text-gray-500"} hover:text-white hover:bg-[#1a1a1a]`}
                        title="Response Templates"
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                      <Textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Type your response..."
                        rows={1}
                        className="flex-1 resize-none rounded-xl border-[#1e1e1e] bg-[#0a0a0a] text-sm min-h-[40px] max-h-24 text-white placeholder:text-gray-500 focus:border-[#2a2a2a]"
                        disabled={sendMessageMutation.isPending}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (message.trim()) handleSendMessage(e); }
                        }}
                      />
                      <Button
                        type="submit"
                        disabled={!message.trim() || sendMessageMutation.isPending}
                        className="rounded-xl bg-blue-600 hover:bg-blue-700 self-end h-10 w-10 p-0 flex-shrink-0"
                      >
                        {sendMessageMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </Button>
                    </div>
                  </form>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-[#1a1a1a] rounded-2xl mx-auto mb-4 flex items-center justify-center">
                      <MessageSquare className="h-8 w-8 text-gray-600" />
                    </div>
                    <h3 className="text-sm font-semibold text-gray-400 mb-1">Select a Conversation</h3>
                    <p className="text-xs text-gray-600">Choose a ticket from the list to start responding</p>
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
