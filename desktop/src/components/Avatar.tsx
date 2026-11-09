import { useEffect, useState } from 'react'
import { resolvePhoto, warmPhoto } from '../lib/photoCache'

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

const API_ORIGIN = import.meta.env.VITE_API_URL || ''

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
  const [a, b] = contact.hue || ['#7B2CBF', '#6389EB']
  const [broken, setBroken] = useState(false)
  const src = resolvePhoto(contact.id, contact.photo, API_ORIGIN)
  const showBadge = premium ?? contact.premium ?? contact.verified ?? false

  useEffect(() => {
    setBroken(false)
    if (contact.photo) warmPhoto(contact.id, contact.photo, API_ORIGIN)
  }, [contact.id, contact.photo])

  const initials = (contact.name || '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const showImg = Boolean(src) && !broken
  const badge = Math.max(14, Math.round(size * 0.28))

  const body = showImg ? (
    <img
      src={src}
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

  return (
    <span
      className="relative inline-flex shrink-0"
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
      {showBadge && (
        <span
          className="pointer-events-none absolute z-30 flex items-center justify-center rounded-full bg-[#1DA1F2] text-white shadow-md ring-2 ring-white"
          style={{
            width: badge,
            height: badge,
            // Bottom-right of profile photo
            right: -2,
            bottom: -2,
            fontSize: badge * 0.55,
          }}
          title="Premium"
          aria-label="Premium verified"
        >
          <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden>
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
          </svg>
        </span>
      )}
    </span>
  )
}
