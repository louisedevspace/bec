import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MessageSquare, Send, Clock, CheckCircle, AlertCircle, XCircle, User, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useUserDataSync } from "@/hooks/use-data-sync";
import { supabase } from "@/lib/supabaseClient";
import type { SupportTicketWithMessages, SupportMessage, SendSupportMessageData } from "@/types/support";

interface SupportChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticket: SupportTicketWithMessages | null;
  userId: string | null;
}

export function SupportChatModal({ isOpen, onClose, ticket, userId }: SupportChatModalProps) {
  const [message, setMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Use data sync for real-time updates
  useUserDataSync(userId || '', {
    enabled: !!userId && isOpen
  });

  // Fetch ticket messages
  const { data: ticketData, refetch } = useQuery({
    queryKey: ["/api/support/tickets", userId, ticket?.id],
    queryFn: async () => {
      if (!userId || !ticket) return null;
      
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      if (!token) throw new Error('No authentication token');

      const response = await fetch(`/api/support/tickets/${userId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch ticket data');
      }

      const tickets = await response.json();
      return tickets.find((t: SupportTicketWithMessages) => t.id === ticket.id);
    },
    enabled: !!userId && !!ticket && isOpen,
    refetchInterval: 5000, // Refresh every 5 seconds for real-time updates
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (messageData: SendSupportMessageData) => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      if (!token) throw new Error('No authentication token');

      const response = await fetch('/api/support/messages', {
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
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets"] });
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

  // Mark messages as read
  const markAsReadMutation = useMutation({
    mutationFn: async (messageId: number) => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      if (!token) throw new Error('No authentication token');

      const response = await fetch(`/api/support/messages/${messageId}/read`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to mark message as read');
      }

      return response.json();
    },
    onSuccess: () => {
      refetch();
    },
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ticketData?.support_messages]);

  // Mark admin messages as read when chat opens
  useEffect(() => {
    if (ticketData?.support_messages && isOpen) {
      const unreadAdminMessages = ticketData.support_messages.filter(
        (msg: SupportMessage) => !msg.is_read && msg.sender_type === 'admin'
      );
      
      unreadAdminMessages.forEach((msg: SupportMessage) => {
        markAsReadMutation.mutate(msg.id);
      });
    }
  }, [ticketData, isOpen]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!message.trim() || !ticket || sendMessageMutation.isPending) return;

    sendMessageMutation.mutate({
      conversationId: ticket.id,
      ticketId: ticket.id,
      message: message.trim(),
      messageType: 'text'
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open':
        return <Clock className="h-4 w-4 text-blue-500" />;
      case 'in_progress':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'resolved':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'closed':
        return <XCircle className="h-4 w-4 text-gray-500" />;
      default:
        return <Clock className="h-4 w-4 text-blue-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-blue-100 text-blue-800';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'resolved':
        return 'bg-green-100 text-green-800';
      case 'closed':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
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

  if (!ticket) return null;

  const currentTicket = ticketData || ticket;
  const messages = currentTicket.support_messages || [];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                {currentTicket.subject}
              </DialogTitle>
              <div className="flex items-center gap-2 mt-2">
                <Badge className={getStatusColor(currentTicket.status)}>
                  {getStatusIcon(currentTicket.status)}
                  <span className="ml-1 capitalize">{currentTicket.status.replace('_', ' ')}</span>
                </Badge>
                <Badge variant="outline">
                  {currentTicket.category}
                </Badge>
                <Badge variant="outline">
                  {currentTicket.priority} priority
                </Badge>
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              Ticket #{currentTicket.id}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 flex flex-col min-h-0">
          {/* Messages */}
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-4">
              {messages.length > 0 ? (
                messages.map((msg: SupportMessage) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.sender_type === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`flex items-start gap-3 max-w-[80%] ${msg.sender_type === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className={msg.sender_type === 'admin' ? 'bg-blue-500 text-white' : 'bg-gray-500 text-white'}>
                          {msg.sender_type === 'admin' ? (
                            <Shield className="h-4 w-4" />
                          ) : (
                            <User className="h-4 w-4" />
                          )}
                        </AvatarFallback>
                      </Avatar>
                      
                      <div className={`space-y-1 ${msg.sender_type === 'user' ? 'text-right' : 'text-left'}`}>
                        <Card className={`${msg.sender_type === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                          <CardContent className="p-3">
                            <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                          </CardContent>
                        </Card>
                        
                        <div className={`flex items-center gap-2 text-xs text-muted-foreground ${msg.sender_type === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <span>{formatMessageTime(msg.created_at)}</span>
                          {msg.sender_type === 'admin' && (
                            <span className="flex items-center gap-1">
                              <Shield className="h-3 w-3" />
                              Admin
                            </span>
                          )}
                          {msg.sender_type === 'user' && !msg.is_read && (
                            <span className="text-blue-500">• Unread</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No messages yet. Start the conversation!</p>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Message Input */}
          {currentTicket.status !== 'closed' && (
            <form onSubmit={handleSendMessage} className="mt-4 pt-4 border-t">
              <div className="flex gap-2">
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Type your message..."
                  rows={2}
                  className="flex-1 resize-none"
                  disabled={sendMessageMutation.isPending}
                />
                <Button
                  type="submit"
                  disabled={!message.trim() || sendMessageMutation.isPending}
                  className="self-end"
                >
                  {sendMessageMutation.isPending ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </form>
          )}

          {currentTicket.status === 'closed' && (
            <div className="mt-4 pt-4 border-t text-center text-muted-foreground">
              <p>This ticket has been closed. You can create a new ticket if you need further assistance.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
