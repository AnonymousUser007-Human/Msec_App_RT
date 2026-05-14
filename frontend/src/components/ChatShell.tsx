import { useCallback, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { toast } from 'sonner'
import { useAuth } from '../context/AuthContext'
import type { Conversation, LiveRoom, Message, StatusPost } from '../lib/types'
import { deleteJson, getJson, patchJson, postFormData, postJson } from '../lib/api'
import { SOCKET_ORIGIN } from '../lib/config'
import { SYSTEM_NOTIFY_KEY } from '../lib/notifyPrefs'
import { mediaUrl } from '../lib/format'
import { useLayoutViewportHeight } from '../hooks/useLayoutViewportHeight'
import { ConversationSidebar } from './ConversationSidebar'
import { ChatThread } from './ChatThread'
import { NewChatModal } from './NewChatModal'
import { ThemeToggle } from './ThemeToggle'
import { HeaderAlertsMenu } from './HeaderAlertsMenu'

const LOGO_SRC = '/logo.png'
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
}

type LiveSignal =
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'candidate'; candidate: RTCIceCandidateInit }

function messagePreview(m: Message): string {
  if (m.type === 'text') return m.content.length > 100 ? `${m.content.slice(0, 97)}…` : m.content
  if (m.type === 'image') return 'Nouvelle image'
  return 'Nouveau fichier'
}

function attachVideoStream(video: HTMLVideoElement | null, stream: MediaStream | null) {
  if (!video) return
  if (video.srcObject !== stream) {
    video.srcObject = stream
  }
  if (stream) {
    void video.play().catch(() => {})
  }
}

