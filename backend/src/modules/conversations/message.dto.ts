import type { Message, MessageStatus, MessageType } from "@prisma/client";

export function messageToDto(m: Message) {
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId,
    content: m.content,
    type: m.type as MessageType,
    status: m.status as MessageStatus,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    deletedAt: m.deletedAt,
  };
}
