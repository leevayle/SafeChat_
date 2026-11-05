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
  children: React.ReactNode
  className?: string
  /** Unviewed segment color — defaults to current theme brand purple */
  accent?: string
}) {
  if (total <= 0) {
    return <span className={`relative inline-flex ${className}`}>{children}</span>
  }

  const stroke = 3
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const gap = total > 1 ? 0.04 : 0 // fraction of circumference as gap between segments
  const usable = 1 - gap * total
  const segLen = (usable / total) * c
  const gapLen = gap * c

  const segments = Array.from({ length: total }, (_, i) => {
    const isViewed = i < viewed
    return (
      <circle
        key={i}
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={isViewed ? '#d1d5db' : (accent || 'var(--color-brand-purple, #7b2cbf)')}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${segLen} ${c - segLen}`}
        strokeDashoffset={-i * (segLen + gapLen)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    )
  })

  return (
    <span className={`relative inline-flex shrink-0 overflow-visible ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 pointer-events-none">
        {segments}
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center"
        style={{ padding: stroke + 1 }}
      >
        <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full">
          {children}
        </span>
      </span>
    </span>
  )
}
