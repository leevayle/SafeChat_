import {
  MessageCircle,
  Users,
  CircleDashed,
  Phone,
  ContactRound,
  Settings2,
  User,
  LogOut,
} from 'lucide-react'
import type { Tab } from '../BottomNav'
import { LogoIcon } from '../Logo'

export type RailItem = Tab | 'contacts' | 'profile' | 'settings'

type Props = {
  active: RailItem
  badges?: Partial<Record<RailItem, number>>
  onSelect: (item: RailItem) => void
  onLogout?: () => void
  loading?: boolean
}

const ITEMS: { id: RailItem; label: string; Icon: typeof MessageCircle }[] = [
  { id: 'chats', label: 'Chats', Icon: MessageCircle },
  { id: 'groups', label: 'Groups', Icon: Users },
  { id: 'status', label: 'Status', Icon: CircleDashed },
  { id: 'calls', label: 'Calls', Icon: Phone },
  { id: 'contacts', label: 'Contacts', Icon: ContactRound },
]

function itemClass(isActive: boolean) {
  if (isActive) {
    return 'bg-brand-purple/10 text-brand-purple'
  }
  return 'bg-transparent text-gray-500 hover:text-brand-purple dark:text-gray-400 dark:hover:text-brand-purple'
}

export function NavRail({ active, badges = {}, onSelect, onLogout, loading }: Props) {
  return (
    <aside
      className="nav-rail flex h-full w-[4.5rem] shrink-0 flex-col items-center border-0 bg-transparent py-3"
      aria-label="Main navigation"
    >
      <button
        type="button"
        onClick={() => onSelect('chats')}
        className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl text-brand-purple transition hover:text-brand-purple"
        aria-label="SafeChat"
        title={loading ? 'Loading…' : 'SafeChat'}
      >
        <LogoIcon size={30} animate={!!loading} />
      </button>

      <nav className="flex flex-1 flex-col items-center gap-1.5">
        {ITEMS.map(({ id, label, Icon }) => {
          const isActive = active === id
          const badge = badges[id] || 0
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              title={label}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex h-11 w-11 items-center justify-center rounded-xl bg-transparent transition ${itemClass(isActive)}`}
            >
              <Icon size={22} strokeWidth={isActive ? 2.25 : 1.9} />
              {badge > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-red px-1 text-[10px] font-black text-white">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      <div className="mt-auto flex flex-col items-center gap-1.5 pb-1">
        <button
          type="button"
          onClick={() => onSelect('settings')}
          title="Settings"
          aria-label="Settings"
          className={`flex h-11 w-11 items-center justify-center rounded-xl bg-transparent transition ${itemClass(active === 'settings')}`}
        >
          <Settings2 size={22} strokeWidth={active === 'settings' ? 2.25 : 1.9} />
        </button>
        <button
          type="button"
          onClick={() => onSelect('profile')}
          title="Profile"
          aria-label="Profile"
          className={`flex h-11 w-11 items-center justify-center rounded-xl bg-transparent transition ${itemClass(active === 'profile')}`}
        >
          <User size={22} strokeWidth={active === 'profile' ? 2.25 : 1.9} />
        </button>
        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            title="Log out"
            aria-label="Log out"
            className="mt-1 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-red/15 text-brand-red transition hover:bg-brand-red/25 hover:text-[#c42d38]"
          >
            <LogOut size={20} />
          </button>
        )}
      </div>
    </aside>
  )
}
