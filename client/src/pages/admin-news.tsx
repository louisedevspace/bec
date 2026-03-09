import { useState, useEffect } from 'react';
import { formatDate } from '@/lib/date-utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { Megaphone, Plus, Edit, Trash2, Eye, EyeOff, Calendar, Users, Palette, Clock, Upload, Eye as EyeIcon } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import AdminLayout from './admin-layout';
import NewsPreview from '@/components/news-preview';

interface News {
  id: number;
  title: string;
  content: string;
  type: 'announcement' | 'update' | 'maintenance' | 'feature';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  image_url?: string;
  background_color: string;
  text_color: string;
  button_text: string;
  button_color: string;
  is_active: boolean;
  show_popup: boolean;
  popup_delay: number;
  auto_close: number;
  target_users: 'all' | 'verified' | 'unverified' | 'traders' | 'inactive';
  start_date: string;
  end_date?: string;
  created_at: string;
  updated_at: string;
}

export default function AdminNews() {
  const [newsList, setNewsList] = useState<News[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingNews, setEditingNews] = useState<News | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Add CSS animation for fade-in effect
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeIn {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      .animate-fadeIn {
        animation: fadeIn 0.5s ease-out forwards;
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const [formData, setFormData] = useState({
    title: '',
    content: '',
    type: 'announcement' as 'announcement' | 'update' | 'maintenance' | 'feature',
    priority: 'normal' as 'low' | 'normal' | 'high' | 'urgent',
    image_url: '',
    background_color: '#111111',
    text_color: '#ffffff',
    button_text: 'Got it',
    button_color: '#3b82f6',
    is_active: true,
    show_popup: true,
    popup_delay: 2000,
    auto_close: 0,
    target_users: 'all' as 'all' | 'verified' | 'unverified' | 'traders' | 'inactive',
    start_date: new Date().toISOString().slice(0, 16),
    end_date: ''
  });

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    fetchNews();
  }, []);

  const fetchNews = async () => {
    try {
      const { data, error } = await supabase
        .from('news')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNewsList(data || []);
    } catch (error) {
      console.error('Error fetching news:', error);
      toast({
        title: "Error",
        description: "Failed to fetch news items",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Clean the data before sending
      const cleanedData = {
        ...formData,
        end_date: formData.end_date || null, // Convert empty string to null
      };

      if (editingNews) {
        const { error } = await supabase
          .from('news')
          .update({
            ...cleanedData,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingNews.id);

        if (error) throw error;
        toast({
          title: "Success",
          description: "News updated successfully"
        });
      } else {
        const { error } = await supabase
          .from('news')
          .insert([cleanedData]);

        if (error) throw error;
        toast({
          title: "Success",
          description: "News created successfully"
        });
      }

      setShowCreateDialog(false);
      setEditingNews(null);
      resetForm();
      fetchNews();
    } catch (error) {
      console.error('Error saving news:', error);
      toast({
        title: "Error",
        description: "Failed to save news",
        variant: "destructive"
      });
    }
  };

  const handleEdit = (news: News) => {
    setEditingNews(news);
    setFormData({
      title: news.title,
      content: news.content,
      type: news.type,
      priority: news.priority,
      image_url: news.image_url || '',
      background_color: news.background_color,
      text_color: news.text_color,
      button_text: news.button_text,
      button_color: news.button_color,
      is_active: news.is_active,
      show_popup: news.show_popup,
      popup_delay: news.popup_delay,
      auto_close: news.auto_close,
      target_users: news.target_users,
      start_date: new Date(news.start_date).toISOString().slice(0, 16),
      end_date: news.end_date ? new Date(news.end_date).toISOString().slice(0, 16) : ''
    });
    setShowCreateDialog(true);
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const { data: authData } = await supabase.auth.getSession();
      const accessToken = authData?.session?.access_token;
      if (!accessToken) {
        throw new Error('Missing auth session');
      }

      const body = new FormData();
      body.append('file', file);

      const response = await fetch('/api/news/upload-image', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body,
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || 'Upload failed');
      }

      setFormData(prev => ({ ...prev, image_url: result.publicUrl }));
      toast({
        title: "Success",
        description: "Image uploaded successfully"
      });
    } catch (error) {
      console.error('Error uploading image:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload image';
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setUploadingImage(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this news item? This will also remove all user tracking data for this news.')) return;

    try {
      const { data: authData } = await supabase.auth.getSession();
      const accessToken = authData?.session?.access_token;
      if (!accessToken) {
        throw new Error('Missing auth session');
      }

      const response = await fetch(`/api/news/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || 'Failed to delete news');
      }

      toast({
        title: "Success",
        description: "News deleted successfully"
      });
      
      fetchNews();
    } catch (error) {
      console.error('Error deleting news:', error);
      toast({
        title: "Error",
        description: "Failed to delete news. Please try again.",
        variant: "destructive"
      });
    }
  };

  const toggleActive = async (id: number, isActive: boolean) => {
    try {
      const { data: authData } = await supabase.auth.getSession();
      const accessToken = authData?.session?.access_token;
      if (!accessToken) {
        throw new Error('Missing auth session');
      }

      const response = await fetch(`/api/news/${id}/toggle`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ is_active: isActive }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || 'Failed to toggle news status');
      }
      toast({
        title: "Success",
        description: `News ${isActive ? 'activated' : 'deactivated'} successfully`
      });
      fetchNews();
    } catch (error) {
      console.error('Error toggling news:', error);
      toast({
        title: "Error",
        description: "Failed to toggle news status",
        variant: "destructive"
      });
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      content: '',
      type: 'announcement',
      priority: 'normal',
      image_url: '',
      background_color: '#111111',
      text_color: '#ffffff',
      button_text: 'Got it',
      button_color: '#3b82f6',
      is_active: true,
      show_popup: true,
      popup_delay: 2000,
      auto_close: 0,
      target_users: 'all',
      start_date: new Date().toISOString().slice(0, 16),
      end_date: ''
    });
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'normal': return 'bg-blue-500';
      case 'low': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'announcement': return '📢';
      case 'update': return '🔔';
      case 'maintenance': return '⚠️';
      case 'feature': return '✨';
      default: return '📢';
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-4 md:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
              <Megaphone className="w-5 h-5 md:w-6 md:h-6" />
              News Management
            </h1>
            <p className="text-gray-400 mt-1 text-sm md:text-base">Create and manage announcements for users</p>
          </div>
          <Button
            onClick={() => {
              resetForm();
              setEditingNews(null);
              setShowCreateDialog(true);
            }}
            className="bg-blue-500 hover:bg-blue-600 w-full sm:w-auto"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create News
          </Button>
        </div>

        <div className="grid gap-4">
          {newsList.map((news, index) => (
            <Card 
              key={news.id} 
              className="bg-[#111] border-[#1e1e1e] shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02] animate-fadeIn"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <CardContent className="p-4 md:p-6">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="text-lg md:text-xl">{getTypeIcon(news.type)}</span>
                      <h3 className="text-base md:text-lg font-semibold text-white truncate">{news.title}</h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <Badge className={getPriorityColor(news.priority)}>
                        {news.priority.toUpperCase()}
                      </Badge>
                      <Badge variant={news.is_active ? "default" : "secondary"} className="text-white">
                        {news.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <p className="text-gray-300 mb-4 text-sm md:text-base line-clamp-2">{news.content}</p>
                    <div className="flex flex-wrap items-center gap-3 md:gap-4 text-xs md:text-sm text-gray-400">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3 md:w-4 md:h-4" />
                        {news.target_users}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 md:w-4 md:h-4" />
                        {formatDate(news.created_at)}
                      </span>
                      {news.show_popup && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 md:w-4 md:h-4" />
                          {isMobile ? `${news.popup_delay}ms` : `Popup: ${news.popup_delay}ms delay`}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-row lg:flex-col items-center lg:items-end gap-2 lg:ml-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleActive(news.id, !news.is_active)}
                      className="w-10 h-10 lg:w-auto lg:h-auto border-[#333] text-white hover:bg-[#2a2a2a]"
                    >
                      {news.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      <span className="hidden lg:inline ml-2 text-white">{news.is_active ? 'Hide' : 'Show'}</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(news)}
                      className="w-10 h-10 lg:w-auto lg:h-auto border-[#333] text-white hover:bg-[#2a2a2a]"
                    >
                      <Edit className="w-4 h-4" />
                      <span className="hidden lg:inline ml-2 text-white">Edit</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(news.id)}
                      className="w-10 h-10 lg:w-auto lg:h-auto border-[#333] text-white hover:bg-[#2a2a2a]"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span className="hidden lg:inline ml-2 text-white">Delete</span>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {newsList.length === 0 && (
            <Card className="bg-[#111] border-[#1e1e1e] shadow-lg">
              <CardContent className="p-8 md:p-12 text-center">
                <Megaphone className="w-12 h-12 md:w-16 md:h-16 mx-auto mb-4 text-gray-500" />
                <h3 className="text-lg md:text-xl font-semibold text-white mb-2">No News Items</h3>
                <p className="text-gray-400 mb-6 text-sm md:text-base">Create your first news announcement to get started</p>
                <Button
                  onClick={() => {
                    resetForm();
                    setEditingNews(null);
                    setShowCreateDialog(true);
                  }}
                  className="bg-blue-500 hover:bg-blue-600 w-full sm:w-auto"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create News
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Create/Edit Dialog */}
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogContent className="bg-[#111] border-[#1e1e1e] max-w-6xl w-[95vw] max-h-[90vh] overflow-y-auto mx-auto">
              <DialogHeader>
                <DialogTitle className="text-white text-lg md:text-xl">
                  {editingNews ? 'Edit News' : 'Create News'}
                </DialogTitle>
                <DialogDescription className="text-gray-400">
                  {editingNews 
                    ? 'Update the news announcement details and settings.' 
                    : 'Create a new news announcement to broadcast to users.'
                  }
                </DialogDescription>
              </DialogHeader>
              
              {/* Tabs */}
              <div className="flex space-x-1 bg-[#1a1a1a] p-1 rounded-lg">
                <Button
                  variant={!showPreview ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setShowPreview(false)}
                  className="flex-1"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Edit
                </Button>
                <Button
                  variant={showPreview ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setShowPreview(true)}
                  className="flex-1"
                >
                  <EyeIcon className="w-4 h-4 mr-2" />
                  Preview
                </Button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Form Section */}
                <div className={`${showPreview ? 'hidden lg:block' : ''}`}>
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="bg-[#0b0b0b] border border-[#222] rounded-xl p-4 space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="title" className="text-white text-sm">Title</Label>
                        <Input
                          id="title"
                          value={formData.title}
                          onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                          placeholder="Enter news title"
                          className="bg-[#1a1a1a] border-[#333] text-white placeholder:text-gray-500 focus:border-blue-500"
                          required
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="type" className="text-white text-sm">Type</Label>
                        <Select value={formData.type} onValueChange={(value: any) => setFormData(prev => ({ ...prev, type: value }))}>
                          <SelectTrigger className="bg-[#1a1a1a] border-[#333] text-white focus:border-blue-500">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-[#1a1a1a] border-[#333]">
                            <SelectItem value="announcement">📢 Announcement</SelectItem>
                            <SelectItem value="update">🔔 Update</SelectItem>
                            <SelectItem value="maintenance">⚠️ Maintenance</SelectItem>
                            <SelectItem value="feature">✨ Feature</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="priority" className="text-white text-sm">Priority</Label>
                        <Select value={formData.priority} onValueChange={(value: any) => setFormData(prev => ({ ...prev, priority: value }))}>
                          <SelectTrigger className="bg-[#1a1a1a] border-[#333] text-white focus:border-blue-500">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-[#1a1a1a] border-[#333]">
                            <SelectItem value="low">🟢 Low</SelectItem>
                            <SelectItem value="normal">🔵 Normal</SelectItem>
                            <SelectItem value="high">🟠 High</SelectItem>
                            <SelectItem value="urgent">🔴 Urgent</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="target_users" className="text-white text-sm">Target Users</Label>
                        <Select value={formData.target_users} onValueChange={(value: any) => setFormData(prev => ({ ...prev, target_users: value }))}>
                          <SelectTrigger className="bg-[#1a1a1a] border-[#333] text-white focus:border-blue-500">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-[#1a1a1a] border-[#333]">
                            <SelectItem value="all">All Users</SelectItem>
                            <SelectItem value="verified">Verified Users</SelectItem>
                            <SelectItem value="unverified">Unverified Users</SelectItem>
                            <SelectItem value="traders">Active Traders</SelectItem>
                            <SelectItem value="inactive">Inactive Users</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="bg-[#0b0b0b] border border-[#222] rounded-xl p-4 space-y-4">
                      <div className="space-y-2">
                      <Label htmlFor="content" className="text-white text-sm">Content</Label>
                      <Textarea
                        id="content"
                        value={formData.content}
                        onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                        placeholder="Enter news content"
                        className="bg-[#1a1a1a] border-[#333] text-white placeholder:text-gray-500 focus:border-blue-500 min-h-[100px]"
                        required
                      />
                      </div>

                      <div className="space-y-2">
                      <Label htmlFor="image_url" className="text-white text-sm">Image</Label>
                      <div className="flex gap-2">
                        <Input
                          id="image_url"
                          value={formData.image_url}
                          onChange={(e) => setFormData(prev => ({ ...prev, image_url: e.target.value }))}
                          placeholder="Or enter image URL"
                          className="bg-[#1a1a1a] border-[#333] text-white placeholder:text-gray-500 focus:border-blue-500 flex-1"
                        />
                        <div className="relative">
                          <Input
                            type="file"
                            accept="image/*"
                            onChange={handleImageUpload}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            disabled={uploadingImage}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={uploadingImage}
                            className="bg-[#1a1a1a] border-[#333] text-white hover:bg-[#2a2a2a]"
                          >
                            <Upload className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      {uploadingImage && (
                        <p className="text-xs text-gray-400">Uploading image...</p>
                      )}
                      </div>
                    </div>

                    <div className="bg-[#0b0b0b] border border-[#222] rounded-xl p-4 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-2">
                        <Label htmlFor="background_color" className="text-white text-sm">Background</Label>
                        <Input
                          id="background_color"
                          type="color"
                          value={formData.background_color}
                          onChange={(e) => setFormData(prev => ({ ...prev, background_color: e.target.value }))}
                          className="bg-[#1a1a1a] border-[#333] text-white h-10 w-full"
                        />
                      </div>
                        <div className="space-y-2">
                        <Label htmlFor="text_color" className="text-white text-sm">Text Color</Label>
                        <Input
                          id="text_color"
                          type="color"
                          value={formData.text_color}
                          onChange={(e) => setFormData(prev => ({ ...prev, text_color: e.target.value }))}
                          className="bg-[#1a1a1a] border-[#333] text-white h-10 w-full"
                        />
                      </div>
                        <div className="space-y-2">
                        <Label htmlFor="button_color" className="text-white text-sm">Button Color</Label>
                        <Input
                          id="button_color"
                          type="color"
                          value={formData.button_color}
                          onChange={(e) => setFormData(prev => ({ ...prev, button_color: e.target.value }))}
                          className="bg-[#1a1a1a] border-[#333] text-white h-10 w-full"
                        />
                      </div>
                      </div>

                      <div className="space-y-2">
                      <Label htmlFor="button_text" className="text-white text-sm">Button Text</Label>
                      <Input
                        id="button_text"
                        value={formData.button_text}
                        onChange={(e) => setFormData(prev => ({ ...prev, button_text: e.target.value }))}
                        placeholder="Got it"
                        className="bg-[#1a1a1a] border-[#333] text-white placeholder:text-gray-500 focus:border-blue-500"
                      />
                      </div>
                    </div>

                    <div className="bg-[#0b0b0b] border border-[#222] rounded-xl p-4 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                        <Label htmlFor="start_date" className="text-white text-sm">Start Date</Label>
                        <Input
                          id="start_date"
                          type="datetime-local"
                          value={formData.start_date}
                          onChange={(e) => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                          className="bg-[#1a1a1a] border-[#333] text-white focus:border-blue-500"
                        />
                      </div>
                        <div className="space-y-2">
                        <Label htmlFor="end_date" className="text-white text-sm">End Date (optional)</Label>
                        <Input
                          id="end_date"
                          type="datetime-local"
                          value={formData.end_date}
                          onChange={(e) => setFormData(prev => ({ ...prev, end_date: e.target.value }))}
                          className="bg-[#1a1a1a] border-[#333] text-white focus:border-blue-500"
                        />
                      </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                        <Label htmlFor="popup_delay" className="text-white text-sm">Popup Delay (ms)</Label>
                        <Input
                          id="popup_delay"
                          type="number"
                          value={formData.popup_delay}
                          onChange={(e) => setFormData(prev => ({ ...prev, popup_delay: parseInt(e.target.value) }))}
                          placeholder="2000"
                          className="bg-[#1a1a1a] border-[#333] text-white placeholder:text-gray-500 focus:border-blue-500"
                        />
                      </div>
                        <div className="space-y-2">
                        <Label htmlFor="auto_close" className="text-white text-sm">Auto Close (seconds)</Label>
                        <Input
                          id="auto_close"
                          type="number"
                          value={formData.auto_close}
                          onChange={(e) => setFormData(prev => ({ ...prev, auto_close: parseInt(e.target.value) }))}
                          placeholder="0 = manual"
                          className="bg-[#1a1a1a] border-[#333] text-white placeholder:text-gray-500 focus:border-blue-500"
                        />
                      </div>
                      </div>
                    </div>

                    <div className="bg-[#0b0b0b] border border-[#222] rounded-xl p-4 space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 space-y-4 sm:space-y-0">
                        <div className="flex items-center space-x-2">
                        <Switch
                          id="is_active"
                          checked={formData.is_active}
                          onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
                          className="data-[state=checked]:bg-blue-500"
                        />
                        <Label htmlFor="is_active" className="text-white text-sm">Active</Label>
                      </div>
                        <div className="flex items-center space-x-2">
                        <Switch
                          id="show_popup"
                          checked={formData.show_popup}
                          onCheckedChange={(checked) => setFormData(prev => ({ ...prev, show_popup: checked }))}
                          className="data-[state=checked]:bg-blue-500"
                        />
                        <Label htmlFor="show_popup" className="text-white text-sm">Show Popup</Label>
                      </div>
                    </div>
                    </div>

                    <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-2 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowCreateDialog(false)}
                        className="border-[#333] text-white hover:bg-[#2a2a2a] w-full sm:w-auto"
                      >
                        Cancel
                      </Button>
                      <Button type="submit" className="bg-blue-500 hover:bg-blue-600 w-full sm:w-auto">
                        {editingNews ? 'Update' : 'Create'}
                      </Button>
                    </div>
                  </form>
                </div>

                {/* Preview Section */}
                <div className={`${!showPreview ? 'hidden lg:block' : ''} flex items-center justify-center`}>
                  <NewsPreview
                    title={formData.title}
                    content={formData.content}
                    type={formData.type}
                    image_url={formData.image_url}
                    background_color={formData.background_color}
                    text_color={formData.text_color}
                    button_text={formData.button_text}
                    button_color={formData.button_color}
                  />
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </AdminLayout>
  );
}
