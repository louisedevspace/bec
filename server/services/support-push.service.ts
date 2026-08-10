import { supabaseAdmin } from "../routes/middleware";
import {
  isPushConfigured,
  sendPushToSubscription,
  cleanupExpiredSubscriptions,
} from "../routes/push.routes";

/**
 * OS-level push notifications for support chat.
 *
 * A user gets one when staff reply to their ticket; every admin and support
 * agent gets one when a user writes in. Everything here is best-effort — a
 * failed push must never break sending the message itself.
 */

const STAFF_ROLES = ["admin", "support"];
const MAX_BODY_LENGTH = 120;

/** Trim a chat message down to something that reads well in a notification. */
function previewMessage(message: string, messageType?: string): string {
  if (messageType === "image") return "📷 Sent an image";
  const text = (message || "").replace(/\s+/g, " ").trim();
  if (!text || text === "(Image)") return "📷 Sent an image";
  return text.length > MAX_BODY_LENGTH ? `${text.slice(0, MAX_BODY_LENGTH - 1)}…` : text;
}

/** Deliver one payload to every device registered for the given users. */
async function pushToUsers(userIds: string[], payload: Record<string, unknown>) {
  if (!isPushConfigured() || userIds.length === 0) return;

  const { data: subscriptions, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint, keys")
    .in("user_id", userIds);

  if (error || !subscriptions?.length) return;

  const body = JSON.stringify(payload);
  const expired: string[] = [];

  await Promise.all(
    subscriptions.map(async (sub: any) => {
      const result = await sendPushToSubscription({ endpoint: sub.endpoint, keys: sub.keys }, body);
      if (!result.success && result.expired) expired.push(sub.endpoint);
    })
  );

  await cleanupExpiredSubscriptions(expired);
}

/** Every active admin and support agent, minus the person who just wrote. */
async function getStaffRecipients(excludeUserId?: string): Promise<string[]> {
  const { data: staff, error } = await supabaseAdmin
    .from("users")
    .select("id")
    .in("role", STAFF_ROLES)
    .eq("is_active", true);

  if (error || !staff) return [];
  return staff.map((s: any) => s.id).filter((id: string) => id !== excludeUserId);
}

/**
 * Staff replied — notify the ticket owner.
 */
export async function notifyUserOfSupportReply(params: {
  userId: string;
  conversationId: number | string;
  subject?: string;
  message: string;
  messageType?: string;
}) {
  try {
    await pushToUsers([params.userId], {
      title: "Support replied",
      body: previewMessage(params.message, params.messageType),
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: `support-${params.conversationId}`,
      data: {
        url: "/support",
        conversationId: params.conversationId,
      },
    });
  } catch (error) {
    console.error("[SupportPush] Failed to notify user:", (error as Error).message);
  }
}

/**
 * A user wrote in — notify admins and support agents.
 */
export async function notifyStaffOfSupportMessage(params: {
  senderId: string;
  conversationId: number | string;
  subject?: string;
  message: string;
  messageType?: string;
  senderLabel?: string;
  isNewTicket?: boolean;
}) {
  try {
    const recipients = await getStaffRecipients(params.senderId);
    if (recipients.length === 0) return;

    const who = params.senderLabel || "A customer";
    await pushToUsers(recipients, {
      title: params.isNewTicket
        ? `New ticket: ${params.subject || "Support request"}`
        : `${who} replied`,
      body: previewMessage(params.message, params.messageType),
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: `support-staff-${params.conversationId}`,
      data: {
        url: "/admin/support",
        conversationId: params.conversationId,
      },
    });
  } catch (error) {
    console.error("[SupportPush] Failed to notify staff:", (error as Error).message);
  }
}
