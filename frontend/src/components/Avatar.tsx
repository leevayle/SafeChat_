import { useEffect, useState } from 'react'
import { resolvePhoto, warmPhoto } from '../lib/photoCache'
import { API_ORIGIN } from '../config'
import { useStore } from '../store'
import { isPremium } from '../lib/plan'

type ContactLike = {
  id: string
  name: string
  photo?: string | null
  online?: boolean
  hue?: [string, string]
  /** Show premium verification mark */
  premium?: boolean
  verified?: boolean
}

function looksLikeGif(src?: string | null) {
  if (!src) return false
  if (/^data:image\/gif/i.test(src)) return true
  try {
    const path = src.split('?')[0].split('#')[0]
    // Extension or common media routes that serve GIFs without a .gif suffix
    if (/\.gif$/i.test(path)) return true
    if (/\/media\/[^/]+\/gif\b/i.test(path)) return true
    if (/[?&](?:type|format|mime)=gif\b/i.test(src)) return true
    return false
  } catch {
    return false
  }
}

/** Rasterize first frame of a GIF (or any image) to a still PNG data URL.
 * Tries CORS first (needed for cross-origin canvas in prod); falls back to
 * same-origin / no-CORS load so data: and same-host photos still work.
 */
function stillFrameFromUrl(src: string): Promise<string> {
  const tryLoad = (useCors: boolean) =>
    new Promise<string>((resolve, reject) => {
      const img = new Image()
      if (useCors && !src.startsWith('data:') && !src.startsWith('blob:')) {
        img.crossOrigin = 'anonymous'
      }
      img.onload = () => {
        try {
          const w = img.naturalWidth || img.width || 1
          const h = img.naturalHeight || img.height || 1
          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            reject(new Error('no canvas'))
            return
          }
          ctx.drawImage(img, 0, 0)
          resolve(canvas.toDataURL('image/png'))
        } catch (e) {
          reject(e)
        }
      }
      img.onerror = () => reject(new Error('load failed'))
      img.src = src
    })

  // Prefer CORS so cross-origin prod media can be read into canvas.
  // If that taints / fails (missing ACAO headers), retry without CORS —
  // works for data: URLs and same-origin assets.
  return tryLoad(true).catch(() => tryLoad(false))
}

export function Avatar({
  contact,
  size = 48,
  ring = false,
  premium,
}: {
  contact: ContactLike
  size?: number
  ring?: boolean
  /** Override premium badge */
  premium?: boolean
}) {
  const { settings, me } = useStore()
  const [a, b] = contact.hue || ['#7B2CBF', '#6389EB']
  const [broken, setBroken] = useState(false)
  const [stillSrc, setStillSrc] = useState<string | null>(null)
  const src = resolvePhoto(contact.id, contact.photo, API_ORIGIN)

  // Prefer live me.plan — settings can lag after a Premium upgrade in prod.
  const planRaw =
    (me as any)?.subscriptionPlan ||
    (settings as any)?.subscriptionPlan ||
    (me as any)?.subscription_plan ||
    'pro'
  const viewerPremium = isPremium(planRaw)
  // Premium + setting on (undefined counts as ON) → animate GIFs. Pro always still.
  const allowAnimate = viewerPremium && (settings as any)?.animatedProfilePhotos !== false
  const isGif = looksLikeGif(src) || looksLikeGif(contact.photo)

  useEffect(() => {
    setBroken(false)
    setStillSrc(null)
    if (contact.photo) warmPhoto(contact.id, contact.photo, API_ORIGIN)
  }, [contact.id, contact.photo])

  useEffect(() => {
    let cancelled = false
    // Premium / non-GIF: never keep a still frame around
    if (!src || !isGif || allowAnimate) {
      setStillSrc(null)
      return
    }
    stillFrameFromUrl(src)
      .then((data) => {
        if (!cancelled) setStillSrc(data)
      })
      .catch(() => {
        // Fall back to original URL so avatar still shows (may animate) if
        // canvas is tainted or CORS blocks still-frame extraction in prod.
        if (!cancelled) setStillSrc(src)
      })
    return () => {
      cancelled = true
    }
  }, [src, isGif, allowAnimate])

  const initials = (contact.name || '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  // Premium: always live src so GIF animation is not blocked by a stale still frame.
  // Pro: still frame when ready (avoids animation flash).
  const displaySrc = isGif && !allowAnimate ? stillSrc : src
  const showImg = Boolean(displaySrc) && !broken

  const body = showImg ? (
    <img
      src={displaySrc!}
      alt=""
      className="h-full w-full rounded-full object-cover"
      style={{ width: size, height: size }}
      // Lazy + async decode can prevent GIF animation in some prod browsers
      loading={isGif && allowAnimate ? 'eager' : 'lazy'}
      decoding={isGif && allowAnimate ? 'sync' : 'async'}
      onError={() => setBroken(true)}
    />
  ) : (
    <span
      className="flex items-center justify-center rounded-full text-white font-extrabold"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${a}, ${b})`,
        fontSize: size * 0.32,
      }}
    >
      {initials}
    </span>
  )

  const onlineDot = Math.max(10, Math.round(size * 0.22))

  return (
    <span
      className="relative inline-flex shrink-0 isolate"
      style={{ width: size, height: size }}
    >
      <span
        className="relative inline-flex overflow-hidden rounded-full"
        style={{ width: size, height: size }}
      >
        {ring ? (
          <span className="rounded-full p-[2px] ring-[2.5px] ring-brand-purple">{body}</span>
        ) : (
          body
        )}
      </span>
      {contact.online && (
        <span
          className="pointer-events-none absolute z-[2] rounded-full bg-emerald-500 shadow-sm ring-2 ring-white dark:ring-[#0b1220]"
          style={{
            width: onlineDot,
            height: onlineDot,
            right: 0,
            bottom: 0,
          }}
          title="Online"
          aria-label="Online"
        />
      )}
    </span>
  )
}

/** Same verified mark formerly on the avatar — place after the display name. */
export function VerifiedCheck({ size = 16 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-[#1DA1F2] text-white shadow-md ring-2 ring-white dark:ring-[#0b1220]"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.55,
      }}
      title="Premium"
      aria-label="Premium verified"
    >
      <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden>
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
      </svg>
    </span>
  )
}
