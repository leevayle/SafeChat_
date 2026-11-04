import { useEffect, useRef, useState, memo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Phone, Video, PhoneMissed, PhoneIncoming, PhoneOutgoing, Smile, Send, Check, CheckCheck, ImagePlus, X, Clock, RotateCcw } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { api, hasAccessToken, type ApiMsg } from '../api'
import { utcNowIso, formatLocalTime, formatLastSeen, parseUtc } from '../time'
import { isRealtimeOpen, wsSendMessage, wsReceipt } from '../realtime'
import { FONT_SIZES, WALLPAPERS, useStore } from '../store'

type Props = { contactId: string; onBack: () => void; onCall: (kind: 'audio' | 'video') => void; onOpenCalls?: () => void }

const EMOJIS = [
  '😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😋','😎','😍','😘','🥰','😗','😙','😚',
  '🙂','🤗','🤩','🤔','🤨','😐','😑','😶','🙄','😏','😣','😥','😮','🤐','😯','😪','😫','🥱',
  '😴','😌','😛','😜','😝','🤤','😒','😓','😔','😕','🙃','🤑','😲','☹️','🙁','😖','😞','😟',
  '😤','😢','😭','😦','😧','😨','😩','🤯','😬','😰','😱','🥵','🥶','😳','🤪','😵','😡','😠',
  '🤬','😷','🤒','🤕','🤢','🤮','sneezing','😇','🥳','🥺','🤠','🤡','🤥','🤫','🤭','🧐','🤓','😈',
  '👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','👍',
  '👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','💪',
  '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝',
  '🔥','⭐','✨','🌟','💫','💥','🎉','🎊','🎈','🎁','🏆','🥇','🎯','💯','✅',
  '☕','🍕','🍔','🍟','🌮','🍣','🍦','🍰','🍺','🍻','🎂','🍪','🍩','🍿',
].filter((e) => e !== 'sneezing')

const API_ORIGIN = import.meta.env.VITE_API_URL || ''

function mediaUrl(path?: string | null) {
  if (!path) return ''
  if (path.startsWith('http') || path.startsWith('data:')) return path
  return `${API_ORIGIN}${path}`
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

const STATE_RANK: Record<string, number> = {
  pending: 0,
  failed: 0,
  sent: 1,
  delivered: 2,
  read: 3,
}

function rankState(s?: string) {
  return STATE_RANK[s || ''] ?? 0
}

function sameMsgList(a: ApiMsg[], b: ApiMsg[]) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const x = a[i]
    const y = b[i]
    if (
      x.id !== y.id ||
      x.clientKey !== y.clientKey ||
      x.state !== y.state ||
      x.text !== y.text ||
      x.image !== y.image ||
      x.mine !== y.mine
    )
      return false
  }
  return true
}

/** Receipt ticks only — isolated so state changes never re-animate the bubble */
const ReceiptTicks = memo(function ReceiptTicks({
  state,
  readReceipts,
  mine,
}: {
  state?: ApiMsg['state']
  readReceipts: boolean
  mine: boolean
}) {
  if (!mine) return null
  if (state === 'pending') {
    return <Clock size={13} strokeWidth={2.5} className="opacity-80" aria-label="Sending" />
  }
  if (state === 'failed') {
    return (
      <RotateCcw
        size={13}
        strokeWidth={2.5}
        className="text-red-200"
        aria-label="Failed — tap to retry"
      />
    )
  }
  if (state === 'sent') {
    return <Check size={14} strokeWidth={2.5} aria-label="Sent" />
  }
  if (state === 'delivered') {
    return <CheckCheck size={14} strokeWidth={2.5} className="opacity-90" aria-label="Delivered" />
  }
  return (
    <CheckCheck
      size={14}
      strokeWidth={2.5}
      className={readReceipts ? 'text-sky-300' : 'opacity-90'}
      aria-label="Read"
    />
  )
})

type BubbleProps = {
  m: ApiMsg
  mine: boolean
  readReceipts: boolean
  animateIn: boolean
  onRetry: (m: ApiMsg) => void
  onReply?: (m: ApiMsg) => void
  onOpenCalls?: () => void
  onJumpTo?: (id: string) => void
}

