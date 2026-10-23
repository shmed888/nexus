import { z } from 'zod';
import { normalizeUsername } from './primitives.js';
export { normalizeUsername } from './primitives.js';

export const usernameSchema = z.string().trim().transform(normalizeUsername)
  .pipe(z.string().min(3, 'Минимум 3 символа').max(32, 'Максимум 32 символа')
    .regex(/^[a-z0-9._]+$/, 'Разрешены английские буквы, цифры, точка и подчёркивание')
    .refine((value) => /^[a-z0-9]/.test(value), 'Username должен начинаться с буквы или цифры'));

export const passwordSchema = z.string().min(8, 'Минимум 8 символов').max(128, 'Максимум 128 символов');
export const displayNameSchema = z.string().trim().min(1).max(60);
export const textMessageSchema = z.string().trim().min(1).max(4000);
export const cuidSchema = z.string().min(10).max(32).regex(/^[a-z0-9]+$/i);

export function safeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarPath ? `/api/users/avatars/${encodeURIComponent(user.id)}` : null,
    bio: user.bio || '',
    lastSeenAt: user.lastSeenAt,
    createdAt: user.createdAt,
    deletionScheduledAt: user.deletionScheduledAt
  };
}

export function safeMessage(message, viewerId) {
  return {
    id: message.id,
    clientId: message.clientId,
    chatId: message.chatId,
    content: message.deletedAt ? 'Сообщение удалено' : message.content,
    type: message.type,
    createdAt: message.createdAt,
    editedAt: message.editedAt,
    deletedAt: message.deletedAt,
    pinnedAt: message.pinnedAt,
    sender: message.sender ? safeUser(message.sender) : null,
    replyTo: message.replyTo ? { id: message.replyTo.id, content: message.replyTo.content, senderId: message.replyTo.senderId } : null,
    attachment: message.attachment ? {
      id: message.attachment.id,
      name: message.attachment.originalName,
      mimeType: message.attachment.mimeType,
      sizeBytes: message.attachment.sizeBytes,
      downloadUrl: `/api/attachments/${encodeURIComponent(message.attachment.id)}`
    } : null,
    reactions: (message.reactions || []).map((reaction) => ({ emoji: reaction.emoji, userId: reaction.userId })),
    delivery: (message.reads || []).length === 0 ? 'sent' : (message.reads || []).every((receipt) => receipt.readAt) ? 'read' : (message.reads || []).some((receipt) => receipt.deliveredAt) ? 'delivered' : 'sent',
    mine: message.senderId === viewerId
  };
}
