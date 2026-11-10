import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { ProgressDots } from '../components/ProgressDots'
import { PillButton } from '../components/PillButton'
import { COUNTRIES, CountryPicker, type Country } from '../components/CountryPicker'
import { api } from '../api'

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
  const [taken, setTaken] = useState(false)
  const [checking, setChecking] = useState(false)
  const [focused, setFocused] = useState(false)

  const digits = phone.replace(/\D/g, '')
  const valid = digits.length >= 7 && digits.length <= 12
  const display = formatNational(digits)
  const e164 = useMemo(() => {
    const local = digits.replace(/^0/, '')
    return `${country.code}${local}`.replace(/[^+\d]/g, '')
  }, [country.code, digits])

  const onPhoneChange = (raw: string) => {
    setPhone(raw.replace(/\D/g, '').slice(0, 12))
    if (taken) setTaken(false)
    if (error) setError('')
  }

  const continueWithCheck = async () => {
    if (!valid || loading || checking) return
    setError('')
    setTaken(false)
    setChecking(true)
    try {
      const { available } = await api.checkPhone(e164)
      if (!available) {
        setTaken(true)
        setError('This number is already on SafeChat. Log in instead.')
        return
      }
      await onSubmit(digits, country.code)
    } catch (e: any) {
      // Only treat explicit conflict as taken; network errors stay soft
      const msg = e?.message || ''
      if (/already|taken|registered|exists/i.test(msg)) {
        setTaken(true)
        setError('This number is already on SafeChat. Log in instead.')
      } else {
        setError(msg || 'Could not verify this number. Try again.')
      }
    } finally {
      setChecking(false)
    }
  }

  const fieldTone = taken
    ? 'bg-red-50 shadow-[0_0_0_2px_rgba(227,64,76,0.35)]'
    : focused
      ? 'bg-transparent shadow-[0_0_0_3px_rgba(123,44,191,0.12)]'
      : 'bg-gray-50'

  return (
    <div className="relative flex h-full flex-col bg-transparent safe-pt safe-pb">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-56"
        style={{
          background:
            'radial-gradient(ellipse 80% 70% at 50% -10%, rgba(123,44,191,0.10), transparent 70%), radial-gradient(ellipse 50% 40% at 90% 10%, rgba(227,64,76,0.06), transparent 60%)',
        }}
      />

      <button
        type="button"
        onClick={() => (onBack ? onBack() : onLogin())}
        className="absolute left-4 top-[max(0.85rem,env(safe-area-inset-top))] z-30 flex h-11 w-11 items-center justify-center rounded-full bg-white text-ink shadow-sm ring-1 ring-black/5 transition hover:bg-gray-50 active:scale-95"
        aria-label="Back"
      >
        <ArrowLeft size={20} />
      </button>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col px-6">
        <div className="mt-[12%] text-center">
          <motion.h1
            className="font-ui text-[1.85rem] font-black leading-[1.15] tracking-tight text-ink sm:text-[2.05rem]"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
          >
            What&apos;s your
            <br />
            <span className="bg-gradient-to-r from-brand-magenta to-brand-purple bg-clip-text text-transparent">
              phone number?
            </span>
          </motion.h1>
          <motion.p
            className="mx-auto mt-3 max-w-[280px] text-[13px] font-semibold leading-relaxed text-gray-500"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.08 }}
          >
            Used to secure your account and help friends find you on SafeChat.
          </motion.p>
          <ProgressDots total={3} className="mt-5" />
        </div>

        <motion.div
          className="mx-auto mt-12 w-full max-w-[340px]"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
        >
          <label className="mb-2 block text-left text-[11px] font-extrabold uppercase tracking-wider text-gray-400">
            Mobile number
          </label>
          <div className={`mx-0.5 flex items-stretch rounded-2xl transition ${fieldTone}`}>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className={`flex shrink-0 items-center gap-1.5 px-3.5 text-[15px] font-bold transition hover:bg-black/[0.03] ${
                taken ? 'text-brand-red' : 'text-ink'
              }`}
              aria-label="Choose country"
            >
              <span className="text-xl leading-none">{country.flag}</span>
              <span className="tabular-nums">{country.code}</span>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="ml-0.5 opacity-40">
                <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <span className={`my-3 w-px ${taken ? 'bg-brand-red/30' : 'bg-gray-200/80'}`} aria-hidden />
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              autoFocus
              value={display}
              onChange={(e) => onPhoneChange(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="700 000 000"
              className={`min-w-0 flex-1 bg-transparent px-4 py-3.5 text-[17px] font-bold tabular-nums tracking-wide outline-none placeholder:font-semibold placeholder:text-gray-300 ${
                taken ? 'text-brand-red' : 'text-ink'
              }`}
              aria-label="Phone number"
              aria-invalid={taken}
            />
          </div>

          <CountryPicker open={open} selected={country} onSelect={setCountry} onClose={() => setOpen(false)} />

          <div className="mt-2.5 flex items-center justify-between px-0.5">
            <p className={`text-[11px] font-bold ${taken ? 'text-brand-red' : 'text-gray-400'}`}>
              {taken
                ? 'Number already registered'
                : valid
                  ? <span className="text-emerald-600">Ready · {e164}</span>
                  : digits.length === 0
                    ? 'Enter your mobile number'
                    : 'Include area code, no leading 0'}
            </p>
            <span className={`text-[11px] font-bold tabular-nums ${taken ? 'text-brand-red/60' : 'text-gray-300'}`}>
              {digits.length}/12
            </span>
          </div>
        </motion.div>

        <div className="flex-1" />

        <motion.div
          className="mx-auto mb-1 w-full max-w-[340px] space-y-3 pb-2"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
        >
          {error && (
            <p role="alert" className="text-center text-xs font-bold text-brand-red">
              {error}
            </p>
          )}
          <PillButton
            variant="orange"
            loading={loading || checking}
            disabled={!valid || loading || checking || taken}
            onClick={() => void continueWithCheck()}
          >
            {checking ? 'Checking number…' : 'Continue'}
          </PillButton>
          <p className="px-2 text-center text-[11px] font-medium leading-relaxed text-gray-400">
            By continuing you agree to SafeChat&apos;s Terms & Privacy Policy.
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
