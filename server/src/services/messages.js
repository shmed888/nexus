import { prisma } from '../db.js';
import { HttpError } from '../utils/errors.js';
import { safeMessage, textMessageSchema } from '../utils/validation.js';
import { isValidClientId } from '../utils/primitives.js';
import { assertNotBlocked, getMembership } from './chats.js';

const messageInclude = {
  sender: { select: { id: true, username: true, displayName: true, avatarPath: true, bio: true, lastSeenAt: true, createdAt: true, deletionScheduledAt: true } },
  replyTo: { select: { id: true, content: true, senderId: true } },
  attachment: true, reactions: true, reads: { select: { userId: true, deliveredAt: true, readAt: true } }
};

export async function sendMessage(io, userId, chatId, input) {
  const membership = await getMembership(chatId, userId);
  const content = input.content === '' ? '' : textMessageSchema.parse(input.content);
  const type = input.type || 'TEXT';
  if (!['TEXT', 'SYSTEM'].includes(type)) throw new HttpError(400, 'INVALID_MESSAGE_TYPE', 'Неподдерживаемый тип сообщения.');
  if (membership.chat.type === 'CHANNEL' && !['OWNER', 'ADMIN'].includes(membership.role)) {
    throw new HttpError(403, 'CHANNEL_READ_ONLY', 'Публиковать сообщения в этом канале могут только администраторы.');
  }
  if (membership.chat.type === 'DIRECT') {
    const peer = await prisma.chatMember.findFirst({ where: { chatId, userId: { not: userId } }, select: { userId: true } });
    if (peer) await assertNotBlocked(userId, peer.userId);
  }
  if (!content && !input.attachmentId) throw new HttpError(400, 'EMPTY_MESSAGE', 'Сообщение не может быть пустым.');
  const clientId = isValidClientId(input.clientId) ? input.clientId : null;
  if (clientId) {
    const prior = await prisma.message.findFirst({ where: { chatId, senderId: userId, clientId }, include: messageInclude });
    if (prior) return safeMessage(prior, userId);
  }
  let replyToId = input.replyToId || null;
  if (replyToId) {
    const replied = await prisma.message.findFirst({ where: { id: replyToId, chatId }, select: { id: true } });
    if (!replied) throw new HttpError(400, 'INVALID_REPLY', 'Исходное сообщение не найдено в этом чате.');
  }
  let message;
  try {
    message = await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({ data: { chatId, senderId: userId, clientId, content, replyToId, type }, include: messageInclude });
      await tx.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });
      const recipients = await tx.chatMember.findMany({ where: { chatId, userId: { not: userId } }, select: { userId: true } });
      if (recipients.length) await tx.messageRead.createMany({ data: recipients.map((r) => ({ messageId: created.id, userId: r.userId, deliveredAt: null })), skipDuplicates: true });
      return created;
    });
  } catch (error) {
    if (error?.code === 'P2002' && clientId) {
      const prior = await prisma.message.findFirst({ where: { chatId, senderId: userId, clientId }, include: messageInclude });
      if (prior) return safeMessage(prior, userId);
    }
    throw error;
  }
  const safe = safeMessage(message, userId);
  io.to(`chat:${chatId}`).emit('message:new', safe);
  io.to(`user:${userId}`).emit('chat:updated', { chatId });
  const recipients = await prisma.chatMember.findMany({ where: { chatId, userId: { not: userId } }, select: { userId: true } });
  recipients.forEach((r) => io.to(`user:${r.userId}`).emit('chat:updated', { chatId }));
  return safe;
}

export async function getHistory(userId, chatId, before) {
  await getMembership(chatId, userId);
  const beforeDate = before ? new Date(before) : null;
  if (before && (!beforeDate || Number.isNaN(beforeDate.getTime()))) throw new HttpError(400, 'INVALID_CURSOR', 'Некорректная позиция истории.');
  const messages = await prisma.message.findMany({
    where: { chatId, ...(beforeDate ? { createdAt: { lt: beforeDate } } : {}), hiddenFor: { none: { userId } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50, include: messageInclude
  });
  return messages.reverse().map((message) => safeMessage(message, userId));
}

export async function markRead(io, userId, chatId) {
  await getMembership(chatId, userId);
  const now = new Date();
  await prisma.$transaction([
    prisma.chatMember.update({ where: { chatId_userId: { chatId, userId } }, data: { lastReadAt: now } }),
    prisma.messageRead.updateMany({ where: { userId, message: { chatId, senderId: { not: userId } }, readAt: null }, data: { readAt: now, deliveredAt: now } })
  ]);
  io.to(`chat:${chatId}`).emit('chat:read', { chatId, userId, readAt: now });
  io.to(`user:${userId}`).emit('chat:updated', { chatId });
}
