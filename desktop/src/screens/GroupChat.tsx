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
  edited?: boolean
  deleted?: boolean
  replyToId?: string | null
  replyToText?: string | null
}

function mapApiMsg(m: any, myId?: string): GMsg {
  const from = String(m.from || m.sender_id || '')
  const deleted = !!(m.deleted || m.deleted_at)
  return {
    id: String(m.id || m._id || ''),
    clientKey: m.client_key || m.clientKey,
    from,
    text: deleted ? 'This message was deleted' : String(m.text || m.content || m.body || ''),
    createdAt: m.createdAt || m.created_at || utcNowIso(),
    state: (m.state || m.delivery_status || 'sent') as GMsg['state'],
    system: !!(m.system || m.message_type === 'system'),
    mine: myId ? from === myId : !!m.mine,
    edited: !!(m.edited || m.edited_at),
    deleted,
    replyToId: m.replyToId || m.reply_to_message_id || null,
    replyToText: m.replyToText || m.reply_to_text || null,
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
  const [replyTo, setReplyTo] = useState<GMsg | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<GMsg | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const myId = me?.id || ''
  const memberCount = g?.memberIds?.length || g?.members?.filter((m: any) => !m.pending)?.length || 0
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
        if (cached?.length && !cancelled) {
          setMsgs(cached.map((m: any) => mapApiMsg(m, myId)))
        }
        const { messages } = await api.messages(conversationId)
        if (cancelled) return
        const mapped = (messages || []).map((m: any) => mapApiMsg(m, myId))
        setMsgs(mapped)
        await applyThreadMessages(conversationId, messages || [], 'replace')
        void mergeCachedMessages(conversationId, messages || [])
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

  useEffect(() => {
    if (replyTo || editingId) {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [replyTo, editingId])

  const wallpaperCss = resolveWallpaper(settings.wallpaper, settings.colorMode)
  const wallpaperImg = resolveWallpaperImage(settings.wallpaper, settings.wallpaperImage)
  const isPictureBg = settings.wallpaper === 'Picture' && !!wallpaperImg
  const showPattern = settings.chatPattern !== false

  const cancelComposeExtras = () => {
    setReplyTo(null)
    setEditingId(null)
  }

  const send = async () => {
    const body = text.trim()
    if (!body || !conversationId || sending) return

    if (editingId) {
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
    const clientKey = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const optimistic: GMsg = {
      id: clientKey,
      clientKey,
      from: myId,
      text: body,
      createdAt: utcNowIso(),
      state: 'pending',
      mine: true,
      replyToId: replyTo?.id || null,
      replyToText: replyTo?.text || null,
    }
    setMsgs((m) => [...m, optimistic])
    setText('')
    const replySnap = replyTo
    setReplyTo(null)
    setEmoji(false)
    try {
      const { message } = await api.send(conversationId, body, null, {
        clientKey,
        replyToId: replySnap?.id,
      })
      const mapped = mapApiMsg(message, myId)
      setMsgs((list) =>
        list.map((m) =>
          m.clientKey === clientKey || m.id === clientKey
            ? { ...mapped, clientKey, replyToId: mapped.replyToId || replySnap?.id, replyToText: mapped.replyToText || replySnap?.text }
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
              return (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`mb-1.5 flex ${mine ? 'justify-end' : 'justify-start'}`}
                >
                  <button
                    type="button"
                    onClick={() => setActionMsg(m)}
                    className={`max-w-[78%] rounded-2xl px-3 py-2 text-left shadow-sm ${
                      mine
                        ? 'rounded-br-md bg-brand-purple text-white'
                        : 'rounded-bl-md bg-white text-ink ring-1 ring-black/[0.04] dark:bg-[#1f2c34] dark:text-gray-100 dark:ring-white/10'
                    } ${m.deleted ? 'opacity-70 italic' : ''}`}
                  >
                    {!mine ? (
                      <span className="mb-0.5 block text-[11px] font-extrabold text-brand-purple">
                        {nameFor(m.from)}
                      </span>
                    ) : null}
                    {(m.replyToId || m.replyToText) && !m.deleted ? (
                      <div
                        className={`mb-1.5 border-l-2 pl-2 text-left ${
                          mine ? 'border-white/50 text-white/90' : 'border-brand-purple/50 text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        <span className="block text-[10px] font-extrabold uppercase opacity-80">Reply</span>
                        <span className="line-clamp-2 text-xs font-semibold">{m.replyToText || 'Original message'}</span>
                      </div>
                    ) : null}
                    <span className="whitespace-pre-wrap break-words font-semibold leading-snug">
                      {linkifyText(m.text)}
                    </span>
                    <div
                      className={`mt-1 flex items-center justify-end gap-1 text-[10px] font-bold ${
                        mine ? 'text-white/75' : 'text-gray-400'
                      }`}
                    >
                      {m.edited && !m.deleted ? <span className="opacity-80">edited</span> : null}
                      <span>{formatLocalTime(m.createdAt)}</span>
                      {mine ? (
                        m.state === 'pending' ? (
                          <Clock size={12} />
                        ) : m.state === 'failed' ? (
                          <span
                            className="inline-flex items-center gap-0.5 text-red-200"
                            onClick={(e) => {
                              e.stopPropagation()
                              void retry(m)
                            }}
                          >
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
                </motion.div>
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
                {actionMsg.deleted ? 'Deleted message' : actionMsg.text.slice(0, 80)}
              </p>
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

        {/* Composer — theme-aware (fixes white bar in dark mode) */}
        <div className="flex shrink-0 items-center gap-2 border-t border-gray-200/80 bg-white px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] dark:border-white/10 dark:bg-[#1f2c34]">
          <button
            type="button"
            onClick={() => setEmoji((v) => !v)}
            className="flex h-11 w-11 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"
            aria-label="Emoji"
          >
            <Smile size={22} />
          </button>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
            placeholder={editingId ? 'Edit message' : 'Message'}
            className="h-11 flex-1 rounded-full bg-gray-100 px-4 text-[15px] font-semibold text-ink outline-none ring-brand-purple/30 focus:ring-2 dark:bg-[#2a3942] dark:text-gray-100 dark:placeholder:text-gray-400"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={!text.trim() || !conversationId}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-purple text-white disabled:opacity-40"
            aria-label={editingId ? 'Save' : 'Send'}
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
