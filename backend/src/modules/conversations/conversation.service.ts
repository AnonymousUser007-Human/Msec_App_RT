import { ConversationType, MessageStatus, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import * as userService from "../users/user.service.js";
import { messageToDto, type MessageWithOrigin } from "./message.dto.js";
import type { z } from "zod";
import type { createConversationSchema, listMessagesQuerySchema, createMessageSchema } from "./conversation.schema.js";
import { getSocketIO } from "../../sockets/io.js";
import { buildPushMessageBody, notifyRecipientsOfNewMessage } from "../push/push.service.js";
import { computeFileHashFromMessageContent, sha256File } from "./conversation.fileHash.js";

type CreateConv = z.infer<typeof createConversationSchema>;
type ListMsgQuery = z.infer<typeof listMessagesQuerySchema>;
type CreateMsg = z.infer<typeof createMessageSchema>;

const messageOriginInclude = {
  originalSubmitter: { select: { id: true, name: true, avatar: true } },
} as const;

async function broadcastNewMessage(msg: MessageWithOrigin, userId: string, conversationId: string) {
  const dto = messageToDto(msg);
  const io = getSocketIO();
  io?.to(`conversation:${conversationId}`).emit("message:new", dto);

  const recipients = await prisma.conversationMember.findMany({
    where: { conversationId, userId: { not: userId } },
    select: { userId: true },
  });
  for (const r of recipients) {
    io?.to(`user:${r.userId}`).emit("message:new", dto);
  }

  const senderRow = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  void notifyRecipientsOfNewMessage(
    recipients.map((r) => r.userId),
    {
      senderName: senderRow?.name ?? "Contact",
      conversationId,
      body: buildPushMessageBody(dto),
    },
  ).catch(() => {});

  return dto;
}

async function persistMessageWithOrigin(
  userId: string,
  conversationId: string,
  input: CreateMsg,
  fileMeta?: { contentHash: string },
) {
  await assertConversationMember(userId, conversationId);
  const include = messageOriginInclude;

  if (!fileMeta || input.type === "text") {
    const msg = await prisma.message.create({
      data: {
        conversationId,
        senderId: userId,
        content: input.content,
        type: input.type,
        status: MessageStatus.sent,
      },
      include,
    });
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
    return broadcastNewMessage(msg as MessageWithOrigin, userId, conversationId);
  }

  const msg = await prisma.$transaction(async (tx) => {
    const existing = await tx.conversationFileOrigin.findUnique({
      where: {
        conversationId_contentHash: { conversationId, contentHash: fileMeta.contentHash },
      },
    });
    const originalSubmitterId = existing ? existing.firstSenderId : userId;
    const isFirstIntroductionInConversation = !existing;

    const created = await tx.message.create({
      data: {
        conversationId,
        senderId: userId,
        content: input.content,
        type: input.type,
        status: MessageStatus.sent,
        fileContentHash: fileMeta.contentHash,
        originalSubmitterId,
        isFirstIntroductionInConversation,
      },
      include,
    });

    if (isFirstIntroductionInConversation) {
      await tx.conversationFileOrigin.create({
        data: {
          conversationId,
          contentHash: fileMeta.contentHash,
          firstMessageId: created.id,
          firstSenderId: userId,
        },
      });
    }

    await tx.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    return created;
  });

  return broadcastNewMessage(msg as MessageWithOrigin, userId, conversationId);
}

export async function assertConversationMember(userId: string, conversationId: string) {
  const m = await prisma.conversationMember.findFirst({
    where: { conversationId, userId },
  });
  if (!m) {
    throw new HttpError(403, "Vous n'êtes pas membre de cette conversation");
  }
}

async function findPrivateBetween(userA: string, userB: string) {
  const convs = await prisma.conversation.findMany({
    where: {
      type: ConversationType.private,
      AND: [{ members: { some: { userId: userA } } }, { members: { some: { userId: userB } } }],
    },
    include: { members: true },
  });
  const set = new Set([userA, userB]);
  return convs.find((c) => c.members.length === 2 && c.members.every((m) => set.has(m.userId))) ?? null;
}

export async function createPrivateConversation(requesterId: string, input: CreateConv) {
  if (input.receiverId === requesterId) {
    throw new HttpError(400, "Impossible de créer une conversation avec vous-même");
  }
  const receiver = await prisma.user.findUnique({ where: { id: input.receiverId } });
  if (!receiver) {
    throw new HttpError(404, "Destinataire introuvable");
  }

  const existing = await findPrivateBetween(requesterId, input.receiverId);
  if (existing) {
    return getConversationDto(requesterId, existing.id);
  }

  const conv = await prisma.conversation.create({
    data: {
      type: ConversationType.private,
      members: {
        create: [{ userId: requesterId }, { userId: input.receiverId }],
      },
    },
  });
  return getConversationDto(requesterId, conv.id);
}

async function lastMessageFor(userId: string, conversationId: string) {
  return prisma.message.findFirst({
    where: {
      conversationId,
      deletedAt: null,
      hides: { none: { userId } },
    },
    orderBy: { createdAt: "desc" },
    include: {
      sender: { select: { id: true, name: true, avatar: true } },
      ...messageOriginInclude,
    },
  });
}

async function unreadCountFor(userId: string, conversationId: string) {
  return prisma.message.count({
    where: {
      conversationId,
      senderId: { not: userId },
      status: { not: MessageStatus.read },
      deletedAt: null,
      hides: { none: { userId } },
    },
  });
}

export async function getConversationDto(userId: string, conversationId: string) {
  await assertConversationMember(userId, conversationId);
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
              avatar: true,
              isOnline: true,
              lastSeen: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });
  if (!conv) throw new HttpError(404, "Conversation introuvable");

  const last = await lastMessageFor(userId, conversationId);
  const unread = await unreadCountFor(userId, conversationId);

  return {
    id: conv.id,
    type: conv.type,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
    members: conv.members.map((m) => userService.toPublicUser(m.user)),
    lastMessage: last
      ? {
          ...messageToDto(last as MessageWithOrigin),
          sender: { id: last.sender.id, name: last.sender.name, avatar: last.sender.avatar },
        }
      : null,
    unreadCount: unread,
  };
}

