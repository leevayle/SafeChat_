export const pad = (n: number) => String(n).padStart(2, '0')
/** Local calendar date as YYYY-MM-DD (what <input type="date"> uses). */
export const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
/** Local date+time as YYYY-MM-DDTHH:mm (what <input type="datetime-local"> uses). */
export const localDT = (d = new Date()) => `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
export const dayStart = (s: string) => new Date(`${s}T00:00:00`)
export const dayEnd = (s: string) => new Date(`${s}T23:59:59.999`)

/** Monday 00:00 of the week containing d. */
export function weekStart(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}

export type Preset = 'today' | 'week' | '7d' | 'month' | 'latest' | 'custom'
export function presetRange(p: Exclude<Preset, 'latest' | 'custom'>, now = new Date()): { from: string; to: string } {
  const to = ymd(now)
  if (p === 'today') return { from: to, to }
  if (p === 'week') return { from: ymd(weekStart(now)), to }
  if (p === '7d') { const d = new Date(now); d.setDate(d.getDate() - 6); return { from: ymd(d), to } }
  return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to }
}
