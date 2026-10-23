import { prisma } from '../db.js';

const connectedByUser = new Map();
export const isOnline = (userId) => (connectedByUser.get(userId) || 0) > 0;
export const onlineUsers = () => [...connectedByUser.keys()];

async function visibleUserIds(userId) {
  const [memberships, contacts, blocks] = await Promise.all([
    prisma.chatMember.findMany({ where: { userId, chat: { type: 'DIRECT' } }, include: { chat: { include: { members: { select: { userId: true } } } } } }),
    prisma.contact.findMany({ where: { ownerId: userId }, select: { targetId: true } }),
    prisma.block.findMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] }, select: { blockerId: true, blockedId: true } })
  ]);
  const allowed = new Set(contacts.map((c) => c.targetId));
  for (const membership of memberships) for (const member of membership.chat.members) if (member.userId !== userId) allowed.add(member.userId);
  for (const block of blocks) { allowed.delete(block.blockerId); allowed.delete(block.blockedId); }
  return [...allowed];
}
export async function getVisibleOnlineUsers(userId) {
  const visible = await visibleUserIds(userId);
  return visible.filter((id) => isOnline(id));
}
async function notifyVisible(io, userId, online, lastSeenAt) {
  const visible = await visibleUserIds(userId);
  for (const recipientId of visible) io.to(`user:${recipientId}`).emit('presence:update', { userId, online, ...(lastSeenAt ? { lastSeenAt } : {}) });
}
export async function markOnline(io, userId) {
  const count = (connectedByUser.get(userId) || 0) + 1;
  connectedByUser.set(userId, count);
  if (count === 1) await notifyVisible(io, userId, true);
}
export async function markOffline(io, userId) {
  const count = Math.max(0, (connectedByUser.get(userId) || 1) - 1);
  if (count) connectedByUser.set(userId, count);
  else {
    connectedByUser.delete(userId);
    const lastSeenAt = new Date();
    await prisma.user.update({ where: { id: userId }, data: { lastSeenAt } }).catch(() => {});
    await notifyVisible(io, userId, false, lastSeenAt);
  }
}
