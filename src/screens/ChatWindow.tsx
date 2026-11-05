import { useCallback, useEffect, useRef, useState, memo, type ChangeEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Phone, Video, PhoneMissed, PhoneIncoming, PhoneOutgoing, Smile, Send, Check, CheckCheck, ImagePlus, X, Clock, RotateCcw, MoreVertical, BellOff, Bell, Volume2, Mic, Ban } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { api, hasAccessToken, type ApiMsg } from '../api'
import { utcNowIso, formatLocalTime, formatLastSeen, parseUtc } from '../time'
import { isRealtimeOpen, wsSendMessage, wsReceipt, wsLiveTyping, wsTyping } from '../realtime'
import { FONT_SIZES, WALLPAPERS, useStore } from '../store'
import { playInboxLandingChime } from '../lib/sounds'
import { compressForWeb } from '../lib/imageProcess'
import { getCachedMessages, setCachedMessages, hydrateThreadFromDisk } from '../lib/messageCache'
import { warmPhoto } from '../lib/photoCache'
import { putOutbox, removeOutbox } from '../lib/appCache'

type Props = { contactId: string; onBack: () => void; onCall: (kind: 'audio' | 'video') => void; onOpenCalls?: () => void; onOpenStatus?: (userId: string, statusId?: string) => void }

const REACT_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const
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

