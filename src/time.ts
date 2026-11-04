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
    hour12: false,
  })
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
    hour12: false,
  })
}

/** "last seen" human label in local time. */
export function formatLastSeen(input?: string | number | Date | null): string {
  const d = parseUtc(input)
  if (!d) return 'last seen recently'
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
