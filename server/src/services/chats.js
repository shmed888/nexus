import { prisma } from '../db.js';
import { HttpError } from '../utils/errors.js';
import { safeMessage, safeUser } from '../utils/validation.js';

export async function getMembership(chatId, userId) {
  const membership = await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId, userId } }, include: { chat: true } });
  if (!membership) throw new HttpError(404, 'CHAT_NOT_FOUND', 'Чат не найден.');
  return membership;
}

export async function assertNotBlocked(a, b) {
  const block = await prisma.block.findFirst({ where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] } });
  if (block) throw new HttpError(403, 'BLOCKED', 'Взаимодействие недоступно из-за блокировки.');
}

export async function ensureDirectChat(userId, targetId) {
  if (userId === targetId) throw new HttpError(400, 'SELF_CHAT', 'Нельзя создать личный диалог с собой.');
  const target = await prisma.user.findFirst({ where: { id: targetId, deletionScheduledAt: null }, select: { id: true } });
  if (!target) throw new HttpError(404, 'USER_NOT_FOUND', 'Пользователь не найден.');
  await assertNotBlocked(userId, targetId);
  const directKey = `direct:${[userId, targetId].sort().join(':')}`;
  const existing = await prisma.chat.findUnique({ where: { directKey } });
  if (existing) return existing;
  try {
    return await prisma.chat.create({
      data: {
        type: 'DIRECT', directKey,
        members: { create: [{ userId, role: 'OWNER' }, { userId: targetId, role: 'MEMBER' }] }
      }
    });
  } catch (error) {
    if (error?.code === 'P2002') return prisma.chat.findUnique({ where: { directKey } });
    throw error;
  }
}

export async function listChats(userId, { archived = false } = {}) {
  const invisiblePeers = new Set((await prisma.block.findMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] }, select: { blockerId: true, blockedId: true } })).map((block) => block.blockerId === userId ? block.blockedId : block.blockerId));
  const memberships = await prisma.chatMember.findMany({
    where: { userId, archivedAt: archived ? { not: null } : null, chat: { type: { not: 'SAVED' } } },
    include: {
      chat: {
        include: {
          members: { include: { user: { select: { id: true, username: true, displayName: true, avatarPath: true, lastSeenAt: true, bio: true, createdAt: true, deletionScheduledAt: true } } } },
          messages: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 1, include: { sender: { select: { id: true, username: true, displayName: true, avatarPath: true, lastSeenAt: true, bio: true, createdAt: true, deletionScheduledAt: true } }, attachment: true, reactions: true } }
        }
      }
    }, orderBy: [{ pinnedAt: 'desc' }, { chat: { updatedAt: 'desc' } }], take: 100
  });
  const data = await Promise.all(memberships.map(async (membership) => {
    const chat = membership.chat;
    const last = chat.messages[0] || null;
    const peerRaw = chat.type === 'DIRECT' ? chat.members.find((m) => m.userId !== userId)?.user : null;
    const peer = peerRaw ? { ...peerRaw, lastSeenAt: invisiblePeers.has(peerRaw.id) ? null : peerRaw.lastSeenAt } : null;
    const unreadCount = await prisma.message.count({
      where: { chatId: chat.id, senderId: { not: userId }, deletedAt: null, ...(membership.lastReadAt ? { createdAt: { gt: membership.lastReadAt } } : {}) }
    });
    return {
      id: chat.id, type: chat.type, title: chat.title, description: chat.description,
      pinned: Boolean(membership.pinnedAt), archived: Boolean(membership.archivedAt), role: membership.role,
      updatedAt: chat.updatedAt, unreadCount,
      peer: peer ? { ...safeUser(peer), online: false } : null,
      members: chat.type === 'DIRECT' ? undefined : chat.members.map((m) => ({ ...safeUser(m.user), role: m.role })),
      lastMessage: last ? safeMessage(last, userId) : null
    };
  }));
  return data.sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.updatedAt) - new Date(a.updatedAt));
}

export async function createGroup(ownerId, { title, description = '', members = [], type = 'GROUP' }) {
  const memberNames = [...new Set(members)].slice(0, 49).filter((id) => id !== ownerId);
  const users = memberNames.length ? await prisma.user.findMany({ where: { id: { in: memberNames }, deletionScheduledAt: null }, select: { id: true } }) : [];
  if (users.length !== memberNames.length) throw new HttpError(400, 'INVALID_MEMBERS', 'Некоторые участники не найдены.');
  for (const user of users) await assertNotBlocked(ownerId, user.id);
  return prisma.chat.create({
    data: {
      type, title: String(title).trim().slice(0, 80), description: String(description).trim().slice(0, 300),
      members: { create: [{ userId: ownerId, role: 'OWNER' }, ...users.map((user) => ({ userId: user.id, role: type === 'CHANNEL' ? 'SUBSCRIBER' : 'MEMBER' }))] }
    },
    select: { id: true, type: true, title: true, description: true, createdAt: true }
  });
}
