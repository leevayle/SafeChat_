import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Search, Users, X, UserPlus, MessageCircle, Phone } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { ScreenHeader } from '../components/ui'
import { useStore } from '../store'

export function NewChat({
  onClose,
  onStart,
  onNewGroup,
  onCall,
}: {
  onClose: () => void
  onStart: (id: string) => void
  onNewGroup: () => void
  onCall?: (id: string) => void
}) {
  const { contacts } = useStore()
  const [q, setQ] = useState('')

  const list = useMemo(() => {
    const f = contacts.filter(
      (c) =>
        !q.trim() ||
        c.name.toLowerCase().includes(q.trim().toLowerCase()) ||
        c.username?.toLowerCase().includes(q.trim().toLowerCase()) ||
        c.phone.includes(q.replace(/\s/g, '')),
    )
    return [...f].sort((a, b) => a.name.localeCompare(b.name))
  }, [contacts, q])

  const empty = q.trim().length > 0 && list.length === 0

  return (
    <div className="flex h-full flex-col bg-white">
      <ScreenHeader title="New chat" onBack={onClose} />
      <div className="px-4 pb-2 pt-4">
        <div className="flex h-12 items-center gap-2 rounded-full bg-gray-100 px-5 focus-within:bg-white focus-within:ring-4 focus-within:ring-brand-purple/25">
          <Search size={18} className="text-brand-purple" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or username"
            className="w-full bg-transparent font-bold outline-none placeholder:font-semibold placeholder:text-gray-400"
          />
          {q && (
            <button type="button" onClick={() => setQ('')} aria-label="Clear">
              <X size={18} className="text-gray-400" />
            </button>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onNewGroup}
        className="mx-4 mt-2 flex items-center gap-3 rounded-2xl px-3 py-3 font-bold hover:bg-gray-50"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-purple/10 text-brand-purple">
          <Users size={20} />
        </span>
        New group
      </button>

      {empty ? (
        <div className="mt-6 px-5">
          <p className="text-center font-bold text-gray-400">No contact matched “{q}”</p>
          <div className="mt-5 space-y-2">
            <button
              type="button"
              onClick={() => {
                // start chat with synthetic id from query so UI still works
                const id = contacts[0]?.id
                if (id) onStart(id)
                else onClose()
              }}
              className="flex w-full items-center gap-3 rounded-2xl bg-gray-50 px-4 py-3 font-bold hover:bg-gray-100"
            >
              <MessageCircle size={20} className="text-brand-purple" /> Start a chat with “{q}”
            </button>
            <button
              type="button"
              onClick={() => {
                const id = contacts[0]?.id
                if (id && onCall) onCall(id)
                else if (id) onStart(id)
              }}
              className="flex w-full items-center gap-3 rounded-2xl bg-gray-50 px-4 py-3 font-bold hover:bg-gray-100"
            >
              <Phone size={20} className="text-brand-purple" /> Call “{q}”
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex w-full items-center gap-3 rounded-2xl bg-brand-purple/10 px-4 py-3 font-bold text-brand-purple"
            >
              <UserPlus size={20} /> Add “{q}” as a contact
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-4 px-5 text-xs font-extrabold uppercase tracking-wide text-gray-400">
            Contacts on SafeChat
          </p>
          <ul className="mt-1 flex-1 overflow-y-auto px-2 pb-8">
            {list.map((c, i) => (
              <motion.button
                key={c.id}
                type="button"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                onClick={() => onStart(c.id)}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-gray-50"
              >
                <Avatar contact={c} size={48} />
                <div className="min-w-0">
                  <p className="truncate font-extrabold">{c.name}</p>
                  <p className="truncate text-sm font-semibold text-gray-500">
                    @{c.username} · {c.bio || c.phone}
                  </p>
                </div>
              </motion.button>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
