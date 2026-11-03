import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Smile, Send } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { api } from '../api'
import { FONT_SIZES, WALLPAPERS, useStore } from '../store'

const EMOJIS = [
  '😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😋','😎','😍','😘','🥰','😗','😙','😚',
  '🙂','🤗','🤩','🤔','🤨','😐','😑','😶','🙄','😏','😣','😥','😮','🤐','😯','😪','😫','🥱',
  '😴','😌','😛','😜','😝','🤤','😒','😓','😔','😕','🙃','🤑','😲','☹️','🙁','😖','😞','😟',
  '😤','😢','😭','😦','😧','😨','😩','🤯','😬','😰','😱','🥵','🥶','😳','🤪','😵','😡','😠',
  '🤬','😷','🤒','🤕','🤢','🤮','🤧','😇','🥳','🥺','🤠','🤡','🤥','🤫','🤭','🧐','🤓','😈',
  '👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','👍',
  '👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','💪','🦾','🦵','🦶','👂','👃',
  '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝',
  '🔥','⭐','✨','🌟','💫','💥','💢','💦','💨','🎉','🎊','🎈','🎁','🏆','🥇','🎯','💯','✅',
  '☕','🍕','🍔','🍟','🌮','🍣','🍦','🍰','🍺','🍻','🎂','🍪','🍩','🍿','🥗','🍜',
]

export function GroupChat({
  groupId,
  onBack,
  onClosed,
  onCall,
}: {
  groupId: string
  onBack: () => void
  onClosed: () => void
  onCall: (id: string, kind: 'audio' | 'video') => void
}) {
  const { groups, contacts, me, settings, refreshGroups } = useStore()
  const g = groups.find((x) => x.id === groupId)
  const [text, setText] = useState('')
  const [emoji, setEmoji] = useState(false)
  const [msgs, setMsgs] = useState<any[]>(g?.messages || [])
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMsgs(g?.messages || [])
  }, [g?.messages])

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [msgs, emoji])

  if (!g) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="font-bold text-gray-400">Group not found</p>
        <button type="button" onClick={onClosed} className="font-bold text-brand-purple">
          Close
        </button>
      </div>
    )
  }

  const who = (id: string) => contacts.find((c) => c.id === id) || { id, name: id === me?.id ? 'You' : id }

  const send = async () => {
    const t = text.trim()
    if (!t) return
    setText('')
    try {
      const { message } = await api.sendGroup(groupId, t)
      setMsgs((m) => [...m, message])
      refreshGroups()
    } catch {
      /* */
    }
  }

  return (
    <div className="flex h-full flex-col" style={{ background: WALLPAPERS[settings.wallpaper] || '#F3F4F6' }}>
      <header className="z-10 flex shrink-0 items-center gap-2 bg-white px-2 pb-3 pt-5 shadow-sm">
        <button
          type="button"
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100"
        >
          <ArrowLeft size={22} />
        </button>
        <Avatar contact={{ id: g.id, name: g.name, hue: g.hue }} size={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-extrabold">{g.name}</p>
          <p className="truncate text-xs font-bold text-gray-400">
            {g.members?.length || 0} members
          </p>
        </div>
      </header>

      <div
        className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4"
        style={{ fontSize: FONT_SIZES[settings.fontSize] || '1rem' }}
      >
        <AnimatePresence initial={false}>
          {msgs.map((m) => {
            if (m.system) {
              return (
                <p key={m.id} className="mx-auto w-fit rounded-full bg-white/80 px-3 py-1 text-xs font-bold text-gray-500">
                  {who(m.from).name} {m.text}
                </p>
              )
            }
            const mine = m.from === me?.id
            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[78%] px-4 py-2.5 shadow-sm ${
                    mine
                      ? 'rounded-3xl rounded-br-md bg-gradient-to-br from-brand-magenta to-brand-purple text-white'
                      : 'rounded-3xl rounded-bl-md bg-white text-ink'
                  }`}
                >
                  {!mine && (
                    <p className="mb-0.5 text-[11px] font-extrabold text-brand-purple">
                      {who(m.from).name}
                    </p>
                  )}
                  <p className="font-semibold leading-snug">{m.text}</p>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
        <div ref={end} />
      </div>

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

      <div className="flex items-center gap-2 bg-white px-3 py-3 safe-pb">
        <button
          type="button"
          onClick={() => setEmoji((e) => !e)}
          className="flex h-10 w-10 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
        >
          <Smile size={22} />
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
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
          disabled={!text.trim()}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-purple text-white disabled:opacity-40"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  )
}
