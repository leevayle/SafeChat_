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

/** Wide desktop: allow optional third (settings) column */
export const WIDE_DESKTOP_BREAKPOINT = 1100

/**
 * Foldable / dual-screen patch (Galaxy Fold, etc.):
 * - CSS multi-segment viewports when the device reports 2 horizontal segments
 * - Mid-width unfolded cover displays (~600–1099px) that aren't full desktop
 */
export function useFoldableDualPane(): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false
    return readFoldable()
  })

  useEffect(() => {
    const mqs = [
      window.matchMedia('(horizontal-viewport-segments: 2)'),
      window.matchMedia('(vertical-viewport-segments: 2)'),
      window.matchMedia('(min-width: 600px) and (max-width: 1099px)'),
    ]
    const onChange = () => setMatches(readFoldable())
    onChange()
    mqs.forEach((mq) => mq.addEventListener('change', onChange))
    window.addEventListener('resize', onChange)
    return () => {
      mqs.forEach((mq) => mq.removeEventListener('change', onChange))
      window.removeEventListener('resize', onChange)
    }
  }, [])

  return matches
}

function readFoldable(): boolean {
  try {
    if (window.matchMedia('(horizontal-viewport-segments: 2)').matches) return true
    if (window.matchMedia('(vertical-viewport-segments: 2)').matches) return true
    // Unfolded foldables / small tablets: dual pane without a third column
    if (window.matchMedia('(min-width: 600px) and (max-width: 1099px)').matches) return true
  } catch {
    /* */
  }
  return false
}
