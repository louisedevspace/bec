import { useState, useEffect, useRef, useCallback } from 'react';
import { formatDate, formatTime } from '@/lib/date-utils';
import { useLocation } from 'wouter';
import { MessageSquare, Send, Clock, CheckCircle, AlertCircle, XCircle, ArrowLeft, Search, Plus, RefreshCw, ThumbsUp, RotateCcw, Shield, Lock, Info, Paperclip, X } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { LinkPreview, extractUrls } from '@/components/ui/link-preview';
import { compressUserImage } from '@/lib/image-compress';
import { getImageDisplayUrl, openImageViewer } from '@/lib/image';
import { buildApiUrl } from '@/lib/config';


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
  const selectedIdRef = useRef<number | null>(null);

  // Keep selectedIdRef in sync
  useEffect(() => {
    selectedIdRef.current = selectedConversation?.id ?? null;
  }, [selectedConversation?.id]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedConversation?.support_messages?.length]);

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

  // Initial fetch + polling every 8 seconds
  useEffect(() => {
    fetchConversations();
    const interval = setInterval(() => fetchConversations(true), 8000);
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

  // Handle Enter key to send
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
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
      case 'open': return 'text-blue-400';
      case 'in_progress': return 'text-yellow-400';
      case 'resolved': return 'text-green-400';
      case 'closed': return 'text-gray-500';
      default: return 'text-gray-400';
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
      case 'low': return 'bg-green-500/10 text-green-400 border-green-500/20';
      case 'medium': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
      case 'high': return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
      case 'urgent': return 'bg-red-500/10 text-red-400 border-red-500/20';
      default: return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
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
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-full px-4 py-1.5 flex items-center gap-2">
            <Info size={12} className="text-gray-500 flex-shrink-0" />
            <span className="text-xs text-gray-500">{msg.message}</span>
            <span className="text-[10px] text-gray-600 ml-1">
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
          <div className="w-7 h-7 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center mr-2 mt-1 flex-shrink-0">
            <Shield size={12} className="text-blue-400" />
          </div>
        )}
        <div className={`max-w-[70%] px-4 py-3 rounded-2xl ${
          isUser
            ? 'bg-blue-600 text-white rounded-br-md'
            : 'bg-[#1a1a1a] border border-[#2a2a2a] text-gray-300 rounded-bl-md'
        }`}>
          {!isUser && (
            <p className="text-[10px] text-blue-400 font-medium mb-1">Support Agent</p>
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
          {/* Text content (skip placeholder for image-only) */}
          {msg.message && msg.message !== '(Image)' && (
            <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
          )}
          {/* Link preview for first URL in message */}
          {firstUrl && (
            <div className="mt-2">
              <LinkPreview url={firstUrl} className="!bg-[#0a0a0a] !border-[#2a2a2a]" />
            </div>
          )}
          <p className="text-[10px] opacity-60 mt-1.5">
            {formatTime(msg.created_at)}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0a]">
      {/* Header */}
      <div className="bg-[#0a0a0a] border-b border-[#1e1e1e] sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => setLocation('/profile')}
              className="p-2 hover:bg-[#111] rounded-lg transition-colors"
            >
              <ArrowLeft size={20} className="text-gray-400" />
            </button>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-white">Customer Support</h1>
              <p className="text-xs text-gray-500">Get help with your account and issues</p>
            </div>
            <button
              onClick={() => fetchConversations(true)}
              className="p-2 hover:bg-[#111] rounded-lg transition-colors"
              title="Refresh"
            >
              <RefreshCw size={16} className="text-gray-400" />
            </button>
          </div>

          {/* Search and Filter */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#111] border border-[#1e1e1e] rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-[#111] border border-[#1e1e1e] rounded-lg px-3 py-2 text-sm text-gray-400 focus:outline-none focus:border-blue-500 transition-colors"
            >
              <option value="all">All Status</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 w-full mx-auto grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 max-w-7xl">
        {/* Left: Conversations List */}
        <div className={`lg:col-span-1 flex flex-col ${selectedConversation ? "hidden lg:flex" : "flex"}`}>
          <button
            onClick={() => setShowNewConversationForm(true)}
            className="flex-shrink-0 w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2 mb-4"
          >
            <Plus size={16} />
            New Conversation
          </button>

          {/* Conversations List */}
          <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] overflow-hidden flex flex-col flex-1">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-gray-500">Loading conversations...</div>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
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
                      className={`w-full p-4 text-left border-b border-[#1e1e1e] hover:bg-[#1a1a1a] transition-colors ${
                        selectedConversation?.id === conv.id ? 'bg-[#1a1a1a]' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3 mb-2">
                        <div className={getStatusColor(conv.status)}>
                          {getStatusIcon(conv.status)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-medium text-white truncate flex-1">{conv.subject}</h3>
                            {unread > 0 && (
                              <span className="bg-blue-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">
                                {unread}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
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
                          <span className="text-xs px-2 py-0.5 rounded bg-[#1a1a1a] text-gray-400 border border-[#2a2a2a]">
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

        {/* Right: Conversation Details */}
        <div className={`lg:col-span-2 flex flex-col ${selectedConversation ? "flex" : "hidden lg:flex"}`}>
          {selectedConversation ? (
            <>
              {/* Back button for mobile */}
              <button
                onClick={() => setSelectedConversation(null)}
                className="lg:hidden mb-3 flex items-center gap-1 text-blue-400 hover:text-blue-300 text-sm"
              >
                <ArrowLeft size={16} /> Back
              </button>

              {/* Conversation Header */}
              <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-4 mb-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0 mr-3">
                    <h2 className="text-lg font-bold text-white truncate">{selectedConversation.subject}</h2>
                    <p className="text-xs text-gray-500 mt-1">Ticket #{selectedConversation.id}</p>
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
                    <span className="text-xs px-3 py-1 rounded bg-[#1a1a1a] text-gray-400 border border-[#2a2a2a]">
                      {getCategoryLabel(selectedConversation.category)}
                    </span>
                  )}
                  <span className="text-xs bg-[#1a1a1a] text-gray-500 px-3 py-1 rounded border border-[#2a2a2a]">
                    {formatDate(selectedConversation.created_at)}
                  </span>
                </div>

                {/* Resolution action bar */}
                {selectedConversation.status === 'resolved' && (
                  <div className="mt-4 bg-green-500/5 border border-green-500/20 rounded-xl p-3">
                    <p className="text-sm text-green-400 mb-3 flex items-center gap-2">
                      <CheckCircle size={14} />
                      This ticket has been marked as resolved by support.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleConfirmResolution}
                        disabled={actionLoading}
                        className="flex-1 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 text-green-400 text-sm font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                        <ThumbsUp size={14} />
                        {actionLoading ? 'Processing...' : 'Confirm & Close'}
                      </button>
                      <button
                        onClick={handleReopen}
                        disabled={actionLoading}
                        className="flex-1 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/20 text-yellow-400 text-sm font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                        <RotateCcw size={14} />
                        {actionLoading ? 'Processing...' : 'Reopen Ticket'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Messages Area */}
              <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-4 flex-1 flex flex-col overflow-hidden mb-4">
                <div className="flex-1 overflow-y-auto mb-4 space-y-3 pr-2">
                  {selectedConversation.support_messages && selectedConversation.support_messages.length > 0 ? (
                    selectedConversation.support_messages.map(renderMessage)
                  ) : (
                    <div className="text-center text-gray-500 text-sm py-8">No messages yet</div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Message Input or Closed Notice */}
                {selectedConversation.status === 'closed' ? (
                  <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-3 flex items-center gap-2 text-gray-500 text-sm">
                    <Lock size={14} className="flex-shrink-0" />
                    This ticket has been closed. Start a new conversation if you need further help.
                  </div>
                ) : (
                  <div>
                    {/* Image preview strip */}
                    {pendingImagePreview && (
                      <div className="flex items-center gap-2 mb-2 bg-[#0a0a0a] border border-[#1e1e1e] rounded-xl p-2">
                        <img src={pendingImagePreview} alt="Preview" className="h-16 w-16 object-cover rounded-lg" />
                        <span className="text-xs text-gray-400 flex-1 truncate">{pendingImage?.name}</span>
                        <button onClick={clearPendingImage} className="p-1 hover:bg-[#1a1a1a] rounded-lg transition-colors">
                          <X size={14} className="text-gray-500" />
                        </button>
                      </div>
                    )}
                    {/* Hidden file input */}
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
                    <div className="flex gap-2">
                      {/* Upload button */}
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading || sending}
                        className={`bg-[#0a0a0a] border border-[#1e1e1e] hover:text-white hover:bg-[#1a1a1a] px-3 rounded-xl transition-colors flex items-center justify-center disabled:opacity-50 ${pendingImage ? 'text-blue-400 border-blue-500/30' : 'text-gray-400'}`}
                        title="Attach image"
                      >
                        <Paperclip size={16} />
                      </button>
                      <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={selectedConversation.status === 'resolved' ? 'Reply to reopen this ticket...' : 'Type your message...'}
                        rows={2}
                        className="flex-1 bg-[#0a0a0a] border border-[#1e1e1e] rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors resize-none"
                      />
                      <button
                        onClick={handleSendMessage}
                        disabled={(!message.trim() && !pendingImage) || sending || uploading}
                        className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-700 disabled:text-gray-500 text-white px-4 py-2 rounded-xl transition-colors flex items-center justify-center"
                      >
                        {sending || uploading ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] flex items-center justify-center flex-1">
              <div className="text-center">
                <MessageSquare size={32} className="text-gray-600 mx-auto mb-2" />
                <p className="text-gray-500 mb-1">Select a conversation to view details</p>
                <p className="text-gray-600 text-xs">or create a new one to get started</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New Conversation Modal */}
      {showNewConversationForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowNewConversationForm(false)}>
          <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-1">Start New Conversation</h2>
            <p className="text-xs text-gray-500 mb-5">Describe your issue and our support team will respond shortly.</p>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-400 block mb-2">Subject</label>
                <input
                  type="text"
                  value={newConversationData.subject}
                  onChange={(e) => setNewConversationData({ ...newConversationData, subject: e.target.value })}
                  placeholder="Brief description of your issue..."
                  className="w-full bg-[#0a0a0a] border border-[#1e1e1e] rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-400 block mb-2">Priority</label>
                <select
                  value={newConversationData.priority}
                  onChange={(e) => setNewConversationData({ ...newConversationData, priority: e.target.value as any })}
                  className="w-full bg-[#0a0a0a] border border-[#1e1e1e] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors appearance-none cursor-pointer"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 0.75rem center',
                    backgroundSize: '1rem',
                    paddingRight: '2.5rem'
                  }}
                >
                  <option value="low" className="bg-[#111] text-white">Low</option>
                  <option value="medium" className="bg-[#111] text-white">Medium</option>
                  <option value="high" className="bg-[#111] text-white">High</option>
                  <option value="urgent" className="bg-[#111] text-white">Urgent</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-400 block mb-2">Message</label>
                <textarea
                  value={newConversationData.message}
                  onChange={(e) => setNewConversationData({ ...newConversationData, message: e.target.value })}
                  placeholder="Provide details about your issue..."
                  rows={5}
                  className="w-full bg-[#0a0a0a] border border-[#1e1e1e] rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowNewConversationForm(false)}
                className="flex-1 bg-[#1a1a1a] hover:bg-[#222] border border-[#2a2a2a] text-white font-medium py-2.5 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateConversation}
                disabled={!newConversationData.subject || !newConversationData.message || sending}
                className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-700 disabled:text-gray-400 text-white font-medium py-2.5 rounded-xl transition-colors"
              >
                {sending ? 'Creating...' : 'Submit Ticket'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

