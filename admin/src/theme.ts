import { useSyncExternalStore } from 'react'
export type Theme = 'light' | 'dark'
const KEY = 'safechat-admin-theme'
const get = (): Theme => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
export function setTheme(t: Theme) {
  document.documentElement.dataset.theme = t
  try { localStorage.setItem(KEY, t) } catch { /* private mode */ }
  window.dispatchEvent(new Event('admin:theme'))
}
const subscribe = (cb: () => void) => { window.addEventListener('admin:theme', cb); return () => window.removeEventListener('admin:theme', cb) }
/** Shared by the top bar and the Account page so they never disagree. */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, get, () => 'light' as Theme)
  return { theme, setTheme, toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark') }
}
