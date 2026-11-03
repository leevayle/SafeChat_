import { motion } from 'framer-motion'
import { MessageCircle, CircleDashed, Phone, Users } from 'lucide-react'

export type Tab = 'chats' | 'groups' | 'status' | 'calls'
const items = [
  { id: 'chats', label: 'Chats', icon: MessageCircle },
  { id: 'groups', label: 'Groups', icon: Users },
  { id: 'status', label: 'Status', icon: CircleDashed },
  { id: 'calls', label: 'Calls', icon: Phone },
] as const

export function BottomNav({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="absolute inset-x-0 bottom-0 z-10 flex min-h-20 items-center justify-around border-t border-gray-200 bg-white/95 px-2 pt-[5px] pb-[max(5px,env(safe-area-inset-bottom))] backdrop-blur ">
      {items.map(({ id, label, icon: Icon }) => {
        const active = tab === id
        return (
          <motion.button
            key={id}
            whileTap={{ scale: 0.94 }}
            onClick={() => onChange(id)}
            className="relative flex w-[4.6rem] flex-col items-center justify-center gap-0.5 py-[9px] outline-none"
          >
            {active && (
              <motion.span
                layoutId="nav-pill"
                className="absolute inset-x-1.5 inset-y-0.5 rounded-xl bg-brand-purple/10"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
            <Icon
              size={22}
              className={`relative ${active ? 'text-brand-purple' : 'text-brand-purple/45'}`}
              strokeWidth={active ? 2.4 : 2}
            />
            <span
              className={`relative text-[11px] font-extrabold ${
                active ? 'text-brand-purple' : 'text-gray-400'
              }`}
            >
              {label}
            </span>
          </motion.button>
        )
      })}
    </nav>
  )
}
