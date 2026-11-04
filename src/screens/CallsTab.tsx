import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Phone,
  Video,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Plus,
  Search,
  X,
  ContactRound,
} from 'lucide-react'
import { BrandMark } from '../components/AppHeaderLogo'
import { Avatar } from '../components/Avatar'
import { useStore } from '../store'

type Props = {
  onCall: (id: string, kind: 'audio' | 'video') => void
  onSimulateIncoming: () => void
  onOpenContacts?: () => void
}

const FILTERS = ['All', 'Missed', 'Video', 'Audio'] as const
type CallFilter = (typeof FILTERS)[number]

export function CallsTab({ onCall, onOpenContacts }: Props) {
  const { calls, contacts } = useStore()
  const [picker, setPicker] = useState(false)
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<'audio' | 'video'>('audio')
  const [filter, setFilter] = useState<CallFilter>('All')

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

  const filteredCalls = useMemo(() => {
    return calls.filter((c: any) => {
      const d = c.direction || c.dir
      const missed = c.status === 'missed' || d === 'missed'
      if (filter === 'Missed') return missed
      if (filter === 'Video') return c.kind === 'video'
      if (filter === 'Audio') return c.kind !== 'video'
      return true
    })
  }, [calls, filter])

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
    <div className="relative flex h-full flex-col bg-white">
      <header className="sticky top-0 z-10 flex min-h-16 shrink-0 items-center justify-between border-b border-gray-200 bg-white/95 px-5 pt-[max(10px,env(safe-area-inset-top))] backdrop-blur">
        <BrandMark />
        <button
          type="button"
          aria-label="Contacts"
          onClick={() => onOpenContacts?.()}
          className="flex h-10 w-10 items-center justify-center rounded-full text-brand-purple hover:bg-gray-100"
        >
          <ContactRound size={20} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pb-28">
        <h2 className="mb-2 px-5 pt-2.5 text-xl font-black">Calls</h2>

        {/* Filter chips — WhatsApp / Telegram style */}
        <div className="mb-2 flex gap-2 overflow-x-auto no-scrollbar px-4 pb-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-extrabold transition ${
                filter === f
                  ? 'bg-brand-purple text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <ul className="mt-1 px-2">
          {filteredCalls.length === 0 && (
            <p className="px-4 py-12 text-center font-bold text-gray-400">
              {filter === 'All' ? 'No recent calls' : `No ${filter.toLowerCase()} calls`}
            </p>
          )}
          {filteredCalls.map((c: any, i: number) => {
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
                transition={{ delay: Math.min(i * 0.03, 0.24) }}
                className="border-b border-gray-100/80 last:border-0"
              >
                <button
                  type="button"
                  onClick={() => start(c.contactId, c.kind === 'video' ? 'video' : 'audio')}
                  className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-gray-50"
                >
                  <Avatar contact={ct} size={48} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-extrabold">
                      {c.phone || c.name || ct.name || (c.username ? `@${c.username}` : 'Unknown')}
                    </p>
                    <p
                      className={`flex items-center gap-1 text-sm font-semibold ${
                        c.status === 'missed' ? 'text-brand-red' : 'text-gray-500'
                      }`}
                    >
                      <I size={14} /> {c.kind === 'video' ? 'Video' : 'Voice'}
                      {c.duration && c.status === 'completed' ? ` · ${c.duration}` : ''}
                      {c.time ? ` · ${c.time}` : ''}
                    </p>
                    {!c.phone && c.username ? (
                      <p className="truncate text-xs font-semibold text-gray-400">@{c.username}</p>
                    ) : null}
                  </div>
                  <span className="flex h-9 w-9 items-center justify-center rounded-full text-brand-purple">
                    {c.kind === 'video' ? <Video size={18} /> : <Phone size={18} />}
                  </span>
                </button>
              </motion.li>
            )
          })}
        </ul>
      </div>

      <motion.button
        type="button"
        aria-label="New call"
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        onClick={() => setPicker(true)}
        className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-5 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-brand-purple text-white shadow-[0_10px_28px_-6px_rgba(123,44,191,0.55)]"
      >
        <Plus size={26} strokeWidth={2.4} />
      </motion.button>

      <AnimatePresence>
        {picker && (
          <motion.div
            className="fixed inset-0 z-[80] flex flex-col bg-white"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
          >
            <header className="flex items-center gap-2 border-b border-gray-100 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
              <button
                type="button"
                onClick={() => setPicker(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100"
                aria-label="Close"
              >
                <X size={22} />
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
            <div className="px-4 py-3">
              <div className="flex items-center gap-2 rounded-full bg-gray-100 px-4 py-2.5">
                <Search size={18} className="text-gray-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search contacts"
                  className="w-full bg-transparent text-sm font-semibold outline-none"
                />
              </div>
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-8">
              {list.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => start(c.id, kind)}
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-gray-50"
                  >
                    <Avatar contact={c} size={44} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-extrabold">{c.name}</p>
                      <p className="truncate text-xs font-semibold text-gray-400">
                        {c.username ? `@${c.username}` : c.phone}
                      </p>
                    </div>
                    {kind === 'video' ? (
                      <Video size={18} className="text-brand-purple" />
                    ) : (
                      <Phone size={18} className="text-brand-purple" />
                    )}
                  </button>
                </li>
              ))}
              {list.length === 0 && (
                <p className="py-12 text-center text-sm font-bold text-gray-400">No contacts found</p>
              )}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
