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
import { AvatarImage } from './AvatarImage'

const LOGO_SRC = '/logo.png'
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
}

type LiveSignal =
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'candidate'; candidate: RTCIceCandidateInit }

type LiveUser = { id: string; name: string; avatar: string | null }
type LiveRaiseRequest = { roomId: string; userId: string; user: LiveUser }
type LiveTapBurst = { id: number; roomId: string; x: number }
type SocketAck = { ok?: boolean; error?: string }

type LiveVideoTileProps = {
  stream: MediaStream | null
  label: string
  muted?: boolean
  emptyText?: string
  size?: 'large' | 'small'
}

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

function addStreamTracksToPeer(pc: RTCPeerConnection, stream: MediaStream) {
  const senderTrackIds = new Set(pc.getSenders().map((sender) => sender.track?.id).filter(Boolean))
  stream.getTracks().forEach((track) => {
    if (!senderTrackIds.has(track.id)) pc.addTrack(track, stream)
  })
}

function waitForStablePeer(pc: RTCPeerConnection, timeoutMs = 2000) {
  if (pc.signalingState === 'stable') return Promise.resolve()
  return new Promise<void>((resolve) => {
    const timeout = window.setTimeout(done, timeoutMs)
    function done() {
      window.clearTimeout(timeout)
      pc.removeEventListener('signalingstatechange', onChange)
      resolve()
    }
    function onChange() {
      if (pc.signalingState === 'stable') done()
    }
    pc.addEventListener('signalingstatechange', onChange)
  })
}

function liveDisplayName(room: LiveRoom, userId: string, currentUserId?: string): string {
  if (userId === currentUserId) return 'Vous'
  if (userId === room.hostId) return room.host.name
  return room.participants.find((participant) => participant.id === userId)?.name ?? 'Invité'
}

