import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { MessageSquare, Send, Clock, CheckCircle, AlertCircle, XCircle, ArrowLeft, Search, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';


interface SupportConversation {
  id: string;
  user_id: string;
  subject: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  created_at: string;
  updated_at: string;
  support_messages: SupportMessage[];
}

interface SupportMessage {
  id: string;
  conversation_id: string;
  message: string;
  sender_type: 'user' | 'admin';
  created_at: string;
}

export default function SupportPage() {
  const [, setLocation] = useLocation();
  const [conversations, setConversations] = useState<SupportConversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<SupportConversation | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showNewConversationForm, setShowNewConversationForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [newConversationData, setNewConversationData] = useState({
    subject: '',
    priority: 'medium' as const,
    message: '',
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedConversation?.support_messages]);

  // Fetch support conversations
  useEffect(() => {
    const fetchConversations = async () => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not logged in');

        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        const response = await fetch(`/api/support/conversation`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          setConversations(Array.isArray(data) ? data : data ? [data] : []);
        } else if (response.status === 404) {
          // Expected: user has no conversations yet
          setConversations([]);
        }
      } catch (error) {
        console.error('Error fetching support conversations:', error);
        setConversations([]);
      } finally {
        setLoading(false);
      }
    };

    fetchConversations();
  }, []);

  const handleSendMessage = async () => {
    if (!message.trim() || !selectedConversation) return;

    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch(`/api/support/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId: selectedConversation.id,
          message,
        }),
      });

      if (response.ok) {
        const newMessage = await response.json();
        setSelectedConversation({
          ...selectedConversation,
          support_messages: [...selectedConversation.support_messages, newMessage],
        });
        setMessage('');
      }
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setSending(false);
    }
  };

  const handleCreateConversation = async () => {
    if (!newConversationData.subject || !newConversationData.message) return;

    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const requestBody = {
        subject: newConversationData.subject,
        priority: newConversationData.priority,
        message: newConversationData.message,
      };

      const response = await fetch(`/api/support/conversation`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const createdConversation = await response.json();
        setConversations([createdConversation, ...conversations]);
        setSelectedConversation(createdConversation);
        setShowNewConversationForm(false);
        setNewConversationData({
          subject: '',
          priority: 'medium',
          message: '',
        });
      } else {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        console.error('Failed to create conversation:', errorData);
        alert(`Failed to create conversation: ${errorData.message || 'Please try again'}`);
      }
    } catch (error) {
      console.error('Error creating support conversation:', error);
      alert('Error creating conversation. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const filteredConversations = conversations.filter(conv => {
    const matchesSearch = typeof conv.subject === 'string' && conv.subject.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || conv.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'text-blue-400';
      case 'in_progress':
        return 'text-yellow-400';
      case 'resolved':
        return 'text-green-400';
      case 'closed':
        return 'text-gray-500';
      default:
        return 'text-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open':
        return <MessageSquare size={14} />;
      case 'in_progress':
        return <Clock size={14} />;
      case 'resolved':
        return <CheckCircle size={14} />;
      case 'closed':
        return <XCircle size={14} />;
      default:
        return <AlertCircle size={14} />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'low':
        return 'bg-green-500/10 text-green-400 border-green-500/20';
      case 'medium':
        return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
      case 'high':
        return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
      case 'urgent':
        return 'bg-red-500/10 text-red-400 border-red-500/20';
      default:
        return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
    }
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
            <div>
              <h1 className="text-xl font-bold text-white">Customer Support</h1>
              <p className="text-xs text-gray-500">Get help with your account and issues</p>
            </div>
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
      <div className="flex-1 max-w-7xl w-full mx-auto grid grid-cols-1 lg:grid-cols-3 gap-4 p-4">
        {/* Left: Conversations List */}
        <div className="lg:col-span-1 flex flex-col">
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
              <div className="overflow-y-auto max-h-[calc(100vh-300px)]">
                {filteredConversations.map((conv) => (
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
                        <h3 className="text-sm font-medium text-white truncate">{conv.subject}</h3>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(conv.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 ml-7">
                      <span className={`text-xs px-2 py-1 rounded border ${getPriorityColor(conv.priority)}`}>
                        {conv.priority}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Conversation Details */}
        <div className="lg:col-span-2 flex flex-col">
          {selectedConversation ? (
            <>
              {/* Conversation Header */}
              <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-4 mb-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h2 className="text-lg font-bold text-white">{selectedConversation.subject}</h2>
                    <p className="text-sm text-gray-500 mt-1">ID: {selectedConversation.id}</p>
                  </div>
                  <div className={`flex items-center gap-2 ${getStatusColor(selectedConversation.status)}`}>
                    {getStatusIcon(selectedConversation.status)}
                    <span className="text-sm font-medium capitalize">{selectedConversation.status.replace('_', ' ')}</span>
                  </div>
                </div>
                <div className="flex gap-3 flex-wrap">
                  <span className={`text-xs px-3 py-1.5 rounded border ${getPriorityColor(selectedConversation.priority)}`}>
                    Priority: {selectedConversation.priority}
                  </span>
                  <span className="text-xs bg-[#1a1a1a] text-gray-400 px-3 py-1.5 rounded border border-[#2a2a2a]">
                    Updated: {new Date(selectedConversation.updated_at).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {/* Messages Area */}
              <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-4 flex-1 flex flex-col overflow-hidden">
                {/* Messages */}
                <div className="flex-1 overflow-y-auto mb-4 space-y-3">
                  {selectedConversation.support_messages && selectedConversation.support_messages.length > 0 ? (
                    selectedConversation.support_messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.sender_type === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-xs px-4 py-3 rounded-lg ${
                            msg.sender_type === 'user'
                              ? 'bg-blue-500/20 border border-blue-500/30 text-blue-100'
                              : 'bg-[#1a1a1a] border border-[#2a2a2a] text-gray-300'
                          }`}
                        >
                          <p className="text-sm">{msg.message}</p>
                          <p className="text-xs opacity-70 mt-1">
                            {new Date(msg.created_at).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center text-gray-500 text-sm py-8">No messages yet</div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Message Input */}
                {selectedConversation.status !== 'closed' && (
                  <div className="flex gap-2">
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Type your message..."
                      rows={3}
                      className="flex-1 bg-[#0a0a0a] border border-[#1e1e1e] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors resize-none"
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={!message.trim() || sending}
                      className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center justify-center"
                    >
                      <Send size={16} />
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] flex items-center justify-center flex-1">
              <div className="text-center">
                <MessageSquare size={32} className="text-gray-600 mx-auto mb-2" />
                <p className="text-gray-500">Select a conversation to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New Conversation Modal */}
      {showNewConversationForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-white mb-4">Start New Support Conversation</h2>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-400 block mb-2">Subject</label>
                <input
                  type="text"
                  value={newConversationData.subject}
                  onChange={(e) => setNewConversationData({ ...newConversationData, subject: e.target.value })}
                  placeholder="Brief description of your issue..."
                  className="w-full bg-[#0a0a0a] border border-[#1e1e1e] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-400 block mb-2">Priority</label>
                <select
                  value={newConversationData.priority}
                  onChange={(e) => setNewConversationData({ ...newConversationData, priority: e.target.value as any })}
                  className="w-full bg-[#0a0a0a] border border-[#1e1e1e] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors appearance-none cursor-pointer"
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
                  className="w-full bg-[#0a0a0a] border border-[#1e1e1e] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowNewConversationForm(false)}
                className="flex-1 bg-[#1a1a1a] hover:bg-[#222] border border-[#2a2a2a] text-white font-medium py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateConversation}
                disabled={!newConversationData.subject || !newConversationData.message || sending}
                className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 text-white font-medium py-2 rounded-lg transition-colors"
              >
                {sending ? 'Creating...' : 'Start Conversation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

