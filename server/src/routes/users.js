import { Router } from 'express';
import { prisma } from '../db.js';
import { HttpError } from '../utils/errors.js';
import { normalizeUsername, usernameSchema, displayNameSchema, safeUser } from '../utils/validation.js';
import { requireAuth } from '../middleware/security.js';
import { isOnline } from '../services/presence.js';

export const usersRouter = Router();
usersRouter.use(requireAuth);

usersRouter.get('/search', async (req, res) => {
  const username = normalizeUsername(req.query.username || '');
  if (!/^[a-z0-9._]{3,32}$/.test(username)) return res.json({ users: [] });
  const users = await prisma.user.findMany({ where: { username: { contains: username, mode: 'insensitive' }, id: { not: req.user.id }, deletionScheduledAt: null }, take: 20, orderBy: { username: 'asc' }, select: { id: true, username: true, displayName: true, avatarPath: true, bio: true, lastSeenAt: true, createdAt: true, deletionScheduledAt: true } });
  // Search reveals identity fields only; presence is shared only in trusted relationships.
  res.json({ users: users.map((u) => ({ ...safeUser({ ...u, lastSeenAt: null }), online: false })) });
});

usersRouter.get('/contacts', async (req, res) => {
  const contacts = await prisma.contact.findMany({ where: { ownerId: req.user.id }, include: { target: { select: { id: true, username: true, displayName: true, avatarPath: true, bio: true, lastSeenAt: true, createdAt: true, deletionScheduledAt: true } } }, orderBy: { createdAt: 'desc' } });
  const blocked = new Set((await prisma.block.findMany({ where: { OR: [{ blockerId: req.user.id }, { blockedId: req.user.id }] }, select: { blockerId: true, blockedId: true } })).map((b) => b.blockerId === req.user.id ? b.blockedId : b.blockerId));
  res.json({ contacts: contacts.map((c) => ({ ...safeUser({ ...c.target, lastSeenAt: blocked.has(c.target.id) ? null : c.target.lastSeenAt }), online: !blocked.has(c.target.id) && isOnline(c.target.id), contactId: c.id, addedAt: c.createdAt })) });
});
usersRouter.post('/contacts/:userId', async (req, res) => {
  if (req.params.userId === req.user.id) throw new HttpError(400, 'SELF_CONTACT', 'Нельзя добавить себя в контакты.');
  const target = await prisma.user.findFirst({ where: { id: req.params.userId, deletionScheduledAt: null }, select: { id: true } });
  if (!target) throw new HttpError(404, 'USER_NOT_FOUND', 'Пользователь не найден.');
  await prisma.contact.upsert({ where: { ownerId_targetId: { ownerId: req.user.id, targetId: target.id } }, create: { ownerId: req.user.id, targetId: target.id }, update: {} });
  res.status(204).end();
});
usersRouter.delete('/contacts/:userId', async (req, res) => {
  await prisma.contact.deleteMany({ where: { ownerId: req.user.id, targetId: req.params.userId } });
  res.status(204).end();
});

usersRouter.get('/blocked', async (req, res) => {
  const list = await prisma.block.findMany({ where: { blockerId: req.user.id }, include: { blocked: { select: { id: true, username: true, displayName: true, avatarPath: true, bio: true, lastSeenAt: true, createdAt: true, deletionScheduledAt: true } } }, orderBy: { createdAt: 'desc' } });
  res.json({ users: list.map((b) => safeUser(b.blocked)) });
});
usersRouter.post('/blocks/:userId', async (req, res) => {
  const targetId = req.params.userId;
  if (targetId === req.user.id) throw new HttpError(400, 'SELF_BLOCK', 'Нельзя заблокировать себя.');
  const exists = await prisma.user.findFirst({ where: { id: targetId, deletionScheduledAt: null }, select: { id: true } });
  if (!exists) throw new HttpError(404, 'USER_NOT_FOUND', 'Пользователь не найден.');
  await prisma.block.upsert({ where: { blockerId_blockedId: { blockerId: req.user.id, blockedId: targetId } }, create: { blockerId: req.user.id, blockedId: targetId }, update: {} });
  req.app.get('io')?.to(`user:${req.user.id}`).emit('presence:hide', { userId: targetId });
  req.app.get('io')?.to(`user:${targetId}`).emit('presence:hide', { userId: req.user.id });
  req.app.get('io')?.to(`user:${req.user.id}`).emit('call:blocked', { userId: targetId });
  req.app.get('io')?.to(`user:${targetId}`).emit('call:blocked', { userId: req.user.id });
  res.status(204).end();
});
usersRouter.delete('/blocks/:userId', async (req, res) => {
  await prisma.block.deleteMany({ where: { blockerId: req.user.id, blockedId: req.params.userId } });
  res.status(204).end();
});

