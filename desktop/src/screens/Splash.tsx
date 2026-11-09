import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { LogoIcon, Wordmark } from '../components/Logo'

/**
 * Pure splash — checks feel / intro animation then hands off.
 * Sequence: fade emblem → wordmark slides up closer → dots pulse → fade out
 */
export function Splash({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<'in' | 'hold' | 'out'>('in')

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('hold'), 900)
    const t2 = setTimeout(() => setPhase('out'), 2600)
    const t3 = setTimeout(() => onDone(), 3200)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [onDone])

  return (
    <div className="flex h-full flex-col items-center justify-center bg-transparent px-8">
      <AnimatePresence>
        {phase !== 'out' && (
          <motion.div
            key="splash-core"
            className="flex flex-col items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45 }}
          >
            <LogoIcon size={120} />
            <motion.div
              initial={{ opacity: 0, y: 36 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45, duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
              className="mt-4"
            >
              <Wordmark className="text-[2.5rem] leading-none" />
            </motion.div>
            <motion.div
              className="mt-6 flex items-center gap-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.0 }}
            >
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="h-2 w-2 rounded-full bg-brand-blue"
                  animate={{ opacity: [0.3, 1, 0.3], scale: [0.85, 1.1, 0.85] }}
                  transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }}
                />
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
