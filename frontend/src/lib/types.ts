export type User = {
  id: string
  name: string
  phone: string | null
  email: string | null
  avatar: string | null
  isOnline: boolean
  lastSeen: string | null
  createdAt: string
}

export type MessageKind = 'text' | 'image' | 'audio' | 'video' | 'file'
export type MessageStatus = 'sent' | 'delivered' | 'read'

export type MessageReference = {
  id: string
  senderId: string
  content: string
  type: MessageKind
  attachmentName: string | null
  sender: { id: string; name: string; avatar: string | null } | null
}

export type Message = {
  id: string
  conversationId: string
  senderId: string
  content: string
  type: MessageKind
  attachmentName: string | null
  status: MessageStatus
  createdAt: string
  updatedAt: string
  editedAt: string | null
  deletedAt: string | null
  /** Premier utilisateur ayant introduit ce fichier (même contenu binaire) dans la conversation. */
  originalSubmitter?: { id: string; name: string; avatar: string | null } | null
  replyTo?: MessageReference | null
  forwardedFrom?: MessageReference | null
  /** True si ce message est le tout premier dépôt de ce fichier dans ce fil. */
  isFirstIntroduction?: boolean
}

export type LastMessage = Message & {
  sender: { id: string; name: string; avatar: string | null }
}

export type Conversation = {
  id: string
  type: 'private' | 'group'
  title: string | null
  avatar: string | null
  createdById: string | null
  createdAt: string
  updatedAt: string
  members: User[]
  lastMessage: LastMessage | null
  unreadCount: number
}

export type StatusPost = {
  id: string
  userId: string
  content: string
  type: MessageKind
  attachmentName: string | null
  expiresAt: string
  createdAt: string
  updatedAt: string
  user: { id: string; name: string; avatar: string | null }
}

export type LiveRoom = {
  id: string
  hostId: string
  title: string
  isActive: boolean
  startedAt: string
  endedAt: string | null
  host: { id: string; name: string; avatar: string | null }
  viewerCount: number
}
