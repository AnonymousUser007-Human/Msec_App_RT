import { MessageType } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { HttpError } from "../../utils/httpError.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function statusToDto(row: {
  id: string;
  userId: string;
  content: string;
  type: MessageType;
  attachmentName: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  user: { id: string; name: string; avatar: string | null };
}) {
  return {
    id: row.id,
    userId: row.userId,
    content: row.content,
    type: row.type,
    attachmentName: row.attachmentName,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    user: row.user,
  };
}

export async function listActiveStatuses() {
  const rows = await prisma.statusPost.findMany({
    where: { expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, name: true, avatar: true } } },
  });
  return rows.map(statusToDto);
}

export async function createTextStatus(userId: string, content: string) {
  const row = await prisma.statusPost.create({
    data: {
      userId,
      content,
      type: MessageType.text,
      expiresAt: new Date(Date.now() + DAY_MS),
    },
    include: { user: { select: { id: true, name: true, avatar: true } } },
  });
  return statusToDto(row);
}

export async function createMediaStatus(
  userId: string,
  input: { content: string; type: MessageType; attachmentName?: string },
) {
  const row = await prisma.statusPost.create({
    data: {
      userId,
      content: input.content,
      type: input.type,
      attachmentName: input.attachmentName,
      expiresAt: new Date(Date.now() + DAY_MS),
    },
    include: { user: { select: { id: true, name: true, avatar: true } } },
  });
  return statusToDto(row);
}

export async function deleteStatus(userId: string, statusId: string) {
  const row = await prisma.statusPost.findUnique({ where: { id: statusId }, select: { userId: true } });
  if (!row) throw new HttpError(404, "Statut introuvable");
  if (row.userId !== userId) throw new HttpError(403, "Vous ne pouvez supprimer que vos statuts");
  await prisma.statusPost.delete({ where: { id: statusId } });
  return { ok: true };
}

export async function updateTextStatus(userId: string, statusId: string, content: string) {
  const row = await prisma.statusPost.findUnique({
    where: { id: statusId },
    select: { userId: true, type: true },
  });
  if (!row) throw new HttpError(404, "Statut introuvable");
  if (row.userId !== userId) throw new HttpError(403, "Vous ne pouvez modifier que vos statuts");
  if (row.type !== MessageType.text) throw new HttpError(400, "Seuls les statuts texte peuvent être modifiés");
  const updated = await prisma.statusPost.update({
    where: { id: statusId },
    data: { content: content.trim() },
    include: { user: { select: { id: true, name: true, avatar: true } } },
  });
  return statusToDto(updated);
}
