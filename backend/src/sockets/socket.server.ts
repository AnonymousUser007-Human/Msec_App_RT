import type { Server, Socket } from "socket.io";
import { z } from "zod";
import { verifyAccessToken } from "../utils/jwt.js";
import { prisma } from "../config/prisma.js";
import { trackSocketConnect, trackSocketDisconnect } from "./presence.js";
import * as convService from "../modules/conversations/conversation.service.js";
import { createMessageSchema } from "../modules/conversations/conversation.schema.js";

const joinSchema = z.object({ conversationId: z.string().min(1) });
const typingSchema = joinSchema;
const sendSchema = z.object({
  conversationId: z.string().min(1),
  content: z.string().min(1).max(20000),
  type: z.enum(["text", "image", "audio", "video", "file", "folder"]).default("text"),
  replyToId: z.string().min(1).optional(),
});
const deliveredSchema = z.object({
  conversationId: z.string().min(1),
  messageIds: z.array(z.string().min(1)).min(1),
});
const liveRoomSchema = z.object({ roomId: z.string().min(1) });
const liveTargetSchema = liveRoomSchema.extend({ targetUserId: z.string().min(1) });
const liveSignalSchema = liveRoomSchema.extend({
  targetUserId: z.string().min(1).optional(),
  signal: z.unknown(),
});
const liveChatSchema = liveRoomSchema.extend({
  text: z.string().min(1).max(500),
});
const liveTapSchema = liveRoomSchema.extend({
  count: z.number().int().min(1).max(50).default(1),
});

