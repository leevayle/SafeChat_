import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Search, Plus, Pencil, Phone, MessageCircle, X, UserPlus, Trash2, Star } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { ScreenHeader } from '../components/ui'
import { useStore } from '../store'
import { PillButton } from '../components/PillButton'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { api, type ApiContact } from '../api'

type Props = {
  onClose: () => void
  onChat: (id: string) => void
  onCall: (id: string, kind: 'audio' | 'video') => void
}

export function Contacts({ onClose, onChat, onCall }: Props) {
  const { contacts, refreshContacts, showToast } = useStore()
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<ApiContact | null>(null)
  const [draft, setDraft] = useState({ savedName: '', note: '', phone: '' })
  const [adding, setAdding] = useState(false)
  const [addForm, setAddForm] = useState({ username: '', phone: '', savedName: '' })
  const [searchHits, setSearchHits] = useState<any[]>([])
  const [busy, setBusy] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const list = useMemo(() => {
    const qq = q.trim().toLowerCase()
    const base = [...contacts].sort(
      (a, b) => Number(!!b.pinned) - Number(!!a.pinned) || a.name.localeCompare(b.name),
    )
    if (!qq) return base
    return base.filter(
      (c) =>
        c.name.toLowerCase().includes(qq) ||
        c.username?.toLowerCase().includes(qq) ||
        c.phone.includes(qq) ||
        c.note?.toLowerCase().includes(qq),
    )
  }, [contacts, q])

  const openEdit = (c: ApiContact) => {
    setEdit(c)
    setDraft({ savedName: c.savedName || c.name, note: c.note || '', phone: c.phone })
  }

  const saveEdit = async () => {
    if (!edit) return
    setBusy(true)
    try {
      await api.updateContact(edit.entryId, {
        savedName: draft.savedName,
        note: draft.note,
        phone: draft.phone,
      })
      await refreshContacts()
      showToast('Contact updated')
      setEdit(null)
    } catch (e: any) {
      showToast(e?.message || 'Could not update')
    } finally {
      setBusy(false)
    }
  }

  const doDelete = async () => {
    if (!deleteId) return
    setBusy(true)
    try {
      await api.deleteContact(deleteId)
      await refreshContacts()
      showToast('Contact deleted')
      setDeleteId(null)
    } catch (e: any) {
      showToast(e?.message || 'Could not delete')
    } finally {
      setBusy(false)
    }
  }

  const toggleFav = async (c: ApiContact) => {
    try {
      await api.updateContact(c.entryId, { favourite: !c.favourite })
      await refreshContacts()
      showToast(c.favourite ? 'Removed from favourites' : 'Added to favourites')
    } catch {
      showToast('Could not update favourite')
    }
  }

  const runSearch = async (value: string) => {
    setAddForm((f) => ({ ...f, username: value }))
    if (value.trim().length < 2) {
      setSearchHits([])
      return
    }
    try {
      const { users } = await api.searchUsers(value.trim())
      setSearchHits(users)
    } catch {
      setSearchHits([])
    }
  }

  const addContact = async (peer?: { id: string; username: string; phone: string; name: string }) => {
    setBusy(true)
    try {
      const res = await api.addContact({
        peerId: peer?.id,
        username: peer?.username || addForm.username || undefined,
        phone: peer?.phone || addForm.phone || undefined,
        savedName: addForm.savedName || peer?.name || peer?.username || addForm.username,
      })
      await refreshContacts()
      showToast(res.pending ? 'Save request sent' : 'Contact saved')
      setAdding(false)
      setAddForm({ username: '', phone: '', savedName: '' })
      setSearchHits([])
    } catch (e: any) {
      showToast(e?.message || 'Could not add contact')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col bg-white">
      <ScreenHeader
        title="Contacts"
        onBack={onClose}
        right={
          <button
            type="button"
            aria-label="Add contact"
            onClick={() => setAdding(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full text-brand-purple hover:bg-gray-100"
          >
            <UserPlus size={22} />
          </button>
        }
      />

      <div className="px-4 pb-3 pt-3">
        <div className="flex items-center gap-2 rounded-2xl bg-gray-100 px-3 py-2.5">
          <Search size={18} className="text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search your contacts"
            className="w-full bg-transparent text-sm font-semibold outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-8">
        {list.length === 0 && (
          <p className="px-4 py-10 text-center text-sm font-bold text-gray-400">
            No contacts yet. Tap + to add someone by username or phone.
          </p>
        )}
        {list.map((c, i) => (
          <motion.div
            key={c.entryId}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.03, 0.3) }}
            className="flex items-center gap-3 rounded-2xl px-3 py-2.5 hover:bg-gray-50"
          >
            <button type="button" onClick={() => onChat(c.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <Avatar contact={c} size={48} />
              <div className="min-w-0">
                <p className="truncate font-extrabold">
                  {c.name}
                  {c.favourite && <Star size={12} className="ml-1 inline text-brand-orange" fill="currentColor" />}
                </p>
                <p className="truncate text-xs font-semibold text-gray-500">
                  @{c.username || '—'} · {c.phone || 'no number'}
                </p>
              </div>
            </button>
            <button type="button" onClick={() => toggleFav(c)} className="rounded-full p-2 text-gray-400 hover:bg-gray-100" aria-label="Favourite">
              <Star size={18} className={c.favourite ? 'text-brand-orange' : ''} fill={c.favourite ? 'currentColor' : 'none'} />
            </button>
            <button type="button" onClick={() => onCall(c.id, 'audio')} className="rounded-full p-2 text-brand-purple hover:bg-gray-100" aria-label="Call">
              <Phone size={18} />
            </button>
            <button type="button" onClick={() => onChat(c.id)} className="rounded-full p-2 text-brand-purple hover:bg-gray-100" aria-label="Chat">
              <MessageCircle size={18} />
            </button>
            <button type="button" onClick={() => openEdit(c)} className="rounded-full p-2 text-gray-500 hover:bg-gray-100" aria-label="Edit">
              <Pencil size={16} />
            </button>
            <button
              type="button"
              onClick={() => setDeleteId(c.entryId)}
              className="rounded-full p-2 text-brand-red hover:bg-red-50"
              aria-label="Delete"
            >
              <Trash2 size={16} />
            </button>
          </motion.div>
        ))}
      </div>

      {/* Add contact sheet */}
      {adding && (
        <div className="absolute inset-0 z-30 flex flex-col bg-white">
          <ScreenHeader title="Add contact" onBack={() => setAdding(false)} />
          <div className="space-y-3 px-5 pt-2">
            <label className="block text-xs font-extrabold text-gray-500">Username on SafeChat</label>
            <input
              value={addForm.username}
              onChange={(e) => runSearch(e.target.value)}
              placeholder="@username"
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 font-semibold outline-none focus:border-brand-purple"
            />
            {searchHits.length > 0 && (
              <ul className="overflow-hidden rounded-2xl border border-gray-100">
                {searchHits.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => addContact(u)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50"
                    >
                      <Avatar contact={u} size={40} />
                      <div>
                        <p className="font-extrabold">{u.name}</p>
                        <p className="text-xs font-semibold text-gray-500">@{u.username}</p>
                      </div>
                      <Plus size={18} className="ml-auto text-brand-purple" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <label className="block text-xs font-extrabold text-gray-500">Or phone number</label>
            <input
              value={addForm.phone}
              onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="+254…"
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 font-semibold outline-none focus:border-brand-purple"
            />
            <label className="block text-xs font-extrabold text-gray-500">Save as (your private name)</label>
            <input
              value={addForm.savedName}
              onChange={(e) => setAddForm((f) => ({ ...f, savedName: e.target.value }))}
              placeholder="How you want to see them"
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 font-semibold outline-none focus:border-brand-purple"
            />
            <PillButton onClick={() => addContact()} disabled={busy || (!addForm.username && !addForm.phone)}>
              {busy ? 'Saving…' : 'Save contact'}
            </PillButton>
          </div>
        </div>
      )}

      {/* Edit sheet */}
      {edit && (
        <div className="absolute inset-0 z-30 flex flex-col bg-white">
          <ScreenHeader title="Edit contact" onBack={() => setEdit(null)} />
          <div className="space-y-3 px-5 pt-2">
            <p className="text-xs font-bold text-gray-400">@{edit.username || 'not on SafeChat'}</p>
            <label className="block text-xs font-extrabold text-gray-500">Name (only you see this)</label>
            <input
              value={draft.savedName}
              onChange={(e) => setDraft((d) => ({ ...d, savedName: e.target.value }))}
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 font-semibold outline-none focus:border-brand-purple"
            />
            <label className="block text-xs font-extrabold text-gray-500">Note</label>
            <input
              value={draft.note}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 font-semibold outline-none focus:border-brand-purple"
            />
            <label className="block text-xs font-extrabold text-gray-500">Phone</label>
            <input
              value={draft.phone}
              onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 font-semibold outline-none focus:border-brand-purple"
            />
            <PillButton onClick={saveEdit} disabled={busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </PillButton>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        title="Delete contact?"
        message="They will be removed from your contact list only. Chat history stays."
        confirmLabel="Delete"
        danger
        onConfirm={doDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  )
}
