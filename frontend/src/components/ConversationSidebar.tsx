import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type RefObject } from 'react'
import { toast } from 'sonner'
import type { Socket } from 'socket.io-client'
import { useAuth } from '../context/AuthContext'
import type { Conversation } from '../lib/types'
import { postJson } from '../lib/api'
import { otherMember } from '../lib/conversation'
import { formatListTime, initials, mediaUrl } from '../lib/format'
import { AvatarImage } from './AvatarImage'

type Props = {
  conversations: Conversation[]
  selectedId: string | null
  onSelect: (id: string) => void
  onNewChat: () => void
  socket: Socket | null
  selectedRef: RefObject<string | null>
  /** Après changement de photo de profil : rafraîchir les membres dans les conversations. */
  onProfileUpdated?: () => void
}

export function ConversationSidebar({
  conversations,
  selectedId,
  onSelect,
  onNewChat,
  socket,
  selectedRef,
  onProfileUpdated,
}: Props) {
  const { user, token, logout, uploadAvatar, patchProfile } = useAuth()
  const [typingByConv, setTypingByConv] = useState<Record<string, string>>({})
  const [avatarBusy, setAvatarBusy] = useState(false)
  const avatarFileRef = useRef<HTMLInputElement>(null)

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
    selectedRef.current = id
    void markReadQuiet(id)
    onSelect(id)
  }

  const onAvatarFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setAvatarBusy(true)
    try {
      await uploadAvatar(file)
      toast.success('Photo de profil mise à jour')
      onProfileUpdated?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Envoi de la photo impossible')
    } finally {
      setAvatarBusy(false)
    }
  }

  const onRemoveAvatar = async () => {
    setAvatarBusy(true)
    try {
      await patchProfile({ avatar: null })
      toast.success('Photo retirée')
      onProfileUpdated?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Mise à jour impossible')
    } finally {
      setAvatarBusy(false)
    }
  }

  if (!user) return null

  return (
    <aside className="flex h-full min-h-0 w-full min-w-0 flex-col border-r border-[var(--sc-border)] bg-[var(--sc-sidebar)]">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--sc-border)] px-4 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--sc-text-muted)]">SOBOLO</p>
          <p className="font-display text-lg font-bold text-[var(--sc-text)]">Discussions</p>
        </div>
        <button
          type="button"
          onClick={onNewChat}
          className="cursor-pointer rounded-xl bg-[var(--sc-orange)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--sc-orange-hover)]"
        >
          + Nouveau
        </button>
      </div>

      <div className="shrink-0 border-b border-[var(--sc-border)] px-4 py-3">
        <input
          ref={avatarFileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
          className="hidden"
          onChange={onAvatarFileChange}
        />
        <div className="flex items-start gap-3">
          <button
            type="button"
            disabled={avatarBusy}
            aria-label="Changer la photo de profil"
            title="Changer la photo de profil"
            onClick={() => avatarFileRef.current?.click()}
            className="relative flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-[var(--sc-border)] bg-[var(--sc-input-bg)] text-sm font-bold text-[var(--sc-text)] transition hover:border-[var(--sc-orange)] disabled:cursor-wait disabled:opacity-70"
          >
            <AvatarImage src={user.avatar} alt={user.name} />
            {avatarBusy ? (
              <span className="absolute inset-0 flex items-center justify-center bg-black/35">
                <span
                  className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent"
                  aria-hidden
                />
              </span>
            ) : null}
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-[var(--sc-text)]">{user.name}</p>
            <p className="truncate text-xs text-[var(--sc-text-muted)]">Mon profil · photo : appuyez sur l’image</p>
            {user.avatar ? (
              <button
                type="button"
                disabled={avatarBusy}
                onClick={() => void onRemoveAvatar()}
                className="mt-1 cursor-pointer text-left text-xs text-[var(--sc-text-muted)] underline decoration-[var(--sc-border)] underline-offset-2 transition hover:text-[var(--sc-orange)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Retirer la photo
              </button>
            ) : null}
          </div>
          <button
            type="button"
            onClick={logout}
            className="shrink-0 cursor-pointer rounded-lg border border-[var(--sc-border)] px-2 py-1 text-xs text-[var(--sc-text-muted)] transition hover:border-[var(--sc-orange)] hover:text-[var(--sc-text)]"
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
              const title = c.type === 'group' ? (c.title ?? 'Groupe') : (other?.name ?? 'Conversation')
              const avatar = c.type === 'group' ? c.avatar : other?.avatar
              const typing = typingByConv[c.id]
              const active = c.id === selectedId
              const previewText =
                c.lastMessage?.type === 'audio'
                  ? 'Message vocal'
                  : c.lastMessage?.type === 'video'
                    ? 'Vidéo'
                  : c.lastMessage?.type === 'image'
                    ? 'Image'
                    : c.lastMessage?.type === 'file'
                      ? (c.lastMessage.attachmentName ?? 'Document')
                      : c.lastMessage?.content
              const preview = typing ? (
                <span className="italic text-[var(--sc-blue)]">{typing} écrit…</span>
              ) : c.lastMessage ? (
                <span className="line-clamp-1 text-[var(--sc-text-muted)]">
                  {c.lastMessage.senderId === user.id ? 'Vous : ' : ''}
                  {previewText}
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
                    className={`flex w-full cursor-pointer gap-3 border-l-2 px-4 py-3 text-left transition ${
                      active
                        ? 'border-[var(--sc-orange)] bg-[var(--sc-muted-bg)]'
                        : 'border-transparent hover:bg-[var(--sc-muted-bg)]'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-[var(--sc-border)] bg-[var(--sc-input-bg)] text-sm font-semibold text-[var(--sc-text)]">
                        {c.type === 'group' ? (
                          avatar ? (
                            <img src={mediaUrl(avatar)} alt="" className="h-full w-full object-cover" />
                          ) : (
                            initials(title)
                          )
                        ) : other ? (
                          <AvatarImage src={avatar} alt={other.name} />
                        ) : (
                          '?'
                        )}
                      </div>
                      {c.type !== 'group' && other?.isOnline ? (
                        <span
                          className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[var(--sc-sidebar)] bg-[var(--sc-online)]"
                          title="En ligne"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-medium text-[var(--sc-text)]">{title}</span>
                        <span className="shrink-0 text-[11px] text-[var(--sc-text-muted)]">{formatListTime(timeSrc)}</span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <p className="min-w-0 flex-1 text-sm">
                          {c.type === 'group' && !c.lastMessage ? (
                            <span className="text-[var(--sc-text-muted)]">{c.members.length} membres</span>
                          ) : (
                            preview
                          )}
                        </p>
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
