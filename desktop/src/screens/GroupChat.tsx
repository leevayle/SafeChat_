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
} from 'lucide-react'
import { Avatar } from '../components/Avatar'
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
import {
  getCachedMessages,
  mergeCachedMessages,
} from '../lib/messageCache'
import { applyThreadMessages, subscribeThread } from '../lib/messageStore'

const EMOJIS = [
  '😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😋','😎','😍','😘','🥰',
  '🙂','🤗','🤩','🤔','😐','😑','😶','🙄','😏','😣','😥','😮','😪','😴','😌',
  '😜','🤤','😒','😓','😔','😕','🙃','😲','🙁','😖','😞','😟','😤','😢','😭',
  '😩','🤯','😬','😰','😱','😳','😡','😠','😷','🤒','🥳','🥺','😈','👋','👍',
  '👎','👏','🙌','🙏','💪','❤️','🧡','💛','💚','💙','💜','💔','🔥','⭐','✨',
  '🎉','🎊','💯','✅','☕','🍕','🍔','🎂','🍪',
]

type GMsg = {
  id: string
  clientKey?: string
  from: string
  text: string
  createdAt: string
  state?: 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
  system?: boolean
  mine?: boolean
}

function mapApiMsg(m: any, myId?: string): GMsg {
  const from = String(m.from || m.sender_id || '')
  return {
    id: String(m.id || m._id || ''),
    clientKey: m.client_key || m.clientKey,
    from,
    text: String(m.text || m.content || m.body || ''),
    createdAt: m.createdAt || m.created_at || utcNowIso(),
    state: (m.state || m.delivery_status || 'sent') as GMsg['state'],
    system: !!(m.system || m.message_type === 'system'),
    mine: myId ? from === myId : !!m.mine,
  }
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
  const end = useRef<HTMLDivElement>(null)
  const myId = me?.id || ''
  const memberCount = g?.memberIds?.length || g?.members?.length || 0

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
    if (!conversationId) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const cached = getCachedMessages(conversationId)
        if (cached?.length) {
          setMsgs(cached.map((m: any) => mapApiMsg(m, myId)))
        }
        const { messages } = await api.messages(conversationId, { limit: 80 })
        if (cancelled) return
        const mapped = (messages || []).map((m: any) => mapApiMsg(m, myId))
        setMsgs(mapped)
        await applyThreadMessages(conversationId, messages || [], 'replace')
        void mergeCachedMessages(conversationId, messages || [])
      } catch (e: any) {
        if (!cancelled) showToast(e?.message || 'Could not load messages')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [conversationId, myId, showToast])

  useEffect(() => {
    if (!conversationId) return
    return subscribeThread(conversationId, (list) => {
      setMsgs((list || []).map((m: any) => mapApiMsg(m, myId)))
    })
  }, [conversationId, myId])

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [msgs.length, emoji])

  const send = async () => {
    const body = text.trim()
    if (!body || sending) return
    if (!conversationId) {
      showToast('Group chat is still connecting…')
      return
    }
    const clientKey = `g-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const optimistic: GMsg = {
      id: clientKey,
      clientKey,
      from: myId,
      text: body,
      createdAt: utcNowIso(),
      state: 'pending',
      mine: true,
    }
    setText('')
    setEmoji(false)
    setMsgs((prev) => [...prev, optimistic])
    setSending(true)
    try {
      const res = await api.send(conversationId, body, null, { clientKey })
      const server = mapApiMsg(res?.message || res || {}, myId)
      setMsgs((prev) =>
        prev.map((m) =>
          m.clientKey === clientKey || m.id === clientKey
            ? { ...m, ...server, id: server.id || m.id, state: server.state || 'sent' }
            : m,
        ),
      )
      void applyThreadMessages(
        conversationId,
        [{ ...(res?.message || res || {}), client_key: clientKey }],
        'merge',
      )
    } catch (e: any) {
      setMsgs((prev) =>
        prev.map((m) =>
          m.clientKey === clientKey || m.id === clientKey ? { ...m, state: 'failed' } : m,
        ),
      )
      showToast(e?.message || 'Message failed')
    } finally {
      setSending(false)
    }
  }

  const retry = async (m: GMsg) => {
    if (!conversationId || m.state !== 'failed') return
    setMsgs((prev) => prev.map((x) => (x.id === m.id ? { ...x, state: 'pending' } : x)))
    try {
      const res = await api.send(conversationId, m.text, null, {
        clientKey: m.clientKey || m.id,
      })
      const server = mapApiMsg(res?.message || res || {}, myId)
      setMsgs((prev) =>
        prev.map((x) =>
          x.id === m.id ? { ...x, ...server, id: server.id || x.id, state: 'sent' } : x,
        ),
      )
    } catch {
      setMsgs((prev) => prev.map((x) => (x.id === m.id ? { ...x, state: 'failed' } : x)))
      showToast('Retry failed')
    }
  }

  const wallpaperCss = resolveWallpaper(settings.wallpaper, settings.colorMode)
  const wallpaperImg = resolveWallpaperImage(settings.wallpaper, settings.wallpaperImage)
  const isPictureBg = settings.wallpaper === 'Picture' && !!wallpaperImg
  const showPattern = settings.chatPattern !== false

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        try {
          ;(document.activeElement as HTMLElement | null)?.blur?.()
        } catch {
          /* */
        }
        onBack()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack])

  if (!g) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-white">
        <p className="font-bold text-gray-400">{loading ? 'Opening group…' : 'Group not found'}</p>
        {!loading ? (
          <button type="button" onClick={onClosed} className="font-bold text-brand-purple">
            Close
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0" style={{ background: wallpaperCss }} />
      {isPictureBg && wallpaperImg ? (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `url(${wallpaperImg})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
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
            opacity: String(settings.colorMode || '').toLowerCase() === 'dark' ? 0.22 : 0.32,
          }}
        />
      ) : null}

      <div className="relative z-10 flex h-full min-h-0 flex-col">
        <header className="z-10 flex shrink-0 items-center gap-2 border-b border-white/40 bg-white/85 px-2 pb-3 pt-[max(1.25rem,env(safe-area-inset-top))] shadow-sm backdrop-blur-md">
          <button
            type="button"
            onClick={onBack}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100"
            aria-label="Back"
          >
            <ArrowLeft size={22} />
          </button>
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
            onClick={() => onInfo?.(groupId)}
          >
            <Avatar
              contact={{ id: g.id, name: g.name, photo: g.photo, hue: g.hue }}
              size={42}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-extrabold text-ink">{g.name}</p>
              <p className="truncate text-xs font-bold text-gray-400">
                {memberCount ? `${memberCount} members` : 'Group'}
              </p>
            </div>
          </button>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-gray-100"
            aria-label="Group info"
            onClick={() => onInfo?.(groupId)}
          >
            <Info size={20} />
          </button>
        </header>

        <div
          className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-3"
          style={{ fontSize: FONT_SIZES[settings.fontSize] || '1rem' }}
        >
          {loading && !msgs.length ? (
            <p className="py-10 text-center text-sm font-bold text-gray-400">Loading messages…</p>
          ) : null}
          {!loading && !msgs.length ? (
            <div className="mx-auto mt-10 max-w-[260px] rounded-2xl bg-white/80 px-4 py-3 text-center shadow-sm ring-1 ring-black/5">
              <Users className="mx-auto mb-2 text-brand-purple" size={28} />
              <p className="text-sm font-extrabold text-ink">No messages yet</p>
              <p className="mt-1 text-xs font-semibold text-gray-500">
                Say hello to the group — messages are delivered to everyone here.
              </p>
            </div>
          ) : null}

          <AnimatePresence initial={false}>
            {msgs.map((m) => {
              if (m.system) {
                return (
                  <motion.p
                    key={m.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mx-auto my-2 w-fit max-w-[90%] rounded-full bg-white/80 px-3 py-1 text-center text-[11px] font-bold text-gray-500 shadow-sm"
                  >
                    {m.text}
                  </motion.p>
                )
              }
              const mine = !!(m.mine || m.from === myId)
              return (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`relative max-w-[82%] rounded-2xl px-3 py-1.5 shadow-sm ${
                      mine
                        ? 'rounded-br-md bg-brand-purple text-white'
                        : 'rounded-bl-md bg-white text-ink ring-1 ring-black/[0.04]'
                    }`}
                  >
                    {!mine ? (
                      <p className="mb-0.5 text-[11px] font-extrabold text-brand-purple">
                        {nameFor(m.from)}
                      </p>
                    ) : null}
                    <p className="whitespace-pre-wrap break-words text-[15px] font-semibold leading-snug">
                      {linkifyText(m.text)}
                    </p>
                    <div
                      className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] font-bold ${
                        mine ? 'text-white/70' : 'text-gray-400'
                      }`}
                    >
                      <span>{formatLocalTime(m.createdAt)}</span>
                      {mine ? (
                        m.state === 'pending' ? (
                          <Clock size={12} />
                        ) : m.state === 'failed' ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-0.5 text-red-200"
                            onClick={() => void retry(m)}
                          >
                            <RotateCcw size={12} /> Retry
                          </button>
                        ) : m.state === 'read' ? (
                          <CheckCheck size={14} className="text-sky-200" />
                        ) : (
                          <Check size={12} />
                        )
                      ) : null}
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
          <div ref={end} />
        </div>

        {emoji ? (
          <div className="grid max-h-40 grid-cols-8 gap-1 overflow-y-auto border-t border-gray-100 bg-white/95 px-2 py-2">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                className="rounded-lg py-1 text-xl hover:bg-gray-100"
                onClick={() => setText((t) => t + e)}
              >
                {e}
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex shrink-0 items-center gap-2 border-t border-white/50 bg-white/90 px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md">
          <button
            type="button"
            onClick={() => setEmoji((v) => !v)}
            className="flex h-11 w-11 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
            aria-label="Emoji"
          >
            <Smile size={22} />
          </button>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
            placeholder="Message"
            className="h-11 flex-1 rounded-full bg-gray-100 px-4 text-[15px] font-semibold outline-none ring-brand-purple/30 focus:ring-2"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={!text.trim() || !conversationId}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-purple text-white disabled:opacity-40"
            aria-label="Send"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
