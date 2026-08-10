import { useEffect, useState, useCallback, useRef } from "react";
import AdminLayout from "./admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";
import {
  Loader2, Send, Users, Bell, CheckCircle, AlertCircle,
  History, FileText, Wifi, Search, RefreshCw, Eye,
  Plus, Edit, Trash2, Copy, Monitor, Smartphone,
  TrendingUp, ChevronLeft, ChevronRight,
  AlertTriangle, Link2, X
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────

type NotificationStats = {
  totalUsers: number;
  pushSubscribers: number;
  totalSubscriptions: number;
  platforms: Record<string, number>;
  totalBroadcasts: number;
  recentNotifications: number;
  recentSuccess: number;
  recentFailed: number;
  subscriptionRate: string;
};

type SendResult = {
  success: boolean;
  totalUsers: number;
  sentCount: number;
  failedCount: number;
  skippedCount?: number;
  message: string;
  errors?: string[];
};

type Broadcast = {
  id: number;
  title: string;
  body: string;
  deeplink_url?: string;
  target_role: string;
  total_users: number;
  sent_count: number;
  failed_count: number;
  status: string;
  sent_by: string | null;
  sent_at: string;
  created_at: string;
};

type BroadcastDetail = {
  broadcast: Broadcast;
  deliveryLogs: Array<{
    id: number;
    user_id: string;
    status: string;
    error: string | null;
    delivered_at: string | null;
    created_at: string;
  }>;
  deliveryStats: Record<string, number>;
};

type Template = {
  id: number;
  name: string;
  title: string;
  body: string;
  deeplink_url?: string;
  created_at: string;
  updated_at: string;
};

type Subscriber = {
  id: number;
  user_id: string;
  platform: string;
  user_agent: string;
  created_at: string;
  updated_at: string;
  user_email: string;
  user_name: string;
};

// ─── Helpers ─────────────────────────────────────────────────

async function apiFetch(url: string, options?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Request failed");
  return data;
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "completed": return "bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/10";
    case "pending": return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20 hover:bg-yellow-500/10";
    case "failed": return "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/10";
    default: return "bg-gray-500/10 text-gray-400 border-gray-500/20 hover:bg-gray-500/10";
  }
}

// ─── Main Component ──────────────────────────────────────────