export function registerSocketHandlers(io: Server): void {
  io.use((socket, next) => {
    try {
      const raw =
        (socket.handshake.auth as { token?: string } | undefined)?.token ??
        (typeof socket.handshake.headers.authorization === "string" && socket.handshake.headers.authorization.startsWith("Bearer ")
          ? socket.handshake.headers.authorization.slice("Bearer ".length)
          : undefined);
      if (!raw) {
        next(new Error("Unauthorized"));
        return;
      }
      const { sub } = verifyAccessToken(raw.trim());
      socket.data.userId = sub;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket: Socket) => {
    void handleConnection(io, socket);
  });
}

async function handleConnection(io: Server, socket: Socket): Promise<void> {
  const userId = socket.data.userId as string;
  const userExists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!userExists) {
    socket.disconnect(true);
    return;
  }

  const first = trackSocketConnect(userId, socket.id);
  socket.join(`user:${userId}`);

  if (first) {
    const r = await prisma.user.updateMany({
      where: { id: userId },
      data: { isOnline: true, lastSeen: new Date() },
    });
    if (r.count > 0) {
      socket.broadcast.emit("user:online", { userId });
    }
  }

  socket.on("conversation:join", (payload: unknown, ack?: (r: unknown) => void) => {
    void (async () => {
      try {
        const { conversationId } = joinSchema.parse(payload);
        await convService.assertConversationMember(userId, conversationId);
        await socket.join(`conversation:${conversationId}`);
        ack?.({ ok: true });
      } catch (e) {
        ack?.({ ok: false, error: e instanceof Error ? e.message : "Erreur" });
      }
    })();
  });

  socket.on("conversation:leave", (payload: unknown) => {
    try {
      const { conversationId } = joinSchema.parse(payload);
      void socket.leave(`conversation:${conversationId}`);
    } catch {
      /* ignore */
    }
  });

  socket.on("message:send", (payload: unknown, ack?: (r: unknown) => void) => {
    void (async () => {
      try {
        const body = sendSchema.parse(payload);
        const parsed = createMessageSchema.parse({ content: body.content, type: body.type, replyToId: body.replyToId });
        const msg = await convService.createMessage(userId, body.conversationId, parsed);
        ack?.({ ok: true, message: msg });
      } catch (e) {
        ack?.({ ok: false, error: e instanceof Error ? e.message : "Erreur" });
      }
    })();
  });

  socket.on("message:delivered", (payload: unknown) => {
    void (async () => {
      try {
        const { conversationId, messageIds } = deliveredSchema.parse(payload);
        await convService.markMessagesDelivered(userId, conversationId, messageIds);
      } catch {
        /* ignore */
      }
    })();
  });

  socket.on("typing:start", (payload: unknown) => {
    try {
      const { conversationId } = typingSchema.parse(payload);
      socket.to(`conversation:${conversationId}`).emit("typing:start", { conversationId, userId });
    } catch {
      /* ignore */
    }
  });

  socket.on("typing:stop", (payload: unknown) => {
    try {
      const { conversationId } = typingSchema.parse(payload);
      socket.to(`conversation:${conversationId}`).emit("typing:stop", { conversationId, userId });
    } catch {
      /* ignore */
    }
  });

  socket.on("live:join", (payload: unknown, ack?: (r: unknown) => void) => {
    void (async () => {
      try {
        const { roomId } = liveRoomSchema.parse(payload);
        const room = await prisma.liveRoom.findUnique({ where: { id: roomId }, select: { isActive: true } });
        if (!room?.isActive) throw new Error("Live introuvable ou terminé");
        await prisma.liveParticipant.upsert({
          where: { roomId_userId: { roomId, userId } },
          create: { roomId, userId },
          update: { leftAt: null },
        });
        const viewer = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, name: true, avatar: true },
        });
        await socket.join(`live:${roomId}`);
        socket.to(`live:${roomId}`).emit("live:viewer_joined", { roomId, userId, user: viewer });
        ack?.({ ok: true });
      } catch (e) {
        ack?.({ ok: false, error: e instanceof Error ? e.message : "Erreur" });
      }
    })();
  });

  socket.on("live:leave", (payload: unknown) => {
    void (async () => {
      try {
        const { roomId } = liveRoomSchema.parse(payload);
        await prisma.liveParticipant.updateMany({ where: { roomId, userId }, data: { leftAt: new Date() } });
        await socket.leave(`live:${roomId}`);
        socket.to(`live:${roomId}`).emit("live:viewer_left", { roomId, userId });
      } catch {
        /* ignore */
      }
    })();
  });

  socket.on("live:signal", (payload: unknown) => {
    try {
      const { roomId, targetUserId, signal } = liveSignalSchema.parse(payload);
      const event = { roomId, fromUserId: userId, signal };
      if (targetUserId) {
        io.to(`user:${targetUserId}`).emit("live:signal", event);
        return;
      }
      socket.to(`live:${roomId}`).emit("live:signal", event);
    } catch {
      /* ignore */
    }
  });

  socket.on("live:invite", (payload: unknown, ack?: (r: unknown) => void) => {
    void (async () => {
      try {
        const { roomId, targetUserId } = liveTargetSchema.parse(payload);
        const room = await prisma.liveRoom.findUnique({
          where: { id: roomId },
          select: { id: true, title: true, hostId: true, isActive: true, host: { select: { id: true, name: true, avatar: true } } },
        });
        if (!room?.isActive) throw new Error("Live introuvable ou terminé");
        if (room.hostId !== userId) throw new Error("Seul l’hôte peut inviter");
        io.to(`user:${targetUserId}`).emit("live:invite", {
          roomId,
          roomTitle: room.title,
          fromUserId: userId,
          fromUser: room.host,
        });
        ack?.({ ok: true });
      } catch (e) {
        ack?.({ ok: false, error: e instanceof Error ? e.message : "Erreur" });
      }
    })();
  });

  socket.on("live:tap", (payload: unknown) => {
    try {
      const { roomId, count } = liveTapSchema.parse(payload);
      socket.to(`live:${roomId}`).emit("live:tap", { roomId, userId, count });
    } catch {
      /* ignore */
    }
  });

  socket.on("live:raise_request", (payload: unknown, ack?: (r: unknown) => void) => {
    void (async () => {
      try {
        const { roomId } = liveRoomSchema.parse(payload);
        const room = await prisma.liveRoom.findUnique({ where: { id: roomId }, select: { hostId: true, isActive: true } });
        if (!room?.isActive) throw new Error("Live introuvable ou terminé");
        if (room.hostId === userId) throw new Error("Vous êtes déjà l’hôte");
        const requester = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, avatar: true } });
        if (!requester) throw new Error("Utilisateur introuvable");
        io.to(`user:${room.hostId}`).emit("live:raise_request", { roomId, userId, user: requester });
        ack?.({ ok: true });
      } catch (e) {
        ack?.({ ok: false, error: e instanceof Error ? e.message : "Erreur" });
      }
    })();
  });

  socket.on("live:raise_approve", (payload: unknown, ack?: (r: unknown) => void) => {
    void (async () => {
      try {
        const { roomId, targetUserId } = liveTargetSchema.parse(payload);
        const room = await prisma.liveRoom.findUnique({ where: { id: roomId }, select: { hostId: true, isActive: true } });
        if (!room?.isActive) throw new Error("Live introuvable ou terminé");
        if (room.hostId !== userId) throw new Error("Seul l’hôte peut faire monter quelqu’un");
        const cohost = await prisma.user.findUnique({
          where: { id: targetUserId },
          select: { id: true, name: true, avatar: true },
        });
        io.to(`user:${targetUserId}`).emit("live:raise_approved", { roomId, hostId: userId });
        io.to(`live:${roomId}`).emit("live:cohost_started", { roomId, userId: targetUserId, user: cohost });
        ack?.({ ok: true });
      } catch (e) {
        ack?.({ ok: false, error: e instanceof Error ? e.message : "Erreur" });
      }
    })();
  });

  socket.on("live:chat", (payload: unknown) => {
    try {
      const { roomId, text } = liveChatSchema.parse(payload);
      io.to(`live:${roomId}`).emit("live:chat", {
        roomId,
        userId,
        text,
        createdAt: new Date().toISOString(),
      });
    } catch {
      /* ignore */
    }
  });

  socket.on("disconnect", async () => {
    const fullyLeft = trackSocketDisconnect(userId, socket.id);
    if (fullyLeft) {
      const r = await prisma.user.updateMany({
        where: { id: userId },
        data: { isOnline: false, lastSeen: new Date() },
      });
      if (r.count > 0) {
        socket.broadcast.emit("user:offline", { userId });
      }
    }
  });
}
