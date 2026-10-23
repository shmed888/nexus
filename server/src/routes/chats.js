import { Router } from 'express';
import { prisma } from '../db.js';
import { HttpError } from '../utils/errors.js';
import { requireAuth } from '../middleware/security.js';
import { ensureDirectChat, getMembership, listChats, createGroup } from '../services/chats.js';
import { getHistory, markRead, sendMessage } from '../services/messages.js';

export const chatsRouter = Router();
chatsRouter.use(requireAuth);

chatsRouter.get('/', async (req, res) => res.json({ chats: await listChats(req.user.id) }));
chatsRouter.get('/saved', async (req, res) => {
  const membership = await prisma.chatMember.findFirst({ where: { userId: req.user.id, chat: { type: 'SAVED' } }, include: { chat: true } });
  if (!membership) throw new HttpError(404, 'SAVED_CHAT_NOT_FOUND', 'Сохранённый чат не найден.');
  res.json({ chat: { id: membership.chat.id, type: 'SAVED', title: membership.chat.title, description: membership.chat.description, updatedAt: membership.chat.updatedAt, pinned: Boolean(membership.pinnedAt), archived: false, unreadCount: 0, peer: null, members: [] } });
});
chatsRouter.get('/archive', async (req, res) => res.json({ chats: await listChats(req.user.id, { archived: true }) }));
chatsRouter.post('/direct', async (req, res) => {
  const chat = await ensureDirectChat(req.user.id, String(req.body?.userId || ''));
  res.status(201).json({ chat });
});
chatsRouter.post('/groups', async (req, res) => {
  if (typeof req.body?.title !== 'string' || !req.body.title.trim() || req.body.title.length > 80) throw new HttpError(400, 'INVALID_TITLE', 'Название группы обязательно (до 80 символов).');
  const type = req.body?.type === 'CHANNEL' ? 'CHANNEL' : 'GROUP';
  const chat = await createGroup(req.user.id, { title: req.body.title, description: req.body.description, members: Array.isArray(req.body.memberIds) ? req.body.memberIds : [], type });
  res.status(201).json({ chat });
});
chatsRouter.get('/:chatId/messages', async (req, res) => res.json({ messages: await getHistory(req.user.id, req.params.chatId, req.query.before) }));
chatsRouter.post('/:chatId/messages', async (req, res) => {
  const io = req.app.get('io');
  const message = await sendMessage(io, req.user.id, req.params.chatId, req.body || {});
  res.status(201).json({ message });
});
chatsRouter.post('/:chatId/read', async (req, res) => {
  await markRead(req.app.get('io'), req.user.id, req.params.chatId);
  res.status(204).end();
});
chatsRouter.patch('/:chatId/archive', async (req, res) => {
  const archived = req.body?.archived !== false;
  await getMembership(req.params.chatId, req.user.id);
  await prisma.chatMember.update({ where: { chatId_userId: { chatId: req.params.chatId, userId: req.user.id } }, data: { archivedAt: archived ? new Date() : null } });
  res.status(204).end();
});
chatsRouter.patch('/:chatId/pin', async (req, res) => {
  await getMembership(req.params.chatId, req.user.id);
  await prisma.chatMember.update({ where: { chatId_userId: { chatId: req.params.chatId, userId: req.user.id } }, data: { pinnedAt: req.body?.pinned === false ? null : new Date() } });
  res.status(204).end();
});
chatsRouter.patch('/:chatId/title', async (req, res) => {
  const membership = await getMembership(req.params.chatId, req.user.id);
  if (!['GROUP', 'CHANNEL'].includes(membership.chat.type) || !['OWNER', 'ADMIN'].includes(membership.role)) throw new HttpError(403, 'FORBIDDEN', 'Недостаточно прав.');
  if (typeof req.body?.title !== 'string' || !req.body.title.trim() || req.body.title.length > 80) throw new HttpError(400, 'INVALID_TITLE', 'Название обязательно и должно быть не длиннее 80 символов.');
  await prisma.chat.update({ where: { id: req.params.chatId }, data: { title: req.body.title.trim() } });
  req.app.get('io').to(`chat:${req.params.chatId}`).emit('chat:updated', { chatId: req.params.chatId });
  res.status(204).end();
});
chatsRouter.post('/:chatId/members', async (req, res) => {
  const membership = await getMembership(req.params.chatId, req.user.id);
  if (!['GROUP', 'CHANNEL'].includes(membership.chat.type) || !['OWNER', 'ADMIN'].includes(membership.role)) throw new HttpError(403, 'FORBIDDEN', 'Недостаточно прав.');
  const userId = String(req.body?.userId || '');
  const user = await prisma.user.findFirst({ where: { id: userId, deletionScheduledAt: null }, select: { id: true } });
  if (!user) throw new HttpError(404, 'USER_NOT_FOUND', 'Пользователь не найден.');
  await prisma.chatMember.upsert({ where: { chatId_userId: { chatId: req.params.chatId, userId } }, create: { chatId: req.params.chatId, userId, role: membership.chat.type === 'CHANNEL' ? 'SUBSCRIBER' : 'MEMBER' }, update: {} });
  res.status(204).end();
});
chatsRouter.delete('/:chatId/members/:userId', async (req, res) => {
  const membership = await getMembership(req.params.chatId, req.user.id);
  if (!['GROUP', 'CHANNEL'].includes(membership.chat.type)) throw new HttpError(400, 'NOT_A_GROUP', 'Это не группа или канал.');
  const targetMembership = await getMembership(req.params.chatId, req.params.userId);
  if (req.params.userId === req.user.id) {
    if (membership.role === 'OWNER') throw new HttpError(400, 'OWNER_CANNOT_LEAVE', 'Перед выходом владелец должен передать права владения.');
  } else if (!['OWNER', 'ADMIN'].includes(membership.role) || targetMembership.role === 'OWNER' || (membership.role === 'ADMIN' && targetMembership.role === 'ADMIN')) {
    throw new HttpError(403, 'FORBIDDEN', 'Недостаточно прав для удаления участника.');
  }
  await prisma.chatMember.delete({ where: { chatId_userId: { chatId: req.params.chatId, userId: req.params.userId } } });
  res.status(204).end();
});
chatsRouter.post('/:chatId/invitations', async (req, res) => {
  const membership = await getMembership(req.params.chatId, req.user.id);
  if (!['OWNER', 'ADMIN'].includes(membership.role) || !['GROUP', 'CHANNEL'].includes(membership.chat.type)) throw new HttpError(403, 'FORBIDDEN', 'Недостаточно прав.');
  const { randomBytes, createHash } = await import('node:crypto');
  const token = randomBytes(24).toString('base64url');
  const invite = await prisma.invitation.create({ data: { chatId: req.params.chatId, createdById: req.user.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 7 * 86400000), maxUses: 1 } });
  res.status(201).json({ id: invite.id, token, expiresAt: invite.expiresAt });
});
chatsRouter.post('/join/:token', async (req, res) => {
  const { createHash } = await import('node:crypto');
  const tokenHash = createHash('sha256').update(String(req.params.token)).digest('hex');
  const invite = await prisma.invitation.findUnique({ where: { tokenHash } });
  if (!invite || invite.expiresAt <= new Date() || invite.uses >= invite.maxUses) throw new HttpError(404, 'INVITATION_INVALID', 'Приглашение недействительно или истекло.');
  await prisma.$transaction([
    prisma.chatMember.upsert({ where: { chatId_userId: { chatId: invite.chatId, userId: req.user.id } }, create: { chatId: invite.chatId, userId: req.user.id, role: 'MEMBER' }, update: {} }),
    prisma.invitation.update({ where: { id: invite.id }, data: { uses: { increment: 1 } } })
  ]);
  res.json({ chatId: invite.chatId });
});