/** Never downgrade delivery state (pending → sent → delivered → read). */
function pickState(a?: string, b?: string): ApiMsg['state'] | undefined {
  if (!a && !b) return undefined
  if (!a) return b as ApiMsg['state']
  if (!b) return a as ApiMsg['state']
  return rankState(a) >= rankState(b) ? (a as ApiMsg['state']) : (b as ApiMsg['state'])
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
  highlight?: boolean
  onOpenAction?: () => void
  onOpenStatusReply?: (sr: { preview: string; time?: string; statusId?: string }) => void
  onOpenImage?: (url: string) => void
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
  highlight,
  onOpenAction,
  onOpenStatusReply,
  onOpenImage,
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
      onContextMenu={(e) => { e.preventDefault(); onOpenAction?.() }}
      onDoubleClick={() => onOpenAction?.()}
      onTouchEnd={() => {
        if (dx > 28) onReply?.(m)
        setDx(0)
      }}
      className={`relative flex ${mine ? 'justify-end' : 'justify-start'} ${highlight ? 'z-10' : ''}`}
    >
      <div
        role={mine && m.state === 'failed' ? 'button' : undefined}
        tabIndex={mine && m.state === 'failed' ? 0 : undefined}
        onClick={() => {
          if (mine && m.state === 'failed') onRetry(m)
        }}
        className={`relative max-w-[76%] ${m.reactions?.length ? 'mb-3 ' : ''}${
          mine
            ? 'bubble-mine rounded-2xl rounded-br-sm text-white shadow-[0_4px_18px_-6px_rgba(0,0,0,0.28)]'
            : 'rounded-2xl rounded-bl-sm bg-white text-ink shadow-[0_4px_16px_-8px_rgba(15,23,42,0.18)] ring-1 ring-black/[0.04]'
        } ${mine && m.state === 'failed' ? 'ring-2 ring-red-300/80' : ''} ${
          highlight ? 'ring-2 ring-brand-purple shadow-[0_0_0_6px_rgba(var(--brand-shadow-rgb),0.22)] transition-shadow duration-700' : 'transition-shadow duration-700'
        }`}
      >
        {m.statusReply && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onOpenStatusReply?.(m.statusReply!)
            }}
            className={`mx-2.5 mt-2 w-[calc(100%-1.25rem)] border-l-[3px] px-2.5 py-1.5 text-left text-[12px] font-semibold ${
              mine ? 'border-white/70 bg-white/12 text-white/90' : 'border-brand-purple/80 bg-gray-50 text-gray-600'
            }`}
          >
            <span className="block text-[10px] font-black uppercase tracking-wide opacity-70">Status reply</span>
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
            className={`mx-2.5 mt-2 flex w-[calc(100%-1.25rem)] gap-2 border-l-[3px] px-2.5 py-1.5 text-left text-[12px] font-semibold ${
              mine
                ? 'border-white/80 bg-white/12 text-white/90'
                : 'border-brand-purple bg-gray-50/90 text-gray-600'
            }`}
          >
            <span className="line-clamp-2">{m.replyToText || 'Original message'}</span>
          </button>
        )}
        {m.image && (
          <button
            type="button"
            className="block w-full overflow-hidden"
            onClick={(e) => {
              e.stopPropagation()
              onOpenImage?.(mediaUrl(m.image))
            }}
          >
            <img
              src={mediaUrl(m.image)}
              alt=""
              className={`max-h-60 w-full object-cover ${m.text && m.text !== '📷 Photo' ? '' : 'rounded-b-none'}`}
              loading="lazy"
            />
          </button>
        )}

        {m.text && /^🎤 Voice note/.test(m.text) && (
          <div className={`flex items-center gap-3 px-3 py-2.5 ${mine ? '' : ''}`}>
            <button
              type="button"
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                mine ? 'bg-white/25 text-white' : 'bg-brand-purple/15 text-brand-purple'
              }`}
              aria-label="Play voice note"
              onClick={(e) => {
                e.stopPropagation()
                // placeholder: real audio src when media attached
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </button>
            <div className="min-w-0 flex-1">
              <div className={`flex h-8 items-center gap-0.5 ${mine ? 'opacity-90' : 'opacity-70'}`}>
                {Array.from({ length: 28 }).map((_, i) => (
                  <span
                    key={i}
                    className={`w-[3px] rounded-full ${mine ? 'bg-white' : 'bg-brand-purple'}`}
                    style={{ height: `${6 + ((i * 7) % 18)}px` }}
                  />
                ))}
              </div>
              <p className={`mt-0.5 text-[11px] font-bold ${mine ? 'text-white/75' : 'text-gray-500'}`}>
                {m.text.replace(/^🎤\s*/, '') || 'Voice note'}
              </p>
            </div>
          </div>
        )}

        {m.text && m.text !== '📷 Photo' && !/^🎤 Voice note/.test(m.text) && (
          <p className="px-3.5 pt-2.5 text-[15px] font-semibold leading-[1.35] tracking-[-0.01em]">{m.text}</p>
        )}

        <p
          className={`flex items-center justify-end gap-1 px-3.5 pb-1.5 pt-0.5 text-[10px] font-bold tracking-wide ${
            mine ? 'text-white/70' : 'text-gray-400'
          }`}
        >
          {(m as any).edited ? <span className="mr-0.5 opacity-80">edited</span> : null}
          {m.timeLabel ||
            new Date(m.time).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            })}
          <ReceiptTicks state={m.state} readReceipts={readReceipts} mine={mine} />
        </p>
        {/* Reactions sit on the bubble edge (inside layout, not off-screen) */}
        {!!(m.reactions && m.reactions.length) && (
          <div
            className={`absolute -bottom-2.5 flex max-w-full flex-wrap gap-0.5 ${
              mine ? 'right-2' : 'left-2'
            }`}
          >
            {Object.entries(
              (m.reactions || []).reduce((acc: Record<string, number>, r: any) => {
                const e = typeof r === 'string' ? r : r.emoji
                if (!e) return acc
                acc[e] = (acc[e] || 0) + 1
                return acc
              }, {} as Record<string, number>),
            ).map(([emoji, count]) => (
              <span
                key={emoji}
                className="flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-1.5 text-[12px] shadow-sm ring-1 ring-black/8"
              >
                {emoji}
                {(count as number) > 1 ? (
                  <span className="ml-0.5 text-[10px] font-black text-gray-500">{count as number}</span>
                ) : null}
              </span>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
})

function ChatWindowInner({ contactId, onBack, onCall, onOpenCalls, onOpenStatus }: Props) {
  const { settings, contacts, chats, me, showToast, upsertChatPreview, statusList } = useStore()
  // Resolve peer from contacts, or from an existing chat preview (notifications may pass contactId)
  const chatPreview =
    chats.find(
      (ch) =>
        ch.contactId === contactId ||
        ch.conversationId === contactId,
    ) || null
  const peerId = chatPreview?.contactId || contactId
  const contactHit = contacts.find((x) => x.id === peerId || x.peerId === peerId)
  // Prefer contact book photo, fall back to chat-list photo (never force null)
  const c = contactHit
    ? {
        ...contactHit,
        photo: contactHit.photo || chatPreview?.photo || null,
        name: contactHit.name || chatPreview?.name || peerId,
        hue:
          contactHit.hue ||
          (chatPreview?.hue as [string, string]) ||
          (['#7B2CBF', '#6389EB'] as [string, string]),
      }
    : chatPreview
      ? {
          id: peerId,
          name: chatPreview.name || peerId,
          username: (chatPreview as any).username || '',
          phone: '',
          bio: '',
          photo: chatPreview.photo ?? null,
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
        }
  const knownConv =
    chatPreview?.conversationId ||
    chats.find((ch) => ch.contactId === peerId || ch.contactId === (c as any).peerId)
      ?.conversationId ||
    null
  // Ensure avatar photo is warmed whenever we open this chat
  useEffect(() => {
    if (c?.photo) warmPhoto(String(c.id || peerId), c.photo, API_ORIGIN)
  }, [peerId, c?.photo, c?.id])

  const [conversationId, setConversationId] = useState<string | null>(knownConv)
  const [msgs, setMsgs] = useState<ApiMsg[]>([])
  const [text, setText] = useState(() => {
    try {
      const map = JSON.parse(localStorage.getItem('sc_composer_drafts') || '{}')
      return typeof map[contactId] === 'string' ? map[contactId] : ''
    } catch { return '' }
  })
  const [typing, setTyping] = useState(false)
  const [peerRecording, setPeerRecording] = useState(false)
  const [liveDraft, setLiveDraft] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<ApiMsg | null>(null)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [blockOpen, setBlockOpen] = useState(false)
  const [blocking, setBlocking] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordSecs, setRecordSecs] = useState(0)
  const mediaRecRef = useRef<MediaRecorder | null>(null)
  const recordChunks = useRef<Blob[]>([])
  const recordTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const [editText, setEditText] = useState('')
  const [editing, setEditing] = useState(false)
  const [forwardOpen, setForwardOpen] = useState(false)

  const [emoji, setEmoji] = useState(false)
  const [loading, setLoading] = useState(true)
  const [pendingImage, setPendingImage] = useState<string | null>(null)
  const [replyTo, setReplyTo] = useState<ApiMsg | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [peerOnline, setPeerOnline] = useState(false)
  const [peerLastSeen, setPeerLastSeen] = useState<string | null>(null)
  const [chatMenu, setChatMenu] = useState(false)
  const [chatMuted, setChatMuted] = useState(() => {
    try {
      const map = JSON.parse(localStorage.getItem('sc_chat_muted') || '{}')
      return !!map[contactId]
    } catch {
      return false
    }
  })
  const [statusReply, setStatusReply] = useState<{ preview: string; time?: string; statusId?: string } | null>(null)
  const prevMsgCountRef = useRef(0)
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null)

  // Auto-focus composer when starting a reply (message swipe or status)
  useEffect(() => {
    if (replyTo || statusReply) {
      // Next frame so the reply bar is mounted
      requestAnimationFrame(() => {
        inputRef.current?.focus()
      })
    }
  }, [replyTo, statusReply])
  const msgRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const end = useRef<HTMLDivElement>(null)
  const msgsScrollRef = useRef<HTMLDivElement>(null)
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
    const peer = peerId || contactId
    if (!username && !peer) {
      showToast('Could not open chat — contact is missing')
      return null
    }
    ensurePromise.current = (async () => {
      try {
        const preview = await api.openPrivateChat(
          username ? { username, userId: peer } : { userId: peer },
        )
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
      // Paint disk/memory cache immediately (no blank thread)
      const cached = getCachedMessages(cid)
      if (cached?.length) {
        setMsgs((prev) => (prev.length ? prev : cached))
        if (!silent) setLoading(false)
      }
      const { messages } = await api.messages(cid, { limit: 50 })
      // Incoming messages we just pulled: ack delivered before/while painting (no await)
      for (const m of messages) {
        const mine = m.mine ?? m.from === me?.id
        if (!mine && m.id && !String(m.id).startsWith('local-')) {
          void api.markDelivered(m.id).catch(() => {})
        }
      }
      setMsgs((prev) => {
        // Merge server history into UI — NEVER drop a bubble already on screen
        // (server lag / partial pages used to wipe messages for a few seconds)
        const prevById = new Map(prev.map((m) => [m.id, m]))
        const claimedKeys = new Set<string>()
        const claimedIds = new Set<string>()
        const mapped = messages.map((sm) => {
          const prior = prevById.get(sm.id)
          if (prior) {
            if (prior.clientKey) claimedKeys.add(prior.clientKey)
            claimedIds.add(prior.id)
            claimedIds.add(sm.id)
            return {
              ...sm,
              clientKey: prior.clientKey || sm.clientKey || sm.id,
              mine: prior.mine ?? sm.mine,
              state: pickState(sm.state, prior.state),
              edited: !!(prior as any).edited || !!(sm as any).edited,
              text: sm.text || prior.text,
              image: sm.image ?? prior.image,
              timeLabel: sm.timeLabel || prior.timeLabel,
              replyToId: sm.replyToId || prior.replyToId,
              replyToText: sm.replyToText || prior.replyToText,
            }
          }
          // Match optimistic local by clientKey or same body + direction
          const byCk =
            (sm as any).clientKey &&
            prev.find(
              (p) =>
                p.clientKey === (sm as any).clientKey &&
                !claimedKeys.has(p.clientKey as string),
            )
          const match =
            byCk ||
            prev.find(
              (p) =>
                String(p.id).startsWith('local-') &&
                p.clientKey &&
                !claimedKeys.has(p.clientKey) &&
                (p.mine ?? true) &&
                (p.text === sm.text ||
                  (!!p.image && !!sm.image && p.image === sm.image)) &&
                (!!p.image === !!sm.image),
            )
          if (match) {
            if (match.clientKey) claimedKeys.add(match.clientKey)
            claimedIds.add(match.id)
            claimedIds.add(sm.id)
            return {
              ...sm,
              clientKey: match.clientKey || sm.id,
              mine: match.mine ?? true,
              state: pickState(sm.state, match.state),
              text: sm.text || match.text,
              image: sm.image ?? match.image,
              timeLabel: sm.timeLabel || match.timeLabel,
              replyToId: sm.replyToId || match.replyToId,
              replyToText: sm.replyToText || match.replyToText,
            }
          }
          claimedIds.add(sm.id)
          return { ...sm, clientKey: (sm as any).clientKey || sm.id }
        })
        // Keep every on-screen row the server did not claim (local OR real ids)
        const keepPrev = prev.filter((m) => {
          if (claimedIds.has(m.id)) return false
          if (m.clientKey && claimedKeys.has(m.clientKey)) return false
          return true
        })
        const merged = [...mapped, ...keepPrev].sort((a, b) => {
          const ta = Date.parse(a.time) || 0
          const tb = Date.parse(b.time) || 0
          return ta - tb
        })
        // Dedupe by clientKey preferring server ids over local-
        const byKey = new Map<string, (typeof merged)[0]>()
        for (const m of merged) {
          const k = m.clientKey || m.id
          const existing = byKey.get(k)
          if (!existing) {
            byKey.set(k, m)
            continue
          }
          // Prefer non-local id and higher receipt state
          const prefer =
            (!String(m.id).startsWith('local-') && String(existing.id).startsWith('local-')) ||
            rankState(m.state) > rankState(existing.state)
          byKey.set(k, prefer ? { ...existing, ...m, clientKey: k, state: pickState(m.state, existing.state) } : {
            ...m,
            ...existing,
            clientKey: k,
            state: pickState(existing.state, m.state),
          })
        }
        const stable = Array.from(byKey.values()).sort(
          (a, b) => (Date.parse(a.time) || 0) - (Date.parse(b.time) || 0),
        )
        if (sameMsgList(prev, stable)) return prev
        if (!stable.length && prev.length) return prev
        setCachedMessages(cid, stable)
        return stable
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
    // Fresh open: do NOT animate history — only new/outgoing later
    animatedKeys.current = new Set()
    setConversationId(knownConv)
    convRef.current = knownConv
    const seedKeys = (list: ApiMsg[]) => {
      for (const m of list) {
        const k = m.clientKey || m.id
        if (k) animatedKeys.current.add(k)
      }
    }
    // Instant paint from memory/disk cache for this thread
    if (knownConv) {
      const mem = getCachedMessages(knownConv)
      if (mem?.length) {
        seedKeys(mem)
        setMsgs(mem)
        setLoading(false)
        // Jump to latest without animation
        requestAnimationFrame(() => {
          end.current?.scrollIntoView({ behavior: 'auto', block: 'end' })
        })
      } else {
        setMsgs([])
        void hydrateThreadFromDisk(knownConv).then((disk) => {
          if (disk?.length && convRef.current === knownConv) {
            seedKeys(disk)
            setMsgs(disk)
            setLoading(false)
            requestAnimationFrame(() => {
              end.current?.scrollIntoView({ behavior: 'auto', block: 'end' })
            })
          }
        })
      }
    } else {
      setMsgs([])
    }
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
      if (hasAccessToken() && document.visibilityState === 'visible') load(true)
    }, 20000)
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
          reply_to_message_id?: string | null
          reply_to_text?: string | null
        }
        mine?: boolean
      }
      if (!detail?.cid || !detail?.m?.id) return
      const openCid = convRef.current
      if (!openCid || detail.cid !== openCid) return
      const mine = detail.mine ?? detail.m.from === me?.id
      let text = detail.m.text || (detail.m.image ? '📷 Photo' : '')
      let statusReply: { preview: string; time?: string; statusId?: string } | null = null
      const sr = text.match(/^⟦status⟧([\s\S]*?)⟦t⟧([\s\S]*?)(?:⟦id⟧([\s\S]*?))?⟦\/⟧([\s\S]*)$/)
      if (sr) {
        statusReply = { preview: sr[1], time: sr[2] || undefined, statusId: sr[3] || undefined }
        text = sr[4]
      }
      const incoming = {
        id: detail.m.id,
        clientKey: detail.m.id,
        from: detail.m.from,
        to: contactId,
        text,
        image: detail.m.image || null,
        time: detail.m.time || new Date().toISOString(),
        timeLabel: new Date(detail.m.time || Date.now()).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }),
        state: (detail.m.state as any) || (mine ? 'sent' : undefined),
        mine,
        replyToId: detail.m.reply_to_message_id || null,
        replyToText: detail.m.reply_to_text || null,
        statusReply,
      }
      // Delivered was already fired in the store handler before this event.
      setMsgs((prev) => {
        if (prev.some((x) => x.id === incoming.id || x.clientKey === incoming.id)) return prev
        // Dedupe optimistic / near-duplicate (same body + direction within a few seconds)
        const near = prev.find((x) => {
          if ((x.mine ?? false) !== mine) return false
          if ((x.text || '') !== (incoming.text || '')) return false
          if (!!x.image !== !!incoming.image) return false
          const dt = Math.abs((Date.parse(x.time) || 0) - (Date.parse(incoming.time) || 0))
          return dt < 15000
        })
        if (near) {
          return prev.map((x) =>
            x === near || x.id === near.id || (near.clientKey && x.clientKey === near.clientKey)
              ? {
                  ...x,
                  id: incoming.id || x.id,
                  clientKey: x.clientKey || near.clientKey || incoming.id,
                  state: rankState(incoming.state) >= rankState(x.state) ? (incoming.state as any) : x.state,
                  time: incoming.time || x.time,
                }
              : x,
          )
        }
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
                state: pickState((detail.s as any) || 'sent', x.state),
                time: detail.ts || x.time,
                timeLabel: detail.ts ? formatLocalTime(detail.ts) : x.timeLabel,
              }
            : x,
        ),
      )
      if (detail.ck) void removeOutbox(detail.ck)
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

  // Live typing stream (all users) — character-level draft to peer via WS
  const liveSendRef = useRef<{ last: string; at: number }>({ last: '', at: 0 })
  const liveClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pushLiveDraft = useCallback(
    (draft: string) => {
      // Optional privacy only — live character stream is for ALL users by default
      if ((settings as any).hideLiveTyping) return
      const to = peerId || contactId
      if (!to || !hasAccessToken()) return
      // Skip only exact identical re-sends (not character changes / deletes)
      if (draft === liveSendRef.current.last) return
      liveSendRef.current = { last: draft, at: Date.now() }
      try {
        if (isRealtimeOpen()) {
          // Always stream full draft so peer sees h → hi → (delete) → "" live in the bubble
          wsLiveTyping(to, draft)
        } else if (settings.typingIndicator && draft.length > 0) {
          void api.setTyping(to).catch(() => {})
        }
      } catch {
        /* */
      }
    },
    [peerId, contactId, settings],
  )

  useEffect(() => {
    return () => {
      if (liveClearTimer.current) clearTimeout(liveClearTimer.current)
      // Clear peer's live preview when leaving the chat
      const to = peerId || contactId
      if (to && isRealtimeOpen() && !(settings as any).hideLiveTyping) {
        try {
          wsLiveTyping(to, '')
          wsTyping(to, false)
        } catch {
          /* */
        }
      }
    }
  }, [peerId, contactId, settings])

  const openedOnce = useRef(false)
  const pinToBottom = (smooth = false) => {
    const el = msgsScrollRef.current
    if (el) {
      if (smooth) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      } else {
        el.scrollTop = el.scrollHeight
      }
      return
    }
    end.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' })
  }
  useEffect(() => {
    const smooth = openedOnce.current
    // Double rAF + microtask so layout finishes before pin (no gap under last bubble)
    requestAnimationFrame(() => {
      pinToBottom(smooth)
      requestAnimationFrame(() => pinToBottom(smooth))
    })
    openedOnce.current = true
  }, [msgs.length, pendingImage, liveDraft, loading])
  useEffect(() => {
    openedOnce.current = false
  }, [contactId])

  // Chime only when a NEW peer message is printed (never on history load / receipt merge)
  const knownMsgIdsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    // Seed on first non-empty paint without sound
    if (knownMsgIdsRef.current.size === 0 && msgs.length) {
      for (const m of msgs) knownMsgIdsRef.current.add(m.clientKey || m.id)
      return
    }
    if (chatMuted) {
      for (const m of msgs) knownMsgIdsRef.current.add(m.clientKey || m.id)
      return
    }
    let played = false
    for (const m of msgs) {
      const k = m.clientKey || m.id
      if (knownMsgIdsRef.current.has(k)) continue
      knownMsgIdsRef.current.add(k)
      const mine = m.mine ?? m.from === me?.id
      if (!mine && !played) {
        playInboxLandingChime()
        played = true
      }
    }
  }, [msgs, chatMuted, me?.id])
  useEffect(() => {
    knownMsgIdsRef.current = new Set()
  }, [contactId])

  const deliverMessage = async (
    localId: string,
    body: string,
    img: string | null,
    opts?: { replyToId?: string; statusReply?: { preview: string; time?: string; statusId?: string } },
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
      let wsText = body || ''
      if (opts?.statusReply) {
        const sid = opts.statusReply.statusId ? `⟦id⟧${opts.statusReply.statusId}` : ''
        wsText = `⟦status⟧${opts.statusReply.preview || ''}⟦t⟧${opts.statusReply.time || ''}${sid}⟦/⟧${wsText}`
      }
      const usedWs = isRealtimeOpen() && wsSendMessage({
        conversationId: cid,
        text: wsText,
        clientKey: localId,
        image: img,
        replyToId: opts?.replyToId || undefined,
      })
      if (usedWs) {
        // Ack arrives via sc:rt-ack / store onAck → updates ticks to sent
        // Optimistic already shows pending; WS ack will flip to sent
        return
      }
      const { message } = await api.send(cid, body || (img ? '📷 Photo' : ''), img, opts)
      // In-place receipt update only — never replace/remove the printed bubble
      setMsgs((m) =>
        m.map((x) =>
          x.id === localId || x.clientKey === localId
            ? {
                ...x,
                id: message.id || x.id,
                clientKey: x.clientKey || localId,
                mine: true,
                state: pickState(message.state || 'sent', x.state),
                timeLabel: x.timeLabel || message.timeLabel,
                time: x.time || message.time,
                text: x.text || message.text,
                image: x.image ?? message.image,
                replyToId: x.replyToId || message.replyToId || null,
                replyToText: x.replyToText || message.replyToText || null,
                statusReply: x.statusReply || message.statusReply || null,
              }
            : x,
        ),
      )
      void removeOutbox(localId)
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
    // Stop live preview on peer as soon as we send
    pushLiveDraft('')
    try {
      const map = JSON.parse(localStorage.getItem('sc_composer_drafts') || '{}')
      delete map[contactId]
      localStorage.setItem('sc_composer_drafts', JSON.stringify(map))
    } catch { /* */ }

    const localId = `local-${Date.now()}`
    const nowIso = utcNowIso()
    const timeLabel = formatLocalTime(nowIso)
    const previewText = statusSnap
      ? (body ? `Status reply: ${body}` : 'Status reply')
      : body || (img ? '📷 Photo' : '')
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
    // Persist unsent until server ack (survives refresh)
    void putOutbox({
      id: localId,
      conversationId: conversationId || knownConv || '',
      contactId: (c as any).peerId || contactId,
      text: body,
      image: img,
      createdAt: nowIso,
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

  const onPickImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f || !f.type.startsWith('image/')) return
    if (f.size > 25 * 1024 * 1024) {
      showToast('Image is too large')
      return
    }
    try {
      // Compress + optimize for web; do not crop
      const data = await compressForWeb(f)
      setPendingImage(data)
    } catch {
      showToast('Could not process image')
    }
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

  // Live typing + presence from WS (match contactId or resolved peerId)
  useEffect(() => {
    const isPeer = (id?: string) =>
      !!id && (id === contactId || id === peerId || id === (c as any)?.peerId)

    const onTyping = (ev: Event) => {
      const d = (ev as CustomEvent).detail as { peerId?: string; typing?: boolean }
      if (!isPeer(d?.peerId)) return
      // Header only — never put draft text here
      setTyping(!!d.typing)
      // Only clear the bubble when peer fully stops (not on every keypress)
      if (!d.typing) setLiveDraft(null)
    }
    const onRec = (ev: Event) => {
      const d = (ev as CustomEvent).detail as { peerId?: string; recording?: boolean }
      if (isPeer(d?.peerId)) setPeerRecording(!!d.recording)
    }
    const onLive = (ev: Event) => {
      const d = (ev as CustomEvent).detail as { peerId?: string; draft?: string }
      if (!isPeer(d?.peerId)) return
      // Full draft string: "h" → "hi" → "" as they type/delete
      const draft = typeof d.draft === 'string' ? d.draft : ''
      setLiveDraft(draft.length > 0 ? draft : null)
      setTyping(draft.length > 0)
      if (liveClearTimer.current) clearTimeout(liveClearTimer.current)
      // Safety clear if peer goes idle without sending empty draft
      if (draft.length > 0) {
        liveClearTimer.current = setTimeout(() => {
          setLiveDraft(null)
          setTyping(false)
        }, 6000)
      }
    }
    window.addEventListener('sc:rt-typing', onTyping)
    window.addEventListener('sc:rt-recording', onRec)
    window.addEventListener('sc:rt-live-typing', onLive)
    return () => {
      window.removeEventListener('sc:rt-typing', onTyping)
      window.removeEventListener('sc:rt-recording', onRec)
      window.removeEventListener('sc:rt-live-typing', onLive)
      if (liveClearTimer.current) clearTimeout(liveClearTimer.current)
    }
  }, [contactId, peerId])


  const applyEdit = async () => {
    if (!actionMsg || !editText.trim()) return
    const id = actionMsg.id
    const text = editText.trim()
    setMsgs((list) => list.map((m) => (m.id === id ? { ...m, text, edited: true } : m)))
    setEditing(false)
    setActionMsg(null)
    try {
      await api.editMessage(id, text)
    } catch {
      showToast('Could not edit message')
    }
  }

  const applyDelete = async () => {
    if (!actionMsg) return
    const id = actionMsg.id
    setMsgs((list) =>
      list.map((m) =>
        m.id === id ? { ...m, deleted: true, text: '', image: null } : m,
      ),
    )
    setActionMsg(null)
    try {
      await api.deleteMessage(id)
    } catch {
      showToast('Could not delete')
    }
  }

  const applyReact = async (emoji: string) => {
    if (!actionMsg) return
    const id = actionMsg.id
    const meId = me?.id
    setMsgs((list) =>
      list.map((m) => {
        if (m.id !== id) return m
        // One reaction per user: drop my previous, set new (or clear if same)
        const others = (m.reactions || []).filter((r: any) => r.user_id && meId && r.user_id !== meId)
        const minePrev = (m.reactions || []).find((r: any) => !r.user_id || (meId && r.user_id === meId))
        const same = minePrev && (minePrev.emoji === emoji)
        const reactions = same
          ? others
          : [...others, { emoji, user_id: meId }]
        return { ...m, reactions }
      }),
    )
    setActionMsg(null)
    try {
      await api.reactMessage(id, emoji)
    } catch {
      /* */
    }
  }

  const applyForward = async (conversationId: string) => {
    if (!actionMsg) return
    try {
      await api.forwardMessage(actionMsg.id, conversationId)
      showToast('Forwarded')
    } catch {
      showToast('Could not forward')
    }
    setForwardOpen(false)
    setActionMsg(null)
  }

  // Status swipe-up reply hands off via sessionStorage
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('sc_status_reply')
      if (!raw) return
      const data = JSON.parse(raw) as {
        peerId?: string
        preview?: string
        time?: string
        statusId?: string
      }
      sessionStorage.removeItem('sc_status_reply')
      if (data.peerId && data.peerId === contactId) {
        setStatusReply({
          preview: data.preview || 'Status',
          time: data.time,
          statusId: data.statusId,
        })
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
      <header className="z-10 flex shrink-0 items-center gap-1 border-b border-white/40 bg-white/80 backdrop-blur-md px-2 pb-3.5 pt-[max(1.5rem,calc(env(safe-area-inset-top)+0.75rem))] shadow-sm">
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
          <Avatar contact={{ ...c, online: peerOnline || c.online, premium: !!(c as any).premium || (c as any).subscriptionPlan === 'premium' }} size={44} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-extrabold leading-tight">{c.name}</p>
            <p
              className={`truncate text-xs font-bold ${
                peerRecording || liveDraft || typing || peerOnline || c.online
                  ? 'text-brand-blue'
                  : 'text-gray-400'
              }`}
            >
              {peerRecording
                ? 'recording…'
                : liveDraft || typing
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
          className="flex h-10 w-10 items-center justify-center rounded-full text-brand-purple hover:bg-brand-purple/10"
        >
          <Video size={22} />
        </button>
        <div className="relative">
          <button
            type="button"
            aria-label="Chat options"
            onClick={() => setChatMenu((m) => !m)}
            className="flex h-10 w-10 items-center justify-center rounded-full text-brand-purple hover:bg-brand-purple/10"
          >
            <MoreVertical size={20} />
          </button>
          {chatMenu && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-40"
                aria-label="Close menu"
                onClick={() => setChatMenu(false)}
              />
              <div className="absolute right-0 top-11 z-50 w-52 overflow-hidden rounded-2xl bg-white py-1.5 shadow-xl ring-1 ring-black/5">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-bold hover:bg-gray-50"
                  onClick={() => {
                    setChatMuted((m) => {
                      const next = !m
                      try {
                        const map = JSON.parse(localStorage.getItem('sc_chat_muted') || '{}')
                        map[contactId] = next
                        localStorage.setItem('sc_chat_muted', JSON.stringify(map))
                      } catch { /* ignore */ }
                      return next
                    })
                    setChatMenu(false)
                    showToast?.(chatMuted ? 'Chat unmuted' : 'Chat muted')
                  }}
                >
                  {chatMuted ? <Bell size={18} className="text-brand-purple" /> : <BellOff size={18} className="text-brand-purple" />}
                  {chatMuted ? 'Unmute notifications' : 'Mute notifications'}
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-bold hover:bg-gray-50"
                  onClick={() => {
                    setChatMenu(false)
                    showToast?.('Custom ringtones coming soon')
                  }}
                >
                  <Volume2 size={18} className="text-brand-purple" />
                  Custom ringtone
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-bold text-brand-red hover:bg-red-50"
                  onClick={() => {
                    setChatMenu(false)
                    setBlockOpen(true)
                  }}
                >
                  <Ban size={18} />
                  Block
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      <div
        ref={msgsScrollRef}
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
                      onOpenAction={() => setActionMsg(m)}
                  m={m}
                  mine={!!mine}
                  readReceipts={settings.readReceipts !== false}
                  animateIn={animateIn}
                  onRetry={retryFailed}
                  onReply={(msg) => {
                    setReplyTo(msg)
                    requestAnimationFrame(() => inputRef.current?.focus())
                  }}
                  onOpenCalls={onOpenCalls}
                  onJumpTo={(id) => {
                    const el = msgRefs.current[id]
                    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                    setHighlightId(id)
                    window.setTimeout(() => setHighlightId((h) => (h === id ? null : h)), 1200)
                  }}
                  highlight={highlightId === m.id}
                  onOpenImage={(url) => setLightboxUrl(url)}
                  onOpenStatusReply={(sr) => {
                    if (!sr.statusId) {
                      showToast('This status is no longer available')
                      return
                    }
                    const found = (statusList || []).find((s: any) => s.id === sr.statusId)
                    if (!found) {
                      showToast('This status is no longer available')
                      return
                    }
                    const exp = found.expiresAt ? Date.parse(found.expiresAt) : NaN
                    if (!Number.isNaN(exp) && exp <= Date.now()) {
                      showToast('This status has expired')
                      return
                    }
                    onOpenStatus?.(found.userId || contactId, sr.statusId)
                  }}
                />
              </div>
            )
          })}
          {/* Live character bubble — recipient sees h → hi → deletes in real time */}
          {liveDraft != null && liveDraft !== '' && (
            <motion.div
              key="live-typing"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="flex"
            >
              <div className="max-w-[85%] rounded-3xl rounded-bl-md bg-white px-3.5 py-2.5 shadow-sm ring-1 ring-brand-purple/15">
                <p className="whitespace-pre-wrap break-words font-mono text-[14px] font-medium leading-snug tracking-tight text-ink">
                  {liveDraft}
                  <span
                    className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[2px] bg-brand-purple align-middle"
                    style={{ animation: 'sc-caret 1s steps(1) infinite' }}
                  />
                </p>
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


      
      {actionMsg && !editing && !forwardOpen && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={() => setActionMsg(null)}>
          <div className="rounded-t-3xl bg-white px-4 pb-8 pt-3" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-200" />
            <div className="mb-3 flex justify-center gap-2">
              {REACT_EMOJIS.map((e) => (
                <button key={e} type="button" className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-xl active:scale-90" onClick={() => applyReact(e)}>
                  {e}
                </button>
              ))}
            </div>
            <div className="divide-y divide-gray-100 overflow-hidden rounded-2xl bg-gray-50">
              {actionMsg.mine && !actionMsg.deleted && (
                <button type="button" className="flex w-full px-4 py-3.5 text-left font-bold" onClick={() => { setEditText(actionMsg.text || ''); setEditing(true) }}>Edit</button>
              )}
              <button
                type="button"
                className="flex w-full px-4 py-3.5 text-left font-bold"
                onClick={async () => {
                  const t = actionMsg.text || ''
                  try {
                    await navigator.clipboard.writeText(t)
                    showToast('Copied')
                  } catch {
                    showToast('Could not copy')
                  }
                  setActionMsg(null)
                }}
              >
                Copy
              </button>
              <button type="button" className="flex w-full px-4 py-3.5 text-left font-bold" onClick={() => setForwardOpen(true)}>Forward</button>
              {actionMsg.mine && !actionMsg.deleted && (
                <button type="button" className="flex w-full px-4 py-3.5 text-left font-bold text-brand-red" onClick={() => void applyDelete()}>Delete for everyone</button>
              )}
              <button type="button" className="flex w-full px-4 py-3.5 text-left font-bold text-gray-500" onClick={() => setActionMsg(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {editing && actionMsg && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end bg-black/40">
          <div className="rounded-t-3xl bg-white p-4 pb-8">
            <p className="mb-2 text-sm font-extrabold text-gray-500">Edit message</p>
            <textarea value={editText} onChange={(e) => setEditText(e.target.value)} className="min-h-[80px] w-full rounded-2xl bg-gray-100 p-3 font-semibold outline-none" />
            <div className="mt-3 flex gap-2">
              <button type="button" className="flex-1 rounded-full bg-gray-100 py-3 font-extrabold" onClick={() => { setEditing(false); setActionMsg(null) }}>Cancel</button>
              <button type="button" className="flex-1 rounded-full bg-brand-purple py-3 font-extrabold text-white" onClick={() => void applyEdit()}>Save</button>
            </div>
          </div>
        </div>
      )}

      {forwardOpen && actionMsg && (
        <div className="absolute inset-0 z-50 flex flex-col bg-white">
          <div className="flex items-center gap-2 border-b border-gray-100 px-3 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
            <button type="button" onClick={() => { setForwardOpen(false); setActionMsg(null) }} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100">✕</button>
            <p className="text-lg font-black">Forward to…</p>
          </div>
          <ul className="flex-1 overflow-y-auto px-2 py-2">
            {chats.filter((c) => c.conversationId && c.conversationId !== conversationId).map((c) => (
              <li key={c.conversationId}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left hover:bg-gray-50"
                  onClick={() => void applyForward(c.conversationId!)}
                >
                  <Avatar contact={{ id: c.contactId, name: c.name || 'Chat', hue: ['#7B2CBF', '#6389EB'] }} size={44} />
                  <span className="font-bold">{c.name || 'Chat'}</span>
                </button>
              </li>
            ))}
            {chats.filter((c) => c.conversationId && c.conversationId !== conversationId).length === 0 && (
              <p className="px-4 py-10 text-center font-bold text-gray-400">No other chats yet</p>
            )}
          </ul>
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
            <div className="flex w-full items-center justify-center">
              <div className="flex h-[140px] w-[140px] items-center justify-center rounded-full bg-gradient-to-br from-brand-purple/15 to-brand-orange/10">
                <Avatar
                  contact={{
                    ...c,
                    online: peerOnline || c.online,
                    premium:
                      !!(c as any).premium ||
                      !!(c as any).verifiedBadge ||
                      (c as any).subscriptionPlan === 'premium',
                  }}
                  size={120}
                />
              </div>
            </div>
            <h2 className="mt-4 text-2xl font-black text-ink">{c.name}</h2>
            {c.username ? <p className="mt-1 font-bold text-brand-purple">@{c.username}</p> : null}
            {c.phone ? <p className="mt-1 text-sm font-semibold text-gray-500">{c.phone}</p> : null}
            <p
              className={`mt-2 min-h-[1.25rem] max-w-sm px-4 text-center text-sm font-bold ${
                liveDraft || typing || peerOnline || c.online ? 'text-brand-blue' : 'text-gray-400'
              }`}
            >
              {liveDraft || typing
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

      <div className="shrink-0 safe-pb bg-transparent">
        <div className="bg-transparent pt-1">
        {(replyTo || statusReply) && (
          <div className="mx-2 mb-1 flex items-start gap-2 rounded-2xl bg-white/90 px-3 py-2.5 shadow-sm backdrop-blur-md">
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
        {recording ? (
          <div className="flex items-center gap-3 px-3 py-2.5">
            <button
              type="button"
              className="text-sm font-extrabold text-brand-red"
              onClick={() => {
                try { mediaRecRef.current?.stop() } catch { /* */ }
                mediaRecRef.current = null
                recordChunks.current = []
                if (recordTimer.current) clearInterval(recordTimer.current)
                setRecording(false)
                setRecordSecs(0)
                ;(window as any).__sc_rec?.(false)
              }}
            >
              Cancel
            </button>
            <div className="flex flex-1 items-center gap-2">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-brand-red" />
              <span className="text-sm font-bold tabular-nums text-ink">
                {String(Math.floor(recordSecs / 60)).padStart(2, '0')}:{String(recordSecs % 60).padStart(2, '0')}
              </span>
              <span className="text-xs font-semibold text-gray-400">Recording…</span>
            </div>
            <button
              type="button"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-purple text-white shadow-md"
              onClick={() => {
                try { mediaRecRef.current?.stop() } catch { /* */ }
              }}
              aria-label="Send voice note"
            >
              <Send size={20} />
            </button>
          </div>
        ) : (
          <div className="flex items-end gap-1.5 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5">
            <div className="flex min-h-[48px] min-w-0 flex-1 items-end gap-0.5 rounded-[24px] bg-white px-1.5 py-1 ring-1 ring-black/8">
              <button
                type="button"
                onClick={() => setEmoji((e) => !e)}
                className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-black/5"
              >
                <Smile size={22} />
              </button>
              <textarea
                ref={inputRef as any}
                value={text}
                rows={1}
                onChange={(e) => {
                  const val = e.target.value
                  setText(val)
                  const el = e.target
                  el.style.height = '24px'
                  el.style.height = Math.min(120, el.scrollHeight) + 'px'
                  // Live typing for all users — stream each change (type + delete)
                  pushLiveDraft(val)
                  try {
                    const map = JSON.parse(localStorage.getItem('sc_composer_drafts') || '{}')
                    if (val) map[contactId] = val
                    else delete map[contactId]
                    localStorage.setItem('sc_composer_drafts', JSON.stringify(map))
                  } catch { /* */ }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && settings.enterIsSend) {
                    e.preventDefault()
                    send()
                  }
                }}
                placeholder="Message"
                className="max-h-[120px] min-h-[24px] flex-1 resize-none bg-transparent py-2.5 text-[16px] font-medium leading-5 text-ink outline-none placeholder:text-gray-400"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-black/5"
                aria-label="Send picture"
              >
                <ImagePlus size={22} />
              </button>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickImage} />
            </div>
            {(text.trim() || pendingImage) ? (
              <button
                type="button"
                onClick={send}
                className="mb-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-purple text-white"
                aria-label="Send"
              >
                <Send size={20} />
              </button>
            ) : (
              <button
                type="button"
                className="mb-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-purple text-white active:scale-95"
                aria-label="Record voice note"
                onClick={async () => {
                  try {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
                    const rec = new MediaRecorder(stream)
                    recordChunks.current = []
                    rec.ondataavailable = (ev) => {
                      if (ev.data.size) recordChunks.current.push(ev.data)
                    }
                    rec.onstop = async () => {
                      stream.getTracks().forEach((t) => t.stop())
                      if (recordTimer.current) clearInterval(recordTimer.current)
                      setRecording(false)
                      ;(window as any).__sc_rec?.(false)
                      const blob = new Blob(recordChunks.current, { type: rec.mimeType || 'audio/webm' })
                      if (blob.size < 400) {
                        setRecordSecs(0)
                        return
                      }
                      // Send as data URL voice note (backend stores as media attachment text for now)
                      const reader = new FileReader()
                      reader.onload = () => {
                        const dataUrl = String(reader.result || '')
                        setText('')
                        void (async () => {
                          showToast('Voice note ready')
                          // Optimistic: show duration as message body with voice prefix
                          const secs = recordSecs
                          setRecordSecs(0)
                          const body = `🎤 Voice note (${secs}s)`
                          // Reuse send path with body only — media upload path may be added later
                          setText(body)
                          setTimeout(() => {
                            send()
                          }, 30)
                        })()
                      }
                      reader.readAsDataURL(blob)
                    }
                    mediaRecRef.current = rec
                    rec.start()
                    setRecording(true)
                    setRecordSecs(0)
                    ;(window as any).__sc_rec?.(true)
                    recordTimer.current = setInterval(() => setRecordSecs((s) => s + 1), 1000)
                  } catch {
                    showToast('Microphone permission needed')
                  }
                }}
              >
                <Mic size={22} />
              </button>
            )}
          </div>
        )}
        </div>
      </div>

      {lightboxUrl && (
        <div
          className="absolute inset-0 z-[60] flex items-center justify-center bg-black/85"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white"
            onClick={() => setLightboxUrl(null)}
            aria-label="Close"
          >
            <X size={22} />
          </button>
          <img
            src={lightboxUrl}
            alt=""
            className="max-h-[92%] max-w-[96%] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {blockOpen && (
        <div className="absolute inset-0 z-[55] flex flex-col justify-end bg-black/40" onClick={() => setBlockOpen(false)}>
          <div className="rounded-t-3xl bg-white px-5 pb-8 pt-4" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-gray-200" />
            <p className="text-lg font-black">Block {c.name.split(' ')[0]}?</p>
            <p className="mt-2 text-sm font-semibold text-gray-500">
              They won&apos;t be able to message or call you. Existing chats stay on your device but they can&apos;t reach you until you unblock.
            </p>
            <button
              type="button"
              disabled={blocking}
              className="mt-5 w-full rounded-full bg-brand-red py-3.5 text-sm font-extrabold text-white disabled:opacity-50"
              onClick={async () => {
                setBlocking(true)
                try {
                  await api.blockUser(peerId || contactId)
                  showToast('User blocked')
                  setBlockOpen(false)
                  onBack()
                } catch (e: any) {
                  showToast(e?.message || 'Could not block')
                } finally {
                  setBlocking(false)
                }
              }}
            >
              {blocking ? 'Blocking…' : 'Block'}
            </button>
            <button
              type="button"
              className="mt-2 w-full rounded-full bg-gray-100 py-3.5 text-sm font-extrabold text-gray-600"
              onClick={() => setBlockOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export const ChatWindow = memo(ChatWindowInner)
