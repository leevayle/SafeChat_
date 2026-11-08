import { statusBgCss } from '../lib/statusBg'
import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Volume2, VolumeX, Heart, Trash2, Eye, Download, Repeat2, Copy } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { api } from '../api'
import { useStore } from '../store'
import { loadCachedViewers, saveCachedViewers } from '../lib/appCache'

const API_ORIGIN = import.meta.env.VITE_API_URL || ''
function mediaUrl(path?: string | null) {
  if (!path) return ''
  if (path.startsWith('http') || path.startsWith('data:') || path.startsWith('blob:')) return path
  return `${API_ORIGIN}${path}`
}

const SEGMENT_MS = 5000

/** Make http(s) and www links open outside the app (tap link only, rest of status stays normal) */
function linkifyStatusText(text: string) {
  const parts = text.split(/(https?:\/\/[^\s]+|www\.[^\s]+)/gi)
  return parts.map((part, i) => {
    if (/^(https?:\/\/|www\.)/i.test(part)) {
      const href = part.startsWith('http') ? part : `https://${part}`
      return (
        <a
          key={i}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="mx-0.5 inline-block rounded-lg bg-white/20 px-2 py-0.5 text-[0.95em] font-bold text-white underline decoration-white/50 underline-offset-2 backdrop-blur-[2px] transition hover:bg-white/30"
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            try {
              window.open(href, '_blank', 'noopener,noreferrer')
            } catch {
              window.location.href = href
            }
          }}
          data-status-action
        >
          {part}
        </a>
      )
    }
    return <span key={i}>{part}</span>
  })
}

const HOLD_MS = 450 // short hold = pause; quick tap navigates

