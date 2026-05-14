import { z } from "zod";

export const updateMeSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  avatar: z.string().url().max(2048).optional().nullable(),
});

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const searchUsersQuerySchema = z.object({
  q: z.string().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
