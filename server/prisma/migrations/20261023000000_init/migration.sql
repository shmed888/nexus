-- Generated initial migration for Nexus MVP. Keep in sync with schema.prisma.
CREATE TYPE "ChatType" AS ENUM ('DIRECT', 'GROUP', 'CHANNEL', 'SAVED');
CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'SUBSCRIBER');
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'VOICE', 'FILE', 'SYSTEM');
CREATE TABLE "User" (
 "id" TEXT NOT NULL, "username" VARCHAR(32) NOT NULL, "displayName" VARCHAR(60) NOT NULL,
 "passwordHash" TEXT NOT NULL, "recoveryHash" TEXT NOT NULL, "avatarPath" TEXT,
 "bio" VARCHAR(160) NOT NULL DEFAULT '', "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 "usernameChangedAt" TIMESTAMP(3), "deletionScheduledAt" TIMESTAMP(3), CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");
CREATE INDEX "User_deletionScheduledAt_idx" ON "User"("deletionScheduledAt");
CREATE TABLE "Session" (
 "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "tokenHash" TEXT NOT NULL, "userAgent" VARCHAR(300) NOT NULL DEFAULT '',
 "ipAddress" VARCHAR(80) NOT NULL DEFAULT '', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL, "revokedAt" TIMESTAMP(3),
 CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_revokedAt_expiresAt_idx" ON "Session"("userId", "revokedAt", "expiresAt");
CREATE TABLE "Chat" (
 "id" TEXT NOT NULL, "type" "ChatType" NOT NULL DEFAULT 'DIRECT', "title" VARCHAR(80), "description" VARCHAR(300) NOT NULL DEFAULT '',
 "avatarPath" TEXT, "directKey" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Chat_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Chat_directKey_key" ON "Chat"("directKey");
CREATE INDEX "Chat_type_updatedAt_idx" ON "Chat"("type", "updatedAt");
CREATE TABLE "ChatMember" (
 "id" TEXT NOT NULL, "chatId" TEXT NOT NULL, "userId" TEXT NOT NULL, "role" "MemberRole" NOT NULL DEFAULT 'MEMBER',
 "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastReadAt" TIMESTAMP(3), "archivedAt" TIMESTAMP(3),
 "pinnedAt" TIMESTAMP(3), "mutedUntil" TIMESTAMP(3), CONSTRAINT "ChatMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChatMember_chatId_userId_key" ON "ChatMember"("chatId", "userId");
CREATE INDEX "ChatMember_userId_archivedAt_pinnedAt_idx" ON "ChatMember"("userId", "archivedAt", "pinnedAt");
CREATE INDEX "ChatMember_chatId_joinedAt_idx" ON "ChatMember"("chatId", "joinedAt");
CREATE TABLE "Message" (
 "id" TEXT NOT NULL, "chatId" TEXT NOT NULL, "senderId" TEXT, "clientId" VARCHAR(80), "content" VARCHAR(4000) NOT NULL DEFAULT '',
 "type" "MessageType" NOT NULL DEFAULT 'TEXT', "replyToId" TEXT, "forwardedFromId" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "editedAt" TIMESTAMP(3), "deletedAt" TIMESTAMP(3), "pinnedAt" TIMESTAMP(3),
 CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Message_chatId_senderId_clientId_key" ON "Message"("chatId", "senderId", "clientId");
CREATE INDEX "Message_chatId_createdAt_id_idx" ON "Message"("chatId", "createdAt" DESC, "id");
CREATE INDEX "Message_senderId_createdAt_idx" ON "Message"("senderId", "createdAt");
CREATE TABLE "Attachment" (
 "id" TEXT NOT NULL, "messageId" TEXT NOT NULL, "storageName" TEXT NOT NULL, "originalName" VARCHAR(255) NOT NULL,
 "mimeType" VARCHAR(120) NOT NULL, "sizeBytes" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Attachment_messageId_key" ON "Attachment"("messageId");
CREATE UNIQUE INDEX "Attachment_storageName_key" ON "Attachment"("storageName");
CREATE TABLE "Reaction" (
 "id" TEXT NOT NULL, "messageId" TEXT NOT NULL, "userId" TEXT NOT NULL, "emoji" VARCHAR(16) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Reaction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Reaction_messageId_userId_emoji_key" ON "Reaction"("messageId", "userId", "emoji");
CREATE INDEX "Reaction_messageId_idx" ON "Reaction"("messageId");
CREATE TABLE "MessageRead" (
 "id" TEXT NOT NULL, "messageId" TEXT NOT NULL, "userId" TEXT NOT NULL, "deliveredAt" TIMESTAMP(3),
 "readAt" TIMESTAMP(3), CONSTRAINT "MessageRead_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MessageRead_messageId_userId_key" ON "MessageRead"("messageId", "userId");
CREATE INDEX "MessageRead_userId_readAt_idx" ON "MessageRead"("userId", "readAt");
CREATE TABLE "MessageHidden" (
 "id" TEXT NOT NULL, "messageId" TEXT NOT NULL, "userId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "MessageHidden_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MessageHidden_messageId_userId_key" ON "MessageHidden"("messageId", "userId");
CREATE TABLE "Contact" (
 "id" TEXT NOT NULL, "ownerId" TEXT NOT NULL, "targetId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Contact_ownerId_targetId_key" ON "Contact"("ownerId", "targetId");
CREATE INDEX "Contact_ownerId_createdAt_idx" ON "Contact"("ownerId", "createdAt");
CREATE TABLE "Block" (
 "id" TEXT NOT NULL, "blockerId" TEXT NOT NULL, "blockedId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Block_blockerId_blockedId_key" ON "Block"("blockerId", "blockedId");
CREATE INDEX "Block_blockedId_blockerId_idx" ON "Block"("blockedId", "blockerId");
CREATE TABLE "Invitation" (
 "id" TEXT NOT NULL, "chatId" TEXT NOT NULL, "createdById" TEXT NOT NULL, "tokenHash" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
 "maxUses" INTEGER NOT NULL DEFAULT 1, "uses" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");
CREATE INDEX "Invitation_chatId_expiresAt_idx" ON "Invitation"("chatId", "expiresAt");
CREATE TABLE "SavedMessage" (
 "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "messageId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "SavedMessage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SavedMessage_userId_messageId_key" ON "SavedMessage"("userId", "messageId");
CREATE INDEX "SavedMessage_userId_createdAt_idx" ON "SavedMessage"("userId", "createdAt" DESC);
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMember" ADD CONSTRAINT "ChatMember_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMember" ADD CONSTRAINT "ChatMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageRead" ADD CONSTRAINT "MessageRead_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageRead" ADD CONSTRAINT "MessageRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageHidden" ADD CONSTRAINT "MessageHidden_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageHidden" ADD CONSTRAINT "MessageHidden_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Block" ADD CONSTRAINT "Block_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Block" ADD CONSTRAINT "Block_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedMessage" ADD CONSTRAINT "SavedMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedMessage" ADD CONSTRAINT "SavedMessage_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
