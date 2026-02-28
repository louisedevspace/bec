import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { MessageSquare, Send, User, Shield, Search, MessageCircle, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDataSync } from "@/hooks/use-data-sync";
import { supabase } from "@/lib/supabaseClient";
import AdminLayout from './admin-layout';
import type { SupportConversation, SupportMessage, SendSupportMessageData } from "@/types/support";

interface SupportConversationWithUser extends SupportConversation {
  support_messages: SupportMessage[];
  users: {
    id: string;
    email: string;
    full_name: string;
  };
  unreadCount: number;
}

export default function AdminSupportPage() {
  const [selectedConversation, setSelectedConversation] = useState<SupportConversationWithUser | null>(null);
  const [message, setMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isMarkingAsRead, setIsMarkingAsRead] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Use data sync for real-time updates
  const { invalidateQueries } = useDataSync();

  // Fetch support statistics
  const { data: stats } = useQuery({
    queryKey: ["/api/admin/support/stats"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      if (!token) throw new Error('No authentication token');

      const response = await fetch('/api/admin/support/stats', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch support statistics');
      }

      return response.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch all support conversations
  const { data: conversations, isLoading, refetch } = useQuery({
    queryKey: ["/api/admin/support/conversations"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      if (!token) throw new Error('No authentication token');

      const response = await fetch('/api/admin/support/conversations', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch support conversations');
      }

      const conversationsData = await response.json();
      
      // Calculate unread count for each conversation
      return conversationsData.map((conversation: SupportConversationWithUser) => ({
        ...conversation,
        unreadCount: conversation.support_messages?.filter(
          (msg: SupportMessage) => !msg.is_read && msg.sender_type === 'user'
        ).length || 0
      }));
    },
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (messageData: SendSupportMessageData) => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      if (!token) throw new Error('No authentication token');

      const response = await fetch('/api/admin/support/messages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messageData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to send message');
      }

      return response.json();
    },
    onSuccess: () => {
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support/stats"] });
      invalidateQueries('create-support-message');
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive",
      });
    },
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedConversation?.support_messages]);

  // Mark messages as read when conversation is selected
  useEffect(() => {
    if (selectedConversation) {
      markMessagesAsRead(selectedConversation.id);
    }
  }, [selectedConversation?.id]);

  // Function to mark all unread messages in a conversation as read
  const markMessagesAsRead = async (conversationId: number) => {
    try {
      setIsMarkingAsRead(true);
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      if (!token) return;

      // Get all unread messages from this conversation
      const unreadMessages = selectedConversation?.support_messages?.filter(
        msg => !msg.is_read && msg.sender_type === 'user'
      ) || [];

      if (unreadMessages.length === 0) {
        setIsMarkingAsRead(false);
        return;
      }

      // Mark each unread message as read
      for (const message of unreadMessages) {
        console.log(`Marking message ${message.id} as read...`);
        const response = await fetch(`/api/admin/support/messages/${message.id}/read`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        
        if (!response.ok) {
          console.error(`HTTP ${response.status}: ${response.statusText}`);
          let errorData;
          try {
            errorData = await response.json();
          } catch (parseError) {
            // If response is not JSON (like HTML error page), get text
            const errorText = await response.text();
            console.error(`Non-JSON response:`, errorText);
            throw new Error(`Server returned HTML error page. Status: ${response.status}`);
          }
          console.error(`Failed to mark message ${message.id} as read:`, errorData);
          throw new Error(`Failed to mark message ${message.id} as read: ${errorData.message}`);
        }
        
        const result = await response.json();
        console.log(`Message ${message.id} marked as read:`, result);
      }

      // Update the query cache directly to reflect the read status immediately
      queryClient.setQueryData(["/api/admin/support/conversations"], (oldData: any) => {
        if (!oldData) return oldData;
        
        return oldData.map((conv: any) => {
          if (conv.id === selectedConversation?.id) {
            const updatedMessages = conv.support_messages.map((msg: any) => {
              if (!msg.is_read && msg.sender_type === 'user') {
                return { ...msg, is_read: true, read_at: new Date().toISOString() };
              }
              return msg;
            });
            
            return {
              ...conv,
              support_messages: updatedMessages,
              unreadCount: 0
            };
          }
          return conv;
        });
      });

      // Update the local selected conversation state
      if (selectedConversation) {
        const updatedMessages = selectedConversation.support_messages.map(msg => {
          if (!msg.is_read && msg.sender_type === 'user') {
            return { ...msg, is_read: true, read_at: new Date().toISOString() };
          }
          return msg;
        });
        
        setSelectedConversation({
          ...selectedConversation,
          support_messages: updatedMessages,
          unreadCount: 0
        });
      }

      // Refresh the conversations list to update unread counts
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support/stats"] });
      refetch();

      // Success notification removed - functionality preserved (updated)
    } catch (error) {
      console.error('Error marking messages as read:', error);
      toast({
        title: "Error",
        description: "Failed to mark messages as read. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsMarkingAsRead(false);
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!message.trim() || !selectedConversation || sendMessageMutation.isPending) return;

    sendMessageMutation.mutate({
      conversationId: selectedConversation.id,
      message: message.trim(),
      messageType: 'text'
    });
  };

  const formatMessageTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString();
    }
  };

  // Filter conversations based on search
  const filteredConversations = conversations?.filter((conversation: SupportConversationWithUser) => {
    const matchesSearch = searchTerm === "" || 
      conversation.users.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      conversation.users.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      conversation.support_messages?.[0]?.message?.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesSearch;
  });

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-sm text-gray-500">Loading conversations...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white">Support</h1>
          <p className="text-sm text-gray-500 mt-1">Manage customer conversations and provide assistance</p>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-4 hover:border-[#2a2a2a] transition-all">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500">Total</p>
                  <p className="text-2xl font-bold text-white">{stats.totalConversations || 0}</p>
                </div>
                <div className="w-10 h-10 bg-[#1a1a1a] rounded-xl flex items-center justify-center">
                  <MessageSquare className="h-5 w-5 text-gray-400" />
                </div>
              </div>
            </div>
            <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-4 hover:border-[#2a2a2a] transition-all">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500">Active</p>
                  <p className="text-2xl font-bold text-blue-400">{stats.activeConversations || 0}</p>
                </div>
                <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
                  <MessageCircle className="h-5 w-5 text-blue-400" />
                </div>
              </div>
            </div>
            <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-4 hover:border-[#2a2a2a] transition-all">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500">Unread</p>
                  <p className="text-2xl font-bold text-red-400">{stats.unreadMessages || 0}</p>
                </div>
                <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center">
                  <MessageCircle className="h-5 w-5 text-red-400" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Chat Layout */}
        <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-3 h-[65vh]">
            {/* Conversations List */}
            <div className={`lg:border-r border-[#1e1e1e] flex flex-col ${selectedConversation ? 'hidden lg:flex' : 'flex'}`}>
              {/* Search */}
              <div className="p-3 border-b border-[#1e1e1e]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Input
                    placeholder="Search conversations..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 rounded-xl border-[#1e1e1e] bg-[#0a0a0a] text-sm h-9 text-white placeholder:text-gray-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Conversation List */}
              <ScrollArea className="flex-1">
                {filteredConversations && filteredConversations.length > 0 ? (
                  <div>
                    {filteredConversations.map((conversation: SupportConversationWithUser) => (
                      <div
                        key={conversation.id}
                        className={`p-3 border-b border-[#1e1e1e] cursor-pointer transition-colors ${
                          selectedConversation?.id === conversation.id 
                            ? 'bg-blue-500/10 border-l-2 border-l-blue-500' 
                            : 'hover:bg-[#1a1a1a]'
                        }`}
                        onClick={() => setSelectedConversation(conversation)}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 bg-gradient-to-br from-blue-500/20 to-indigo-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                            <User className="h-4 w-4 text-blue-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <h4 className="text-sm font-semibold text-white truncate">
                                {conversation.users.full_name || 'Unknown'}
                              </h4>
                              {conversation.unreadCount > 0 && (
                                <Badge className="bg-red-500 text-white text-[10px] px-1.5 py-0 h-4 rounded-full flex-shrink-0">
                                  {conversation.unreadCount}
                                </Badge>
                              )}
                            </div>
                            <p className="text-[11px] text-gray-500 truncate">{conversation.users.email}</p>
                            <p className="text-xs text-gray-400 mt-1 line-clamp-1">
                              {conversation.support_messages?.[conversation.support_messages.length - 1]?.message?.substring(0, 50) || 'No messages'}
                            </p>
                          </div>
                          <span className="text-[10px] text-gray-500 flex-shrink-0 mt-0.5">
                            {formatMessageTime(conversation.last_message_at)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center">
                    <MessageSquare className="h-10 w-10 mx-auto mb-3 text-gray-600" />
                    <p className="text-sm text-gray-500">No conversations</p>
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* Chat Area */}
            <div className={`lg:col-span-2 flex flex-col ${selectedConversation ? 'flex' : 'hidden lg:flex'}`}>
              {selectedConversation ? (
                <>
                  {/* Chat Header */}
                  <div className="p-4 border-b border-gray-100 flex items-center gap-3">
                    <button
                      onClick={() => setSelectedConversation(null)}
                      className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100"
                    >
                      <ArrowLeft size={18} className="text-gray-600" />
                    </button>
                    <div className="w-9 h-9 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-xl flex items-center justify-center">
                      <User className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm text-gray-900 truncate">
                        {selectedConversation.users.full_name || 'Unknown User'}
                        {isMarkingAsRead && (
                          <span className="ml-2 text-[10px] text-blue-500 font-normal">Marking read...</span>
                        )}
                      </h3>
                      <p className="text-[11px] text-gray-400 truncate">{selectedConversation.users.email}</p>
                    </div>
                    <span className="text-[10px] text-gray-400">#{selectedConversation.id}</span>
                  </div>

                  {/* Messages */}
                  <ScrollArea className="flex-1 px-4 py-3">
                    <div className="space-y-3">
                      {selectedConversation.support_messages?.length > 0 ? (
                        selectedConversation.support_messages.map((msg: SupportMessage) => (
                          <div
                            key={msg.id}
                            className={`flex ${msg.sender_type === 'admin' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div className={`flex items-end gap-2 max-w-[80%] ${msg.sender_type === 'admin' ? 'flex-row-reverse' : 'flex-row'}`}>
                              <Avatar className="h-7 w-7 flex-shrink-0">
                                <AvatarFallback className={`text-[10px] ${msg.sender_type === 'admin' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                                  {msg.sender_type === 'admin' ? <Shield className="h-3 w-3" /> : <User className="h-3 w-3" />}
                                </AvatarFallback>
                              </Avatar>
                              <div className={`space-y-0.5 ${msg.sender_type === 'admin' ? 'text-right' : 'text-left'}`}>
                                <div className={`px-3.5 py-2.5 rounded-2xl text-sm ${
                                  msg.sender_type === 'admin' 
                                    ? 'bg-blue-600 text-white rounded-br-md' 
                                    : 'bg-gray-100 text-gray-800 rounded-bl-md'
                                }`}>
                                  <p className="whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                                </div>
                                <div className={`flex items-center gap-1.5 text-[10px] text-gray-400 ${msg.sender_type === 'admin' ? 'justify-end' : 'justify-start'}`}>
                                  <span>{formatMessageTime(msg.created_at)}</span>
                                  {msg.sender_type === 'user' && !msg.is_read && (
                                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-12">
                          <MessageSquare className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                          <p className="text-sm text-gray-400">No messages yet</p>
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                  </ScrollArea>

                  {/* Message Input */}
                  <form onSubmit={handleSendMessage} className="p-3 border-t border-gray-100">
                    <div className="flex gap-2">
                      <Textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Type your response..."
                        rows={1}
                        className="flex-1 resize-none rounded-xl border-gray-200 text-sm min-h-[40px] max-h-24 text-gray-900 placeholder:text-gray-400"
                        disabled={sendMessageMutation.isPending}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            if (message.trim()) handleSendMessage(e);
                          }
                        }}
                      />
                      <Button
                        type="submit"
                        disabled={!message.trim() || sendMessageMutation.isPending}
                        className="rounded-xl bg-blue-600 hover:bg-blue-700 self-end h-10 w-10 p-0 flex-shrink-0"
                      >
                        {sendMessageMutation.isPending ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </form>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-gray-100 rounded-2xl mx-auto mb-4 flex items-center justify-center">
                      <MessageSquare className="h-8 w-8 text-gray-400" />
                    </div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-1">Select a Conversation</h3>
                    <p className="text-xs text-gray-400">Choose from the list to start chatting</p>
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