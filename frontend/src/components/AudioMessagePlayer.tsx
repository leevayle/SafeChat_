import { useEffect, useRef, useState } from 'react'

function formatTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function isAudioFile(file?: {
  name?: string | null
  mime?: string | null
  url?: string | null
} | null): boolean {
  if (!file?.url) return false
  const mime = String(file.mime || '').toLowerCase()
  if (mime.startsWith('audio/')) return true
  const name = String(file.name || file.url || '').toLowerCase().split('?')[0]
  return /\.(mp3|wav|ogg|m4a|aac|flac|webm|opus|oga|weba)$/i.test(name)
}

/** WhatsApp-style in-chat audio bubble: play/pause, scrubber, duration. */
export function AudioMessagePlayer({
  src,
  name,
  mine,
}: {
  src: string
  name?: string | null
  mine?: boolean
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [current, setCurrent] = useState(0)
  const [err, setErr] = useState(false)

  useEffect(() => {
    setPlaying(false)
    setCurrent(0)
    setDuration(0)
    setErr(false)
  }, [src])

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    const onMeta = () => setDuration(el.duration || 0)
    const onTime = () => setCurrent(el.currentTime || 0)
    const onEnd = () => {
      setPlaying(false)
      setCurrent(0)
      el.currentTime = 0
    }
    const onError = () => setErr(true)
    el.addEventListener('loadedmetadata', onMeta)
    el.addEventListener('durationchange', onMeta)
    el.addEventListener('timeupdate', onTime)
    el.addEventListener('ended', onEnd)
    el.addEventListener('error', onError)
    return () => {
      el.removeEventListener('loadedmetadata', onMeta)
      el.removeEventListener('durationchange', onMeta)
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('ended', onEnd)
      el.removeEventListener('error', onError)
    }
  }, [src])

  const toggle = (e: { stopPropagation: () => void }) => {
    e.stopPropagation()
    const el = audioRef.current
    if (!el || err) return
    if (playing) {
      el.pause()
      setPlaying(false)
    } else {
      void el.play().then(() => setPlaying(true)).catch(() => setErr(true))
    }
  }

  const onSeek = (e: { stopPropagation: () => void; target: { value: string } }) => {
    e.stopPropagation()
    const el = audioRef.current
    if (!el || !duration) return
    const t = Number(e.target.value)
    el.currentTime = t
    setCurrent(t)
  }

  const progress = duration > 0 ? current / duration : 0
  const accent = mine ? 'text-white' : 'text-brand-purple'
  const track = mine ? 'bg-white/25' : 'bg-black/10 dark:bg-white/15'
  const fill = mine ? 'bg-white' : 'bg-brand-purple'

  return (
    <div
      className={`flex min-w-[220px] max-w-[280px] items-center gap-3 rounded-2xl px-3 py-2.5 ${
        mine ? '' : ''
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      <audio ref={audioRef} src={src} preload="metadata" playsInline />
      <button
        type="button"
        onClick={toggle}
        disabled={err}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95 ${
          mine ? 'bg-white/25 text-white' : 'bg-brand-purple/15 text-brand-purple'
        } disabled:opacity-40`}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div className="relative flex h-6 items-center">
          <div className={`absolute inset-x-0 h-1 rounded-full ${track}`} />
          <div
            className={`absolute left-0 h-1 rounded-full ${fill}`}
            style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }}
          />
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.05}
            value={current}
            onChange={onSeek}
            className="relative z-[1] w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-current"
            style={{ color: mine ? '#fff' : 'var(--color-brand-purple, #7b2cbf)' }}
            aria-label="Seek"
          />
        </div>
        <div className={`mt-0.5 flex items-center justify-between gap-2 text-[11px] font-bold ${mine ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'}`}>
          <span>{formatTime(current)}</span>
          <span className={`min-w-0 truncate ${accent} opacity-80`}>
            {err ? 'Unavailable' : name ? name.replace(/\.[^.]+$/, '') : formatTime(duration)}
          </span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  )
}
