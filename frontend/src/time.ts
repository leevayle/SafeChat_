import { kvGet, kvSet, kvRemove, kvGetJson, kvSetJson, hydrateKv } from './lib/kv'
/** UTC helpers — store/transmit UTC, display local. */

function getHour12(): boolean {
  try {
    const raw = kvGet('sc_settings')
    if (!raw) return false
    const s = JSON.parse(raw)
    return s?.timeFormat === '12h'
  } catch {
    return false
  }
}

/** UTC helpers — store/transmit UTC, display local. */

/** Current instant as ISO-8601 UTC with Z suffix. */
export function utcNowIso(): string {
  return new Date().toISOString()
}

/** Parse any timestamp; treat naive strings as UTC. */
export function parseUtc(input?: string | number | Date | null): Date | null {
  if (input == null || input === '') return null
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input
  }
  if (typeof input === 'number') {
    const d = new Date(input)
    return Number.isNaN(d.getTime()) ? null : d
  }
  let s = String(input).trim()
  if (!s) return null
  // Naive "2026-11-04T12:00:00" or with space → force UTC
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
    s = s.replace(' ', 'T')
    if (!s.endsWith('Z')) s = s + 'Z'
  }
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

/** HH:mm in the user's local timezone (from a UTC instant). */
export function formatLocalTime(input?: string | number | Date | null): string {
  const d = parseUtc(input)
  if (!d) return ''
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: getHour12(),
  })
}

/**
 * Status header time: just now / N min ago / N hr ago /
 * today 10:23 / yesterday 4:20 / short date + time.
 * Respects the user's 12h/24h setting.
 */
export function formatStatusTime(input?: string | number | Date | null): string {
  const d = parseUtc(input)
  if (!d) return ''
  const diff = Date.now() - d.getTime()
  if (diff < 45_000) return 'just now'
  if (diff < 3600_000) {
    const m = Math.max(1, Math.floor(diff / 60_000))
    return m === 1 ? '1 min ago' : `${m} min ago`
  }
  if (diff < 5 * 3600_000) {
    const h = Math.floor(diff / 3600_000)
    return h === 1 ? '1 hr ago' : `${h} hr ago`
  }
  const now = new Date()
  const time = formatLocalTime(d)
  if (d.toDateString() === now.toDateString()) return `today ${time}`
  const y = new Date(now)
  y.setDate(y.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return `yesterday ${time}`
  if (diff < 7 * 86_400_000) {
    const weekday = d.toLocaleDateString(undefined, { weekday: 'short' })
    return `${weekday} ${time}`
  }
  const date = d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  })
  return `${date} ${time}`
}

/** Relative / absolute local label for list rows. */
export function formatLocalDateTime(input?: string | number | Date | null): string {
  const d = parseUtc(input)
  if (!d) return ''
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return formatLocalTime(d)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: getHour12(),
  })
}

/** "last seen" human label in local time. */
export function formatLastSeen(input?: string | number | Date | null): string {
  const d = parseUtc(input)
  if (!d) return ''
  const diff = Date.now() - d.getTime()
  if (diff < 45_000) return 'last seen just now'
  if (diff < 3600_000) {
    const m = Math.max(1, Math.floor(diff / 60_000))
    return `last seen ${m} min ago`
  }
  const now = new Date()
  const time = formatLocalTime(d)
  if (d.toDateString() === now.toDateString()) return `last seen today at ${time}`
  const y = new Date(now)
  y.setDate(y.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return `last seen yesterday at ${time}`
  return `last seen ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at ${time}`
}

/** Local calendar day key (YYYY-MM-DD) for grouping messages / list sections. */
export function localDayKey(input?: string | number | Date | null): string {
  const d = parseUtc(input)
  if (!d) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Chat day separator label from a UTC timestamp.
 * Today → "Today", yesterday → "Yesterday", else weekday or short date.
 */
export function formatDayLabel(input?: string | number | Date | null): string {
  const d = parseUtc(input)
  if (!d) return ''
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startMsg = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round((startToday.getTime() - startMsg.getTime()) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays > 1 && diffDays < 7) {
    return d.toLocaleDateString(undefined, { weekday: 'long' })
  }
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  })
}
