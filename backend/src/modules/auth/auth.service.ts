import { prisma } from "../../config/prisma.js";
import { hashPassword, verifyPassword } from "../../utils/password.js";
import { signAccessToken } from "../../utils/jwt.js";
import { HttpError } from "../../utils/httpError.js";
import { registerSchema, loginSchema } from "./auth.schema.js";
import type { z } from "zod";

type RegisterInput = z.infer<typeof registerSchema>;
type LoginInput = z.infer<typeof loginSchema>;

function publicUser(u: { id: string; name: string; phone: string | null; email: string | null; avatar: string | null; isOnline: boolean; lastSeen: Date | null; createdAt: Date }) {
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    email: u.email,
    avatar: u.avatar,
    isOnline: u.isOnline,
    lastSeen: u.lastSeen,
    createdAt: u.createdAt,
  };
}

export async function register(input: RegisterInput) {
  const email = input.email?.toLowerCase().trim() ?? undefined;
  const phone = input.phone?.trim() ?? undefined;

  const existing = await prisma.user.findFirst({
    where: {
      OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
    },
  });
  if (existing) {
    throw new HttpError(409, "Un compte existe déjà avec ce téléphone ou cet email");
  }

  const password = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      name: input.name.trim(),
      phone: phone ?? null,
      email: email ?? null,
      password,
    },
  });

  const token = signAccessToken(user.id);
  return { token, user: publicUser(user) };
}

export async function login(input: LoginInput) {
  const email = input.email?.toLowerCase().trim();
  const phone = input.phone?.trim();

  const user = await prisma.user.findFirst({
    where: email ? { email } : { phone: phone! },
  });
  if (!user) {
    throw new HttpError(401, "Identifiants incorrects");
  }
  const ok = await verifyPassword(input.password, user.password);
  if (!ok) {
    throw new HttpError(401, "Identifiants incorrects");
  }

  const token = signAccessToken(user.id);
  return { token, user: publicUser(user) };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new HttpError(404, "Utilisateur introuvable");
  }
  return publicUser(user);
}
