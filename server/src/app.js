import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { sameOrigin, loadSession } from './middleware/security.js';
import { errorHandler, HttpError } from './utils/errors.js';
import { requireAuth } from './middleware/security.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { chatsRouter } from './routes/chats.js';
import { messagesRouter } from './routes/messages.js';
import { uploadsRouter } from './routes/uploads.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: {
  directives: {
    defaultSrc: ["'self'"], baseUri: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"],
    scriptSrc: ["'self'"], styleSrc: ["'self'"], styleSrcAttr: ["'unsafe-inline'"], imgSrc: ["'self'", 'data:', 'blob:'], mediaSrc: ["'self'", 'blob:'],
    connectSrc: ["'self'", 'ws:', 'wss:'], formAction: ["'self'"]
  }
} }));
app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));
app.use(cookieParser());
app.use('/api', rateLimit({ windowMs: 60_000, limit: 240, standardHeaders: 'draft-8', legacyHeaders: false }));
app.use('/api', sameOrigin);
app.use('/api', loadSession);
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/chats', chatsRouter);
app.use('/api/messages', messagesRouter);
app.use('/api', uploadsRouter);
app.get('/api/calls/config', requireAuth, (req, res) => {
  const iceServers = [{ urls: config.stunUrl }];
  if (config.turnUrl && config.turnUsername && config.turnCredential) iceServers.push({ urls: config.turnUrl, username: config.turnUsername, credential: config.turnCredential });
  res.json({ iceServers });
});
app.get('/api/health', async (_req, res, next) => {
  try {
    const { prisma } = await import('./db.js');
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) { next(new HttpError(503, 'DATABASE_UNAVAILABLE', 'Не удалось подключиться к PostgreSQL. Проверьте DATABASE_URL и состояние базы.')); }
});
app.use(express.static(path.resolve(here, '../../client'), { index: 'index.html', maxAge: config.nodeEnv === 'production' ? '1h' : 0, etag: true }));
app.use('/api', (_req, _res, next) => next(new HttpError(404, 'API_NOT_FOUND', 'Маршрут API не найден.')));
app.use((_req, res) => res.status(404).sendFile(path.resolve(here, '../../client/index.html')));
app.use(errorHandler);
