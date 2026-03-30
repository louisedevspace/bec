import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import {
  Megaphone, Plus, Edit, Trash2, Eye, EyeOff, Calendar, Users, Clock, Upload,
  Search, Pin, Copy, BarChart3, FileText, Tag, Layers, ChevronLeft, ChevronRight,
  CheckCircle, XCircle, TrendingUp, MousePointerClick, EyeIcon, Loader2,
  ToggleLeft, AlertTriangle, RefreshCw
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import AdminLayout from './admin-layout';
import NewsPreview from '@/components/news-preview';

// ─── Types ────────────────────────────────────────────────

interface News {
  id: number;
  title: string;
  content: string;
  type: string;
  priority: string;
  image_url?: string;
  background_color: string;
  text_color: string;
  button_text: string;
  button_color: string;
  is_active: boolean;
  show_popup: boolean;
  popup_delay: number;
  auto_close: number;
  target_users: string;
  start_date: string;
  end_date?: string;
  category: string;
  tags: string[];
  template_id?: number;
  view_count: number;
  click_count: number;
  dismiss_count: number;
  ab_variant?: string;
  ab_group_id?: string;
  is_pinned: boolean;
  seen_count?: number;
  created_at: string;
  updated_at: string;
}

interface Category {
  id: number;
  name: string;
  slug: string;
  description?: string;
  color: string;
  sort_order: number;
}

interface Template {
  id: number;
  name: string;
  title: string;
  content: string;
  type: string;
  background_color: string;
  text_color: string;
  button_text: string;
  button_color: string;
  image_url?: string;
  category: string;
}

interface Stats {
  totalNews: number;
  activeNews: number;
  scheduledNews: number;
  expiredNews: number;
  totalViews: number;
  totalClicks: number;
  totalDismissals: number;
  totalSeen: number;
  avgCtr: string;
  byType: Record<string, number>;
  byPriority: Record<string, number>;
  byCategory: Record<string, number>;
  categories: Category[];
}

// ─── Helper ───────────────────────────────────────────────

async function apiFetch(path: string, options?: RequestInit) {
  const { data: authData } = await supabase.auth.getSession();
  const token = authData?.session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options?.headers || {}),
    },
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || 'Request failed');
  return json;
}

async function fileToInlineImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const maxWidth = 1600;
        const scale = image.width > maxWidth ? maxWidth / image.width : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d');
        if (!context) { reject(new Error('Unable to process image')); return; }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        const quality = outputType === 'image/png' ? undefined : 0.82;
        resolve(canvas.toDataURL(outputType, quality));
      };
      image.onerror = () => reject(new Error('Unable to read image file'));
      image.src = typeof reader.result === 'string' ? reader.result : '';
    };
    reader.onerror = () => reject(new Error('Unable to read image file'));
    reader.readAsDataURL(file);
  });
}

const DEFAULT_FORM = {
  title: '', content: '', type: 'announcement', priority: 'normal',
  image_url: '', background_color: '#111111', text_color: '#ffffff',
  button_text: 'Got it', button_color: '#3b82f6',
  is_active: true, show_popup: true, popup_delay: 2000, auto_close: 0,
  target_users: 'all', start_date: new Date().toISOString().slice(0, 16), end_date: '',
  category: 'general', tags: '' as string, is_pinned: false,
  ab_variant: '', ab_group_id: '',
};

// ─── Component ────────────────────────────────────────────

