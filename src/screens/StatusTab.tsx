import { useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, ImagePlus, X, Settings as SettingsIcon, Eye } from 'lucide-react'
import { BrandMark } from '../components/AppHeaderLogo'
import { Avatar } from '../components/Avatar'
import { StatusRing } from '../components/StatusRing'
import { api } from '../api'
import { useStore } from '../store'
import { PillButton } from '../components/PillButton'

const API_ORIGIN = import.meta.env.VITE_API_URL || ''
function mediaUrl(path?: string | null) {
  if (!path) return ''
  if (path.startsWith('http') || path.startsWith('data:') || path.startsWith('blob:')) return path
  return `${API_ORIGIN}${path}`
}

const VALIDITY = ['1 hour', '6 hours', '12 hours', '24 hours'] as const
const PRIVACY = ['Everyone', 'My contacts', 'Contacts except…', 'Only share with…'] as const

type Props = {
  onOpenStatus?: (userId: string) => void
}

export function StatusTab({ onOpenStatus }: Props) {
  const { statusList, me, refreshStatus, settings, setSetting, showToast, patchStatusList } = useStore()
  const [text, setText] = useState('')
  const [image, setImage] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [statusSettings, setStatusSettings] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const mine = statusList.filter((s) => s.userId === me?.id)
  const others = statusList.filter((s) => s.userId !== me?.id)

  /** one row per user — segment ring by status count (same as chats home) */
  const recentUsers = useMemo(() => {
    const map = new Map<
      string,
      { userId: string; user: any; total: number; viewed: number; latest: any }
    >()
    for (const s of others) {
      const cur = map.get(s.userId)
      const viewedOne = me && Array.isArray(s.views) && s.views.includes(me.id) ? 1 : 0
      if (!cur) {
        map.set(s.userId, {
          userId: s.userId,
          user: s.user,
          total: 1,
          viewed: viewedOne,
          latest: s,
        })
      } else {
        cur.total += 1
        cur.viewed += viewedOne
        // keep newest as latest by comparing ago is hard; prefer later in list if API is newest-first
        cur.latest = s
        if (s.user) cur.user = s.user
      }
    }
    return Array.from(map.values())
  }, [others, me])

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f || !f.type.startsWith('image/')) return
    const r = new FileReader()
    r.onload = () => setImage(String(r.result))
    r.readAsDataURL(f)
  }

  const post = async () => {
    if ((!text.trim() && !image) || busy) return
    const body = text.trim()
    const img = image
    const localId = `local-status-${Date.now()}`
    const optimistic = {
      id: localId,
      userId: me?.id || '',
      text: body,
      image: img,
      createdAt: new Date().toISOString(),
      type: img ? 'image' : 'text',
      views: [] as string[],
      user: me
        ? {
            id: me.id,
            name: me.name,
            username: me.username,
            photo: me.photo,
            hue: (me as any).hue || (['#7B2CBF', '#6389EB'] as [string, string]),
            online: false,
          }
        : undefined,
      pending: true,
    }

    // UI first — show in My status immediately
    patchStatusList((list) => [optimistic, ...list])
    setText('')
    setImage(null)
    setComposing(false)
    showToast('Posting status…')
    setBusy(true)

    try {
      const { status } = await api.postStatus(body, img)
      patchStatusList((list) => list.map((s) => (s.id === localId ? { ...status, pending: false } : s)))
      showToast('Status posted')
      refreshStatus().catch(() => {})
    } catch (e: any) {
      patchStatusList((list) => list.filter((s) => s.id !== localId))
      showToast(e?.message || 'Could not post status — try again')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative h-full overflow-y-auto pb-24">
      <header className="flex min-h-16 items-center justify-between border-b border-gray-200 px-5 pt-[10px]">
        <BrandMark />
        <button
          type="button"
          aria-label="Status settings"
          onClick={() => setStatusSettings(true)}
          className="flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-gray-100"
        >
          <SettingsIcon size={20} />
        </button>
      </header>

      <div className="px-5 pt-2.5">
        <h2 className="mb-3 text-xl font-black">Status</h2>

        {/* My statuses — horizontal rounded rectangles + trailing + */}
        <p className="mb-2 text-sm font-extrabold text-gray-500">My status</p>
        <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto pb-2 pt-1">
          {mine.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => me?.id && onOpenStatus?.(me.id)}
              className="flex w-[88px] shrink-0 flex-col items-center gap-1.5 text-left"
            >
              <div className="relative h-[112px] w-[88px] overflow-hidden rounded-2xl bg-gradient-to-br from-brand-purple/80 to-brand-blue/70 shadow-sm ring-1 ring-black/5">
                {s.image ? (
                  <img src={mediaUrl(s.image)} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center px-2 text-center">
                    <p className="line-clamp-4 text-[11px] font-bold leading-snug text-white">
                      {s.text || 'Status'}
                    </p>
                  </div>
                )}
                {s.image && s.text && (
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 pb-1.5 pt-4">
                    <p className="line-clamp-2 text-[10px] font-bold text-white">{s.text}</p>
                  </div>
                )}
              </div>
              <span className="flex items-center gap-0.5 text-[11px] font-bold text-gray-500">
                <Eye size={12} /> {s.views?.length || 0}
              </span>
            </button>
          ))}

          {/* Add status — always last; sole item when empty */}
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="flex w-[88px] shrink-0 flex-col items-center gap-1.5"
          >
            <span className="flex h-[112px] w-[88px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-brand-purple/35 bg-brand-purple/5 text-brand-purple">
              <Plus size={28} strokeWidth={2.2} />
              <span className="mt-1 px-1 text-center text-[10px] font-extrabold leading-tight">
                {mine.length ? 'Add' : 'Add status'}
              </span>
            </span>
            <span className="text-[11px] font-bold text-transparent select-none">0</span>
          </button>
        </div>

        <p className="mb-2 mt-6 text-sm font-extrabold text-gray-500">Recent updates</p>
        {recentUsers.length === 0 && (
          <p className="py-6 text-center text-sm font-bold text-gray-400">No recent status</p>
        )}
        {recentUsers.map((g, i) => {
          const s = g.latest
          const contact = g.user || { id: g.userId, name: '?', hue: ['#7B2CBF', '#6389EB'] as [string, string] }
          return (
            <motion.button
              key={g.userId}
              type="button"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => onOpenStatus?.(g.userId)}
              className="flex w-full items-center gap-3 rounded-3xl p-2.5 text-left hover:bg-gray-100"
            >
              <StatusRing total={g.total} viewed={g.viewed} size={56}>
                <Avatar contact={contact} size={46} />
              </StatusRing>
              <div className="min-w-0 flex-1">
                <p className="font-extrabold">{contact.name || 'User'}</p>
                <p className="truncate text-sm font-semibold text-gray-500">
                  {s.text || (s.image ? 'Photo' : '')}
                  {g.total > 1 ? ` · ${g.total} updates` : ''}
                </p>
                <p className="text-xs font-bold text-gray-400">{s.ago}</p>
              </div>
              {s.image && (
                <img src={mediaUrl(s.image)} alt="" className="h-12 w-12 rounded-xl object-cover" />
              )}
            </motion.button>
          )
        })}
      </div>

      {/* Composer */}
      {composing && (
        <div className="absolute inset-0 z-20 flex flex-col bg-white px-6 pt-14">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-black">New status</h3>
            <button type="button" onClick={() => setComposing(false)} aria-label="Close">
              <X />
            </button>
          </div>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 140))}
            placeholder="What's on your mind?"
            className="mt-4 min-h-[100px] w-full resize-none rounded-2xl bg-gray-100 p-4 text-[15px] font-semibold outline-none"
          />
          {image && (
            <div className="relative mt-3 inline-block">
              <img src={image} alt="" className="max-h-40 rounded-2xl object-cover" />
              <button
                type="button"
                onClick={() => setImage(null)}
                className="absolute right-2 top-2 rounded-full bg-black/50 p-1 text-white"
              >
                <X size={14} />
              </button>
            </div>
          )}
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-brand-purple"
            >
              <ImagePlus size={20} />
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPick} />
            <PillButton onClick={post} loading={busy} variant="orange" className="flex-1">
              Post
            </PillButton>
          </div>
          <p className="mt-3 text-center text-xs font-semibold text-gray-400">
            Visible for {settings.statusValidity || '24 hours'} · {settings.statusPrivacy || 'My contacts'}
          </p>
        </div>
      )}

      {/* Status settings sheet */}
      <AnimatePresence>
        {statusSettings && (
          <motion.div
            className="absolute inset-0 z-30 flex flex-col justify-end bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setStatusSettings(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 34 }}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[80%] overflow-y-auto rounded-t-3xl bg-white px-5 pb-8 pt-4"
            >
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200" />
              <h3 className="text-lg font-black">Status settings</h3>

              <p className="mb-2 mt-5 text-xs font-extrabold uppercase tracking-wide text-gray-400">
                Status validity
              </p>
              <div className="space-y-1">
                {VALIDITY.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setSetting('statusValidity', v)}
                    className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left font-bold ${
                      (settings.statusValidity || '24 hours') === v
                        ? 'bg-brand-purple/10 text-brand-purple'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    {v}
                    {(settings.statusValidity || '24 hours') === v && <span>✓</span>}
                  </button>
                ))}
              </div>

              <p className="mb-2 mt-6 text-xs font-extrabold uppercase tracking-wide text-gray-400">
                Who can see my status
              </p>
              <div className="space-y-1">
                {PRIVACY.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setSetting('statusPrivacy', v)}
                    className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left font-bold ${
                      (settings.statusPrivacy || 'My contacts') === v
                        ? 'bg-brand-purple/10 text-brand-purple'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    {v}
                    {(settings.statusPrivacy || 'My contacts') === v && <span>✓</span>}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setStatusSettings(false)}
                className="mt-6 w-full rounded-full bg-gray-100 py-3 font-extrabold"
              >
                Done
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
