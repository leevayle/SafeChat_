import { useSyncExternalStore } from 'react'

export type LegalKind = 'privacy' | 'terms'

const HASH: Record<LegalKind, string> = {
  privacy: '#/legal/privacy',
  terms: '#/legal/terms',
}

/** Use as `href` for a plain <a> (works in new tabs, right-click, etc.). */
export const legalHref = (kind: LegalKind) => HASH[kind]

function parse(): LegalKind | null {
  const h = typeof location === 'undefined' ? '' : location.hash
  if (h.startsWith(HASH.privacy)) return 'privacy'
  if (h.startsWith(HASH.terms) || h.startsWith('#/legal/user-agreement')) return 'terms'
  return null
}

// Remember whether the page was opened from inside the app, so "close" can go back.
let cameFromApp = false
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', (e) => {
    const old = (e as HashChangeEvent).oldURL
    if (parse() && old && !old.includes('#/legal/')) cameFromApp = true
  })
}

const notify = () => window.dispatchEvent(new Event('hashchange'))

/** Open a legal page from anywhere in the app. */
export function openLegal(kind: LegalKind) {
  location.hash = HASH[kind]
}

/** Swap between the two documents without stacking history entries. */
export function switchLegal(kind: LegalKind) {
  history.replaceState(null, '', HASH[kind])
  notify()
}

export function closeLegal() {
  if (cameFromApp) {
    cameFromApp = false
    history.back()
  } else {
    history.replaceState(null, '', location.pathname + location.search)
    notify()
  }
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb)
  window.addEventListener('popstate', cb)
  return () => {
    window.removeEventListener('hashchange', cb)
    window.removeEventListener('popstate', cb)
  }
}

export function useLegalRoute(): LegalKind | null {
  return useSyncExternalStore(subscribe, parse, () => null)
}
