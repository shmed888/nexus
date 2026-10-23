import { prisma } from '../db.js';
import { socketSession } from '../middleware/security.js';
import { markOnline, markOffline, getVisibleOnlineUsers } from '../services/presence.js';
import { getMembership, assertNotBlocked } from '../services/chats.js';
import { sendMessage, markRead } from '../services/messages.js';

export function attachSockets(io) {
  io.use(socketSession);
  io.on('connection', async (socket) => {
    const userId = socket.data.auth.userId;
    socket.join(`user:${userId}`);
    await markOnline(io, userId);
    socket.emit('presence:snapshot', { userIds: await getVisibleOnlineUsers(userId) });

    socket.on('presence:refresh', async (_payload, ack = () => {}) => {
      ack?.({ userIds: await getVisibleOnlineUsers(userId) });
    });

    socket.on('chat:join', async (payload, ack = () => {}) => {
      try {
        const chatId = String(payload?.chatId || '');
        const membership = await getMembership(chatId, userId);
        if (membership.chat.type === 'DIRECT') {
          const peer = await prisma.chatMember.findFirst({ where: { chatId, userId: { not: userId } }, select: { userId: true } });
          if (peer) await assertNotBlocked(userId, peer.userId);
        }
        socket.join(`chat:${chatId}`);
        const pending = await prisma.messageRead.findMany({ where: { userId, deliveredAt: null, message: { chatId, senderId: { not: userId } } }, select: { messageId: true, message: { select: { senderId: true } } } });
        if (pending.length) {
          const deliveredAt = new Date();
          await prisma.messageRead.updateMany({ where: { userId, deliveredAt: null, message: { chatId, senderId: { not: userId } } }, data: { deliveredAt } });
          for (const item of pending) if (item.message.senderId) io.to(`user:${item.message.senderId}`).emit('chat:delivery', { chatId, messageId: item.messageId, userId, deliveredAt });
        }
        ack({ ok: true });
      } catch (error) { ack({ ok: false, error: error.message || 'Не удалось открыть чат.' }); }
    });

    socket.on('chat:leave', (payload) => {
      if (payload?.chatId) socket.leave(`chat:${String(payload.chatId)}`);
    });

    socket.on('message:send', async (payload, ack = () => {}) => {
      try {
        const message = await sendMessage(io, userId, String(payload?.chatId || ''), payload || {});
        ack({ ok: true, message });
      } catch (error) { ack({ ok: false, error: error.message || 'Сообщение не отправлено.' }); }
    });

    socket.on('chat:typing', async (payload) => {
      try {
        const chatId = String(payload?.chatId || '');
        const membership = await getMembership(chatId, userId);
        if (membership.chat.type === 'DIRECT') {
          const peer = await prisma.chatMember.findFirst({ where: { chatId, userId: { not: userId } }, select: { userId: true } });
          if (peer) await assertNotBlocked(userId, peer.userId);
        }
        socket.to(`chat:${chatId}`).emit('chat:typing', { chatId, userId, active: Boolean(payload?.active) });
      } catch { /* Ignore unauthorized/invalid typing events. */ }
    });

    socket.on('chat:read', async (payload, ack = () => {}) => {
      try { await markRead(io, userId, String(payload?.chatId || '')); ack({ ok: true }); }
      catch (error) { ack({ ok: false, error: error.message }); }
    });

    socket.on('call:signal', async (payload, ack = () => {}) => {
      try {
        const chatId = String(payload?.chatId || '');
        const membership = await getMembership(chatId, userId);
        if (membership.chat.type !== 'DIRECT') throw new Error('Звонки доступны только в личных диалогах.');
        const peer = await prisma.chatMember.findFirst({ where: { chatId, userId: { not: userId } }, select: { userId: true } });
        if (!peer) throw new Error('Собеседник не найден.');
        await assertNotBlocked(userId, peer.userId);
        const kind = String(payload?.kind || '');
        if (!['offer', 'answer', 'ice', 'reject', 'hangup', 'busy'].includes(kind)) throw new Error('Неподдерживаемое событие звонка.');
        const data = { chatId, fromUserId: userId, kind, description: payload?.description || null, candidate: payload?.candidate || null, callType: payload?.callType === 'video' ? 'video' : 'audio' };
        io.to(`user:${peer.userId}`).emit('call:signal', data);
        ack({ ok: true });
      } catch (error) { ack({ ok: false, error: error.message || 'Звонок недоступен.' }); }
    });

    socket.on('disconnect', async () => { await markOffline(io, userId); });
  });
}
