import { AnimatePresence, motion } from 'framer-motion'

type Props = {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-5">
          <motion.button
            type="button"
            aria-label="Dismiss"
            className="absolute inset-0 bg-ink/40 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            initial={{ opacity: 0, scale: 0.92, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 8 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="relative z-10 w-full max-w-[340px] rounded-[1.75rem] bg-white p-6 shadow-2xl"
          >
            <h3 id="confirm-title" className="text-lg font-black text-ink">
              {title}
            </h3>
            <p className="mt-2 text-sm font-semibold leading-relaxed text-gray-500">{message}</p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 rounded-full bg-gray-100 py-3 text-sm font-extrabold text-ink"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className={`flex-1 rounded-full py-3 text-sm font-extrabold text-white ${
                  danger ? 'bg-brand-red' : 'bg-brand-purple'
                }`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
