import { Router } from 'express';
import { prisma } from '../db.js';
import { HttpError } from '../utils/errors.js';
import { requireAuth } from '../middleware/security.js';
import { getMembership, assertNotBlocked } from '../services/chats.js';
import { safeMessage } from '../utils/validation.js';

export const messagesRouter = Router();
messagesRouter.use(requireAuth);

messagesRouter.patch('/:messageId', async (req, res) => {
  const text = req.body?.content;
  if (typeof text !== 'string' || !text.trim() || text.length > 4000) throw new HttpError(400, 'INVALID_CONTENT', 'Сообщение должно содержать от 1 до 4000 символов.');
  const message = await prisma.message.findUnique({ where: { id: req.params.messageId }, include: { chat: { include: { members: true } } } });
  if (!message || !message.chat.members.some((m) => m.userId === req.user.id)) throw new HttpError(404, 'MESSAGE_NOT_FOUND', 'Сообщение не найдено.');
  if (message.senderId !== req.user.id || message.deletedAt) throw new HttpError(403, 'FORBIDDEN', 'Можно редактировать только собственное неудалённое сообщение.');
  const updated = await prisma.message.update({ where: { id: message.id }, data: { content: text.trim(), editedAt: new Date() }, include: { sender: true, replyTo: true, attachment: true, reactions: true } });
  const io = req.app.get('io');
  const safe = safeMessage(updated, req.user.id);
  io.to(`chat:${message.chatId}`).emit('message:updated', safe);
  res.json({ message: safe });
});

messagesRouter.delete('/:messageId', async (req, res) => {
  const message = await prisma.message.findUnique({ where: { id: req.params.messageId }, include: { chat: { include: { members: true } } } });
  if (!message || !message.chat.members.some((m) => m.userId === req.user.id)) throw new HttpError(404, 'MESSAGE_NOT_FOUND', 'Сообщение не найдено.');
  if (req.query.everyone === 'true') {
    if (message.senderId !== req.user.id) throw new HttpError(403, 'FORBIDDEN', 'Удалить сообщение у всех может только автор.');
    await prisma.message.update({ where: { id: message.id }, data: { deletedAt: new Date(), content: '' } });
    req.app.get('io').to(`chat:${message.chatId}`).emit('message:deleted', { id: message.id, chatId: message.chatId, everyone: true });
  } else {
    await prisma.messageHidden.upsert({ where: { messageId_userId: { messageId: message.id, userId: req.user.id } }, create: { messageId: message.id, userId: req.user.id }, update: {} });
    req.app.get('io').to(`user:${req.user.id}`).emit('message:deleted', { id: message.id, chatId: message.chatId, everyone: false });
  }
  res.status(204).end();
});

messagesRouter.post('/:messageId/pin', async (req, res) => {
  const message = await prisma.message.findUnique({ where: { id: req.params.messageId }, include: { chat: { include: { members: true } } } });
  const member = message?.chat.members.find((m) => m.userId === req.user.id);
  if (!message || !member) throw new HttpError(404, 'MESSAGE_NOT_FOUND', 'Сообщение не найдено.');
  if (message.chat.type === 'DIRECT' ? false : !['OWNER', 'ADMIN'].includes(member.role)) throw new HttpError(403, 'FORBIDDEN', 'Закреплять сообщения могут только администраторы.');
  const updated = await prisma.message.update({ where: { id: message.id }, data: { pinnedAt: message.pinnedAt ? null : new Date() } });
  req.app.get('io').to(`chat:${message.chatId}`).emit('message:pinned', { id: message.id, chatId: message.chatId, pinnedAt: updated.pinnedAt });
  res.json({ pinnedAt: updated.pinnedAt });
});

messagesRouter.post('/:messageId/reactions', async (req, res) => {
  const emoji = req.body?.emoji;
  if (typeof emoji !== 'string' || !emoji || emoji.length > 16) throw new HttpError(400, 'INVALID_REACTION', 'Недопустимая реакция.');
  const message = await prisma.message.findUnique({ where: { id: req.params.messageId }, include: { chat: { include: { members: true } } } });
  if (!message || !message.chat.members.some((m) => m.userId === req.user.id)) throw new HttpError(404, 'MESSAGE_NOT_FOUND', 'Сообщение не найдено.');
  const existing = await prisma.reaction.findUnique({ where: { messageId_userId_emoji: { messageId: message.id, userId: req.user.id, emoji } } });
  if (existing) await prisma.reaction.delete({ where: { id: existing.id } });
  else await prisma.reaction.create({ data: { messageId: message.id, userId: req.user.id, emoji } });
  req.app.get('io').to(`chat:${message.chatId}`).emit('message:reaction', { id: message.id, chatId: message.chatId, userId: req.user.id, emoji, active: !existing });
  res.json({ active: !existing });
});
