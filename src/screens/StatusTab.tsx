import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, ImagePlus, X, Settings as SettingsIcon, Eye, Camera } from 'lucide-react'
import { BrandMark } from '../components/AppHeaderLogo'
import { Avatar } from '../components/Avatar'
import { StatusRing } from '../components/StatusRing'
import { api } from '../api'
import { STATUS_BG_OPTIONS, statusBgCss, themeDefaultStatusBg } from '../lib/statusBg'
import { useStore } from '../store'
import { PillButton } from '../components/PillButton'
import { parseUtc } from '../time'
import { compressForWeb } from '../lib/imageProcess'

const API_ORIGIN = import.meta.env.VITE_API_URL || ''
function mediaUrl(path?: string | null) {
  if (!path) return ''
  if (path.startsWith('http') || path.startsWith('data:') || path.startsWith('blob:')) return path
  return `${API_ORIGIN}${path}`
}

const VALIDITY = ['1 hour', '6 hours', '12 hours', '24 hours'] as const
const PRIVACY = ['My contacts', 'Contacts except…', 'Only share with…'] as const

type Props = {
  onOpenStatus?: (userId: string, statusId?: string) => void
}

export function StatusTab({ onOpenStatus }: Props) {
  const { statusList, me, refreshStatus, settings, setSetting, showToast, patchStatusList } = useStore()
  const isPremium = ((settings as any)?.subscriptionPlan || me?.subscriptionPlan) === 'premium'

  const [bgCode, setBgCode] = useState(() => themeDefaultStatusBg('purple'))
  const [validity, setValidity] = useState<(typeof VALIDITY)[number]>('24 hours')
  const [privacy, setPrivacy] = useState<(typeof PRIVACY)[number]>('My contacts')
  const [text, setText] = useState('')
  const [image, setImage] = useState<string | null>(null)
  const [video, setVideo] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)
  const [postMenu, setPostMenu] = useState(false)
  const [adMode, setAdMode] = useState(false)
  const [busy, setBusy] = useState(false)
  const [statusSettings, setStatusSettings] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Derived from bgCode - must come AFTER useState (TDZ)
  const lightBg = bgCode === 'white'
  const onLight = lightBg
    ? 'bg-black/10 text-ink ring-black/15'
    : 'bg-white/25 text-white ring-white/40'
  const textOnLight = lightBg ? 'text-ink' : 'text-white'
  const mutedOnLight = lightBg ? 'text-ink/55' : 'text-white/55'

  const isActive = (s: any) => {
    if (!s?.expiresAt) return true
    const d = parseUtc(s.expiresAt)
    return !d || d.getTime() > Date.now()
  }
  const mine = statusList.filter((s) => s.userId === me?.id && isActive(s))
  const others = statusList.filter((s) => s.userId !== me?.id && isActive(s) && !(s as any).isAd)
  const adStatuses = statusList.filter((s) => s.userId !== me?.id && isActive(s) && !!(s as any).isAd)

  /** one row per user - segment ring by status count (same as chats home) */
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

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (f.type.startsWith('video/')) {
      try {
        const data = await new Promise<string>((resolve, reject) => {
          const r = new FileReader()
          r.onload = () => resolve(String(r.result))
          r.onerror = reject
          r.readAsDataURL(f)
        })
        setVideo(data)
        setImage(null)
      } catch {
        showToast('Could not process video')
      }
      return
    }
    if (!f.type.startsWith('image/')) return
    try {
      const data = await compressForWeb(f)
      setImage(data)
      setVideo(null)
    } catch {
      showToast('Could not process image')
    }
  }

  const hoursFromValidity = (v: string) => {
    if (v.startsWith('1 ')) return 1
    if (v.startsWith('6 ')) return 6
    if (v.startsWith('12')) return 12
    return 24
  }
  const visibilityFromPrivacy = (v: string) => {
    if (v.startsWith('Only')) return 'selected'
    if (v.startsWith('Contacts except')) return 'contacts'
    return 'contacts'
  }

  const openComposer = () => {
    setBgCode(themeDefaultStatusBg(settings.theme))
    setComposing(true)
  }

  const post = async () => {
    if ((!text.trim() && !image && !video) || busy) return
    const body = text.trim()
    const img = image
    const vid = video
    const localId = `local-status-${Date.now()}`
    const hours = hoursFromValidity(validity)
    const createdAt = new Date().toISOString()
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
    const optimistic = {
      id: localId,
      userId: me?.id || '',
      text: body,
      image: img,
      background: bgCode,
      createdAt,
      expiresAt,
      type: vid ? 'video' : img ? 'image' : 'text',
      video: vid || null,
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

    // UI first - append at end (oldest → newest), never flash-remove while server responds
    patchStatusList((list) => [...list, optimistic])
    setText('')
    setImage(null)
    setVideo(null)
    setComposing(false)
    setBusy(true)
    showToast('Posting status…')

    try {
      const { status } = await api.postStatus(body, img, bgCode, {
        video: vid || undefined,
        expiresInHours: hours,
        visibility: visibilityFromPrivacy(
          (typeof localStorage !== 'undefined' &&
            (JSON.parse(localStorage.getItem('sc_settings') || '{}').statusPrivacy as string)) ||
            'My contacts',
        ),
      })
      // Same list slot, swap id/metadata only so the card never disappears
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
                views: status?.views || [],
              }
            : s,
        ),
      )
      showToast('Status posted')
    } catch (e: any) {
      patchStatusList((list) => list.filter((s) => s.id !== localId))
      showToast(e?.message || 'Could not post status - try again')
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

        {/* My statuses - horizontal rounded rectangles + trailing + */}
        <p className="mb-2 text-sm font-extrabold text-gray-500">My status</p>
        <div data-no-tab-swipe="1" className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto pb-2 pt-1">
          {mine.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => me?.id && onOpenStatus?.(me.id, s.id)}
              className="flex w-[88px] shrink-0 flex-col items-center gap-1.5 text-left"
            >
              <div
                className="relative h-[112px] w-[88px] overflow-hidden rounded-2xl shadow-sm ring-1 ring-black/5"
                style={{ background: statusBgCss(s.background || 'theme_purple_grad') }}
              >
                {s.image ? (
                  <img src={mediaUrl(s.image)} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center px-2 text-center">
                    <p className={`line-clamp-4 text-[11px] font-bold leading-snug ${(s.background || '') === 'white' ? 'text-ink' : 'text-white'}`}>
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

          {/* Add status - always last; sole item when empty */}
          <button
            type="button"
            onClick={openComposer}
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
                <p className="font-extrabold">{(contact as any).savedName || contact.name || 'User'}</p>
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

      {/* Business / ads in your region */}
      {adStatuses.length > 0 && (
        <div className="mt-2 px-2">
          <p className="mb-2 px-2 text-xs font-extrabold uppercase tracking-wide text-brand-orange/90">Sponsored</p>
          {adStatuses
            .reduce((acc: any[], s: any) => {
              if (!acc.find((x) => x.userId === s.userId)) acc.push(s)
              return acc
            }, [])
            .map((s: any) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onOpenStatus?.(s.userId)}
                className="mb-1 flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-gray-50"
              >
                <Avatar contact={s.user || { id: s.userId, name: s.user?.name || 'Ad' }} size={48} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-extrabold">{s.user?.name || 'Business'}</p>
                  <p className="text-xs font-semibold text-brand-orange">
                    Ad · {(s.adReach || s.ad_reach || 'international') === 'local' ? 'Local' : 'International'}
                  </p>
                </div>
              </button>
            ))}
        </div>
      )}

      </div>

      {/* Composer - full-screen modern status editor */}
      {composing && (
        <div className="fixed inset-0 z-[90] flex flex-col bg-black" style={{ paddingBottom: 0 }}>
          <div
            className="relative flex min-h-0 flex-1 flex-col"
            style={{ background: statusBgCss(bgCode) }}
          >
                        <div className="flex items-center gap-2 px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
              <button
                type="button"
                onClick={() => setComposing(false)}
                aria-label="Close"
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full backdrop-blur-sm ${lightBg ? 'bg-black/10 text-ink' : 'bg-black/30 text-white'}`}
              >
                <X size={20} />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (fileRef.current) {
                    fileRef.current.removeAttribute('capture')
                    fileRef.current.click()
                  }
                }}
                className={`inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-full px-2 shadow-sm ring-1 backdrop-blur-md active:scale-95 ${onLight}`}
                aria-label="Add photo"
              >
                <ImagePlus size={18} strokeWidth={2.2} />
                <span className="text-[11px] font-extrabold">Photo</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (fileRef.current) {
                    fileRef.current.setAttribute('capture', 'environment')
                    fileRef.current.click()
                  }
                }}
                className={`inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-full px-2 shadow-sm ring-1 backdrop-blur-md active:scale-95 ${onLight}`}
                aria-label="Take photo"
              >
                <Camera size={18} strokeWidth={2.2} />
                <span className="text-[11px] font-extrabold">Cam</span>
              </button>
              <div className="relative flex shrink-0 items-center">
                <PillButton onClick={post} loading={busy} variant="orange" className={`!h-11 !px-4 !text-sm shadow-lg ${isPremium ? '!rounded-r-none' : ''}`}>
                  {adMode ? 'Ad' : 'Post'}
                </PillButton>
                {isPremium && (
                  <>
                    <button
                      type="button"
                      className="flex h-11 items-center rounded-r-full bg-brand-orange px-2.5 text-white shadow-lg"
                      onClick={() => setPostMenu((v) => !v)}
                      aria-label="More post options"
                    >
                      ▾
                    </button>
                    {postMenu && (
                      <div className="absolute right-0 top-12 z-30 min-w-[170px] overflow-hidden rounded-2xl bg-white py-1 shadow-xl ring-1 ring-black/10">
                        <button type="button" className="block w-full px-4 py-2.5 text-left text-sm font-bold" onClick={() => { setAdMode(false); setPostMenu(false) }}>Normal status</button>
                        <button type="button" className="block w-full px-4 py-2.5 text-left text-sm font-bold text-brand-orange" onClick={() => { setAdMode(true); setPostMenu(false) }}>Make ad…</button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            {isPremium && adMode && (
              <div className="mx-3 mb-2 space-y-1 rounded-2xl bg-black/25 p-3 text-white backdrop-blur-sm">
                <p className="text-xs font-extrabold uppercase tracking-wide text-white/70">Ad options</p>
                <p className="text-[11px] font-semibold text-white/80">Reach & billing configure at post time. Validity uses duration below.</p>
              </div>
            )}

            <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6">
              {video ? (
                <div className="relative max-h-[55vh] w-full">
                  <video src={video} controls className="mx-auto max-h-[55vh] w-auto max-w-full rounded-2xl bg-black/20 object-contain shadow-2xl" />
                  <button
                    type="button"
                    onClick={() => setVideo(null)}
                    className="absolute right-2 top-2 rounded-full bg-black/55 p-1.5 text-white"
                    aria-label="Remove video"
                  >
                    <X size={16} />
                  </button>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value.slice(0, 140))}
                    placeholder="Add a caption…"
                    className={`mt-4 w-full resize-none bg-transparent text-center text-base font-bold outline-none ${lightBg ? 'text-ink placeholder:text-ink/40' : 'text-white placeholder:text-white/55'}`}
                    rows={2}
                  />
                </div>
              ) : image ? (
                <div className="relative max-h-[55vh] w-full">
                  <img src={image} alt="" className="mx-auto max-h-[55vh] w-auto max-w-full rounded-2xl bg-transparent object-contain shadow-2xl" />
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
                    className={`mt-4 w-full resize-none bg-transparent text-center text-base font-bold outline-none ${lightBg ? 'text-ink placeholder:text-ink/40' : 'text-white placeholder:text-white/55'}`}
                    rows={2}
                  />
                </div>
              ) : (
                <textarea
                  autoFocus
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, 140))}
                  placeholder="Type a status…"
                  className={`w-full max-w-md resize-none bg-transparent text-center text-3xl font-black leading-snug outline-none ${lightBg ? 'text-ink placeholder:text-ink/40' : 'text-white placeholder:text-white/45'}`}
                  rows={4}
                />
              )}
            </div>

            <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={onPick} />

            <div className="space-y-5 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
              <div className="no-scrollbar -mx-5 flex justify-center gap-2.5 overflow-x-auto px-5 py-1">
                {STATUS_BG_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setBgCode(o.id)}
                    title={o.label}
                    className={`h-11 w-11 shrink-0 rounded-full ring-2 transition ${
                      bgCode === o.id
                        ? o.id === 'white'
                          ? 'ring-gray-800 ring-offset-2 ring-offset-white/40'
                          : 'ring-white ring-offset-2 ring-offset-black/20'
                        : o.id === 'white'
                          ? 'ring-gray-300'
                          : 'ring-white/30'
                    }`}
                    style={{ background: statusBgCss(o.id) }}
                  />
                ))}
              </div>
              <div className="flex justify-center gap-2 flex-wrap px-1">
                {VALIDITY.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => {
                      setValidity(v)
                      setSetting('statusValidity', v)
                    }}
                    className={`shrink-0 rounded-full px-3.5 py-1.5 text-[11px] font-extrabold backdrop-blur-md transition ${
                      validity === v
                        ? lightBg
                          ? 'bg-ink text-white shadow-md'
                          : 'bg-white text-ink shadow-lg'
                        : lightBg
                          ? 'bg-black/8 text-ink ring-1 ring-black/10'
                          : 'bg-white/15 text-white ring-1 ring-white/20'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <p className={`pt-1 text-center text-[11px] font-semibold leading-relaxed ${mutedOnLight}`}>
                Expires in {validity}
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
