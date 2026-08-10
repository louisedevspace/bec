export interface SupportConversation {
  id: number;
  user_id: string;
  subject: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  is_active: boolean;
  last_message_at: string;
  created_at: string;
  updated_at: string;
  support_messages?: SupportMessage[];
  users?: {
    id: string;
    email: string;
    full_name: string;
  };
}

export interface SupportMessage {
  id: number;
  conversation_id: number;
  sender_id: string;
  sender_type: 'user' | 'admin';
  message: string;
  message_type: 'text' | 'image' | 'file';
  attachment_url?: string;
  is_read: boolean;
  read_at?: string;
  created_at: string;
}

export interface SupportConversationWithMessages extends SupportConversation {
  support_messages: SupportMessage[];
  unreadCount: number;
}

export interface SendSupportMessageData {
  conversationId: number;
  /** @deprecated Use conversationId */
  ticketId?: number;
  message: string;
  messageType?: 'text' | 'image' | 'file';
  attachmentUrl?: string;
}

/** Conversation with user info (admin view) */
export type SupportTicketWithUser = SupportConversationWithMessages & {
  users?: { id: string; email: string; full_name: string } | null;
};

/** Conversation with messages (user view) */
export type SupportTicketWithMessages = SupportConversationWithMessages;

/** Payload to create a new support conversation/ticket */
export interface CreateSupportTicketData {
  subject: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  message?: string;
  category?: string;
}

export interface SupportStats {
  totalConversations: number;
  activeConversations: number;
  unreadMessages: number;
}
