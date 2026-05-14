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

export type MessageStatus = 'sent' | 'delivered' | 'read'

export type Message = {
  id: string
  conversationId: string
  senderId: string
  content: string
  type: 'text' | 'image' | 'file'
  status: MessageStatus
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export type LastMessage = Message & {
  sender: { id: string; name: string; avatar: string | null }
}

export type Conversation = {
  id: string
  type: 'private' | 'group'
  createdAt: string
  updatedAt: string
  members: User[]
  lastMessage: LastMessage | null
  unreadCount: number
}
