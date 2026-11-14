import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Plus,
  CheckSquare,
  Square,
  Trash2,
  StickyNote,
  ListTodo,
  Bell,
  ArrowLeft,
  Settings2,
  Lock,
  Pin,
  PinOff,
  Check,
  Circle,
  Loader2,
  Cloud,
  CloudOff,
} from 'lucide-react'
import { PinPad } from './PinPad'
import { WALLPAPERS, useStore } from '../store'
import { api, type ApiNote } from '../api'
import { kvGet, kvSet } from '../lib/kv'

type NoteKind = 'note' | 'checklist' | 'reminder'
type ChecklistItem = { id: string; text: string; done: boolean }
type NoteItem = {
  id: string
  kind: NoteKind
  title: string
  body: string
  items?: ChecklistItem[]
  remindAt?: string | null
  createdAt: string
  updatedAt: string
  pinned?: boolean
  color?: string | null
  _localOnly?: boolean
}

const NOTE_COLORS = [
  { id: 'lavender', bg: 'bg-violet-50 dark:bg-violet-950/40', ring: 'ring-violet-200 dark:ring-violet-800', accent: 'text-violet-600' },
  { id: 'mint', bg: 'bg-emerald-50 dark:bg-emerald-950/40', ring: 'ring-emerald-200 dark:ring-emerald-800', accent: 'text-emerald-600' },
  { id: 'peach', bg: 'bg-orange-50 dark:bg-orange-950/40', ring: 'ring-orange-200 dark:ring-orange-800', accent: 'text-orange-600' },
  { id: 'sky', bg: 'bg-sky-50 dark:bg-sky-950/40', ring: 'ring-sky-200 dark:ring-sky-800', accent: 'text-sky-600' },
  { id: 'rose', bg: 'bg-rose-50 dark:bg-rose-950/40', ring: 'ring-rose-200 dark:ring-rose-800', accent: 'text-rose-600' },
  { id: 'paper', bg: 'bg-white dark:bg-[#1a222d]', ring: 'ring-black/5 dark:ring-white/10', accent: 'text-brand-purple' },
]

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function fromApi(n: ApiNote): NoteItem {
  return {
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    items: n.items,
    remindAt: n.remindAt,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    pinned: n.pinned,
    color: n.color,
  }
}

function toApiPayload(n: NoteItem): Record<string, unknown> {
  return {
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    items: n.items || [],
    remind_at: n.remindAt,
    pinned: !!n.pinned,
    color: n.color || null,
  }
}

