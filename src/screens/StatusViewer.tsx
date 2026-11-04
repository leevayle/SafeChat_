import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Volume2, VolumeX, Heart, Trash2, Eye } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { api } from '../api'
import { useStore } from '../store'

const API_ORIGIN = import.meta.env.VITE_API_URL || ''
function mediaUrl(path?: string | null) {
  if (!path) return ''
  if (path.startsWith('http') || path.startsWith('data:') || path.startsWith('blob:')) return path
  return `${API_ORIGIN}${path}`
}

const SEGMENT_MS = 5000
const HOLD_MS = 220 // longer than this = pause only, no navigation on release

type Props = {
  userId: string
  onClose: () => void
  onReplyToStatus?: (peerId: string) => void
}

function loadLikes(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem('sc_status_likes') || '{}')
  } catch {
    return {}
  }
}

function saveLikes(map: Record<string, boolean>) {
  try {
    localStorage.setItem('sc_status_likes', JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

function loadMuted(): string[] {
  try {
    return JSON.parse(localStorage.getItem('sc_status_muted') || '[]')
  } catch {
    return []
  }
}

function saveMuted(ids: string[]) {
  try {
    localStorage.setItem('sc_status_muted', JSON.stringify(ids))
  } catch {
    /* ignore */
  }
}

type ViewerRow = { id: string; username: string; name: string; photo: string | null; viewedAt: string | null; liked?: boolean }

export function StatusViewer({ userId, onClose, onReplyToStatus }: Props) {
  const { statusList, refreshStatus, showToast, patchStatusList, me } = useStore()
  // Only non-expired statuses for this user, oldest first (play order)
  const items = statusList
    .filter((s) => {
      if (s.userId !== userId) return false
      if (!s.expiresAt) return true
      const t = Date.parse(s.expiresAt)
      return Number.isNaN(t) || t > Date.now()
    })
    .slice()
    .sort((a, b) => {
      const ta = a.createdAt ? Date.parse(a.createdAt) : 0
      const tb = b.createdAt ? Date.parse(b.createdAt) : 0
      return ta - tb
    })
  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const [progress, setProgress] = useState(0)
  const [muted, setMuted] = useState(() => loadMuted().includes(userId))
  const [likes, setLikes] = useState<Record<string, boolean>>(() => loadLikes())
  const [viewersOpen, setViewersOpen] = useState(false)
  const swipeStartY = useRef(0)
  const [swipeDy, setSwipeDy] = useState(0)
  const [viewers, setViewers] = useState<ViewerRow[]>([])
  const [viewersLoading, setViewersLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const viewedRef = useRef<Set<string>>(new Set())
  const rafRef = useRef<number | null>(null)
  const lastTsRef = useRef<number | null>(null)
  const progressRef = useRef(0)
  const idxRef = useRef(0)
  const pausedRef = useRef(false)
  const itemsLenRef = useRef(items.length)
  const pressStartRef = useRef(0)
  const pressSideRef = useRef<'left' | 'right' | 'mid' | null>(null)

  idxRef.current = idx
  pausedRef.current = paused
  itemsLenRef.current = items.length
  progressRef.current = progress

  const current = items[idx]
  const liked = current ? !!likes[current.id] : false
  const isOwner = !!(me?.id && me.id === userId)
  const viewCount = Array.isArray(current?.views) ? current.views.length : 0

  const goNext = useCallback(() => {
    if (idxRef.current < itemsLenRef.current - 1) {
      setIdx((i) => i + 1)
      setProgress(0)
      progressRef.current = 0
    } else {
      onClose()
    }
  }, [onClose])

  const goPrev = useCallback(() => {
    if (idxRef.current > 0) {
      setIdx((i) => i - 1)
      setProgress(0)
      progressRef.current = 0
    } else {
      setProgress(0)
      progressRef.current = 0
    }
  }, [])

  // Register view only for OTHER people's statuses — never for your own
  useEffect(() => {
    if (!current?.id || !me?.id) return
    if (isOwner) return
    if (viewedRef.current.has(current.id)) return
    viewedRef.current.add(current.id)

    const already =
      Array.isArray(current.views) && current.views.includes(me.id)
    if (!already) {
      patchStatusList((list) =>
        list.map((s) =>
          s.id === current.id
            ? {
                ...s,
                views: Array.isArray(s.views)
                  ? s.views.includes(me.id)
                    ? s.views
                    : [...s.views, me.id]
                  : [me.id],
              }
            : s,
        ),
      )
    }

    api
      .viewStatus(current.id)
      .then(() => refreshStatus().catch(() => {}))
      .catch(() => {})
  }, [current?.id, current?.views, isOwner, me?.id, patchStatusList, refreshStatus])

  // Single active progress bar
  useEffect(() => {
    if (!items.length) return
    lastTsRef.current = null

    const tick = (ts: number) => {
      if (lastTsRef.current == null) lastTsRef.current = ts
      const dt = ts - lastTsRef.current
      lastTsRef.current = ts

      if (!pausedRef.current) {
        const next = Math.min(1, progressRef.current + dt / SEGMENT_MS)
        progressRef.current = next
        setProgress(next)
        if (next >= 1) {
          goNext()
          lastTsRef.current = null
        }
      } else {
        lastTsRef.current = ts
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [idx, items.length, goNext])

  const onPressStart = (side: 'left' | 'right' | 'mid') => (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-status-action]')) return
    pressStartRef.current = Date.now()
    pressSideRef.current = side
    setPaused(true)
  }

  const onPressEnd = () => {
    const held = Date.now() - pressStartRef.current
    const side = pressSideRef.current
    pressSideRef.current = null
    setPaused(false)
    if (held < HOLD_MS && side) {
      if (side === 'left') goPrev()
      else if (side === 'right') goNext()
    }
  }

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation()
    const next = !muted
    setMuted(next)
    const list = loadMuted().filter((id) => id !== userId)
    if (next) list.push(userId)
    saveMuted(list)
    showToast(next ? 'Status muted' : 'Status unmuted')
  }

  const openViewers = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!current || !isOwner) return
    setPaused(true)
    setViewersOpen(true)
    setViewersLoading(true)
    try {
      const { viewers: list } = await api.statusViewers(current.id)
      setViewers(list)
    } catch {
      showToast('Could not load viewers')
      setViewers([])
    } finally {
      setViewersLoading(false)
    }
  }

  const closeViewers = () => {
    setViewersOpen(false)
    setPaused(false)
  }

  const deleteCurrent = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!current || !isOwner || deleting) return
    setDeleting(true)
    setPaused(true)
    const id = current.id
    // Optimistic remove
    const remainingCount = items.filter((s) => s.id !== id).length
    patchStatusList((list) => list.filter((s) => s.id !== id))
    try {
      await api.deleteStatus(id)
      showToast('Status deleted')
      if (remainingCount === 0) {
        onClose()
      } else {
        setIdx((i) => Math.min(i, remainingCount - 1))
        setProgress(0)
        progressRef.current = 0
        setPaused(false)
      }
      void refreshStatus().catch(() => {})
    } catch {
      showToast('Delete failed')
      void refreshStatus().catch(() => {})
      setPaused(false)
    } finally {
      setDeleting(false)
    }
  }

  const toggleLike = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!current) return
    if (isOwner) return
    const next = { ...likes, [current.id]: !likes[current.id] }
    void api.likeStatus(current.id).catch(() => {})
    setLikes(next)
    saveLikes(next)
  }

  if (!items.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-ink text-white">
        <p className="font-bold">No status available</p>
        <button type="button" onClick={onClose} className="mt-4 font-bold text-brand-orange">
          Close
        </button>
      </div>
    )
  }

  const user = current.user || {
    id: userId,
    name: userId,
    hue: ['#7B2CBF', '#6389EB'] as [string, string],
  }

  const commitStatusReply = () => {
    if (isOwner) return
    const preview = current?.text || (current?.image ? '📷 Status' : 'Status')
    let time = ''
    try {
      if (current?.createdAt) {
        let s = String(current.createdAt)
        if (/^\d{4}-\d{2}-\d{2}T/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) s += 'Z'
        time = new Date(s).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
      }
    } catch { /* */ }
    try {
      sessionStorage.setItem(
        'sc_status_reply',
        JSON.stringify({ peerId: userId, preview, time }),
      )
    } catch { /* */ }
    onClose()
    onReplyToStatus?.(userId)
  }

  return (
    <div
      className="relative flex h-full flex-col select-none bg-gradient-to-b from-[#2a1a3a] to-ink text-white"
      onContextMenu={(e) => e.preventDefault()}
      onPointerUp={onPressEnd}
      onPointerCancel={onPressEnd}
      onTouchStart={(e) => {
        swipeStartY.current = e.touches[0].clientY
      }}
      onTouchMove={(e) => {
        const dy = swipeStartY.current - e.touches[0].clientY
        if (dy > 0) setSwipeDy(Math.min(80, dy))
      }}
      onTouchEnd={() => {
        if (swipeDy > 48 && !isOwner) commitStatusReply()
        setSwipeDy(0)
      }}
    >
      {/* progress: completed full, current partial, future empty */}
      <div className="flex gap-1 px-3 pt-3 safe-pt">
        {items.map((s, i) => {
          let w = '0%'
          if (i < idx) w = '100%'
          else if (i === idx) w = `${Math.round(progress * 100)}%`
          return (
            <div key={s.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/25">
              <div className="h-full bg-white" style={{ width: w }} />
            </div>
          )
        })}
      </div>

      <div className="relative z-20 flex items-center gap-3 px-4 py-3" data-status-action>
        <Avatar contact={user} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-extrabold">{user.name}</p>
          <p className="text-xs font-semibold text-white/60">
            {current.ago || ''}
            {paused ? ' · paused' : ''}
          </p>
        </div>
        <button
          type="button"
          data-status-action
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10"
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </div>

      {/* Left / mid / right zones */}
      <div className="absolute inset-0 z-10 flex">
        <div className="h-full w-[30%]" onPointerDown={onPressStart('left')} />
        <div className="h-full flex-1" onPointerDown={onPressStart('mid')} />
        <div className="h-full w-[30%]" onPointerDown={onPressStart('right')} />
      </div>

      <div className="relative z-[5] flex flex-1 flex-col items-center justify-center px-6 pointer-events-none">
        <AnimatePresence mode="wait">
          <motion.div
            key={current.id}
            initial={{ opacity: 0.6 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex w-full max-w-sm flex-col items-center gap-4"
          >
            {current.image && (
              <img
                src={mediaUrl(current.image)}
                alt=""
                className="max-h-[55vh] w-full rounded-2xl object-contain"
                draggable={false}
              />
            )}
            {current.text && (
              <p className="text-center text-2xl font-bold leading-snug">{current.text}</p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="relative z-20 flex items-center justify-between px-6 pb-8 safe-pb" data-status-action>
        {isOwner ? (
          <>
            <button
              type="button"
              data-status-action
              onClick={deleteCurrent}
              disabled={deleting}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm disabled:opacity-50"
              aria-label="Delete status"
            >
              <Trash2 size={22} className="text-white" />
            </button>
            <p className="text-center text-xs font-semibold text-white/40">
              {idx + 1}/{items.length}
            </p>
            <button
              type="button"
              data-status-action
              onClick={openViewers}
              className="flex min-w-12 items-center justify-center gap-1.5 rounded-full bg-white/10 px-3 py-2.5 backdrop-blur-sm"
              aria-label="Viewers"
            >
              <Eye size={18} className="text-white" />
              <span className="text-sm font-bold text-white">{viewCount}</span>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              data-status-action
              onClick={toggleMute}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm"
              aria-label={muted ? 'Unmute status' : 'Mute status'}
            >
              {muted ? <VolumeX size={22} /> : <Volume2 size={22} />}
            </button>
            <p className="text-center text-xs font-semibold text-white/40">
              {idx + 1}/{items.length}
            </p>
            <button
              type="button"
              data-status-action
              onClick={toggleLike}
              className={`flex h-12 w-12 items-center justify-center rounded-full backdrop-blur-sm ${
                liked ? 'bg-brand-red/90 text-white' : 'bg-white/10'
              }`}
              aria-label={liked ? 'Unlike' : 'Like'}
            >
              <Heart size={22} fill={liked ? 'currentColor' : 'none'} />
            </button>
          </>
        )}
      </div>

      {!isOwner && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-24 z-20 flex flex-col items-center"
          style={{ opacity: 0.45 + swipeDy / 120, transform: `translateY(${-swipeDy * 0.3}px)` }}
        >
          <div className="rounded-full bg-white/15 px-4 py-1.5 text-xs font-bold text-white/90 backdrop-blur">
            Swipe up to reply
          </div>
        </div>
      )}

      {/* Owner viewers sheet */}
      <AnimatePresence>
        {viewersOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-40 bg-black/50"
              onClick={closeViewers}
              data-status-action
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 340, damping: 34 }}
              className="absolute inset-x-0 bottom-0 z-50 max-h-[70%] overflow-hidden rounded-t-3xl bg-white"
              data-status-action
            >
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
                <h3 className="text-base font-black text-ink">Viewed by</h3>
                <button
                  type="button"
                  onClick={closeViewers}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
                  aria-label="Close viewers"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="max-h-[55vh] overflow-y-auto px-3 pb-6 pt-2">
                {viewersLoading ? (
                  <p className="py-8 text-center text-sm font-bold text-gray-400">Loading…</p>
                ) : viewers.length === 0 ? (
                  <p className="py-8 text-center text-sm font-bold text-gray-400">No views yet</p>
                ) : (
                  <ul className="space-y-0.5">
                    {viewers.map((v) => (
                      <li
                        key={v.id}
                        className="flex items-center gap-3 rounded-2xl px-3 py-2.5"
                      >
                        <Avatar
                          contact={{ id: v.id, name: v.name, photo: v.photo }}
                          size={40}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-bold text-ink">{v.name}</p>
                          {v.username ? (
                            <p className="truncate text-xs font-semibold text-gray-400">@{v.username}</p>
                          ) : null}
                        </div>
                        {v.liked ? (
                          <Heart size={18} className="shrink-0 text-brand-red" fill="currentColor" />
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
