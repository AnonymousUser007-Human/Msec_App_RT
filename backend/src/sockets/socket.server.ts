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
  type: z.enum(["text", "image", "audio", "video", "file"]).default("text"),
  replyToId: z.string().min(1).optional(),
});
const deliveredSchema = z.object({
  conversationId: z.string().min(1),
  messageIds: z.array(z.string().min(1)).min(1),
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
