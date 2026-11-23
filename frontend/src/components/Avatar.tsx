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
    return /\.gif$/i.test(src.split('?')[0].split('#')[0])
  } catch {
    return false
  }
}

/** Rasterize first frame of a GIF (or any image) to a still PNG data URL. */
function stillFrameFromUrl(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
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

  const viewerPremium = isPremium(
    (settings as any)?.subscriptionPlan || (me as any)?.subscriptionPlan,
  )
  // Premium + setting on (default) → animate GIFs. Pro always still.
  const allowAnimate =
    viewerPremium && (settings as any)?.animatedProfilePhotos !== false
  const isGif = looksLikeGif(src) || looksLikeGif(contact.photo)

  useEffect(() => {
    setBroken(false)
    setStillSrc(null)
    if (contact.photo) warmPhoto(contact.id, contact.photo, API_ORIGIN)
  }, [contact.id, contact.photo])

  useEffect(() => {
    let cancelled = false
    if (!src || !isGif || allowAnimate) {
      setStillSrc(null)
      return
    }
    stillFrameFromUrl(src)
      .then((data) => {
        if (!cancelled) setStillSrc(data)
      })
      .catch(() => {
        // Fall back to original URL; browser may still animate — best effort
        if (!cancelled) setStillSrc(null)
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

  // While freezing a GIF, wait for the still frame so Pro never flashes animation
  const displaySrc = isGif && !allowAnimate ? stillSrc : src
  const showImg = Boolean(displaySrc) && !broken

  const body = showImg ? (
    <img
      src={displaySrc!}
      alt=""
      className="h-full w-full rounded-full object-cover"
      style={{ width: size, height: size }}
      loading="lazy"
      decoding="async"
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
