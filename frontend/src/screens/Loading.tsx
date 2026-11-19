import { motion } from 'framer-motion'
import { LogoIcon } from '../components/Logo'

/** Quiet interstitial while session hydrates — no fake onboarding chrome. */
export function Loading() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8">
      <LogoIcon size={72} animate />
      <div className="mt-6 flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-2 w-2 rounded-full bg-brand-purple"
            animate={{ opacity: [0.3, 1, 0.3], scale: [0.85, 1.1, 0.85] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </div>
    </div>
  )
}