function loadLocal(userId: string): NoteItem[] {
  try {
    const raw = kvGet(`sc_notes_${userId}`)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveLocal(userId: string, notes: NoteItem[]) {
  try {
    kvSet(`sc_notes_${userId}`, JSON.stringify(notes))
  } catch {
    /* */
  }
}

function publishNotesPreview(userId: string, notes: NoteItem[]) {
  try {
    const sorted = [...notes].sort(
      (a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0),
    )
    const top = sorted[0]
    const title = top
      ? top.title ||
        (top.kind === 'checklist' ? 'Checklist' : top.kind === 'reminder' ? 'Reminder' : 'Note')
      : 'Notes'
    kvSet(
      `sc_notes_preview_${userId}`,
      JSON.stringify({ title, updatedAt: top?.updatedAt || new Date().toISOString() }),
    )
    window.dispatchEvent(new CustomEvent('sc_notes_preview', { detail: { userId, title } }))
  } catch {
    /* */
  }
}

function colorMeta(id?: string | null) {
  return NOTE_COLORS.find((c) => c.id === id) || NOTE_COLORS[NOTE_COLORS.length - 1]
}

function progress(items?: ChecklistItem[]) {
  if (!items?.length) return { done: 0, total: 0, pct: 0 }
  const done = items.filter((i) => i.done).length
  return { done, total: items.length, pct: Math.round((done / items.length) * 100) }
}

function formatRemind(iso?: string | null) {
  if (!iso) return null
  try {
    const d = new Date(iso.length === 16 ? iso + ':00' : iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function NotesBoard({
  userId,
  displayName,
  username,
  onBack,
  embedded = false,
  showMessages = true,
}: {
  userId: string
  displayName: string
  username?: string
  onBack: () => void
  embedded?: boolean
  showMessages?: boolean
}) {
  const { settings, showToast, upsertChatPreview } = useStore()
  const [notes, setNotes] = useState<NoteItem[]>(() => loadLocal(userId))
  const [editing, setEditing] = useState<NoteItem | null>(null)
  const [composer, setComposer] = useState<NoteKind | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [filter, setFilter] = useState<'all' | NoteKind>('all')
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'ok' | 'offline'>('idle')
  const [saving, setSaving] = useState(false)
  const [showNotes, setShowNotes] = useState(() => {
    try {
      return kvGet(`sc_self_show_notes_${userId}`) !== '0'
    } catch {
      return true
    }
  })
  const [showChecklists, setShowChecklists] = useState(() => {
    try {
      return kvGet(`sc_self_show_checklists_${userId}`) !== '0'
    } catch {
      return true
    }
  })
  const [showReminders, setShowReminders] = useState(() => {
    try {
      return kvGet(`sc_self_show_reminders_${userId}`) !== '0'
    } catch {
      return true
    }
  })
  const [showSelfMessages, setShowSelfMessages] = useState(() => {
    try {
      return kvGet(`sc_self_show_messages_${userId}`) !== '0'
    } catch {
      return true
    }
  })
  const [lockUi, setLockUi] = useState<'none' | 'set' | 'confirm' | 'unlock'>('none')
  const [pendingPin, setPendingPin] = useState('')
  const [locked, setLocked] = useState(() => {
    try {
      return kvGet(`sc_notes_locked_${userId}`) === '1'
    } catch {
      return false
    }
  })

  const wallpaper = WALLPAPERS[settings.wallpaper] || '#F3F4F6'

  // Persist visibility toggles
  useEffect(() => {
    try {
      kvSet(`sc_self_show_notes_${userId}`, showNotes ? '1' : '0')
      kvSet(`sc_self_show_checklists_${userId}`, showChecklists ? '1' : '0')
      kvSet(`sc_self_show_reminders_${userId}`, showReminders ? '1' : '0')
      kvSet(`sc_self_show_messages_${userId}`, showSelfMessages ? '1' : '0')
    } catch {
      /* */
    }
  }, [userId, showNotes, showChecklists, showReminders, showSelfMessages])

  // Local cache + chat preview
  useEffect(() => {
    saveLocal(userId, notes)
    publishNotesPreview(userId, notes)
    const sorted = [...notes].sort(
      (a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0),
    )
    const top = sorted[0]
    const last = top
      ? top.title ||
        (top.kind === 'checklist' ? 'Checklist' : top.kind === 'reminder' ? 'Reminder' : 'Note')
      : 'Notes'
    try {
      upsertChatPreview({
        contactId: userId,
        name: displayName || 'You',
        last,
        iso: top?.updatedAt || new Date().toISOString(),
        unread: 0,
      })
    } catch {
      /* */
    }
  }, [notes, userId, displayName, upsertChatPreview])

  // Server sync on mount — pull + migrate local-only notes
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setSyncState('syncing')
      try {
        const local = loadLocal(userId)
        const localOnly = local.filter((n) => n._localOnly || !/^[a-f0-9]{24}$/i.test(n.id))
        let server: NoteItem[] = []
        if (localOnly.length) {
          server = (await api.syncNotes(localOnly.map(toApiPayload))).map(fromApi)
        } else {
          server = (await api.listNotes()).map(fromApi)
        }
        if (cancelled) return
        if (server.length || local.length) {
          // Prefer server when ids collide
          const byId = new Map<string, NoteItem>()
          for (const n of local) byId.set(n.id, n)
          for (const n of server) byId.set(n.id, n)
          setNotes(Array.from(byId.values()))
        }
        setSyncState('ok')
      } catch {
        if (!cancelled) setSyncState('offline')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  const sorted = useMemo(() => {
    return notes
      .filter((n) => {
        if (filter !== 'all' && n.kind !== filter) return false
        if (n.kind === 'note' && !showNotes) return false
        if (n.kind === 'checklist' && !showChecklists) return false
        if (n.kind === 'reminder' && !showReminders) return false
        return true
      })
      .sort((a, b) => {
        if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1
        return (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0)
      })
  }, [notes, showNotes, showChecklists, showReminders, filter])

  const openNew = (kind: NoteKind) => {
    const now = new Date().toISOString()
    const draft: NoteItem = {
      id: uid(),
      kind,
      title: '',
      body: '',
      items: kind === 'checklist' ? [{ id: uid(), text: '', done: false }] : undefined,
      remindAt:
        kind === 'reminder' ? new Date(Date.now() + 3600_000).toISOString().slice(0, 16) : null,
      createdAt: now,
      updatedAt: now,
      color: 'paper',
      _localOnly: true,
    }
    setComposer(kind)
    setEditing(draft)
  }

  const persist = async (n: NoteItem) => {
    const next = { ...n, updatedAt: new Date().toISOString() }
    // Optimistic local update
    setNotes((list) => {
      const i = list.findIndex((x) => x.id === next.id)
      if (i >= 0) {
        const copy = [...list]
        copy[i] = next
        return copy
      }
      return [next, ...list]
    })
    setEditing(null)
    setComposer(null)
    setSaving(true)
    try {
      const isMongoId = /^[a-f0-9]{24}$/i.test(next.id)
      let saved: NoteItem
      if (isMongoId && !next._localOnly) {
        saved = fromApi(await api.updateNote(next.id, toApiPayload(next)))
      } else {
        saved = fromApi(await api.createNote(toApiPayload(next)))
      }
      setNotes((list) => {
        const without = list.filter((x) => x.id !== next.id && x.id !== saved.id)
        return [saved, ...without]
      })
      showToast?.('Saved · syncs across devices')
      setSyncState('ok')
    } catch {
      // Keep local copy marked local-only
      setNotes((list) =>
        list.map((x) => (x.id === next.id ? { ...next, _localOnly: true } : x)),
      )
      showToast?.('Saved on this device · will sync when online')
      setSyncState('offline')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    setNotes((list) => list.filter((x) => x.id !== id))
    if (editing?.id === id) {
      setEditing(null)
      setComposer(null)
    }
    try {
      if (/^[a-f0-9]{24}$/i.test(id)) await api.deleteNote(id)
      showToast?.('Deleted')
    } catch {
      showToast?.('Removed locally')
    }
  }

  const togglePin = async (n: NoteItem) => {
    const next = { ...n, pinned: !n.pinned, updatedAt: new Date().toISOString() }
    setNotes((list) => list.map((x) => (x.id === n.id ? next : x)))
    try {
      if (/^[a-f0-9]{24}$/i.test(n.id)) {
        await api.updateNote(n.id, { pinned: next.pinned })
      }
    } catch {
      /* */
    }
  }

  const toggleItemDone = async (n: NoteItem, itemId: string) => {
    const items = (n.items || []).map((it) =>
      it.id === itemId ? { ...it, done: !it.done } : it,
    )
    const next = { ...n, items, updatedAt: new Date().toISOString() }
    setNotes((list) => list.map((x) => (x.id === n.id ? next : x)))
    try {
      if (/^[a-f0-9]{24}$/i.test(n.id)) {
        await api.updateNote(n.id, { items })
      }
    } catch {
      /* */
    }
  }

  if (locked || lockUi === 'unlock') {
    return (
      <div className="flex h-full flex-col" style={{ background: wallpaper }}>
        <PinPad
          title="Notes locked"
          subtitle="Enter your PIN to open notes"
          mode="unlock"
          onComplete={(pin) => {
            let stored = ''
            try {
              stored = kvGet(`sc_notes_pin_${userId}`) || ''
            } catch {
              /* */
            }
            if (pin !== stored) return false
            try {
              kvSet(`sc_notes_locked_${userId}`, '0')
            } catch {
              /* */
            }
            setLocked(false)
            setLockUi('none')
            return true
          }}
        />
      </div>
    )
  }

  if (lockUi === 'set' || lockUi === 'confirm') {
    return (
      <div className="flex h-full flex-col" style={{ background: wallpaper }}>
        <PinPad
          title={lockUi === 'set' ? 'Create notes PIN' : 'Confirm PIN'}
          subtitle={
            lockUi === 'set' ? '4 digits to lock this notes space' : 'Enter the same PIN again'
          }
          mode="set"
          onCancel={() => {
            setLockUi('none')
            setPendingPin('')
          }}
          onComplete={(pin) => {
            if (lockUi === 'set') {
              setPendingPin(pin)
              setLockUi('confirm')
              return true
            }
            if (pin !== pendingPin) {
              setPendingPin('')
              setLockUi('set')
              showToast?.('PINs did not match')
              return false
            }
            try {
              kvSet(`sc_notes_pin_${userId}`, pin)
              kvSet(`sc_notes_locked_${userId}`, '1')
            } catch {
              /* */
            }
            setLocked(true)
            setLockUi('none')
            setPendingPin('')
            showToast?.('Notes lock enabled')
            return true
          }}
        />
      </div>
    )
  }

  // ── Editor ──────────────────────────────────────────────────────────────
  if (editing) {
    const cm = colorMeta(editing.color)
    return (
      <div className={`flex h-full flex-col ${cm.bg}`}>
        <header className="flex items-center gap-2 border-b border-black/5 px-3 pb-3 pt-[max(1rem,env(safe-area-inset-top))] dark:border-white/10">
          <button
            type="button"
            onClick={() => {
              setEditing(null)
              setComposer(null)
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"
          >
            <ArrowLeft size={22} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-base font-black text-ink dark:text-gray-100">
              {composer === 'checklist' || editing.kind === 'checklist'
                ? 'Checklist'
                : composer === 'reminder' || editing.kind === 'reminder'
                  ? 'Reminder'
                  : 'Note'}
            </p>
            <p className="text-[11px] font-bold text-gray-400">
              {syncState === 'ok' ? 'Syncs across devices' : syncState === 'offline' ? 'Offline · local only' : '…'}
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void persist(editing)}
            className="flex items-center gap-1.5 rounded-full bg-brand-purple px-4 py-2 text-sm font-extrabold text-white disabled:opacity-60"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            Save
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <input
            value={editing.title}
            onChange={(e) => setEditing({ ...editing, title: e.target.value })}
            placeholder={
              editing.kind === 'checklist'
                ? 'Checklist title'
                : editing.kind === 'reminder'
                  ? 'Reminder title'
                  : 'Title'
            }
            className="w-full border-0 bg-transparent text-2xl font-black outline-none placeholder:text-gray-300 dark:text-gray-100"
            autoFocus
          />

          {/* Color chips */}
          <div className="flex flex-wrap gap-2">
            {NOTE_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-label={c.id}
                onClick={() => setEditing({ ...editing, color: c.id })}
                className={`h-7 w-7 rounded-full ring-2 ${c.bg} ${
                  (editing.color || 'paper') === c.id ? 'ring-brand-purple scale-110' : 'ring-transparent'
                }`}
              />
            ))}
          </div>

          {editing.kind === 'note' && (
            <textarea
              value={editing.body}
              onChange={(e) => setEditing({ ...editing, body: e.target.value })}
              placeholder="Write something…"
              rows={12}
              className="w-full resize-none border-0 bg-transparent text-[15px] font-semibold leading-relaxed outline-none placeholder:text-gray-300 dark:text-gray-200"
            />
          )}

          {editing.kind === 'checklist' && (
            <div className="space-y-2">
              {(editing.items || []).map((it, idx) => (
                <div
                  key={it.id}
                  className="group flex items-center gap-2 rounded-2xl bg-white/70 px-3 py-2.5 shadow-sm ring-1 ring-black/5 dark:bg-white/5 dark:ring-white/10"
                >
                  <button
                    type="button"
                    onClick={() => {
                      const items = [...(editing.items || [])]
                      items[idx] = { ...it, done: !it.done }
                      setEditing({ ...editing, items })
                    }}
                    className="shrink-0 text-brand-purple"
                  >
                    {it.done ? <CheckSquare size={22} /> : <Square size={22} />}
                  </button>
                  <input
                    value={it.text}
                    onChange={(e) => {
                      const items = [...(editing.items || [])]
                      items[idx] = { ...it, text: e.target.value }
                      setEditing({ ...editing, items })
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        setEditing({
                          ...editing,
                          items: [
                            ...(editing.items || []),
                            { id: uid(), text: '', done: false },
                          ],
                        })
                      }
                    }}
                    placeholder="List item"
                    className={`min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none dark:text-gray-100 ${
                      it.done ? 'text-gray-400 line-through' : ''
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setEditing({
                        ...editing,
                        items: (editing.items || []).filter((x) => x.id !== it.id),
                      })
                    }}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-brand-red"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setEditing({
                    ...editing,
                    items: [...(editing.items || []), { id: uid(), text: '', done: false }],
                  })
                }
                className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-bold text-brand-purple hover:bg-brand-purple/10"
              >
                <Plus size={16} /> Add item
              </button>
              {(editing.items || []).length > 0 && (
                <div className="pt-2">
                  <div className="mb-1 flex justify-between text-[11px] font-bold text-gray-400">
                    <span>Progress</span>
                    <span>
                      {progress(editing.items).done}/{progress(editing.items).total}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
                    <div
                      className="h-full rounded-full bg-brand-purple transition-all"
                      style={{ width: `${progress(editing.items).pct}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {editing.kind === 'reminder' && (
            <div className="space-y-3">
              <textarea
                value={editing.body}
                onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                placeholder="What should we remind you about?"
                rows={4}
                className="w-full resize-none rounded-2xl bg-white/80 px-3 py-3 text-sm font-semibold outline-none ring-1 ring-black/5 dark:bg-white/5 dark:text-gray-100 dark:ring-white/10"
              />
              <label className="block text-xs font-extrabold uppercase tracking-wide text-gray-400">
                Remind at
              </label>
              <input
                type="datetime-local"
                value={editing.remindAt || ''}
                onChange={(e) => setEditing({ ...editing, remindAt: e.target.value })}
                className="w-full rounded-2xl bg-white/80 px-3 py-3 text-sm font-semibold outline-none ring-1 ring-black/5 dark:bg-white/5 dark:text-gray-100 dark:ring-white/10"
              />
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Board ───────────────────────────────────────────────────────────────
  return (
    <div className="relative flex h-full flex-col" style={{ background: wallpaper }}>
      <header className="flex items-center gap-2 border-b border-black/5 bg-white/80 px-3 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur dark:border-white/10 dark:bg-[#121821]/80">
        {!embedded && (
          <button
            type="button"
            onClick={onBack}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"
          >
            <ArrowLeft size={22} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-extrabold text-ink dark:text-gray-100">
            {displayName || 'Notes'}
          </p>
          <p className="flex items-center gap-1 truncate text-xs font-bold text-gray-400">
            {syncState === 'syncing' && <Loader2 size={12} className="animate-spin" />}
            {syncState === 'ok' && <Cloud size={12} className="text-emerald-500" />}
            {syncState === 'offline' && <CloudOff size={12} className="text-amber-500" />}
            {username ? `@${username.replace(/^@/, '')}` : 'Your private space'}
            {syncState === 'ok' && ' · synced'}
            {syncState === 'offline' && ' · offline'}
          </p>
        </div>
        <button
          type="button"
          aria-label="Notes settings"
          onClick={() => setSettingsOpen((v) => !v)}
          className="flex h-10 w-10 items-center justify-center rounded-full text-brand-purple hover:bg-brand-purple/10"
        >
          <Settings2 size={20} />
        </button>
      </header>

      {settingsOpen && (
        <div className="absolute right-3 top-[max(4.5rem,calc(env(safe-area-inset-top)+3.5rem))] z-40 w-56 overflow-hidden rounded-2xl bg-white p-2 shadow-xl ring-1 ring-black/8 dark:bg-[#1a222d] dark:ring-white/10">
          {[
            { label: 'Notes', on: showNotes, set: setShowNotes },
            { label: 'Checklists', on: showChecklists, set: setShowChecklists },
            { label: 'Reminders', on: showReminders, set: setShowReminders },
            ...(showMessages
              ? [{ label: 'Messages', on: showSelfMessages, set: setShowSelfMessages }]
              : []),
          ].map((row) => (
            <button
              key={row.label}
              type="button"
              onClick={() => row.set(!row.on)}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-extrabold text-ink hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-white/5"
            >
              <span>{row.label}</span>
              <span
                className={`h-5 w-9 rounded-full p-0.5 transition ${
                  row.on ? 'bg-brand-purple' : 'bg-gray-200 dark:bg-white/20'
                }`}
              >
                <span
                  className={`block h-4 w-4 rounded-full bg-white shadow transition ${
                    row.on ? 'translate-x-4' : ''
                  }`}
                />
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setSettingsOpen(false)
              const has = !!kvGet(`sc_notes_pin_${userId}`)
              if (has) {
                kvSet(`sc_notes_locked_${userId}`, '1')
                setLocked(true)
                showToast?.('Notes locked')
              } else {
                setLockUi('set')
              }
            }}
            className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-extrabold text-ink hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-white/5"
          >
            <Lock size={16} className="text-brand-purple" />
            Lock notes
          </button>
        </div>
      )}

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto px-3 py-2.5 scrollbar-none">
        {(
          [
            { id: 'all' as const, label: 'All' },
            { id: 'note' as const, label: 'Notes', Icon: StickyNote },
            { id: 'checklist' as const, label: 'Checklists', Icon: ListTodo },
            { id: 'reminder' as const, label: 'Reminders', Icon: Bell },
          ] as const
        ).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-extrabold transition ${
              filter === f.id
                ? 'bg-brand-purple text-white shadow-sm'
                : 'bg-white/80 text-gray-600 ring-1 ring-black/5 dark:bg-white/10 dark:text-gray-300 dark:ring-white/10'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Quick create */}
      <div className="flex gap-2 px-3 pb-2">
        {(
          [
            { k: 'note' as const, label: 'Note', Icon: StickyNote },
            { k: 'checklist' as const, label: 'Checklist', Icon: ListTodo },
            { k: 'reminder' as const, label: 'Reminder', Icon: Bell },
          ] as const
        ).map((b) => (
          <button
            key={b.k}
            type="button"
            onClick={() => openNew(b.k)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-white/90 py-2.5 text-xs font-extrabold text-brand-purple shadow-sm ring-1 ring-black/5 hover:bg-brand-purple/5 dark:bg-white/10 dark:ring-white/10"
          >
            <b.Icon size={15} />
            {b.label}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-2.5 overflow-y-auto px-3 pb-24">
        {sorted.length === 0 && (
          <div className="flex flex-col items-center justify-center px-6 pt-16 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-3xl bg-brand-purple/10 text-brand-purple">
              <StickyNote size={28} />
            </div>
            <p className="text-base font-black text-ink dark:text-gray-100">Your private space</p>
            <p className="mt-1 text-sm font-semibold text-gray-400">
              Notes, checklists and reminders sync to every device you sign in on.
            </p>
          </div>
        )}

        {sorted.map((n) => {
          const cm = colorMeta(n.color)
          const prog = progress(n.items)
          return (
            <article
              key={n.id}
              className={`group relative overflow-hidden rounded-2xl ${cm.bg} p-3.5 shadow-sm ring-1 ${cm.ring} transition active:scale-[0.99]`}
            >
              <button
                type="button"
                className="absolute inset-0 z-0"
                onClick={() => {
                  setComposer(n.kind)
                  setEditing({ ...n })
                }}
                aria-label="Open"
              />
              <div className="relative z-10 pointer-events-none">
                <div className="mb-1 flex items-start gap-2">
                  <span className={`mt-0.5 ${cm.accent}`}>
                    {n.kind === 'checklist' ? (
                      <ListTodo size={16} />
                    ) : n.kind === 'reminder' ? (
                      <Bell size={16} />
                    ) : (
                      <StickyNote size={16} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-black text-ink dark:text-gray-100">
                      {n.title ||
                        (n.kind === 'checklist'
                          ? 'Checklist'
                          : n.kind === 'reminder'
                            ? 'Reminder'
                            : 'Untitled note')}
                      {n.pinned && (
                        <Pin size={12} className="ml-1 inline text-brand-purple" />
                      )}
                    </p>
                    {n.kind === 'note' && n.body && (
                      <p className="mt-0.5 line-clamp-2 text-sm font-semibold text-gray-500 dark:text-gray-400">
                        {n.body}
                      </p>
                    )}
                    {n.kind === 'reminder' && (
                      <p className="mt-0.5 text-xs font-bold text-amber-600 dark:text-amber-400">
                        {formatRemind(n.remindAt) || 'No time set'}
                        {n.body ? ` · ${n.body.slice(0, 60)}` : ''}
                      </p>
                    )}
                    {n.kind === 'checklist' && (
                      <div className="mt-2 space-y-1">
                        {(n.items || []).slice(0, 4).map((it) => (
                          <div key={it.id} className="flex items-center gap-2 text-sm">
                            {it.done ? (
                              <CheckSquare size={14} className="text-brand-purple" />
                            ) : (
                              <Circle size={14} className="text-gray-300" />
                            )}
                            <span
                              className={
                                it.done
                                  ? 'text-gray-400 line-through'
                                  : 'font-semibold text-ink dark:text-gray-200'
                              }
                            >
                              {it.text || '…'}
                            </span>
                          </div>
                        ))}
                        {(n.items || []).length > 4 && (
                          <p className="text-[11px] font-bold text-gray-400">
                            +{(n.items || []).length - 4} more
                          </p>
                        )}
                        {(n.items || []).length > 0 && (
                          <div className="pt-1.5">
                            <div className="h-1 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
                              <div
                                className="h-full rounded-full bg-brand-purple transition-all"
                                style={{ width: `${prog.pct}%` }}
                              />
                            </div>
                            <p className="mt-0.5 text-[10px] font-bold text-gray-400">
                              {prog.done}/{prog.total} done
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {/* Quick actions */}
              <div className="relative z-20 mt-2 flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                {n.kind === 'checklist' &&
                  (n.items || []).slice(0, 1).map((it) => (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => void toggleItemDone(n, it.id)}
                      className="rounded-full px-2 py-1 text-[11px] font-extrabold text-brand-purple hover:bg-brand-purple/10"
                    >
                      Toggle first
                    </button>
                  ))}
                <button
                  type="button"
                  onClick={() => void togglePin(n)}
                  className="rounded-full p-1.5 text-gray-400 hover:bg-black/5 hover:text-brand-purple dark:hover:bg-white/10"
                >
                  {n.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                </button>
                <button
                  type="button"
                  onClick={() => void remove(n.id)}
                  className="rounded-full p-1.5 text-gray-400 hover:bg-red-50 hover:text-brand-red dark:hover:bg-red-950/30"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </article>
          )
        })}
      </div>

      <button
        type="button"
        onClick={() => openNew(filter === 'all' ? 'note' : filter)}
        className="absolute bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-brand-purple text-white shadow-lg shadow-brand-purple/30"
        aria-label="New note"
      >
        <Plus size={26} strokeWidth={2.4} />
      </button>
    </div>
  )
}
