import { LogoIcon } from './Logo'

/** Centered empty-state with a calm SafeChat mark and stationary brand dots. */
export function EmptyState({
  title,
  subtitle,
  className = '',
}: {
  title: string
  subtitle?: string
  className?: string
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center px-8 py-16 text-center ${className}`}
    >
      <div className="relative flex h-28 w-28 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-brand-purple/10" />
        <span className="absolute inset-3 rounded-full bg-brand-purple/8" />
        <div className="relative opacity-70">
          <LogoIcon size={64} />
        </div>
      </div>
      <h3 className="mt-6 text-lg font-black tracking-tight text-ink">{title}</h3>
      {subtitle ? (
        <p className="mt-2 max-w-[280px] text-sm font-semibold leading-relaxed text-gray-400">
          {subtitle}
        </p>
      ) : null}
      <div className="mt-5 flex items-center gap-1.5" aria-hidden>
        <span className="h-1.5 w-1.5 rounded-full bg-brand-purple" />
        <span className="h-1.5 w-1.5 rounded-full bg-brand-blue" />
        <span className="h-1.5 w-1.5 rounded-full bg-brand-orange" />
      </div>
    </div>
  )
}