/** One mount animation only; later receipt updates re-render ticks in place */
const MessageBubble = memo(function MessageBubble({
  m,
  mine,
  readReceipts,
  animateIn,
  onRetry,
  onReply,
  onOpenCalls,
  onJumpTo,
}: BubbleProps) {
  const startX = useRef(0)
  const startY = useRef(0)
  const [dx, setDx] = useState(0)

  if (m.callLog) {
    const missed = m.callLog.status === 'missed' || m.callLog.direction === 'missed'
    const label = missed
      ? 'Missed call'
      : m.callLog.direction === 'in'
        ? 'Incoming'
        : 'Outgoing'
    const CallIcon = missed
      ? PhoneMissed
      : m.callLog.kind === 'video'
        ? Video
        : m.callLog.direction === 'in'
          ? PhoneIncoming
          : PhoneOutgoing
    const detail = [m.callLog.duration, m.timeLabel].filter(Boolean).join(' · ')
    return (
      <div className="flex justify-center py-1.5">
        <button
          type="button"
          onClick={() => onOpenCalls?.()}
          className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px] font-bold ring-1 ${
            missed
              ? 'bg-red-50 text-brand-red ring-red-100'
              : 'bg-gray-100 text-gray-600 ring-gray-200/80'
          }`}
        >
          <CallIcon size={14} strokeWidth={2.4} />
          <span>
            {label} · {m.callLog.kind === 'video' ? 'Video' : 'Voice'}
            {detail ? ` · ${detail}` : ''}
          </span>
        </button>
      </div>
    )
  }

  return (
    <motion.div
      initial={animateIn ? { opacity: 0, y: 16, scale: 0.92 } : false}
      animate={{ opacity: 1, y: 0, scale: 1, x: dx }}
      transition={animateIn ? { type: 'spring', stiffness: 380, damping: 30 } : { duration: 0 }}
      style={{ touchAction: 'pan-y' }}
      onTouchStart={(e) => {
        startX.current = e.touches[0].clientX
        startY.current = e.touches[0].clientY
      }}
      onTouchMove={(e) => {
        const d = e.touches[0].clientX - startX.current
        const dy = Math.abs(e.touches[0].clientY - startY.current)
        if (d > 8 && d > dy * 1.2) {
          // horizontal reply gesture — don't fight vertical scroll
          setDx(Math.min(56, d * 0.4))
        }
      }}
      onTouchEnd={() => {
        if (dx > 28) onReply?.(m)
        setDx(0)
      }}
      className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
    >
      <div
        role={mine && m.state === 'failed' ? 'button' : undefined}
        tabIndex={mine && m.state === 'failed' ? 0 : undefined}
        onClick={() => {
          if (mine && m.state === 'failed') onRetry(m)
        }}
        className={`max-w-[78%] overflow-hidden shadow-sm ${
          mine
            ? 'rounded-3xl rounded-br-md bg-gradient-to-br from-brand-magenta to-brand-purple text-white'
            : 'rounded-3xl rounded-bl-md bg-white text-ink'
        } ${mine && m.state === 'failed' ? 'ring-2 ring-red-300/80' : ''}`}
      >
        {m.statusReply && (
          <button
            type="button"
            className={`mx-2 mt-2 w-[calc(100%-1rem)] rounded-xl px-3 py-1.5 text-left text-[12px] font-semibold ${
              mine ? 'bg-white/15 text-white/90' : 'bg-gray-100 text-gray-600'
            }`}
          >
            <span className="block text-[10px] font-black uppercase tracking-wide opacity-70">Status</span>
            <span className="line-clamp-2">{m.statusReply.preview}</span>
            {m.statusReply.time ? (
              <span className="mt-0.5 block text-[10px] opacity-60">{m.statusReply.time}</span>
            ) : null}
          </button>
        )}
        {(m.replyToId || m.replyToText) && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              if (m.replyToId) onJumpTo?.(m.replyToId)
            }}
            className={`mx-2 mt-2 flex w-[calc(100%-1rem)] gap-2 rounded-xl border-l-4 px-2.5 py-1.5 text-left text-[12px] font-semibold ${
              mine
                ? 'border-white/70 bg-white/15 text-white/90'
                : 'border-brand-purple bg-gray-50 text-gray-600'
            }`}
          >
            <span className="line-clamp-2">{m.replyToText || 'Original message'}</span>
          </button>
        )}
        {m.image && (
          <img
            src={mediaUrl(m.image)}
            alt=""
            className="max-h-56 w-full object-cover"
            loading="lazy"
          />
        )}
        {m.text && m.text !== '📷 Photo' && (
          <p className="px-4 pt-2.5 font-semibold leading-snug">{m.text}</p>
        )}
        <p
          className={`flex items-center justify-end gap-1 px-4 pb-2 pt-1 text-[11px] font-bold ${
            mine ? 'text-white/75' : 'text-gray-400'
          }`}
        >
          {m.timeLabel ||
            new Date(m.time).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            })}
          <ReceiptTicks state={m.state} readReceipts={readReceipts} mine={mine} />
        </p>
      </div>
    </motion.div>
  )
})

function ChatWindowInner({ contactId, onBack, onCall, onOpenCalls }: Props) {
  const { settings, contacts, chats, me, showToast, upsertChatPreview } = useStore()
  // Resolve peer from contacts, or from an existing chat preview (notifications may pass contactId)
  const chatPreview =
    chats.find(
      (ch) =>
        ch.contactId === contactId ||
        ch.conversationId === contactId,
    ) || null
  const peerId = chatPreview?.contactId || contactId
  const c =
    contacts.find((x) => x.id === peerId || x.peerId === peerId) ||
    (chatPreview
      ? {
          id: peerId,
          name: chatPreview.name || peerId,
          username: '',
          phone: '',
          bio: '',
          photo: null,
          online: false,
          hue: (chatPreview.hue as [string, string]) || (['#7B2CBF', '#6389EB'] as [string, string]),
        }
      : {
          id: peerId,
          name: peerId,
          username: '',
          phone: '',
          bio: '',
          photo: null,
          online: false,
          hue: ['#7B2CBF', '#6389EB'] as [string, string],
        })
  const knownConv =
    chatPreview?.conversationId ||
    chats.find((ch) => ch.contactId === peerId || ch.contactId === (c as any).peerId)
      ?.conversationId ||
    null
  const [conversationId, setConversationId] = useState<string | null>(knownConv)
  const [msgs, setMsgs] = useState<ApiMsg[]>([])
  const [text, setText] = useState('')
  const [typing, setTyping] = useState(false)
  const [emoji, setEmoji] = useState(false)
  const [loading, setLoading] = useState(true)
  const [pendingImage, setPendingImage] = useState<string | null>(null)
  const [replyTo, setReplyTo] = useState<ApiMsg | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [peerOnline, setPeerOnline] = useState(false)
  const [peerLastSeen, setPeerLastSeen] = useState<string | null>(null)
  const [statusReply, setStatusReply] = useState<{ preview: string; time?: string } | null>(null)
  const msgRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const end = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const convRef = useRef<string | null>(knownConv)
  const ensurePromise = useRef<Promise<string | null> | null>(null)
  const animatedKeys = useRef<Set<string>>(new Set())
  convRef.current = conversationId

  const ensureConversation = async (): Promise<string | null> => {
    if (convRef.current) return convRef.current
    if (ensurePromise.current) return ensurePromise.current

    // Prefer existing conversation from chat list (works even without username)
    const fromList =
      chats.find(
        (ch) =>
          ch.contactId === peerId ||
          ch.contactId === (c as any).peerId ||
          ch.conversationId === contactId,
      )?.conversationId || null
    if (fromList) {
      setConversationId(fromList)
      convRef.current = fromList
      return fromList
    }

    const username = ((c as any).username || '').replace(/^@/, '').trim()
    if (!username) {
      showToast('Could not open chat — contact is missing')
      return null
    }
    ensurePromise.current = (async () => {
      try {
        const preview = await api.openPrivateChat(username)
        const cid = preview.conversationId || null
        if (cid) {
          setConversationId(cid)
          convRef.current = cid
          upsertChatPreview({
            contactId: peerId,
            conversationId: cid,
            name: preview.name || (c as any).name,
            last: preview.last,
            iso: preview.iso,
            unread: 0,
          })
        }
        return cid
      } catch (e: any) {
        showToast(e?.message || 'Could not open chat')
        return null
      } finally {
        ensurePromise.current = null
      }
    })()
    return ensurePromise.current
  }

  const load = async (silent = false) => {
    try {
      const cid = await ensureConversation()
      if (!cid) return
      const { messages } = await api.messages(cid)
      // Incoming messages we just pulled: ack delivered before/while painting (no await)
      for (const m of messages) {
        const mine = m.mine ?? m.from === me?.id
        if (!mine && m.id && !String(m.id).startsWith('local-')) {
          void api.markDelivered(m.id).catch(() => {})
        }
      }
      setMsgs((prev) => {
        // Preserve clientKey / pending state across polls so bubbles never remount
        const prevById = new Map(prev.map((m) => [m.id, m]))
        const prevByKey = new Map(
          prev.filter((m) => m.clientKey).map((m) => [m.clientKey as string, m]),
        )
        const claimedKeys = new Set<string>()
        const mapped = messages.map((sm) => {
          const prior = prevById.get(sm.id)
          if (prior?.clientKey) {
            claimedKeys.add(prior.clientKey)
            return {
              ...sm,
              clientKey: prior.clientKey,
              mine: prior.mine ?? sm.mine,
              // Prefer higher delivery state from either side
              state: rankState(sm.state) >= rankState(prior.state) ? sm.state : prior.state,
            }
          }
          // Match optimistic local by same body + mine flag
          const match = prev.find(
            (p) =>
              p.id.startsWith('local-') &&
              p.clientKey &&
              !claimedKeys.has(p.clientKey) &&
              (p.mine ?? true) &&
              p.text === sm.text &&
              (!!p.image === !!sm.image),
          )
          if (match?.clientKey) {
            claimedKeys.add(match.clientKey)
            return {
              ...sm,
              clientKey: match.clientKey,
              mine: true,
              state: rankState(sm.state) >= rankState(match.state) ? sm.state : match.state,
            }
          }
          return { ...sm, clientKey: sm.clientKey || sm.id }
        })
        const stillPending = prev.filter(
          (m) =>
            m.id.startsWith('local-') &&
            m.clientKey &&
            !claimedKeys.has(m.clientKey) &&
            (m.state === 'pending' || m.state === 'failed'),
        )
        const callRows = prev.filter((m) => m.callLog)
        const merged = [...mapped, ...stillPending, ...callRows].sort((a, b) => {
          const ta = Date.parse(a.time) || 0
          const tb = Date.parse(b.time) || 0
          return ta - tb
        })
        if (sameMsgList(prev, merged)) return prev
        return merged
      })
      api.markRead(cid).catch(() => {})
    } catch (e: any) {
      if (!silent) showToast(e?.message || 'Could not load messages')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    setMsgs([])
    animatedKeys.current = new Set()
    setConversationId(knownConv)
    convRef.current = knownConv
    // Instant blue ticks for the sender: as soon as this chat surface is open,
    // mark read — do not wait for message history to finish loading.
    if (knownConv && hasAccessToken()) {
      void api.markRead(knownConv).catch(() => {})
      wsReceipt({ conversationId: knownConv, messageId: 'all', state: 'read' })
      // Clear unread badge on home immediately
      upsertChatPreview({
        contactId: peerId,
        conversationId: knownConv,
        unread: 0,
      })
    }
    if (!hasAccessToken()) {
      setLoading(false)
      return
    }
    load(false)
    const t = setInterval(() => {
      if (hasAccessToken()) load(true)
    }, 12000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId])

  // Live message + receipt packets for the open conversation
  useEffect(() => {
    const onMsg = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as {
        cid: string
        m: {
          id: string
          from: string
          text?: string
          time?: string
          image?: string | null
          state?: string
        }
        mine?: boolean
      }
      if (!detail?.cid || !detail?.m?.id) return
      const openCid = convRef.current
      if (!openCid || detail.cid !== openCid) return
      const mine = detail.mine ?? detail.m.from === me?.id
      const incoming = {
        id: detail.m.id,
        clientKey: detail.m.id,
        from: detail.m.from,
        to: contactId,
        text: detail.m.text || (detail.m.image ? '📷 Photo' : ''),
        image: detail.m.image || null,
        time: detail.m.time || new Date().toISOString(),
        timeLabel: new Date(detail.m.time || Date.now()).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }),
        state: (detail.m.state as any) || (mine ? 'sent' : undefined),
        mine,
      }
      // Delivered was already fired in the store handler before this event.
      setMsgs((prev) => {
        if (prev.some((x) => x.id === incoming.id || x.clientKey === incoming.id)) return prev
        return [...prev, incoming as any]
      })
      if (!mine && openCid) {
        void api.markRead(openCid).catch(() => {})
      }
    }
    const onRcpt = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { cid: string; id: string; s: string }
      if (!detail?.id) return
      const openCid = convRef.current
      if (detail.cid && openCid && detail.cid !== openCid) return
      const nextState = detail.s as any
      setMsgs((prev) => {
        let changed = false
        const next = prev.map((x) => {
          if (x.id !== detail.id && x.clientKey !== detail.id) return x
          const rank: Record<string, number> = {
            pending: 0,
            failed: 0,
            sent: 1,
            delivered: 2,
            read: 3,
          }
          if ((rank[nextState || ''] ?? 0) <= (rank[x.state || ''] ?? 0)) return x
          changed = true
          return { ...x, state: nextState }
        })
        return changed ? next : prev
      })
    }
    const onAck = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as {
        ck?: string
        ok: boolean
        id?: string
        s?: string
        ts?: string
      }
      if (!detail?.ck) return
      if (!detail.ok) {
        setMsgs((prev) =>
          prev.map((x) =>
            x.clientKey === detail.ck || x.id === detail.ck ? { ...x, state: 'failed' } : x,
          ),
        )
        return
      }
      setMsgs((prev) =>
        prev.map((x) =>
          x.clientKey === detail.ck || x.id === detail.ck
            ? {
                ...x,
                id: detail.id || x.id,
                clientKey: x.clientKey || detail.ck,
                state: (detail.s as any) || 'sent',
                time: detail.ts || x.time,
                timeLabel: detail.ts ? formatLocalTime(detail.ts) : x.timeLabel,
              }
            : x,
        ),
      )
      upsertChatPreview({
        contactId: peerId,
        conversationId: convRef.current || undefined,
        state: (detail.s as any) || 'sent',
        mine: true,
      })
    }
    window.addEventListener('sc:rt-msg', onMsg)
    window.addEventListener('sc:rt-rcpt', onRcpt)
    window.addEventListener('sc:rt-ack', onAck)
    return () => {
      window.removeEventListener('sc:rt-msg', onMsg)
      window.removeEventListener('sc:rt-rcpt', onRcpt)
      window.removeEventListener('sc:rt-ack', onAck)
    }
  }, [contactId, me?.id, peerId, upsertChatPreview])

  useEffect(() => {
    let last = 0
    const onType = () => {
      if (!hasAccessToken()) return
      const now = Date.now()
      if (now - last < 1200) return
      last = now
      if (settings.typingIndicator) api.setTyping(contactId).catch(() => {})
    }
    ;(window as any).__sc_type = onType
    return () => {
      delete (window as any).__sc_type
    }
  }, [contactId, settings.typingIndicator])

  useEffect(() => {
    if (!settings.typingIndicator || !hasAccessToken()) return
    const tick = async () => {
      if (!hasAccessToken()) return
      try {
        const { typing: t } = await api.getTyping(contactId)
        setTyping(t)
      } catch {
        /* */
      }
    }
    tick()
    const id = setInterval(tick, 2500)
    return () => clearInterval(id)
  }, [contactId, settings.typingIndicator])

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [msgs.length, pendingImage, typing])

  const deliverMessage = async (
    localId: string,
    body: string,
    img: string | null,
    opts?: { replyToId?: string; statusReply?: { preview: string; time?: string } },
  ) => {
    try {
      const cid = await ensureConversation()
      if (!cid) {
        setMsgs((m) => m.map((x) => (x.id === localId ? { ...x, state: 'failed' } : x)))
        upsertChatPreview({
          contactId: (c as any).peerId || contactId,
          conversationId: conversationId || undefined,
          last: body || (img ? '📷 Photo' : ''),
          state: 'failed',
          mine: true,
          name: c.name,
          photo: c.photo,
          hue: c.hue,
        })
        showToast('Could not open chat — tap message to retry')
        return
      }
      if (cid && cid !== conversationId) {
        setConversationId(cid)
        convRef.current = cid
      }
      // Prefer persistent WebSocket (no new HTTP handshake)
      const usedWs = isRealtimeOpen() && wsSendMessage({
        conversationId: cid,
        text: body || '',
        clientKey: localId,
        image: img,
      })
      if (usedWs) {
        // Ack arrives via sc:rt-ack / store onAck → updates ticks to sent
        // Optimistic already shows pending; WS ack will flip to sent
        return
      }
      const { message } = await api.send(cid, body || (img ? '📷 Photo' : ''), img, opts)
      setMsgs((m) =>
        m.map((x) =>
          x.id === localId || x.clientKey === localId
            ? {
                ...x,
                ...message,
                id: message.id || x.id,
                clientKey: x.clientKey || localId,
                mine: true,
                state: message.state || 'sent',
                timeLabel: message.timeLabel || x.timeLabel,
              }
            : x,
        ),
      )
      upsertChatPreview({
        contactId: (c as any).peerId || contactId,
        conversationId: cid,
        last: message.text || body || (img ? '📷 Photo' : ''),
        state: (message.state as any) || 'sent',
        mine: true,
        name: c.name,
        photo: c.photo,
        hue: c.hue,
        iso: message.time || utcNowIso(),
        time: message.timeLabel,
      })
    } catch (e: any) {
      setMsgs((m) => m.map((x) => (x.id === localId ? { ...x, state: 'failed' } : x)))
      upsertChatPreview({
        contactId: (c as any).peerId || contactId,
        conversationId: conversationId || undefined,
        last: body || (img ? '📷 Photo' : ''),
        state: 'failed',
        mine: true,
        name: c.name,
        photo: c.photo,
        hue: c.hue,
      })
      showToast(e?.message || 'Message failed — tap to retry')
    }
  }

  const send = async () => {
    const t = text.trim()
    if (!t && !pendingImage) return
    const body = t
    const img = pendingImage
    const replySnap = replyTo
    const statusSnap = statusReply
    setText('')
    setPendingImage(null)
    setEmoji(false)
    setReplyTo(null)
    setStatusReply(null)

    const localId = `local-${Date.now()}`
    const nowIso = utcNowIso()
    const timeLabel = formatLocalTime(nowIso)
    const previewText = body || (img ? '📷 Photo' : '')
    const optimistic: ApiMsg = {
      id: localId,
      clientKey: localId,
      from: me?.id || '',
      to: contactId,
      text: previewText,
      image: img,
      time: nowIso,
      timeLabel,
      state: 'pending',
      mine: true,
      replyToId: replySnap?.id,
      replyToText: replySnap?.text || (replySnap?.image ? '📷 Photo' : undefined),
      statusReply: statusSnap,
    }
    // UI first — message window + chats home at the same time
    setMsgs((m) => [...m, optimistic])
    upsertChatPreview({
      contactId: (c as any).peerId || contactId,
      conversationId: conversationId || knownConv || undefined,
      last: previewText,
      time: timeLabel,
      iso: nowIso,
      unread: 0,
      mine: true,
      state: 'pending',
      name: c.name,
      photo: c.photo,
      hue: c.hue,
    })
    // Backend later
    void deliverMessage(localId, body, img, {
      replyToId: replySnap?.id,
      statusReply: statusSnap || undefined,
    })
  }

  const retryFailed = (m: ApiMsg) => {
    if (m.state !== 'failed') return
    const key = m.clientKey || m.id
    setMsgs((list) =>
      list.map((x) => (x.id === m.id || x.clientKey === key ? { ...x, state: 'pending' } : x)),
    )
    showToast('Retrying…')
    void deliverMessage(key, m.text === '📷 Photo' ? '' : m.text, m.image || null)
  }

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f || !f.type.startsWith('image/')) return
    if (f.size > 8 * 1024 * 1024) return
    const data = await fileToDataUrl(f)
    setPendingImage(data)
  }



  // Presence for this peer
  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const p = await api.presence(contactId)
        if (!alive) return
        setPeerOnline(!!p.online)
        setPeerLastSeen(p.lastSeen || null)
      } catch {
        /* */
      }
    }
    load()
    const id = setInterval(load, 30000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [contactId])

  // Live typing + presence from WS
  useEffect(() => {
    const onTyping = (ev: Event) => {
      const d = (ev as CustomEvent).detail as { peerId?: string; typing?: boolean }
      if (d?.peerId === contactId) setTyping(!!d.typing)
    }
    const onPresence = (ev: Event) => {
      // contacts store updates; also local
      const d = (ev as CustomEvent).detail as {
        peerId?: string
        online?: boolean
        lastSeen?: string | null
      }
      // detail from store dispatch uses peerId
    }
    window.addEventListener('sc:rt-typing', onTyping)
    return () => window.removeEventListener('sc:rt-typing', onTyping)
  }, [contactId])

  // Status swipe-up reply hands off via sessionStorage
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('sc_status_reply')
      if (!raw) return
      const data = JSON.parse(raw) as { peerId?: string; preview?: string; time?: string }
      sessionStorage.removeItem('sc_status_reply')
      if (data.peerId && data.peerId === contactId) {
        setStatusReply({ preview: data.preview || 'Status', time: data.time })
      }
    } catch {
      /* */
    }
  }, [contactId])

  // Merge call history for this peer into the timeline
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { calls } = await api.calls()
        if (!alive) return
        const peerCalls = (calls || []).filter((c: any) => c.contactId === contactId)
        if (!peerCalls.length) return
        setMsgs((prev) => {
          const existing = new Set(prev.filter((m) => m.callLog).map((m) => m.id))
          const extra: ApiMsg[] = peerCalls
            .filter((c: any) => !existing.has(`call-${c.id}`))
            .map((c: any) => {
              const iso = c.ago || c.created_at || c.time || ''
              return {
                id: `call-${c.id}`,
                clientKey: `call-${c.id}`,
                from: '',
                to: contactId,
                text: '',
                time: iso,
                timeLabel: c.time || '',
                mine: c.direction === 'out',
                callLog: {
                  kind: c.kind === 'video' ? 'video' : 'audio',
                  direction: c.direction || 'out',
                  status: c.status || 'completed',
                  duration: c.duration,
                },
              }
            })
          if (!extra.length) return prev
          const merged = [...prev, ...extra].sort((a, b) => {
            const ta = Date.parse(a.time) || 0
            const tb = Date.parse(b.time) || 0
            return ta - tb
          })
          return merged
        })
      } catch {
        /* */
      }
    })()
    return () => {
      alive = false
    }
  }, [contactId])

  return (
    <div className="flex h-full flex-col" style={{ background: WALLPAPERS[settings.wallpaper] || '#F3F4F6' }}>
      <header className="z-10 flex shrink-0 items-center gap-1 border-b border-gray-100 bg-white px-2 pb-3.5 pt-[max(1.5rem,calc(env(safe-area-inset-top)+0.75rem))] shadow-sm">
        <button
          type="button"
          aria-label="Back"
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100"
        >
          <ArrowLeft size={22} />
        </button>
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <Avatar contact={{ ...c, online: peerOnline || c.online }} size={44} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-extrabold leading-tight">{c.name}</p>
            <p className={`text-xs font-bold ${typing || peerOnline || c.online ? 'text-[#5C8A5E]' : 'text-gray-400'}`}>
              {typing
                ? 'typing…'
                : peerOnline || c.online
                  ? 'Online'
                  : peerLastSeen || (c as any).lastSeen
                    ? formatLastSeen(peerLastSeen || (c as any).lastSeen)
                    : ''}
            </p>
          </div>
        </button>
        <button
          type="button"
          aria-label="Voice call"
          onClick={() => onCall('audio')}
          className="flex h-10 w-10 items-center justify-center rounded-full text-brand-purple hover:bg-brand-purple/10"
        >
          <Phone size={21} />
        </button>
        <button
          type="button"
          aria-label="Video call"
          onClick={() => onCall('video')}
          className="flex h-10 w-10 m-r-2 items-center justify-center rounded-full text-brand-purple hover:bg-brand-purple/10"
        >
          <Video size={22} />
        </button>
      </header>

      <div
        className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4 pb-6"
        style={{ fontSize: FONT_SIZES[settings.fontSize] || '1rem' }}
      >
        <p className="mx-auto w-fit rounded-full bg-white px-3 py-1 text-xs font-extrabold text-gray-500 shadow-sm">
          Today
        </p>
        {loading && <p className="py-6 text-center text-sm font-bold text-gray-400">Loading…</p>}
        {!loading && msgs.length === 0 && (
          <p className="py-10 text-center font-bold text-gray-400">
            Say hi to {c.name.split(' ')[0]} and start your chat.
          </p>
        )}
        <AnimatePresence initial={false}>
          {msgs.map((m) => {
            const mine = m.mine ?? m.from === me?.id
            const key = m.clientKey || m.id
            const animateIn = !animatedKeys.current.has(key)
            if (animateIn) animatedKeys.current.add(key)
            return (
              <div
                key={key}
                ref={(el) => {
                  msgRefs.current[m.id] = el
                  if (m.clientKey) msgRefs.current[m.clientKey] = el
                }}
              >
                <MessageBubble
                  m={m}
                  mine={!!mine}
                  readReceipts={settings.readReceipts !== false}
                  animateIn={animateIn}
                  onRetry={retryFailed}
                  onReply={(msg) => setReplyTo(msg)}
                  onOpenCalls={onOpenCalls}
                  onJumpTo={(id) => msgRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                />
              </div>
            )
          })}
          {typing && (
            <motion.div
              key="typing"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex"
            >
              <div className="flex gap-1 rounded-3xl rounded-bl-md bg-white px-4 py-3.5 shadow-sm">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="h-2 w-2 rounded-full bg-gray-400"
                    animate={{ y: [0, -4, 0] }}
                    transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.15 }}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={end} className="h-2 shrink-0 pb-1" />
      </div>

      {pendingImage && (
        <div className="relative border-t border-gray-100 bg-white px-4 py-2">
          <img src={pendingImage} alt="" className="h-24 rounded-2xl object-cover" />
          <button
            type="button"
            onClick={() => setPendingImage(null)}
            className="absolute right-6 top-4 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white"
          >
            <X size={14} />
          </button>
        </div>
      )}


      {profileOpen && (
        <div className="absolute inset-0 z-40 flex flex-col bg-white">
          <div className="flex items-center gap-2 border-b border-gray-100 px-3 pb-3 pt-[max(1.25rem,env(safe-area-inset-top))]">
            <button type="button" onClick={() => setProfileOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100" aria-label="Back">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <p className="text-lg font-black">Contact info</p>
          </div>
          <div className="flex flex-1 flex-col items-center overflow-y-auto px-6 pb-10 pt-8">
            <div className="rounded-full bg-gradient-to-br from-brand-purple/15 to-brand-orange/10 p-1.5">
              <Avatar contact={{ ...c, online: peerOnline || c.online }} size={120} />
            </div>
            <h2 className="mt-4 text-2xl font-black text-ink">{c.name}</h2>
            {c.username ? <p className="mt-1 font-bold text-brand-purple">@{c.username}</p> : null}
            {c.phone ? <p className="mt-1 text-sm font-semibold text-gray-500">{c.phone}</p> : null}
            <p className={`mt-2 min-h-[1.25rem] text-sm font-bold ${typing || peerOnline || c.online ? 'text-[#5C8A5E]' : 'text-gray-400'}`}>
              {typing
                ? 'typing…'
                : peerOnline || c.online
                  ? 'Online'
                  : peerLastSeen || (c as any).lastSeen
                    ? formatLastSeen(peerLastSeen || (c as any).lastSeen)
                    : ''}
            </p>

            <div className="mt-8 grid w-full max-w-sm grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setProfileOpen(false)}
                className="flex flex-col items-center gap-1.5 rounded-2xl bg-gray-50 py-3.5 transition active:scale-95"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-purple/10 text-brand-purple">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </span>
                <span className="text-xs font-extrabold text-ink">Chat</span>
              </button>
              <button
                type="button"
                onClick={() => { setProfileOpen(false); onCall('audio') }}
                className="flex flex-col items-center gap-1.5 rounded-2xl bg-gray-50 py-3.5 transition active:scale-95"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-purple/10 text-brand-purple">
                  <Phone size={20} />
                </span>
                <span className="text-xs font-extrabold text-ink">Audio</span>
              </button>
              <button
                type="button"
                onClick={() => { setProfileOpen(false); onCall('video') }}
                className="flex flex-col items-center gap-1.5 rounded-2xl bg-gray-50 py-3.5 transition active:scale-95"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-purple/10 text-brand-purple">
                  <Video size={20} />
                </span>
                <span className="text-xs font-extrabold text-ink">Video</span>
              </button>
            </div>

            <div className="mt-8 w-full space-y-3">
              <div className="rounded-2xl bg-gray-50 px-4 py-3">
                <p className="text-[11px] font-black uppercase tracking-wide text-gray-400">Bio</p>
                <p className="mt-1 text-sm font-semibold text-ink">
                  {(c as any).bio || c.bio || 'No bio yet'}
                </p>
              </div>
              {c.phone ? (
                <div className="rounded-2xl bg-gray-50 px-4 py-3">
                  <p className="text-[11px] font-black uppercase tracking-wide text-gray-400">Phone</p>
                  <p className="mt-1 text-sm font-semibold text-ink">{c.phone}</p>
                </div>
              ) : null}
              {c.username ? (
                <div className="rounded-2xl bg-gray-50 px-4 py-3">
                  <p className="text-[11px] font-black uppercase tracking-wide text-gray-400">Username</p>
                  <p className="mt-1 text-sm font-semibold text-brand-purple">@{c.username}</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {emoji && (
        <div className="max-h-40 overflow-y-auto bg-gray-50 px-3 py-2">
          <div className="grid grid-cols-8 gap-1">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                className="flex h-9 w-full items-center justify-center rounded-lg text-xl transition hover:bg-white active:scale-90"
                onClick={() => setText((t) => t + e)}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="shrink-0 border-t border-gray-100 bg-white safe-pb">
        {(replyTo || statusReply) && (
          <div className="flex items-start gap-2 border-b border-gray-100 px-3 py-2.5">
            <div className="min-w-0 flex-1 border-l-4 border-brand-purple pl-2.5">
              <p className="text-[11px] font-black uppercase tracking-wide text-brand-purple">
                {statusReply ? 'Status reply' : 'Replying'}
              </p>
              <p className="line-clamp-2 text-xs font-semibold text-gray-600">
                {statusReply?.preview || replyTo?.text || (replyTo?.image ? '📷 Photo' : '')}
              </p>
              {statusReply?.time ? (
                <p className="mt-0.5 text-[10px] font-bold text-gray-400">{statusReply.time}</p>
              ) : null}
            </div>
            <button
              type="button"
              className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100"
              onClick={() => {
                setReplyTo(null)
                setStatusReply(null)
              }}
              aria-label="Cancel reply"
            >
              ✕
            </button>
          </div>
        )}
        <div className="flex items-center gap-1.5 px-2 py-3">
        <button
          type="button"
          onClick={() => setEmoji((e) => !e)}
          className="flex h-10 w-10 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
        >
          <Smile size={22} />
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex h-10 w-10 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
          aria-label="Send picture"
        >
          <ImagePlus size={22} />
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickImage} />
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            ;(window as any).__sc_type?.()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && settings.enterIsSend) {
              e.preventDefault()
              send()
            }
          }}
          placeholder="Message"
          className="h-11 flex-1 rounded-full bg-gray-100 px-4 text-[15px] font-semibold outline-none"
        />
        <button
          type="button"
          onClick={send}
          disabled={!text.trim() && !pendingImage}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-purple text-white shadow-md disabled:opacity-40"
        >
          <Send size={18} />
        </button>
        </div>
      </div>
    </div>
  )
}

export const ChatWindow = memo(ChatWindowInner)
