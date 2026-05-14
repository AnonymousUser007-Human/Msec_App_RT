import { prisma } from "../../config/prisma.js";
import { HttpError } from "../../utils/httpError.js";

function roomToDto(row: {
  id: string;
  hostId: string;
  title: string;
  isActive: boolean;
  startedAt: Date;
  endedAt: Date | null;
  host: { id: string; name: string; avatar: string | null };
  participants: { leftAt: Date | null }[];
}) {
  return {
    id: row.id,
    hostId: row.hostId,
    title: row.title,
    isActive: row.isActive,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    host: row.host,
    viewerCount: row.participants.filter((p) => !p.leftAt).length,
  };
}

const roomInclude = {
  host: { select: { id: true, name: true, avatar: true } },
  participants: { select: { leftAt: true } },
} as const;

export async function listActiveRooms() {
  const rows = await prisma.liveRoom.findMany({
    where: { isActive: true },
    orderBy: { startedAt: "desc" },
    include: roomInclude,
  });
  return rows.map(roomToDto);
}

export async function startRoom(hostId: string, title: string) {
  await prisma.liveRoom.updateMany({
    where: { hostId, isActive: true },
    data: { isActive: false, endedAt: new Date() },
  });
  const row = await prisma.liveRoom.create({
    data: {
      hostId,
      title: title.trim(),
      participants: { create: { userId: hostId } },
    },
    include: roomInclude,
  });
  return roomToDto(row);
}

export async function joinRoom(userId: string, roomId: string) {
  const room = await prisma.liveRoom.findUnique({ where: { id: roomId }, select: { isActive: true } });
  if (!room || !room.isActive) throw new HttpError(404, "Live introuvable ou terminé");
  await prisma.liveParticipant.upsert({
    where: { roomId_userId: { roomId, userId } },
    create: { roomId, userId },
    update: { leftAt: null },
  });
  return { ok: true };
}

export async function leaveRoom(userId: string, roomId: string) {
  await prisma.liveParticipant.updateMany({
    where: { roomId, userId },
    data: { leftAt: new Date() },
  });
  return { ok: true };
}

export async function endRoom(userId: string, roomId: string) {
  const room = await prisma.liveRoom.findUnique({ where: { id: roomId }, select: { hostId: true } });
  if (!room) throw new HttpError(404, "Live introuvable");
  if (room.hostId !== userId) throw new HttpError(403, "Seul l’hôte peut terminer ce live");
  await prisma.liveRoom.update({
    where: { id: roomId },
    data: { isActive: false, endedAt: new Date() },
  });
  await prisma.liveParticipant.updateMany({
    where: { roomId, leftAt: null },
    data: { leftAt: new Date() },
  });
  return { ok: true };
}
