import { loadCachedThreadMeta } from '../lib/appCache'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  Smile,
  Send,
  Clock,
  Check,
  CheckCheck,
  RotateCcw,
  Users,
  Info,
  X,
  Pencil,
  Trash2,
  Reply,
  ImagePlus,
  Paperclip,
  Mic,
  Download,
  MoreVertical,
} from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { AudioMessagePlayer, isAudioFile } from '../components/AudioMessagePlayer'
import { ChatImageCropper } from '../components/ChatImageCropper'
import { api } from '../api'
import {
  getChatPatternUrl,
  FONT_SIZES,
  resolveWallpaper,
  resolveWallpaperImage,
  useStore,
} from '../store'
import { formatLocalTime, utcNowIso } from '../time'
import { linkifyText } from '../lib/linkify'
import { fileToDataUrl } from '../lib/imageProcess'
import type { ChangeEvent } from 'react'
import {
  getCachedMessages,
  mergeCachedMessages,
} from '../lib/messageCache'
import { applyThreadMessages, subscribeThread } from '../lib/messageStore'

function renderGroupText(text: string) {
  // Highlight @username mentions while keeping linkify for URLs
  const parts = String(text || '').split(/(@[A-Za-z0-9_]+)/g)
  return parts.map((part, i) => {
    if (/^@[A-Za-z0-9_]+$/.test(part)) {
      return (
        <span key={i} className="font-black text-sky-300">
          {part}
        </span>
      )
    }
    return <span key={i}>{linkifyText(part)}</span>
  })
}

const EMOJIS = [
  '😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😋','😎','😍','😘','🥰',
  '🙂','🤗','🤩','🤔','😐','😑','😶','🙄','😏','😣','😥','😮','😪','😴','😌',
  '😜','🤤','😒','😓','😔','😕','🙃','😲','🙁','😖','😞','😟','😤','😢','😭',
  '😩','🤯','😬','😰','😱','😳','😡','😠','😷','🤒','🥳','🥺','😈','👋','👍',
  '👎','👏','🙌','🙏','💪','❤️','🧡','💛','💚','💙','💜','💔','🔥','⭐','✨',
  '🎉','🎊','💯','✅','☕','🍕','🍔','🎂','🍪',
]

const REACT_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const

type GMsg = {
  id: string
  clientKey?: string
  from: string
  text: string
  image?: string | null
  file?: { name: string; url: string; mime?: string; size?: number } | null
  createdAt: string
  state?: 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
  system?: boolean
  mine?: boolean
  edited?: boolean
  deleted?: boolean
  replyToId?: string | null
  replyToText?: string | null
  reactions?: { emoji: string; user_id?: string }[]
}

function mediaUrl(path?: string | null) {
  if (!path) return ''
  if (path.startsWith('data:') || path.startsWith('blob:') || path.startsWith('http')) return path
  return path
}

function isGifUrl(path?: string | null) {
  if (!path) return false
  if (/^data:image\/gif/i.test(path)) return true
  try {
    return /\.gif$/i.test(path.split('?')[0].split('#')[0])
  } catch {
    return false
  }
}

function isBareGifMessage(m: {
  image?: string | null
  text?: string | null
  file?: unknown
  deleted?: boolean
  replyToId?: string | null
  replyToText?: string | null
}) {
  if (m.deleted || !m.image || !isGifUrl(m.image)) return false
  if (m.file || m.replyToId || m.replyToText) return false
  const t = String(m.text || '').trim()
  if (!t) return true
  if (t === '📷 Photo' || t === '📷 GIF' || t === 'GIF') return true
  if (/^📷\s*/.test(t) && t.length <= 12) return true
  return false
}

function mapApiMsg(m: any, myId?: string): GMsg {
  const from = String(m.from || m.sender_id || '')
  const deleted = !!(m.deleted || m.deleted_at)
  const attachments = m.media_attachments || m.mediaAttachments || []
  const firstMedia = Array.isArray(attachments) ? attachments[0] : null
  const mediaType = String(firstMedia?.type || firstMedia?.mime_type || '').toLowerCase()
  const isFileMedia =
    mediaType === 'file' ||
    (!!firstMedia?.name && mediaType !== 'image' && !mediaType.startsWith('image'))
  const image = deleted
    ? null
    : isFileMedia
      ? null
      : (firstMedia && (firstMedia.url || firstMedia.data || firstMedia.src)) || m.image || null
  const file =
    !deleted && (isFileMedia || m.file)
      ? {
          name: String(firstMedia?.name || m.file?.name || m.content || 'Attachment'),
          url: String(firstMedia?.url || firstMedia?.data || m.file?.url || ''),
          mime: String(firstMedia?.mime_type || firstMedia?.mime || m.file?.mime || 'application/octet-stream'),
          size: Number(firstMedia?.size || m.file?.size || 0),
        }
      : null
  return {
    id: String(m.id || m._id || ''),
    clientKey: m.client_key || m.clientKey,
    from,
    text: deleted ? 'This message was deleted' : String(m.text || m.content || m.body || ''),
    image: image ? String(image) : null,
    file,
    createdAt: m.createdAt || m.created_at || utcNowIso(),
    state: (m.state || m.delivery_status || 'sent') as GMsg['state'],
    system: !!(m.system || m.message_type === 'system'),
    mine: myId ? from === myId : !!m.mine,
    edited: !!(m.edited || m.edited_at),
    deleted,
    replyToId: m.replyToId || m.reply_to_message_id || null,
    replyToText: m.replyToText || m.reply_to_text || null,
    reactions: Array.isArray(m.reactions) ? m.reactions : [],
  }
}