export async function listConversations(userId: string) {
  const convs = await prisma.conversation.findMany({
    where: { members: { some: { userId } } },
    orderBy: { updatedAt: "desc" },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
              avatar: true,
              isOnline: true,
              lastSeen: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });

  const enriched = await Promise.all(
    convs.map(async (c) => {
      const last = await lastMessageFor(userId, c.id);
      const unread = await unreadCountFor(userId, c.id);
      return {
        id: c.id,
        type: c.type,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        members: c.members.map((m) => userService.toPublicUser(m.user)),
        lastMessage: last
          ? {
              ...messageToDto(last as MessageWithOrigin),
              sender: { id: last.sender.id, name: last.sender.name, avatar: last.sender.avatar },
            }
          : null,
        unreadCount: unread,
      };
    }),
  );
  return enriched;
}

export async function listMessages(userId: string, conversationId: string, query: ListMsgQuery) {
  await assertConversationMember(userId, conversationId);

  const take = query.limit + 1;
  const where: Prisma.MessageWhereInput = {
    conversationId,
    deletedAt: null,
    hides: { none: { userId } },
  };
  if (query.cursor) {
    where.createdAt = { lt: new Date(query.cursor) };
  }

  const rows = await prisma.message.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
    include: messageOriginInclude,
  });

  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1]!.createdAt.toISOString() : undefined;

  return {
    data: items.map((row) => messageToDto(row as MessageWithOrigin)).reverse(),
    nextCursor,
  };
}

export async function createMessage(userId: string, conversationId: string, input: CreateMsg) {
  let fileMeta: { contentHash: string } | undefined;
  if (input.type !== "text") {
    const hash = await computeFileHashFromMessageContent(input.content);
    if (hash) fileMeta = { contentHash: hash };
  }
  return persistMessageWithOrigin(userId, conversationId, input, fileMeta);
}

export async function createMessageFromUploadedFile(
  userId: string,
  conversationId: string,
  input: CreateMsg,
  absoluteFilePath: string,
) {
  const contentHash = await sha256File(absoluteFilePath);
  return persistMessageWithOrigin(userId, conversationId, input, { contentHash });
}

export async function markConversationRead(userId: string, conversationId: string) {
  await assertConversationMember(userId, conversationId);

  await prisma.message.updateMany({
    where: {
      conversationId,
      senderId: { not: userId },
      status: { not: MessageStatus.read },
      deletedAt: null,
    },
    data: { status: MessageStatus.read },
  });

  getSocketIO()?.to(`conversation:${conversationId}`).emit("message:read", {
    conversationId,
    readBy: userId,
  });

  return { ok: true };
}

export async function markMessagesDelivered(viewerId: string, conversationId: string, messageIds: string[]) {
  await assertConversationMember(viewerId, conversationId);
  if (messageIds.length === 0) return;

  await prisma.message.updateMany({
    where: {
      id: { in: messageIds },
      conversationId,
      senderId: { not: viewerId },
      status: MessageStatus.sent,
    },
    data: { status: MessageStatus.delivered },
  });

  const io = getSocketIO();
  for (const id of messageIds) {
    io?.to(`conversation:${conversationId}`).emit("message:delivered", {
      messageId: id,
      conversationId,
      status: MessageStatus.delivered,
    });
  }
}

export async function deleteMessage(userId: string, messageId: string, scope: "all" | "me") {
  const msg = await prisma.message.findUnique({ where: { id: messageId } });
  if (!msg || msg.deletedAt) {
    throw new HttpError(404, "Message introuvable");
  }
  await assertConversationMember(userId, msg.conversationId);

  if (scope === "me") {
    await prisma.messageUserHide.upsert({
      where: { messageId_userId: { messageId, userId } },
      create: { messageId, userId },
      update: {},
    });
    return { ok: true };
  }

  if (msg.senderId !== userId) {
    throw new HttpError(403, "Seul l'auteur peut supprimer ce message pour tout le monde");
  }
  await prisma.message.update({
    where: { id: messageId },
    data: { deletedAt: new Date() },
  });
  getSocketIO()?.to(`conversation:${msg.conversationId}`).emit("message:deleted", { messageId, conversationId: msg.conversationId });
  return { ok: true };
}

export async function markMessageReadById(userId: string, messageId: string) {
  const msg = await prisma.message.findUnique({ where: { id: messageId } });
  if (!msg || msg.deletedAt) {
    throw new HttpError(404, "Message introuvable");
  }
  if (msg.senderId === userId) {
    return { ok: true };
  }
  await assertConversationMember(userId, msg.conversationId);

  await prisma.message.update({
    where: { id: messageId },
    data: { status: MessageStatus.read },
  });

  getSocketIO()?.to(`conversation:${msg.conversationId}`).emit("message:read", {
    messageId,
    conversationId: msg.conversationId,
    readBy: userId,
    status: MessageStatus.read,
  });

  return { ok: true };
}
