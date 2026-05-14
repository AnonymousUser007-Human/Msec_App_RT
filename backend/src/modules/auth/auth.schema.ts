import { z } from "zod";

export const registerSchema = z
  .object({
    name: z.string().min(1).max(120),
    phone: z.string().min(5).max(32).optional(),
    email: z.string().email().max(255).optional(),
    password: z.string().min(6).max(128),
  })
  .refine((d) => d.phone || d.email, { message: "Téléphone ou email requis" });

export const loginSchema = z
  .object({
    phone: z.string().min(5).max(32).optional(),
    email: z.string().email().max(255).optional(),
    password: z.string().min(1),
  })
  .refine((d) => d.phone || d.email, { message: "Téléphone ou email requis" });
