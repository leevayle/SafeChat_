export function ProgressDots({
  step,
  total = 3,
  className = '',
}: {
  step: number
  total?: number
  className?: string
}) {
  return (
    <div className={`flex items-center justify-center gap-2 ${className}`}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`h-[5px] rounded-full transition-all duration-300 ${
            i + 1 <= step ? 'w-5 bg-brand-blue' : 'w-5 bg-gray-300'
          }`}
        />
      ))}
    </div>
  )
}
