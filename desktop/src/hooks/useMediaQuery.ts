import { useEffect, useState } from 'react'

/** Matches when viewport width is at least `minWidth` px. SSR-safe (defaults to false). */
export function useMediaQuery(minWidth: number): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(`(min-width: ${minWidth}px)`).matches
  })

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${minWidth}px)`)
    const onChange = () => setMatches(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [minWidth])

  return matches
}

/** Desktop / laptop layout — full-width WhatsApp-style shell */
export const DESKTOP_BREAKPOINT = 768