export default function AdminStreamlinedNotifications() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("send");
  const [stats, setStats] = useState<NotificationStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Compose form state
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [deeplink, setDeeplink] = useState("");
  const [selectedRole, setSelectedRole] = useState("all");
  const [isVerified, setIsVerified] = useState("any");
  const [isActive, setIsActive] = useState("any");
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<SendResult | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // History state
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyTotalPages, setHistoryTotalPages] = useState(0);
  const [historySearch, setHistorySearch] = useState("");
  const [historySearchDebounced, setHistorySearchDebounced] = useState("");
  const [historyStatus, setHistoryStatus] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedBroadcastDetail, setSelectedBroadcastDetail] = useState<BroadcastDetail | null>(null);
  const [showBroadcastDetail, setShowBroadcastDetail] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  // Templates state
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [templateForm, setTemplateForm] = useState({ name: "", title: "", body: "", deeplink_url: "" });
  const [templateSaving, setTemplateSaving] = useState(false);

  // Subscribers state
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [subsPage, setSubsPage] = useState(1);
  const [subsTotal, setSubsTotal] = useState(0);
  const [subsTotalPages, setSubsTotalPages] = useState(0);
  const [subsLoading, setSubsLoading] = useState(false);
  const [testPushLoading, setTestPushLoading] = useState(false);

  // Debounce search
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setHistorySearchDebounced(historySearch);
      setHistoryPage(1);
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [historySearch]);

  // ─── Data Fetching ──────────────────────────────────────

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const data = await apiFetch("/api/admin/notifications/streamlined/stats");
      setStats(data);
    } catch {
      // Stats fetch silently fails
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(historyPage),
        limit: "15",
        ...(historySearchDebounced && { search: historySearchDebounced }),
        ...(historyStatus && { status: historyStatus }),
      });
      const data = await apiFetch(`/api/admin/notifications/streamlined/history?${params}`);
      setBroadcasts(data.broadcasts);
      setHistoryTotal(data.total);
      setHistoryTotalPages(data.totalPages);
    } catch {
      toast({ title: "Error", description: "Failed to load broadcast history", variant: "destructive" });
    } finally {
      setHistoryLoading(false);
    }
  }, [historyPage, historySearchDebounced, historyStatus, toast]);

  const fetchTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const data = await apiFetch("/api/admin/notifications/templates");
      setTemplates(Array.isArray(data) ? data : []);
    } catch {
      // Silently fail
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  const fetchSubscribers = useCallback(async () => {
    setSubsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(subsPage), limit: "20" });
      const data = await apiFetch(`/api/admin/notifications/streamlined/subscribers?${params}`);
      setSubscribers(data.subscribers);
      setSubsTotal(data.total);
      setSubsTotalPages(data.totalPages);
    } catch {
      // Silently fail
    } finally {
      setSubsLoading(false);
    }
  }, [subsPage]);

  // Fetch on mount + tab change
  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => {
    if (activeTab === "history") fetchHistory();
  }, [activeTab, fetchHistory]);
  useEffect(() => {
    if (activeTab === "templates") fetchTemplates();
  }, [activeTab, fetchTemplates]);
  useEffect(() => {
    if (activeTab === "subscribers") fetchSubscribers();
  }, [activeTab, fetchSubscribers]);

  // ─── Handlers ───────────────────────────────────────────

  function getAudienceDescription() {
    const parts: string[] = [];
    parts.push(selectedRole === "all" ? "all users" : `${selectedRole} users`);
    if (isVerified === "true") parts.push("verified only");
    if (isVerified === "false") parts.push("unverified only");
    if (isActive === "true") parts.push("active only");
    if (isActive === "false") parts.push("inactive only");
    return parts.join(", ");
  }

  function handleReviewSend() {
    if (!title.trim() || !body.trim()) {
      toast({ title: "Validation Error", description: "Title and body are required", variant: "destructive" });
      return;
    }
    setShowConfirmDialog(true);
  }

  async function handleConfirmedSend() {
    setSending(true);
    setLastResult(null);
    try {
      const result = await apiFetch("/api/admin/notifications/streamlined/send", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          role: selectedRole === "all" ? undefined : selectedRole,
          channel: "push",
          deeplink_url: deeplink.trim() || undefined,
          is_verified: isVerified === "any" ? undefined : isVerified === "true",
          is_active: isActive === "any" ? undefined : isActive === "true",
        }),
      });
      setLastResult(result);
      toast({ title: "Notification Sent", description: result.message, duration: 5000 });
      setTitle("");
      setBody("");
      setDeeplink("");
      setSelectedRole("all");
      setIsVerified("any");
      setIsActive("any");
      fetchStats();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive", duration: 5000 });
    } finally {
      setSending(false);
      setShowConfirmDialog(false);
    }
  }

  async function viewBroadcastDetail(id: number) {
    setDetailLoading(true);
    setShowBroadcastDetail(true);
    try {
      const data = await apiFetch(`/api/admin/notifications/streamlined/history/${id}`);
      setSelectedBroadcastDetail(data);
    } catch {
      toast({ title: "Error", description: "Failed to load broadcast details", variant: "destructive" });
      setShowBroadcastDetail(false);
    } finally {
      setDetailLoading(false);
    }
  }

  // Template handlers
  function openTemplateDialog(template?: Template) {
    if (template) {
      setEditingTemplate(template);
      setTemplateForm({ name: template.name, title: template.title, body: template.body, deeplink_url: template.deeplink_url || "" });
    } else {
      setEditingTemplate(null);
      setTemplateForm({ name: "", title: "", body: "", deeplink_url: "" });
    }
    setShowTemplateDialog(true);
  }

  async function saveTemplate() {
    if (!templateForm.name.trim() || !templateForm.title.trim() || !templateForm.body.trim()) {
      toast({ title: "Validation Error", description: "Name, title, and body are required", variant: "destructive" });
      return;
    }
    setTemplateSaving(true);
    try {
      if (editingTemplate) {
        await apiFetch(`/api/admin/notifications/streamlined/templates/${editingTemplate.id}`, {
          method: "PUT",
          body: JSON.stringify(templateForm),
        });
        toast({ title: "Template Updated", description: `"${templateForm.name}" updated successfully` });
      } else {
        await apiFetch("/api/admin/notifications/templates", {
          method: "POST",
          body: JSON.stringify({
            ...templateForm,
            channel: "push",
          }),
        });
        toast({ title: "Template Created", description: `"${templateForm.name}" created successfully` });
      }
      setShowTemplateDialog(false);
      fetchTemplates();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setTemplateSaving(false);
    }
  }

  async function deleteTemplate(id: number, name: string) {
    try {
      await apiFetch(`/api/admin/notifications/streamlined/templates/${id}`, { method: "DELETE" });
      toast({ title: "Template Deleted", description: `"${name}" deleted` });
      fetchTemplates();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  }

  function useTemplate(t: Template) {
    setTitle(t.title);
    setBody(t.body);
    setDeeplink(t.deeplink_url || "");
    setActiveTab("send");
    toast({ title: "Template Loaded", description: `"${t.name}" applied to compose form` });
  }

  async function handleTestPush() {
    setTestPushLoading(true);
    try {
      const data = await apiFetch("/api/push/test", { method: "POST" });
      toast({
        title: "Test Push Sent",
        description: `Sent: ${data.sent}, Failed: ${data.failed}, Cleaned: ${data.cleaned || 0}`,
      });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setTestPushLoading(false);
    }
  }

  // ─── Render ─────────────────────────────────────────────

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-white">Notification Center</h1>
            <p className="text-sm text-gray-500 mt-1">Send, manage, and track push notifications</p>
          </div>
          <Button
            onClick={fetchStats}
            variant="outline"
            size="sm"
            disabled={statsLoading}
            className="gap-2 bg-[#111] border-[#1e1e1e] text-gray-400 hover:text-white hover:bg-[#1a1a1a]"
          >
            <RefreshCw className={`h-4 w-4 ${statsLoading ? "animate-spin" : ""}`} />
            Refresh Stats
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Total Users", value: stats?.totalUsers || 0, icon: Users, color: "text-gray-400" },
            { label: "Push Subscribers", value: stats?.pushSubscribers || 0, icon: Bell, color: "text-blue-400" },
            { label: "Sub Rate", value: `${stats?.subscriptionRate || "0"}%`, icon: TrendingUp, color: "text-green-400" },
            { label: "Total Broadcasts", value: stats?.totalBroadcasts || 0, icon: Send, color: "text-purple-400" },
            { label: "Recent Success", value: stats?.recentSuccess || 0, icon: CheckCircle, color: "text-emerald-400" },
            { label: "Recent Failed", value: stats?.recentFailed || 0, icon: AlertCircle, color: "text-red-400" },
          ].map((s) => (
            <Card key={s.label} className="bg-[#111] border-[#1e1e1e]">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider">{s.label}</p>
                    <p className="text-xl font-bold text-white mt-1">
                      {typeof s.value === "number" ? s.value.toLocaleString() : s.value}
                    </p>
                  </div>
                  <s.icon className={`h-5 w-5 ${s.color}`} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-[#111] border border-[#1e1e1e] w-full grid grid-cols-4 h-11">
            <TabsTrigger value="send" className="gap-1.5 text-xs data-[state=active]:bg-blue-500/10 data-[state=active]:text-blue-400 text-gray-400">
              <Send className="h-3.5 w-3.5" /> Send
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5 text-xs data-[state=active]:bg-blue-500/10 data-[state=active]:text-blue-400 text-gray-400">
              <History className="h-3.5 w-3.5" /> History
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-1.5 text-xs data-[state=active]:bg-blue-500/10 data-[state=active]:text-blue-400 text-gray-400">
              <FileText className="h-3.5 w-3.5" /> Templates
            </TabsTrigger>
            <TabsTrigger value="subscribers" className="gap-1.5 text-xs data-[state=active]:bg-blue-500/10 data-[state=active]:text-blue-400 text-gray-400">
              <Wifi className="h-3.5 w-3.5" /> Subscribers
            </TabsTrigger>
          </TabsList>

          {/* ═══════════ TAB 1: SEND ═══════════ */}
          <TabsContent value="send" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Compose Form (2/3) */}
              <div className="lg:col-span-2 space-y-4">
                <Card className="bg-[#111] border-[#1e1e1e]">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-white text-sm flex items-center gap-2">
                      <Send className="h-4 w-4 text-blue-400" /> Compose Notification
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-gray-400 text-xs">Title *</Label>
                      <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Enter notification title..."
                        maxLength={100}
                        disabled={sending}
                        className="bg-[#0a0a0a] border-[#2a2a2a] text-white"
                      />
                      <p className={`text-[10px] ${title.length > 90 ? "text-amber-400" : "text-gray-600"}`}>
                        {title.length}/100
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-gray-400 text-xs">Message *</Label>
                      <Textarea
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        placeholder="Enter your notification message..."
                        rows={4}
                        maxLength={500}
                        disabled={sending}
                        className="bg-[#0a0a0a] border-[#2a2a2a] text-white resize-none"
                      />
                      <p className={`text-[10px] ${body.length > 450 ? "text-amber-400" : "text-gray-600"}`}>
                        {body.length}/500
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-gray-400 text-xs flex items-center gap-1">
                        <Link2 className="h-3 w-3" /> Deep-link URL (optional)
                      </Label>
                      <Input
                        value={deeplink}
                        onChange={(e) => setDeeplink(e.target.value)}
                        placeholder="/futures or /wallet"
                        disabled={sending}
                        className="bg-[#0a0a0a] border-[#2a2a2a] text-white"
                      />
                    </div>

                    {/* Audience Targeting */}
                    <div className="border-t border-[#1e1e1e] pt-4 mt-2">
                      <p className="text-xs font-medium text-gray-400 mb-3">Audience Targeting</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className="text-gray-500 text-[10px]">Role</Label>
                          <Select value={selectedRole} onValueChange={setSelectedRole} disabled={sending}>
                            <SelectTrigger className="bg-[#0a0a0a] border-[#2a2a2a] text-white text-xs h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-[#111] border-[#1e1e1e]">
                              <SelectItem value="all" className="text-white text-xs">All Users</SelectItem>
                              <SelectItem value="user" className="text-white text-xs">Regular Users</SelectItem>
                              <SelectItem value="admin" className="text-white text-xs">Administrators</SelectItem>
                              <SelectItem value="moderator" className="text-white text-xs">Moderators</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-gray-500 text-[10px]">Verified</Label>
                          <Select value={isVerified} onValueChange={setIsVerified} disabled={sending}>
                            <SelectTrigger className="bg-[#0a0a0a] border-[#2a2a2a] text-white text-xs h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-[#111] border-[#1e1e1e]">
                              <SelectItem value="any" className="text-white text-xs">Any</SelectItem>
                              <SelectItem value="true" className="text-white text-xs">Verified Only</SelectItem>
                              <SelectItem value="false" className="text-white text-xs">Unverified Only</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-gray-500 text-[10px]">Active</Label>
                          <Select value={isActive} onValueChange={setIsActive} disabled={sending}>
                            <SelectTrigger className="bg-[#0a0a0a] border-[#2a2a2a] text-white text-xs h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-[#111] border-[#1e1e1e]">
                              <SelectItem value="any" className="text-white text-xs">Any</SelectItem>
                              <SelectItem value="true" className="text-white text-xs">Active Only</SelectItem>
                              <SelectItem value="false" className="text-white text-xs">Inactive Only</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    {/* Action Bar */}
                    <div className="flex items-center justify-between pt-3 border-t border-[#1e1e1e]">
                      <p className="text-[11px] text-gray-500">
                        Target: <span className="text-gray-300">{getAudienceDescription()}</span>
                      </p>
                      <Button
                        onClick={handleReviewSend}
                        disabled={sending || !title.trim() || !body.trim()}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        {sending ? (
                          <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...</>
                        ) : (
                          <><Send className="mr-2 h-4 w-4" /> Review & Send</>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Last Result */}
                {lastResult && (
                  <Card className="bg-[#111] border-[#1e1e1e]">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <CheckCircle className="h-4 w-4 text-green-400" />
                        <p className="text-sm font-medium text-white">Notification Sent</p>
                        <Button variant="ghost" size="sm" className="ml-auto h-6 w-6 p-0 text-gray-500" onClick={() => setLastResult(null)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="text-center p-3 bg-[#0a0a0a] rounded-lg border border-[#1e1e1e]">
                          <p className="text-lg font-bold text-white">{lastResult.totalUsers.toLocaleString()}</p>
                          <p className="text-[10px] text-gray-500">Total Users</p>
                        </div>
                        <div className="text-center p-3 bg-green-500/5 rounded-lg border border-green-500/10">
                          <p className="text-lg font-bold text-green-400">{lastResult.sentCount.toLocaleString()}</p>
                          <p className="text-[10px] text-gray-500">Sent</p>
                        </div>
                        <div className="text-center p-3 bg-red-500/5 rounded-lg border border-red-500/10">
                          <p className="text-lg font-bold text-red-400">{lastResult.failedCount.toLocaleString()}</p>
                          <p className="text-[10px] text-gray-500">Failed</p>
                        </div>
                      </div>
                      {lastResult.errors && lastResult.errors.length > 0 && (
                        <div className="mt-3 p-3 bg-amber-500/5 rounded-lg border border-amber-500/10">
                          <p className="text-[11px] font-medium text-amber-400 mb-1">Errors:</p>
                          {lastResult.errors.slice(0, 3).map((err, i) => (
                            <p key={i} className="text-[10px] text-gray-500 truncate">- {err}</p>
                          ))}
                          {lastResult.errors.length > 3 && (
                            <p className="text-[10px] text-gray-600">... and {lastResult.errors.length - 3} more</p>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Live Preview (1/3) */}
              <div className="space-y-4">
                <Card className="bg-[#111] border-[#1e1e1e]">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-gray-400 text-xs font-medium">Live Preview</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-[#1a1a1a] rounded-xl p-4 border border-[#2a2a2a]">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Bell className="h-5 w-5 text-blue-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-white truncate">
                            {title || "Notification Title"}
                          </p>
                          <p className="text-xs text-gray-400 mt-1 line-clamp-3">
                            {body || "Your notification message will appear here..."}
                          </p>
                          {deeplink && (
                            <p className="text-[10px] text-blue-400 mt-1.5 truncate flex items-center gap-1">
                              <Link2 className="h-2.5 w-2.5 flex-shrink-0" /> {deeplink}
                            </p>
                          )}
                        </div>
                      </div>
                      <p className="text-[10px] text-gray-600 mt-3">Becxus Exchange - just now</p>
                    </div>
                    <div className="mt-3 space-y-1.5">
                      <p className="text-[10px] text-gray-600">Audience: <span className="text-gray-400">{getAudienceDescription()}</span></p>
                      <p className="text-[10px] text-gray-600">Channel: <span className="text-gray-400">Push Notification</span></p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* ═══════════ TAB 2: HISTORY ═══════════ */}
          <TabsContent value="history" className="mt-4">
            <Card className="bg-[#111] border-[#1e1e1e]">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <CardTitle className="text-white text-sm">Broadcast History</CardTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
                      <Input
                        value={historySearch}
                        onChange={(e) => setHistorySearch(e.target.value)}
                        placeholder="Search..."
                        className="pl-8 h-8 w-40 bg-[#0a0a0a] border-[#2a2a2a] text-white text-xs"
                      />
                    </div>
                    <Select
                      value={historyStatus || "all"}
                      onValueChange={(v) => { setHistoryStatus(v === "all" ? "" : v); setHistoryPage(1); }}
                    >
                      <SelectTrigger className="bg-[#0a0a0a] border-[#2a2a2a] text-white h-8 w-32 text-xs">
                        <SelectValue placeholder="All Status" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#111] border-[#1e1e1e]">
                        <SelectItem value="all" className="text-white text-xs">All Status</SelectItem>
                        <SelectItem value="completed" className="text-white text-xs">Completed</SelectItem>
                        <SelectItem value="pending" className="text-white text-xs">Pending</SelectItem>
                        <SelectItem value="failed" className="text-white text-xs">Failed</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={fetchHistory} disabled={historyLoading}
                      className="h-8 px-2 border-[#2a2a2a] text-gray-400 hover:text-white bg-transparent">
                      <RefreshCw className={`h-3.5 w-3.5 ${historyLoading ? "animate-spin" : ""}`} />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {historyLoading && broadcasts.length === 0 ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
                  </div>
                ) : broadcasts.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <History className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No broadcasts found</p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[#1e1e1e] text-gray-500 text-[10px] uppercase tracking-wider">
                            <th className="text-left py-2.5 px-3">Title</th>
                            <th className="text-left py-2.5 px-3">Audience</th>
                            <th className="text-center py-2.5 px-3">Sent</th>
                            <th className="text-center py-2.5 px-3">Failed</th>
                            <th className="text-left py-2.5 px-3">Status</th>
                            <th className="text-left py-2.5 px-3">Date</th>
                            <th className="text-center py-2.5 px-3"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {broadcasts.map((b) => (
                            <tr key={b.id} className="border-b border-[#1e1e1e] hover:bg-[#1a1a1a] transition-colors">
                              <td className="py-2.5 px-3 text-white text-xs max-w-[200px] truncate">{b.title}</td>
                              <td className="py-2.5 px-3">
                                <Badge variant="outline" className="border-[#2a2a2a] text-gray-400 text-[10px]">
                                  {b.target_role || "all"}
                                </Badge>
                              </td>
                              <td className="py-2.5 px-3 text-center text-green-400 text-xs">{b.sent_count}</td>
                              <td className="py-2.5 px-3 text-center text-red-400 text-xs">{b.failed_count}</td>
                              <td className="py-2.5 px-3">
                                <Badge variant="outline" className={`text-[10px] ${statusBadgeClass(b.status)}`}>{b.status}</Badge>
                              </td>
                              <td className="py-2.5 px-3 text-gray-500 text-[10px]">{formatDate(b.sent_at || b.created_at)}</td>
                              <td className="py-2.5 px-3 text-center">
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-500 hover:text-white"
                                  onClick={() => viewBroadcastDetail(b.id)}>
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* Pagination */}
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#1e1e1e]">
                      <p className="text-[10px] text-gray-500">{historyTotal} broadcasts</p>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" disabled={historyPage <= 1}
                          onClick={() => setHistoryPage((p) => p - 1)}
                          className="h-7 px-2 border-[#2a2a2a] text-gray-400 bg-transparent">
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </Button>
                        <span className="text-[10px] text-gray-400">{historyPage}/{historyTotalPages || 1}</span>
                        <Button variant="outline" size="sm" disabled={historyPage >= historyTotalPages}
                          onClick={() => setHistoryPage((p) => p + 1)}
                          className="h-7 px-2 border-[#2a2a2a] text-gray-400 bg-transparent">
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══════════ TAB 3: TEMPLATES ═══════════ */}
          <TabsContent value="templates" className="mt-4">
            <Card className="bg-[#111] border-[#1e1e1e]">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white text-sm">Notification Templates</CardTitle>
                  <Button onClick={() => openTemplateDialog()} size="sm" className="bg-blue-600 hover:bg-blue-700 text-xs h-8">
                    <Plus className="h-3.5 w-3.5 mr-1.5" /> New Template
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {templatesLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
                  </div>
                ) : templates.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No templates yet</p>
                    <p className="text-xs text-gray-600 mt-1">Create your first template to save time on repeat notifications</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {templates.map((t) => (
                      <Card key={t.id} className="bg-[#0a0a0a] border-[#1e1e1e] hover:border-[#2a2a2a] transition-colors">
                        <CardContent className="p-4 space-y-2.5">
                          <div className="flex items-start justify-between">
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-white truncate">{t.name}</p>
                              <p className="text-[10px] text-gray-500 mt-0.5 truncate">{t.title}</p>
                            </div>
                            <Badge variant="outline" className="border-[#2a2a2a] text-gray-600 text-[9px] flex-shrink-0 ml-2">
                              Template
                            </Badge>
                          </div>
                          <p className="text-[11px] text-gray-400 line-clamp-2">{t.body}</p>
                          {t.deeplink_url && (
                            <p className="text-[10px] text-blue-400 truncate flex items-center gap-1">
                              <Link2 className="h-2.5 w-2.5 flex-shrink-0" /> {t.deeplink_url}
                            </p>
                          )}
                          <div className="flex items-center gap-1.5 pt-2 border-t border-[#1e1e1e]">
                            <Button size="sm" variant="outline" onClick={() => useTemplate(t)}
                              className="flex-1 h-7 border-[#2a2a2a] text-gray-400 text-[10px] bg-transparent hover:text-white hover:bg-[#1a1a1a]">
                              <Copy className="h-3 w-3 mr-1" /> Use
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => openTemplateDialog(t)}
                              className="h-7 w-7 p-0 text-gray-500 hover:text-white">
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => deleteTemplate(t.id, t.name)}
                              className="h-7 w-7 p-0 text-gray-500 hover:text-red-400">
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══════════ TAB 4: SUBSCRIBERS ═══════════ */}
          <TabsContent value="subscribers" className="mt-4 space-y-4">
            {/* Platform Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Desktop", icon: Monitor, color: "text-blue-400", count: stats?.platforms?.desktop || 0 },
                { label: "Android", icon: Smartphone, color: "text-green-400", count: stats?.platforms?.android || 0 },
                { label: "iOS", icon: Smartphone, color: "text-gray-300", count: stats?.platforms?.ios || 0 },
                { label: "Unknown", icon: Wifi, color: "text-yellow-400", count: stats?.platforms?.unknown || 0 },
              ].map((p) => (
                <Card key={p.label} className="bg-[#111] border-[#1e1e1e]">
                  <CardContent className="p-4 flex items-center gap-3">
                    <p.icon className={`h-5 w-5 ${p.color}`} />
                    <div>
                      <p className="text-[10px] text-gray-500">{p.label}</p>
                      <p className="text-lg font-bold text-white">{p.count}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Test Push */}
            <div className="flex items-center gap-3">
              <Button onClick={handleTestPush} disabled={testPushLoading}
                variant="outline" size="sm" className="border-[#2a2a2a] text-gray-400 hover:text-white bg-transparent">
                {testPushLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Bell className="h-4 w-4 mr-2" />}
                Send Test Push
              </Button>
              <p className="text-[10px] text-gray-600">Sends a test push to all active subscribers</p>
            </div>

            {/* Subscriber Table */}
            <Card className="bg-[#111] border-[#1e1e1e]">
              <CardContent className="p-0">
                {subsLoading && subscribers.length === 0 ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
                  </div>
                ) : subscribers.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <Wifi className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No subscribers yet</p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[#1e1e1e] text-gray-500 text-[10px] uppercase tracking-wider">
                            <th className="text-left py-2.5 px-4">User</th>
                            <th className="text-left py-2.5 px-4">Platform</th>
                            <th className="text-left py-2.5 px-4">Subscribed</th>
                            <th className="text-left py-2.5 px-4">Last Updated</th>
                          </tr>
                        </thead>
                        <tbody>
                          {subscribers.map((s) => (
                            <tr key={s.id} className="border-b border-[#1e1e1e] hover:bg-[#1a1a1a] transition-colors">
                              <td className="py-2.5 px-4">
                                <p className="text-white text-xs">{s.user_name}</p>
                                <p className="text-gray-500 text-[10px]">{s.user_email}</p>
                              </td>
                              <td className="py-2.5 px-4">
                                <Badge variant="outline" className="border-[#2a2a2a] text-gray-400 text-[10px]">
                                  {s.platform || "unknown"}
                                </Badge>
                              </td>
                              <td className="py-2.5 px-4 text-gray-500 text-[10px]">{formatDate(s.created_at)}</td>
                              <td className="py-2.5 px-4 text-gray-500 text-[10px]">{formatDate(s.updated_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* Pagination */}
                    <div className="flex items-center justify-between px-4 py-3 border-t border-[#1e1e1e]">
                      <p className="text-[10px] text-gray-500">{subsTotal} subscriptions</p>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" disabled={subsPage <= 1}
                          onClick={() => setSubsPage((p) => p - 1)}
                          className="h-7 px-2 border-[#2a2a2a] text-gray-400 bg-transparent">
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </Button>
                        <span className="text-[10px] text-gray-400">{subsPage}/{subsTotalPages || 1}</span>
                        <Button variant="outline" size="sm" disabled={subsPage >= subsTotalPages}
                          onClick={() => setSubsPage((p) => p + 1)}
                          className="h-7 px-2 border-[#2a2a2a] text-gray-400 bg-transparent">
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* ═══════════ CONFIRM SEND DIALOG ═══════════ */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Confirm Send
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              This will send a push notification to <span className="text-white font-medium">{getAudienceDescription()}</span>. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <div className="bg-[#0a0a0a] rounded-lg p-3 border border-[#1e1e1e]">
              <p className="text-[10px] text-gray-500 mb-1">Title</p>
              <p className="text-sm text-white">{title}</p>
            </div>
            <div className="bg-[#0a0a0a] rounded-lg p-3 border border-[#1e1e1e]">
              <p className="text-[10px] text-gray-500 mb-1">Message</p>
              <p className="text-sm text-white whitespace-pre-wrap">{body}</p>
            </div>
            {deeplink && (
              <div className="bg-[#0a0a0a] rounded-lg p-3 border border-[#1e1e1e]">
                <p className="text-[10px] text-gray-500 mb-1">Deep-link</p>
                <p className="text-sm text-blue-400">{deeplink}</p>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}
              className="border-[#2a2a2a] text-gray-400 bg-transparent hover:text-white hover:bg-[#1a1a1a]">
              Cancel
            </Button>
            <Button onClick={handleConfirmedSend} disabled={sending} className="bg-blue-600 hover:bg-blue-700">
              {sending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...</> : <><Send className="mr-2 h-4 w-4" /> Send Now</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════ BROADCAST DETAIL DIALOG ═══════════ */}
      <Dialog open={showBroadcastDetail} onOpenChange={setShowBroadcastDetail}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white text-sm">Broadcast Details</DialogTitle>
            <DialogDescription className="text-gray-500 text-xs">
              {selectedBroadcastDetail ? `Broadcast #${selectedBroadcastDetail.broadcast.id}` : "Loading..."}
            </DialogDescription>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
            </div>
          ) : selectedBroadcastDetail ? (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <div className="bg-[#0a0a0a] rounded-lg p-3 border border-[#1e1e1e]">
                  <p className="text-[10px] text-gray-500">Title</p>
                  <p className="text-sm text-white mt-0.5">{selectedBroadcastDetail.broadcast.title}</p>
                </div>
                <div className="bg-[#0a0a0a] rounded-lg p-3 border border-[#1e1e1e]">
                  <p className="text-[10px] text-gray-500">Message</p>
                  <p className="text-xs text-gray-300 mt-0.5 whitespace-pre-wrap">{selectedBroadcastDetail.broadcast.body}</p>
                </div>
                {selectedBroadcastDetail.broadcast.deeplink_url && (
                  <div className="bg-[#0a0a0a] rounded-lg p-3 border border-[#1e1e1e]">
                    <p className="text-[10px] text-gray-500">Deep-link</p>
                    <p className="text-xs text-blue-400 mt-0.5">{selectedBroadcastDetail.broadcast.deeplink_url}</p>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div className="text-center p-2 bg-[#0a0a0a] rounded-lg border border-[#1e1e1e]">
                  <p className="text-sm font-bold text-white">{selectedBroadcastDetail.broadcast.total_users}</p>
                  <p className="text-[9px] text-gray-500">Users</p>
                </div>
                <div className="text-center p-2 bg-green-500/5 rounded-lg border border-green-500/10">
                  <p className="text-sm font-bold text-green-400">{selectedBroadcastDetail.broadcast.sent_count}</p>
                  <p className="text-[9px] text-gray-500">Sent</p>
                </div>
                <div className="text-center p-2 bg-red-500/5 rounded-lg border border-red-500/10">
                  <p className="text-sm font-bold text-red-400">{selectedBroadcastDetail.broadcast.failed_count}</p>
                  <p className="text-[9px] text-gray-500">Failed</p>
                </div>
                <div className="text-center p-2 bg-[#0a0a0a] rounded-lg border border-[#1e1e1e]">
                  <Badge variant="outline" className={`text-[9px] ${statusBadgeClass(selectedBroadcastDetail.broadcast.status)}`}>
                    {selectedBroadcastDetail.broadcast.status}
                  </Badge>
                  <p className="text-[9px] text-gray-500 mt-0.5">Status</p>
                </div>
              </div>
              <div className="text-[10px] text-gray-500 flex items-center justify-between border-t border-[#1e1e1e] pt-3">
                <span>Audience: <span className="text-gray-400">{selectedBroadcastDetail.broadcast.target_role || "all"}</span></span>
                <span>{formatDate(selectedBroadcastDetail.broadcast.sent_at || selectedBroadcastDetail.broadcast.created_at)}</span>
              </div>
              {Object.keys(selectedBroadcastDetail.deliveryStats).length > 0 && (
                <div className="border-t border-[#1e1e1e] pt-3">
                  <p className="text-[10px] text-gray-500 mb-2">Delivery Log Summary ({selectedBroadcastDetail.deliveryLogs.length} entries)</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(selectedBroadcastDetail.deliveryStats).map(([status, count]) => (
                      <Badge key={status} variant="outline" className={`text-[10px] ${statusBadgeClass(status)}`}>
                        {status}: {count}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ═══════════ TEMPLATE FORM DIALOG ═══════════ */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white text-sm">
              {editingTemplate ? "Edit Template" : "New Template"}
            </DialogTitle>
            <DialogDescription className="text-gray-500 text-xs">
              {editingTemplate ? `Editing "${editingTemplate.name}"` : "Create a reusable notification template"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-gray-400 text-xs">Template Name *</Label>
              <Input
                value={templateForm.name}
                onChange={(e) => setTemplateForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Welcome Message"
                className="bg-[#0a0a0a] border-[#2a2a2a] text-white"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-gray-400 text-xs">Notification Title *</Label>
              <Input
                value={templateForm.title}
                onChange={(e) => setTemplateForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Notification title"
                className="bg-[#0a0a0a] border-[#2a2a2a] text-white"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-gray-400 text-xs">Message Body *</Label>
              <Textarea
                value={templateForm.body}
                onChange={(e) => setTemplateForm((f) => ({ ...f, body: e.target.value }))}
                placeholder="Notification message"
                rows={4}
                className="bg-[#0a0a0a] border-[#2a2a2a] text-white resize-none"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-gray-400 text-xs flex items-center gap-1">
                <Link2 className="h-3 w-3" /> Deep-link URL (optional)
              </Label>
              <Input
                value={templateForm.deeplink_url}
                onChange={(e) => setTemplateForm((f) => ({ ...f, deeplink_url: e.target.value }))}
                placeholder="/futures"
                className="bg-[#0a0a0a] border-[#2a2a2a] text-white"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowTemplateDialog(false)}
              className="border-[#2a2a2a] text-gray-400 bg-transparent hover:text-white hover:bg-[#1a1a1a]">
              Cancel
            </Button>
            <Button onClick={saveTemplate} disabled={templateSaving}
              className="bg-blue-600 hover:bg-blue-700">
              {templateSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editingTemplate ? "Save Changes" : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