type Props = {
  userId: string
  /** Jump to this status id if still available */
  initialStatusId?: string | null
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

export function StatusViewer({
  userId, initialStatusId, onClose, onReplyToStatus }: Props) {
  const likeInFlight = useRef(false)
  const viewSentRef = useRef<Set<string>>(new Set())
  const { statusList, refreshStatus, showToast, patchStatusList, me } = useStore()
  // Only non-expired statuses for this user, oldest first (play order)
  // Treat naive ISO timestamps as UTC (backend sends without Z)
  const parseUtc = (raw?: string | null) => {
    if (!raw) return NaN
    let s = String(raw)
    if (/^\d{4}-\d{2}-\d{2}T/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) s += 'Z'
    return Date.parse(s)
  }
  const items = statusList
    .filter((s) => {
      if (s.userId !== userId) return false
      if (!s.expiresAt) return true
      const t = parseUtc(s.expiresAt)
      return Number.isNaN(t) || t > Date.now()
    })
    .slice()
    .sort((a, b) => {
      const ta = parseUtc(a.createdAt)
      const tb = parseUtc(b.createdAt)
      return (Number.isNaN(ta) ? 0 : ta) - (Number.isNaN(tb) ? 0 : tb)
    })
  const [idx, setIdx] = useState(0)
  const jumpedRef = useRef(false)
  useEffect(() => {
    if (jumpedRef.current || !items.length) return
    // Explicit status reply target wins
    if (initialStatusId) {
      const i = items.findIndex((s) => s.id === initialStatusId)
      if (i >= 0) {
        setIdx(i)
        jumpedRef.current = true
        return
      }
    }
    // Jump to first unviewed when some (not all) are already viewed
    const meId = me?.id
    if (!meId || meId === userId) {
      jumpedRef.current = true
      return
    }
    const viewedFlags = items.map(
      (s) => Array.isArray(s.views) && s.views.includes(meId),
    )
    const someViewed = viewedFlags.some(Boolean)
    const allViewed = viewedFlags.every(Boolean)
    const noneViewed = viewedFlags.every((v) => !v)
    if (someViewed && !allViewed && !noneViewed) {
      const firstUnseen = viewedFlags.findIndex((v) => !v)
      if (firstUnseen >= 0) setIdx(firstUnseen)
    }
    jumpedRef.current = true
  }, [initialStatusId, items, me?.id, userId])
  const [paused, setPaused] = useState(false)
  const [progress, setProgress] = useState(0)
  const [muted, setMuted] = useState(() => loadMuted().includes(userId))
  const [likes, setLikes] = useState<Record<string, boolean>>(() => loadLikes())
  const [likePulse, setLikePulse] = useState(false)
  const [viewersOpen, setViewersOpen] = useState(false)
  const swipeStartY = useRef(0)
  const [swipeDy, setSwipeDy] = useState(0)
  const [viewers, setViewers] = useState<ViewerRow[]>([])
  const [viewersLoading, setViewersLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmRepost, setConfirmRepost] = useState(false)

  const viewedRef = useRef<Set<string>>(new Set())
  const rafRef = useRef<number | null>(null)
  const lastTsRef = useRef<number | null>(null)
  const progressRef = useRef(0)
  const idxRef = useRef(0)
  const pausedRef = useRef(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  /** Active segment length in ms (video duration or default) */
  const segmentMsRef = useRef(SEGMENT_MS)
  const itemsLenRef = useRef(items.length)
  const pressStartRef = useRef(0)
  const pressSideRef = useRef<'left' | 'right' | 'mid' | null>(null)

  idxRef.current = idx
  pausedRef.current = paused
  itemsLenRef.current = items.length
  progressRef.current = progress

  // Default segment length when slide changes; video onLoadedMetadata may override
  useEffect(() => {
    segmentMsRef.current = SEGMENT_MS
    const v = videoRef.current
    if (v) {
      try { v.pause(); v.currentTime = 0 } catch { /* */ }
    }
  }, [idx])

  // Keep idx in range when the filtered list shrinks (delete / expire)
  useEffect(() => {
    if (!items.length) return
    if (idx >= items.length) {
      setIdx(items.length - 1)
      setProgress(0)
      progressRef.current = 0
    }
  }, [items.length, idx])

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

  // From notification: open viewers sheet for this status
  useEffect(() => {
    if (!current?.id || !isOwner) return
    try {
      const want = sessionStorage.getItem('sc_open_viewers')
      if (want && want === current.id) {
        sessionStorage.removeItem('sc_open_viewers')
        setViewersOpen(true)
        setViewersLoading(true)
        void (async () => {
          try {
            const cached = await loadCachedViewers<ViewerRow>(current.id)
            if (cached?.length) {
              setViewers(cached)
              setViewersLoading(false)
            }
            const { viewers: list } = await api.statusViewers(current.id)
            setViewers(list)
            void saveCachedViewers(current.id, list)
          } catch {
            setViewers([])
          } finally {
            setViewersLoading(false)
          }
        })()
      }
    } catch { /* */ }
  }, [current?.id, isOwner])

  // Register view only for OTHER people's statuses, never for your own
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

    // Server register only, local list already patched above (no full refresh flash)
    if (viewSentRef.current.has(current.id)) return
    viewSentRef.current.add(current.id)
    void api.viewStatus(current.id).catch(() => {
      viewSentRef.current.delete(current.id)
    })
  }, [current?.id, current?.views, isOwner, me?.id, patchStatusList])

  // Sync video element with pause / resume
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (paused) {
      try { v.pause() } catch { /* */ }
    } else {
      void v.play().catch(() => {})
    }
  }, [paused, idx])

  // Single active progress bar
  useEffect(() => {
    if (!items.length) return
    lastTsRef.current = null

    const tick = (ts: number) => {
      if (lastTsRef.current == null) lastTsRef.current = ts
      const dt = ts - lastTsRef.current
      lastTsRef.current = ts

      if (!pausedRef.current) {
        const dur = segmentMsRef.current || SEGMENT_MS
        const next = Math.min(1, progressRef.current + dt / dur)
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

  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onPressStart = (side: 'left' | 'right' | 'mid') => (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-status-action]')) return
    pressStartRef.current = Date.now()
    pressSideRef.current = side
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current)
    holdTimerRef.current = setTimeout(() => {
      setPaused(true)
    }, HOLD_MS)
  }

  const onPressEnd = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }
    const held = Date.now() - pressStartRef.current
    const side = pressSideRef.current
    pressSideRef.current = null
    const wasPaused = pausedRef.current
    setPaused(false)
    if (held < HOLD_MS && side) {
      if (side === 'left') goPrev()
      else if (side === 'right') goNext()
    } else if (wasPaused) {
      // long hold released, resume
    }
  }

  const toggleMute = (e: MouseEvent) => {
    e.stopPropagation()
    const next = !muted
    setMuted(next)
    const list = loadMuted().filter((id) => id !== userId)
    if (next) list.push(userId)
    saveMuted(list)
    showToast(next ? 'Status muted' : 'Status unmuted')
  }

  const openViewers = async (e: MouseEvent) => {
    e.stopPropagation()
    if (!current || !isOwner) return
    setPaused(true)
    setViewersOpen(true)
    setViewersLoading(true)
    // Instant from cache, then refresh
    try {
      const cached = await loadCachedViewers<ViewerRow>(current.id)
      if (cached?.length) {
        setViewers(cached)
        setViewersLoading(false)
      }
    } catch { /* */ }
    try {
      const { viewers: list } = await api.statusViewers(current.id)
      setViewers(list)
      void saveCachedViewers(current.id, list)
    } catch {
      showToast('Could not load viewers')
      setViewers((v) => v)
    } finally {
      setViewersLoading(false)
    }
  }

  const closeViewers = () => {
    setViewersOpen(false)
    setPaused(false)
  }

  // Keep progress frozen while viewers sheet is open
  useEffect(() => {
    if (viewersOpen) {
      setPaused(true)
      pausedRef.current = true
    }
  }, [viewersOpen])

  const deleteCurrent = async (e?: MouseEvent) => {
    e?.stopPropagation()
    if (!current || !isOwner || deleting) return
    setDeleting(true)
    setPaused(true)
    const id = current.id
    showToast('Deleting status…')
    try {
      await api.deleteStatus(id)
      // Only remove from UI after the server confirms delete
      const remaining = items.filter((s) => s.id !== id)
      patchStatusList((list) => list.filter((s) => s.id !== id))
      showToast('Status deleted')
      if (remaining.length === 0) {
        onClose()
      } else {
        setIdx((i) => Math.min(i, remaining.length - 1))
        setProgress(0)
        progressRef.current = 0
        setPaused(false)
      }
      window.setTimeout(() => { void refreshStatus().catch(() => {}) }, 2500)
    } catch {
      showToast('Delete failed, try again')
      setPaused(false)
    } finally {
      setDeleting(false)
    }
  }

  const toggleLike = (e: MouseEvent) => {
    e.stopPropagation()
    if (!current) return
    if (isOwner) return
    const id = current.id
    const was = !!likes[id]
    const next = { ...likes, [id]: !was }
    setLikes(next)
    saveLikes(next)
    setLikePulse(true)
    window.setTimeout(() => setLikePulse(false), 450)
    if (!was) showToast('Sending like…')
    if (likeInFlight.current) return
    likeInFlight.current = true
    void api
      .likeStatus(id)
      .catch(() => {
        const rolled = { ...likes, [id]: was }
        setLikes(rolled)
        saveLikes(rolled)
        showToast('Could not update like')
      })
      .finally(() => {
        likeInFlight.current = false
      })
  }

  if (!items.length || !current) {
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
        JSON.stringify({
          peerId: userId,
          preview,
          time,
          statusId: current?.id || undefined,
        }),
      )
    } catch { /* */ }
    onClose()
    onReplyToStatus?.(userId)
  }

  const bgCode = (current as any)?.background || 'theme_purple_grad'
  const bgCss = statusBgCss(bgCode)

  return (
    <div
      className="relative flex h-full flex-col select-none text-white"
      style={{ background: bgCss }}
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
            {(current.type === 'video' || (current as any).video) ? (
              <video
                ref={videoRef}
                src={mediaUrl((current as any).video || current.image)}
                className="max-h-[55vh] w-full rounded-2xl bg-transparent object-contain pointer-events-none"
                autoPlay
                playsInline
                muted={muted}
                onLoadedMetadata={(e) => {
                  const d = e.currentTarget.duration
                  if (d && Number.isFinite(d) && d > 0) {
                    segmentMsRef.current = Math.max(1000, d * 1000)
                  }
                }}
                onEnded={() => {
                  progressRef.current = 1
                  setProgress(1)
                }}
              />
            ) : current.image ? (
              <img
                src={mediaUrl(current.image)}
                alt=""
                className="max-h-[55vh] w-full rounded-2xl bg-transparent object-contain"
                draggable={false}
              />
            ) : null}
            {current.text && (
              <p className="pointer-events-auto text-center text-2xl font-bold leading-snug whitespace-pre-wrap break-words">
                {linkifyStatusText(current.text)}
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="relative z-20 flex items-end justify-between px-5 pb-8 safe-pb" data-status-action>
        {isOwner ? (
          <>
            <button
              type="button"
              data-status-action
              onClick={(e) => { e.stopPropagation(); setPaused(true); setConfirmDelete(true) }}
              disabled={deleting}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm disabled:opacity-50"
              aria-label="Delete status"
            >
              <Trash2 size={22} />
            </button>
            <button
              type="button"
              data-status-action
              onClick={openViewers}
              className="flex min-w-12 items-center justify-center gap-1.5 rounded-full bg-white/10 px-3 py-2.5 text-white backdrop-blur-sm"
              aria-label="Viewers"
            >
              <Eye size={18} />
              <span className="text-sm font-bold">{viewCount}</span>
            </button>
          </>
        ) : (
          <>
            {/* Left stack: download/copy */}
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                data-status-action
                onClick={async (e) => {
                  e.stopPropagation()
                  try {
                    const src = current?.image
                    if (src) {
                      const a = document.createElement('a')
                      a.href = src.startsWith('http') || src.startsWith('data:') || src.startsWith('blob:')
                        ? src
                        : mediaUrl(src)
                      a.download = `safechat-status-${current?.id || 'img'}.jpg`
                      a.target = '_blank'
                      a.rel = 'noopener'
                      document.body.appendChild(a)
                      a.click()
                      a.remove()
                      showToast('Saving…')
                    } else {
                      await navigator.clipboard?.writeText(current?.text || '')
                      showToast('Status text copied')
                    }
                  } catch {
                    showToast('Could not save')
                  }
                }}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm"
                aria-label={current?.image ? 'Download' : 'Copy text'}
              >
                {current?.image ? <Download size={20} /> : <Copy size={20} />}
              </button>
            </div>

            {/* Right stack: repost (top) · like (bottom) */}
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                data-status-action
                onClick={(e) => {
                  e.stopPropagation()
                  setPaused(true)
                  setConfirmRepost(true)
                }}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm"
                aria-label="Repost"
              >
                <Repeat2 size={20} />
              </button>
              <button
                type="button"
                data-status-action
                onClick={toggleLike}
                className={`flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-sm transition-transform duration-200 ${
                  liked ? 'bg-brand-red/90 text-white' : 'bg-white/10 text-white'
                } ${likePulse ? 'scale-125' : 'scale-100'}`}
                aria-label={liked ? 'Unlike' : 'Like'}
              >
                <Heart size={20} fill={liked ? 'currentColor' : 'none'} className={likePulse ? 'animate-pulse' : ''} />
              </button>
            </div>
          </>
        )}
      </div>

      {!isOwner && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          style={{ opacity: 0.55 + swipeDy / 120, transform: `translateY(${-swipeDy * 0.25}px)` }}
        >
          <div className="rounded-full bg-black/35 px-4 py-1.5 text-xs font-bold text-white/95 backdrop-blur-md">
            Swipe up to reply
          </div>
        </div>
      )}

      
      {confirmDelete && (
        <div
          className="absolute inset-0 z-[70] flex items-end justify-center bg-black/50 px-4 pb-10"
          onClick={(e) => {
            e.stopPropagation()
            setConfirmDelete(false)
            setPaused(false)
          }}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-lg font-black text-ink">Delete this status?</p>
            <p className="mt-1 text-sm font-semibold text-gray-500">
              It will be removed for everyone who can see it.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-full bg-gray-100 py-3 text-sm font-extrabold text-ink"
                onClick={() => {
                  setConfirmDelete(false)
                  setPaused(false)
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex-1 rounded-full bg-brand-red py-3 text-sm font-extrabold text-white"
                disabled={deleting}
                onClick={() => {
                  setConfirmDelete(false)
                  void deleteCurrent()
                }}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmRepost && (
        <div
          className="absolute inset-0 z-[70] flex items-end justify-center bg-black/50 px-4 pb-10"
          onClick={(e) => {
            e.stopPropagation()
            setConfirmRepost(false)
            setPaused(false)
          }}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-lg font-black text-ink">Repost this status?</p>
            <p className="mt-1 text-sm font-semibold text-gray-500">
              It will be shared to your status with your privacy settings.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-full bg-gray-100 py-3 text-sm font-extrabold text-ink"
                onClick={() => {
                  setConfirmRepost(false)
                  setPaused(false)
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex-1 rounded-full bg-brand-purple py-3 text-sm font-extrabold text-white"
                onClick={async () => {
                  setConfirmRepost(false)
                  if (!current) {
                    setPaused(false)
                    return
                  }
                  try {
                    const hours = Number(
                      (typeof localStorage !== 'undefined' &&
                        JSON.parse(localStorage.getItem('sc_settings') || '{}').statusValidity) ||
                        24,
                    ) || 24
                    await api.postStatus(
                      current.text || '',
                      current.image || null,
                      (current as any).background || 'solid_1',
                      {
                        video: (current as any).video || undefined,
                        expiresInHours: hours,
                      },
                    )
                    showToast('Reposted to your status')
                    void refreshStatus?.()
                  } catch {
                    showToast('Could not repost')
                  } finally {
                    setPaused(false)
                  }
                }}
              >
                Repost
              </button>
            </div>
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
