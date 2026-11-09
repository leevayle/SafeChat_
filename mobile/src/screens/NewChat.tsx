import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Search, UserPlus, Bookmark } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { ScreenHeader } from '../components/ui'
import { useStore } from '../store'

type Props = {
  onClose: () => void
  onPick: (id: string) => void
  onOpenContacts?: () => void
}

export function NewChat({ onClose, onPick, onOpenContacts }: Props) {
  const { contacts, me } = useStore()
  const [q, setQ] = useState('')

  const list = useMemo(() => {
    const qq = q.trim().toLowerCase()
    const base = contacts.filter((c) => !c.blocked && c.id !== me?.id && c.peerId !== me?.id)
    if (!qq) return base
    return base.filter(
      (c) =>
        c.name.toLowerCase().includes(qq) ||
        c.username?.toLowerCase().includes(qq) ||
        c.phone.includes(qq),
    )
  }, [contacts, q, me?.id])

  return (
    <div className="flex h-full flex-col bg-white">
      <ScreenHeader title="New chat" onBack={onClose} />
      <div className="px-4 pb-3 pt-3">
        <div className="flex items-center gap-2 rounded-2xl bg-gray-100 px-3 py-2.5 ring-1 ring-black/5">
          <Search size={18} className="text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search your contacts"
            className="w-full bg-transparent text-sm font-semibold outline-none"
          />
        </div>
      </div>

      {me?.id && (
        <button
          type="button"
          onClick={() => onPick(me.id)}
          className="mx-4 mb-2 flex items-center gap-3 rounded-2xl bg-brand-purple/8 px-4 py-3 text-left ring-1 ring-brand-purple/15 transition active:scale-[0.99]"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-purple/15 text-brand-purple">
            <Bookmark size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-extrabold text-ink">Message yourself</span>
            <span className="block text-[11px] font-semibold text-gray-400">
              Notes, links, and reminders, just for you
            </span>
          </span>
        </button>
      )}

      {onOpenContacts && (
        <button
          type="button"
          onClick={onOpenContacts}
          className="mx-4 mb-2 flex items-center gap-3 rounded-2xl bg-brand-purple/10 px-4 py-3 text-left font-extrabold text-brand-purple ring-1 ring-brand-purple/10"
        >
          <UserPlus size={20} />
          Add new contact
        </button>
      )}

      <div className="flex-1 overflow-y-auto px-2 pb-8">
        {list.length === 0 && (
          <p className="px-4 py-10 text-center text-sm font-bold text-gray-400">
            Your contact list is empty. Add people first, then start a chat.
          </p>
        )}
        {list.map((c, i) => (
          <motion.button
            key={c.entryId || c.id}
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.03, 0.25) }}
            onClick={() => onPick(c.id)}
            className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-gray-50"
          >
            <Avatar contact={c} size={48} />
            <div className="min-w-0">
              <p className="truncate font-extrabold">{c.name}</p>
              <p className="truncate text-xs font-semibold text-gray-500">
                @{c.username || ', '}
              </p>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  )
}
