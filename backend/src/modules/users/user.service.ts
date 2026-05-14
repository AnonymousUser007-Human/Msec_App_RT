import { prisma } from "../../config/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import type { z } from "zod";
import type { updateMeSchema, listUsersQuerySchema, searchUsersQuerySchema } from "./user.schema.js";

type UpdateMe = z.infer<typeof updateMeSchema>;
type ListQuery = z.infer<typeof listUsersQuerySchema>;
type SearchQuery = z.infer<typeof searchUsersQuerySchema>;

export function toPublicUser(u: {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  avatar: string | null;
  isOnline: boolean;
  lastSeen: Date | null;
  createdAt: Date;
}) {
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

export async function listUsers(excludeUserId: string, query: ListQuery) {
  const skip = (query.page - 1) * query.limit;
  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where: { id: { not: excludeUserId } },
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
      orderBy: { name: "asc" },
      skip,
      take: query.limit,
    }),
    prisma.user.count({ where: { id: { not: excludeUserId } } }),
  ]);
  return { data: rows.map(toPublicUser), page: query.page, limit: query.limit, total };
}

export async function searchUsers(excludeUserId: string, query: SearchQuery) {
  const q = query.q.trim();
  const rows = await prisma.user.findMany({
    where: {
      id: { not: excludeUserId },
      OR: [
        { name: { contains: q } },
        { phone: { contains: q } },
        { email: { contains: q } },
      ],
    },
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
    take: query.limit,
  });
  return rows.map(toPublicUser);
}

export async function getUserById(requesterId: string, id: string) {
  if (id === requesterId) {
    const u = await prisma.user.findUnique({
      where: { id },
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
    });
    if (!u) throw new HttpError(404, "Utilisateur introuvable");
    return toPublicUser(u);
  }
  const u = await prisma.user.findUnique({
    where: { id },
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
  });
  if (!u) throw new HttpError(404, "Utilisateur introuvable");
  return toPublicUser(u);
}

export async function updateMe(userId: string, data: UpdateMe) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.avatar !== undefined ? { avatar: data.avatar } : {}),
    },
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
  });
  return toPublicUser(user);
}
