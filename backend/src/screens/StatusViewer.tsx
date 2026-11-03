import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Volume2, VolumeX, Heart } from 'lucide-react'
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

export function StatusViewer({ userId, onClose }: Props) {
  const { statusList, refreshStatus, showToast } = useStore()
  const items = statusList.filter((s) => s.userId === userId)
  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const [progress, setProgress] = useState(0)
  const [muted, setMuted] = useState(() => loadMuted().includes(userId))
  const [likes, setLikes] = useState<Record<string, boolean>>(() => loadLikes())

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

  // Register view once per status
  useEffect(() => {
    if (!current?.id) return
    if (viewedRef.current.has(current.id)) return
    viewedRef.current.add(current.id)
    api
      .viewStatus(current.id)
      .then(() => refreshStatus().catch(() => {}))
      .catch(() => {})
  }, [current?.id, refreshStatus])

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

  const toggleLike = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!current) return
    const next = { ...likes, [current.id]: !likes[current.id] }
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

  return (
    <div
      className="relative flex h-full flex-col select-none bg-gradient-to-b from-[#2a1a3a] to-ink text-white"
      onContextMenu={(e) => e.preventDefault()}
      onPointerUp={onPressEnd}
      onPointerCancel={onPressEnd}
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
      </div>
    </div>
  )
}
