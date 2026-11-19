/** Session-scoped profile photo cache — load once, reuse everywhere. */

const cache = new Map<string, string>()
const inflight = new Map<string, Promise<string>>()

export function photoCacheKey(userId?: string | null, photo?: string | null) {
  if (photo && (photo.startsWith('data:') || photo.startsWith('blob:'))) return photo
  if (userId && photo) return `${userId}::${photo}`
  return photo || userId || ''
}

export function getCachedPhoto(key: string): string | null {
  if (!key) return null
  return cache.get(key) || null
}

export function setCachedPhoto(key: string, src: string) {
  if (!key || !src) return
  cache.set(key, src)
}

/** Resolve a photo URL through the session cache (dedupes network loads). */
export function resolvePhoto(
  userId: string | undefined | null,
  photo: string | null | undefined,
  origin = '',
): string {
  if (!photo) return ''
  if (photo.startsWith('data:') || photo.startsWith('blob:') || photo.startsWith('http')) {
    const key = photoCacheKey(userId, photo)
    setCachedPhoto(key, photo)
    return photo
  }
  const abs = photo.startsWith('/') ? `${origin}${photo}` : photo
  const key = photoCacheKey(userId, abs)
  const hit = getCachedPhoto(key)
  if (hit) return hit
  setCachedPhoto(key, abs)
  return abs
}

export function warmPhoto(userId: string, photo: string | null | undefined, origin = '') {
  const src = resolvePhoto(userId, photo, origin)
  if (!src || src.startsWith('data:')) return
  if (inflight.has(src)) return inflight.get(src)
  const p = new Promise<string>((resolve) => {
    const img = new Image()
    img.onload = () => {
      setCachedPhoto(photoCacheKey(userId, photo), src)
      inflight.delete(src)
      resolve(src)
    }
    img.onerror = () => {
      inflight.delete(src)
      resolve(src)
    }
    img.src = src
  })
  inflight.set(src, p)
  return p
}
