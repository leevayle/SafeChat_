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
  const [addForm, setAddForm] = useState({ username: '', phone: '', savedName: '', sharePhone: true })
  const [addMode, setAddMode] = useState<'username' | 'phone'>('username')
  const [phoneCountry, setPhoneCountry] = useState('+254')
  const [searchHits, setSearchHits] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [notFoundPhone, setNotFoundPhone] = useState<string | null>(null)
  const [identity, setIdentity] = useState('')

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
    let note = c.note || ''
    try {
      const map = JSON.parse(localStorage.getItem('sc_contact_notes') || '{}') as Record<string, string>
      const key = c.peerId || c.id
      if (map[key]) note = map[key]
    } catch { /* */ }
    setDraft({ savedName: c.savedName || c.name, note, phone: c.phone || '' })
  }

  const contactKey = (c: ApiContact) => c.peerId || c.id

    const saveEdit = async () => {
    if (!edit) return
    setBusy(true)
    try {
      await api.updateContact(contactKey(edit), {
        savedName: draft.savedName,
        note: draft.note,
      })
      // Private note is local-only (backend stores nickname only)
      try {
        const key = contactKey(edit)
        const raw = localStorage.getItem('sc_contact_notes') || '{}'
        const map = JSON.parse(raw) as Record<string, string>
        if (draft.note) map[key] = draft.note
        else delete map[key]
        localStorage.setItem('sc_contact_notes', JSON.stringify(map))
      } catch { /* */ }
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
      await api.updateContact(contactKey(c), { favourite: !c.favourite })
      await refreshContacts()
      showToast(c.favourite ? 'Removed from favourites' : 'Added to favourites')
    } catch {
      showToast('Could not update favourite')
    }
  }

  const runSearch = async (value: string) => {
    setIdentity(value)
    // Phone numbers (+...) - no live search; resolve only on Send
    if (value.trim().startsWith('+')) {
      setSearchHits([])
      setAddForm((f) => ({ ...f, username: '', phone: value.trim() }))
      setAddMode('phone')
      return
    }
    setAddMode('username')
    setAddForm((f) => ({ ...f, username: value.replace(/^@/, ''), phone: '' }))
    if (value.trim().length < 2) {
      setSearchHits([])
      return
    }
    setSearching(true)
    try {
      const { users } = await api.searchUsers(value.trim().replace(/^@/, ''))
      setSearchHits(users)
    } catch {
      setSearchHits([])
    } finally {
      setSearching(false)
    }
  }

  const addContact = async (peer?: { id: string; username: string; phone: string; name: string }) => {
    setBusy(true)
    setNotFoundPhone(null)
    try {
      let username = (peer?.username || addForm.username || '').replace(/^@/, '').trim()
      let phoneFull = (peer?.phone || addForm.phone || identity || '').trim()
      if (phoneFull && !phoneFull.startsWith('+') && addMode === 'phone') {
        phoneFull = `${phoneCountry}${phoneFull.replace(/\D/g, '')}`
      }
      // Phone path: look up only when Send is pressed
      if (!peer && (phoneFull.startsWith('+') || addMode === 'phone')) {
        if (!phoneFull.startsWith('+')) {
          showToast('Enter a full number starting with +')
          setBusy(false)
          return
        }
        try {
          const { users } = await api.searchUsers(phoneFull)
          const hit = (users || []).find(
            (u: any) =>
              String(u.phone || '').replace(/\s/g, '') === phoneFull.replace(/\s/g, '') ||
              String(u.phone_number || '').replace(/\s/g, '') === phoneFull.replace(/\s/g, ''),
          ) || (users || [])[0]
          if (!hit) {
            setNotFoundPhone(phoneFull)
            setBusy(false)
            return
          }
          peer = hit
          username = hit.username
          phoneFull = hit.phone || phoneFull
        } catch {
          setNotFoundPhone(phoneFull)
          setBusy(false)
          return
        }
      }
      if (!peer && !username) {
        showToast('Enter a username or phone (+…)')
        setBusy(false)
        return
      }
      const res = await api.addContact({
        peerId: peer?.id,
        username: username || undefined,
        phone: phoneFull.startsWith('+') ? phoneFull : undefined,
        savedName: addForm.savedName || peer?.name || username || phoneFull,
        sharePhone: addForm.sharePhone,
      })
      await refreshContacts()
      showToast(res.pending ? 'Save request sent' : 'Contact saved')
      setAdding(false)
      setIdentity('')
      setAddForm({ username: '', phone: '', savedName: '', sharePhone: true })
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
                  @{c.username || '-'} · {c.phone || 'no number'}
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
              onClick={() => setDeleteId(c.peerId || c.id)}
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
        <div className="fixed inset-0 z-[90] flex flex-col bg-white">
          <ScreenHeader
            title="Add contact"
            onBack={() => {
              setAdding(false)
              setNotFoundPhone(null)
              setIdentity('')
              setSearchHits([])
            }}
            right={
              <span className="rounded-full bg-brand-purple/10 px-2.5 py-1 text-[11px] font-extrabold text-brand-purple">
                {identity.trim().startsWith('+') ? 'Phone' : 'Username'}
              </span>
            }
          />
          <div className="space-y-3 px-5 pt-2">
            <label className="block text-xs font-extrabold text-gray-500">
              Username or phone
            </label>
            <input
              value={identity}
              onChange={(e) => runSearch(e.target.value)}
              placeholder="@username or +2547…"
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 font-semibold outline-none focus:border-brand-purple"
              inputMode={identity.trim().startsWith('+') ? 'tel' : 'text'}
            />
            <p className="text-[11px] font-semibold text-gray-400">
              {identity.trim().startsWith('+')
                ? 'Phone numbers are checked only when you send the request.'
                : 'Type a username to search, or start with + for a phone number.'}
            </p>
            {searching && !identity.trim().startsWith('+') && (
              <div className="space-y-2 rounded-2xl bg-gray-50 p-3 ring-1 ring-black/5">
                {[0,1,2].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="h-10 w-10 animate-pulse rounded-full bg-gray-200" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="h-3 w-2/5 animate-pulse rounded bg-gray-200" />
                      <div className="h-2.5 w-1/3 animate-pulse rounded bg-gray-100" />
                    </div>
                  </div>
                ))}
                <p className="text-center text-[11px] font-bold text-gray-400">Searching…</p>
              </div>
            )}
            {searchHits.length > 0 && !searching && !identity.trim().startsWith('+') && (
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
            <label className="block text-xs font-extrabold text-gray-500">Save as (only you see this)</label>
            <input
              value={addForm.savedName}
              onChange={(e) => setAddForm((f) => ({ ...f, savedName: e.target.value }))}
              placeholder="How you want to see them"
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 font-semibold outline-none focus:border-brand-purple"
            />
            <button
              type="button"
              onClick={() => setAddForm((f) => ({ ...f, sharePhone: !f.sharePhone }))}
              className="flex w-full items-center justify-between rounded-2xl border border-gray-200 px-4 py-3 text-left"
            >
              <div>
                <p className="text-sm font-extrabold text-ink">Share my phone number</p>
                <p className="text-xs font-semibold text-gray-500">
                  {addForm.sharePhone
                    ? 'They will see your number after accepting'
                    : 'Only your username is shared'}
                </p>
              </div>
              <span
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                  addForm.sharePhone ? 'bg-brand-purple' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${
                    addForm.sharePhone ? 'right-0.5' : 'left-0.5'
                  }`}
                />
              </span>
            </button>
            <PillButton
              onClick={() => addContact()}
              disabled={busy || !identity.trim()}
            >
              {busy ? 'Sending…' : 'Send save request'}
            </PillButton>
          </div>

          {notFoundPhone && (
            <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/40 p-4 sm:items-center">
              <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-xl">
                <p className="text-lg font-black text-ink">Not on SafeChat yet</p>
                <p className="mt-2 text-sm font-semibold text-gray-500">
                  <span className="font-extrabold text-ink">{notFoundPhone}</span> has not joined SafeChat.
                  Invite them with an SMS so you can chat securely.
                </p>
                <div className="mt-5 flex gap-2">
                  <button
                    type="button"
                    className="flex-1 rounded-full bg-gray-100 py-3 text-sm font-extrabold"
                    onClick={() => setNotFoundPhone(null)}
                  >
                    Okay
                  </button>
                  <a
                    href={`sms:${notFoundPhone}?body=${encodeURIComponent(
                      'Join me on SafeChat - private chats, calls and statuses. Get the app and save my number!',
                    )}`}
                    className="flex flex-1 items-center justify-center rounded-full bg-brand-purple py-3 text-sm font-extrabold text-white"
                    onClick={() => setNotFoundPhone(null)}
                  >
                    Send SMS invite
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit sheet */}
      {edit && (
        <div className="fixed inset-0 z-[90] flex flex-col bg-white">
          <ScreenHeader title="Edit contact" onBack={() => setEdit(null)} />
          <div className="space-y-3 px-5 pt-2">
            <p className="text-xs font-bold text-gray-400">@{edit.username || 'not on SafeChat'}</p>
            <label className="block text-xs font-extrabold text-gray-500">Name (only you see this)</label>
            <input
              value={draft.savedName}
              onChange={(e) => setDraft((d) => ({ ...d, savedName: e.target.value }))}
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 font-semibold outline-none focus:border-brand-purple"
            />
            <label className="block text-xs font-extrabold text-gray-500">Note (only you see this)</label>
            <input
              value={draft.note}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 font-semibold outline-none focus:border-brand-purple"
              placeholder="Private note"
            />
            {!!(draft.phone || edit.phone) && (
              <>
                <label className="block text-xs font-extrabold text-gray-500">Phone (shared with you)</label>
                <button
                  type="button"
                  onClick={async () => {
                    const num = draft.phone || edit.phone || ''
                    if (!num) return
                    try {
                      await navigator.clipboard?.writeText(num)
                      showToast('Number copied')
                    } catch {
                      showToast(num)
                    }
                  }}
                  onContextMenu={async (e) => {
                    e.preventDefault()
                    const num = draft.phone || edit.phone || ''
                    if (!num) return
                    try {
                      await navigator.clipboard?.writeText(num)
                      showToast('Number copied')
                    } catch { /* */ }
                  }}
                  className="flex w-full items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-left font-semibold text-gray-700"
                  aria-label="Copy phone number"
                >
                  <span className="select-all">{draft.phone || edit.phone}</span>
                  <span className="text-[11px] font-bold text-brand-purple">Tap to copy</span>
                </button>
              </>
            )}
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
