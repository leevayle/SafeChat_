import { AnimatePresence, motion } from 'framer-motion'

export type Country = { name: string; code: string; flag: string }

export const COUNTRIES: Country[] = [
  { name: 'Kenya', code: '+254', flag: '🇰🇪' },
  { name: 'Uganda', code: '+256', flag: '🇺🇬' },
  { name: 'Tanzania', code: '+253', flag: '🇹🇿' },
  { name: 'USA', code: '+1', flag: '🇺🇸' },
  { name: 'Canada', code: '+1', flag: '🇨🇦' },
  { name: 'UK', code: '+44', flag: '🇬🇧' },
  { name: 'Japan', code: '+81', flag: '🇯🇵' },
  { name: 'Rwanda', code: '+250', flag: '🇷🇼' },
  { name: 'Nigeria', code: '+234', flag: '🇳🇬' },
  { name: 'South Africa', code: '+27', flag: '🇿🇦' },
]

type Props = {
  open: boolean
  selected: Country
  onSelect: (c: Country) => void
  onClose: () => void
}

export function CountryPicker({ open, selected, onSelect, onClose }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.ul
            role="listbox"
            className="absolute left-0 right-0 top-full z-30 mt-2 max-h-56 origin-top overflow-y-auto rounded-2xl border border-gray-100 bg-white py-1 shadow-xl"
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
          >
            {COUNTRIES.map((c, i) => {
              const active = c.name === selected.name
              return (
                <motion.li
                  key={c.name}
                  role="option"
                  aria-selected={active}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.02 * i }}
                  onClick={() => onSelect(c)}
                  className={`flex cursor-pointer items-center gap-3 px-4 py-3 text-[14px] font-semibold transition-colors hover:bg-gray-50 ${
                    active ? 'bg-brand-purple/5 text-brand-purple' : 'text-ink'
                  }`}
                >
                  <span className="text-xl leading-none">{c.flag}</span>
                  <span className="flex-1">{c.name}</span>
                  <span className="text-gray-500">{c.code}</span>
                </motion.li>
              )
            })}
          </motion.ul>
        </>
      )}
    </AnimatePresence>
  )
}
