import { useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, ImagePlus, X, Settings as SettingsIcon, Eye } from 'lucide-react'
import { BrandMark } from '../components/AppHeaderLogo'
import { Avatar } from '../components/Avatar'
import { StatusRing } from '../components/StatusRing'
import { api } from '../api'
import { STATUS_BG_OPTIONS, statusBgCss } from '../lib/statusBg'
import { useStore } from '../store'
import { PillButton } from '../components/PillButton'
import { parseUtc } from '../time'

const API_ORIGIN = import.meta.env.VITE_API_URL || ''
function mediaUrl(path?: string | null) {
  if (!path) return ''
  if (path.startsWith('http') || path.startsWith('data:') || path.startsWith('blob:')) return path
  return `${API_ORIGIN}${path}`
}

const VALIDITY = ['1 hour', '6 hours', '12 hours', '24 hours'] as const
const PRIVACY = ['My contacts', 'Contacts except…', 'Only share with…'] as const

type Props = {
  onOpenStatus?: (userId: string) => void
}

export function StatusTab({ onOpenStatus }: Props) {
  const { statusList, me, refreshStatus, settings, setSetting, showToast, patchStatusList } = useStore()
  const [bgCode, setBgCode] = useState('solid_1')
  const [text, setText] = useState('')
  const [image, setImage] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [statusSettings, setStatusSettings] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const isActive = (s: any) => {
    if (!s?.expiresAt) return true
    const d = parseUtc(s.expiresAt)
    return !d || d.getTime() > Date.now()
  }
  const mine = statusList.filter((s) => s.userId === me?.id && isActive(s))
  const others = statusList.filter((s) => s.userId !== me?.id && isActive(s))

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
    const createdAt = new Date().toISOString()
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const optimistic = {
      id: localId,
      userId: me?.id || '',
      text: body,
      image: img,
      background: bgCode,
      createdAt,
      expiresAt,
      type: img ? 'image' : 'text',
      views: [] as string[],
      ago: 'Posting…',
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

    // UI first — append at end (oldest → newest)
    patchStatusList((list) => [...list, optimistic])
    setText('')
    setImage(null)
    setComposing(false)
    showToast('Posting status…')
    setBusy(true)

    try {
      const { status } = await api.postStatus(body, img, bgCode)
      // Keep the same list slot — swap id/metadata only so the bubble never disappears
      patchStatusList((list) =>
        list.map((s) =>
          s.id === localId
            ? {
                ...s,
                ...status,
                id: status?.id || s.id,
                pending: false,
                ago: 'Just now',
                text: status?.text ?? s.text,
                image: status?.image ?? s.image,
                background: status?.background ?? s.background,
                createdAt: status?.createdAt || s.createdAt,
                expiresAt: status?.expiresAt || s.expiresAt,
                user: s.user,
              }
            : s,
        ),
      )
      showToast('Just now')
    } catch (e: any) {
      patchStatusList((list) => list.filter((s) => s.id !== localId))
      showToast(e?.message || 'Could not post status — try again')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative h-full overflow-y-auto pb-24">
      <header className="sticky top-0 z-10 flex min-h-16 shrink-0 items-center justify-between border-b border-gray-200 bg-white/95 px-5 pt-[max(10px,env(safe-area-inset-top))] backdrop-blur">
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

      {/* Composer — full-screen modern status editor */}
      {composing && (
        <div className="absolute inset-0 z-[90] flex flex-col bg-black">
          <div
            className="relative flex min-h-0 flex-1 flex-col"
            style={{ background: statusBgCss(bgCode) }}
          >
            <div className="flex items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
              <button
                type="button"
                onClick={() => setComposing(false)}
                aria-label="Close"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-black/25 text-white backdrop-blur-sm"
              >
                <X size={20} />
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-black/25 text-white backdrop-blur-sm"
                  aria-label="Add photo"
                >
                  <ImagePlus size={20} />
                </button>
                <PillButton onClick={post} loading={busy} variant="orange" className="!px-5 !py-2 text-sm">
                  Post
                </PillButton>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6">
              {image ? (
                <div className="relative max-h-[55vh] w-full">
                  <img src={image} alt="" className="mx-auto max-h-[55vh] w-auto max-w-full rounded-2xl object-contain shadow-2xl" />
                  <button
                    type="button"
                    onClick={() => setImage(null)}
                    className="absolute right-2 top-2 rounded-full bg-black/55 p-1.5 text-white"
                    aria-label="Remove photo"
                  >
                    <X size={16} />
                  </button>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value.slice(0, 140))}
                    placeholder="Add a caption…"
                    className="mt-4 w-full resize-none bg-transparent text-center text-base font-bold text-white outline-none placeholder:text-white/55"
                    rows={2}
                  />
                </div>
              ) : (
                <textarea
                  autoFocus
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, 140))}
                  placeholder="Type a status…"
                  className="w-full max-w-md resize-none bg-transparent text-center text-3xl font-black leading-snug text-white outline-none placeholder:text-white/45"
                  rows={4}
                />
              )}
            </div>

            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPick} />

            <div className="space-y-5 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
              <div className="flex gap-3 overflow-x-auto no-scrollbar px-1 py-1">
                {STATUS_BG_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setBgCode(o.id)}
                    title={o.label}
                    className={`h-10 w-10 shrink-0 rounded-lg ring-2 transition ${
                      bgCode === o.id ? 'ring-white ring-offset-2 ring-offset-black/25' : 'ring-white/25'
                    }`}
                    style={{ background: statusBgCss(o.id) }}
                  />
                ))}
              </div>
              <div className="flex justify-center gap-2.5 flex-wrap px-1">
                {VALIDITY.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setSetting('statusValidity', v)}
                    className={`shrink-0 rounded-full px-4 py-2 text-xs font-extrabold backdrop-blur-sm transition ${
                      (settings.statusValidity || '24 hours') === v
                        ? 'bg-white text-ink'
                        : 'bg-white/15 text-white'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <p className="pt-1 text-center text-[11px] font-semibold leading-relaxed text-white/55">
                Visible to {settings.statusPrivacy || 'My contacts'}
                <span className="mx-1.5 opacity-40">·</span>
                expires in {settings.statusValidity || '24 hours'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Status settings sheet */}
      <AnimatePresence>
        {statusSettings && (
          <motion.div
            className="fixed inset-0 z-[100] flex flex-col justify-end bg-black/40"
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
