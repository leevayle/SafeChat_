import { useState } from 'react'
import { motion } from 'framer-motion'
import { ProgressDots } from '../components/ProgressDots'
import { PillButton } from '../components/PillButton'
import { COUNTRIES, CountryPicker, type Country } from '../components/CountryPicker'

type Props = {
  loading: boolean
  onSubmit: (phone: string, countryCode: string) => void
  onLogin: () => void
}

export function Signup({ loading, onSubmit, onLogin }: Props) {
  const [country, setCountry] = useState<Country>(COUNTRIES[0])
  const [open, setOpen] = useState(false)
  const [phone, setPhone] = useState('')
  const valid = phone.replace(/\D/g, '').length >= 7

  return (
    <div className="relative flex h-full flex-col items-center px-8 safe-pt safe-pb">
      <div className="mt-[18%] flex flex-col items-center text-center">
        <motion.h2
          className="font-ui text-[1.85rem] font-black leading-tight text-ink sm:text-[2rem]"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          Let&apos;s get your
          <br />
          <span className="text-brand-red">On</span>{' '}
          <span className="text-brand-purple">board!</span>
        </motion.h2>
        <ProgressDots step={2} className="mt-5" />
      </div>

      <motion.div
        className="relative mt-14 w-full max-w-[300px] space-y-4"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex h-12 w-full items-center justify-between rounded-full border border-gray-200 bg-white px-5 text-[15px] font-semibold text-ink shadow-sm outline-none transition hover:bg-gray-50 focus-visible:ring-4 focus-visible:ring-brand-blue/25"
          >
            <span>{country.code}</span>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="opacity-50">
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <CountryPicker
            open={open}
            selected={country}
            onSelect={(c) => {
              setCountry(c)
              setOpen(false)
            }}
            onClose={() => setOpen(false)}
          />
        </div>

        <input
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone number"
          className="h-12 w-full rounded-full border border-gray-200 bg-white px-5 text-center text-[15px] font-semibold text-ink shadow-sm outline-none placeholder:text-gray-400 focus:border-brand-purple/30 focus:ring-4 focus:ring-brand-purple/15"
        />
      </motion.div>

      <div className="flex-1" />

      <motion.div
        className="mb-2 w-full max-w-[280px] space-y-3"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <PillButton
          variant="orange"
          loading={loading}
          disabled={!valid}
          onClick={() => onSubmit(phone.replace(/\D/g, ''), country.code)}
        >
          Sign me up!
        </PillButton>
        <button
          type="button"
          onClick={onLogin}
          className="w-full text-center text-sm font-bold text-brand-purple hover:underline"
        >
          Already registered? Log in
        </button>
      </motion.div>
    </div>
  )
}