usersRouter.get('/profile/:username', async (req, res) => {
  const username = usernameSchema.parse(req.params.username);
  const target = await prisma.user.findFirst({ where: { username, deletionScheduledAt: null }, select: { id: true, username: true, displayName: true, avatarPath: true, bio: true, lastSeenAt: true, createdAt: true, deletionScheduledAt: true } });
  if (!target) throw new HttpError(404, 'USER_NOT_FOUND', 'Пользователь не найден.');
  const [blocked, contact, directMembership] = await Promise.all([
    prisma.block.findFirst({ where: { OR: [{ blockerId: req.user.id, blockedId: target.id }, { blockerId: target.id, blockedId: req.user.id }] }, select: { id: true } }),
    prisma.contact.findUnique({ where: { ownerId_targetId: { ownerId: req.user.id, targetId: target.id } }, select: { id: true } }),
    prisma.chatMember.findFirst({ where: { userId: req.user.id, chat: { type: 'DIRECT', members: { some: { userId: target.id } } } }, select: { id: true } })
  ]);
  const presenceVisible = !blocked && Boolean(contact || directMembership);
  res.json({ user: { ...safeUser({ ...target, lastSeenAt: presenceVisible ? target.lastSeenAt : null }), presenceVisible, online: presenceVisible && isOnline(target.id) } });
});

usersRouter.patch('/profile', async (req, res) => {
  const data = {};
  if (req.body?.displayName !== undefined) data.displayName = displayNameSchema.parse(req.body.displayName);
  if (req.body?.bio !== undefined) {
    if (typeof req.body.bio !== 'string' || req.body.bio.length > 160) throw new HttpError(400, 'INVALID_BIO', 'Описание должно быть не длиннее 160 символов.');
    data.bio = req.body.bio.trim();
  }
  if (req.body?.username !== undefined) {
    const username = usernameSchema.parse(req.body.username);
    const lastChange = req.user.usernameChangedAt?.getTime() || 0;
    if (req.user.username !== username && Date.now() - lastChange < 7 * 24 * 60 * 60 * 1000) {
      const next = new Date(lastChange + 7 * 24 * 60 * 60 * 1000);
      throw new HttpError(429, 'USERNAME_COOLDOWN', `Username можно изменить после ${next.toISOString()}.`);
    }
    data.username = username;
    if (req.user.username !== username) data.usernameChangedAt = new Date();
  }
  if (!Object.keys(data).length) throw new HttpError(400, 'EMPTY_PROFILE', 'Нет изменений профиля.');
  const user = await prisma.user.update({ where: { id: req.user.id }, data });
  res.json({ user: safeUser(user) });
});

usersRouter.get('/avatars/:userId', async (req, res) => {
  const user = await prisma.user.findFirst({ where: { id: req.params.userId, deletionScheduledAt: null }, select: { id: true, avatarPath: true } });
  if (!user || !user.avatarPath) throw new HttpError(404, 'AVATAR_NOT_FOUND', 'Аватар не найден.');
  // Avatar uploads are not part of this MVP yet; this path is reserved for server-side storage only.
  throw new HttpError(404, 'AVATAR_NOT_AVAILABLE', 'Загрузка аватаров пока не включена.');
});
