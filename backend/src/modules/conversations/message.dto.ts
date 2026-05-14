import type { Message, MessageStatus, MessageType } from "@prisma/client";

export type MessageWithOrigin = Message & {
  originalSubmitter?: { id: string; name: string; avatar: string | null } | null;
};

export function messageToDto(m: MessageWithOrigin) {
  const sub = m.originalSubmitter;
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
    originalSubmitter:
      sub && typeof sub === "object" && "id" in sub && sub.id
        ? { id: sub.id, name: sub.name, avatar: sub.avatar }
        : null,
    isFirstIntroduction: m.isFirstIntroductionInConversation,
  };
}
