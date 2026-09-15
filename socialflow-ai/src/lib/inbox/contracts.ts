export const CONVERSATION_TYPES = { COMMENT: 'Yorum', DIRECT_MESSAGE: 'Direkt Mesaj', MENTION: 'Bahsetme', REVIEW: 'İnceleme', QUESTION: 'Soru', REPLY: 'Yanıt', OTHER: 'Diğer' } as const;
export const CONVERSATION_STATUSES = { NEW: 'Yeni', OPEN: 'Açık', WAITING_CUSTOMER: 'Müşteri Yanıtı Bekleniyor', WAITING_INTERNAL: 'İç Yanıt Bekleniyor', RESOLVED: 'Çözüldü', ARCHIVED: 'Arşivlendi', SPAM: 'Spam' } as const;
export const PRIORITIES = { LOW: 'Düşük', NORMAL: 'Normal', HIGH: 'Yüksek', URGENT: 'Acil' } as const;
export const INBOX_WRITERS = ['OWNER', 'ADMIN', 'EDITOR'];
export function canManageInbox(role: string) { return INBOX_WRITERS.includes(role); }
export class InboxError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}
export function inputText(value: unknown, name: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new InboxError('INVALID_INPUT', `${name} alanı zorunludur ve en fazla ${max} karakter olabilir.`);
  return value.trim();
}
export function enumInput<T extends Record<string, string>>(values: T, value: unknown): keyof T & string {
  if (typeof value !== 'string' || !Object.hasOwn(values, value)) throw new InboxError('INVALID_INPUT', 'Geçersiz seçim.');
  return value as keyof T & string;
}
export type InboxSummary = {
  id: string; provider: string; type: string; status: string; priority: string; assignedTo: string | null;
  version: number; lastMessageAt: string; source: string;
  brand: { id: string; name: string }; account: { id: string; handle: string; displayName: string };
  participant: { id: string; displayName: string }; tags: { name: string }[];
  messages: { text: string; direction: string }[]; _count: { messages: number };
};
export type InboxDetail = Omit<InboxSummary, 'messages'> & {
  messages: { id: string; text: string; direction: string; sender: string; sentAt: string; isRead: boolean }[];
  assignments: { id: string; assignedTo: string | null; createdAt: string; actor: { name: string } }[];
};
export type InboxOptions = {
  accounts: { id: string; brandId: string | null; platform: string; displayName: string; handle: string }[];
  brands: { id: string; name: string }[]; users: { id: string; name: string }[];
  userId: string; canManage: boolean;
};
