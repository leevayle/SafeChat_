import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Search, Plus, Pencil, Phone, MessageCircle, X, UserPlus, Trash2 } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { ScreenHeader } from '../components/ui'
import { useStore } from '../store'
import { PillButton } from '../components/PillButton'
import { ConfirmDialog } from '../components/ConfirmDialog'

type Props = {
  onClose: () => void
  onChat: (id: string) => void
  onCall: (id: string, kind: 'audio' | 'video') => void
}

export function Contacts({ onClose, onChat, onCall }: Props) {
  const { contacts, me } = useStore()
  const [q, setQ] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [draft, setDraft] = useState({ name: '', phone: '', bio: '' })
  const [adding, setAdding] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [local, setLocal] = useState<
    { id: string; name: string; phone: string; bio: string; hue: [string, string] }[]
  >(() => {
    try {
      return JSON.parse(localStorage.getItem('sc_local_contacts') || '[]')
    } catch {
      return []
    }
  })

  const saveLocal = (list: typeof local) => {
    setLocal(list)
    localStorage.setItem('sc_local_contacts', JSON.stringify(list))
  }

  const deleteContact = (id: string) => {
    saveLocal(local.filter((c) => c.id !== id))
    const hidden = JSON.parse(localStorage.getItem('sc_hidden_contacts') || '[]')
    if (!hidden.includes(id)) {
      hidden.push(id)
      localStorage.setItem('sc_hidden_contacts', JSON.stringify(hidden))
    }
    setDeleteId(null)
  }

  const hidden = (() => {
    try {
      return JSON.parse(localStorage.getItem('sc_hidden_contacts') || '[]') as string[]
    } catch {
      return []
    }
  })()


  const all = useMemo(() => {
    const remote = contacts.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      bio: c.bio || '',
      hue: c.hue,
      remote: true as const,
    }))
    const extras = local.map((c) => ({ ...c, remote: false as const }))
    return [...remote, ...extras].filter((c) => !hidden.includes(c.id)).sort((a, b) => a.name.localeCompare(b.name))
  }, [contacts, local])

  const list = useMemo(() => {
    const qq = q.trim().toLowerCase()
    if (!qq) return all
    return all.filter(
      (c) =>
        c.name.toLowerCase().includes(qq) ||
        c.phone.includes(qq) ||
        c.bio.toLowerCase().includes(qq),
    )
  }, [all, q])

  const startEdit = (c: (typeof all)[0]) => {
    setEditId(c.id)
    setDraft({ name: c.name, phone: c.phone, bio: c.bio })
    setAdding(false)
  }

  const saveEdit = () => {
    if (!editId) return
    const next = local.map((c) =>
      c.id === editId ? { ...c, name: draft.name, phone: draft.phone, bio: draft.bio } : c,
    )
    // if was remote-only, create local override entry
    if (!local.some((c) => c.id === editId)) {
      next.push({
        id: editId,
        name: draft.name,
        phone: draft.phone,
        bio: draft.bio,
        hue: ['#7B2CBF', '#6389EB'],
      })
    }
    saveLocal(next)
    setEditId(null)
  }

  const addNew = () => {
    if (!draft.name.trim()) return
    const id = 'local_' + Date.now().toString(36)
    saveLocal([
      ...local,
      {
        id,
        name: draft.name.trim(),
        phone: draft.phone.trim(),
        bio: draft.bio.trim(),
        hue: ['#F97316', '#9C31A1'],
      },
    ])
    setAdding(false)
    setDraft({ name: '', phone: '', bio: '' })
  }

  return (
    <div className="flex h-full flex-col bg-white ">
      <ScreenHeader title="Contacts" onBack={onClose} />
      <div className="px-4 pb-2 pt-3">
        <div className="flex h-11 items-center gap-2 rounded-full bg-gray-100 px-4">
          <Search size={18} className="text-brand-purple" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search contacts"
            className="w-full bg-transparent font-semibold outline-none"
          />
          {q && (
            <button type="button" onClick={() => setQ('')} aria-label="Clear">
              <X size={16} className="text-gray-400" />
            </button>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          setAdding(true)
          setEditId(null)
          setDraft({ name: '', phone: '', bio: '' })
        }}
        className="mx-4 mb-2 flex items-center gap-3 rounded-2xl px-3 py-3 font-bold text-brand-purple hover:bg-brand-purple/5"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-purple/10">
          <UserPlus size={20} />
        </span>
        Add new contact
      </button>

      <ul className="flex-1 overflow-y-auto px-2 pb-8">
        {list.length === 0 && (
          <div className="px-4 py-10 text-center">
            <p className="font-bold text-gray-400">No contacts found</p>
            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setAdding(true)
                  setDraft({ name: q, phone: '', bio: '' })
                }}
                className="w-full rounded-full bg-brand-purple/10 py-3 font-bold text-brand-purple"
              >
                Add “{q}” as contact
              </button>
            </div>
          </div>
        )}
        {list.map((c, i) => (
          <motion.li
            key={c.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.02 }}
            className="flex items-center gap-2 rounded-2xl px-2 py-2 hover:bg-gray-50"
          >
            <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => onChat(c.id)}>
              <Avatar contact={{ id: c.id, name: c.name, hue: c.hue }} size={48} />
              <div className="min-w-0">
                <p className="truncate font-extrabold">{c.name}</p>
                <p className="truncate text-sm font-semibold text-gray-500">{c.phone || c.bio || '—'}</p>
              </div>
            </button>
            <button
              type="button"
              aria-label="Chat"
              onClick={() => onChat(c.id)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-brand-purple hover:bg-brand-purple/10"
            >
              <MessageCircle size={18} />
            </button>
            <button
              type="button"
              aria-label="Call"
              onClick={() => onCall(c.id, 'audio')}
              className="flex h-9 w-9 items-center justify-center rounded-full text-brand-purple hover:bg-brand-purple/10"
            >
              <Phone size={18} />
            </button>
            <button
              type="button"
              aria-label="Edit"
              onClick={() => startEdit(c)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
            >
              <Pencil size={16} />
            </button>
            <button
              type="button"
              aria-label="Delete contact"
              onClick={() => setDeleteId(c.id)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-brand-red/80 hover:bg-brand-red/10"
            >
              <Trash2 size={16} />
            </button>
          </motion.li>
        ))}
      </ul>

      {(adding || editId) && (
        <div className="absolute inset-0 z-20 flex flex-col bg-white px-6 pt-14">
          <h3 className="text-xl font-black">{adding ? 'New contact' : 'Edit contact'}</h3>
          <div className="mt-6 space-y-3">
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Name"
              className="h-12 w-full rounded-full bg-gray-100 px-5 font-bold outline-none"
            />
            <input
              value={draft.phone}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              placeholder="Phone"
              className="h-12 w-full rounded-full bg-gray-100 px-5 font-semibold outline-none"
            />
            <input
              value={draft.bio}
              onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
              placeholder="Note (optional)"
              className="h-12 w-full rounded-full bg-gray-100 px-5 font-semibold outline-none"
            />
          </div>
          <div className="mt-8 flex gap-3">
            <button
              type="button"
              onClick={() => {
                setAdding(false)
                setEditId(null)
              }}
              className="flex-1 rounded-full bg-gray-100 py-3 font-bold"
            >
              Cancel
            </button>
            <div className="flex-1">
              <PillButton variant="orange" onClick={adding ? addNew : saveEdit}>
                Save
              </PillButton>
            </div>
          </div>
        </div>
      )}
          <ConfirmDialog
        open={!!deleteId}
        title="Delete contact?"
        message="They will be removed from your contacts list. Chats are kept."
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteContact(deleteId)}
      />
    </div>
  )
}

