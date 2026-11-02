import { useEffect, useRef, useState, memo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Phone, Video, Smile, Send, Check, CheckCheck, ImagePlus, X } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { api, type ApiMsg } from '../api'
import { FONT_SIZES, WALLPAPERS, useStore } from '../store'

type Props = { contactId: string; onBack: () => void; onCall: (kind: 'audio' | 'video') => void }

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

function ChatWindowInner({ contactId, onBack, onCall }: Props) {
  const { settings, contacts, me, refreshChats, showToast } = useStore()
  const c = contacts.find((x) => x.id === contactId || x.peerId === contactId) || {
    id: contactId,
    name: contactId,
    username: '',
    phone: '',
    bio: '',
    photo: null,
    online: false,
    hue: ['#7B2CBF', '#6389EB'] as [string, string],
  }
  const [msgs, setMsgs] = useState<ApiMsg[]>([])
  const [text, setText] = useState('')
  const [typing, setTyping] = useState(false)
  const [emoji, setEmoji] = useState(false)
  const [loading, setLoading] = useState(true)
  const [pendingImage, setPendingImage] = useState<string | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = async (silent = false) => {
    try {
      const { messages } = await api.messages(contactId)
      setMsgs((prev) => {
        if (JSON.stringify(prev) === JSON.stringify(messages)) return prev
        return messages
      })
    } catch {
      /* */
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    load(false)
    const t = setInterval(() => load(true), 4000)
    return () => clearInterval(t)
  }, [contactId])


  useEffect(() => {
    let last = 0
    const onType = () => {
      const now = Date.now()
      if (now - last < 1200) return
      last = now
      if (settings.typingIndicator) api.setTyping(contactId).catch(() => {})
    }
    // exposed via input onChange below
    ;(window as any).__sc_type = onType
    return () => { delete (window as any).__sc_type }
  }, [contactId, settings.typingIndicator])

  useEffect(() => {
    if (!settings.typingIndicator) return
    const tick = async () => {
      try {
        const { typing: t } = await api.getTyping(contactId)
        setTyping(t)
      } catch { /* */ }
    }
    tick()
    const id = setInterval(tick, 1500)
    return () => clearInterval(id)
  }, [contactId, settings.typingIndicator])

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [msgs.length, pendingImage])

  const send = async () => {
    const t = text.trim()
    if (!t && !pendingImage) return
    setText('')
    const img = pendingImage
    setPendingImage(null)
    setEmoji(false)
    try {
      const { message } = await api.send(contactId, t, img)
      setMsgs((m) => [...m, message])
      // background only — do not disrupt this window
      setTimeout(() => { load(true); refreshChats() }, 3000)
    } catch {
      /* */
    }
  }

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f || !f.type.startsWith('image/')) return
    if (f.size > 8 * 1024 * 1024) return
    const data = await fileToDataUrl(f)
    setPendingImage(data)
  }

  return (
    <div className="flex h-full flex-col" style={{ background: WALLPAPERS[settings.wallpaper] || '#F3F4F6' }}>
      <header className="z-10 flex shrink-0 items-center gap-1 bg-white px-2 pb-3 pt-5 shadow-sm">
        <button
          type="button"
          aria-label="Back"
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100"
        >
          <ArrowLeft size={22} />
        </button>
        <Avatar contact={c} size={44} />
        <div className="ml-2 min-w-0 flex-1">
          <p className="truncate font-extrabold leading-tight">{c.name}</p>
          <p className={`text-xs font-bold ${c.online ? 'text-green-500' : 'text-gray-400'}`}>
            {typing ? 'typing…' : c.online ? 'Online' : 'Last seen recently'}
          </p>
        </div>
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
      </header>

      <div
        className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4"
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
            return (
              <motion.div
                key={m.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[78%] overflow-hidden shadow-sm ${
                    mine
                      ? 'rounded-3xl rounded-br-md bg-gradient-to-br from-brand-magenta to-brand-purple text-white'
                      : 'rounded-3xl rounded-bl-md bg-white text-ink'
                  }`}
                >
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
                    {mine &&
                      (m.state === 'sent' ? (
                        <Check size={14} />
                      ) : (
                        <CheckCheck
                          size={14}
                          className={m.state === 'read' && settings.readReceipts ? 'text-sky-300' : ''}
                        />
                      ))}
                  </p>
                </div>
              </motion.div>
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
        <div ref={end} />
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

      <div className="flex items-center gap-1.5 bg-white px-2 py-3 safe-pb">
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
  )
}

export const ChatWindow = memo(ChatWindowInner)
