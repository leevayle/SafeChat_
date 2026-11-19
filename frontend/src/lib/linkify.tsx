/** Shared link / contact detection for message & status text. */

const LINK_RE =
  /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|\+?\d[\d\s\-().]{7,}\d|@[a-zA-Z0-9_]{2,32})/g

function copyText(value: string) {
  try {
    void navigator.clipboard.writeText(value)
  } catch {
    /* */
  }
}

/**
 * Turn URLs, phone numbers, and @handles into underlined, tappable spans.
 * Long-press / right-click copies the matched text.
 */
export function linkifyText(text: string, opts?: { mine?: boolean }) {
  const mine = !!opts?.mine
  const parts = String(text || '').split(LINK_RE)
  return parts.map((part, i) => {
    if (!part) return null
    const isUrl = /^(https?:\/\/|www\.)/i.test(part)
    const isPhone = /^\+?\d[\d\s\-().]{7,}\d$/.test(part)
    const isHandle = /^@[a-zA-Z0-9_]{2,32}$/.test(part)
    if (!isUrl && !isPhone && !isHandle) return <span key={i}>{part}</span>

    const href = isUrl
      ? part.startsWith('http')
        ? part
        : `https://${part}`
      : isPhone
        ? `tel:${part.replace(/[\s().-]/g, '')}`
        : undefined

    const linkClass = mine
      ? 'underline decoration-white/70 underline-offset-2 break-all'
      : 'underline decoration-brand-purple/60 text-brand-purple underline-offset-2 break-all'

    const onContextMenu = (e: { preventDefault: () => void; stopPropagation: () => void }) => {
      e.preventDefault()
      e.stopPropagation()
      copyText(part)
    }

    const onTouchStart = (e: { currentTarget: EventTarget & { addEventListener: Function; removeEventListener: Function } }) => {
      const t = window.setTimeout(() => copyText(part), 450)
      const clear = () => {
        window.clearTimeout(t)
        e.currentTarget.removeEventListener('touchend', clear)
        e.currentTarget.removeEventListener('touchmove', clear)
      }
      e.currentTarget.addEventListener('touchend', clear)
      e.currentTarget.addEventListener('touchmove', clear)
    }

    if (href) {
      return (
        <a
          key={i}
          href={href}
          target={isUrl ? '_blank' : undefined}
          rel={isUrl ? 'noopener noreferrer' : undefined}
          className={linkClass}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={onContextMenu}
          onTouchStart={onTouchStart as any}
        >
          {part}
        </a>
      )
    }

    return (
      <span
        key={i}
        role="button"
        tabIndex={0}
        className={`${linkClass} cursor-pointer`}
        onContextMenu={onContextMenu}
        onTouchStart={onTouchStart as any}
      >
        {part}
      </span>
    )
  })
}
