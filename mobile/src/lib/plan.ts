/** Subscription helpers — always use server-synced me/settings, never invent plan client-side. */

export type Plan = 'pro' | 'premium'

export function normalizePlan(raw?: string | null): Plan {
  const p = (raw || 'pro').toLowerCase()
  if (p === 'premium') return 'premium'
  return 'pro' // free → pro
}

export function isPremium(plan?: string | null): boolean {
  return normalizePlan(plan) === 'premium'
}