function LiveVideoTile({ stream, label, muted = false, emptyText = 'Connexion au flux vidéo…', size = 'large' }: LiveVideoTileProps) {
  const ref = useRef<HTMLVideoElement | null>(null)
  const frameClass =
    size === 'large'
      ? 'min-h-[52vh] md:min-h-[62vh]'
      : 'min-h-32 md:min-h-36'
  const mediaClass =
    size === 'large'
      ? 'h-full min-h-[52vh] w-full bg-black object-cover md:min-h-[62vh]'
      : 'h-full min-h-32 w-full bg-black object-cover md:min-h-36'

  useEffect(() => {
    attachVideoStream(ref.current, stream)
  }, [stream])

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-black ${frameClass}`}>
      {stream ? (
        <video
          ref={ref}
          autoPlay
          muted={muted}
          playsInline
          controls={!muted}
          onLoadedMetadata={(e) => void e.currentTarget.play().catch(() => {})}
          className={mediaClass}
        />
      ) : (
        <div className={`flex ${mediaClass} items-center justify-center px-4 text-center text-xs text-white/75`}>
          {emptyText}
        </div>
      )}
      <span className="absolute left-2 top-2 max-w-[80%] truncate rounded-full bg-black/50 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur">
        {label}
      </span>
    </div>
  )
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
  const [coHostingLiveId, setCoHostingLiveId] = useState<string | null>(null)
  const [localLiveStream, setLocalLiveStream] = useState<MediaStream | null>(null)
  const [remoteLiveStreams, setRemoteLiveStreams] = useState<Record<string, MediaStream>>({})
  const [liveCohostIds, setLiveCohostIds] = useState<Record<string, string[]>>({})
  const [liveInviteTargetByRoom, setLiveInviteTargetByRoom] = useState<Record<string, string>>({})
  const [liveRaiseRequests, setLiveRaiseRequests] = useState<Record<string, LiveRaiseRequest[]>>({})
  const [liveTapBursts, setLiveTapBursts] = useState<LiveTapBurst[]>([])
  const [liveTapCounts, setLiveTapCounts] = useState<Record<string, number>>({})
  const [mobileShowList, setMobileShowList] = useState(true)
  const [logoSrc, setLogoSrc] = useState(LOGO_SRC)
  const selectedRef = useRef<string | null>(null)
  const conversationsRef = useRef<Conversation[]>([])
  const mobileShowListRef = useRef(true)
  const userRef = useRef(user)
  const recentToastMsgIds = useRef<Set<string>>(new Set())
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const livePeerConnectionsRef = useRef<Record<string, RTCPeerConnection>>({})
  const pendingIceCandidatesRef = useRef<Record<string, RTCIceCandidateInit[]>>({})
  const localLiveStreamRef = useRef<MediaStream | null>(null)
  const liveRoomsRef = useRef<LiveRoom[]>([])
  const joinedLiveIdRef = useRef<string | null>(null)
  const hostingLiveIdRef = useRef<string | null>(null)
  const coHostingLiveIdRef = useRef<string | null>(null)
  const liveTapIdRef = useRef(0)

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
    liveRoomsRef.current = liveRooms
  }, [liveRooms])

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
    coHostingLiveIdRef.current = coHostingLiveId
  }, [coHostingLiveId])

  useEffect(() => {
    localLiveStreamRef.current = localLiveStream
  }, [localLiveStream])

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
    setRemoteLiveStreams({})
  }, [])

  const stopLocalLiveStream = useCallback(() => {
    localLiveStreamRef.current?.getTracks().forEach((track) => track.stop())
    localLiveStreamRef.current = null
    setLocalLiveStream(null)
  }, [])

  const resetLiveMedia = useCallback(() => {
    closeLivePeers()
    stopLocalLiveStream()
    coHostingLiveIdRef.current = null
    setCoHostingLiveId(null)
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
    setLocalLiveStream(stream)
    return stream
  }, [])

  const createLivePeerConnection = useCallback(
    (roomId: string, remoteUserId: string, stream?: MediaStream) => {
      livePeerConnectionsRef.current[remoteUserId]?.close()
      const pc = new RTCPeerConnection(RTC_CONFIG)
      livePeerConnectionsRef.current[remoteUserId] = pc

      if (stream) addStreamTracksToPeer(pc, stream)

      pc.onicecandidate = (event) => {
        if (!event.candidate) return
        socket?.emit('live:signal', {
          roomId,
          targetUserId: remoteUserId,
          signal: { type: 'candidate', candidate: event.candidate.toJSON() } satisfies LiveSignal,
        })
      }
      pc.ontrack = (event) => {
        const stream = event.streams[0]
        if (!stream) return
        setRemoteLiveStreams((prev) => ({ ...prev, [remoteUserId]: stream }))
      }
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed' || pc.connectionState === 'disconnected') {
          delete livePeerConnectionsRef.current[remoteUserId]
          setRemoteLiveStreams((prev) => {
            const next = { ...prev }
            delete next[remoteUserId]
            return next
          })
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

  const addLiveTapBurst = useCallback((roomId: string, count = 1) => {
    setLiveTapCounts((prev) => ({ ...prev, [roomId]: (prev[roomId] ?? 0) + count }))
    const burstCount = Math.min(count, 6)
    for (let i = 0; i < burstCount; i += 1) {
      const id = liveTapIdRef.current + 1
      liveTapIdRef.current = id
      const burst = { id, roomId, x: 20 + Math.round(Math.random() * 60) }
      setLiveTapBursts((prev) => [...prev, burst])
      setTimeout(() => {
        setLiveTapBursts((prev) => prev.filter((item) => item.id !== id))
      }, 900)
    }
  }, [])

  const markLiveCohost = useCallback((roomId: string, userId: string) => {
    setLiveCohostIds((prev) => {
      const current = prev[roomId] ?? []
      if (current.includes(userId)) return prev
      return { ...prev, [roomId]: [...current, userId] }
    })
  }, [])

  const sendLocalLiveOffer = useCallback(
    async (roomId: string, targetUserId: string) => {
      if (!socket || targetUserId === userRef.current?.id) return
      const stream = localLiveStreamRef.current
      if (!stream) return
      let pc = livePeerConnectionsRef.current[targetUserId]
      if (!pc) {
        pc = createLivePeerConnection(roomId, targetUserId)
      }
      addStreamTracksToPeer(pc, stream)
      await waitForStablePeer(pc)
      if (pc.signalingState !== 'stable') return
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      socket.emit('live:signal', {
        roomId,
        targetUserId,
        signal: { type: 'offer', sdp: offer } satisfies LiveSignal,
      })
    },
    [socket, createLivePeerConnection],
  )

  const startCoHosting = useCallback(
    async (roomId: string, hostId: string) => {
      if (!socket) return
      const currentUserId = userRef.current?.id
      if (!currentUserId) return
      await getLocalLiveStream()
      coHostingLiveIdRef.current = roomId
      setCoHostingLiveId(roomId)
      markLiveCohost(roomId, currentUserId)
      const room = liveRoomsRef.current.find((item) => item.id === roomId)
      const targetIds = new Set([
        hostId,
        ...(room?.participants.map((participant) => participant.id) ?? []),
      ])
      targetIds.delete(currentUserId)

      for (const targetUserId of targetIds) {
        await sendLocalLiveOffer(roomId, targetUserId)
      }
      toast.success('Vous êtes monté dans le live')
    },
    [socket, getLocalLiveStream, markLiveCohost, sendLocalLiveOffer],
  )

  useEffect(() => {
    if (!socket) return

    const onViewerJoined = async (p: { roomId: string; userId: string; user?: LiveUser | null }) => {
      if (!userRef.current || p.userId === userRef.current.id) return
      if (p.user) {
        const viewer = p.user
        setLiveRooms((prev) =>
          prev.map((room) => {
            if (room.id !== p.roomId || room.participants.some((participant) => participant.id === p.userId)) return room
            return {
              ...room,
              viewerCount: room.viewerCount + 1,
              participants: [...room.participants, viewer],
            }
          }),
        )
      } else {
        void loadLiveRooms()
      }
      const canSendLocalStream = hostingLiveIdRef.current === p.roomId || coHostingLiveIdRef.current === p.roomId
      if (!canSendLocalStream) return
      try {
        await sendLocalLiveOffer(p.roomId, p.userId)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Connexion live impossible')
      }
    }

    const onViewerLeft = (p: { roomId: string; userId: string }) => {
      livePeerConnectionsRef.current[p.userId]?.close()
      delete livePeerConnectionsRef.current[p.userId]
      setRemoteLiveStreams((prev) => {
        const next = { ...prev }
        delete next[p.userId]
        return next
      })
      setLiveCohostIds((prev) => {
        const current = prev[p.roomId] ?? []
        if (!current.includes(p.userId)) return prev
        return { ...prev, [p.roomId]: current.filter((id) => id !== p.userId) }
      })
      setLiveRooms((prev) =>
        prev.map((room) => {
          if (room.id !== p.roomId) return room
          const participants = room.participants.filter((participant) => participant.id !== p.userId)
          return { ...room, participants, viewerCount: Math.max(0, room.viewerCount - 1) }
        }),
      )
    }

    const onLiveSignal = async (p: { roomId: string; fromUserId: string; signal: LiveSignal }) => {
      if (
        joinedLiveIdRef.current !== p.roomId &&
        hostingLiveIdRef.current !== p.roomId &&
        coHostingLiveIdRef.current !== p.roomId
      ) return
      try {
        let pc = livePeerConnectionsRef.current[p.fromUserId]
        if (!pc) {
          pc = createLivePeerConnection(p.roomId, p.fromUserId, localLiveStreamRef.current ?? undefined)
        }

        if (p.signal.type === 'offer') {
          if (pc.signalingState === 'have-local-offer') {
            await pc.setLocalDescription({ type: 'rollback' })
          }
          if (pc.signalingState !== 'stable') {
            await waitForStablePeer(pc)
          }
          if (pc.signalingState !== 'stable') return
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

    const onLiveInvite = (p: { roomId: string; roomTitle: string; fromUser: LiveUser }) => {
      toast.message(`${p.fromUser.name} vous invite dans un live`, {
        description: p.roomTitle,
        action: {
          label: 'Voir',
          onClick: () => {
            setSocialPanel('live')
            void loadLiveRooms()
          },
        },
      })
    }

    const onLiveTap = (p: { roomId: string; count?: number }) => {
      addLiveTapBurst(p.roomId, p.count ?? 1)
    }

    const onLiveRequestStreams = (p: { roomId: string; fromUserId: string }) => {
      if (p.fromUserId === userRef.current?.id) return
      const canSendLocalStream = hostingLiveIdRef.current === p.roomId || coHostingLiveIdRef.current === p.roomId
      if (!canSendLocalStream || !localLiveStreamRef.current) return
      void sendLocalLiveOffer(p.roomId, p.fromUserId).catch((err) => {
        console.warn('[live] stream request failed', err)
      })
    }

    const onRaiseRequest = (p: LiveRaiseRequest) => {
      if (hostingLiveIdRef.current !== p.roomId) return
      setLiveRaiseRequests((prev) => {
        const current = prev[p.roomId] ?? []
        if (current.some((item) => item.userId === p.userId)) return prev
        return { ...prev, [p.roomId]: [...current, p] }
      })
      toast.message(`${p.user.name} veut monter dans le live`)
    }

    const onRaiseApproved = (p: { roomId: string; hostId: string }) => {
      void (async () => {
        try {
          if (joinedLiveIdRef.current !== p.roomId) {
            toast.message('Vous avez été accepté. Rejoignez le live pour monter.')
            return
          }
          await startCoHosting(p.roomId, p.hostId)
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Impossible de monter dans le live')
        }
      })()
    }

    const onCohostStarted = (p: { roomId: string; userId: string; user?: LiveUser | null }) => {
      markLiveCohost(p.roomId, p.userId)
      if (p.user) {
        const cohost = p.user
        setLiveRooms((prev) =>
          prev.map((room) => {
            if (room.id !== p.roomId || room.participants.some((participant) => participant.id === p.userId)) return room
            return { ...room, participants: [...room.participants, cohost] }
          }),
        )
      }
      if (p.userId === userRef.current?.id) return
      if (joinedLiveIdRef.current === p.roomId || hostingLiveIdRef.current === p.roomId) {
        toast.message('Un invité est monté dans le live')
      }
    }

    socket.on('live:viewer_joined', onViewerJoined)
    socket.on('live:viewer_left', onViewerLeft)
    socket.on('live:signal', onLiveSignal)
    socket.on('live:request_streams', onLiveRequestStreams)
    socket.on('live:invite', onLiveInvite)
    socket.on('live:tap', onLiveTap)
    socket.on('live:raise_request', onRaiseRequest)
    socket.on('live:raise_approved', onRaiseApproved)
    socket.on('live:cohost_started', onCohostStarted)
    return () => {
      socket.off('live:viewer_joined', onViewerJoined)
      socket.off('live:viewer_left', onViewerLeft)
      socket.off('live:signal', onLiveSignal)
      socket.off('live:request_streams', onLiveRequestStreams)
      socket.off('live:invite', onLiveInvite)
      socket.off('live:tap', onLiveTap)
      socket.off('live:raise_request', onRaiseRequest)
      socket.off('live:raise_approved', onRaiseApproved)
      socket.off('live:cohost_started', onCohostStarted)
    }
  }, [socket, createLivePeerConnection, flushPendingIceCandidates, loadLiveRooms, addLiveTapBurst, startCoHosting, sendLocalLiveOffer, markLiveCohost])

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
      coHostingLiveIdRef.current = null
      setCoHostingLiveId(null)
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
    resetLiveMedia()
    setRemoteLiveStreams({})
    await postJson('/api/live/' + roomId + '/join', {}, token)
    hostingLiveIdRef.current = null
    joinedLiveIdRef.current = roomId
    setHostingLiveId(null)
    setJoinedLiveId(roomId)
    socket?.emit('live:join', { roomId })
    socket?.emit('live:request_streams', { roomId })
    await loadLiveRooms()
  }

  const resumeHostedLive = async (roomId: string) => {
    if (!token) return
    try {
      await getLocalLiveStream()
      hostingLiveIdRef.current = roomId
      joinedLiveIdRef.current = roomId
      coHostingLiveIdRef.current = null
      setHostingLiveId(roomId)
      setJoinedLiveId(roomId)
      setCoHostingLiveId(null)
      socket?.emit('live:join', { roomId })
      socket?.emit('live:request_streams', { roomId })
      await loadLiveRooms()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossible de reprendre le live')
    }
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
    setLiveCohostIds((prev) => {
      const next = { ...prev }
      delete next[roomId]
      return next
    })
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
    setLiveCohostIds((prev) => {
      const next = { ...prev }
      delete next[roomId]
      return next
    })
    await loadLiveRooms()
  }

  const liveInviteCandidates = Array.from(
    new Map(
      conversations
        .flatMap((conversation) => conversation.members)
        .filter((member) => member.id !== user?.id)
        .map((member) => [member.id, member] as const),
    ).values(),
  )

  const sendLiveInvite = (roomId: string) => {
    const targetUserId = liveInviteTargetByRoom[roomId]
    if (!socket || !targetUserId) return
    socket.emit('live:invite', { roomId, targetUserId }, (ack: SocketAck) => {
      if (ack?.ok) {
        toast.success('Invitation envoyée')
        return
      }
      toast.error(ack?.error ?? 'Invitation impossible')
    })
  }

  const sendLiveTap = (roomId: string) => {
    addLiveTapBurst(roomId)
    socket?.emit('live:tap', { roomId, count: 1 })
  }

  const requestLiveRaise = (roomId: string) => {
    if (!socket) return
    socket.emit('live:raise_request', { roomId }, (ack: SocketAck) => {
      if (ack?.ok) {
        toast.success('Demande envoyée')
        return
      }
      toast.error(ack?.error ?? 'Demande impossible')
    })
  }

  const approveLiveRaise = (roomId: string, targetUserId: string) => {
    if (!socket) return
    socket.emit('live:raise_approve', { roomId, targetUserId }, (ack: SocketAck) => {
      if (ack?.ok) {
        setLiveRaiseRequests((prev) => ({
          ...prev,
          [roomId]: (prev[roomId] ?? []).filter((item) => item.userId !== targetUserId),
        }))
        toast.success('Invitation à monter envoyée')
        return
      }
      toast.error(ack?.error ?? 'Impossible de faire monter cette personne')
    })
  }

  const remoteLiveEntries = Object.entries(remoteLiveStreams)
  const shouldShowLocalLiveTile = (room: LiveRoom) =>
    Boolean(localLiveStream && (hostingLiveId === room.id || coHostingLiveId === room.id || room.hostId === user?.id))
  const liveHostStream = (room: LiveRoom) =>
    room.hostId === user?.id ? localLiveStream : (remoteLiveStreams[room.hostId] ?? null)
  const liveSecondaryTiles = (room: LiveRoom) => {
    const tiles: Array<{ id: string; label: string; stream: MediaStream | null; muted: boolean }> = remoteLiveEntries
      .filter(([remoteUserId]) => remoteUserId !== room.hostId)
      .map(([remoteUserId, stream]) => ({
        id: remoteUserId,
        label: liveDisplayName(room, remoteUserId, user?.id),
        stream,
        muted: false,
      }))

    for (const cohostId of liveCohostIds[room.id] ?? []) {
      if (cohostId === room.hostId || cohostId === user?.id || tiles.some((tile) => tile.id === cohostId)) continue
      tiles.push({
        id: cohostId,
        label: liveDisplayName(room, cohostId, user?.id),
        stream: null,
        muted: false,
      })
    }

    if (shouldShowLocalLiveTile(room) && room.hostId !== user?.id) {
      tiles.unshift({ id: 'local', label: 'Vous', stream: localLiveStream!, muted: true })
    }

    return tiles
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
          <div className={`w-full overflow-hidden rounded-3xl border border-[var(--sc-border)] bg-[var(--sc-elevated)] shadow-2xl ${socialPanel === 'live' ? 'max-w-6xl' : 'max-w-lg'}`}>
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
                <div className="max-h-[min(78vh,900px)] space-y-2 overflow-y-auto">
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
                <div className="max-h-[min(78vh,900px)] space-y-2 overflow-y-auto">
                  {liveRooms.length === 0 ? (
                    <p className="py-8 text-center text-sm text-[var(--sc-text-muted)]">Aucun live actif.</p>
                  ) : (
                    liveRooms.map((room) => (
                      <div key={room.id} className="rounded-2xl border border-[var(--sc-border)] p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-[var(--sc-text)]">{room.title}</p>
                            <p className="text-xs text-[var(--sc-text-muted)]">
                              {room.host.name} · {room.viewerCount} spectateur(s) · {liveTapCounts[room.id] ?? 0} tap(s)
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
                        {room.hostId === user?.id ? (
                          <div className="mt-3 space-y-2 rounded-2xl bg-[var(--sc-muted-bg)] p-3">
                            <div className="flex gap-2">
                              <select
                                value={liveInviteTargetByRoom[room.id] ?? ''}
                                onChange={(e) => setLiveInviteTargetByRoom((prev) => ({ ...prev, [room.id]: e.target.value }))}
                                className="min-w-0 flex-1 rounded-xl border border-[var(--sc-border)] bg-[var(--sc-input-bg)] px-3 py-2 text-xs outline-none"
                              >
                                <option value="">Inviter un utilisateur...</option>
                                {liveInviteCandidates.map((candidate) => (
                                  <option key={candidate.id} value={candidate.id}>
                                    {candidate.name}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => sendLiveInvite(room.id)}
                                disabled={!liveInviteTargetByRoom[room.id]}
                                className="cursor-pointer rounded-xl bg-[var(--sc-orange)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                              >
                                Inviter
                              </button>
                            </div>
                            {(liveRaiseRequests[room.id] ?? []).map((request) => (
                              <div key={request.userId} className="flex items-center justify-between gap-2 text-xs">
                                <span className="min-w-0 truncate text-[var(--sc-text)]">{request.user.name} veut monter</span>
                                <button
                                  type="button"
                                  onClick={() => approveLiveRaise(room.id, request.userId)}
                                  className="cursor-pointer rounded-lg border border-[var(--sc-orange)] px-2 py-1 font-semibold text-[var(--sc-orange)]"
                                >
                                  Accepter
                                </button>
                              </div>
                            ))}
                            <div className="rounded-2xl border border-[var(--sc-border)] bg-[var(--sc-elevated)] p-2">
                              <p className="mb-2 text-xs font-semibold text-[var(--sc-text)]">Spectateurs en direct</p>
                              {room.participants.filter((participant) => participant.id !== user?.id && participant.id !== room.hostId).length > 0 ? (
                                <div className="space-y-2">
                                  {room.participants
                                    .filter((participant) => participant.id !== user?.id && participant.id !== room.hostId)
                                    .map((participant) => (
                                      <div key={participant.id} className="flex items-center justify-between gap-2 rounded-xl bg-[var(--sc-muted-bg)] px-2 py-2">
                                        <div className="flex min-w-0 items-center gap-2">
                                          <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full">
                                            <AvatarImage src={participant.avatar} alt={participant.name} />
                                          </div>
                                          <span className="min-w-0 truncate text-sm font-medium text-[var(--sc-text)]">{participant.name}</span>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => approveLiveRaise(room.id, participant.id)}
                                          className="shrink-0 cursor-pointer rounded-full bg-[var(--sc-orange)] px-3 py-1.5 text-xs font-semibold text-white"
                                        >
                                          Monter
                                        </button>
                                      </div>
                                    ))}
                                </div>
                              ) : (
                                <p className="py-2 text-center text-xs text-[var(--sc-text-muted)]">
                                  Aucun spectateur pour le moment. Invite quelqu’un pour le faire monter.
                                </p>
                              )}
                            </div>
                          </div>
                        ) : null}
                        {joinedLiveId === room.id || room.hostId === user?.id ? (
                          <div className="relative mt-3 overflow-hidden rounded-2xl bg-black text-white" onClick={() => sendLiveTap(room.id)}>
                            <div className="grid gap-2 p-2 md:grid-cols-[minmax(0,1fr)_minmax(160px,220px)]">
                              <LiveVideoTile
                                stream={liveHostStream(room)}
                                label={room.hostId === user?.id ? 'Vous (hôte)' : `${room.host.name} (hôte)`}
                                muted={room.hostId === user?.id}
                                emptyText="Connexion au flux de l’hôte…"
                              />
                              <div className="grid max-h-56 grid-cols-2 gap-2 overflow-y-auto md:max-h-[62vh] md:grid-cols-1">
                                {liveSecondaryTiles(room).map((tile) => (
                                  <LiveVideoTile
                                    key={tile.id}
                                    stream={tile.stream}
                                    label={tile.label}
                                    muted={tile.muted}
                                    size="small"
                                  />
                                ))}
                                {liveSecondaryTiles(room).length === 0 ? (
                                  <div className="flex min-h-32 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-3 text-center text-xs text-white/70">
                                    Les personnes montées apparaîtront ici.
                                  </div>
                                ) : null}
                              </div>
                            </div>
                            {room.hostId === user?.id && (!localLiveStream || hostingLiveId !== room.id || joinedLiveId !== room.id) ? (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/55 px-4 text-center backdrop-blur-sm">
                                <div className="max-w-xs rounded-2xl border border-white/15 bg-black/70 p-4">
                                  <p className="text-sm font-semibold text-white">Votre live est toujours actif</p>
                                  <p className="mt-1 text-xs text-white/70">
                                    Reprenez la caméra pour revoir l’écran live et continuer à diffuser.
                                  </p>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      void resumeHostedLive(room.id)
                                    }}
                                    className="mt-3 cursor-pointer rounded-xl bg-[var(--sc-orange)] px-4 py-2 text-sm font-semibold text-white"
                                  >
                                    Reprendre le live
                                  </button>
                                </div>
                              </div>
                            ) : null}
                            {liveTapBursts
                              .filter((burst) => burst.roomId === room.id)
                              .map((burst) => (
                                <span
                                  key={burst.id}
                                  className="pointer-events-none absolute bottom-12 animate-ping text-3xl"
                                  style={{ left: `${burst.x}%` }}
                                >
                                  ♥
                                </span>
                              ))}
                            <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  sendLiveTap(room.id)
                                }}
                                className="cursor-pointer rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold backdrop-blur hover:bg-white/25"
                              >
                                Tapoter ♥
                              </button>
                              {room.hostId !== user?.id ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    requestLiveRaise(room.id)
                                  }}
                                  disabled={coHostingLiveId === room.id}
                                  className="cursor-pointer rounded-full bg-[var(--sc-orange)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                                >
                                  {coHostingLiveId === room.id ? 'Vous êtes monté' : 'Demander à monter'}
                                </button>
                              ) : null}
                            </div>
                            {hostingLiveId === room.id ? (
                              <p className="px-4 py-3 text-center text-xs text-white/75">
                                Vous êtes en direct. Toutes les personnes montées apparaissent dans la grille.
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
