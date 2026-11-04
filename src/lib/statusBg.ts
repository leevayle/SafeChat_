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
  // Aura-style extras
  gradient_5: 'linear-gradient(145deg, #6366f1 0%, #ec4899 50%, #f97316 100%)',
  gradient_6: 'linear-gradient(155deg, #0ea5e9 0%, #8b5cf6 55%, #f43f5e 100%)',
  gradient_7: 'linear-gradient(165deg, #14b8a6 0%, #3b82f6 50%, #a855f7 100%)',
  gradient_8: 'linear-gradient(150deg, #f59e0b 0%, #ef4444 45%, #7c3aed 100%)',
}

export const STATUS_BG_OPTIONS = [
  { id: 'solid_1', label: 'Night' },
  { id: 'solid_2', label: 'Teal' },
  { id: 'solid_3', label: 'Cocoa' },
  { id: 'solid_4', label: 'Navy' },
  { id: 'solid_5', label: 'Charcoal' },
  { id: 'gradient_1', label: 'Purple blaze' },
  { id: 'gradient_2', label: 'Ocean' },
  { id: 'gradient_3', label: 'Sunset' },
  { id: 'gradient_4', label: 'Indigo' },
  { id: 'gradient_5', label: 'Aura' },
  { id: 'gradient_6', label: 'Nebula' },
  { id: 'gradient_7', label: 'Lagoon' },
  { id: 'gradient_8', label: 'Ember' },
] as const

export function statusBgCss(code?: string | null): string {
  return STATUS_BACKGROUNDS[code || 'solid_1'] || STATUS_BACKGROUNDS.solid_1
}
