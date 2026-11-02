import { useEffect, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Check } from 'lucide-react'

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? 'bg-brand-purple' : 'bg-gray-300'}`}>
      <motion.span layout transition={{ type: 'spring', stiffness: 500, damping: 32 }} className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow ${on ? 'right-0.5' : 'left-0.5'}`} />
    </button>
  )
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="absolute inset-0 z-[60] bg-ink/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div className="absolute inset-x-0 bottom-0 z-[70] max-h-[85%] overflow-y-auto rounded-t-[2rem] bg-white p-6 pb-8 shadow-2xl" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 320, damping: 32 }}>
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-gray-200" />
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
  useEffect(() => { if (!msg) return; const t = setTimeout(clear, 2000); return () => clearTimeout(t) }, [msg, clear])
  return (
    <AnimatePresence>
      {msg && (
        <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} className="pointer-events-none absolute inset-x-0 bottom-24 z-[80] flex justify-center">
          <span className="rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-white shadow-xl">{msg}</span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function ScreenHeader({ title, onBack, right }: { title: string; onBack: () => void; right?: ReactNode }) {
  return (
    <header className="flex shrink-0 items-center gap-1 bg-white px-2 pb-3 pt-5 shadow-sm">
      <motion.button whileTap={{ scale: 0.88 }} onClick={onBack} aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-full text-brand-purple hover:bg-gray-100"><ArrowLeft size={22} /></motion.button>
      <h2 className="flex-1 text-xl font-black">{title}</h2>
      {right}
    </header>
  )
}

export function PrimaryButton({ children, onClick, disabled, danger }: { children: ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <motion.button whileTap={{ scale: 0.97 }} whileHover={{ y: -1 }} disabled={disabled} onClick={onClick} className={`h-13 w-full rounded-full py-3.5 font-extrabold text-white shadow-lg transition disabled:opacity-50 ${danger ? 'bg-brand-red shadow-brand-red/30' : 'bg-linear-to-r from-brand-orange to-brand-orange-2 shadow-brand-orange-2/30'}`}>
      {children}
    </motion.button>
  )
}
