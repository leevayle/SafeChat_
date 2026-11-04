/** Status background codes — both sides resolve the same palette. */
export const STATUS_BACKGROUNDS: Record<string, string> = {
  solid_1: '#1a0b2e',
  solid_2: '#0f3d3e',
  solid_3: '#3b1d0b',
  solid_4: '#1b2a4a',
  solid_5: '#1f2937',
  gradient_1: 'linear-gradient(160deg, #7B2CBF 0%, #E36414 100%)',
  gradient_2: 'linear-gradient(160deg, #0f766e 0%, #38bdf8 100%)',
  gradient_3: 'linear-gradient(160deg, #be123c 0%, #f59e0b 100%)',
  gradient_4: 'linear-gradient(160deg, #1e3a8a 0%, #a78bfa 100%)',
  gradient_5: 'linear-gradient(145deg, #6366f1 0%, #ec4899 50%, #f97316 100%)',
  gradient_6: 'linear-gradient(155deg, #0ea5e9 0%, #8b5cf6 55%, #f43f5e 100%)',
  gradient_7: 'linear-gradient(165deg, #14b8a6 0%, #3b82f6 50%, #a855f7 100%)',
  gradient_8: 'linear-gradient(150deg, #f59e0b 0%, #ef4444 45%, #7c3aed 100%)',
  // Theme-linked solids (match Settings theme palette)
  theme_purple: '#7B2CBF',
  theme_blue: '#6389EB',
  theme_orange: '#FF8C00',
  theme_mono: '#374151',
  theme_purple_grad: 'linear-gradient(155deg, #7B2CBF 0%, #C2308F 55%, #FF8C00 100%)',
  theme_blue_grad: 'linear-gradient(155deg, #6389EB 0%, #4F73D4 50%, #93C5FD 100%)',
  theme_orange_grad: 'linear-gradient(155deg, #FF8C00 0%, #F97316 50%, #FDBA74 100%)',
  theme_mono_grad: 'linear-gradient(155deg, #111827 0%, #374151 50%, #9CA3AF 100%)',
}

export const STATUS_BG_OPTIONS = [
  { id: 'theme_purple_grad', label: 'Purple' },
  { id: 'theme_blue_grad', label: 'Blue' },
  { id: 'theme_orange_grad', label: 'Orange' },
  { id: 'theme_mono_grad', label: 'Mono' },
  { id: 'theme_purple', label: 'Solid purple' },
  { id: 'theme_blue', label: 'Solid blue' },
  { id: 'theme_orange', label: 'Solid orange' },
  { id: 'solid_1', label: 'Night' },
  { id: 'solid_2', label: 'Teal' },
  { id: 'solid_5', label: 'Charcoal' },
  { id: 'gradient_5', label: 'Aura' },
  { id: 'gradient_6', label: 'Nebula' },
  { id: 'gradient_2', label: 'Ocean' },
  { id: 'gradient_3', label: 'Sunset' },
] as const

export function statusBgCss(code?: string | null): string {
  return STATUS_BACKGROUNDS[code || 'theme_purple_grad'] || STATUS_BACKGROUNDS.theme_purple_grad
}

/** Map app theme id → default status bg when opening composer */
export function themeDefaultStatusBg(themeId?: string | null): string {
  const t = themeId || 'purple'
  if (t === 'blue') return 'theme_blue_grad'
  if (t === 'orange') return 'theme_orange_grad'
  if (t === 'white') return 'theme_mono_grad'
  return 'theme_purple_grad'
}
