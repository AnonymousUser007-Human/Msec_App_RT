import type { Conversation, User } from '../lib/types'

export function otherMember(conv: Conversation, myId: string): User | undefined {
  return conv.members.find((m) => m.id !== myId)
}
