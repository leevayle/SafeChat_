import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { PillButton } from '../components/PillButton'
import { LogoIcon } from '../components/Logo'

export function AlmostDone({ name, onEnter }: { name: string; onEnter: () => void }) {
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
          Welcome{name ? `, ${name.split(' ')[0]}` : ''}. Your chats are end-to-end ready.
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
