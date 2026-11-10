import { motion } from 'framer-motion'
import { MessageCircle, CircleDashed, Phone, Users } from 'lucide-react'

export type Tab = 'chats' | 'groups' | 'status' | 'calls'
const items = [
  { id: 'chats', label: 'Chats', icon: MessageCircle },
  { id: 'groups', label: 'Groups', icon: Users },
  { id: 'status', label: 'Status', icon: CircleDashed },
  { id: 'calls', label: 'Calls', icon: Phone },
] as const

export function BottomNav({
  tab,
  onChange,
  badges,
  docked = false,
}: {
  tab: Tab
  onChange: (t: Tab) => void
  badges?: Partial<Record<Tab, number>>
  /** In-flow bar (foldables) — avoids absolute positioning that can clip/vanish */
  docked?: boolean
}) {
  return (
    <nav
      data-bottom-nav="1"
      className={
        docked
          ? 'pointer-events-auto relative z-30 flex min-h-20 w-full shrink-0 items-center justify-around border-t border-gray-200 bg-white px-2 pt-[5px] pb-[max(5px,env(safe-area-inset-bottom))] dark:border-white/10 dark:bg-[#121821]'
          : 'pointer-events-auto absolute inset-x-0 bottom-0 z-30 flex min-h-20 items-center justify-around border-t border-gray-200 bg-white/95 px-2 pt-[5px] pb-[max(5px,env(safe-area-inset-bottom))] backdrop-blur dark:border-white/10 dark:bg-[#121821]/95'
      }
    >
      {items.map(({ id, label, icon: Icon }) => {
        const active = tab === id
        const count = badges?.[id] || 0
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
            <span className="relative">
              <Icon
                size={22}
                className={`relative ${active ? 'text-brand-purple' : 'text-brand-purple/45'}`}
                strokeWidth={active ? 2.4 : 2}
              />
              {count > 0 ? (
                <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-red px-1 text-[10px] font-black leading-none text-white ring-2 ring-white">
                  {count > 9 ? '9+' : count}
                </span>
              ) : null}
            </span>
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
