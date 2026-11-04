import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { PillButton } from '../components/PillButton'
import { LogoIcon, Wordmark } from '../components/Logo'
import { useStore } from '../store'

export function Login({
  onBack,
  onSuccess,
  onSignup,
}: {
  onBack: () => void
  onSuccess: () => void
  onSignup?: () => void
}) {
  const { login } = useStore()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!phone.trim() || !password) {
      setError('Enter your phone number and password')
      return
    }
    setLoading(true)
    setError('')
    try {
      await login(phone.trim().replace(/[^+\d]/g, ''), password)
      onSuccess()
    } catch (e: any) {
      setError(e.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-gradient-to-b from-[#F8F1FF] via-white to-[#EEF2FF] px-7 safe-pt safe-pb">
      {/* Soft orbs */}
      <div className="pointer-events-none absolute -right-16 -top-10 h-44 w-44 rounded-full bg-brand-purple/10 blur-3xl" />
      <div className="pointer-events-none absolute -left-12 bottom-24 h-40 w-40 rounded-full bg-brand-blue/10 blur-3xl" />

      <button
        type="button"
        onClick={onBack}
        className="relative z-10 mt-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-ink shadow-sm ring-1 ring-black/5 transition hover:bg-white active:scale-95"
        aria-label="Back"
      >
        <ArrowLeft size={22} strokeWidth={2.25} />
      </button>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="relative z-10 mt-6 flex flex-col items-center text-center"
      >
        <LogoIcon size={72} />
        <div className="mt-3">
          <Wordmark className="text-3xl" />
        </div>
        <h2 className="mt-5 text-2xl font-black tracking-tight text-ink">Welcome back</h2>
        <p className="mt-1.5 max-w-[280px] text-sm font-semibold text-gray-500">
          Sign in with your phone and password to pick up where you left off.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.4 }}
        className="relative z-10 mt-8 space-y-3.5"
      >
        <div className="rounded-3xl bg-white/90 p-4 shadow-sm ring-1 ring-black/[0.04] backdrop-blur">
          <label className="mb-1.5 block text-xs font-bold text-gray-500">Phone number</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/[^+\d\s()-]/g, ''))}
            placeholder="+254 7XX XXX XXX"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className="h-12 w-full rounded-2xl bg-gray-50 px-4 text-[15px] font-semibold outline-none ring-1 ring-transparent transition focus:bg-white focus:ring-brand-purple/25"
          />
          <label className="mb-1.5 mt-3.5 block text-xs font-bold text-gray-500">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            className="h-12 w-full rounded-2xl bg-gray-50 px-4 text-[15px] font-semibold outline-none ring-1 ring-transparent transition focus:bg-white focus:ring-brand-purple/25"
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          {error && <p className="mt-3 text-sm font-bold text-brand-red">{error}</p>}
        </div>
      </motion.div>

      <div className="relative z-10 mt-auto space-y-3 pt-8">
        <PillButton variant="orange" loading={loading} onClick={submit}>
          Log in
        </PillButton>
        <div className="flex items-center gap-3 px-2">
          <span className="h-px flex-1 bg-gray-200" />
          <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">or</span>
          <span className="h-px flex-1 bg-gray-200" />
        </div>
        <button
          type="button"
          onClick={() => onSignup?.()}
          className="h-12 w-full rounded-full bg-white text-sm font-extrabold text-brand-purple shadow-sm ring-1 ring-brand-purple/20 transition hover:bg-brand-purple/5 active:scale-[0.99]"
        >
          Create a new account
        </button>
      </div>
    </div>
  )
}
