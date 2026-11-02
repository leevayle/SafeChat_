import { motion } from 'framer-motion'
import { LogoIcon, Wordmark } from '../components/Logo'
import { ProgressDots } from '../components/ProgressDots'
import { PillButton } from '../components/PillButton'

export function Splash({
  onContinue,
  onLogin,
}: {
  onContinue: () => void
  onLogin: () => void
}) {
  return (
    <div className="flex h-full flex-col items-center px-8 safe-pt safe-pb">
      <div className="flex flex-1 flex-col items-center justify-center">
        <motion.div
          className="flex flex-col items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <LogoIcon size={112} />
          <Wordmark className="mt-5 text-[2.4rem] leading-none" />
          <p className="mt-3 text-center text-sm font-semibold text-gray-500">
            Chat freely. Chat safely.
          </p>
          <ProgressDots step={1} className="mt-6" />
        </motion.div>
      </div>

      <div className="mb-2 flex w-full max-w-[280px] flex-col items-center gap-3">
        <PillButton onClick={onContinue}>Continue</PillButton>
        <button
          type="button"
          onClick={onLogin}
          className="text-sm font-bold text-brand-purple"
        >
          Already have an account? Log in
        </button>
        <p className="mt-1 max-w-[240px] text-center text-[11px] font-semibold leading-relaxed text-gray-400">
          By continuing you agree to our Privacy Policy and Terms of Service.
        </p>
      </div>
    </div>
  )
}
