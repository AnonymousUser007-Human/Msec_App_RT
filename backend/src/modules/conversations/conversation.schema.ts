import { z } from "zod";

export const createConversationSchema = z.object({
  receiverId: z.string().min(1),
});

export const listMessagesQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const createMessageSchema = z.object({
  content: z.string().min(1).max(20000),
  type: z.enum(["text", "image", "audio", "video", "file"]).default("text"),
  attachmentName: z.string().min(1).max(255).optional(),
  replyToId: z.string().min(1).optional(),
});
