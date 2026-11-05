import { useEffect, useRef, type ReactNode } from 'react'
import { AnimatePresence, motion, useMotionValue, useTransform } from 'framer-motion'
import { ArrowLeft, Check } from 'lucide-react'

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? 'bg-brand-purple' : 'bg-gray-300'}`}>
      <motion.span layout transition={{ type: 'spring', stiffness: 500, damping: 32 }} className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow ${on ? 'right-0.5' : 'left-0.5'}`} />
    </button>
  )
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const y = useMotionValue(0)
  const opacity = useTransform(y, [0, 180], [1, 0.4])
  const startY = useRef(0)

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="absolute inset-0 z-[100] bg-ink/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ opacity }}
          />
          <motion.div
            className="absolute inset-x-0 bottom-0 z-[110] max-h-[85%] overflow-y-auto rounded-t-[2rem] bg-white p-6 pb-8 shadow-2xl"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            style={{ y }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 80 || info.velocity.y > 500) onClose()
              else y.set(0)
            }}
          >
            <div
              className="mx-auto mb-4 flex cursor-grab touch-none justify-center active:cursor-grabbing"
              onPointerDown={(e) => {
                startY.current = e.clientY
              }}
              onPointerUp={(e) => {
                if (e.clientY - startY.current > 48) onClose()
              }}
            >
              <div className="h-1.5 w-12 rounded-full bg-gray-200" />
            </div>
            {title && <h3 className="mb-3 text-xl font-black">{title}</h3>}
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export function OptionList({ options, value, onPick }: { options: string[]; value: string; onPick: (v: string) => void }) {
  return (
    <ul className="space-y-1">
      {options.map((o) => (
        <li key={o}>
          <button onClick={() => onPick(o)} className={`flex w-full items-center justify-between rounded-2xl px-4 py-3.5 text-left font-bold transition-colors hover:bg-gray-100 ${o === value ? 'bg-brand-purple/10 text-brand-purple' : ''}`}>
            {o}{o === value && <Check size={20} />}
          </button>
        </li>
      ))}
    </ul>
  )
}

export function Toast({ msg, clear }: { msg: string | null; clear: () => void }) {
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => clear(), 2800)
    return () => clearTimeout(t)
  }, [msg, clear])
  return (
    <AnimatePresence mode="wait">
      {msg && (
        <motion.div
          className="pointer-events-none absolute inset-x-0 bottom-24 z-[80] flex justify-center px-4"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
        >
          <div className="rounded-full bg-ink/90 px-4 py-2 text-sm font-bold text-white shadow-lg">{msg}</div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function ScreenHeader({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 flex min-h-14 shrink-0 items-center gap-2 border-b border-gray-100 bg-white/95 px-3 pt-[max(8px,env(safe-area-inset-top))] backdrop-blur">
      {onBack ? (
        <button type="button" onClick={onBack} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100" aria-label="Back">
          <ArrowLeft size={22} />
        </button>
      ) : (
        <span className="w-2" />
      )}
      <h1 className="min-w-0 flex-1 truncate text-lg font-black">{title}</h1>
      {right}
    </header>
  )
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  danger,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  danger?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full rounded-full py-3.5 text-sm font-extrabold text-white shadow-md disabled:opacity-40 ${
        danger ? 'bg-brand-red' : 'bg-brand-purple'
      } ${className}`}
    >
      {children}
    </button>
  )
}
