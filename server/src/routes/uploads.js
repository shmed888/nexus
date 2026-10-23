import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { safeOriginalFilename } from '../utils/primitives.js';
import { fileTypeFromFile } from 'file-type';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { HttpError } from '../utils/errors.js';
import { requireAuth } from '../middleware/security.js';
import { getMembership, assertNotBlocked } from '../services/chats.js';
import { safeMessage } from '../utils/validation.js';

export const uploadsRouter = Router();
await mkdir(path.join(config.uploadDir, '.incoming'), { recursive: true });
const upload = multer({ dest: path.join(config.uploadDir, '.incoming'), limits: { fileSize: config.maxFileBytes, files: 1 } });
const allowed = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm',
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'application/pdf', 'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'text/plain'
]);
const extForMime = new Map([
  ['image/jpeg', '.jpg'], ['image/png', '.png'], ['image/gif', '.gif'], ['image/webp', '.webp'],
  ['video/mp4', '.mp4'], ['video/webm', '.webm'], ['audio/mpeg', '.mp3'], ['audio/ogg', '.ogg'],
  ['audio/wav', '.wav'], ['audio/webm', '.webm'], ['application/pdf', '.pdf'], ['application/zip', '.zip'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.docx'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx'],
  ['application/vnd.openxmlformats-officedocument.presentationml.presentation', '.pptx'], ['text/plain', '.txt']
]);

uploadsRouter.post('/chats/:chatId/attachments', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'FILE_REQUIRED', 'Выберите файл для отправки.');
  let storageName;
  try {
    const membership = await getMembership(req.params.chatId, req.user.id);
    if (membership.chat.type === 'CHANNEL' && !['OWNER', 'ADMIN'].includes(membership.role)) throw new HttpError(403, 'CHANNEL_READ_ONLY', 'В этом канале нельзя публиковать файлы.');
    if (membership.chat.type === 'DIRECT') {
      const peer = await prisma.chatMember.findFirst({ where: { chatId: req.params.chatId, userId: { not: req.user.id } }, select: { userId: true } });
      if (peer) await assertNotBlocked(req.user.id, peer.userId);
    }
    const detected = await fileTypeFromFile(req.file.path);
    let mimeType = detected?.mime;
    if (!mimeType && path.extname(req.file.originalname).toLowerCase() === '.txt') {
      const { readFile } = await import('node:fs/promises');
      const head = (await readFile(req.file.path)).subarray(0, 2048);
      if (!head.includes(0)) mimeType = 'text/plain';
    }
    if (!mimeType || !allowed.has(mimeType) || !extForMime.has(mimeType)) throw new HttpError(415, 'UNSUPPORTED_FILE_TYPE', 'Этот тип файла не поддерживается.');
    storageName = `${randomUUID()}${extForMime.get(mimeType)}`;
    const finalPath = path.join(config.uploadDir, storageName);
    await rename(req.file.path, finalPath);
    const originalName = safeOriginalFilename(req.file.originalname || 'file');
    const msg = await prisma.$transaction(async (tx) => {
      const message = await tx.message.create({ data: { chatId: req.params.chatId, senderId: req.user.id, content: originalName, type: req.body?.voice === 'true' ? 'VOICE' : mimeType.startsWith('image/') ? 'IMAGE' : mimeType.startsWith('video/') ? 'VIDEO' : mimeType.startsWith('audio/') ? 'AUDIO' : 'FILE' } });
      const attachment = await tx.attachment.create({ data: { messageId: message.id, storageName, originalName, mimeType, sizeBytes: req.file.size } });
      await tx.chat.update({ where: { id: req.params.chatId }, data: { updatedAt: new Date() } });
      const sender = await tx.user.findUnique({ where: { id: req.user.id }, select: { id: true, username: true, displayName: true, avatarPath: true, bio: true, lastSeenAt: true, createdAt: true, deletionScheduledAt: true } });
      return { ...message, sender, attachment, reactions: [], replyTo: null };
    });
    const safe = safeMessage(msg, req.user.id);
    const io = req.app.get('io');
    io.to(`chat:${req.params.chatId}`).emit('message:new', safe);
    await prisma.chatMember.findMany({ where: { chatId: req.params.chatId, userId: { not: req.user.id } }, select: { userId: true } }).then((members) => members.forEach((m) => io.to(`user:${m.userId}`).emit('chat:updated', { chatId: req.params.chatId })));
    res.status(201).json({ message: safe });
  } catch (error) {
    await unlink(req.file.path).catch(() => {});
    if (storageName) await unlink(path.join(config.uploadDir, storageName)).catch(() => {});
    throw error;
  }
});

uploadsRouter.get('/attachments/:attachmentId', requireAuth, async (req, res) => {
  const attachment = await prisma.attachment.findUnique({ where: { id: req.params.attachmentId }, include: { message: { include: { chat: { include: { members: true } } } } } });
  if (!attachment || !attachment.message.chat.members.some((m) => m.userId === req.user.id)) throw new HttpError(404, 'ATTACHMENT_NOT_FOUND', 'Файл не найден.');
  const { createReadStream } = await import('node:fs');
  const fullPath = path.join(config.uploadDir, path.basename(attachment.storageName));
  res.setHeader('Content-Type', attachment.mimeType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const requestedInline = req.query.inline === '1' && /^(image|audio|video)\//.test(attachment.mimeType);
  res.setHeader('Content-Disposition', `${requestedInline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`);
  res.setHeader('Content-Length', String(attachment.sizeBytes));
  const stream = createReadStream(fullPath);
  stream.on('error', () => { if (!res.headersSent) res.status(404).json({ error: { code: 'FILE_MISSING', message: 'Файл больше недоступен.' } }); else res.destroy(); });
  stream.pipe(res);
});
