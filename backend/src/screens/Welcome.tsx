import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
          <ProgressDots step={1} className="mt-6" />
        </motion.div>
      </div>

      <div className="mb-2 flex w-full max-w-[280px] flex-col items-center gap-3">
        <PillButton onClick={go} loading={loading}>
          Continue
        </PillButton>
        
        <button
          type="button"
          onClick={() => setReferralOpen(true)}
          className="text-sm font-semibold text-gray-400"
        >
          Referral code?
        </button>
        <p className="mt-1 flex gap-4 text-center text-[11px] font-semibold text-gray-400">
          <span className="hover:text-brand-blue cursor-default">Privacy policy</span>
          <span className="hover:text-brand-blue cursor-default">Terms of service</span>
        </p>
      </div>

      <AnimatePresence>
        {referralOpen && (
          <motion.div
            className="absolute inset-0 z-30 flex items-start justify-center bg-black/40 px-6 pt-24"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setReferralOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: -12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-xl"
            >
              <button
                type="button"
                onClick={() => setReferralOpen(false)}
                className="mb-2 text-ink"
                aria-label="Close"
              >
                ◂
              </button>
              <h3 className="text-center text-xl font-black">
                <span className="text-brand-red">Referral</span>{' '}
                <span className="text-brand-purple">Code</span>
                <span className="text-brand-blue">.</span>
              </h3>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Enter code here"
                className="mt-4 h-12 w-full rounded-full border border-gray-200 px-4 text-center font-semibold text-brand-purple outline-none focus:border-brand-purple"
              />
              <div className="mt-4 flex justify-center">
                <PillButton
                  onClick={() => setReferralOpen(false)}
                  className="!w-auto px-10"
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
