import { useCallback, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { useAuth } from '../context/AuthContext'
import type { Conversation } from '../lib/types'
import { getJson } from '../lib/api'
import { SOCKET_ORIGIN } from '../lib/config'
import { ConversationSidebar } from './ConversationSidebar'
import { ChatThread } from './ChatThread'
import { NewChatModal } from './NewChatModal'
import { ThemeToggle } from './ThemeToggle'

const LOGO_SRC = '/logo.png'

export function ChatShell() {
  const { token } = useAuth()
  const [socket, setSocket] = useState<Socket | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [mobileShowList, setMobileShowList] = useState(true)
  const [logoSrc, setLogoSrc] = useState(LOGO_SRC)
  const selectedRef = useRef<string | null>(null)
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadConversations = useCallback(async () => {
    if (!token) return
    const list = await getJson<Conversation[]>('/api/conversations', token)
    setConversations(list)
  }, [token])

  useEffect(() => {
    selectedRef.current = selectedId
  }, [selectedId])

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
    const onNewMessage = () => {
      scheduleRefetch()
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
        <div className="flex items-center gap-3">
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
            className="shrink-0 rounded-lg border border-[var(--sc-border)] px-2 py-2 text-xs font-medium text-[var(--sc-text)] transition hover:border-[var(--sc-orange)] active:scale-[0.98] min-[380px]:px-3"
            onClick={() => setMobileShowList(true)}
          >
            Liste
          </button>
          <span className="min-w-0 truncate text-center font-display text-sm font-bold tracking-wide text-[var(--sc-text)]">
            SOBOLO CHAT
          </span>
          <div className="flex shrink-0 justify-end">
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
