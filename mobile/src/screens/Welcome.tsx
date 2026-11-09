import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { LogoIcon, Wordmark } from '../components/Logo'
import { ProgressDots } from '../components/ProgressDots'
import { PillButton } from '../components/PillButton'

export function Welcome({
  onContinue,
  onLogin,
}: {
  onContinue: () => void
  onLogin: () => void
}) {
  const [referralOpen, setReferralOpen] = useState(false)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)

  const go = () => {
    setLoading(true)
    setTimeout(() => onContinue(), 700)
  }

  return (
    <div className="relative flex h-full flex-col items-center px-8 safe-pt safe-pb">
      <div className="flex flex-1 flex-col items-center justify-center">
        <motion.div
          className="flex flex-col items-center"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
        >
          <LogoIcon size={112} />
          <Wordmark className="mt-5 text-[2.4rem] leading-none" />
          <p className="mt-4 max-w-[260px] text-center text-sm font-semibold leading-relaxed text-gray-500">
            Your conversations. Your people. Your space.
          </p>
          <ProgressDots total={3} className="mt-6" />
        </motion.div>
      </div>

      <div className="mb-2 flex w-full max-w-[280px] flex-col items-center gap-3">
        <PillButton onClick={go} loading={loading}>
          Continue
        </PillButton>

        <button
          type="button"
          onClick={() => setReferralOpen(true)}
          className="text-sm font-semibold text-gray-400 transition hover:text-brand-purple"
        >
          Referral code?
        </button>
        <button
          type="button"
          onClick={onLogin}
          className="text-sm font-bold text-brand-purple"
        >
          Already have an account? Log in
        </button>
        <p className="mt-1 flex gap-4 text-center text-[11px] font-semibold text-gray-400">
          <span className="cursor-default hover:text-brand-blue">Privacy policy</span>
          <span className="cursor-default hover:text-brand-blue">Terms of service</span>
        </p>
      </div>

      <AnimatePresence>
        {referralOpen && (
          <motion.div
            className="absolute inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setReferralOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="w-full max-w-md rounded-t-3xl bg-white px-6 pb-8 pt-4 shadow-xl sm:mx-6 sm:rounded-3xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200 sm:hidden" />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setReferralOpen(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-ink transition hover:bg-gray-200 active:scale-95"
                  aria-label="Back"
                >
                  <ArrowLeft size={20} />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-black text-ink">Referral code</p>
                  <p className="text-[12px] font-semibold text-gray-400">Optional — enter if you have one</p>
                </div>
              </div>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="Enter code"
                autoFocus
                className="mt-5 h-12 w-full rounded-2xl bg-gray-50 px-4 text-center text-[15px] font-bold tracking-wide text-ink outline-none ring-1 ring-black/5 focus:ring-brand-purple/30"
              />
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setReferralOpen(false)}
                  className="h-12 flex-1 rounded-full text-sm font-extrabold text-gray-500"
                >
                  Cancel
                </button>
                <PillButton
                  onClick={() => {
                    try {
                      if (code.trim()) localStorage.setItem('sc_referral', code.trim())
                    } catch { /* */ }
                    setReferralOpen(false)
                  }}
                  className="!w-auto flex-1"
                >
                  Apply
                </PillButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
