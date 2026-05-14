import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import type { Socket } from 'socket.io-client'
import { useAuth } from '../context/AuthContext'
import type { Conversation, Message } from '../lib/types'
import { getJson, postJson } from '../lib/api'
import { otherMember } from '../lib/conversation'
import { formatMessageTime, initials, mediaUrl } from '../lib/format'
import { ThemeToggle } from './ThemeToggle'
import { HeaderAlertsMenu } from './HeaderAlertsMenu'

type Props = {
  conversation: Conversation
  socket: Socket | null
  onConversationUpdated: () => void
  /** Mobile : retour liste + contrôle thème dans l’en-tête (barre app masquée pendant la conversation). */
  onMobileBack?: () => void
}

export function ChatThread({ conversation, socket, onConversationUpdated, onMobileBack }: Props) {
  const { user, token } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [typingName, setTypingName] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typingStartSent = useRef(false)

  const other = user ? otherMember(conversation, user.id) : undefined

  /** Hauteur auto type WhatsApp : une ligne au départ, puis croissance jusqu’au plafond. */
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    const minPx = 44
    const maxPx = 168
    el.style.height = 'auto'
    const full = el.scrollHeight
    const target = Math.min(Math.max(full, minPx), maxPx)
    el.style.height = `${target}px`
    el.style.overflowY = full > maxPx ? 'auto' : 'hidden'
  }, [input, conversation.id])

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const loadMessages = useCallback(async () => {
    if (!token) return
    const res = await getJson<{ data: Message[]; nextCursor?: string }>(
      `/api/conversations/${conversation.id}/messages?limit=50`,
      token,
    )
    setMessages(res.data)
    requestAnimationFrame(scrollToBottom)
  }, [conversation.id, token, scrollToBottom])

  useEffect(() => {
    void loadMessages()
  }, [loadMessages])

  useEffect(() => {
    if (!token) return
    void postJson(`/api/conversations/${conversation.id}/read`, {}, token).catch(() => {})
  }, [conversation.id, token])

  useEffect(() => {
    if (!socket) return
    const join = () => {
      socket.emit('conversation:join', { conversationId: conversation.id }, () => {})
    }
    join()
    const onNew = (msg: Message) => {
      if (msg.conversationId !== conversation.id) return
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev
        return [...prev, msg]
      })
      if (user && msg.senderId !== user.id) {
        socket.emit('message:delivered', {
          conversationId: conversation.id,
          messageIds: [msg.id],
        })
        void postJson(`/api/conversations/${conversation.id}/read`, {}, token).catch(() => {})
      }
      requestAnimationFrame(scrollToBottom)
      onConversationUpdated()
    }
    const onDelivered = (p: { messageId: string; conversationId: string; status: string }) => {
      if (p.conversationId !== conversation.id) return
      setMessages((prev) =>
        prev.map((m) => (m.id === p.messageId ? { ...m, status: p.status as Message['status'] } : m)),
      )
    }
    const onRead = (p: { messageId?: string; conversationId: string }) => {
      if (p.conversationId !== conversation.id) return
      if (p.messageId) {
        setMessages((prev) =>
          prev.map((m) => (m.id === p.messageId ? { ...m, status: 'read' } : m)),
        )
        return
      }
      setMessages((prev) =>
        prev.map((m) => (m.senderId === user?.id ? { ...m, status: 'read' as const } : m)),
      )
    }
    socket.on('message:new', onNew)
    socket.on('message:delivered', onDelivered)
    socket.on('message:read', onRead)
    return () => {
      socket.emit('conversation:leave', { conversationId: conversation.id })
      socket.off('message:new', onNew)
      socket.off('message:delivered', onDelivered)
      socket.off('message:read', onRead)
    }
  }, [socket, conversation.id, user, token, scrollToBottom, onConversationUpdated])

  useEffect(() => {
    if (!socket || !user) return
    const onTypingStart = (p: { conversationId: string; userId: string }) => {
      if (p.conversationId !== conversation.id || p.userId === user.id) return
      setTypingName(other?.name ?? 'Interlocuteur')
    }
    const onTypingStop = (p: { conversationId: string }) => {
      if (p.conversationId !== conversation.id) return
      setTypingName(null)
    }
    socket.on('typing:start', onTypingStart)
    socket.on('typing:stop', onTypingStop)
    return () => {
      socket.off('typing:start', onTypingStart)
      socket.off('typing:stop', onTypingStop)
    }
  }, [socket, conversation.id, user, other?.name])

  const sendTypingStop = useCallback(() => {
    if (!socket) return
    if (typingStartSent.current) {
      socket.emit('typing:stop', { conversationId: conversation.id })
      typingStartSent.current = false
    }
  }, [socket, conversation.id])

  const onInputChange = (v: string) => {
    setInput(v)
    if (!socket) return
    if (!typingStartSent.current) {
      socket.emit('typing:start', { conversationId: conversation.id })
      typingStartSent.current = true
    }
    if (typingStopTimer.current) clearTimeout(typingStopTimer.current)
    typingStopTimer.current = setTimeout(() => {
      sendTypingStop()
    }, 1800)
  }

  const sendText = useCallback(async () => {
    const text = input.trim()
    if (!text || !token) return
    sendTypingStop()
    setSending(true)
    try {
      const msg = await postJson<Message>(`/api/conversations/${conversation.id}/messages`, { content: text, type: 'text' }, token)
      setInput('')
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
      requestAnimationFrame(scrollToBottom)
      onConversationUpdated()
    } finally {
      setSending(false)
    }
  }, [input, token, conversation.id, sendTypingStop, scrollToBottom, onConversationUpdated])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    void sendText()
  }

  const statusLabel = (m: Message, mine: boolean) => {
    if (!mine) return null
    if (m.status === 'read') return 'Lu'
    if (m.status === 'delivered') return 'Reçu'
    return 'Envoyé'
  }

  if (!user) return null

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-[var(--sc-thread)]">
      <header className="relative z-20 shrink-0 border-b border-[var(--sc-border)] bg-[var(--sc-header)] pt-[max(0.75rem,env(safe-area-inset-top))] md:pt-3">
        <div className="flex h-14 min-h-14 max-h-14 w-full items-center gap-2 px-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] md:h-16 md:min-h-16 md:max-h-16 md:gap-3">
          {onMobileBack ? (
            <button
              type="button"
              className="shrink-0 cursor-pointer rounded-lg border border-[var(--sc-border)] px-2 py-2 text-xs font-medium text-[var(--sc-text)] transition hover:border-[var(--sc-orange)] active:scale-[0.98] md:hidden min-[380px]:px-3"
              onClick={onMobileBack}
            >
              Liste
            </button>
          ) : null}
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--sc-border)] bg-[var(--sc-input-bg)] text-sm font-semibold text-[var(--sc-text)]">
            {other?.avatar ? (
              <img src={mediaUrl(other.avatar)} alt="" className="h-full w-full object-cover" />
            ) : (
              initials(other?.name ?? '?')
            )}
            {other?.isOnline ? (
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[var(--sc-header)] bg-[var(--sc-online)]" />
            ) : null}
          </div>
          <div className="min-h-0 min-w-0 flex-1">
            <h2 className="truncate font-display text-base font-semibold leading-tight text-[var(--sc-text)] sm:text-lg">{other?.name ?? 'Chat'}</h2>
            <p className="truncate text-xs leading-tight text-[var(--sc-text-muted)]">
              {other?.isOnline ? 'En ligne' : other?.lastSeen ? `Vu ${formatMessageTime(other.lastSeen)}` : 'Hors ligne'}
            </p>
          </div>
          {onMobileBack ? (
            <div className="ml-auto flex shrink-0 items-center gap-1.5 md:hidden">
              {token ? <HeaderAlertsMenu token={token} compact /> : null}
              <ThemeToggle compact />
            </div>
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-y-contain px-4 pb-2 pt-4 md:pb-4">
        {messages.map((m) => {
          const mine = m.senderId === user.id
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[min(85%,28rem)] rounded-2xl px-3.5 py-2.5 text-sm ${
                  mine
                    ? 'rounded-br-md bg-[var(--sc-bubble-mine)] text-white'
                    : 'rounded-bl-md border border-[var(--sc-border)] bg-[var(--sc-bubble-other)] text-[var(--sc-bubble-other-text)]'
                }`}
              >
                {m.type !== 'text' ? (
                  <a
                    href={mediaUrl(m.content) ?? '#'}
                    target="_blank"
                    rel="noreferrer"
                    className={
                      mine
                        ? 'cursor-pointer text-white underline decoration-white/70 underline-offset-2 hover:opacity-90'
                        : 'sc-link cursor-pointer'
                    }
                  >
                    Ouvrir la pièce jointe
                  </a>
                ) : (
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                )}
                <div
                  className={`mt-1 flex items-center justify-end gap-2 text-[10px] ${mine ? 'text-white/80' : 'text-[var(--sc-text-muted)]'}`}
                >
                  <span>{formatMessageTime(m.createdAt)}</span>
                  {statusLabel(m, mine) ? <span>{statusLabel(m, mine)}</span> : null}
                </div>
              </div>
            </div>
          )
        })}
        {typingName ? (
          <p className="text-center text-xs italic text-[var(--sc-blue)]">{typingName} écrit…</p>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="shrink-0 border-t border-[var(--sc-border)] bg-[var(--sc-header)] px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 md:p-3 md:pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex flex-col gap-2 min-[400px]:flex-row min-[400px]:items-end">
          <textarea
            ref={textareaRef}
            className="min-h-[44px] w-full flex-1 resize-none rounded-2xl border border-[var(--sc-border)] bg-[var(--sc-input-bg)] px-3 py-2.5 text-base leading-snug text-[var(--sc-text)] outline-none placeholder:text-[var(--sc-text-muted)] focus:border-[var(--sc-orange)] focus:ring-2 focus:ring-orange-500/25 sm:text-sm"
            rows={1}
            placeholder="Écrivez un message…"
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="h-11 shrink-0 cursor-pointer rounded-2xl bg-[var(--sc-orange)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--sc-orange-hover)] disabled:cursor-not-allowed disabled:opacity-50 min-[400px]:h-auto min-[400px]:py-2.5"
          >
            Envoyer
          </button>
        </div>
      </form>
    </section>
  )
}