function GroupMessageRow({
  m,
  mine,
  bareGif,
  nameFor,
  hasReactions,
  reactionsList,
  onOpenAction,
  onReply,
  onReact,
  onRetry,
}: {
  m: GMsg
  mine: boolean
  bareGif: boolean
  nameFor: (uid: string) => string
  hasReactions: boolean
  reactionsList: { emoji: string; user_id?: string }[]
  onOpenAction: () => void
  onReply: () => void
  onReact: (emoji: string) => void
  onRetry: () => void
}) {
  const startX = useRef(0)
  const startY = useRef(0)
  const [dx, setDx] = useState(0)
  const [hoverReact, setHoverReact] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0, x: dx }}
      style={{ touchAction: 'pan-y' }}
      onTouchStart={(e) => {
        startX.current = e.touches[0].clientX
        startY.current = e.touches[0].clientY
      }}
      onTouchMove={(e) => {
        const d = e.touches[0].clientX - startX.current
        const dy = Math.abs(e.touches[0].clientY - startY.current)
        if (d > 8 && d > dy * 1.2) {
          setDx(Math.min(56, d * 0.4))
        }
      }}
      onTouchEnd={() => {
        if (dx > 28 && !m.deleted && !m.system) onReply()
        setDx(0)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        if (!m.deleted && !m.system) onOpenAction()
      }}
      onDoubleClick={() => {
        if (!m.deleted && !m.system) onOpenAction()
      }}
      className={`group/bubble mb-1.5 flex w-full ${mine ? 'justify-end' : 'justify-start'} ${hasReactions ? 'mb-3' : ''}`}
    >
      <div className="relative max-w-[min(78%,22rem)]">
        {/* Desktop hover actions — match inbox chat */}
        {!m.deleted && !m.system ? (
          <div
            className={`pointer-events-none absolute top-1/2 z-20 hidden -translate-y-1/2 items-center gap-0.5 rounded-full border border-black/5 bg-white px-0.5 py-0.5 shadow-md dark:border-white/10 dark:bg-[#1a222d] md:pointer-events-auto md:group-hover/bubble:flex ${
              mine ? 'right-full mr-1' : 'left-full ml-1'
            }`}
            onMouseLeave={() => setHoverReact(false)}
          >
            <button
              type="button"
              title="Reply"
              className="flex h-8 w-8 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"
              onClick={(e) => {
                e.stopPropagation()
                onReply()
              }}
            >
              <Reply size={16} strokeWidth={2.2} />
            </button>
            <div className="relative">
              <button
                type="button"
                title="React"
                className="flex h-8 w-8 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"
                onClick={(e) => {
                  e.stopPropagation()
                  setHoverReact((v) => !v)
                }}
              >
                <Smile size={16} strokeWidth={2.2} />
              </button>
              {hoverReact ? (
                <div className="absolute bottom-full left-1/2 z-30 mb-1 flex -translate-x-1/2 gap-0.5 rounded-full border border-black/5 bg-white p-1 shadow-lg dark:border-white/10 dark:bg-[#1a222d]">
                  {REACT_EMOJIS.map((em) => (
                    <button
                      key={em}
                      type="button"
                      className="flex h-8 w-8 items-center justify-center rounded-full text-base hover:bg-gray-100 dark:hover:bg-white/10"
                      onClick={(e) => {
                        e.stopPropagation()
                        setHoverReact(false)
                        onReact(em)
                      }}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              title="More"
              className="flex h-8 w-8 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"
              onClick={(e) => {
                e.stopPropagation()
                onOpenAction()
              }}
            >
              <MoreVertical size={15} strokeWidth={2.2} />
            </button>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => {
            if (mine && m.state === 'failed') onRetry()
            else if (!m.deleted && !m.system) onOpenAction()
          }}
          className={`relative w-full text-left ${
            bareGif
              ? 'bg-transparent px-0 py-0 shadow-none ring-0'
              : `rounded-2xl px-3 py-2 shadow-sm ${
                  mine
                    ? 'rounded-br-md bg-brand-purple text-white'
                    : 'rounded-bl-md bg-white text-ink ring-1 ring-black/[0.04] dark:bg-[#1f2c34] dark:text-gray-100 dark:ring-white/10'
                }`
          } ${m.deleted ? 'opacity-70 italic' : ''}`}
        >
          {!mine ? (
            <span
              className={`mb-0.5 block text-[11px] font-extrabold text-brand-purple ${
                bareGif ? 'px-0.5 drop-shadow-sm' : ''
              }`}
            >
              {nameFor(m.from)}
            </span>
          ) : null}
          {(m.replyToId || m.replyToText) && !m.deleted ? (
            <div
              className={`mb-1.5 border-l-2 pl-2 text-left ${
                mine && !bareGif
                  ? 'border-white/50 text-white/90'
                  : 'border-brand-purple/50 text-gray-500 dark:text-gray-400'
              }`}
            >
              <span className="block text-[10px] font-extrabold uppercase opacity-80">Reply</span>
              <span className="line-clamp-2 text-xs font-semibold">{m.replyToText || 'Original message'}</span>
            </div>
          ) : null}
          {m.image && !m.deleted ? (
            <div
              className={`overflow-hidden bg-transparent ${
                bareGif
                  ? 'mb-0 rounded-xl'
                  : mine
                    ? 'mb-1 rounded-xl rounded-br-sm'
                    : 'mb-1 rounded-xl rounded-bl-sm'
              }`}
            >
              <img
                src={mediaUrl(m.image)}
                alt=""
                className="max-h-60 w-full bg-transparent object-contain"
                loading="lazy"
              />
            </div>
          ) : null}
          {m.file?.url && !m.deleted && isAudioFile(m.file) ? (
            <div className="mb-1">
              <AudioMessagePlayer src={mediaUrl(m.file.url)} name={m.file.name} mine={mine} />
            </div>
          ) : m.file?.url && !m.deleted ? (
            <a
              href={mediaUrl(m.file.url)}
              download={m.file.name || 'attachment'}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className={`mb-1 flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm font-bold ring-1 ring-black/10 ${
                mine ? 'bg-white/20 text-white' : 'bg-black/5 text-ink dark:bg-white/10 dark:text-gray-100'
              }`}
            >
              <span className="text-lg">📎</span>
              <span className="min-w-0 flex-1 truncate">{m.file.name || 'Attachment'}</span>
              <Download size={16} className="shrink-0 opacity-80" />
            </a>
          ) : null}
          {!bareGif &&
          m.text &&
          !(m.image && (m.text === '📷 Photo' || m.text.startsWith('📷'))) &&
          !(m.file && m.text.startsWith('📎')) ? (
            <span className="whitespace-pre-wrap break-words font-semibold leading-snug">
              {renderGroupText(m.text)}
            </span>
          ) : !bareGif && m.text && !m.image && !m.file ? (
            <span className="whitespace-pre-wrap break-words font-semibold leading-snug">
              {renderGroupText(m.text)}
            </span>
          ) : null}
          <div
            className={`mt-1 flex items-center justify-end gap-1 text-[10px] font-bold ${
              bareGif
                ? 'px-0.5 text-gray-500 drop-shadow-sm dark:text-gray-300'
                : mine
                  ? 'text-white/75'
                  : 'text-gray-400'
            }`}
          >
            {m.edited && !m.deleted ? <span className="opacity-80">edited</span> : null}
            <span>{formatLocalTime(m.createdAt)}</span>
            {mine ? (
              m.state === 'pending' ? (
                <Clock size={12} />
              ) : m.state === 'failed' ? (
                <span className="inline-flex items-center gap-0.5 text-red-200">
                  <RotateCcw size={12} /> Retry
                </span>
              ) : m.state === 'read' ? (
                <CheckCheck size={14} className="text-sky-200" />
              ) : (
                <Check size={12} />
              )
            ) : null}
          </div>
        </button>

        {/* Reaction chips on bubble edge */}
        {hasReactions ? (
          <div
            className={`pointer-events-none absolute z-[5] flex translate-y-[58%] flex-wrap gap-0.5 ${
              mine ? 'bottom-0 right-2' : 'bottom-0 left-2'
            }`}
          >
            {Object.entries(
              reactionsList.reduce((acc: Record<string, number>, r) => {
                const e = typeof r === 'string' ? r : r?.emoji
                if (!e) return acc
                acc[e] = (acc[e] || 0) + 1
                return acc
              }, {} as Record<string, number>),
            ).map(([emoji, count]) => (
              <span
                key={emoji}
                className="pointer-events-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[11px] shadow-sm ring-1 ring-black/10 dark:bg-[#1a222d] dark:ring-white/15"
              >
                {emoji}
                {(count as number) > 1 ? (
                  <span className="ml-0.5 text-[9px] font-black text-gray-500">{count as number}</span>
                ) : null}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </motion.div>
  )
}

export function GroupChat({
  groupId,
  onBack,
  onClosed,
  onCall,
  onInfo,
}: {
  groupId: string
  onBack: () => void
  onClosed: () => void
  onCall?: (id: string, kind: 'audio' | 'video') => void
  onInfo?: (groupId: string) => void
}) {
  const { groups, contacts, me, settings, showToast, refreshGroups } = useStore()
  const listed = groups.find((x) => x.id === groupId)
  const [g, setG] = useState<any>(listed || null)
  const [text, setText] = useState('')
  const [emoji, setEmoji] = useState(false)
  const [msgs, setMsgs] = useState<GMsg[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(
    listed?.conversationId || null,
  )
  const [replyTo, setReplyTo] = useState<GMsg | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<GMsg | null>(null)
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQ, setMentionQ] = useState('')
  const [mentionIdx, setMentionIdx] = useState(0)
  const [pendingImage, setPendingImage] = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<{ name: string; url: string; mime: string; size: number } | null>(null)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const docRef = useRef<HTMLInputElement>(null)
  const myId = me?.id || ''
  const memberCount = g?.memberIds?.length || g?.members?.filter((m: any) => !m.pending)?.length || 0
  const mentionCandidates = (() => {
    const list = (g?.members || []).filter((m: any) => !m.pending && String(m.id) !== String(myId))
    const q = mentionQ.toLowerCase()
    return list
      .filter((m: any) => {
        if (!q) return true
        const uname = String(m.username || '').replace(/^@/, '').toLowerCase()
        const name = String(m.name || '').toLowerCase()
        return uname.includes(q) || name.includes(q)
      })
      .slice(0, 8)
  })()
  const fontSize = FONT_SIZES[(settings as any).fontSize as keyof typeof FONT_SIZES] || FONT_SIZES.medium

  const nameFor = useCallback(
    (uid: string) => {
      if (uid === myId) return 'You'
      const c = contacts.find((x) => x.id === uid || x.peerId === uid)
      if (c) return c.savedName || c.name || c.username || 'Member'
      const m = (g?.members || []).find((x: any) => x.id === uid)
      if (m) return m.name || m.username || 'Member'
      return 'Member'
    },
    [contacts, myId, g?.members],
  )

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const { group } = await api.group(groupId)
        if (cancelled) return
        setG(group)
        if (group?.conversationId) setConversationId(group.conversationId)
        void refreshGroups?.()
      } catch {
        if (!cancelled && listed) setG(listed)
        if (!cancelled && listed?.conversationId) setConversationId(listed.conversationId)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [groupId, listed, refreshGroups])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!conversationId) {
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const cached = getCachedMessages(conversationId)
        if (cached?.length) setMsgs(cached)
        let tipId: string | null = null
        try {
          const meta = await loadCachedThreadMeta<any>(conversationId)
          const tip = meta.tipId || (cached?.length ? String(cached[cached.length - 1]?.id || '') : '')
          if (tip && !String(tip).startsWith('local-')) tipId = tip
        } catch { /* */ }
        const { messages } = await api.messages(
          conversationId,
          tipId ? { limit: 50, afterId: tipId } : { limit: 50 },
        )
        if (cancelled) return
        const mapped = (messages || []).map((m: any) => mapApiMsg(m, myId))
        if (tipId && cached?.length) {
          // Delta: append newer only; do not wipe the cached thread
          setMsgs((prev) => {
            const base = prev.length ? prev : cached.map((m: any) => mapApiMsg(m, myId))
            const byId = new Map(base.map((m: any) => [m.id, m]))
            for (const m of mapped) byId.set(m.id, m)
            return Array.from(byId.values())
          })
          void mergeCachedMessages(conversationId, messages || [])
        } else {
          setMsgs(mapped)
          await applyThreadMessages(conversationId, messages || [], 'replace')
          void mergeCachedMessages(conversationId, messages || [])
        }
      } catch {
        /* keep cache */
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [conversationId, myId])

  useEffect(() => {
    if (!conversationId) return
    return subscribeThread(conversationId, (list) => {
      setMsgs((list || []).map((m: any) => mapApiMsg(m, myId)))
    })
  }, [conversationId, myId])

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs.length])

  // Let global WS unread logic know this group thread is open
  useEffect(() => {
    if (conversationId) {
      ;(window as any).__sc_open_group_conv = String(conversationId)
      // Clear local unread for this group
      try {
        // parent store updates via refresh; optimistic local
      } catch { /* */ }
    }
    return () => {
      if ((window as any).__sc_open_group_conv === String(conversationId || '')) {
        ;(window as any).__sc_open_group_conv = null
      }
    }
  }, [conversationId])

  useEffect(() => {
    if (replyTo || editingId) {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [replyTo, editingId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (mentionOpen) {
        setMentionOpen(false)
        return
      }
      if (actionMsg) {
        setActionMsg(null)
        return
      }
      if (replyTo || editingId) {
        cancelComposeExtras()
        return
      }
      onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mentionOpen, actionMsg, replyTo, editingId, onBack])

  const wallpaperCss = resolveWallpaper(settings.wallpaper, settings.colorMode)
  const wallpaperImg = resolveWallpaperImage(settings.wallpaper, settings.wallpaperImage)
  const isPictureBg = settings.wallpaper === 'Picture' && !!wallpaperImg
  const showPattern = settings.chatPattern !== false

  const cancelComposeExtras = () => {
    setReplyTo(null)
    setEditingId(null)
  }

  const insertMention = (m: any) => {
    const uname = String(m.username || m.name || '').replace(/^@/, '')
    if (!uname) return
    setText((prev) => {
      const at = prev.lastIndexOf('@')
      if (at < 0) return prev + '@' + uname + ' '
      return prev.slice(0, at) + '@' + uname + ' '
    })
    setMentionOpen(false)
    setMentionQ('')
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const onPickImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (f.size > 25 * 1024 * 1024) {
      showToast?.('File is too large (max 25 MB)')
      return
    }
    const isAudio =
      f.type.startsWith('audio/') ||
      /\.(mp3|wav|ogg|m4a|aac|flac|webm|opus|oga|weba)$/i.test(f.name || '')
    if (!f.type.startsWith('image/') && !f.type.startsWith('video/') && !isAudio) {
      showToast?.('Use the paperclip button for documents')
      return
    }
    try {
      const data = await fileToDataUrl(f)
      if (f.type === 'image/gif' || /\.gif$/i.test(f.name)) {
        setPendingFile(null)
        setPendingImage(data)
        return
      }
      if (f.type.startsWith('image/')) {
        setCropSrc(data)
        setPendingFile(null)
        return
      }
      setPendingImage(null)
      setPendingFile({ name: f.name, url: data, mime: f.type || (isAudio ? 'audio/mpeg' : 'video/mp4'), size: f.size })
      showToast?.(`Attached ${f.name}`)
    } catch {
      showToast?.('Could not process media')
    }
  }

  const onPickDoc = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (f.size > 25 * 1024 * 1024) {
      showToast?.('File is too large (max 25 MB)')
      return
    }
    if (f.type.startsWith('image/') || f.type.startsWith('video/')) {
      showToast?.('Use the photo button for images and videos')
      return
    }
    try {
      const data = await fileToDataUrl(f)
      setPendingImage(null)
      setPendingFile({ name: f.name, url: data, mime: f.type || 'application/octet-stream', size: f.size })
      showToast?.(`Attached ${f.name}`)
    } catch {
      showToast?.('Could not read file')
    }
  }

  const send = async () => {
    try {
      if (sessionStorage.getItem('sc_limited_banned') === '1') {
        showToast?.('Your account is banned — messaging is disabled. Contact support to appeal.')
        return
      }
    } catch { /* */ }
    const body = text.trim()
    if ((!body && !pendingImage && !pendingFile) || !conversationId || sending) return

    if (editingId) {
      if (!body) return
      const id = editingId
      setSending(true)
      const prev = msgs.find((m) => m.id === id)
      setMsgs((list) =>
        list.map((m) => (m.id === id ? { ...m, text: body, edited: true } : m)),
      )
      setText('')
      setEditingId(null)
      try {
        await api.editMessage(id, body)
      } catch (e: any) {
        if (prev) {
          setMsgs((list) => list.map((m) => (m.id === id ? prev : m)))
        }
        showToast?.(e?.message || 'Could not edit message')
      } finally {
        setSending(false)
      }
      return
    }

    setSending(true)
    const img = pendingImage
    const fileSnap = pendingFile
    const clientKey = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const previewText =
      body || (img ? '📷 Photo' : '') || (fileSnap ? `📎 ${fileSnap.name}` : '')
    const optimistic: GMsg = {
      id: clientKey,
      clientKey,
      from: myId,
      text: previewText,
      image: img,
      file: fileSnap,
      createdAt: utcNowIso(),
      state: 'pending',
      mine: true,
      replyToId: replyTo?.id || null,
      replyToText: replyTo?.text || null,
    }
    setMsgs((m) => [...m, optimistic])
    setText('')
    setPendingImage(null)
    setPendingFile(null)
    const replySnap = replyTo
    setReplyTo(null)
    setEmoji(false)
    try {
      const { message } = await api.send(conversationId, body || (img ? '📷 Photo' : '') || (fileSnap ? `📎 ${fileSnap.name}` : ''), img, {
        clientKey,
        replyToId: replySnap?.id,
        file: fileSnap || null,
      })
      const mapped = mapApiMsg(message, myId)
      setMsgs((list) =>
        list.map((m) =>
          m.clientKey === clientKey || m.id === clientKey
            ? {
                ...mapped,
                clientKey,
                image: mapped.image ?? img,
                file: mapped.file ?? fileSnap,
                replyToId: mapped.replyToId || replySnap?.id,
                replyToText: mapped.replyToText || replySnap?.text,
              }
            : m,
        ),
      )
      void applyThreadMessages(conversationId, [{ ...message, client_key: clientKey }], 'append')
    } catch (e: any) {
      setMsgs((list) =>
        list.map((m) => (m.clientKey === clientKey ? { ...m, state: 'failed' } : m)),
      )
      showToast?.(e?.message || 'Message failed')
    } finally {
      setSending(false)
    }
  }

  const retry = async (m: GMsg) => {
    if (!conversationId || !m.text) return
    setMsgs((list) =>
      list.map((x) => (x.id === m.id ? { ...x, state: 'pending' } : x)),
    )
    try {
      const { message } = await api.send(conversationId, m.text, null, {
        clientKey: m.clientKey || m.id,
        replyToId: m.replyToId || undefined,
      })
      const mapped = mapApiMsg(message, myId)
      setMsgs((list) => list.map((x) => (x.id === m.id ? { ...mapped, clientKey: m.clientKey } : x)))
    } catch {
      setMsgs((list) => list.map((x) => (x.id === m.id ? { ...x, state: 'failed' } : x)))
    }
  }

  const startEdit = (m: GMsg) => {
    if (!m.mine || m.deleted) return
    setEditingId(m.id)
    setReplyTo(null)
    setText(m.text)
    setActionMsg(null)
    inputRef.current?.focus()
  }

  const startReply = (m: GMsg) => {
    if (m.deleted || m.system) return
    setReplyTo(m)
    setEditingId(null)
    setActionMsg(null)
    inputRef.current?.focus()
  }

  const deleteMsg = async (m: GMsg) => {
    if (!m.mine || m.deleted) return
    setActionMsg(null)
    const prev = m
    setMsgs((list) =>
      list.map((x) =>
        x.id === m.id ? { ...x, deleted: true, text: 'This message was deleted' } : x,
      ),
    )
    try {
      await api.deleteMessage(m.id)
    } catch (e: any) {
      setMsgs((list) => list.map((x) => (x.id === m.id ? prev : x)))
      showToast?.(e?.message || 'Could not delete')
    }
  }

  const reactToMsg = async (m: GMsg, emoji: string) => {
    const id = m.id
    if (!id || String(id).startsWith('local-')) {
      showToast?.('Wait for the message to send')
      return
    }
    const meId = myId
    const minePrev = (m.reactions || []).find((r) => !r.user_id || (meId && r.user_id === meId))
    const same = !!(minePrev && minePrev.emoji === emoji)
    setMsgs((list) =>
      list.map((x) => {
        if (x.id !== id && x.clientKey !== id) return x
        const others = (x.reactions || []).filter((r) => r.user_id && meId && r.user_id !== meId)
        const reactions = same ? others : [...others, { emoji, user_id: meId }]
        return { ...x, reactions }
      }),
    )
    setActionMsg(null)
    try {
      if (same) await api.removeReaction(id, emoji)
      else await api.reactMessage(id, emoji)
    } catch {
      showToast?.('Could not update reaction')
    }
  }

  // Live reactions from realtime (same event as 1:1 chat)
  useEffect(() => {
    const onReact = (ev: Event) => {
      const d = (ev as CustomEvent).detail as {
        cid?: string
        id?: string
        emoji?: string
        userId?: string
        removed?: boolean
      }
      if (!d?.id || !d.emoji) return
      if (d.cid && conversationId && d.cid !== conversationId) return
      setMsgs((prev) =>
        prev.map((x) => {
          if (x.id !== d.id && x.clientKey !== d.id) return x
          let reactions = [...(x.reactions || [])]
          reactions = reactions.filter((r) => r.user_id !== d.userId)
          if (!d.removed) {
            reactions.push({ emoji: d.emoji!, user_id: d.userId })
          }
          return { ...x, reactions }
        }),
      )
    }
    window.addEventListener('sc:rt-react', onReact)
    return () => window.removeEventListener('sc:rt-react', onReact)
  }, [conversationId])

  if (!g && !loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-white dark:bg-[#0b141a]">
        <Users className="text-gray-300" size={40} />
        <p className="font-bold text-gray-400">Group not found</p>
        <button type="button" onClick={onBack} className="font-bold text-brand-purple">
          Back
        </button>
      </div>
    )
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* Same wallpaper stack as 1:1 ChatWindow */}
      <div className="pointer-events-none absolute inset-0" style={{ background: wallpaperCss }} />
      {isPictureBg && wallpaperImg ? (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `url(${wallpaperImg})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
          }}
        />
      ) : null}
      {isPictureBg ? (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              String(settings.colorMode || '').toLowerCase() === 'dark'
                ? 'rgba(10, 12, 18, 0.55)'
                : 'rgba(255, 255, 255, 0.55)',
          }}
        />
      ) : null}
      {showPattern ? (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `url(${getChatPatternUrl()})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            opacity: String(settings.colorMode || '').toLowerCase() === 'dark' ? 0.22 : 0.32,
          }}
        />
      ) : null}

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <header className="z-10 flex shrink-0 items-center gap-2 border-b border-black/5 bg-white/85 px-2 pb-3 pt-[max(1.25rem,env(safe-area-inset-top))] shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-[#1f2c34]/95">
          <button
            type="button"
            onClick={onBack}
            className="flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-black/5 dark:text-gray-100 dark:hover:bg-white/10"
            aria-label="Back"
          >
            <ArrowLeft size={22} />
          </button>
          <button
            type="button"
            onClick={() => onInfo?.(groupId)}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <Avatar
              contact={{ id: g?.id || groupId, name: g?.name || 'Group', photo: g?.photo, hue: g?.hue }}
              size={40}
            />
            <span className="min-w-0">
              <span className="block truncate font-extrabold text-ink dark:text-gray-100">
                {g?.name || 'Group'}
              </span>
              <span className="block truncate text-xs font-semibold text-gray-500 dark:text-gray-400">
                {memberCount} members
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => onInfo?.(groupId)}
            className="flex h-10 w-10 items-center justify-center rounded-full text-brand-purple hover:bg-brand-purple/10"
            aria-label="Group info"
          >
            <Info size={20} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3" style={{ fontSize }}>
          {loading && !msgs.length ? (
            <div className="mx-auto mt-10 max-w-[260px] rounded-2xl bg-white/80 px-4 py-3 text-center shadow-sm ring-1 ring-black/5 dark:bg-[#1f2c34]/90 dark:ring-white/10">
              <p className="text-sm font-bold text-gray-500 dark:text-gray-300">Loading messages…</p>
            </div>
          ) : null}
          {!loading && msgs.length === 0 ? (
            <div className="mx-auto mt-10 max-w-[260px] rounded-2xl bg-white/80 px-4 py-3 text-center shadow-sm ring-1 ring-black/5 dark:bg-[#1f2c34]/90 dark:ring-white/10">
              <p className="text-sm font-bold text-gray-500 dark:text-gray-300">No messages yet. Say hello!</p>
            </div>
          ) : null}

          <AnimatePresence initial={false}>
            {msgs.map((m) => {
              if (m.system) {
                return (
                  <div
                    key={m.id}
                    className="mx-auto my-2 w-fit max-w-[90%] rounded-full bg-white/80 px-3 py-1 text-center text-[11px] font-bold text-gray-500 shadow-sm dark:bg-[#1f2c34]/90 dark:text-gray-300"
                  >
                    {m.text}
                  </div>
                )
              }
              const mine = !!m.mine
              const bareGif = isBareGifMessage(m)
              const reactionsList = Array.isArray(m.reactions) ? m.reactions : []
              const hasReactions = reactionsList.length > 0
              return (
                <GroupMessageRow
                  key={m.id}
                  m={m}
                  mine={mine}
                  bareGif={bareGif}
                  nameFor={nameFor}
                  hasReactions={hasReactions}
                  reactionsList={reactionsList}
                  onOpenAction={() => setActionMsg(m)}
                  onReply={() => startReply(m)}
                  onReact={(emoji) => void reactToMsg(m, emoji)}
                  onRetry={() => void retry(m)}
                />
              )
            })}
          </AnimatePresence>
          <div ref={end} />
        </div>

        {/* Message actions sheet */}
        {actionMsg ? (
          <div
            className="absolute inset-0 z-30 flex items-end justify-center bg-black/40 p-4"
            onClick={() => setActionMsg(null)}
          >
            <div
              className="w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-xl dark:bg-[#1f2c34]"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="truncate border-b border-gray-100 px-5 py-3 text-sm font-bold text-gray-500 dark:border-white/10 dark:text-gray-300">
                {actionMsg.deleted
                  ? 'Deleted message'
                  : actionMsg.text.slice(0, 80) || (actionMsg.image ? '📷 Media' : 'Message')}
              </p>
              {!actionMsg.deleted && !actionMsg.system ? (
                <div className="flex items-center justify-around gap-1 border-b border-gray-100 px-3 py-2.5 dark:border-white/10">
                  {REACT_EMOJIS.map((em) => (
                    <button
                      key={em}
                      type="button"
                      className="flex h-10 w-10 items-center justify-center rounded-full text-xl hover:bg-gray-100 dark:hover:bg-white/10"
                      onClick={() => void reactToMsg(actionMsg, em)}
                      aria-label={`React ${em}`}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              ) : null}
              {!actionMsg.deleted && !actionMsg.system ? (
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-5 py-3.5 text-left font-bold hover:bg-gray-50 dark:hover:bg-white/5"
                  onClick={() => startReply(actionMsg)}
                >
                  <Reply size={18} className="text-brand-purple" /> Reply
                </button>
              ) : null}
              {actionMsg.mine && !actionMsg.deleted && !actionMsg.system ? (
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-5 py-3.5 text-left font-bold hover:bg-gray-50 dark:hover:bg-white/5"
                  onClick={() => startEdit(actionMsg)}
                >
                  <Pencil size={18} className="text-brand-purple" /> Edit
                </button>
              ) : null}
              {actionMsg.mine && !actionMsg.deleted ? (
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-5 py-3.5 text-left font-bold text-brand-red hover:bg-red-50 dark:hover:bg-red-500/10"
                  onClick={() => void deleteMsg(actionMsg)}
                >
                  <Trash2 size={18} /> Delete
                </button>
              ) : null}
              <button
                type="button"
                className="flex w-full items-center justify-center border-t border-gray-100 px-5 py-3.5 font-extrabold text-gray-500 dark:border-white/10"
                onClick={() => setActionMsg(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {mentionOpen && mentionCandidates.length > 0 ? (
          <div className="max-h-48 overflow-y-auto border-t border-gray-100 bg-white px-2 py-2 dark:border-white/10 dark:bg-[#1f2c34]">
            <p className="px-2 pb-1 text-[10px] font-extrabold uppercase tracking-wide text-gray-400">Tag someone</p>
            {mentionCandidates.map((m: any, i: number) => (
              <button
                key={m.id}
                type="button"
                onClick={() => insertMention(m)}
                className={`flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left ${
                  i === mentionIdx ? 'bg-brand-purple/10' : 'hover:bg-gray-50 dark:hover:bg-white/5'
                }`}
              >
                <Avatar
                  contact={{ id: m.id, name: m.name || m.username, photo: m.photo }}
                  size={32}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-extrabold">{m.name || m.username}</span>
                  <span className="block truncate text-xs font-semibold text-gray-400">
                    @{String(m.username || m.name || '').replace(/^@/, '')}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {emoji ? (
          <div className="grid max-h-40 grid-cols-8 gap-1 overflow-y-auto border-t border-gray-100 bg-white px-2 py-2 dark:border-white/10 dark:bg-[#1f2c34]">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                className="rounded-lg py-1 text-xl hover:bg-gray-100 dark:hover:bg-white/10"
                onClick={() => setText((t) => t + e)}
              >
                {e}
              </button>
            ))}
          </div>
        ) : null}

        {(replyTo || editingId) && (
          <div className="flex items-center gap-2 border-t border-gray-100 bg-white px-3 py-2 dark:border-white/10 dark:bg-[#1f2c34]">
            <div className="min-w-0 flex-1 border-l-4 border-brand-purple pl-2">
              <p className="text-[11px] font-extrabold text-brand-purple">
                {editingId ? 'Editing message' : `Replying to ${replyTo ? nameFor(replyTo.from) : ''}`}
              </p>
              <p className="truncate text-xs font-semibold text-gray-500 dark:text-gray-400">
                {editingId
                  ? msgs.find((m) => m.id === editingId)?.text || ''
                  : replyTo?.text || ''}
              </p>
            </div>
            <button
              type="button"
              onClick={cancelComposeExtras}
              className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10"
              aria-label="Cancel"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {/* Pending media previews */}
        {pendingFile && (
          <div className="flex items-center gap-2 border-t border-gray-100 bg-white px-3 py-2 dark:border-white/10 dark:bg-[#1f2c34]">
            <span className="text-lg">📎</span>
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink dark:text-gray-100">{pendingFile.name}</span>
            <button type="button" onClick={() => setPendingFile(null)} className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10" aria-label="Remove file">
              <X size={16} />
            </button>
          </div>
        )}
        {pendingImage && (
          <div className="flex items-start gap-2 border-t border-gray-100 bg-white px-3 py-2 dark:border-white/10 dark:bg-[#1f2c34]">
            <img src={pendingImage} alt="" className="h-24 rounded-2xl object-cover" />
            <button type="button" onClick={() => setPendingImage(null)} className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10" aria-label="Remove image">
              <X size={16} />
            </button>
          </div>
        )}

        {/* Composer — matches 1:1 inbox chat layout */}
        <div className="flex items-end gap-1.5 border-t border-gray-200/80 bg-transparent px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 dark:border-white/10">
          <div className="flex min-h-[48px] min-w-0 flex-1 items-end gap-0.5 rounded-[24px] bg-white px-1.5 py-1 ring-1 ring-black/8 dark:bg-[#1f2c34] dark:ring-white/10">
            <button
              type="button"
              onClick={() => setEmoji((v) => !v)}
              className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/10"
              aria-label="Emoji"
            >
              <Smile size={22} />
            </button>
            <textarea
              ref={inputRef as any}
              value={text}
              rows={1}
              onChange={(e) => {
                const v = e.target.value
                setText(v)
                const el = e.target
                el.style.height = '24px'
                el.style.height = Math.min(120, el.scrollHeight) + 'px'
                const caret = e.target.selectionStart ?? v.length
                const before = v.slice(0, caret)
                const at = before.lastIndexOf('@')
                if (at >= 0) {
                  const frag = before.slice(at + 1)
                  if (!/\s/.test(frag) && frag.length <= 32) {
                    setMentionOpen(true)
                    setMentionQ(frag)
                    setMentionIdx(0)
                    return
                  }
                }
                setMentionOpen(false)
                setMentionQ('')
              }}
              onKeyDown={(e) => {
                if (mentionOpen && mentionCandidates.length) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setMentionIdx((i) => (i + 1) % mentionCandidates.length)
                    return
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setMentionIdx((i) => (i - 1 + mentionCandidates.length) % mentionCandidates.length)
                    return
                  }
                  if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault()
                    const m = mentionCandidates[mentionIdx]
                    if (m) insertMention(m)
                    return
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    setMentionOpen(false)
                    return
                  }
                }
                if (e.key === 'Enter' && !e.shiftKey && settings.enterIsSend !== false) {
                  e.preventDefault()
                  void send()
                }
              }}
              placeholder={editingId ? 'Edit message' : 'Message'}
              className="max-h-[120px] min-h-[24px] flex-1 resize-none bg-transparent py-2.5 text-[16px] font-medium leading-5 text-ink outline-none placeholder:text-gray-400 dark:text-gray-100"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/10"
              aria-label="Send photo or video"
            >
              <ImagePlus size={22} />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*,image/gif,audio/*"
              hidden
              onChange={onPickImage}
            />
            <button
              type="button"
              onClick={() => docRef.current?.click()}
              className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/10"
              aria-label="Attach file"
            >
              <Paperclip size={20} />
            </button>
            <input
              ref={docRef}
              type="file"
              accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip,.csv,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,application/zip"
              hidden
              onChange={onPickDoc}
            />
          </div>
          {(text.trim() || pendingImage || pendingFile) ? (
            <button
              type="button"
              onClick={() => void send()}
              disabled={!conversationId || sending}
              className="mb-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-purple text-white disabled:opacity-40"
              aria-label={editingId ? 'Save' : 'Send'}
            >
              <Send size={20} />
            </button>
          ) : (
            <button
              type="button"
              className="mb-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-purple text-white opacity-80"
              aria-label="Voice note"
              onClick={() => showToast?.('Voice notes in groups coming soon')}
            >
              <Mic size={20} />
            </button>
          )}
        </div>
      </div>

      {cropSrc && (
        <ChatImageCropper
          src={cropSrc}
          onCancel={() => setCropSrc(null)}
          onDone={(dataUrl) => {
            setCropSrc(null)
            setPendingImage(dataUrl)
          }}
        />
      )}
    </div>
  )
}
