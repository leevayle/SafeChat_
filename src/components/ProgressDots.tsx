/** Decorative SafeChat color bars (not step progress). */
export function ProgressDots({
  step: _step,
  total = 3,
  className = '',
}: {
  step?: number
  total?: number
  className?: string
}) {
  const colors = ['bg-brand-purple', 'bg-brand-blue', 'bg-brand-orange']
  const n = Math.min(Math.max(total, 3), 3)
  // Was h-[7px] w-9 (36px) → height -1.5px ≈ 5.5px, width 4/5 ≈ 29px
  return (
    <div className={`flex items-center justify-center gap-2.5 ${className}`} aria-hidden>
      {Array.from({ length: n }).map((_, i) => (
        <span
          key={i}
          className={`h-[5.5px] w-[29px] rounded-full ${colors[i] || 'bg-brand-purple'}`}
        />
      ))}
    </div>
  )
}
