import { motion } from 'framer-motion'
import { Check, AlertCircle } from 'lucide-react'
import { PillButton } from '../components/PillButton'
import { LogoIcon } from '../components/Logo'

type Props = {
  /** Username or display name for the welcome line */
  name: string
  /** setup = creating account, success = ready, error = failed */
  phase: 'setup' | 'success' | 'error'
  errorMessage?: string
  onEnter: () => void
  onRetry?: () => void
}

export function AlmostDone({ name, phase, errorMessage, onEnter, onRetry }: Props) {
  if (phase === 'setup') {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 safe-pt safe-pb">
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center text-center"
        >
          <LogoIcon size={96} animate />
          <h2 className="mt-6 font-ui text-xl font-black text-ink">Setting up your account</h2>
          <p className="mt-2 max-w-[280px] text-sm font-semibold text-gray-500">
            Please wait while we get SafeChat ready for you…
          </p>
          <div className="mt-8 flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="h-2.5 w-2.5 rounded-full bg-brand-purple"
                animate={{ opacity: [0.3, 1, 0.3], scale: [0.85, 1.1, 0.85] }}
                transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }}
              />
            ))}
          </div>
        </motion.div>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 safe-pt safe-pb">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center text-center"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-brand-red">
            <AlertCircle size={32} />
          </span>
          <h2 className="mt-5 font-ui text-xl font-black text-ink">Couldn&apos;t finish signup</h2>
          <p className="mt-2 max-w-[300px] text-sm font-semibold text-gray-600">
            {errorMessage || 'Something went wrong. Please try again.'}
          </p>
          <div className="mt-8 w-full max-w-[260px] space-y-3">
            {onRetry && (
              <PillButton variant="orange" onClick={onRetry}>
                Try again
              </PillButton>
            )}
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col items-center justify-center px-8 safe-pt safe-pb">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 22 }}
        className="flex flex-col items-center text-center"
      >
        <div className="relative">
          <LogoIcon size={96} animate={false} />
          <span className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full bg-green-500 text-white shadow-lg">
            <Check size={20} strokeWidth={3} />
          </span>
        </div>
        <h2 className="mt-6 font-ui text-2xl font-black text-ink">You&apos;re all set</h2>
        <p className="mt-2 max-w-[260px] text-sm font-semibold text-gray-500">
          Welcome{name ? `, ${name.split(' ')[0]}` : ''}. Your SafeChat account is ready.
        </p>
        <div className="mt-10 w-full max-w-[260px]">
          <PillButton variant="orange" onClick={onEnter}>
            Enter SafeChat
          </PillButton>
        </div>
      </motion.div>
    </div>
  )
}