export default function AdminNews() {
  // Core state
  const [newsList, setNewsList] = useState<News[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeTab, setActiveTab] = useState('manage');

  // List state
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  // Selection for bulk ops
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingNews, setEditingNews] = useState<News | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [formData, setFormData] = useState({ ...DEFAULT_FORM });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);

  // Confirm dialog
  const [confirmAction, setConfirmAction] = useState<{ title: string; desc: string; onConfirm: () => void } | null>(null);

  // Category dialog
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '', color: '#3b82f6' });

  // Template dialog
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [templateForm, setTemplateForm] = useState({ name: '', title: '', content: '', type: 'announcement', background_color: '#111111', text_color: '#ffffff', button_text: 'Got it', button_color: '#3b82f6', category: 'general' });

  // Analytics dialog
  const [analyticsNews, setAnalyticsNews] = useState<News | null>(null);
  const [analyticsData, setAnalyticsData] = useState<any>(null);

  // ─── Data fetching ────────────────────────────────────

  const fetchNews = useCallback(async (p = page) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(p), limit: '15' });
      if (searchQuery) params.set('search', searchQuery);
      if (filterType !== 'all') params.set('type', filterType);
      if (filterPriority !== 'all') params.set('priority', filterPriority);
      if (filterCategory !== 'all') params.set('category', filterCategory);
      if (filterStatus !== 'all') params.set('status', filterStatus);

      const result = await apiFetch(`/api/news?${params}`);
      setNewsList(result.news || []);
      setTotalPages(result.totalPages || 1);
      setTotalCount(result.total || 0);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to fetch news', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery, filterType, filterPriority, filterCategory, filterStatus]);

  const fetchStats = useCallback(async () => {
    try {
      const data = await apiFetch('/api/news/stats');
      setStats(data);
    } catch {}
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const data = await apiFetch('/api/news/categories/list');
      setCategories(data || []);
    } catch {}
  }, []);

  const fetchTemplates = useCallback(async () => {
    try {
      const data = await apiFetch('/api/news/templates/list');
      setTemplates(data || []);
    } catch {}
  }, []);

  useEffect(() => { fetchNews(1); }, [searchQuery, filterType, filterPriority, filterCategory, filterStatus]);
  useEffect(() => { fetchStats(); fetchCategories(); fetchTemplates(); }, []);

  // Auto-refresh news metrics every 30 seconds when on manage or analytics tab
  useEffect(() => {
    if (activeTab !== 'manage' && activeTab !== 'analytics') return;
    const interval = setInterval(() => {
      fetchNews(page);
      fetchStats();
    }, 30000);
    return () => clearInterval(interval);
  }, [activeTab, page, fetchNews, fetchStats]);

  const handleSearch = (val: string) => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      setSearchQuery(val);
    }, 300);
  };

  // ─── CRUD operations ─────────────────────────────────

  const resetForm = () => setFormData({ ...DEFAULT_FORM, start_date: new Date().toISOString().slice(0, 16) });

  const openCreate = () => {
    resetForm();
    setEditingNews(null);
    setShowPreview(false);
    setShowCreateDialog(true);
  };

  const openEdit = (news: News) => {
    setEditingNews(news);
    setFormData({
      title: news.title, content: news.content, type: news.type, priority: news.priority,
      image_url: news.image_url || '', background_color: news.background_color,
      text_color: news.text_color, button_text: news.button_text, button_color: news.button_color,
      is_active: news.is_active, show_popup: news.show_popup,
      popup_delay: news.popup_delay, auto_close: news.auto_close,
      target_users: news.target_users,
      start_date: news.start_date ? new Date(news.start_date).toISOString().slice(0, 16) : '',
      end_date: news.end_date ? new Date(news.end_date).toISOString().slice(0, 16) : '',
      category: news.category || 'general',
      tags: (news.tags || []).join(', '),
      is_pinned: news.is_pinned || false,
      ab_variant: news.ab_variant || '',
      ab_group_id: news.ab_group_id || '',
    });
    setShowPreview(false);
    setShowCreateDialog(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const tagsArray = formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
      const body = {
        ...formData,
        tags: tagsArray,
        end_date: formData.end_date || null,
        ab_variant: formData.ab_variant || null,
        ab_group_id: formData.ab_group_id || null,
      };

      if (editingNews) {
        await apiFetch(`/api/news/${editingNews.id}`, { method: 'PUT', body: JSON.stringify(body) });
        toast({ title: 'Success', description: 'News updated successfully' });
      } else {
        await apiFetch('/api/news', { method: 'POST', body: JSON.stringify(body) });
        toast({ title: 'Success', description: 'News created successfully' });
      }

      setShowCreateDialog(false);
      setEditingNews(null);
      resetForm();
      fetchNews(page);
      fetchStats();
    } catch (error: any) {
      toast({ title: 'Error', description: error?.message || 'Failed to save news', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: number) => {
    setConfirmAction({
      title: 'Delete News',
      desc: 'This will permanently delete this news item and all associated tracking data. This action cannot be undone.',
      onConfirm: async () => {
        try {
          await apiFetch(`/api/news/${id}`, { method: 'DELETE' });
          toast({ title: 'Success', description: 'News deleted' });
          fetchNews(page);
          fetchStats();
        } catch {
          toast({ title: 'Error', description: 'Failed to delete', variant: 'destructive' });
        }
        setConfirmAction(null);
      },
    });
  };

  const toggleActive = async (id: number, isActive: boolean) => {
    try {
      await apiFetch(`/api/news/${id}/toggle`, { method: 'PATCH', body: JSON.stringify({ is_active: isActive }) });
      toast({ title: 'Success', description: `News ${isActive ? 'activated' : 'deactivated'}` });
      fetchNews(page);
      fetchStats();
    } catch {
      toast({ title: 'Error', description: 'Failed to toggle status', variant: 'destructive' });
    }
  };

  const togglePin = async (id: number, isPinned: boolean) => {
    try {
      await apiFetch(`/api/news/${id}/pin`, { method: 'PATCH', body: JSON.stringify({ is_pinned: isPinned }) });
      toast({ title: 'Success', description: isPinned ? 'News pinned' : 'News unpinned' });
      fetchNews(page);
    } catch {
      toast({ title: 'Error', description: 'Failed to update pin status', variant: 'destructive' });
    }
  };

  const duplicateNews = async (id: number) => {
    try {
      await apiFetch(`/api/news/${id}/duplicate`, { method: 'POST' });
      toast({ title: 'Success', description: 'News duplicated (inactive copy created)' });
      fetchNews(page);
      fetchStats();
    } catch {
      toast({ title: 'Error', description: 'Failed to duplicate', variant: 'destructive' });
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      if (!file.type.startsWith('image/')) throw new Error('Please select a valid image file');
      const { data: authData } = await supabase.auth.getSession();
      const accessToken = authData?.session?.access_token;
      if (!accessToken) throw new Error('Missing auth session');

      const body = new FormData();
      body.append('file', file);

      const response = await fetch('/api/news/upload-image', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || 'Upload failed');

      setFormData(prev => ({ ...prev, image_url: result.publicUrl }));
      toast({ title: 'Success', description: 'Image uploaded' });
    } catch (error) {
      try {
        const inlineImage = await fileToInlineImage(file);
        setFormData(prev => ({ ...prev, image_url: inlineImage }));
        toast({ title: 'Success', description: 'Image attached locally' });
      } catch {
        toast({ title: 'Error', description: 'Failed to upload image', variant: 'destructive' });
      }
    } finally {
      setUploadingImage(false);
      event.target.value = '';
    }
  };

  // ─── Bulk operations ──────────────────────────────────

  const toggleSelectAll = () => {
    if (selectedIds.size === newsList.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(newsList.map(n => n.id)));
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkAction = (action: string) => {
    if (selectedIds.size === 0) {
      toast({ title: 'Warning', description: 'No items selected' });
      return;
    }
    const actionLabels: Record<string, string> = {
      activate: 'activate', deactivate: 'deactivate', delete: 'permanently delete',
    };
    setConfirmAction({
      title: `Bulk ${action}`,
      desc: `Are you sure you want to ${actionLabels[action] || action} ${selectedIds.size} news item(s)?`,
      onConfirm: async () => {
        try {
          await apiFetch('/api/news/bulk', { method: 'POST', body: JSON.stringify({ action, ids: Array.from(selectedIds) }) });
          toast({ title: 'Success', description: `Bulk ${action} completed` });
          setSelectedIds(new Set());
          fetchNews(page);
          fetchStats();
        } catch {
          toast({ title: 'Error', description: 'Bulk operation failed', variant: 'destructive' });
        }
        setConfirmAction(null);
      },
    });
  };

  // ─── Category CRUD ────────────────────────────────────

  const openCategoryCreate = () => {
    setEditingCategory(null);
    setCategoryForm({ name: '', description: '', color: '#3b82f6' });
    setShowCategoryDialog(true);
  };

  const openCategoryEdit = (cat: Category) => {
    setEditingCategory(cat);
    setCategoryForm({ name: cat.name, description: cat.description || '', color: cat.color });
    setShowCategoryDialog(true);
  };

  const handleCategorySubmit = async () => {
    try {
      if (editingCategory) {
        await apiFetch(`/api/news/categories/${editingCategory.id}`, { method: 'PUT', body: JSON.stringify(categoryForm) });
      } else {
        await apiFetch('/api/news/categories', { method: 'POST', body: JSON.stringify(categoryForm) });
      }
      toast({ title: 'Success', description: `Category ${editingCategory ? 'updated' : 'created'}` });
      setShowCategoryDialog(false);
      fetchCategories();
      fetchStats();
    } catch (error: any) {
      toast({ title: 'Error', description: error?.message || 'Failed to save category', variant: 'destructive' });
    }
  };

  const deleteCategory = (id: number) => {
    setConfirmAction({
      title: 'Delete Category', desc: 'This category will be removed. Existing news will keep their category value.',
      onConfirm: async () => {
        try {
          await apiFetch(`/api/news/categories/${id}`, { method: 'DELETE' });
          toast({ title: 'Success', description: 'Category deleted' });
          fetchCategories();
        } catch {
          toast({ title: 'Error', description: 'Failed to delete', variant: 'destructive' });
        }
        setConfirmAction(null);
      }
    });
  };

  // ─── Template CRUD ────────────────────────────────────

  const openTemplateCreate = () => {
    setEditingTemplate(null);
    setTemplateForm({ name: '', title: '', content: '', type: 'announcement', background_color: '#111111', text_color: '#ffffff', button_text: 'Got it', button_color: '#3b82f6', category: 'general' });
    setShowTemplateDialog(true);
  };

  const openTemplateEdit = (t: Template) => {
    setEditingTemplate(t);
    setTemplateForm({ name: t.name, title: t.title, content: t.content, type: t.type, background_color: t.background_color, text_color: t.text_color, button_text: t.button_text, button_color: t.button_color, category: t.category || 'general' });
    setShowTemplateDialog(true);
  };

  const handleTemplateSubmit = async () => {
    try {
      if (editingTemplate) {
        await apiFetch(`/api/news/templates/${editingTemplate.id}`, { method: 'PUT', body: JSON.stringify(templateForm) });
      } else {
        await apiFetch('/api/news/templates', { method: 'POST', body: JSON.stringify(templateForm) });
      }
      toast({ title: 'Success', description: `Template ${editingTemplate ? 'updated' : 'created'}` });
      setShowTemplateDialog(false);
      fetchTemplates();
    } catch (error: any) {
      toast({ title: 'Error', description: error?.message || 'Failed to save template', variant: 'destructive' });
    }
  };

  const deleteTemplate = (id: number) => {
    setConfirmAction({
      title: 'Delete Template', desc: 'This template will be permanently removed.',
      onConfirm: async () => {
        try {
          await apiFetch(`/api/news/templates/${id}`, { method: 'DELETE' });
          toast({ title: 'Success', description: 'Template deleted' });
          fetchTemplates();
        } catch {
          toast({ title: 'Error', description: 'Failed to delete', variant: 'destructive' });
        }
        setConfirmAction(null);
      }
    });
  };

  const useTemplate = (t: Template) => {
    setFormData(prev => ({
      ...prev,
      title: t.title, content: t.content, type: t.type,
      background_color: t.background_color, text_color: t.text_color,
      button_text: t.button_text, button_color: t.button_color,
      image_url: t.image_url || '', category: t.category || 'general',
    }));
    setEditingNews(null);
    setShowPreview(false);
    setShowCreateDialog(true);
    toast({ title: 'Template Loaded', description: `"${t.name}" applied to form` });
  };

  // ─── Analytics ────────────────────────────────────────

  const openAnalytics = async (news: News) => {
    setAnalyticsNews(news);
    try {
      const data = await apiFetch(`/api/news/${news.id}/analytics`);
      setAnalyticsData(data);
    } catch {
      setAnalyticsData(null);
    }
  };

  // ─── Utilities ────────────────────────────────────────

  const getPriorityColor = (p: string) => {
    switch (p) {
      case 'urgent': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'normal': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'low': return 'bg-green-500/20 text-green-400 border-green-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = { announcement: 'Announcement', update: 'Update', maintenance: 'Maintenance', feature: 'Feature', promotion: 'Promotion', alert: 'Alert' };
    return labels[type] || type;
  };

  const getStatusInfo = (news: News) => {
    const now = new Date();
    if (!news.is_active) return { label: 'Inactive', cls: 'bg-gray-500/20 text-gray-400' };
    if (news.end_date && new Date(news.end_date) < now) return { label: 'Expired', cls: 'bg-red-500/20 text-red-400' };
    if (news.start_date && new Date(news.start_date) > now) return { label: 'Scheduled', cls: 'bg-yellow-500/20 text-yellow-400' };
    return { label: 'Active', cls: 'bg-emerald-500/20 text-emerald-400' };
  };

  const fmtDate = (d: string) => {
    try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return d; }
  };

  const fmtNum = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

  // ─── Stat card component ──────────────────────────────

  const StatCard = ({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: any; color: string }) => (
    <Card className="bg-[#111] border-[#1e1e1e]">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
            <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
          </div>
          <Icon className={`w-5 h-5 ${color} opacity-60 fill-current`} />
        </div>
      </CardContent>
    </Card>
  );

  // ─── Render ───────────────────────────────────────────

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
              <Megaphone className="w-5 h-5 md:w-6 md:h-6 fill-current" />
              News Management
            </h1>
            <p className="text-gray-400 mt-1 text-sm">Create, manage, and analyze news announcements</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { fetchNews(page); fetchStats(); }}
              className="border-[#333] text-gray-300 hover:bg-[#1a1a1a]">
              <RefreshCw className="w-4 h-4 fill-current" />
            </Button>
            <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2 fill-current" />
              Create News
            </Button>
          </div>
        </div>

        {/* Stats Row */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard label="Total News" value={stats.totalNews} icon={Megaphone} color="text-white" />
            <StatCard label="Active" value={stats.activeNews} icon={CheckCircle} color="text-emerald-400" />
            <StatCard label="Scheduled" value={stats.scheduledNews} icon={Clock} color="text-yellow-400" />
            <StatCard label="Total Views" value={fmtNum(stats.totalViews)} icon={EyeIcon} color="text-blue-400" />
            <StatCard label="Clicks" value={fmtNum(stats.totalClicks)} icon={MousePointerClick} color="text-purple-400" />
            <StatCard label="Avg CTR" value={`${stats.avgCtr}%`} icon={TrendingUp} color="text-cyan-400" />
          </div>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="overflow-x-auto scrollbar-hide -mx-4 px-4">
            <TabsList className="bg-[#1a1a1a] border border-[#1e1e1e] w-max">
              <TabsTrigger value="manage" className="data-[state=active]:bg-[#333] text-gray-300">
                <Layers className="w-4 h-4 mr-1.5 fill-current" /> Manage
              </TabsTrigger>
              <TabsTrigger value="templates" className="data-[state=active]:bg-[#333] text-gray-300">
                <FileText className="w-4 h-4 mr-1.5 fill-current" /> Templates
              </TabsTrigger>
              <TabsTrigger value="categories" className="data-[state=active]:bg-[#333] text-gray-300">
                <Tag className="w-4 h-4 mr-1.5 fill-current" /> Categories
              </TabsTrigger>
              <TabsTrigger value="analytics" className="data-[state=active]:bg-[#333] text-gray-300">
                <BarChart3 className="w-4 h-4 mr-1.5 fill-current" /> Analytics
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ─── MANAGE TAB ─────────────────────────────── */}
          <TabsContent value="manage" className="space-y-4 mt-4">
            {/* Filters */}
            <Card className="bg-[#111] border-[#1e1e1e]">
              <CardContent className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  <div className="relative lg:col-span-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 fill-current" />
                    <Input placeholder="Search news..." onChange={(e) => handleSearch(e.target.value)}
                      className="bg-[#0a0a0a] border-[#333] text-white pl-9 placeholder:text-gray-600" />
                  </div>
                  <Select value={filterType} onValueChange={v => { setPage(1); setFilterType(v); }}>
                    <SelectTrigger className="bg-[#0a0a0a] border-[#333] text-white"><SelectValue placeholder="Type" /></SelectTrigger>
                    <SelectContent className="bg-[#1a1a1a] border-[#333]">
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="announcement">Announcement</SelectItem>
                      <SelectItem value="update">Update</SelectItem>
                      <SelectItem value="maintenance">Maintenance</SelectItem>
                      <SelectItem value="feature">Feature</SelectItem>
                      <SelectItem value="promotion">Promotion</SelectItem>
                      <SelectItem value="alert">Alert</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={filterPriority} onValueChange={v => { setPage(1); setFilterPriority(v); }}>
                    <SelectTrigger className="bg-[#0a0a0a] border-[#333] text-white"><SelectValue placeholder="Priority" /></SelectTrigger>
                    <SelectContent className="bg-[#1a1a1a] border-[#333]">
                      <SelectItem value="all">All Priorities</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={filterCategory} onValueChange={v => { setPage(1); setFilterCategory(v); }}>
                    <SelectTrigger className="bg-[#0a0a0a] border-[#333] text-white"><SelectValue placeholder="Category" /></SelectTrigger>
                    <SelectContent className="bg-[#1a1a1a] border-[#333]">
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories.map(c => <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={filterStatus} onValueChange={v => { setPage(1); setFilterStatus(v); }}>
                    <SelectTrigger className="bg-[#0a0a0a] border-[#333] text-white"><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent className="bg-[#1a1a1a] border-[#333]">
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="scheduled">Scheduled</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Bulk actions bar */}
            {selectedIds.size > 0 && (
              <Card className="bg-blue-500/10 border-blue-500/30">
                <CardContent className="p-3 flex items-center justify-between flex-wrap gap-2">
                  <span className="text-sm text-blue-400 font-medium">{selectedIds.size} item(s) selected</span>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 h-8"
                      onClick={() => handleBulkAction('activate')}>
                      <ToggleLeft className="w-3.5 h-3.5 mr-1 fill-current" /> Activate
                    </Button>
                    <Button size="sm" variant="outline" className="border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 h-8"
                      onClick={() => handleBulkAction('deactivate')}>
                      <EyeOff className="w-3.5 h-3.5 mr-1 fill-current" /> Deactivate
                    </Button>
                    <Button size="sm" variant="outline" className="border-red-500/30 text-red-400 hover:bg-red-500/10 h-8"
                      onClick={() => handleBulkAction('delete')}>
                      <Trash2 className="w-3.5 h-3.5 mr-1 fill-current" /> Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* News List */}
            {loading && newsList.length === 0 ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="w-6 h-6 animate-spin text-gray-500 fill-current" />
              </div>
            ) : newsList.length === 0 ? (
              <Card className="bg-[#111] border-[#1e1e1e]">
                <CardContent className="p-12 text-center">
                  <Megaphone className="w-12 h-12 mx-auto mb-4 text-gray-600 fill-current" />
                  <h3 className="text-lg font-semibold text-white mb-2">No News Items</h3>
                  <p className="text-gray-500 mb-6">Create your first announcement to get started</p>
                  <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700">
                    <Plus className="w-4 h-4 mr-2" /> Create News
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Select all row */}
                <div className="flex items-center gap-2 px-1">
                  <input type="checkbox" checked={selectedIds.size === newsList.length && newsList.length > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-[#333] bg-[#1a1a1a] accent-blue-500" />
                  <span className="text-xs text-gray-500">Select all ({totalCount} total)</span>
                </div>

                <div className="grid gap-3">
                  {newsList.map(news => {
                    const status = getStatusInfo(news);
                    return (
                      <Card key={news.id} className={`bg-[#111] border-[#1e1e1e] transition-all ${selectedIds.has(news.id) ? 'ring-1 ring-blue-500/50' : ''}`}>
                        <CardContent className="p-3 sm:p-4">
                          <div className="flex items-start gap-2 sm:gap-3">
                            {/* Checkbox */}
                            <input type="checkbox" checked={selectedIds.has(news.id)}
                              onChange={() => toggleSelect(news.id)}
                              className="mt-1 w-4 h-4 rounded border-[#333] bg-[#1a1a1a] accent-blue-500 shrink-0" />

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1.5">
                                {news.is_pinned && <Pin className="w-3.5 h-3.5 text-yellow-400 shrink-0 fill-current" />}
                                <h3 className="text-white font-semibold text-sm sm:text-base truncate">{news.title}</h3>
                              </div>
                              <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 mb-2">
                                <Badge className={`text-[10px] px-1.5 py-0 border ${status.cls}`}>{status.label}</Badge>
                                <Badge className={`text-[10px] px-1.5 py-0 border ${getPriorityColor(news.priority)}`}>{news.priority}</Badge>
                                <Badge className="text-[10px] px-1.5 py-0 bg-[#1a1a1a] text-gray-400 border-[#333]">{getTypeLabel(news.type)}</Badge>
                                {news.category && news.category !== 'general' && (
                                  <Badge className="text-[10px] px-1.5 py-0 bg-purple-500/15 text-purple-400 border-purple-500/30">{news.category}</Badge>
                                )}
                                {news.ab_variant && (
                                  <Badge className="text-[10px] px-1.5 py-0 bg-cyan-500/15 text-cyan-400 border-cyan-500/30">A/B: {news.ab_variant}</Badge>
                                )}
                              </div>
                              <p className="text-gray-500 text-xs sm:text-sm line-clamp-1 mb-2">{news.content}</p>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
                                <span className="flex items-center gap-1"><Users className="w-3 h-3 fill-current" /> {news.target_users}</span>
                                <span className="flex items-center gap-1"><Calendar className="w-3 h-3 fill-current" /> {fmtDate(news.created_at)}</span>
                                <span className="flex items-center gap-1"><EyeIcon className="w-3 h-3 fill-current" /> {fmtNum(news.view_count || 0)} views</span>
                                <span className="flex items-center gap-1"><MousePointerClick className="w-3 h-3 fill-current" /> {fmtNum(news.click_count || 0)} clicks</span>
                              </div>

                              {/* Actions - inline on mobile */}
                              <div className="flex items-center gap-0.5 sm:hidden mt-2 pt-2 border-t border-[#1e1e1e] -mx-1 flex-wrap">
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-500 hover:text-white hover:bg-[#1a1a1a]"
                                  onClick={() => openAnalytics(news)} title="Analytics">
                                  <BarChart3 className="w-3.5 h-3.5 fill-current" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-500 hover:text-white hover:bg-[#1a1a1a]"
                                  onClick={() => togglePin(news.id, !news.is_pinned)} title={news.is_pinned ? 'Unpin' : 'Pin'}>
                                  <Pin className={`w-3.5 h-3.5 fill-current ${news.is_pinned ? 'text-yellow-400' : ''}`} />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-500 hover:text-white hover:bg-[#1a1a1a]"
                                  onClick={() => duplicateNews(news.id)} title="Duplicate">
                                  <Copy className="w-3.5 h-3.5 fill-current" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-500 hover:text-white hover:bg-[#1a1a1a]"
                                  onClick={() => toggleActive(news.id, !news.is_active)} title={news.is_active ? 'Deactivate' : 'Activate'}>
                                  {news.is_active ? <EyeOff className="w-3.5 h-3.5 fill-current" /> : <Eye className="w-3.5 h-3.5 fill-current" />}
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-500 hover:text-blue-400 hover:bg-[#1a1a1a]"
                                  onClick={() => openEdit(news)} title="Edit">
                                  <Edit className="w-3.5 h-3.5 fill-current" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-500 hover:text-red-400 hover:bg-[#1a1a1a]"
                                  onClick={() => handleDelete(news.id)} title="Delete">
                                  <Trash2 className="w-3.5 h-3.5 fill-current" />
                                </Button>
                              </div>
                            </div>

                            {/* Actions - desktop only */}
                            <div className="hidden sm:flex items-center gap-1 shrink-0">
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-500 hover:text-white hover:bg-[#1a1a1a]"
                                onClick={() => openAnalytics(news)} title="Analytics">
                                <BarChart3 className="w-3.5 h-3.5 fill-current" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-500 hover:text-white hover:bg-[#1a1a1a]"
                                onClick={() => togglePin(news.id, !news.is_pinned)} title={news.is_pinned ? 'Unpin' : 'Pin'}>
                                <Pin className={`w-3.5 h-3.5 fill-current ${news.is_pinned ? 'text-yellow-400' : ''}`} />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-500 hover:text-white hover:bg-[#1a1a1a]"
                                onClick={() => duplicateNews(news.id)} title="Duplicate">
                                <Copy className="w-3.5 h-3.5 fill-current" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-500 hover:text-white hover:bg-[#1a1a1a]"
                                onClick={() => toggleActive(news.id, !news.is_active)} title={news.is_active ? 'Deactivate' : 'Activate'}>
                                {news.is_active ? <EyeOff className="w-3.5 h-3.5 fill-current" /> : <Eye className="w-3.5 h-3.5 fill-current" />}
                              </Button>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-500 hover:text-blue-400 hover:bg-[#1a1a1a]"
                                onClick={() => openEdit(news)} title="Edit">
                                <Edit className="w-3.5 h-3.5 fill-current" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-500 hover:text-red-400 hover:bg-[#1a1a1a]"
                                onClick={() => handleDelete(news.id)} title="Delete">
                                <Trash2 className="w-3.5 h-3.5 fill-current" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-gray-500">Page {page} of {totalPages} ({totalCount} items)</span>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="sm" disabled={page <= 1} className="h-8 border-[#333] text-gray-400 hover:bg-[#1a1a1a]"
                        onClick={() => { const p = page - 1; setPage(p); fetchNews(p); }}>
                        <ChevronLeft className="w-4 h-4 fill-current" />
                      </Button>
                      <Button variant="outline" size="sm" disabled={page >= totalPages} className="h-8 border-[#333] text-gray-400 hover:bg-[#1a1a1a]"
                        onClick={() => { const p = page + 1; setPage(p); fetchNews(p); }}>
                        <ChevronRight className="w-4 h-4 fill-current" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* ─── TEMPLATES TAB ──────────────────────────── */}
          <TabsContent value="templates" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-400">Reusable templates for quick news creation</p>
              <Button onClick={openTemplateCreate} size="sm" className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-1 fill-current" /> New Template
              </Button>
            </div>
            {templates.length === 0 ? (
              <Card className="bg-[#111] border-[#1e1e1e]">
                <CardContent className="p-8 text-center">
                  <FileText className="w-10 h-10 mx-auto mb-3 text-gray-600 fill-current" />
                  <p className="text-gray-400">No templates yet. Create one to speed up news creation.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates.map(t => (
                  <Card key={t.id} className="bg-[#111] border-[#1e1e1e] hover:border-[#333] transition-colors">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-white font-semibold truncate">{t.name}</h4>
                        <Badge className="bg-[#1a1a1a] text-gray-400 border-[#333] text-[10px]">{t.type}</Badge>
                      </div>
                      <p className="text-sm text-gray-500 line-clamp-2">{t.title || 'No title set'}</p>
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded border border-[#333]" style={{ backgroundColor: t.background_color }} title="Background" />
                        <div className="w-5 h-5 rounded border border-[#333]" style={{ backgroundColor: t.button_color }} title="Button" />
                        <span className="text-xs text-gray-600 ml-auto">{t.category || 'general'}</span>
                      </div>
                      <div className="flex items-center gap-1 pt-1 border-t border-[#1e1e1e]">
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-blue-400 hover:bg-blue-500/10 flex-1"
                          onClick={() => useTemplate(t)}>Use</Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-gray-400 hover:bg-[#1a1a1a] flex-1"
                          onClick={() => openTemplateEdit(t)}>Edit</Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-red-400 hover:bg-red-500/10 flex-1"
                          onClick={() => deleteTemplate(t.id)}>Delete</Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ─── CATEGORIES TAB ─────────────────────────── */}
          <TabsContent value="categories" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-400">Organize news with categories</p>
              <Button onClick={openCategoryCreate} size="sm" className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-1 fill-current" /> New Category
              </Button>
            </div>
            {categories.length === 0 ? (
              <Card className="bg-[#111] border-[#1e1e1e]">
                <CardContent className="p-8 text-center">
                  <Tag className="w-10 h-10 mx-auto mb-3 text-gray-600 fill-current" />
                  <p className="text-gray-400">No categories yet. Default "general" category is used.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {categories.map(c => (
                  <Card key={c.id} className="bg-[#111] border-[#1e1e1e] hover:border-[#333] transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                        <h4 className="text-white font-semibold truncate">{c.name}</h4>
                        <Badge className="bg-[#1a1a1a] text-gray-500 border-[#333] text-[10px] ml-auto">{c.slug}</Badge>
                      </div>
                      {c.description && <p className="text-sm text-gray-500 mb-2">{c.description}</p>}
                      <div className="flex items-center">
                        <span className="text-xs text-gray-600">{stats?.byCategory?.[c.slug] || 0} news items</span>
                        <div className="ml-auto flex items-center gap-1">
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-gray-400 hover:bg-[#1a1a1a]"
                            onClick={() => openCategoryEdit(c)}>Edit</Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-red-400 hover:bg-red-500/10"
                            onClick={() => deleteCategory(c.id)}>Delete</Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ─── ANALYTICS TAB ──────────────────────────── */}
          <TabsContent value="analytics" className="space-y-4 mt-4">
            {stats ? (
              <div className="space-y-6">
                {/* Overview cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard label="Total Seen" value={fmtNum(stats.totalSeen)} icon={Eye} color="text-blue-400" />
                  <StatCard label="Dismissals" value={fmtNum(stats.totalDismissals)} icon={XCircle} color="text-orange-400" />
                  <StatCard label="Expired" value={stats.expiredNews} icon={AlertTriangle} color="text-red-400" />
                  <StatCard label="Click Rate" value={`${stats.avgCtr}%`} icon={TrendingUp} color="text-emerald-400" />
                </div>

                {/* By Type breakdown */}
                <Card className="bg-[#111] border-[#1e1e1e]">
                  <CardContent className="p-4">
                    <h3 className="text-white font-semibold mb-3">Distribution by Type</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                      {Object.entries(stats.byType).map(([type, count]) => (
                        <div key={type} className="bg-[#0a0a0a] rounded-lg p-3 text-center border border-[#1e1e1e]">
                          <p className="text-lg font-bold text-white">{count}</p>
                          <p className="text-xs text-gray-500 capitalize">{type}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* By Priority breakdown */}
                <Card className="bg-[#111] border-[#1e1e1e]">
                  <CardContent className="p-4">
                    <h3 className="text-white font-semibold mb-3">Distribution by Priority</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {['urgent', 'high', 'normal', 'low'].map(p => (
                        <div key={p} className={`rounded-lg p-3 text-center border ${getPriorityColor(p)}`}>
                          <p className="text-lg font-bold">{stats.byPriority[p] || 0}</p>
                          <p className="text-xs capitalize opacity-80">{p}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Top performing news */}
                <Card className="bg-[#111] border-[#1e1e1e]">
                  <CardContent className="p-4">
                    <h3 className="text-white font-semibold mb-3">Top Performing News (by views)</h3>
                    {newsList.length === 0 ? (
                      <p className="text-gray-500 text-sm">Switch to the Manage tab and load news to see performance data here.</p>
                    ) : (
                      <div className="space-y-2">
                        {[...newsList].sort((a, b) => (b.view_count || 0) - (a.view_count || 0)).slice(0, 5).map(n => (
                          <div key={n.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 bg-[#0a0a0a] rounded p-2.5 border border-[#1e1e1e]">
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-sm font-medium truncate">{n.title}</p>
                            </div>
                            <div className="flex items-center gap-3 sm:gap-4 text-xs text-gray-500 shrink-0">
                              <span>{fmtNum(n.view_count || 0)} views</span>
                              <span>{fmtNum(n.click_count || 0)} clicks</span>
                              <span>{(n.view_count || 0) > 0 ? (((n.click_count || 0) / (n.view_count || 1)) * 100).toFixed(1) : '0.0'}% CTR</span>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-500 hover:text-white"
                                onClick={() => openAnalytics(n)}>
                                <BarChart3 className="w-3.5 h-3.5 fill-current" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="w-6 h-6 animate-spin text-gray-500 fill-current" />
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* ─── CREATE/EDIT DIALOG ───────────────────────── */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="max-w-6xl">
            <DialogHeader>
              <DialogTitle className="text-white">{editingNews ? 'Edit News' : 'Create News'}</DialogTitle>
              <DialogDescription className="text-gray-400">
                {editingNews ? 'Update news details and settings.' : 'Create a new news announcement.'}
              </DialogDescription>
            </DialogHeader>

            {/* Edit / Preview toggle */}
            <div className="flex space-x-1 bg-[#1a1a1a] p-1 rounded-lg">
              <Button variant={!showPreview ? 'default' : 'ghost'} size="sm" onClick={() => setShowPreview(false)} className="flex-1">
                <Edit className="w-4 h-4 mr-2 fill-current" /> Edit
              </Button>
              <Button variant={showPreview ? 'default' : 'ghost'} size="sm" onClick={() => setShowPreview(true)} className="flex-1">
                <EyeIcon className="w-4 h-4 mr-2 fill-current" /> Preview
              </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Form */}
              <div className={showPreview ? 'hidden lg:block' : ''}>
                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* Basic info */}
                  <div className="bg-[#0b0b0b] border border-[#222] rounded-xl p-4 space-y-3">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Basic Info</h4>
                    <div className="space-y-2">
                      <Label className="text-white text-sm">Title</Label>
                      <Input value={formData.title} onChange={e => setFormData(p => ({ ...p, title: e.target.value }))}
                        placeholder="Enter news title" required
                        className="bg-[#1a1a1a] border-[#333] text-white placeholder:text-gray-600" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white text-sm">Content</Label>
                      <Textarea value={formData.content} onChange={e => setFormData(p => ({ ...p, content: e.target.value }))}
                        placeholder="Enter news content" required
                        className="bg-[#1a1a1a] border-[#333] text-white placeholder:text-gray-600 min-h-[80px]" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label className="text-white text-sm">Type</Label>
                        <Select value={formData.type} onValueChange={v => setFormData(p => ({ ...p, type: v }))}>
                          <SelectTrigger className="bg-[#1a1a1a] border-[#333] text-white"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-[#1a1a1a] border-[#333]">
                            <SelectItem value="announcement">Announcement</SelectItem>
                            <SelectItem value="update">Update</SelectItem>
                            <SelectItem value="maintenance">Maintenance</SelectItem>
                            <SelectItem value="feature">Feature</SelectItem>
                            <SelectItem value="promotion">Promotion</SelectItem>
                            <SelectItem value="alert">Alert</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-white text-sm">Priority</Label>
                        <Select value={formData.priority} onValueChange={v => setFormData(p => ({ ...p, priority: v }))}>
                          <SelectTrigger className="bg-[#1a1a1a] border-[#333] text-white"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-[#1a1a1a] border-[#333]">
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="normal">Normal</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="urgent">Urgent</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label className="text-white text-sm">Category</Label>
                        <Select value={formData.category} onValueChange={v => setFormData(p => ({ ...p, category: v }))}>
                          <SelectTrigger className="bg-[#1a1a1a] border-[#333] text-white"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-[#1a1a1a] border-[#333]">
                            <SelectItem value="general">General</SelectItem>
                            {categories.map(c => <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-white text-sm">Target Users</Label>
                        <Select value={formData.target_users} onValueChange={v => setFormData(p => ({ ...p, target_users: v }))}>
                          <SelectTrigger className="bg-[#1a1a1a] border-[#333] text-white"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-[#1a1a1a] border-[#333]">
                            <SelectItem value="all">All Users</SelectItem>
                            <SelectItem value="verified">Verified</SelectItem>
                            <SelectItem value="unverified">Unverified</SelectItem>
                            <SelectItem value="traders">Traders</SelectItem>
                            <SelectItem value="inactive">Inactive</SelectItem>
                            <SelectItem value="admins">Admins Only</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white text-sm">Tags (comma separated)</Label>
                      <Input value={formData.tags} onChange={e => setFormData(p => ({ ...p, tags: e.target.value }))}
                        placeholder="e.g. crypto, trading, new-feature"
                        className="bg-[#1a1a1a] border-[#333] text-white placeholder:text-gray-600" />
                    </div>
                  </div>

                  {/* Image */}
                  <div className="bg-[#0b0b0b] border border-[#222] rounded-xl p-4 space-y-3">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Media</h4>
                    <div className="flex gap-2">
                      <Input value={formData.image_url} onChange={e => setFormData(p => ({ ...p, image_url: e.target.value }))}
                        placeholder="Image URL" className="bg-[#1a1a1a] border-[#333] text-white placeholder:text-gray-600 flex-1" />
                      <div className="relative">
                        <Input type="file" accept="image/*" onChange={handleImageUpload}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" disabled={uploadingImage} />
                        <Button type="button" variant="outline" size="sm" disabled={uploadingImage}
                          className="bg-[#1a1a1a] border-[#333] text-white hover:bg-[#2a2a2a]">
                          {uploadingImage ? <Loader2 className="w-4 h-4 animate-spin fill-current" /> : <Upload className="w-4 h-4 fill-current" />}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Styling */}
                  <div className="bg-[#0b0b0b] border border-[#222] rounded-xl p-4 space-y-3">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Styling</h4>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-white text-xs">Background</Label>
                        <Input type="color" value={formData.background_color} onChange={e => setFormData(p => ({ ...p, background_color: e.target.value }))}
                          className="bg-[#1a1a1a] border-[#333] h-9 w-full" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-white text-xs">Text</Label>
                        <Input type="color" value={formData.text_color} onChange={e => setFormData(p => ({ ...p, text_color: e.target.value }))}
                          className="bg-[#1a1a1a] border-[#333] h-9 w-full" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-white text-xs">Button</Label>
                        <Input type="color" value={formData.button_color} onChange={e => setFormData(p => ({ ...p, button_color: e.target.value }))}
                          className="bg-[#1a1a1a] border-[#333] h-9 w-full" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white text-sm">Button Text</Label>
                      <Input value={formData.button_text} onChange={e => setFormData(p => ({ ...p, button_text: e.target.value }))}
                        placeholder="Got it" className="bg-[#1a1a1a] border-[#333] text-white placeholder:text-gray-600" />
                    </div>
                  </div>

                  {/* Schedule & Behavior */}
                  <div className="bg-[#0b0b0b] border border-[#222] rounded-xl p-4 space-y-3">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Schedule & Behavior</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-white text-xs">Start Date</Label>
                        <Input type="datetime-local" value={formData.start_date} onChange={e => setFormData(p => ({ ...p, start_date: e.target.value }))}
                          className="bg-[#1a1a1a] border-[#333] text-white" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-white text-xs">End Date (optional)</Label>
                        <Input type="datetime-local" value={formData.end_date} onChange={e => setFormData(p => ({ ...p, end_date: e.target.value }))}
                          className="bg-[#1a1a1a] border-[#333] text-white" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-white text-xs">Popup Delay (ms)</Label>
                        <Input type="number" value={formData.popup_delay} onChange={e => setFormData(p => ({ ...p, popup_delay: parseInt(e.target.value) || 0 }))}
                          className="bg-[#1a1a1a] border-[#333] text-white" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-white text-xs">Auto Close (sec, 0=manual)</Label>
                        <Input type="number" value={formData.auto_close} onChange={e => setFormData(p => ({ ...p, auto_close: parseInt(e.target.value) || 0 }))}
                          className="bg-[#1a1a1a] border-[#333] text-white" />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-6 pt-1">
                      <div className="flex items-center gap-2">
                        <Switch checked={formData.is_active} onCheckedChange={v => setFormData(p => ({ ...p, is_active: v }))}
                          className="data-[state=checked]:bg-blue-500" />
                        <Label className="text-white text-sm">Active</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch checked={formData.show_popup} onCheckedChange={v => setFormData(p => ({ ...p, show_popup: v }))}
                          className="data-[state=checked]:bg-blue-500" />
                        <Label className="text-white text-sm">Popup</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch checked={formData.is_pinned} onCheckedChange={v => setFormData(p => ({ ...p, is_pinned: v }))}
                          className="data-[state=checked]:bg-yellow-500" />
                        <Label className="text-white text-sm">Pinned</Label>
                      </div>
                    </div>
                  </div>

                  {/* A/B Testing */}
                  <div className="bg-[#0b0b0b] border border-[#222] rounded-xl p-4 space-y-3">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">A/B Testing (Optional)</h4>
                    <p className="text-xs text-gray-600">Create two variants with the same Group ID to run an A/B test.</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-white text-xs">Variant (A or B)</Label>
                        <Select value={formData.ab_variant || 'none'} onValueChange={v => setFormData(p => ({ ...p, ab_variant: v === 'none' ? '' : v }))}>
                          <SelectTrigger className="bg-[#1a1a1a] border-[#333] text-white"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-[#1a1a1a] border-[#333]">
                            <SelectItem value="none">None</SelectItem>
                            <SelectItem value="A">Variant A</SelectItem>
                            <SelectItem value="B">Variant B</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-white text-xs">Group ID</Label>
                        <Input value={formData.ab_group_id} onChange={e => setFormData(p => ({ ...p, ab_group_id: e.target.value }))}
                          placeholder="e.g. test-march-2026"
                          className="bg-[#1a1a1a] border-[#333] text-white placeholder:text-gray-600" />
                      </div>
                    </div>
                  </div>

                  {/* Submit */}
                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}
                      className="border-[#333] text-white hover:bg-[#2a2a2a]">Cancel</Button>
                    <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={saving}>
                      {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin fill-current" />}
                      {editingNews ? 'Update' : 'Create'}
                    </Button>
                  </div>
                </form>
              </div>

              {/* Preview */}
              <div className={`${!showPreview ? 'hidden lg:block' : ''} flex items-start justify-center pt-4`}>
                <NewsPreview
                  title={formData.title} content={formData.content}
                  type={formData.type as any} image_url={formData.image_url}
                  background_color={formData.background_color} text_color={formData.text_color}
                  button_text={formData.button_text} button_color={formData.button_color}
                />
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ─── CONFIRM DIALOG ──────────────────────────── */}
        <Dialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-white">{confirmAction?.title}</DialogTitle>
              <DialogDescription className="text-gray-400">{confirmAction?.desc}</DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex gap-2">
              <Button variant="outline" onClick={() => setConfirmAction(null)}
                className="border-[#333] text-white hover:bg-[#2a2a2a]">Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700" onClick={confirmAction?.onConfirm}>Confirm</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ─── CATEGORY DIALOG ─────────────────────────── */}
        <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-white">{editingCategory ? 'Edit Category' : 'New Category'}</DialogTitle>
              <DialogDescription className="text-gray-400">Categories help organize your news items.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-white">Name</Label>
                <Input value={categoryForm.name} onChange={e => setCategoryForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Category name" className="bg-[#1a1a1a] border-[#333] text-white placeholder:text-gray-600" />
              </div>
              <div className="space-y-2">
                <Label className="text-white">Description</Label>
                <Input value={categoryForm.description} onChange={e => setCategoryForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Optional description" className="bg-[#1a1a1a] border-[#333] text-white placeholder:text-gray-600" />
              </div>
              <div className="space-y-2">
                <Label className="text-white">Color</Label>
                <Input type="color" value={categoryForm.color} onChange={e => setCategoryForm(p => ({ ...p, color: e.target.value }))}
                  className="bg-[#1a1a1a] border-[#333] h-10 w-full" />
              </div>
            </div>
            <DialogFooter className="flex gap-2">
              <Button variant="outline" onClick={() => setShowCategoryDialog(false)}
                className="border-[#333] text-white hover:bg-[#2a2a2a]">Cancel</Button>
              <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleCategorySubmit}>
                {editingCategory ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ─── TEMPLATE DIALOG ─────────────────────────── */}
        <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
          <DialogContent className="max-w-lg max-h-[80vh]">
            <DialogHeader>
              <DialogTitle className="text-white">{editingTemplate ? 'Edit Template' : 'New Template'}</DialogTitle>
              <DialogDescription className="text-gray-400">Templates provide reusable styling and content.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-white">Template Name</Label>
                <Input value={templateForm.name} onChange={e => setTemplateForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Standard Announcement" className="bg-[#1a1a1a] border-[#333] text-white placeholder:text-gray-600" />
              </div>
              <div className="space-y-2">
                <Label className="text-white">Default Title</Label>
                <Input value={templateForm.title} onChange={e => setTemplateForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="Default title" className="bg-[#1a1a1a] border-[#333] text-white placeholder:text-gray-600" />
              </div>
              <div className="space-y-2">
                <Label className="text-white">Default Content</Label>
                <Textarea value={templateForm.content} onChange={e => setTemplateForm(p => ({ ...p, content: e.target.value }))}
                  placeholder="Default content" className="bg-[#1a1a1a] border-[#333] text-white placeholder:text-gray-600 min-h-[60px]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-white text-sm">Type</Label>
                  <Select value={templateForm.type} onValueChange={v => setTemplateForm(p => ({ ...p, type: v }))}>
                    <SelectTrigger className="bg-[#1a1a1a] border-[#333] text-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-[#1a1a1a] border-[#333]">
                      <SelectItem value="announcement">Announcement</SelectItem>
                      <SelectItem value="update">Update</SelectItem>
                      <SelectItem value="maintenance">Maintenance</SelectItem>
                      <SelectItem value="feature">Feature</SelectItem>
                      <SelectItem value="promotion">Promotion</SelectItem>
                      <SelectItem value="alert">Alert</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-white text-sm">Category</Label>
                  <Select value={templateForm.category} onValueChange={v => setTemplateForm(p => ({ ...p, category: v }))}>
                    <SelectTrigger className="bg-[#1a1a1a] border-[#333] text-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-[#1a1a1a] border-[#333]">
                      <SelectItem value="general">General</SelectItem>
                      {categories.map(c => <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-white text-xs">Background</Label>
                  <Input type="color" value={templateForm.background_color} onChange={e => setTemplateForm(p => ({ ...p, background_color: e.target.value }))}
                    className="bg-[#1a1a1a] border-[#333] h-9 w-full" />
                </div>
                <div className="space-y-1">
                  <Label className="text-white text-xs">Text</Label>
                  <Input type="color" value={templateForm.text_color} onChange={e => setTemplateForm(p => ({ ...p, text_color: e.target.value }))}
                    className="bg-[#1a1a1a] border-[#333] h-9 w-full" />
                </div>
                <div className="space-y-1">
                  <Label className="text-white text-xs">Button</Label>
                  <Input type="color" value={templateForm.button_color} onChange={e => setTemplateForm(p => ({ ...p, button_color: e.target.value }))}
                    className="bg-[#1a1a1a] border-[#333] h-9 w-full" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-white">Button Text</Label>
                <Input value={templateForm.button_text} onChange={e => setTemplateForm(p => ({ ...p, button_text: e.target.value }))}
                  placeholder="Got it" className="bg-[#1a1a1a] border-[#333] text-white placeholder:text-gray-600" />
              </div>
            </div>
            <DialogFooter className="flex gap-2">
              <Button variant="outline" onClick={() => setShowTemplateDialog(false)}
                className="border-[#333] text-white hover:bg-[#2a2a2a]">Cancel</Button>
              <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleTemplateSubmit}>
                {editingTemplate ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ─── ANALYTICS DETAIL DIALOG ─────────────────── */}
        <Dialog open={!!analyticsNews} onOpenChange={() => { setAnalyticsNews(null); setAnalyticsData(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-white">Analytics: {analyticsNews?.title}</DialogTitle>
              <DialogDescription className="text-gray-400">Engagement metrics for this news item</DialogDescription>
            </DialogHeader>
            {analyticsData ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#0a0a0a] rounded-lg p-3 border border-[#1e1e1e] text-center">
                    <p className="text-lg font-bold text-blue-400">{fmtNum(analyticsData.news?.view_count || 0)}</p>
                    <p className="text-xs text-gray-500">Views</p>
                  </div>
                  <div className="bg-[#0a0a0a] rounded-lg p-3 border border-[#1e1e1e] text-center">
                    <p className="text-lg font-bold text-purple-400">{fmtNum(analyticsData.news?.click_count || 0)}</p>
                    <p className="text-xs text-gray-500">Clicks</p>
                  </div>
                  <div className="bg-[#0a0a0a] rounded-lg p-3 border border-[#1e1e1e] text-center">
                    <p className="text-lg font-bold text-orange-400">{fmtNum(analyticsData.news?.dismiss_count || 0)}</p>
                    <p className="text-xs text-gray-500">Dismissals</p>
                  </div>
                  <div className="bg-[#0a0a0a] rounded-lg p-3 border border-[#1e1e1e] text-center">
                    <p className="text-lg font-bold text-emerald-400">{fmtNum(analyticsData.seenCount || 0)}</p>
                    <p className="text-xs text-gray-500">Unique Seen</p>
                  </div>
                </div>
                <div className="bg-[#0a0a0a] rounded-lg p-3 border border-[#1e1e1e]">
                  <p className="text-xs text-gray-500 mb-2">Click-Through Rate</p>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-[#1a1a1a] rounded-full h-3 overflow-hidden">
                      <div className="bg-blue-500 h-full rounded-full transition-all"
                        style={{ width: `${Math.min(100, (analyticsData.news?.view_count > 0 ? ((analyticsData.news?.click_count || 0) / analyticsData.news.view_count) * 100 : 0))}%` }} />
                    </div>
                    <span className="text-sm font-bold text-white">
                      {analyticsData.news?.view_count > 0
                        ? (((analyticsData.news?.click_count || 0) / analyticsData.news.view_count) * 100).toFixed(1)
                        : '0.0'}%
                    </span>
                  </div>
                </div>
                {analyticsData.eventsByType && Object.keys(analyticsData.eventsByType).length > 0 && (
                  <div className="bg-[#0a0a0a] rounded-lg p-3 border border-[#1e1e1e]">
                    <p className="text-xs text-gray-500 mb-2">Event Breakdown</p>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(analyticsData.eventsByType).map(([type, count]) => (
                        <div key={type} className="flex items-center justify-between text-sm">
                          <span className="text-gray-400 capitalize">{type}</span>
                          <span className="text-white font-medium">{fmtNum(count as number)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-20">
                <Loader2 className="w-5 h-5 animate-spin text-gray-500 fill-current" />
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
