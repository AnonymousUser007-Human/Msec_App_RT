import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { toast } from 'sonner'
import type { Socket } from 'socket.io-client'
import { useAuth } from '../context/AuthContext'
import type { Conversation, Message } from '../lib/types'
import { deleteJson, getJson, patchJson, postFormData, postJson } from '../lib/api'
import { otherMember } from '../lib/conversation'
import { formatMessageTime, initials, mediaUrl } from '../lib/format'
import { ThemeToggle } from './ThemeToggle'
import { HeaderAlertsMenu } from './HeaderAlertsMenu'
import { AvatarImage } from './AvatarImage'

function fileProvenanceLine(m: Message, viewerId: string): string | null {
  if (m.type === 'text') return null
  if (m.isFirstIntroduction === true) {
    return 'Premier dépôt de ce contenu dans cette discussion.'
  }
  const orig = m.originalSubmitter
  if (orig && orig.id !== m.senderId) {
    return `Même contenu : premier dépôt par ${orig.name}.`
  }
  if (orig && orig.id === m.senderId && m.senderId === viewerId) {
    return 'Vous renvoyez ce contenu — vous en restez le premier déposant dans ce fil.'
  }
  if (orig && orig.id === m.senderId) {
    return `${orig.name} renvoie ce contenu (premier dépôt par cette personne).`
  }
  return null
}

function preferredAudioMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
  return candidates.find((mime) => MediaRecorder.isTypeSupported(mime)) ?? ''
}

function extensionForAudioMime(mime: string): string {
  if (mime.includes('mp4')) return 'm4a'
  if (mime.includes('ogg')) return 'ogg'
  return 'webm'
}

function attachmentDisplayName(m: Message): string {
  if (m.attachmentName) return m.attachmentName
  try {
    const raw = m.content.startsWith('http') ? new URL(m.content).pathname : m.content
    return decodeURIComponent(raw.split('/').pop() || 'document')
  } catch {
    return 'document'
  }
}

function messagePreviewText(m: Pick<Message, 'type' | 'content' | 'attachmentName'>): string {
  if (m.type === 'text') return m.content.length > 80 ? `${m.content.slice(0, 77)}…` : m.content
  if (m.type === 'image') return 'Image'
  if (m.type === 'video') return 'Vidéo'
  if (m.type === 'audio') return 'Message vocal'
  return m.attachmentName ?? 'Document'
}

const QUICK_EMOJIS = ['😀', '😂', '😍', '👍', '🙏', '🔥', '❤️', '🎉', '😢', '😮', '👏', '✅', '✨', '💪', '🤝', '👌']

type Props = {
  conversation: Conversation
  conversations?: Conversation[]
  socket: Socket | null
  onConversationUpdated: () => void
  /** Mobile : retour liste + contrôle thème dans l’en-tête (barre app masquée pendant la conversation). */
  onMobileBack?: () => void
}

