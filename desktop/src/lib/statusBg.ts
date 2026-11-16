/** Status background solids only - simple palette */

export const STATUS_BG: Record<string, string> = {
  purple: '#7B2CBF',
  orange: '#F97316',
  blue: '#3B82F6',
  black: '#0a0a0a',
  white: '#F5F5F5',
}

export const STATUS_BG_OPTIONS = [
  { id: 'purple', label: 'Purple' },
  { id: 'orange', label: 'Orange' },
  { id: 'blue', label: 'Blue' },
  { id: 'black', label: 'Black' },
  { id: 'white', label: 'White' },
] as const

export function statusBgCss(id?: string | null): string {
  if (!id) return STATUS_BG.purple
  if (STATUS_BG[id]) return STATUS_BG[id]
  // legacy gradient/solid ids → map to nearest solid
  if (id.includes('orange') || id.includes('amber')) return STATUS_BG.orange
  if (id.includes('blue') || id.includes('sky')) return STATUS_BG.blue
  if (
    id.includes('black') ||
    id.includes('night') ||
    id.includes('charcoal') ||
    id.includes('solid_1') ||
    id.includes('solid_5')
  )
    return STATUS_BG.black
  if (id.includes('white') || id.includes('cloud')) return STATUS_BG.white
  return STATUS_BG.purple
}

/** True when status background is light (needs dark text / chrome). */
export function statusBgIsLight(id?: string | null): boolean {
  if (!id) return false
  const key = String(id).toLowerCase()
  if (key === 'white' || key.includes('white') || key.includes('cloud')) return true
  const css = statusBgCss(id).toLowerCase()
  return css === '#f5f5f5' || css === '#ffffff' || css === '#fff' || css === 'white'
}

/** True when the app shell is in dark mode. */
export function appIsDarkMode(): boolean {
  try {
    const root = document.documentElement
    return root.dataset.mode === 'dark' || root.classList.contains('dark')
  } catch {
    return false
  }
}

/**
 * Text / icon classes so white (and other light) status backgrounds stay readable
 * in both light and dark app themes.
 */
export function statusFgClasses(id?: string | null): {
  text: string
  muted: string
  barTrack: string
  barFill: string
  chip: string
} {
  if (statusBgIsLight(id)) {
    // Always dark ink on a light plate - readable under dark app chrome
    return {
      text: 'text-gray-900',
      muted: 'text-gray-600',
      barTrack: 'bg-black/20',
      barFill: 'bg-gray-900',
      chip: 'bg-black/12 text-gray-900 shadow-sm ring-1 ring-black/10',
    }
  }
  return {
    text: 'text-white',
    muted: 'text-white/70',
    barTrack: 'bg-white/25',
    barFill: 'bg-white',
    chip: 'bg-white/15 text-white ring-1 ring-white/10',
  }
}

/** Soft vignette for light statuses when the app is dark. */
export function statusLightPlateOverlay(id?: string | null): string | undefined {
  if (!statusBgIsLight(id) || !appIsDarkMode()) return undefined
  return 'linear-gradient(180deg, rgba(0,0,0,0.05) 0%, transparent 16%, transparent 84%, rgba(0,0,0,0.07) 100%)'
}

export function themeDefaultStatusBg(themeId?: string): string {
  const t = (themeId || 'purple').toLowerCase()
  // Mono theme id is "white" in settings - default status template is black
  if (t === 'white' || t.includes('mono') || t.includes('black') || t.includes('dark') || t.includes('neutral'))
    return 'black'
  if (t.includes('orange')) return 'orange'
  if (t.includes('blue')) return 'blue'
  return 'purple'
}
