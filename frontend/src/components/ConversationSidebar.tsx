import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react'
import type { Socket } from 'socket.io-client'
import { useAuth } from '../context/AuthContext'
import type { Conversation } from '../lib/types'
import { postJson } from '../lib/api'
import { otherMember } from '../lib/conversation'
import { formatListTime, initials, mediaUrl } from '../lib/format'

type Props = {
  conversations: Conversation[]
  selectedId: string | null
  onSelect: (id: string) => void
  onNewChat: () => void
  socket: Socket | null
  selectedRef: RefObject<string | null>
}

export function ConversationSidebar({
  conversations,
  selectedId,
  onSelect,
  onNewChat,
  socket,
  selectedRef,
}: Props) {
  const { user, token, logout } = useAuth()
  const [typingByConv, setTypingByConv] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!socket || !user) return
    const onTypingStart = (p: { conversationId: string; userId: string }) => {
      if (p.userId === user.id) return
      const conv = conversations.find((c) => c.id === p.conversationId)
      const name = conv ? otherMember(conv, user.id)?.name ?? 'Quelqu’un' : 'Quelqu’un'
      setTypingByConv((prev) => ({ ...prev, [p.conversationId]: name }))
    }
    const onTypingStop = (p: { conversationId: string }) => {
      setTypingByConv((prev) => {
        const next = { ...prev }
        delete next[p.conversationId]
        return next
      })
    }
    socket.on('typing:start', onTypingStart)
    socket.on('typing:stop', onTypingStop)
    return () => {
      socket.off('typing:start', onTypingStart)
      socket.off('typing:stop', onTypingStop)
    }
  }, [socket, user, conversations])

  const sorted = useMemo(
    () => [...conversations].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [conversations],
  )

  const markReadQuiet = useCallback(
    async (conversationId: string) => {
      if (!token) return
      try {
        await postJson(`/api/conversations/${conversationId}/read`, {}, token)
      } catch {
        /* silencieux */
      }
    },
    [token],
  )

  const handleSelect = (id: string) => {
    onSelect(id)
    selectedRef.current = id
    void markReadQuiet(id)
  }

  if (!user) return null

  return (
    <aside className="flex h-full min-h-0 w-full max-w-full flex-col border-r border-[var(--sc-border)] bg-[var(--sc-sidebar)] md:max-w-[340px]">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--sc-border)] px-4 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--sc-text-muted)]">SOBOLO</p>
          <p className="font-display text-lg font-bold text-[var(--sc-text)]">Discussions</p>
        </div>
        <button
          type="button"
          onClick={onNewChat}
          className="rounded-xl bg-[var(--sc-orange)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--sc-orange-hover)]"
        >
          + Nouveau
        </button>
      </div>

      <div className="shrink-0 border-b border-[var(--sc-border)] px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--sc-border)] bg-[var(--sc-input-bg)] text-sm font-bold text-[var(--sc-text)]">
            {initials(user.name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-[var(--sc-text)]">{user.name}</p>
            <p className="truncate text-xs text-[var(--sc-text-muted)]">SOBOLO CHAT</p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="rounded-lg border border-[var(--sc-border)] px-2 py-1 text-xs text-[var(--sc-text-muted)] transition hover:border-[var(--sc-orange)] hover:text-[var(--sc-text)]"
          >
            Déconnexion
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {sorted.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-[var(--sc-text-muted)]">
            Aucune conversation. Démarrez un nouveau chat.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--sc-border)]">
            {sorted.map((c) => {
              const other = otherMember(c, user.id)
              const typing = typingByConv[c.id]
              const active = c.id === selectedId
              const preview = typing ? (
                <span className="italic text-[var(--sc-blue)]">{typing} écrit…</span>
              ) : c.lastMessage ? (
                <span className="line-clamp-1 text-[var(--sc-text-muted)]">
                  {c.lastMessage.senderId === user.id ? 'Vous : ' : ''}
                  {c.lastMessage.type !== 'text' ? '[Pièce jointe]' : c.lastMessage.content}
                </span>
              ) : (
                <span className="text-[var(--sc-text-muted)]">Pas encore de message</span>
              )
              const timeSrc = c.lastMessage?.createdAt ?? c.updatedAt
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(c.id)}
                    className={`flex w-full gap-3 border-l-2 px-4 py-3 text-left transition ${
                      active
                        ? 'border-[var(--sc-orange)] bg-[var(--sc-muted-bg)]'
                        : 'border-transparent hover:bg-[var(--sc-muted-bg)]'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-[var(--sc-border)] bg-[var(--sc-input-bg)] text-sm font-semibold text-[var(--sc-text)]">
                        {other ? (
                          other.avatar ? (
                            <img src={mediaUrl(other.avatar)} alt="" className="h-full w-full object-cover" />
                          ) : (
                            initials(other.name)
                          )
                        ) : (
                          '?'
                        )}
                      </div>
                      {other?.isOnline ? (
                        <span
                          className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[var(--sc-sidebar)] bg-[var(--sc-online)]"
                          title="En ligne"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-medium text-[var(--sc-text)]">{other?.name ?? 'Conversation'}</span>
                        <span className="shrink-0 text-[11px] text-[var(--sc-text-muted)]">{formatListTime(timeSrc)}</span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <p className="min-w-0 flex-1 text-sm">{preview}</p>
                        {c.unreadCount > 0 ? (
                          <span className="shrink-0 rounded-full bg-[var(--sc-orange)] px-2 py-0.5 text-[11px] font-semibold text-white">
                            {c.unreadCount > 99 ? '99+' : c.unreadCount}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}
