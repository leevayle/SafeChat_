import { useEffect, useMemo, useState } from 'react'
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
} from 'lucide-react'
import { PinPad } from './PinPad'
import { WALLPAPERS, useStore } from '../store'

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
}

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function loadNotes(userId: string): NoteItem[] {
  try {
    const raw = localStorage.getItem(`sc_notes_${userId}`)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveNotes(userId: string, notes: NoteItem[]) {
  try {
    localStorage.setItem(`sc_notes_${userId}`, JSON.stringify(notes))
  } catch {
    /* */
  }
}

/** Publish latest note title into chat list preview */
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
    localStorage.setItem(
      `sc_notes_preview_${userId}`,
      JSON.stringify({ title, updatedAt: top?.updatedAt || new Date().toISOString() }),
    )
    window.dispatchEvent(new CustomEvent('sc_notes_preview', { detail: { userId, title } }))
  } catch {
    /* */
  }
}

export function NotesBoard({
  userId,
  displayName,
  username,
  onBack,
}: {
  userId: string
  displayName: string
  username?: string
  onBack: () => void
}) {
  const { settings, showToast, upsertChatPreview } = useStore()
  const [notes, setNotes] = useState<NoteItem[]>(() => loadNotes(userId))
  const [editing, setEditing] = useState<NoteItem | null>(null)
  const [composer, setComposer] = useState<NoteKind | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [lockUi, setLockUi] = useState<'none' | 'set' | 'confirm' | 'unlock'>('none')
  const [pendingPin, setPendingPin] = useState('')
  const [locked, setLocked] = useState(() => {
    try {
      return localStorage.getItem(`sc_notes_locked_${userId}`) === '1'
    } catch {
      return false
    }
  })

  const wallpaper = WALLPAPERS[settings.wallpaper] || '#F3F4F6'

  useEffect(() => {
    saveNotes(userId, notes)
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

  const sorted = useMemo(
    () =>
      [...notes].sort((a, b) => {
        if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1
        return (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0)
      }),
    [notes],
  )

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
    }
    setComposer(kind)
    setEditing(draft)
  }

  const persist = (n: NoteItem) => {
    const next = { ...n, updatedAt: new Date().toISOString() }
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
    showToast?.('Note saved')
  }

  const remove = (id: string) => {
    setNotes((list) => list.filter((x) => x.id !== id))
    if (editing?.id === id) {
      setEditing(null)
      setComposer(null)
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
              stored = localStorage.getItem(`sc_notes_pin_${userId}`) || ''
            } catch {
              /* */
            }
            if (pin !== stored) return false
            try {
              localStorage.setItem(`sc_notes_locked_${userId}`, '0')
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
          subtitle={lockUi === 'set' ? '4 digits to lock this notes space' : 'Enter the same PIN again'}
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
              localStorage.setItem(`sc_notes_pin_${userId}`, pin)
              localStorage.setItem(`sc_notes_locked_${userId}`, '1')
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

  if (editing) {
    return (
      <div className="flex h-full flex-col" style={{ background: wallpaper }}>
        <header className="flex items-center gap-2 border-b border-black/5 bg-white/80 px-3 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur">
          <button
            type="button"
            onClick={() => {
              setEditing(null)
              setComposer(null)
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-black/5"
          >
            <ArrowLeft size={22} />
          </button>
          <p className="flex-1 text-base font-black text-ink">
            {composer === 'checklist' || editing.kind === 'checklist'
              ? 'Checklist'
              : composer === 'reminder' || editing.kind === 'reminder'
                ? 'Reminder'
                : 'Note'}
          </p>
          <button
            type="button"
            onClick={() => persist(editing)}
            className="rounded-full bg-brand-purple px-4 py-2 text-sm font-extrabold text-white"
          >
            Save
          </button>
        </header>
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          <input
            value={editing.title}
            onChange={(e) => setEditing({ ...editing, title: e.target.value })}
            placeholder="Title"
            className="w-full border-0 bg-transparent text-xl font-black outline-none placeholder:text-gray-300"
            autoFocus
          />
          {editing.kind === 'note' && (
            <textarea
              value={editing.body}
              onChange={(e) => setEditing({ ...editing, body: e.target.value })}
              placeholder="Write something…"
              rows={10}
              className="w-full resize-none border-0 bg-transparent text-[15px] font-semibold leading-relaxed outline-none placeholder:text-gray-300"
            />
          )}
          {editing.kind === 'checklist' && (
            <div className="space-y-2">
              {(editing.items || []).map((it, idx) => (
                <div key={it.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const items = [...(editing.items || [])]
                      items[idx] = { ...it, done: !it.done }
                      setEditing({ ...editing, items })
                    }}
                    className="text-brand-purple"
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
                    placeholder="List item"
                    className={`min-w-0 flex-1 rounded-xl bg-white/80 px-3 py-2 text-sm font-semibold outline-none ring-1 ring-black/5 ${
                      it.done ? 'text-gray-400 line-through' : ''
                    }`}
                  />
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
                className="text-sm font-bold text-brand-purple"
              >
                + Add item
              </button>
            </div>
          )}
          {editing.kind === 'reminder' && (
            <div className="space-y-3">
              <textarea
                value={editing.body}
                onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                placeholder="What should we remind you about?"
                rows={4}
                className="w-full resize-none rounded-2xl bg-white/80 px-3 py-3 text-sm font-semibold outline-none ring-1 ring-black/5"
              />
              <label className="block text-xs font-extrabold uppercase tracking-wide text-gray-400">
                Remind at
              </label>
              <input
                type="datetime-local"
                value={editing.remindAt || ''}
                onChange={(e) => setEditing({ ...editing, remindAt: e.target.value })}
                className="w-full rounded-2xl bg-white/80 px-3 py-3 text-sm font-semibold outline-none ring-1 ring-black/5"
              />
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex h-full flex-col" style={{ background: wallpaper }}>
      <header className="flex items-center gap-2 border-b border-black/5 bg-white/80 px-3 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur">
        <button
          type="button"
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-black/5"
        >
          <ArrowLeft size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-extrabold text-ink">{displayName || 'Notes'}</p>
          <p className="truncate text-xs font-bold text-gray-400">
            {username ? `@${username.replace(/^@/, '')}` : 'Your private notes'}
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
        <div className="border-b border-black/5 bg-white/90 px-4 py-3 backdrop-blur">
          <button
            type="button"
            onClick={() => {
              setSettingsOpen(false)
              try {
                const has = !!localStorage.getItem(`sc_notes_pin_${userId}`)
                if (!has) setLockUi('set')
                else {
                  localStorage.setItem(`sc_notes_locked_${userId}`, '1')
                  setLocked(true)
                  showToast?.('Notes locked')
                }
              } catch {
                setLockUi('set')
              }
            }}
            className="flex w-full items-center gap-3 rounded-2xl bg-white px-3 py-3 text-left text-sm font-extrabold ring-1 ring-black/5"
          >
            <Lock size={18} className="text-brand-purple" />
            Lock notes
          </button>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto px-4 py-3">
        {(
          [
            { k: 'note' as const, label: 'Note', Icon: StickyNote },
            { k: 'checklist' as const, label: 'Checklist', Icon: ListTodo },
            { k: 'reminder' as const, label: 'Reminder', Icon: Bell },
          ] as const
        ).map(({ k, label, Icon }) => (
          <button
            key={k}
            type="button"
            onClick={() => openNew(k)}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand-purple/10 px-3.5 py-2 text-sm font-extrabold text-brand-purple"
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-24">
        {sorted.length === 0 && (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-purple/10 text-brand-purple">
              <StickyNote size={28} />
            </div>
            <p className="mt-4 text-lg font-black text-ink">Your notes space</p>
            <p className="mt-1 max-w-[260px] text-sm font-semibold text-gray-400">
              Capture notes, checklists, and reminders. Only you can see these.
            </p>
          </div>
        )}
        <div className="space-y-2">
          {sorted.map((n) => (
            <div
              key={n.id}
              role="button"
              tabIndex={0}
              onClick={() => setEditing(n)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setEditing(n)
              }}
              className="flex w-full flex-col rounded-2xl bg-white/85 px-4 py-3 text-left ring-1 ring-black/5 transition hover:bg-white"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-extrabold text-ink">
                  {n.title ||
                    (n.kind === 'checklist'
                      ? 'Checklist'
                      : n.kind === 'reminder'
                        ? 'Reminder'
                        : 'Untitled')}
                </p>
                <button
                  type="button"
                  className="text-gray-300 hover:text-brand-red"
                  onClick={(e) => {
                    e.stopPropagation()
                    remove(n.id)
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              {n.kind === 'checklist' ? (
                <p className="mt-1 text-xs font-semibold text-gray-400">
                  {(n.items || []).filter((x) => x.done).length}/{(n.items || []).length} done
                </p>
              ) : n.kind === 'reminder' ? (
                <p className="mt-1 text-xs font-semibold text-brand-orange">
                  {n.remindAt ? new Date(n.remindAt).toLocaleString() : 'No time set'}
                </p>
              ) : (
                <p className="mt-1 line-clamp-2 text-sm font-semibold text-gray-500">
                  {n.body || 'Empty note'}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => openNew('note')}
        className="fab-theme absolute bottom-6 right-5 flex h-14 w-14 items-center justify-center rounded-full bg-brand-purple text-white"
        aria-label="New note"
      >
        <Plus size={26} />
      </button>
    </div>
  )
}