export function ChatThread({ conversation, conversations = [], socket, onConversationUpdated, onMobileBack }: Props) {
  const { user, token } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [typingName, setTypingName] = useState<string | null>(null)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null)
  const [editingMessage, setEditingMessage] = useState<Message | null>(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const attachmentRef = useRef<HTMLInputElement | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recordingStreamRef = useRef<MediaStream | null>(null)
  const recordingChunksRef = useRef<BlobPart[]>([])
  const discardRecordingRef = useRef(false)
  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typingStartSent = useRef(false)
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  const [recordingVoice, setRecordingVoice] = useState(false)

  const other = user ? otherMember(conversation, user.id) : undefined
  const forwardTargets = user ? conversations.filter((c) => c.id !== conversation.id) : []
  const threadTitle = conversation.type === 'group' ? (conversation.title ?? 'Groupe') : (other?.name ?? 'Chat')
  const threadAvatar = conversation.type === 'group' ? conversation.avatar : other?.avatar

  const conversationTitle = useCallback(
    (c: Conversation) => {
      if (!user) return 'Conversation'
      return c.type === 'group' ? (c.title ?? 'Groupe') : (otherMember(c, user.id)?.name ?? 'Conversation')
    },
    [user],
  )

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
    setReplyTo(null)
    setForwardingMessage(null)
    setEditingMessage(null)
    setEmojiOpen(false)
  }, [conversation.id])

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
    const onUpdated = (msg: Message) => {
      if (msg.conversationId !== conversation.id) return
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)))
    }
    const onDeleted = (p: { messageId: string; conversationId: string }) => {
      if (p.conversationId !== conversation.id) return
      setMessages((prev) => prev.filter((m) => m.id !== p.messageId))
    }
    socket.on('message:new', onNew)
    socket.on('message:delivered', onDelivered)
    socket.on('message:read', onRead)
    socket.on('message:updated', onUpdated)
    socket.on('message:deleted', onDeleted)
    return () => {
      socket.emit('conversation:leave', { conversationId: conversation.id })
      socket.off('message:new', onNew)
      socket.off('message:delivered', onDelivered)
      socket.off('message:read', onRead)
      socket.off('message:updated', onUpdated)
      socket.off('message:deleted', onDeleted)
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

  useEffect(() => {
    return () => {
      discardRecordingRef.current = true
      if (recorderRef.current?.state === 'recording') {
        recorderRef.current.stop()
      }
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

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
      if (editingMessage) {
        const msg = await patchJson<Message>(`/api/messages/${editingMessage.id}`, { content: text }, token)
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)))
        setInput('')
        setEditingMessage(null)
        requestAnimationFrame(scrollToBottom)
        onConversationUpdated()
        return
      }
      const msg = await postJson<Message>(
        `/api/conversations/${conversation.id}/messages`,
        { content: text, type: 'text', ...(replyTo ? { replyToId: replyTo.id } : {}) },
        token,
      )
      setInput('')
      setReplyTo(null)
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
      requestAnimationFrame(scrollToBottom)
      onConversationUpdated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Envoi du message impossible')
    } finally {
      setSending(false)
    }
  }, [input, token, conversation.id, replyTo, editingMessage, sendTypingStop, scrollToBottom, onConversationUpdated])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    void sendText()
  }

  const sendUpload = useCallback(
    async (file: File, errorMessage: string) => {
      if (!token) return
      setUploadingAttachment(true)
      sendTypingStop()
      try {
        const fd = new FormData()
        fd.append('file', file)
        if (replyTo) fd.append('replyToId', replyTo.id)
        const msg = await postFormData<Message>(
          `/api/conversations/${conversation.id}/messages/upload`,
          fd,
          token,
        )
        setReplyTo(null)
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
        requestAnimationFrame(scrollToBottom)
        onConversationUpdated()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : errorMessage)
      } finally {
        setUploadingAttachment(false)
      }
    },
    [token, conversation.id, replyTo, sendTypingStop, scrollToBottom, onConversationUpdated],
  )

  const onAttachmentFileSelected = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file) return
      await sendUpload(file, 'Envoi du fichier impossible')
    },
    [sendUpload],
  )

  const stopRecordingTracks = useCallback(() => {
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop())
    recordingStreamRef.current = null
  }, [])

  const startVoiceRecording = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast.error("L'enregistrement vocal n'est pas disponible sur ce navigateur")
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = preferredAudioMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recordingChunksRef.current = []
      discardRecordingRef.current = false
      recordingStreamRef.current = stream
      recorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || 'audio/webm'
        const blob = new Blob(recordingChunksRef.current, { type })
        recordingChunksRef.current = []
        stopRecordingTracks()
        recorderRef.current = null
        setRecordingVoice(false)
        if (discardRecordingRef.current) return
        if (blob.size === 0) return
        const file = new File([blob], `voice-${Date.now()}.${extensionForAudioMime(type)}`, { type })
        void sendUpload(file, 'Envoi du vocal impossible')
      }

      recorder.start()
      setRecordingVoice(true)
      sendTypingStop()
    } catch (err) {
      stopRecordingTracks()
      setRecordingVoice(false)
      toast.error(err instanceof Error ? err.message : 'Microphone inaccessible')
    }
  }, [sendTypingStop, sendUpload, stopRecordingTracks])

  const stopVoiceRecording = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') return
    recorder.stop()
  }, [])

  const insertEmoji = useCallback((emoji: string) => {
    const el = textareaRef.current
    const start = el?.selectionStart ?? input.length
    const end = el?.selectionEnd ?? input.length
    const next = `${input.slice(0, start)}${emoji}${input.slice(end)}`
    setInput(next)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(start + emoji.length, start + emoji.length)
    })
  }, [input])

  const forwardToConversation = useCallback(
    async (targetConversationId: string) => {
      if (!token || !forwardingMessage) return
      try {
        await postJson<Message>(`/api/messages/${forwardingMessage.id}/forward`, { conversationId: targetConversationId }, token)
        toast.success('Message transféré')
        setForwardingMessage(null)
        onConversationUpdated()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Transfert impossible')
      }
    },
    [token, forwardingMessage, onConversationUpdated],
  )

  const startEditMessage = useCallback((message: Message) => {
    setEditingMessage(message)
    setReplyTo(null)
    setEmojiOpen(false)
    setInput(message.content)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [])

  const cancelEditMessage = useCallback(() => {
    setEditingMessage(null)
    setInput('')
  }, [])

  const deleteMessageForAll = useCallback(
    async (message: Message) => {
      if (!token) return
      if (!window.confirm('Supprimer ce message pour tout le monde ?')) return
      try {
        await deleteJson(`/api/messages/${message.id}?scope=all`, token)
        setMessages((prev) => prev.filter((m) => m.id !== message.id))
        onConversationUpdated()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Suppression impossible')
      }
    },
    [token, onConversationUpdated],
  )

  const statusLabel = (m: Message, mine: boolean) => {
    if (!mine) return null
    if (m.status === 'read') return 'Lu'
    if (m.status === 'delivered') return 'Reçu'
    return 'Envoyé'
  }

  if (!user) return null

  return (
    <section className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col bg-[var(--sc-thread)]">
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
            {conversation.type === 'group' && !threadAvatar ? (
              initials(threadTitle)
            ) : (
              <AvatarImage src={threadAvatar} alt={threadTitle} />
            )}
            {conversation.type !== 'group' && other?.isOnline ? (
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[var(--sc-header)] bg-[var(--sc-online)]" />
            ) : null}
          </div>
          <div className="min-h-0 min-w-0 flex-1">
            <h2 className="truncate font-display text-base font-semibold leading-tight text-[var(--sc-text)] sm:text-lg">{threadTitle}</h2>
            <p className="truncate text-xs leading-tight text-[var(--sc-text-muted)]">
              {conversation.type === 'group'
                ? `${conversation.members.length} membres`
                : other?.isOnline ? 'En ligne' : other?.lastSeen ? `Vu ${formatMessageTime(other.lastSeen)}` : 'Hors ligne'}
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
          const provenance = fileProvenanceLine(m, user.id)
          const media = mediaUrl(m.content)
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[min(85%,28rem)] rounded-2xl px-3.5 py-2.5 text-sm ${
                  mine
                    ? 'rounded-br-md bg-[var(--sc-bubble-mine)] text-white'
                    : 'rounded-bl-md border border-[var(--sc-border)] bg-[var(--sc-bubble-other)] text-[var(--sc-bubble-other-text)]'
                }`}
              >
                {m.forwardedFrom ? (
                  <p className={`mb-1 text-[11px] font-medium ${mine ? 'text-white/80' : 'text-[var(--sc-text-muted)]'}`}>
                    Transféré
                  </p>
                ) : null}
                {m.replyTo ? (
                  <div
                    className={`mb-2 rounded-xl border-l-4 px-3 py-2 text-xs ${
                      mine
                        ? 'border-white/70 bg-white/15 text-white/90'
                        : 'border-[var(--sc-orange)] bg-[var(--sc-muted-bg)] text-[var(--sc-text-muted)]'
                    }`}
                  >
                    <p className="font-semibold">{m.replyTo.sender?.name ?? 'Message'}</p>
                    <p className="line-clamp-2 break-words">{messagePreviewText(m.replyTo)}</p>
                  </div>
                ) : null}
                {m.type === 'image' ? (
                  <a href={media ?? '#'} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl">
                    <img
                      src={media}
                      alt={attachmentDisplayName(m)}
                      className="max-h-80 w-full max-w-sm object-contain"
                      loading="lazy"
                    />
                  </a>
                ) : m.type === 'video' ? (
                  <div className="w-[min(70vw,22rem)] overflow-hidden rounded-xl">
                    <video controls preload="metadata" src={media} className="max-h-80 w-full bg-black" />
                  </div>
                ) : m.type === 'audio' ? (
                  <div className="min-w-[220px]">
                    <p className={`mb-2 text-xs font-medium ${mine ? 'text-white/90' : 'text-[var(--sc-text-muted)]'}`}>
                      Message vocal
                    </p>
                    <audio controls src={media} className="w-full max-w-64" />
                  </div>
                ) : m.type === 'file' ? (
                  <div className="flex min-w-[220px] items-center gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        mine ? 'bg-white/15 text-white' : 'bg-[var(--sc-muted-bg)] text-[var(--sc-text-muted)]'
                      }`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                        <path d="M14 2v6h6" />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{attachmentDisplayName(m)}</p>
                      <a
                        href={media ?? '#'}
                        download={attachmentDisplayName(m)}
                        target="_blank"
                        rel="noreferrer"
                        className={mine ? 'text-xs text-white/85 underline underline-offset-2' : 'sc-link text-xs'}
                      >
                        Télécharger
                      </a>
                    </div>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                )}
                {provenance ? (
                  <p
                    className={`mt-2 rounded-lg px-2 py-1.5 text-[11px] leading-snug ${
                      mine ? 'bg-white/15 text-white/95' : 'bg-[var(--sc-muted-bg)] text-[var(--sc-text-muted)]'
                    }`}
                  >
                    {provenance}
                  </p>
                ) : null}
                <div
                  className={`mt-2 flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-[10px] ${mine ? 'text-white/80' : 'text-[var(--sc-text-muted)]'}`}
                >
                  <button
                    type="button"
                    onClick={() => setReplyTo(m)}
                    className={mine ? 'cursor-pointer text-white/85 hover:text-white' : 'cursor-pointer hover:text-[var(--sc-orange)]'}
                  >
                    Répondre
                  </button>
                  <button
                    type="button"
                    onClick={() => setForwardingMessage(m)}
                    className={mine ? 'cursor-pointer text-white/85 hover:text-white' : 'cursor-pointer hover:text-[var(--sc-orange)]'}
                  >
                    Transférer
                  </button>
                  {mine && m.type === 'text' ? (
                    <button
                      type="button"
                      onClick={() => startEditMessage(m)}
                      className="cursor-pointer text-white/85 hover:text-white"
                    >
                      Modifier
                    </button>
                  ) : null}
                  {mine ? (
                    <button
                      type="button"
                      onClick={() => void deleteMessageForAll(m)}
                      className="cursor-pointer text-white/85 hover:text-white"
                    >
                      Supprimer
                    </button>
                  ) : null}
                  <span>{formatMessageTime(m.createdAt)}</span>
                  {m.editedAt ? <span>Modifié</span> : null}
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
        className="relative shrink-0 border-t border-[var(--sc-border)] bg-[var(--sc-header)] px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 md:p-3 md:pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        {emojiOpen ? (
          <div className="absolute bottom-full left-3 z-30 mb-2 grid w-[min(20rem,calc(100vw-1.5rem))] grid-cols-8 gap-1 rounded-2xl border border-[var(--sc-border)] bg-[var(--sc-elevated)] p-2 shadow-2xl">
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => insertEmoji(emoji)}
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl text-lg hover:bg-[var(--sc-muted-bg)]"
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : null}
        {editingMessage ? (
          <div className="mb-2 flex items-start gap-2 rounded-2xl border border-[var(--sc-border)] bg-[var(--sc-muted-bg)] px-3 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-[var(--sc-orange)]">Modification du message</p>
              <p className="line-clamp-1 text-[var(--sc-text-muted)]">{messagePreviewText(editingMessage)}</p>
            </div>
            <button
              type="button"
              onClick={cancelEditMessage}
              className="cursor-pointer rounded-lg px-2 py-1 text-xs text-[var(--sc-text-muted)] hover:bg-[var(--sc-input-bg)]"
            >
              Annuler
            </button>
          </div>
        ) : replyTo ? (
          <div className="mb-2 flex items-start gap-2 rounded-2xl border border-[var(--sc-border)] bg-[var(--sc-muted-bg)] px-3 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-[var(--sc-orange)]">
                Réponse à {replyTo.senderId === user.id ? 'vous' : (conversationTitle(conversation) ?? 'ce message')}
              </p>
              <p className="line-clamp-1 text-[var(--sc-text-muted)]">{messagePreviewText(replyTo)}</p>
            </div>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              className="cursor-pointer rounded-lg px-2 py-1 text-xs text-[var(--sc-text-muted)] hover:bg-[var(--sc-input-bg)]"
            >
              Annuler
            </button>
          </div>
        ) : null}
        <div className="flex flex-col gap-2 min-[400px]:flex-row min-[400px]:items-end">
          <div className="flex min-h-0 min-w-0 flex-1 items-end gap-2">
            <input
              ref={attachmentRef}
              type="file"
              className="hidden"
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={onAttachmentFileSelected}
            />
            <button
              type="button"
              disabled={uploadingAttachment || sending || !token || Boolean(editingMessage)}
              onClick={() => attachmentRef.current?.click()}
              aria-label="Joindre un fichier"
              title="Joindre un fichier"
              className="mb-0.5 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-2xl border border-[var(--sc-border)] bg-[var(--sc-input-bg)] text-[var(--sc-text)] transition hover:border-[var(--sc-orange)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploadingAttachment ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--sc-orange)] border-t-transparent" aria-hidden />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              )}
            </button>
            <button
              type="button"
              disabled={uploadingAttachment || sending || !token || Boolean(editingMessage)}
              onClick={() => (recordingVoice ? stopVoiceRecording() : void startVoiceRecording())}
              aria-label={recordingVoice ? "Arrêter l'enregistrement vocal" : 'Enregistrer un vocal'}
              title={recordingVoice ? "Arrêter l'enregistrement vocal" : 'Enregistrer un vocal'}
              className={`mb-0.5 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-2xl border transition disabled:cursor-not-allowed disabled:opacity-50 ${
                recordingVoice
                  ? 'border-red-500 bg-red-500 text-white'
                  : 'border-[var(--sc-border)] bg-[var(--sc-input-bg)] text-[var(--sc-text)] hover:border-[var(--sc-orange)]'
              }`}
            >
              {recordingVoice ? (
                <span className="h-3.5 w-3.5 rounded-sm bg-current" aria-hidden />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <path d="M12 19v3" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={() => setEmojiOpen((v) => !v)}
              aria-label="Ajouter un emoji"
              title="Ajouter un emoji"
              className="mb-0.5 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-2xl border border-[var(--sc-border)] bg-[var(--sc-input-bg)] text-lg text-[var(--sc-text)] transition hover:border-[var(--sc-orange)]"
            >
              ☺
            </button>
            <textarea
              ref={textareaRef}
              className="min-h-[44px] min-w-0 flex-1 resize-none rounded-2xl border border-[var(--sc-border)] bg-[var(--sc-input-bg)] px-3 py-2.5 text-base leading-snug text-[var(--sc-text)] outline-none placeholder:text-[var(--sc-text-muted)] focus:border-[var(--sc-orange)] focus:ring-2 focus:ring-orange-500/25 sm:text-sm"
              rows={1}
              placeholder={recordingVoice ? 'Enregistrement vocal en cours…' : 'Écrivez un message…'}
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={sending || uploadingAttachment || recordingVoice || !input.trim()}
            className="h-11 shrink-0 cursor-pointer rounded-2xl bg-[var(--sc-orange)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--sc-orange-hover)] disabled:cursor-not-allowed disabled:opacity-50 min-[400px]:h-auto min-[400px]:py-2.5"
          >
            {editingMessage ? 'Modifier' : 'Envoyer'}
          </button>
        </div>
      </form>
      {forwardingMessage ? (
        <div className="absolute inset-0 z-40 flex items-end justify-center bg-black/35 p-3 md:items-center">
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-[var(--sc-border)] bg-[var(--sc-elevated)] shadow-2xl">
            <div className="border-b border-[var(--sc-border)] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-display text-base font-semibold text-[var(--sc-text)]">Transférer le message</h3>
                  <p className="truncate text-xs text-[var(--sc-text-muted)]">{messagePreviewText(forwardingMessage)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForwardingMessage(null)}
                  className="cursor-pointer rounded-lg px-2 py-1 text-sm text-[var(--sc-text-muted)] hover:bg-[var(--sc-muted-bg)]"
                >
                  Fermer
                </button>
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto p-2">
              {forwardTargets.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-[var(--sc-text-muted)]">
                  Aucune autre conversation disponible.
                </p>
              ) : (
                forwardTargets.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => void forwardToConversation(c.id)}
                    className="flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 text-left hover:bg-[var(--sc-muted-bg)]"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--sc-border)] bg-[var(--sc-input-bg)] text-sm font-semibold text-[var(--sc-text)]">
                      {initials(conversationTitle(c))}
                    </div>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--sc-text)]">
                      {conversationTitle(c)}
                    </span>
                    <span className="text-xs font-semibold text-[var(--sc-orange)]">Envoyer</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
