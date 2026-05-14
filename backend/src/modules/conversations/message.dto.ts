import type { Message, MessageStatus, MessageType } from "@prisma/client";

export type MessageWithOrigin = Message & {
  originalSubmitter?: { id: string; name: string; avatar: string | null } | null;
  replyTo?: (Pick<Message, "id" | "senderId" | "content" | "type" | "attachmentName"> & {
    sender?: { id: string; name: string; avatar: string | null } | null;
  }) | null;
  forwardedFrom?: (Pick<Message, "id" | "senderId" | "content" | "type" | "attachmentName"> & {
    sender?: { id: string; name: string; avatar: string | null } | null;
  }) | null;
};

export function messageToDto(m: MessageWithOrigin) {
  const sub = m.originalSubmitter;
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId,
    content: m.content,
    attachmentName: m.attachmentName,
    type: m.type as MessageType,
    status: m.status as MessageStatus,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    editedAt: m.editedAt,
    deletedAt: m.deletedAt,
    originalSubmitter:
      sub && typeof sub === "object" && "id" in sub && sub.id
        ? { id: sub.id, name: sub.name, avatar: sub.avatar }
        : null,
    replyTo: m.replyTo
      ? {
          id: m.replyTo.id,
          senderId: m.replyTo.senderId,
          content: m.replyTo.content,
          type: m.replyTo.type,
          attachmentName: m.replyTo.attachmentName,
          sender: m.replyTo.sender
            ? { id: m.replyTo.sender.id, name: m.replyTo.sender.name, avatar: m.replyTo.sender.avatar }
            : null,
        }
      : null,
    forwardedFrom: m.forwardedFrom
      ? {
          id: m.forwardedFrom.id,
          senderId: m.forwardedFrom.senderId,
          content: m.forwardedFrom.content,
          type: m.forwardedFrom.type,
          attachmentName: m.forwardedFrom.attachmentName,
          sender: m.forwardedFrom.sender
            ? { id: m.forwardedFrom.sender.id, name: m.forwardedFrom.sender.name, avatar: m.forwardedFrom.sender.avatar }
            : null,
        }
      : null,
    isFirstIntroduction: m.isFirstIntroductionInConversation,
  };
}
