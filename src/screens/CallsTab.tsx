import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Phone, Video, PhoneIncoming, PhoneOutgoing, PhoneMissed, Plus, Search, X, BellRing } from 'lucide-react'
import { BrandMark } from '../components/AppHeaderLogo'
import { Avatar } from '../components/Avatar'
import { useStore } from '../store'

type Props = {
  onCall: (id: string, kind: 'audio' | 'video') => void
  onSimulateIncoming: () => void
}

export function CallsTab({ onCall, onSimulateIncoming }: Props) {
  const { calls, contacts, refreshCalls } = useStore()
  const [picker, setPicker] = useState(false)
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<'audio' | 'video'>('audio')

  const list = useMemo(() => {
    const qq = q.trim().toLowerCase()
    return contacts
      .filter(
        (c) =>
          !qq ||
          c.name.toLowerCase().includes(qq) ||
          c.username?.toLowerCase().includes(qq) ||
          c.phone.includes(qq),
      )
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [contacts, q])

  const icon = (c: any) => {
    const d = c.direction || c.dir
    if (c.status === 'missed' || d === 'missed') return PhoneMissed
    if (d === 'in') return PhoneIncoming
    return PhoneOutgoing
  }

  const start = (id: string, k: 'audio' | 'video') => {
    setPicker(false)
    setQ('')
    onCall(id, k)
  }

  return (
    <div className="relative h-full overflow-y-auto pb-28">
      <header className="flex min-h-16 items-center justify-between border-b border-gray-200 px-5 pt-[10px]">
        <BrandMark />
        <button
          type="button"
          aria-label="Simulate incoming call"
          onClick={onSimulateIncoming}
          className="flex h-10 w-10 items-center justify-center rounded-full text-brand-purple hover:bg-gray-100"
        >
          <BellRing size={20} />
        </button>
      </header>

      <h2 className="mb-1 px-5 text-xl font-black">Recent calls</h2>
      <ul className="mt-2 px-2">
        {calls.length === 0 && (
          <p className="px-4 py-12 text-center font-bold text-gray-400">No recent calls</p>
        )}
        {calls.map((c: any, i: number) => {
          const I = icon(c)
          const ct = contacts.find((x) => x.id === c.contactId) || {
            id: c.contactId,
            name: c.name || c.contactId,
            hue: ['#7B2CBF', '#6389EB'] as [string, string],
            online: false,
            photo: null,
          }
          return (
            <motion.li
              key={c.id || i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="border-b border-gray-100/80 last:border-0"
            >
              <button
                type="button"
                onClick={() => start(c.contactId, c.kind === 'video' ? 'video' : 'audio')}
                className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-gray-50"
              >
                <Avatar contact={ct} size={48} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-extrabold">{ct.name}</p>
                  <p
                    className={`flex items-center gap-1 text-sm font-semibold ${
                      c.status === 'missed' ? 'text-brand-red' : 'text-gray-500'
                    }`}
                  >
                    <I size={14} /> {c.kind === 'video' ? 'Video' : 'Voice'} · {c.time || c.ago}
                  </p>
                </div>
                <span className="flex h-9 w-9 items-center justify-center rounded-full text-brand-purple">
                  {c.kind === 'video' ? <Video size={18} /> : <Phone size={18} />}
                </span>
              </button>
            </motion.li>
          )
        })}
      </ul>

      <motion.button
        type="button"
        aria-label="New call"
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        onClick={() => setPicker(true)}
        className="absolute bottom-24 right-5 z-10 flex h-14 w-14 items-center justify-center rounded-full bg-brand-purple text-white shadow-[0_10px_28px_-6px_rgba(123,44,191,0.55)]"
      >
        <Plus size={26} strokeWidth={2.4} />
      </motion.button>

      <AnimatePresence>
        {picker && (
          <motion.div
            className="absolute inset-0 z-30 flex flex-col bg-white"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          >
            <header className="flex items-center gap-2 px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
              <button
                type="button"
                onClick={() => {
                  setPicker(false)
                  setQ('')
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100"
              >
                <X size={20} />
              </button>
              <h3 className="flex-1 text-lg font-black">New call</h3>
              <div className="flex rounded-full bg-gray-100 p-1">
                {(['audio', 'video'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`rounded-full px-3 py-1.5 text-xs font-extrabold capitalize ${
                      kind === k ? 'bg-white text-brand-purple shadow-sm' : 'text-gray-500'
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </header>
            <div className="px-4 pb-3">
              <div className="flex h-11 items-center gap-2 rounded-full bg-gray-100 px-4">
                <Search size={18} className="text-brand-purple" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search contacts"
                  className="w-full bg-transparent font-semibold outline-none"
                />
              </div>
            </div>
            <ul className="flex-1 overflow-y-auto px-2 pb-8">
              {list.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => start(c.id, kind)}
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-gray-50"
                  >
                    <Avatar contact={c} size={48} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-extrabold">{c.name}</p>
                      <p className="truncate text-sm font-semibold text-gray-500">
                        @{c.username} · {c.phone}
                      </p>
                    </div>
                    {kind === 'video' ? (
                      <Video size={20} className="text-brand-purple" />
                    ) : (
                      <Phone size={20} className="text-brand-purple" />
                    )}
                  </button>
                </li>
              ))}
              {list.length === 0 && (
                <p className="py-10 text-center font-bold text-gray-400">No contacts found</p>
              )}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
