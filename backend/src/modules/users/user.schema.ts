import { z } from "zod";

const avatarValue = z
  .string()
  .max(2048)
  .refine(
    (s) => /^https?:\/\//i.test(s) || s.startsWith("/uploads/"),
    "URL absolue ou chemin /uploads/… attendu",
  );

export const updateMeSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  avatar: z.union([avatarValue, z.null()]).optional(),
});

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const searchUsersQuerySchema = z.object({
  q: z.string().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
