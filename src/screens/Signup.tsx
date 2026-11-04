import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ProgressDots } from '../components/ProgressDots'
import { PillButton } from '../components/PillButton'
import { COUNTRIES, CountryPicker, type Country } from '../components/CountryPicker'

type Props = {
  loading: boolean
  onSubmit: (phone: string, countryCode: string) => Promise<void>
  onLogin: () => void
  onBack?: () => void
}

function formatNational(digits: string): string {
  const d = digits.replace(/\D/g, '').slice(0, 12)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}`
}

export function Signup({ loading, onSubmit, onLogin, onBack }: Props) {
  const [country, setCountry] = useState<Country>(
    COUNTRIES.find((c) => c.code === '+254') || COUNTRIES[0],
  )
  const [open, setOpen] = useState(false)
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [focused, setFocused] = useState(false)

  const digits = phone.replace(/\D/g, '')
  const valid = digits.length >= 7 && digits.length <= 12
  const display = formatNational(digits)
  const e164 = useMemo(() => {
    const local = digits.replace(/^0/, '')
    return `${country.code}${local}`.replace(/[^+\d]/g, '')
  }, [country.code, digits])

  return (
    <div className="relative flex h-full flex-col bg-white safe-pt safe-pb">
      {/* Soft brand wash */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-56 opacity-90"
        style={{
          background:
            'radial-gradient(ellipse 80% 70% at 50% -10%, rgba(123,44,191,0.12), transparent 70%), radial-gradient(ellipse 50% 40% at 90% 10%, rgba(227,64,76,0.08), transparent 60%)',
        }}
      />

      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="absolute left-4 top-[max(0.85rem,env(safe-area-inset-top))] z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-ink shadow-sm ring-1 ring-black/5 backdrop-blur transition hover:bg-white active:scale-95"
          aria-label="Back"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M15 18l-6-6 6-6"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}

      <div className="relative z-[1] flex flex-1 flex-col px-6 sm:px-8">
        <div className="mt-[14%] text-center">
          <motion.p
            className="text-[11px] font-black uppercase tracking-[0.18em] text-brand-purple/70"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            Step 1 of 3
          </motion.p>
          <motion.h1
            className="mt-2 font-ui text-[1.85rem] font-black leading-[1.15] tracking-tight text-ink sm:text-[2.05rem]"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
          >
            What’s your
            <br />
            <span className="bg-gradient-to-r from-brand-magenta to-brand-purple bg-clip-text text-transparent">
              phone number?
            </span>
          </motion.h1>
          <motion.p
            className="mx-auto mt-3 max-w-[280px] text-[13px] font-semibold leading-relaxed text-gray-500"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.12 }}
          >
            We’ll use this to secure your account and help friends find you on SafeChat.
          </motion.p>
          <ProgressDots step={1} total={3} className="mt-5" />
        </div>

        {/* Phone field card */}
        <motion.div
          className="mx-auto mt-10 w-full max-w-[340px]"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <div
            className={`flex items-stretch overflow-hidden rounded-2xl border bg-white shadow-[0_8px_30px_rgba(15,23,42,0.06)] transition ${
              focused
                ? 'border-brand-purple/40 ring-4 ring-brand-purple/12'
                : 'border-gray-200/90'
            }`}
          >
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex shrink-0 items-center gap-1.5 border-r border-gray-100 bg-gray-50/80 px-3.5 text-[15px] font-bold text-ink transition hover:bg-gray-100/80"
              aria-label="Choose country"
            >
              <span className="text-xl leading-none">{country.flag}</span>
              <span className="tabular-nums text-gray-700">{country.code}</span>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="ml-0.5 opacity-40">
                <path
                  d="M4 6l4 4 4-4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              autoFocus
              value={display}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 12))}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="700 000 000"
              className="min-w-0 flex-1 bg-transparent px-4 py-3.5 text-[17px] font-bold tabular-nums tracking-wide text-ink outline-none placeholder:font-semibold placeholder:text-gray-300"
              aria-label="Phone number"
            />
          </div>

          <CountryPicker
            open={open}
            selected={country}
            onSelect={(c) => {
              setCountry(c)
              setOpen(false)
            }}
            onClose={() => setOpen(false)}
          />

          <div className="mt-3 flex items-center justify-between px-1">
            <p className="text-[11px] font-bold text-gray-400">
              {valid ? (
                <span className="text-emerald-600">Looks good · {e164}</span>
              ) : digits.length === 0 ? (
                'Enter your mobile number'
              ) : (
                'Include area code, no leading 0 needed'
              )}
            </p>
            <span className="text-[11px] font-bold tabular-nums text-gray-300">{digits.length}/12</span>
          </div>
        </motion.div>

        <div className="flex-1" />

        <motion.div
          className="mx-auto mb-1 w-full max-w-[340px] space-y-3 pb-2"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22 }}
        >
          {error && (
            <p role="alert" className="text-center text-xs font-bold text-brand-red">
              {error}
            </p>
          )}
          <PillButton
            variant="orange"
            loading={loading}
            disabled={!valid || loading}
            onClick={async () => {
              setError('')
              try {
                await onSubmit(digits, country.code)
              } catch (e: any) {
                setError(e?.message || 'Could not continue. Please try again.')
              }
            }}
          >
            Continue
          </PillButton>
          <p className="px-2 text-center text-[11px] font-medium leading-relaxed text-gray-400">
            By continuing you agree to SafeChat’s Terms & Privacy Policy. You can change your number later in Settings.
          </p>
          <button
            type="button"
            onClick={onLogin}
            className="w-full py-2 text-center text-sm font-bold text-brand-purple"
          >
            Already have an account? <span className="underline underline-offset-2">Log in</span>
          </button>
        </motion.div>
      </div>
    </div>
  )
}
