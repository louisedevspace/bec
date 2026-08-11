import { useState, useEffect, useRef, useCallback } from 'react';
import { formatDate, formatTime } from '@/lib/date-utils';
import { useLocation } from 'wouter';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { MessageSquare, Send, Clock, CheckCircle, AlertCircle, XCircle, ArrowLeft, Search, Plus, RefreshCw, ThumbsUp, RotateCcw, Shield, Lock, Info, Paperclip, X } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { LinkPreview, extractUrls } from '@/components/ui/link-preview';
import { compressUserImage } from '@/lib/image-compress';
import { getImageDisplayUrl, openImageViewer } from '@/lib/image';
import { buildApiUrl } from '@/lib/config';
import { useDataSync } from '@/hooks/use-data-sync';
import { EnablePushButton } from '@/components/notifications/enable-push-button';


interface SupportConversation {
  id: number;
  user_id: string;
  subject: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category?: string;
  created_at: string;
  updated_at: string;
  last_message_at: string;
  support_messages: SupportMessage[];
}

interface SupportMessage {
  id: number;
  conversation_id: number;
  message: string;
  sender_type: 'user' | 'admin';
  message_type?: 'text' | 'system' | 'image' | 'file';
  attachment_url?: string;
  is_read?: boolean;
  created_at: string;
}

// Helper to get auth headers
async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Authorization': `Bearer ${session?.access_token ?? ''}`,
    'Content-Type': 'application/json',
  };
}

async function authHeadersMultipart(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Authorization': `Bearer ${session?.access_token ?? ''}`,
  };
}

