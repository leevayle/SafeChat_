/** Status background solids only — simple palette */

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
  if (id.includes('black') || id.includes('night') || id.includes('charcoal') || id.includes('solid_1') || id.includes('solid_5'))
    return STATUS_BG.black
  if (id.includes('white') || id.includes('cloud')) return STATUS_BG.white
  return STATUS_BG.purple
}

export function themeDefaultStatusBg(themeId?: string): string {
  const t = (themeId || 'purple').toLowerCase()
  // Mono theme id is "white" in settings — default status template is black
  if (t === 'white' || t.includes('mono') || t.includes('black') || t.includes('dark') || t.includes('neutral'))
    return 'black'
  if (t.includes('orange')) return 'orange'
  if (t.includes('blue')) return 'blue'
  return 'purple'
}
