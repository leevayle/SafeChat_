import { statusBgCss, statusFgClasses, statusLightPlateOverlay } from '../lib/statusBg'
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Volume2, VolumeX, Heart, Trash2, Eye, Download, Repeat2, Copy } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { api } from '../api'
import { formatLocalTime, formatStatusTime } from '../time'
import { useStore } from '../store'
import { loadCachedViewers, saveCachedViewers } from '../lib/appCache'

import { kvGet, kvSet, kvRemove, kvGetJson, kvSetJson, hydrateKv } from '../lib/kv'
const API_ORIGIN = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '')
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
  /** Open chat with a status viewer */
  onOpenChat?: (peerId: string) => void
}

function loadLikes(): Record<string, boolean> {
  try {
    return JSON.parse(kvGet('sc_status_likes') || '{}')
  } catch {
    return {}
  }
}

function saveLikes(map: Record<string, boolean>) {
  try {
    kvSet('sc_status_likes', JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

function loadMuted(): string[] {
  try {
    return JSON.parse(kvGet('sc_status_muted') || '[]')
  } catch {
    return []
  }
}

function saveMuted(ids: string[]) {
  try {
    kvSet('sc_status_muted', JSON.stringify(ids))
  } catch {
    /* ignore */
  }
}

type ViewerRow = { id: string; username: string; name: string; photo: string | null; viewedAt: string | null; liked?: boolean; reposted?: boolean }

/** Merge viewer rows: server/live wins, but never clear a true liked/reposted flag. */
function mergeViewerFlags(prev: ViewerRow[], incoming: ViewerRow[]): ViewerRow[] {
  const byId = new Map(prev.map((r) => [String(r.id), r]))
  return (incoming || []).map((raw) => {
    const id = String((raw as any).id || (raw as any).viewer_id || '')
    const was = byId.get(id)
    return {
      id,
      username: raw.username || was?.username || '',
      name: raw.name || was?.name || 'User',
      photo: raw.photo ?? was?.photo ?? null,
      viewedAt: (raw as any).viewedAt ?? (raw as any).viewed_at ?? was?.viewedAt ?? null,
      liked: !!(raw.liked || was?.liked),
      reposted: !!(raw.reposted || was?.reposted),
    }
  })
}


export function StatusViewer({
  userId, initialStatusId, onClose, onReplyToStatus, onOpenChat }: Props) {
  const likeInFlight = useRef(false)
  const lastLikeAt = useRef(0)
  const viewSentRef = useRef<Set<string>>(new Set())
  const { statusList, refreshStatus, showToast, patchStatusList, me, settings, markStatusesViewed } = useStore()
  // Treat naive ISO timestamps as UTC (backend sends without Z)
  const parseUtc = (raw?: string | null) => {
    if (!raw) return NaN
    let s = String(raw)
    if (/^\d{4}-\d{2}-\d{2}T/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) s += 'Z'
    return Date.parse(s)
  }
  const isActiveStatus = (s: any) => {
    if (!s?.expiresAt) return true
    const t = parseUtc(s.expiresAt)
    return Number.isNaN(t) || t > Date.now()
  }
  // Feed order of OTHER users with active status (never include my own in swipe list)
  const userOrder = useMemo(() => {
    const seen = new Set<string>()
    const order: string[] = []
    const myId = me?.id ? String(me.id) : ''
    for (const s of statusList) {
      if (!isActiveStatus(s)) continue
      const uid = String(s.userId || '')
      if (!uid || seen.has(uid)) continue
      if (myId && uid === myId) continue
      if (loadMuted().includes(uid)) continue
      seen.add(uid)
      order.push(uid)
    }
    // Keep the opened peer in the list even if muted, but still never inject self
    if (userId && userId !== myId && !seen.has(userId)) order.unshift(userId)
    return order
  }, [statusList, userId, me?.id])

  const [activeUserId, setActiveUserId] = useState(userId)
  const [userSlideDir, setUserSlideDir] = useState<1 | -1>(1)
  const [userAnimKey, setUserAnimKey] = useState(0)
  useEffect(() => {
    setActiveUserId(userId)
  }, [userId])

  // Only non-expired statuses for the active user, oldest first (play order)
  const items = statusList
    .filter((s) => {
      if (s.userId !== activeUserId) return false
      return isActiveStatus(s)
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
    // Explicit target (reply deep-link or first-unviewed from openStatus)
    if (initialStatusId && activeUserId === userId) {
      const i = items.findIndex((s) => String(s.id) === String(initialStatusId))
      if (i >= 0) {
        setIdx(i)
        jumpedRef.current = true
        return
      }
    }
    // WhatsApp-style: first unviewed; if none unviewed (or all viewed), start at beginning
    const meId = me?.id ? String(me.id) : ''
    if (!meId || meId === String(activeUserId)) {
      setIdx(0)
      jumpedRef.current = true
      return
    }
    const hasViewed = (s: any) => {
      if (!Array.isArray(s.views)) return false
      return s.views.some(
        (v: any) => String(v) === meId || String(v?.id || v?.userId || '') === meId,
      )
    }
    const firstUnseen = items.findIndex((s) => !hasViewed(s))
    setIdx(firstUnseen >= 0 ? firstUnseen : 0)
    jumpedRef.current = true
  }, [initialStatusId, items, me?.id, activeUserId, userId])
  const [paused, setPaused] = useState(false)
  const [progress, setProgress] = useState(0)
  const [muted, setMuted] = useState(() => loadMuted().includes(activeUserId))
  const [likes, setLikes] = useState<Record<string, boolean>>(() => loadLikes())
  const [likePulse, setLikePulse] = useState(false)
  const [viewersOpen, setViewersOpen] = useState(false)
  const swipeStartY = useRef<number | null>(null)
  const swipeStartX = useRef<number | null>(null)
  const swipeDyRef = useRef(0)
  const swipeDxRef = useRef(0)
  const replyGestureRef = useRef(false)
  const [swipeDy, setSwipeDy] = useState(0)
  const isDesktopPointer = useMemo(() => {
    try {
      return window.matchMedia('(pointer: fine)').matches && window.matchMedia('(min-width: 900px)').matches
    } catch {
      return false
    }
  }, [])
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
  /** True once the pointer moves past a small threshold — hold-to-pause must not fire on swipes */
  const pointerMovedRef = useRef(false)

  idxRef.current = idx
  pausedRef.current = paused
  itemsLenRef.current = items.length
  progressRef.current = progress

  // Reset slide index when switching users and ensure playback resumes
  useEffect(() => {
    jumpedRef.current = false
    setIdx(0)
    setProgress(0)
    progressRef.current = 0
    pausedRef.current = false
    setPaused(false)
    lastTsRef.current = null
  }, [activeUserId])

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
  const isOwner = !!(me?.id && me.id === activeUserId)
  const viewCount = Array.isArray(current?.views) ? current.views.length : 0

  const switchUser = useCallback(
    (nextUid: string, dir: 1 | -1 = 1) => {
      if (!nextUid || nextUid === activeUserId) return
      // Finish previous user's ring; do NOT mark the next user yet so jump-to-unviewed still works
      if (me?.id && activeUserId && String(activeUserId) !== String(me.id)) {
        markStatusesViewed?.(activeUserId, me.id)
      }
      setUserSlideDir(dir)
      setUserAnimKey((k) => k + 1)
      setActiveUserId(nextUid)
      setMuted(loadMuted().includes(nextUid))
      setIdx(0)
      setProgress(0)
      progressRef.current = 0
      // Always autoplay next user's status (swipe must not leave the viewer paused)
      pausedRef.current = false
      setPaused(false)
      lastTsRef.current = null
    },
    [activeUserId, me?.id, markStatusesViewed],
  )

  // Left / right: next USER in the feed (not next slide of the same person)
  const goNextUser = useCallback(() => {
    const order = userOrder
    const i = order.indexOf(activeUserId)
    if (i >= 0 && i < order.length - 1) {
      switchUser(order[i + 1], 1)
      return
    }
    onClose()
  }, [userOrder, activeUserId, switchUser, onClose])

  const goPrevUser = useCallback(() => {
    const order = userOrder
    const i = order.indexOf(activeUserId)
    if (i > 0) {
      switchUser(order[i - 1], -1)
      return
    }
    // Stay on first user's first slide
    setIdx(0)
    setProgress(0)
    progressRef.current = 0
  }, [userOrder, activeUserId, switchUser])

  // Auto-advance within the current user's stack; after last slide go to next user
  const goNext = useCallback(() => {
    if (idxRef.current < itemsLenRef.current - 1) {
      setIdx((i) => i + 1)
      setProgress(0)
      progressRef.current = 0
    } else {
      goNextUser()
    }
  }, [goNextUser])

  const goPrev = useCallback(() => {
    if (idxRef.current > 0) {
      setIdx((i) => i - 1)
      setProgress(0)
      progressRef.current = 0
    } else {
      // Stay on this user's first status (user change is horizontal swipe only)
      setProgress(0)
      progressRef.current = 0
    }
  }, [])

  // Live viewer rows from WS cache (owner side) - update list without a network wait
  useEffect(() => {
    if (!isOwner) return
    const onCache = (ev: Event) => {
      const d = (ev as CustomEvent).detail as { statusId?: string; viewers?: ViewerRow[] }
      if (!d?.statusId || !current?.id || d.statusId !== current.id) return
      if (Array.isArray(d.viewers)) {
        setViewers((prev) => mergeViewerFlags(prev, d.viewers as ViewerRow[]))
      }
    }
    window.addEventListener('sc:status-viewers-cache', onCache as EventListener)
    return () => window.removeEventListener('sc:status-viewers-cache', onCache as EventListener)
  }, [current?.id, isOwner])

  // From notification: open viewers sheet for this status
  useEffect(() => {
    if (!current?.id || !isOwner) return
    try {
      const want = sessionStorage.getItem('sc_open_viewers')
      if (want && want === current.id) {
        sessionStorage.removeItem('sc_open_viewers')
        setViewersOpen(true)
        void (async () => {
          try {
            const cached = await loadCachedViewers<ViewerRow>(current.id)
            if (cached?.length) {
              setViewers(cached)
              setViewersLoading(false)
            } else {
              setViewersLoading(true)
            }
            const { viewers: list } = await api.statusViewers(current.id)
            setViewers((prev) => {
              const merged = mergeViewerFlags(prev, list || [])
              void saveCachedViewers(current.id, merged)
              return merged
            })
          } catch {
            /* keep cache if any */
          } finally {
            setViewersLoading(false)
          }
        })()
      }
    } catch { /* */ }
  }, [current?.id, isOwner])

  // Owner: warm viewers cache when opening own status so the sheet is ready
  useEffect(() => {
    if (!current?.id || !isOwner) return
    void (async () => {
      try {
        const cached = await loadCachedViewers<ViewerRow>(current.id)
        if (cached?.length) setViewers(cached)
      } catch { /* */ }
    })()
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

    // Server register only; keep optimistic viewed state even if the request fails
    if (viewSentRef.current.has(current.id)) return
    viewSentRef.current.add(current.id)
    void api.viewStatus(current.id).catch(() => {
      // Retry later without wiping local viewed state
      viewSentRef.current.delete(current.id)
    })
  }, [current?.id, isOwner, me?.id, patchStatusList])

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

  const clearHoldTimer = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }
  }

  const onPressStart = (side: 'left' | 'right' | 'mid') => (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-status-action]')) return
    pressStartRef.current = Date.now()
    pressSideRef.current = side
    pointerMovedRef.current = false
    clearHoldTimer()
    // Hold-to-pause only fires if the finger stays still (no swipe)
    holdTimerRef.current = setTimeout(() => {
      if (pointerMovedRef.current) return
      setPaused(true)
    }, HOLD_MS)
  }

  const onPressEnd = (e?: PointerEvent) => {
    try {
      if (e?.target && (e.target as HTMLElement).closest?.('[data-status-action]')) {
        clearHoldTimer()
        return
      }
    } catch { /* */ }
    clearHoldTimer()
    const held = Date.now() - pressStartRef.current
    const side = pressSideRef.current
    const moved = pointerMovedRef.current
    pressSideRef.current = null
    pointerMovedRef.current = false
    setPaused(false)
    // Swipes are handled in the root pointer-up path; taps only here
    if (moved || Math.abs(swipeDxRef.current) > 24 || swipeDyRef.current > 24) return
    if (held < HOLD_MS && side) {
      // TAP left/right: next / previous status for THIS user (WhatsApp-style)
      if (side === 'left') goPrev()
      else if (side === 'right') goNext()
    }
  }

  const toggleMute = (e: MouseEvent) => {
    e.stopPropagation()
    const next = !muted
    setMuted(next)
    const list = loadMuted().filter((id) => id !== activeUserId)
    if (next) list.push(activeUserId)
    saveMuted(list)
    showToast(next ? 'Status muted' : 'Status unmuted')
  }

  const openViewers = async (e: MouseEvent) => {
    e.stopPropagation()
    if (!current || !isOwner) return
    setPaused(true)
    setViewersOpen(true)
    // Instant from cache - no spinner if we already have rows from live views
    let hadCache = false
    try {
      const cached = await loadCachedViewers<ViewerRow>(current.id)
      if (cached?.length) {
        setViewers(cached)
        setViewersLoading(false)
        hadCache = true
      } else {
        setViewersLoading(true)
      }
    } catch {
      setViewersLoading(true)
    }
    // Background reconcile with server (does not clear cache on failure)
    try {
      const { viewers: list } = await api.statusViewers(current.id)
      if (Array.isArray(list)) {
        setViewers((prev) => {
          const merged = mergeViewerFlags(prev, list)
          void saveCachedViewers(current.id, merged)
          return merged
        })
      }
    } catch {
      if (!hadCache) showToast('Could not load viewers')
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
    e.preventDefault()
    e.stopPropagation()
    if (!current || isOwner) return
    const id = String(current.id || '')
    if (!id) return
    if (likeInFlight.current) return
    likeInFlight.current = true
    const was = !!likes[id]
    const nextVal = !was
    setLikes((prev) => {
      const next = { ...prev, [id]: nextVal }
      saveLikes(next)
      return next
    })
    setLikePulse(true)
    window.setTimeout(() => setLikePulse(false), 450)
    if (nextVal) showToast('Sending like…')
    void api
      .likeStatus(id)
      .then((res) => {
        // Prefer server liked flag when present
        const serverLiked = res?.liked ?? res?.data?.liked
        if (typeof serverLiked === 'boolean') {
          setLikes((prev) => {
            const next = { ...prev, [id]: serverLiked }
            saveLikes(next)
            return next
          })
        }
      })
      .catch(() => {
        setLikes((prev) => {
          const next = { ...prev, [id]: was }
          saveLikes(next)
          return next
        })
        showToast('Could not update like')
      })
      .finally(() => {
        likeInFlight.current = false
      })
  }

  // MUST stay above any conditional return — Rules of Hooks
  const handleClose = useCallback(() => {
    if (me?.id && activeUserId && String(activeUserId) !== String(me.id)) {
      markStatusesViewed?.(activeUserId, me.id)
    }
    onClose()
  }, [me?.id, activeUserId, markStatusesViewed, onClose])

  if (!items.length || !current) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-ink text-white">
        <p className="font-bold">Status is no longer visible</p>
        <p className="mt-2 max-w-[260px] text-center text-sm font-semibold text-white/70">
          It may have expired or been deleted.
        </p>
        <button type="button" onClick={onClose} className="mt-4 font-bold text-brand-orange">
          Close
        </button>
      </div>
    )
  }

  const user = current.user || {
    id: activeUserId,
    name: activeUserId,
    hue: ['#7B2CBF', '#6389EB'] as [string, string],
  }

  const commitStatusReply = () => {
    if (isOwner) return
    const peer = activeUserId
    const preview = current?.text || (current?.image ? '📷 Status' : 'Status')
    let time = ''
    try {
      if (current?.createdAt) {
        let s = String(current.createdAt)
        if (/^\d{4}-\d{2}-\d{2}T/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) s += 'Z'
        time = formatLocalTime(s)
      }
    } catch { /* */ }
    const payload = {
      peerId: peer,
      preview,
      time,
      statusId: current?.id || undefined,
    }
    try {
      sessionStorage.setItem('sc_status_reply', JSON.stringify(payload))
    } catch { /* */ }
    try {
      window.dispatchEvent(new CustomEvent('sc:status-reply', { detail: payload }))
    } catch { /* */ }
    onClose()
    onReplyToStatus?.(peer)
  }

  const bgCode = (current as any)?.background || 'theme_purple_grad'
  const bgCss = statusBgCss(bgCode)
  const fg = statusFgClasses(bgCode)
  const lightOverlay = statusLightPlateOverlay(bgCode)
  const isRepost = !!(current as any)?.isRepost

  return (
    <div
      className={`relative flex h-full flex-col select-none overflow-hidden ${fg.text}`}
      style={{
        // Longhands only (avoids React "background vs backgroundImage" conflict)
        backgroundColor: bgCss,
        ...(lightOverlay ? { backgroundImage: lightOverlay } : {}),
        touchAction: 'pan-y',
      }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerCancel={() => {
        clearHoldTimer()
        swipeStartY.current = null
        swipeStartX.current = null
        swipeDyRef.current = 0
        swipeDxRef.current = 0
        setSwipeDy(0)
        pressSideRef.current = null
        pointerMovedRef.current = false
        setPaused(false)
      }}
      onPointerDown={(e) => {
        // Never capture pointers - capture blocks like / reply / modal clicks on desktop
        if ((e.target as HTMLElement).closest('[data-status-action]')) return
        if (e.pointerType === 'mouse' && e.button !== 0) return
        swipeStartY.current = e.clientY
        swipeStartX.current = e.clientX
        swipeDyRef.current = 0
        swipeDxRef.current = 0
        pointerMovedRef.current = false
        setSwipeDy(0)
      }}
      onPointerMove={(e) => {
        if (swipeStartY.current == null || swipeStartX.current == null) return
        if ((e.target as HTMLElement).closest('[data-status-action]')) return
        const dy = swipeStartY.current - e.clientY
        const dx = e.clientX - swipeStartX.current
        swipeDxRef.current = dx
        // Any meaningful movement = swipe (cancel hold-to-pause — never pause while swiping)
        if (!pointerMovedRef.current && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
          pointerMovedRef.current = true
          clearHoldTimer()
          // Ensure we are not left paused from a previous hold
          if (pausedRef.current) {
            pausedRef.current = false
            setPaused(false)
          }
        }
        if (dy > 0) {
          swipeDyRef.current = Math.min(140, dy)
          setSwipeDy(swipeDyRef.current)
          // Do NOT pause on vertical swipe — pause is hold-still only
        }
      }}
      onPointerUp={(e) => {
        if ((e.target as HTMLElement).closest('[data-status-action]')) {
          // Let the control handle its own click; only clear hold timer
          clearHoldTimer()
          swipeStartY.current = null
          swipeStartX.current = null
          swipeDyRef.current = 0
          swipeDxRef.current = 0
          setSwipeDy(0)
          pointerMovedRef.current = false
          return
        }
        const dx = swipeDxRef.current
        const dy = swipeDyRef.current
        const absDx = Math.abs(dx)
        const absDy = Math.abs(dy)

        // Horizontal swipe → next / previous USER (owner excluded from list)
        if (absDx > 56 && absDx > absDy + 12) {
          clearHoldTimer()
          if (dx < 0) goNextUser()
          else goPrevUser()
          swipeStartY.current = null
          swipeStartX.current = null
          swipeDyRef.current = 0
          swipeDxRef.current = 0
          setSwipeDy(0)
          pointerMovedRef.current = false
          pausedRef.current = false
          setPaused(false)
          lastTsRef.current = null
          return
        }

        // Vertical swipe up → reply (mobile / foldable)
        if (!isOwner && dy > 40 && absDy > absDx) {
          clearHoldTimer()
          commitStatusReply()
          swipeStartY.current = null
          swipeStartX.current = null
          swipeDyRef.current = 0
          swipeDxRef.current = 0
          setSwipeDy(0)
          pointerMovedRef.current = false
          setPaused(false)
          return
        }

        // Otherwise treat as tap (same-user next / prev status)
        onPressEnd(e)
        swipeStartY.current = null
        swipeStartX.current = null
        swipeDyRef.current = 0
        swipeDxRef.current = 0
        setSwipeDy(0)
        pointerMovedRef.current = false
      }}
    >
      <AnimatePresence initial={false} custom={userSlideDir} mode="wait">
        <motion.div
          key={`user-${activeUserId}-${userAnimKey}`}
          custom={userSlideDir}
          initial={{ opacity: 0.65, x: userSlideDir * 36 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0.65, x: userSlideDir * -28 }}
          transition={{ type: 'tween', duration: 0.16, ease: [0.25, 0.9, 0.3, 1] }}
          className="absolute inset-0 flex flex-col"
        >
      {/* progress: completed full, current partial, future empty */}
      <div className="flex gap-1 px-3 pt-3 safe-pt">
        {items.map((s, i) => {
          let w = '0%'
          if (i < idx) w = '100%'
          else if (i === idx) w = `${Math.round(progress * 100)}%`
          return (
            <div key={s.id} className={`h-1 flex-1 overflow-hidden rounded-full ${fg.barTrack}`}>
              <div className={`h-full ${fg.barFill}`} style={{ width: w }} />
            </div>
          )
        })}
      </div>

      <div className="relative z-20 flex items-center gap-3 px-4 py-3" data-status-action>
        <Avatar contact={user} size={40} />
        <div className="min-w-0 flex-1">
          <p className={`truncate font-extrabold ${fg.text}`}>{user.name}</p>
          <p className={`flex items-center gap-1.5 text-xs font-semibold leading-none ${fg.muted}`}>
            <span className="leading-none">
              {formatStatusTime(current.createdAt || current.ago) ||
                formatLocalTime(current.createdAt || current.ago) ||
                ''}
            </span>
            {isRepost ? (
              <span
                className={`inline-flex items-center gap-1 leading-none ${fg.muted}`}
                title="Reposted"
              >
                <Repeat2 size={12} strokeWidth={2.5} className="shrink-0 translate-y-[0.5px]" />
                <span className="text-xs font-semibold leading-none">Reposted</span>
              </span>
            ) : null}
            {paused ? <span className="leading-none">· paused</span> : null}
          </p>
        </div>
        <button
          type="button"
          data-status-action
          onClick={(e) => {
            e.stopPropagation()
            handleClose()
          }}
          className={`flex h-9 w-9 items-center justify-center rounded-full ${fg.chip}`}
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </div>

      {/* Left / mid / right zones — leave bottom clear for like/reply actions */}
      <div className="absolute inset-x-0 top-0 bottom-36 z-10 flex">
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
              <p className={`pointer-events-auto text-center text-2xl font-bold leading-snug whitespace-pre-wrap break-words ${fg.text}`}>
                {linkifyStatusText(current.text)}
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="relative z-40 flex items-end justify-between px-5 pb-8 safe-pb pointer-events-auto" data-status-action>
        {isOwner ? (
          <>
            <button
              type="button"
              data-status-action
              onClick={(e) => { e.stopPropagation(); setPaused(true); setConfirmDelete(true) }}
              disabled={deleting}
              className={`flex h-12 w-12 items-center justify-center rounded-full backdrop-blur-sm disabled:opacity-50 ${fg.chip}`}
              aria-label="Delete status"
            >
              <Trash2 size={22} />
            </button>
            <button
              type="button"
              data-status-action
              onClick={openViewers}
              className={`flex min-w-12 items-center justify-center gap-1.5 rounded-full px-3 py-2.5 backdrop-blur-sm ${fg.chip}`}
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
                className={`flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-sm ${fg.chip}`}
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
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  setPaused(true)
                  setConfirmRepost(true)
                }}
                className={`relative z-[60] flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-sm ${fg.chip}`}
                aria-label="Repost"
              >
                <Repeat2 size={20} />
              </button>
              <button
                type="button"
                data-status-action
                onPointerDown={(e) => {
                  e.stopPropagation()
                }}
                onPointerUp={(e) => {
                  e.stopPropagation()
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  const now = Date.now()
                  if (now - lastLikeAt.current < 350) return
                  lastLikeAt.current = now
                  toggleLike(e)
                }}
                className={`relative z-[60] flex h-14 w-14 items-center justify-center rounded-full backdrop-blur-sm transition-transform duration-200 ${
                  liked ? 'bg-brand-red/90 text-white' : fg.chip
                } ${likePulse ? 'scale-125' : 'scale-100'}`}
                aria-label={liked ? 'Unlike' : 'Like'}
                style={{ touchAction: 'manipulation' }}
              >
                <Heart size={22} fill={liked ? 'currentColor' : 'none'} className={likePulse ? 'animate-pulse' : ''} />
              </button>
            </div>
          </>
        )}
      </div>
        </motion.div>
      </AnimatePresence>

      {!isOwner && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[55] flex justify-center px-16 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
          style={{
            opacity: Math.min(1, 0.65 + swipeDy / 100),
            transform: `translateY(${-Math.min(56, swipeDy * 0.4)}px)`,
          }}
        >
          <button
            type="button"
            data-status-action
            onPointerDown={(e) => {
              // Track swipe on the chip itself (root ignores data-status-action targets)
              e.stopPropagation()
              swipeStartY.current = e.clientY
              swipeStartX.current = e.clientX
              swipeDyRef.current = 0
              swipeDxRef.current = 0
              setSwipeDy(0)
            }}
            onPointerMove={(e) => {
              if (swipeStartY.current == null) return
              const dy = swipeStartY.current - e.clientY
              const dx = swipeStartX.current != null ? e.clientX - swipeStartX.current : 0
              swipeDxRef.current = dx
              if (dy > 0) {
                swipeDyRef.current = Math.min(140, dy)
                setSwipeDy(swipeDyRef.current)
              }
            }}
            onPointerUp={(e) => {
              e.stopPropagation()
              const dy = swipeDyRef.current
              const dx = Math.abs(swipeDxRef.current)
              swipeStartY.current = null
              swipeStartX.current = null
              swipeDyRef.current = 0
              swipeDxRef.current = 0
              setSwipeDy(0)
              // Swipe up on the chip launches reply
              if (dy > 28 && dy > dx) {
                e.preventDefault()
                replyGestureRef.current = true
                commitStatusReply()
              }
            }}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              // Avoid double-fire after a swipe-up on the same gesture
              if (replyGestureRef.current) {
                replyGestureRef.current = false
                return
              }
              commitStatusReply()
            }}
            className="pointer-events-auto animate-pulse rounded-full bg-black/40 px-4 py-2 text-xs font-bold text-white shadow-lg backdrop-blur-sm transition hover:bg-black/55 active:scale-95"
            style={{ animationDuration: '2.2s', touchAction: 'none' }}
          >
            {isDesktopPointer ? 'Click to reply' : 'Swipe up to reply'}
          </button>
        </div>
      )}

      
      {confirmDelete && (
        <div
          data-status-action
          className="absolute inset-0 z-[80] flex items-end justify-center bg-black/50 px-4 pb-10 sm:items-center"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            setConfirmDelete(false)
            setPaused(false)
          }}
        >
          <div
            data-status-action
            className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <p className="text-lg font-black text-ink">Delete this status?</p>
            <p className="mt-1 text-sm font-semibold text-gray-500">
              It will be removed for everyone who can see it.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                data-status-action
                className="flex-1 rounded-full bg-gray-100 py-3 text-sm font-extrabold text-ink"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
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
          data-status-action
          className="absolute inset-0 z-[80] flex items-end justify-center bg-black/50 px-4 pb-10 sm:items-center"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            setConfirmRepost(false)
            setPaused(false)
          }}
        >
          <div
            data-status-action
            className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <p className="text-lg font-black text-ink">Repost this status?</p>
            <p className="mt-1 text-sm font-semibold text-gray-500">
              It will be shared to your status with your privacy settings.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                data-status-action
                className="flex-1 rounded-full bg-gray-100 py-3 text-sm font-extrabold text-ink"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  setConfirmRepost(false)
                  setPaused(false)
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                data-status-action
                className="flex-1 rounded-full bg-brand-purple py-3 text-sm font-extrabold text-white"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={async (e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  setConfirmRepost(false)
                  if (!current) {
                    setPaused(false)
                    return
                  }
                  try {
                    const configuredHours = Number.parseInt(settings.statusValidity || '', 10)
                    const hours = [1, 6, 12, 24].includes(configuredHours) ? configuredHours : 24
                    await api.postStatus(
                      current.text || '',
                      current.image || null,
                      (current as any).background || 'solid_1',
                      {
                        video: (current as any).video || undefined,
                        expiresInHours: hours,
                        isRepost: true,
                        repostOfStatusId: String(current.id),
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
              className="absolute inset-0 z-40 bg-black/55"
              onClick={closeViewers}
              data-status-action
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 340, damping: 34 }}
              className="absolute inset-x-0 bottom-0 z-50 max-h-[55%] overflow-hidden rounded-t-3xl bg-white shadow-[0_-12px_40px_rgba(0,0,0,0.35)] dark:bg-[#1a222d] dark:shadow-[0_-12px_40px_rgba(0,0,0,0.55)] md:inset-x-auto md:left-1/2 md:bottom-[8%] md:max-h-[50vh] md:w-full md:max-w-md md:-translate-x-1/2 md:rounded-3xl"
              data-status-action
            >
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 dark:border-white/10">
                <h3 className="text-base font-black text-ink dark:text-gray-100">Viewed by</h3>
                <button
                  type="button"
                  onClick={closeViewers}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"
                  aria-label="Close viewers"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="max-h-[55vh] overflow-y-auto px-3 pb-6 pt-2">
                {viewersLoading ? (
                  <ul className="space-y-1 py-2" aria-busy="true" aria-label="Loading viewers">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <li key={i} className="flex items-center gap-3 rounded-2xl px-3 py-2.5">
                        <div className="sk-shimmer h-10 w-10 shrink-0 rounded-full" />
                        <div className="min-w-0 flex-1 space-y-2">
                          <div
                            className="sk-shimmer h-3.5 rounded"
                            style={{ width: `${52 + (i % 3) * 12}%` }}
                          />
                          <div className="sk-shimmer h-2.5 w-1/3 rounded" />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : viewers.length === 0 ? (
                  <p className="py-8 text-center text-sm font-bold text-gray-400 dark:text-gray-500">No views yet</p>
                ) : (
                  <ul className="space-y-0.5">
                    {viewers.map((v) => (
                      <li key={v.id}>
                        <button
                          type="button"
                          data-status-action
                          className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-gray-50 active:bg-gray-100 dark:hover:bg-white/5 dark:active:bg-white/10"
                          onClick={(e) => {
                            e.stopPropagation()
                            const peer = String(v.id || (v as any).viewer_id || '')
                            if (!peer) return
                            closeViewers()
                            onClose()
                            onOpenChat?.(peer)
                          }}
                        >
                          <Avatar
                            contact={{ id: v.id, name: v.name, photo: v.photo }}
                            size={40}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[15px] font-bold text-ink dark:text-gray-100">{v.name}</p>
                            {v.username ? (
                              <p className="truncate text-xs font-semibold text-gray-400">@{v.username}</p>
                            ) : null}
                          </div>
                          {(v.reposted || v.liked) ? (
                            <span
                              className="flex shrink-0 flex-row items-center gap-2"
                              aria-label={[
                                v.reposted ? 'Reposted' : null,
                                v.liked ? 'Liked' : null,
                              ].filter(Boolean).join(', ')}
                            >
                              {/* Repost always LEFT of like; alone it occupies the like slot */}
                              {v.reposted ? (
                                <Repeat2
                                  size={17}
                                  strokeWidth={2.6}
                                  className="shrink-0 text-[#7b2cbf] dark:text-[#c4a0ef]"
                                  aria-hidden
                                />
                              ) : null}
                              {v.liked ? (
                                <Heart
                                  size={17}
                                  className="shrink-0 text-[#e3404c]"
                                  fill="currentColor"
                                  aria-hidden
                                />
                              ) : null}
                            </span>
                          ) : null}
                        </button>
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
