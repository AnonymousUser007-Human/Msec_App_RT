import { useCallback, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { toast } from 'sonner'
import { useAuth } from '../context/AuthContext'
import type { Conversation, Message } from '../lib/types'
import { getJson } from '../lib/api'
import { SOCKET_ORIGIN } from '../lib/config'
import { SYSTEM_NOTIFY_KEY } from '../lib/notifyPrefs'
import { ConversationSidebar } from './ConversationSidebar'
import { ChatThread } from './ChatThread'
import { NewChatModal } from './NewChatModal'
import { ThemeToggle } from './ThemeToggle'
import { HeaderAlertsMenu } from './HeaderAlertsMenu'

const LOGO_SRC = '/logo.png'

function messagePreview(m: Message): string {
  if (m.type === 'text') return m.content.length > 100 ? `${m.content.slice(0, 97)}…` : m.content
  if (m.type === 'image') return 'Nouvelle image'
  return 'Nouveau fichier'
}

export function ChatShell() {
  const { token, user } = useAuth()
  const [socket, setSocket] = useState<Socket | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [mobileShowList, setMobileShowList] = useState(true)
  const [logoSrc, setLogoSrc] = useState(LOGO_SRC)
  const selectedRef = useRef<string | null>(null)
  const conversationsRef = useRef<Conversation[]>([])
  const mobileShowListRef = useRef(true)
  const userRef = useRef(user)
  const recentToastMsgIds = useRef<Set<string>>(new Set())
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('openConversation')
    if (!id) return
    setSelectedId(id)
    setMobileShowList(false)
    const u = new URL(window.location.href)
    u.searchParams.delete('openConversation')
    window.history.replaceState({}, '', `${u.pathname}${u.search}${u.hash}`)
  }, [])

  const loadConversations = useCallback(async () => {
    if (!token) return
    const list = await getJson<Conversation[]>('/api/conversations', token)
    setConversations(list)
  }, [token])

  useEffect(() => {
    selectedRef.current = selectedId
  }, [selectedId])

  useEffect(() => {
    conversationsRef.current = conversations
  }, [conversations])

  useEffect(() => {
    mobileShowListRef.current = mobileShowList
  }, [mobileShowList])

  useEffect(() => {
    userRef.current = user
  }, [user])

  useEffect(() => {
    void loadConversations()
  }, [loadConversations])

  useEffect(() => {
    if (!token) {
      setSocket(null)
      return
    }
    const s = io(SOCKET_ORIGIN, {
      auth: { token },
      transports: ['websocket', 'polling'],
    })
    setSocket(s)

    const scheduleRefetch = () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current)
      refetchTimer.current = setTimeout(() => {
        void loadConversations()
      }, 200)
    }

    const onOnline = (p: { userId: string }) => {
      setConversations((prev) =>
        prev.map((c) => ({
          ...c,
          members: c.members.map((m) => (m.id === p.userId ? { ...m, isOnline: true } : m)),
        })),
      )
    }
    const onOffline = (p: { userId: string }) => {
      setConversations((prev) =>
        prev.map((c) => ({
          ...c,
          members: c.members.map((m) => (m.id === p.userId ? { ...m, isOnline: false } : m)),
        })),
      )
    }
    const onNewMessage = (dto: Message) => {
      scheduleRefetch()

      const u = userRef.current
      if (!u || dto.senderId === u.id) return

      if (recentToastMsgIds.current.has(dto.id)) return
      recentToastMsgIds.current.add(dto.id)
      setTimeout(() => recentToastMsgIds.current.delete(dto.id), 2000)

      const conv = conversationsRef.current.find((c) => c.id === dto.conversationId)
      const senderName = conv?.members.find((m) => m.id === dto.senderId)?.name ?? 'Contact'
      const preview = messagePreview(dto)

      const listOpen = mobileShowListRef.current
      const selected = selectedRef.current
      const tabVisible = typeof document !== 'undefined' && document.visibilityState === 'visible'
      const viewingThisThread =
        !listOpen && selected === dto.conversationId && tabVisible

      if (viewingThisThread) return

      toast.message(senderName, {
        description: preview,
        action: {
          label: 'Ouvrir',
          onClick: () => {
            setSelectedId(dto.conversationId)
            setMobileShowList(false)
            setConversations((prev) =>
              prev.map((c) => (c.id === dto.conversationId ? { ...c, unreadCount: 0 } : c)),
            )
          },
        },
      })

      try {
        if (
          typeof localStorage !== 'undefined' &&
          localStorage.getItem(SYSTEM_NOTIFY_KEY) === '1' &&
          typeof document !== 'undefined' &&
          document.hidden &&
          typeof Notification !== 'undefined' &&
          Notification.permission === 'granted'
        ) {
          new Notification(senderName, { body: preview, icon: '/icon.png', tag: dto.id })
        }
      } catch {
        /* ignore */
      }
    }

    s.on('user:online', onOnline)
    s.on('user:offline', onOffline)
    s.on('message:new', onNewMessage)

    return () => {
      s.off('user:online', onOnline)
      s.off('user:offline', onOffline)
      s.off('message:new', onNewMessage)
      if (refetchTimer.current) clearTimeout(refetchTimer.current)
      s.disconnect()
      setSocket(null)
    }
  }, [token, loadConversations])

  const selected = conversations.find((c) => c.id === selectedId) ?? null

  const handleSelect = (id: string) => {
    setSelectedId(id)
    setMobileShowList(false)
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)))
  }

  const handleCreated = (id: string) => {
    void loadConversations().then(() => {
      handleSelect(id)
    })
  }

  return (
    <div className="flex h-dvh min-h-0 max-h-dvh flex-col overflow-hidden bg-[var(--sc-page)] text-[var(--sc-text)]">
      <header className="hidden shrink-0 items-center justify-between border-b border-[var(--sc-border)] bg-[var(--sc-header)] px-6 py-3 md:flex">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full ring-1 ring-[var(--sc-border)]">
            <img
              src={logoSrc}
              alt=""
              width={40}
              height={40}
              className="h-full w-full object-cover"
              onError={() => setLogoSrc('/logo.svg')}
            />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-[var(--sc-text-muted)]">Messagerie</p>
            <h1 className="font-display text-xl font-bold tracking-tight text-[var(--sc-text)]">SOBOLO CHAT</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {token ? <HeaderAlertsMenu token={token} /> : null}
          <ThemeToggle compact />
          <p className="max-w-xs text-right text-xs text-[var(--sc-text-muted)]">Temps réel · Discussions privées</p>
        </div>
      </header>

      <header
        className={`relative z-30 flex shrink-0 items-center border-b border-[var(--sc-border)] bg-[var(--sc-header)] pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] md:hidden ${
          selectedId && !mobileShowList ? 'hidden' : ''
        }`}
      >
        <div className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
          <button
            type="button"
            className="shrink-0 cursor-pointer rounded-lg border border-[var(--sc-border)] px-2 py-2 text-xs font-medium text-[var(--sc-text)] transition hover:border-[var(--sc-orange)] active:scale-[0.98] min-[380px]:px-3"
            onClick={() => setMobileShowList(true)}
          >
            Liste
          </button>
          <span className="min-w-0 truncate text-center font-display text-sm font-bold tracking-wide text-[var(--sc-text)]">
            SOBOLO CHAT
          </span>
          <div className="flex shrink-0 items-center justify-end gap-1.5">
            {token ? <HeaderAlertsMenu token={token} compact /> : null}
            <ThemeToggle compact />
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div
          className={`flex h-full min-h-0 w-full min-w-0 flex-col md:max-w-[min(100%,380px)] lg:max-w-[400px] ${mobileShowList ? '' : 'hidden'} md:flex`}
        >
          <ConversationSidebar
            conversations={conversations}
            selectedId={selectedId}
            onSelect={handleSelect}
            onNewChat={() => setModalOpen(true)}
            socket={socket}
            selectedRef={selectedRef}
          />
        </div>

        <div className={`flex h-full min-h-0 min-w-0 flex-1 flex-col ${mobileShowList ? 'hidden' : ''} md:flex`}>
          {selected ? (
            <ChatThread
              conversation={selected}
              socket={socket}
              onConversationUpdated={() => void loadConversations()}
              onMobileBack={() => setMobileShowList(true)}
            />
          ) : (
            <div className="hidden flex-1 flex-col items-center justify-center gap-4 bg-[var(--sc-thread)] px-6 text-center md:flex">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full ring-1 ring-[var(--sc-border)]">
                <img
                  src={logoSrc}
                  alt=""
                  width={80}
                  height={80}
                  className="h-full w-full object-cover"
                  onError={() => setLogoSrc('/logo.svg')}
                />
              </div>
              <p className="font-display text-2xl font-bold text-[var(--sc-text)]">SOBOLO CHAT</p>
              <p className="max-w-sm text-sm text-[var(--sc-text-muted)]">
                Choisissez une conversation ou démarrez un nouveau chat pour commencer.
              </p>
            </div>
          )}
        </div>
      </div>

      <NewChatModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={handleCreated} />
    </div>
  )
}
