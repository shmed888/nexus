import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import argon2 from 'argon2';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { HttpError } from '../utils/errors.js';
import { normalizeUsername, usernameSchema, passwordSchema, displayNameSchema, safeUser } from '../utils/validation.js';
import { SESSION_COOKIE, tokenHash, createToken, sessionExpiry, cookieOptions } from '../utils/session.js';
import { requireAuth } from '../middleware/security.js';

export const authRouter = Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: { code: 'RATE_LIMIT', message: 'Слишком много попыток. Попробуйте позже.' } } });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 8, standardHeaders: 'draft-8', legacyHeaders: false });

async function createSession(req, res, userId) {
  const token = createToken();
  const session = await prisma.session.create({ data: {
    userId, tokenHash: tokenHash(token), expiresAt: sessionExpiry(),
    userAgent: String(req.get('user-agent') || '').slice(0, 300), ipAddress: String(req.ip || '').slice(0, 80)
  } });
  res.cookie(SESSION_COOKIE, token, cookieOptions());
  return session;
}

const safeAuthError = () => new HttpError(401, 'INVALID_CREDENTIALS', 'Неверный username, пароль или секрет восстановления.');

authRouter.post('/register', registerLimiter, async (req, res) => {
  const username = usernameSchema.parse(req.body?.username);
  const displayName = displayNameSchema.parse(req.body?.displayName);
  const password = passwordSchema.parse(req.body?.password);
  const recoverySecret = zSecret(req.body?.recoverySecret);
  if (await prisma.user.findUnique({ where: { username }, select: { id: true } })) throw new HttpError(409, 'USERNAME_TAKEN', 'Этот username уже занят.');
  const user = await prisma.user.create({ data: {
    username, displayName,
    passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
    recoveryHash: await argon2.hash(recoverySecret, { type: argon2.argon2id })
  } });
  const savedChat = await prisma.chat.create({ data: { type: 'SAVED', title: 'Сохранённые', members: { create: { userId: user.id, role: 'OWNER' } } } });
  void savedChat;
  const session = await createSession(req, res, user.id);
  res.status(201).json({ user: safeUser(user), sessionId: session.id });
});

function zSecret(value) {
  if (typeof value !== 'string' || value.trim().length < 8 || value.length > 128) throw new HttpError(400, 'INVALID_RECOVERY_SECRET', 'Секрет восстановления должен содержать не менее 8 символов.');
  return value;
}

authRouter.post('/login', loginLimiter, async (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!username || !password) throw safeAuthError();
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || user.deletionScheduledAt || !(await argon2.verify(user.passwordHash, password).catch(() => false))) throw safeAuthError();
  const session = await createSession(req, res, user.id);
  res.json({ user: safeUser(user), sessionId: session.id });
});

authRouter.post('/recover', loginLimiter, async (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const recoverySecret = typeof req.body?.recoverySecret === 'string' ? req.body.recoverySecret : '';
  const newPassword = passwordSchema.parse(req.body?.newPassword);
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || user.deletionScheduledAt || !(await argon2.verify(user.recoveryHash, recoverySecret).catch(() => false))) throw safeAuthError();
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash: await argon2.hash(newPassword, { type: argon2.argon2id }) } }),
    prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } })
  ]);
  res.clearCookie(SESSION_COOKIE, cookieOptions());
  res.json({ ok: true, message: 'Пароль изменён. Войдите с новым паролем.' });
});

authRouter.post('/logout', requireAuth, async (req, res) => {
  await prisma.session.updateMany({ where: { id: req.auth.sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  res.clearCookie(SESSION_COOKIE, cookieOptions());
  res.status(204).end();
});

authRouter.get('/me', requireAuth, (req, res) => res.json({ user: safeUser(req.user), sessionId: req.auth.sessionId }));
authRouter.get('/sessions', requireAuth, async (req, res) => {
  const sessions = await prisma.session.findMany({ where: { userId: req.user.id, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' }, select: { id: true, userAgent: true, ipAddress: true, createdAt: true, lastSeenAt: true, expiresAt: true } });
  res.json({ sessions: sessions.map((s) => ({ ...s, current: s.id === req.auth.sessionId })) });
});
authRouter.delete('/sessions/:id', requireAuth, async (req, res) => {
  const result = await prisma.session.updateMany({ where: { id: req.params.id, userId: req.user.id, revokedAt: null }, data: { revokedAt: new Date() } });
  if (!result.count) throw new HttpError(404, 'SESSION_NOT_FOUND', 'Сессия не найдена.');
  if (req.params.id === req.auth.sessionId) res.clearCookie(SESSION_COOKIE, cookieOptions());
  res.status(204).end();
});
authRouter.post('/sessions/revoke-others', requireAuth, async (req, res) => {
  const result = await prisma.session.updateMany({ where: { userId: req.user.id, id: { not: req.auth.sessionId }, revokedAt: null }, data: { revokedAt: new Date() } });
  res.json({ revoked: result.count });
});

authRouter.post('/delete-account', requireAuth, async (req, res) => {
  if (req.body?.confirmUsername !== req.user.username) throw new HttpError(400, 'CONFIRMATION_MISMATCH', 'Введите свой username для подтверждения.');
  const scheduledAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.user.update({ where: { id: req.user.id }, data: { deletionScheduledAt: scheduledAt } });
  await prisma.session.updateMany({ where: { userId: req.user.id, id: { not: req.auth.sessionId }, revokedAt: null }, data: { revokedAt: new Date() } });
  req.app.get('io')?.in(`user:${req.user.id}`).disconnectSockets(true);
  res.json({ deletionScheduledAt: scheduledAt });
});
authRouter.post('/restore-account', requireAuth, async (req, res) => {
  if (!req.user.deletionScheduledAt) return res.json({ ok: true, message: 'Удаление не запланировано.' });
  await prisma.user.update({ where: { id: req.user.id }, data: { deletionScheduledAt: null } });
  res.json({ ok: true });
});
