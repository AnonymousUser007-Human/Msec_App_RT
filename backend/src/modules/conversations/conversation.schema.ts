import { z } from "zod";

export const createConversationSchema = z.object({
  receiverId: z.string().min(1).optional(),
  type: z.enum(["private", "group"]).default("private"),
  title: z.string().min(1).max(120).optional(),
  memberIds: z.array(z.string().min(1)).min(1).max(100).optional(),
});

export const addGroupMembersSchema = z.object({
  memberIds: z.array(z.string().min(1)).min(1).max(100),
});

export const listMessagesQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const createMessageSchema = z.object({
  content: z.string().min(1).max(20000),
  type: z.enum(["text", "image", "audio", "video", "file", "folder"]).default("text"),
  attachmentName: z.string().min(1).max(255).optional(),
  replyToId: z.string().min(1).optional(),
});
