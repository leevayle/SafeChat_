import { useEffect, useState } from 'react'
import { resolvePhoto, warmPhoto } from '../lib/photoCache'

type ContactLike = {
  id: string
  name: string
  photo?: string | null
  online?: boolean
  hue?: [string, string]
}

const API_ORIGIN = import.meta.env.VITE_API_URL || ''

export function Avatar({
  contact,
  size = 48,
  ring = false,
}: {
  contact: ContactLike
  size?: number
  ring?: boolean
}) {
  const [a, b] = contact.hue || ['#7B2CBF', '#6389EB']
  const [broken, setBroken] = useState(false)
  const src = resolvePhoto(contact.id, contact.photo, API_ORIGIN)

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
      className="relative inline-flex shrink-0 overflow-hidden rounded-full"
      style={{ width: size, height: size }}
    >
      {ring ? (
        <span className="rounded-full p-[2px] ring-[2.5px] ring-brand-purple">{body}</span>
      ) : (
        body
      )}
    </span>
  )
}
