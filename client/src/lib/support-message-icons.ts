import { CheckCircle2, RotateCcw, ClipboardList, Bell, UserCheck, AlertTriangle, Info, Bot, type LucideIcon } from "lucide-react";

export interface SystemMessageDisplay {
  Icon: LucideIcon;
  text: string;
  tone: "default" | "success" | "warning" | "danger";
}

const EMOJI_RANGES: Array<[number, number]> = [
  [0x1f000, 0x1ffff], // pictographs, emoji blocks
  [0x2600, 0x27bf],   // misc symbols / dingbats
  [0x2190, 0x21ff],   // arrows
  [0x2b00, 0x2bff],   // misc symbols and arrows
  [0xfe0f, 0xfe0f],   // variation selector-16
  [0x200d, 0x200d],   // zero-width joiner
];

function isEmojiCodePoint(cp: number): boolean {
  return EMOJI_RANGES.some(([start, end]) => cp >= start && cp <= end);
}

// Historical rows (created before this file existed) still carry a leading
// emoji baked into the stored text — strip it so old and new messages render
// identically. Uses Array.from (not a regex) so surrogate-pair emoji are
// handled correctly without relying on the regex `u` flag (this project's
// tsconfig has no `target` set, which defaults to an ES3 target that
// rejects unicode-flag regex literals).
function stripLeadingEmoji(text: string): string {
  const chars = Array.from(text.trimStart());
  let i = 0;
  while (i < chars.length && isEmojiCodePoint(chars[i].codePointAt(0) || 0)) {
    i++;
  }
  return chars.slice(i).join("").trimStart();
}

export function getSystemMessageDisplay(rawText: string): SystemMessageDisplay {
  const text = stripLeadingEmoji(rawText);
  const lower = text.toLowerCase();

  if (lower.includes("resolved")) return { Icon: CheckCircle2, text, tone: "success" };
  if (lower.includes("reopened")) return { Icon: RotateCcw, text, tone: "warning" };
  if (lower.includes("escalated")) return { Icon: AlertTriangle, text, tone: "danger" };
  if (lower.includes("priority changed")) return { Icon: Bell, text, tone: "warning" };
  if (lower.includes("status changed")) return { Icon: ClipboardList, text, tone: "default" };
  if (lower.includes("assigned")) return { Icon: UserCheck, text, tone: "default" };
  return { Icon: Info, text, tone: "default" };
}

const AUTO_REPLY_MARKER = "[Auto-Reply]";

export function isAutoReplyMessage(text: string): boolean {
  return text.includes(AUTO_REPLY_MARKER);
}

export function stripAutoReplyPrefix(text: string): string {
  const idx = text.indexOf(AUTO_REPLY_MARKER);
  if (idx === -1) return text;
  return text.slice(idx + AUTO_REPLY_MARKER.length).trimStart();
}

export const AutoReplyIcon: LucideIcon = Bot;
