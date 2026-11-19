import type { ReactNode } from 'react'
/** Segmented status ring — one arc per status item; viewed = gray, unviewed = brand purple */
export function StatusRing({
  total,
  viewed = 0,
  size,
  children,
  className = '',
  accent,
}: {
  total: number
  viewed?: number
  size: number
  children: ReactNode
  className?: string
  /** Unviewed segment color — defaults to current theme brand purple */
  accent?: string
}) {
  const s = Number(size) > 0 ? Number(size) : 56
  if (total <= 0) {
    return <span className={`relative inline-flex ${className}`}>{children}</span>
  }

  const stroke = 3
  const r = (s - stroke) / 2
  const c = 2 * Math.PI * r
  const gap = total > 1 ? 0.04 : 0 // fraction of circumference as gap between segments
  const usable = 1 - gap * total
  const segLen = (usable / total) * c
  const gapLen = gap * c
  const mid = s / 2

  const segments = Array.from({ length: total }, (_, i) => {
    const isViewed = i < viewed
    return (
      <circle
        key={i}
        cx={mid}
        cy={mid}
        r={r}
        fill="none"
        stroke={isViewed ? 'var(--sc-status-viewed, #d1d5db)' : (accent || 'var(--color-brand-purple, #7b2cbf)')}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${segLen} ${c - segLen}`}
        strokeDashoffset={-i * (segLen + gapLen)}
        transform={`rotate(-90 ${mid} ${mid})`}
      />
    )
  })

  return (
    <span className={`relative inline-flex shrink-0 overflow-visible ${className}`} style={{ width: s, height: s }}>
      <svg width={s} height={s} className="absolute inset-0 pointer-events-none">
        {segments}
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center overflow-visible"
        style={{ padding: stroke + 1 }}
      >
        {/* overflow-visible so premium checkmark can sit on top of the ring */}
        <span className="relative flex h-full w-full items-center justify-center overflow-visible rounded-full">
          {children}
        </span>
      </span>
    </span>
  )
}