export function ChatShell() {
  const layoutViewportHeight = useLayoutViewportHeight()
  const { token, user } = useAuth()
  const [socket, setSocket] = useState<Socket | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [socialPanel, setSocialPanel] = useState<'status' | 'live' | null>(null)
  const [statuses, setStatuses] = useState<StatusPost[]>([])
  const [statusText, setStatusText] = useState('')
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null)
  const [liveRooms, setLiveRooms] = useState<LiveRoom[]>([])
  const [liveTitle, setLiveTitle] = useState('')
  const [joinedLiveId, setJoinedLiveId] = useState<string | null>(null)
  const [hostingLiveId, setHostingLiveId] = useState<string | null>(null)
  const [localLiveStream, setLocalLiveStream] = useState<MediaStream | null>(null)
  const [remoteLiveStream, setRemoteLiveStream] = useState<MediaStream | null>(null)
  const [mobileShowList, setMobileShowList] = useState(true)
  const [logoSrc, setLogoSrc] = useState(LOGO_SRC)
  const selectedRef = useRef<string | null>(null)
  const conversationsRef = useRef<Conversation[]>([])
  const mobileShowListRef = useRef(true)
  const userRef = useRef(user)
  const recentToastMsgIds = useRef<Set<string>>(new Set())
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const localLiveVideoRef = useRef<HTMLVideoElement | null>(null)
  const remoteLiveVideoRef = useRef<HTMLVideoElement | null>(null)
  const livePeerConnectionsRef = useRef<Record<string, RTCPeerConnection>>({})
  const pendingIceCandidatesRef = useRef<Record<string, RTCIceCandidateInit[]>>({})
  const localLiveStreamRef = useRef<MediaStream | null>(null)
  const joinedLiveIdRef = useRef<string | null>(null)
  const hostingLiveIdRef = useRef<string | null>(null)

  const loadStatuses = useCallback(async () => {
    if (!token) return
    setStatuses(await getJson<StatusPost[]>('/api/statuses', token))
  }, [token])

  const loadLiveRooms = useCallback(async () => {
    if (!token) return
    setLiveRooms(await getJson<LiveRoom[]>('/api/live', token))
  }, [token])

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
    joinedLiveIdRef.current = joinedLiveId
  }, [joinedLiveId])

  useEffect(() => {
    hostingLiveIdRef.current = hostingLiveId
  }, [hostingLiveId])

  useEffect(() => {
    localLiveStreamRef.current = localLiveStream
    attachVideoStream(localLiveVideoRef.current, localLiveStream)
  }, [localLiveStream, joinedLiveId, hostingLiveId, socialPanel])

  useEffect(() => {
    attachVideoStream(remoteLiveVideoRef.current, remoteLiveStream)
  }, [remoteLiveStream, joinedLiveId, socialPanel])

  useEffect(() => {
    void loadConversations()
  }, [loadConversations])

  useEffect(() => {
    if (socialPanel === 'status') void loadStatuses()
    if (socialPanel === 'live') void loadLiveRooms()
  }, [socialPanel, loadStatuses, loadLiveRooms])

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
    s.on('message:updated', scheduleRefetch)
    s.on('message:deleted', scheduleRefetch)

    return () => {
      s.off('user:online', onOnline)
      s.off('user:offline', onOffline)
      s.off('message:new', onNewMessage)
      s.off('message:updated', scheduleRefetch)
      s.off('message:deleted', scheduleRefetch)
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

  const closeLivePeers = useCallback(() => {
    Object.values(livePeerConnectionsRef.current).forEach((pc) => pc.close())
    livePeerConnectionsRef.current = {}
    pendingIceCandidatesRef.current = {}
    setRemoteLiveStream(null)
  }, [])

  const stopLocalLiveStream = useCallback(() => {
    localLiveStreamRef.current?.getTracks().forEach((track) => track.stop())
    localLiveStreamRef.current = null
    setLocalLiveStream(null)
  }, [])

  const resetLiveMedia = useCallback(() => {
    closeLivePeers()
    stopLocalLiveStream()
  }, [closeLivePeers, stopLocalLiveStream])

  const getLocalLiveStream = useCallback(async () => {
    if (localLiveStreamRef.current) return localLiveStreamRef.current
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Caméra non disponible sur ce navigateur')
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: true,
    })
    localLiveStreamRef.current = stream
    attachVideoStream(localLiveVideoRef.current, stream)
    setLocalLiveStream(stream)
    return stream
  }, [])

  const attachLocalLiveVideo = useCallback((video: HTMLVideoElement | null) => {
    localLiveVideoRef.current = video
    attachVideoStream(video, localLiveStreamRef.current)
  }, [])

  const attachRemoteLiveVideo = useCallback(
    (video: HTMLVideoElement | null) => {
      remoteLiveVideoRef.current = video
      attachVideoStream(video, remoteLiveStream)
    },
    [remoteLiveStream],
  )

  const createLivePeerConnection = useCallback(
    (roomId: string, remoteUserId: string, stream?: MediaStream) => {
      livePeerConnectionsRef.current[remoteUserId]?.close()
      const pc = new RTCPeerConnection(RTC_CONFIG)
      livePeerConnectionsRef.current[remoteUserId] = pc

      stream?.getTracks().forEach((track) => pc.addTrack(track, stream))

      pc.onicecandidate = (event) => {
        if (!event.candidate) return
        socket?.emit('live:signal', {
          roomId,
          targetUserId: remoteUserId,
          signal: { type: 'candidate', candidate: event.candidate.toJSON() } satisfies LiveSignal,
        })
      }
      pc.ontrack = (event) => {
        setRemoteLiveStream(event.streams[0] ?? null)
      }
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed' || pc.connectionState === 'disconnected') {
          delete livePeerConnectionsRef.current[remoteUserId]
        }
      }

      return pc
    },
    [socket],
  )

  const flushPendingIceCandidates = useCallback(async (remoteUserId: string, pc: RTCPeerConnection) => {
    const queued = pendingIceCandidatesRef.current[remoteUserId] ?? []
    if (queued.length === 0) return
    pendingIceCandidatesRef.current[remoteUserId] = []
    for (const candidate of queued) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate))
    }
  }, [])

  useEffect(() => {
    if (!socket) return

    const onViewerJoined = async (p: { roomId: string; userId: string }) => {
      if (!userRef.current || p.userId === userRef.current.id) return
      if (hostingLiveIdRef.current !== p.roomId) return
      const stream = localLiveStreamRef.current
      if (!stream) return
      try {
        const pc = createLivePeerConnection(p.roomId, p.userId, stream)
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        socket.emit('live:signal', {
          roomId: p.roomId,
          targetUserId: p.userId,
          signal: { type: 'offer', sdp: offer } satisfies LiveSignal,
        })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Connexion live impossible')
      }
    }

    const onViewerLeft = (p: { roomId: string; userId: string }) => {
      livePeerConnectionsRef.current[p.userId]?.close()
      delete livePeerConnectionsRef.current[p.userId]
      if (joinedLiveIdRef.current === p.roomId && hostingLiveIdRef.current !== p.roomId) {
        setRemoteLiveStream(null)
      }
    }

    const onLiveSignal = async (p: { roomId: string; fromUserId: string; signal: LiveSignal }) => {
      if (joinedLiveIdRef.current !== p.roomId && hostingLiveIdRef.current !== p.roomId) return
      try {
        let pc = livePeerConnectionsRef.current[p.fromUserId]
        if (!pc) {
          pc = createLivePeerConnection(p.roomId, p.fromUserId, localLiveStreamRef.current ?? undefined)
        }

        if (p.signal.type === 'offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(p.signal.sdp))
          await flushPendingIceCandidates(p.fromUserId, pc)
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          socket.emit('live:signal', {
            roomId: p.roomId,
            targetUserId: p.fromUserId,
            signal: { type: 'answer', sdp: answer } satisfies LiveSignal,
          })
          return
        }

        if (p.signal.type === 'answer') {
          await pc.setRemoteDescription(new RTCSessionDescription(p.signal.sdp))
          await flushPendingIceCandidates(p.fromUserId, pc)
          return
        }

        if (p.signal.type === 'candidate') {
          if (!pc.remoteDescription) {
            pendingIceCandidatesRef.current[p.fromUserId] = [
              ...(pendingIceCandidatesRef.current[p.fromUserId] ?? []),
              p.signal.candidate,
            ]
            return
          }
          await pc.addIceCandidate(new RTCIceCandidate(p.signal.candidate))
        }
      } catch (err) {
        console.warn('[live] signal failed', err)
      }
    }

    socket.on('live:viewer_joined', onViewerJoined)
    socket.on('live:viewer_left', onViewerLeft)
    socket.on('live:signal', onLiveSignal)
    return () => {
      socket.off('live:viewer_joined', onViewerJoined)
      socket.off('live:viewer_left', onViewerLeft)
      socket.off('live:signal', onLiveSignal)
    }
  }, [socket, createLivePeerConnection, flushPendingIceCandidates])

  useEffect(() => {
    return () => resetLiveMedia()
  }, [resetLiveMedia])

  const createTextStatus = async () => {
    if (!token || !statusText.trim()) return
    if (editingStatusId) {
      await patchJson<StatusPost>('/api/statuses/' + editingStatusId, { content: statusText.trim() }, token)
      setEditingStatusId(null)
      setStatusText('')
      await loadStatuses()
      return
    }
    await postJson<StatusPost>('/api/statuses', { content: statusText.trim() }, token)
    setStatusText('')
    await loadStatuses()
  }

  const startEditStatus = (status: StatusPost) => {
    setEditingStatusId(status.id)
    setStatusText(status.content)
  }

  const deleteStatus = async (statusId: string) => {
    if (!token) return
    if (!window.confirm('Supprimer ce statut ?')) return
    await deleteJson('/api/statuses/' + statusId, token)
    if (editingStatusId === statusId) {
      setEditingStatusId(null)
      setStatusText('')
    }
    await loadStatuses()
  }

  const uploadStatus = async (file: File | undefined) => {
    if (!token || !file) return
    const fd = new FormData()
    fd.append('file', file)
    await postFormData<StatusPost>('/api/statuses/upload', fd, token)
    await loadStatuses()
  }

  const startLive = async () => {
    if (!token || !liveTitle.trim()) return
    try {
      closeLivePeers()
      await getLocalLiveStream()
      const room = await postJson<LiveRoom>('/api/live', { title: liveTitle.trim() }, token)
      setLiveTitle('')
      hostingLiveIdRef.current = room.id
      joinedLiveIdRef.current = room.id
      setHostingLiveId(room.id)
      setJoinedLiveId(room.id)
      socket?.emit('live:join', { roomId: room.id })
      await loadLiveRooms()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossible de démarrer le live')
      resetLiveMedia()
    }
  }

  const joinLive = async (roomId: string) => {
    if (!token) return
    closeLivePeers()
    setRemoteLiveStream(null)
    await postJson('/api/live/' + roomId + '/join', {}, token)
    hostingLiveIdRef.current = null
    joinedLiveIdRef.current = roomId
    setHostingLiveId(null)
    setJoinedLiveId(roomId)
    socket?.emit('live:join', { roomId })
    await loadLiveRooms()
  }

  const leaveLive = async (roomId: string) => {
    if (!token) return
    await postJson('/api/live/' + roomId + '/leave', {}, token)
    joinedLiveIdRef.current = null
    if (hostingLiveIdRef.current === roomId) hostingLiveIdRef.current = null
    setJoinedLiveId(null)
    if (hostingLiveId === roomId) setHostingLiveId(null)
    socket?.emit('live:leave', { roomId })
    resetLiveMedia()
    await loadLiveRooms()
  }

  const endLive = async (roomId: string) => {
    if (!token) return
    await postJson('/api/live/' + roomId + '/end', {}, token)
    if (joinedLiveIdRef.current === roomId) joinedLiveIdRef.current = null
    if (hostingLiveIdRef.current === roomId) hostingLiveIdRef.current = null
    setJoinedLiveId((id) => (id === roomId ? null : id))
    setHostingLiveId((id) => (id === roomId ? null : id))
    socket?.emit('live:leave', { roomId })
    resetLiveMedia()
    await loadLiveRooms()
  }

  return (
    <div
      className="flex min-h-0 flex-col overflow-hidden bg-[var(--sc-page)] text-[var(--sc-text)]"
      style={{ height: layoutViewportHeight, maxHeight: layoutViewportHeight }}
    >
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
          <button
            type="button"
            onClick={() => setSocialPanel('status')}
            className="cursor-pointer rounded-xl border border-[var(--sc-border)] px-3 py-1.5 text-xs font-semibold text-[var(--sc-text-muted)] transition hover:border-[var(--sc-orange)] hover:text-[var(--sc-text)]"
          >
            Statuts
          </button>
          <button
            type="button"
            onClick={() => setSocialPanel('live')}
            className="cursor-pointer rounded-xl bg-[var(--sc-orange)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--sc-orange-hover)]"
          >
            Live
          </button>
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
            <button
              type="button"
              onClick={() => setSocialPanel('status')}
              className="cursor-pointer rounded-lg border border-[var(--sc-border)] px-2 py-1 text-xs text-[var(--sc-text-muted)]"
            >
              Statuts
            </button>
            <button
              type="button"
              onClick={() => setSocialPanel('live')}
              className="cursor-pointer rounded-lg bg-[var(--sc-orange)] px-2 py-1 text-xs font-semibold text-white"
            >
              Live
            </button>
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
            onProfileUpdated={() => void loadConversations()}
          />
        </div>

        <div className={`flex h-full min-h-0 min-w-0 flex-1 flex-col ${mobileShowList ? 'hidden' : ''} md:flex`}>
          {selected ? (
            <ChatThread
              conversation={selected}
              conversations={conversations}
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

      {socialPanel ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 md:items-center">
          <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-[var(--sc-border)] bg-[var(--sc-elevated)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--sc-border)] px-4 py-3">
              <h3 className="font-display text-lg font-semibold text-[var(--sc-text)]">
                {socialPanel === 'status' ? 'Statuts' : 'Live'}
              </h3>
              <button
                type="button"
                onClick={() => setSocialPanel(null)}
                className="cursor-pointer rounded-lg px-2 py-1 text-sm text-[var(--sc-text-muted)] hover:bg-[var(--sc-muted-bg)]"
              >
                Fermer
              </button>
            </div>

            {socialPanel === 'status' ? (
              <div className="space-y-3 p-4">
                <div className="rounded-2xl border border-[var(--sc-border)] bg-[var(--sc-muted-bg)] p-3">
                  <textarea
                    value={statusText}
                    onChange={(e) => setStatusText(e.target.value)}
                    placeholder="Écrire un statut..."
                    className="min-h-20 w-full resize-none rounded-xl border border-[var(--sc-border)] bg-[var(--sc-input-bg)] px-3 py-2 text-sm outline-none"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void createTextStatus()}
                      disabled={!statusText.trim()}
                      className="cursor-pointer rounded-xl bg-[var(--sc-orange)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {editingStatusId ? 'Modifier' : 'Publier'}
                    </button>
                    {editingStatusId ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingStatusId(null)
                          setStatusText('')
                        }}
                        className="cursor-pointer rounded-xl border border-[var(--sc-border)] px-3 py-2 text-sm text-[var(--sc-text-muted)] hover:border-[var(--sc-orange)]"
                      >
                        Annuler
                      </button>
                    ) : null}
                    <label className="cursor-pointer rounded-xl border border-[var(--sc-border)] px-3 py-2 text-sm text-[var(--sc-text-muted)] hover:border-[var(--sc-orange)]">
                      Média
                      <input
                        type="file"
                        accept="image/*,video/*,audio/*"
                        className="hidden"
                        onChange={(e) => void uploadStatus(e.target.files?.[0])}
                      />
                    </label>
                  </div>
                </div>
                <div className="max-h-96 space-y-2 overflow-y-auto">
                  {statuses.length === 0 ? (
                    <p className="py-8 text-center text-sm text-[var(--sc-text-muted)]">Aucun statut actif.</p>
                  ) : (
                    statuses.map((s) => (
                      <div key={s.id} className="rounded-2xl border border-[var(--sc-border)] p-3">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-semibold text-[var(--sc-text)]">{s.user.name}</p>
                          {s.userId === user?.id ? (
                            <div className="flex shrink-0 gap-2 text-xs">
                              {s.type === 'text' ? (
                                <button
                                  type="button"
                                  onClick={() => startEditStatus(s)}
                                  className="cursor-pointer text-[var(--sc-orange)]"
                                >
                                  Modifier
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => void deleteStatus(s.id)}
                                className="cursor-pointer text-red-500"
                              >
                                Supprimer
                              </button>
                            </div>
                          ) : null}
                        </div>
                        {s.type === 'text' ? (
                          <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--sc-text)]">{s.content}</p>
                        ) : s.type === 'image' ? (
                          <img src={mediaUrl(s.content)} alt="" className="mt-2 max-h-72 w-full rounded-xl object-contain" />
                        ) : s.type === 'video' ? (
                          <video controls src={mediaUrl(s.content)} className="mt-2 max-h-72 w-full rounded-xl bg-black" />
                        ) : (
                          <audio controls src={mediaUrl(s.content)} className="mt-2 w-full" />
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3 p-4">
                <div className="rounded-2xl border border-[var(--sc-border)] bg-[var(--sc-muted-bg)] p-3">
                  <input
                    value={liveTitle}
                    onChange={(e) => setLiveTitle(e.target.value)}
                    placeholder="Titre du live..."
                    className="w-full rounded-xl border border-[var(--sc-border)] bg-[var(--sc-input-bg)] px-3 py-2 text-sm outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void startLive()}
                    disabled={!liveTitle.trim()}
                    className="mt-2 cursor-pointer rounded-xl bg-[var(--sc-orange)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Démarrer un live
                  </button>
                </div>
                <div className="max-h-96 space-y-2 overflow-y-auto">
                  {liveRooms.length === 0 ? (
                    <p className="py-8 text-center text-sm text-[var(--sc-text-muted)]">Aucun live actif.</p>
                  ) : (
                    liveRooms.map((room) => (
                      <div key={room.id} className="rounded-2xl border border-[var(--sc-border)] p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-[var(--sc-text)]">{room.title}</p>
                            <p className="text-xs text-[var(--sc-text-muted)]">
                              {room.host.name} · {room.viewerCount} spectateur(s)
                            </p>
                          </div>
                          {room.hostId === user?.id ? (
                            <button type="button" onClick={() => void endLive(room.id)} className="cursor-pointer rounded-xl border border-red-500 px-3 py-1.5 text-xs font-semibold text-red-500">
                              Terminer
                            </button>
                          ) : joinedLiveId === room.id ? (
                            <button type="button" onClick={() => void leaveLive(room.id)} className="cursor-pointer rounded-xl border border-[var(--sc-border)] px-3 py-1.5 text-xs font-semibold text-[var(--sc-text-muted)]">
                              Quitter
                            </button>
                          ) : (
                            <button type="button" onClick={() => void joinLive(room.id)} className="cursor-pointer rounded-xl bg-[var(--sc-orange)] px-3 py-1.5 text-xs font-semibold text-white">
                              Rejoindre
                            </button>
                          )}
                        </div>
                        {joinedLiveId === room.id ? (
                          <div className="mt-3 overflow-hidden rounded-2xl bg-black text-white">
                            {hostingLiveId === room.id || room.hostId === user?.id ? (
                              <video
                                ref={attachLocalLiveVideo}
                                autoPlay
                                muted
                                playsInline
                                onLoadedMetadata={(e) => void e.currentTarget.play().catch(() => {})}
                                className="aspect-[9/16] max-h-[70vh] w-full bg-black object-cover"
                              />
                            ) : (
                              <video
                                ref={attachRemoteLiveVideo}
                                autoPlay
                                playsInline
                                controls
                                onLoadedMetadata={(e) => void e.currentTarget.play().catch(() => {})}
                                className="aspect-[9/16] max-h-[70vh] w-full bg-black object-cover"
                              />
                            )}
                            {hostingLiveId !== room.id && !remoteLiveStream ? (
                              <p className="px-4 py-3 text-center text-xs text-white/75">
                                Connexion au flux vidéo en cours…
                              </p>
                            ) : null}
                            {hostingLiveId === room.id ? (
                              <p className="px-4 py-3 text-center text-xs text-white/75">
                                Vous êtes en direct. Gardez cette fenêtre ouverte pour diffuser.
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      <NewChatModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={handleCreated} />
    </div>
  )
}
