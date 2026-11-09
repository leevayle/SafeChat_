import { AnimatePresence, motion } from 'framer-motion'
import type { ReactNode } from 'react'

type Props = {
  children: ReactNode
  onClick?: () => void
  loading?: boolean
  disabled?: boolean
  variant?: 'purple' | 'orange'
  className?: string
}

const styles = {
  purple: 'bg-brand-purple shadow-[0_8px_20px_-6px_rgba(123,44,191,0.5)]',
  orange:
    'bg-gradient-to-r from-brand-orange to-brand-orange-2 shadow-[0_8px_20px_-6px_rgba(249,115,22,0.5)]',
}

export function PillButton({
  children,
  onClick,
  loading,
  disabled,
  variant = 'purple',
  className = '',
}: Props) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled || loading}
      whileHover={loading || disabled ? undefined : { scale: 1.02 }}
      whileTap={loading || disabled ? undefined : { scale: 0.97 }}
      className={`
        relative mx-auto flex h-[52px] w-full items-center justify-center overflow-hidden
        rounded-full text-[15px] font-extrabold text-white outline-none transition
        disabled:cursor-not-allowed disabled:opacity-50
        focus-visible:ring-4 focus-visible:ring-brand-blue/35 font-ui
        ${loading ? 'bg-transparent shadow-none ring-0' : styles[variant]}
        ${className}
      `}
    >
      <AnimatePresence mode="wait" initial={false}>
        {loading ? (
          <motion.span
            key="dots"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-1.5"
          >
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="h-2.5 w-2.5 rounded-full bg-brand-purple"
                animate={{ y: [0, -6, 0], opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
              />
            ))}
          </motion.span>
        ) : (
          <motion.span
            key="label"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="font-ui"
          >
            {children}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  )
}
