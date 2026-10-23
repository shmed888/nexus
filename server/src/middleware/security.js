import { HttpError } from '../utils/errors.js';
import { SESSION_COOKIE, tokenHash } from '../utils/session.js';
import { prisma } from '../db.js';
import { config } from '../config.js';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

export function sameOrigin(req, _res, next) {
  if (safeMethods.has(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next(new HttpError(403, 'ORIGIN_REQUIRED', 'Запрос без Origin отклонён.'));
  try {
    const parsed = new URL(origin);
    if (parsed.host !== req.get('host') || !['http:', 'https:'].includes(parsed.protocol)) {
      return next(new HttpError(403, 'ORIGIN_MISMATCH', 'Источник запроса не разрешён.'));
    }
  } catch {
    return next(new HttpError(403, 'INVALID_ORIGIN', 'Некорректный Origin.'));
  }
  next();
}

export async function loadSession(req, _res, next) {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) return next();
    const session = await prisma.session.findFirst({
      where: { tokenHash: tokenHash(token), revokedAt: null, expiresAt: { gt: new Date() } },
      include: { user: true }
    });
    if (session) {
      req.auth = { sessionId: session.id, userId: session.userId };
      req.user = session.user;
      void prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
    }
    next();
  } catch (error) { next(error); }
}

export function requireAuth(req, _res, next) {
  if (!req.auth || !req.user) return next(new HttpError(401, 'AUTH_REQUIRED', 'Войдите в Nexus, чтобы продолжить.'));
  if (req.user.deletionScheduledAt && !['/restore-account', '/logout', '/me'].includes(req.path)) {
    return next(new HttpError(403, 'ACCOUNT_PENDING_DELETION', 'Аккаунт ожидает удаления. Отмените удаление в настройках, чтобы продолжить.'));
  }
  next();
}

export async function socketSession(socket, next) {
  try {
    // Browsers always send Origin on WebSocket handshakes; reject cross-site socket hijacking.
    const origin = socket.handshake.headers.origin;
    if (origin) {
      let parsed;
      try { parsed = new URL(origin); } catch { return next(new Error('ORIGIN_INVALID')); }
      const requestHost = socket.handshake.headers.host;
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.host !== requestHost) {
        return next(new Error('ORIGIN_NOT_ALLOWED'));
      }
      if (config.nodeEnv === 'production' && origin !== config.publicOrigin) {
        return next(new Error('ORIGIN_NOT_ALLOWED'));
      }
    }
    const cookieHeader = socket.handshake.headers.cookie || '';
    const match = cookieHeader.split(';').map((p) => p.trim()).find((p) => p.startsWith(`${SESSION_COOKIE}=`));
    if (!match) return next(new Error('AUTH_REQUIRED'));
    const token = decodeURIComponent(match.slice(SESSION_COOKIE.length + 1));
    const session = await prisma.session.findFirst({
      where: { tokenHash: tokenHash(token), revokedAt: null, expiresAt: { gt: new Date() }, user: { deletionScheduledAt: null } },
      select: { id: true, userId: true }
    });
    if (!session) return next(new Error('AUTH_REQUIRED'));
    socket.data.auth = { sessionId: session.id, userId: session.userId };
    next();
  } catch { next(new Error('AUTH_FAILED')); }
}