export default function SupportPage() {
  const [, setLocation] = useLocation();
  const [conversations, setConversations] = useState<SupportConversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<SupportConversation | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showNewConversationForm, setShowNewConversationForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [newConversationData, setNewConversationData] = useState({
    subject: '',
    priority: 'medium' as 'low' | 'medium' | 'high' | 'urgent',
    message: '',
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const selectedIdRef = useRef<number | null>(null);

  // Keep selectedIdRef in sync
  useEffect(() => {
    selectedIdRef.current = selectedConversation?.id ?? null;
  }, [selectedConversation?.id]);

  // Scroll the message list itself — scrollIntoView drags the whole page on mobile
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  }, [selectedConversation?.id, selectedConversation?.support_messages?.length]);

  // Lock body scroll while the mobile full-screen chat is open
  useEffect(() => {
    if (!selectedConversation) return;
    const isMobile = window.matchMedia('(max-width: 1023px)').matches;
    if (!isMobile) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [selectedConversation?.id]);

  // Fetch conversations
  const fetchConversations = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const headers = await authHeaders();
      const response = await fetch('/api/support/conversation', { headers });

      if (response.ok) {
        const data = await response.json();
        const list: SupportConversation[] = Array.isArray(data) ? data : data ? [data] : [];
        setConversations(list);

        // Keep selectedConversation in sync with fresh data
        if (selectedIdRef.current) {
          const updated = list.find(c => c.id === selectedIdRef.current);
          if (updated) setSelectedConversation(updated);
        }
      } else if (response.status === 404) {
        setConversations([]);
      }
    } catch (error) {
      console.error('Error fetching support conversations:', error);
      if (!silent) setConversations([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Real-time delivery: the server broadcasts support events over the sync
  // socket, so refetch the moment one lands instead of waiting for a poll.
  useDataSync({
    onSync: (action) => {
      if (action.startsWith('create-support') || action.startsWith('update-support')) {
        fetchConversations(true);
      }
    },
  });

  // Initial fetch. Polling is only a fallback for a dropped socket now, so it
  // can be slow — the websocket handles the instant path.
  useEffect(() => {
    fetchConversations();
    const interval = setInterval(() => fetchConversations(true), 30000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  // Image upload handlers
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Please select an image file'); return; }
    if (file.size > 5 * 1024 * 1024) { alert('Image must be under 5MB'); return; }
    setPendingImage(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPendingImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const clearPendingImage = () => {
    setPendingImage(null);
    setPendingImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Send message
  const handleSendMessage = async () => {
    if ((!message.trim() && !pendingImage) || !selectedConversation) return;

    setSending(true);
    try {
      let attachmentUrl: string | undefined;
      let messageType: 'text' | 'image' = 'text';

      // Upload image first if pending
      if (pendingImage) {
        setUploading(true);
        try {
          const compressed = await compressUserImage(pendingImage);
          const formData = new FormData();
          formData.append('file', compressed);

          const uploadHeaders = await authHeadersMultipart();
          const uploadRes = await fetch(buildApiUrl('/support/upload-image'), {
            method: 'POST',
            headers: uploadHeaders,
            body: formData,
          });

          if (!uploadRes.ok) {
            const err = await uploadRes.json().catch(() => ({ message: 'Upload failed' }));
            alert(err.message || 'Failed to upload image');
            return;
          }

          const data = await uploadRes.json();
          attachmentUrl = data.attachmentUrl;
          messageType = 'image';
        } finally {
          setUploading(false);
        }
      }

      const headers = await authHeaders();
      const response = await fetch(buildApiUrl('/support/messages'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          conversationId: selectedConversation.id,
          message: message.trim() || '(Image)',
          messageType,
          attachmentUrl,
        }),
      });

      if (response.ok) {
        setMessage('');
        clearPendingImage();
        await fetchConversations(true);
      } else {
        const err = await response.json().catch(() => ({ message: 'Failed to send message' }));
        alert(err.message || 'Failed to send message');
      }
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setSending(false);
    }
  };

  // Create conversation
  const handleCreateConversation = async () => {
    if (!newConversationData.subject || !newConversationData.message) return;

    setSending(true);
    try {
      const headers = await authHeaders();
      const response = await fetch('/api/support/conversation', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          subject: newConversationData.subject,
          priority: newConversationData.priority,
          message: newConversationData.message,
        }),
      });

      if (response.ok) {
        const createdConversation = await response.json();
        setShowNewConversationForm(false);
        setNewConversationData({ subject: '', priority: 'medium', message: '' });
        // Refetch to get the full list including the new one
        await fetchConversations(true);
        setSelectedConversation(createdConversation);
      } else {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        alert(`Failed to create conversation: ${errorData.message || 'Please try again'}`);
      }
    } catch (error) {
      console.error('Error creating support conversation:', error);
      alert('Error creating conversation. Please try again.');
    } finally {
      setSending(false);
    }
  };

  // Confirm resolution
  const handleConfirmResolution = async () => {
    if (!selectedConversation) return;
    setActionLoading(true);
    try {
      const headers = await authHeaders();
      const response = await fetch(`/api/support/conversation/${selectedConversation.id}/confirm-resolution`, {
        method: 'POST',
        headers,
      });
      if (response.ok) {
        await fetchConversations(true);
      } else {
        const err = await response.json().catch(() => ({ message: 'Failed' }));
        alert(err.message || 'Failed to confirm resolution');
      }
    } catch (error) {
      console.error('Error confirming resolution:', error);
    } finally {
      setActionLoading(false);
    }
  };

  // Reopen ticket
  const handleReopen = async () => {
    if (!selectedConversation) return;
    setActionLoading(true);
    try {
      const headers = await authHeaders();
      const response = await fetch(`/api/support/conversation/${selectedConversation.id}/reopen`, {
        method: 'POST',
        headers,
      });
      if (response.ok) {
        await fetchConversations(true);
      } else {
        const err = await response.json().catch(() => ({ message: 'Failed' }));
        alert(err.message || 'Failed to reopen ticket');
      }
    } catch (error) {
      console.error('Error reopening ticket:', error);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Enter key to send — on touch keyboards Enter must insert a newline,
  // otherwise every line break fires a send.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const isDesktop = typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;
    if (isDesktop && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Count unread admin messages in a conversation
  const getUnreadCount = (conv: SupportConversation) => {
    if (!conv.support_messages) return 0;
    return conv.support_messages.filter(m => m.sender_type === 'admin' && !m.is_read).length;
  };

  const filteredConversations = conversations.filter(conv => {
    const matchesSearch = typeof conv.subject === 'string' && conv.subject.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || conv.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'text-info';
      case 'in_progress': return 'text-warning';
      case 'resolved': return 'text-success';
      case 'closed': return 'text-muted-foreground';
      default: return 'text-muted-foreground';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open': return <MessageSquare size={14} />;
      case 'in_progress': return <Clock size={14} />;
      case 'resolved': return <CheckCircle size={14} />;
      case 'closed': return <XCircle size={14} />;
      default: return <AlertCircle size={14} />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'low': return 'bg-success/10 text-success border-success/20';
      case 'medium': return 'bg-warning/10 text-warning border-warning/20';
      case 'high': return 'bg-warning/15 text-warning border-warning/25';
      case 'urgent': return 'bg-danger/10 text-danger border-danger/20';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const getCategoryLabel = (cat?: string) => {
    const labels: Record<string, string> = {
      deposit: 'Deposit', withdrawal: 'Withdrawal', trading: 'Trading',
      account: 'Account', technical: 'Technical', kyc: 'KYC',
      security: 'Security', general: 'General',
    };
    return labels[cat || 'general'] || 'General';
  };

  // Render a single message bubble (or system message)
  const renderMessage = (msg: SupportMessage) => {
    // System messages rendered as centered pills
    if (msg.message_type === 'system') {
      return (
        <div key={msg.id} className="flex justify-center my-2">
          <div className="bg-muted border border-border rounded-full px-4 py-1.5 flex items-center gap-2">
            <Info size={12} className="text-muted-foreground flex-shrink-0" />
            <span className="text-xs text-muted-foreground">{msg.message}</span>
            <span className="text-[10px] text-muted-foreground/70 ml-1">
              {formatTime(msg.created_at)}
            </span>
          </div>
        </div>
      );
    }

    const isUser = msg.sender_type === 'user';
    // Extract first URL for preview (only for non-system messages)
    const urls = extractUrls(msg.message || '');
    const firstUrl = urls.length > 0 ? urls[0] : null;

    return (
      <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
        {!isUser && (
          <div className="w-7 h-7 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center mr-2 mt-1 flex-shrink-0">
            <Shield size={12} className="text-primary" />
          </div>
        )}
        <div className={`max-w-[85%] sm:max-w-[75%] lg:max-w-[70%] px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-2xl ${
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-md'
            : 'bg-muted border border-border text-foreground rounded-bl-md'
        }`}>
          {!isUser && (
            <p className="text-[10px] text-primary font-medium mb-1">Support Agent</p>
          )}
          {/* Image attachment */}
          {msg.message_type === 'image' && msg.attachment_url && (
            <div className="mb-1">
              <img
                src={getImageDisplayUrl(msg.attachment_url)}
                alt="Attachment"
                className="w-auto max-w-full sm:max-w-[16rem] md:max-w-xs max-h-52 rounded-lg cursor-pointer object-cover"
                onClick={() => openImageViewer(msg.attachment_url, 'Support Attachment')}
                loading="lazy"
              />
            </div>
          )}
          {/* Text content (skip placeholder for image-only).
              break-words keeps long links from stretching the bubble. */}
          {msg.message && msg.message !== '(Image)' && (
            <p className="text-sm whitespace-pre-wrap break-words text-left leading-relaxed">{msg.message}</p>
          )}
          {/* Link preview for first URL in message */}
          {firstUrl && (
            <div className="mt-2">
              <LinkPreview url={firstUrl} className="!bg-background !border-border" />
            </div>
          )}
          <p className={`text-[10px] opacity-60 mt-1.5 ${isUser ? 'text-right' : 'text-left'}`}>
            {formatTime(msg.created_at)}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="bg-background border-b border-border sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => setLocation('/profile')}
              className="p-2 hover:bg-card rounded-lg transition-colors"
            >
              <ArrowLeft size={20} className="text-muted-foreground" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-foreground">Customer Support</h1>
              <p className="text-xs text-muted-foreground">Get help with your account and issues</p>
            </div>
            <EnablePushButton className="hidden sm:inline-flex" />
            <button
              onClick={() => fetchConversations(true)}
              className="p-2 hover:bg-card rounded-lg transition-colors"
              title="Refresh"
            >
              <RefreshCw size={16} className="text-muted-foreground" />
            </button>
          </div>

          {/* Search and Filter */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-card border border-border rounded-lg pl-9 pr-3 py-2.5 text-base sm:text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary transition-colors"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-card border border-border rounded-lg px-3 py-2.5 text-base sm:text-sm text-muted-foreground focus:outline-none focus:border-primary transition-colors"
            >
              <option value="all">All Status</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          {/* Mobile: notification opt-in sits below the filters where there's room */}
          <EnablePushButton className="sm:hidden mt-2 w-full justify-center" />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 w-full mx-auto grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 max-w-7xl">
        {/* Left: Conversations List */}
        <div className={`lg:col-span-1 flex flex-col ${selectedConversation ? "hidden lg:flex" : "flex"}`}>
          <button
            onClick={() => setShowNewConversationForm(true)}
            className="flex-shrink-0 w-full min-h-[44px] bg-primary hover:opacity-90 text-primary-foreground font-medium rounded-xl transition-opacity flex items-center justify-center gap-2 mb-4"
          >
            <Plus size={16} />
            New Conversation
          </button>

          {/* Conversations List */}
          <div className="bg-card rounded-xl border border-border overflow-hidden flex flex-col flex-1 shadow-sm">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-muted-foreground">Loading conversations...</div>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                {conversations.length === 0 ? 'No support conversations yet' : 'No matching conversations'}
              </div>
            ) : (
              <div className="overflow-y-auto flex-1">
                {filteredConversations.map((conv) => {
                  const unread = getUnreadCount(conv);
                  return (
                    <button
                      key={conv.id}
                      onClick={() => setSelectedConversation(conv)}
                      className={`w-full p-4 text-left border-b border-border hover:bg-muted transition-colors ${
                        selectedConversation?.id === conv.id ? 'bg-muted' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3 mb-2">
                        <div className={getStatusColor(conv.status)}>
                          {getStatusIcon(conv.status)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-medium text-foreground truncate flex-1">{conv.subject}</h3>
                            {unread > 0 && (
                              <span className="bg-primary text-primary-foreground text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">
                                {unread}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {conv.last_message_at
                              ? formatDate(conv.last_message_at)
                              : formatDate(conv.created_at)}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2 ml-7">
                        <span className={`text-xs px-2 py-0.5 rounded border ${getPriorityColor(conv.priority)}`}>
                          {conv.priority}
                        </span>
                        {conv.category && conv.category !== 'general' && (
                          <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                            {getCategoryLabel(conv.category)}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Conversation Details.
            On mobile the open chat becomes a full-screen sheet so the composer
            can never end up underneath the fixed bottom navigation. */}
        <div
          className={`lg:col-span-2 flex flex-col min-h-0 ${
            selectedConversation
              ? "fixed inset-0 z-[70] bg-background lg:static lg:z-auto lg:bg-transparent"
              : "hidden lg:flex"
          }`}
        >
          {selectedConversation ? (
            <>
              {/* Mobile chat top bar */}
              <div className="lg:hidden flex items-center gap-1 px-2 pb-2 border-b border-border bg-card flex-shrink-0 chat-safe-top">
                <button
                  onClick={() => setSelectedConversation(null)}
                  className="h-11 w-11 flex items-center justify-center rounded-xl text-foreground active:bg-muted transition-colors flex-shrink-0"
                  aria-label="Back to conversations"
                >
                  <ArrowLeft size={20} />
                </button>
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-semibold text-foreground truncate">{selectedConversation.subject}</h2>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className={`capitalize ${getStatusColor(selectedConversation.status)}`}>
                      {selectedConversation.status.replace('_', ' ')}
                    </span>
                    <span>·</span>
                    <span>#{selectedConversation.id}</span>
                    <span>·</span>
                    <span className="capitalize">{selectedConversation.priority}</span>
                  </div>
                </div>
                <button
                  onClick={() => fetchConversations(true)}
                  className="h-11 w-11 flex items-center justify-center rounded-xl text-muted-foreground active:bg-muted transition-colors flex-shrink-0"
                  aria-label="Refresh messages"
                >
                  <RefreshCw size={18} />
                </button>
              </div>

              {/* Conversation Header — desktop only */}
              <div className="hidden lg:block bg-card rounded-xl border border-border p-4 mb-4 shadow-sm">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0 mr-3">
                    <h2 className="text-lg font-bold text-foreground truncate">{selectedConversation.subject}</h2>
                    <p className="text-xs text-muted-foreground mt-1">Ticket #{selectedConversation.id}</p>
                  </div>
                  <div className={`flex items-center gap-2 flex-shrink-0 ${getStatusColor(selectedConversation.status)}`}>
                    {getStatusIcon(selectedConversation.status)}
                    <span className="text-sm font-medium capitalize">{selectedConversation.status.replace('_', ' ')}</span>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <span className={`text-xs px-3 py-1 rounded border ${getPriorityColor(selectedConversation.priority)}`}>
                    {selectedConversation.priority}
                  </span>
                  {selectedConversation.category && (
                    <span className="text-xs px-3 py-1 rounded bg-muted text-muted-foreground border border-border">
                      {getCategoryLabel(selectedConversation.category)}
                    </span>
                  )}
                  <span className="text-xs bg-muted text-muted-foreground px-3 py-1 rounded border border-border">
                    {formatDate(selectedConversation.created_at)}
                  </span>
                </div>
              </div>

              {/* Resolution action bar — shown on every screen size */}
              {selectedConversation.status === 'resolved' && (
                <div className="bg-success/5 border-b lg:border border-success/20 lg:rounded-xl p-3 lg:mb-4 flex-shrink-0">
                  <p className="text-sm text-success mb-3 flex items-center gap-2">
                    <CheckCircle size={14} className="flex-shrink-0" />
                    This ticket has been marked as resolved by support.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleConfirmResolution}
                      disabled={actionLoading}
                      className="flex-1 min-h-[44px] bg-success/15 hover:bg-success/25 border border-success/30 text-success text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <ThumbsUp size={14} />
                      {actionLoading ? 'Processing...' : 'Confirm & Close'}
                    </button>
                    <button
                      onClick={handleReopen}
                      disabled={actionLoading}
                      className="flex-1 min-h-[44px] bg-warning/10 hover:bg-warning/20 border border-warning/20 text-warning text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <RotateCcw size={14} />
                      {actionLoading ? 'Processing...' : 'Reopen Ticket'}
                    </button>
                  </div>
                </div>
              )}

              {/* Messages Area */}
              <div className="bg-background lg:bg-card lg:rounded-xl lg:border lg:border-border lg:p-4 flex-1 flex flex-col overflow-hidden lg:mb-4 min-h-0 lg:shadow-sm">
                <div
                  ref={messagesContainerRef}
                  className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 lg:px-0 lg:py-0 lg:mb-4 space-y-3 lg:pr-2"
                >
                  {selectedConversation.support_messages && selectedConversation.support_messages.length > 0 ? (
                    selectedConversation.support_messages.map(renderMessage)
                  ) : (
                    <div className="text-center text-muted-foreground text-sm py-8">No messages yet</div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Message Input or Closed Notice */}
                {selectedConversation.status === 'closed' ? (
                  <div className="bg-muted border-t lg:border border-border lg:rounded-xl p-3 flex items-start gap-2 text-muted-foreground text-sm flex-shrink-0 chat-safe-bottom">
                    <Lock size={14} className="flex-shrink-0 mt-0.5" />
                    This ticket has been closed. Start a new conversation if you need further help.
                  </div>
                ) : (
                  <div className="flex-shrink-0 border-t lg:border-t-0 border-border bg-card lg:bg-transparent px-3 pt-2 lg:p-0 chat-safe-bottom">
                    {/* Image preview strip */}
                    {pendingImagePreview && (
                      <div className="flex items-center gap-2 mb-2 bg-background border border-border rounded-xl p-2">
                        <img src={pendingImagePreview} alt="Preview" className="h-14 w-14 object-cover rounded-lg" />
                        <span className="text-xs text-muted-foreground flex-1 truncate">{pendingImage?.name}</span>
                        <button
                          onClick={clearPendingImage}
                          className="h-9 w-9 flex items-center justify-center hover:bg-muted rounded-lg transition-colors"
                          aria-label="Remove image"
                        >
                          <X size={16} className="text-muted-foreground" />
                        </button>
                      </div>
                    )}
                    {/* Hidden file input */}
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
                    <div className="flex items-end gap-2">
                      {/* Upload button */}
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading || sending}
                        className={`h-11 w-11 flex-shrink-0 bg-background border border-border hover:text-foreground hover:bg-muted rounded-xl transition-colors flex items-center justify-center disabled:opacity-50 ${pendingImage ? 'text-primary border-primary/30' : 'text-muted-foreground'}`}
                        aria-label="Attach image"
                      >
                        <Paperclip size={18} />
                      </button>
                      <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={selectedConversation.status === 'resolved' ? 'Reply to reopen this ticket...' : 'Type your message...'}
                        rows={1}
                        /* text-base keeps iOS Safari from zooming in on focus */
                        className="flex-1 min-h-[44px] max-h-32 bg-background border border-border rounded-xl px-3 py-3 text-base sm:text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary transition-colors resize-none"
                      />
                      <button
                        onClick={handleSendMessage}
                        disabled={(!message.trim() && !pendingImage) || sending || uploading}
                        className="h-11 w-11 flex-shrink-0 bg-primary hover:opacity-90 disabled:bg-muted disabled:text-muted-foreground text-primary-foreground rounded-xl transition-opacity flex items-center justify-center"
                        aria-label="Send message"
                      >
                        {sending || uploading ? <RefreshCw size={18} className="animate-spin" /> : <Send size={18} />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="bg-card rounded-xl border border-border flex items-center justify-center flex-1 py-10 shadow-sm">
              <div className="text-center">
                <MessageSquare size={32} className="text-muted-foreground/60 mx-auto mb-2" />
                <p className="text-muted-foreground mb-1">Select a conversation to view details</p>
                <p className="text-muted-foreground/70 text-xs">or create a new one to get started</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New Conversation Modal */}
      <Dialog open={showNewConversationForm} onOpenChange={setShowNewConversationForm}>
        <DialogContent className="max-w-md" hideCloseButton>
            <h2 className="text-lg font-bold text-foreground mb-1">Start New Conversation</h2>
            <p className="text-xs text-muted-foreground mb-5">Describe your issue and our support team will respond shortly.</p>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-2">Subject</label>
                <input
                  type="text"
                  value={newConversationData.subject}
                  onChange={(e) => setNewConversationData({ ...newConversationData, subject: e.target.value })}
                  placeholder="Brief description of your issue..."
                  className="w-full bg-background border border-border rounded-xl px-3 py-3 text-base sm:text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary transition-colors"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-2">Priority</label>
                <select
                  value={newConversationData.priority}
                  onChange={(e) => setNewConversationData({ ...newConversationData, priority: e.target.value as any })}
                  className="w-full bg-background border border-border rounded-xl px-3 py-3 text-base sm:text-sm text-foreground focus:outline-none focus:border-primary transition-colors appearance-none cursor-pointer"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 0.75rem center',
                    backgroundSize: '1rem',
                    paddingRight: '2.5rem'
                  }}
                >
                  <option value="low" className="bg-card text-foreground">Low</option>
                  <option value="medium" className="bg-card text-foreground">Medium</option>
                  <option value="high" className="bg-card text-foreground">High</option>
                  <option value="urgent" className="bg-card text-foreground">Urgent</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-2">Message</label>
                <textarea
                  value={newConversationData.message}
                  onChange={(e) => setNewConversationData({ ...newConversationData, message: e.target.value })}
                  placeholder="Provide details about your issue..."
                  rows={5}
                  className="w-full bg-background border border-border rounded-xl px-3 py-3 text-base sm:text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary transition-colors resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowNewConversationForm(false)}
                className="flex-1 bg-muted hover:bg-muted/70 border border-border text-foreground font-medium min-h-[46px] rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateConversation}
                disabled={!newConversationData.subject || !newConversationData.message || sending}
                className="flex-1 bg-primary hover:opacity-90 disabled:bg-muted disabled:text-muted-foreground text-primary-foreground font-medium min-h-[46px] rounded-xl transition-opacity"
              >
                {sending ? 'Creating...' : 'Submit Ticket'}
              </button>
            </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
