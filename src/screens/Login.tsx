import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { PillButton } from '../components/PillButton'
import { useStore } from '../store'

export function Login({ onBack, onSuccess }: { onBack: () => void; onSuccess: () => void }) {
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
    <div className="flex h-full flex-col px-8 safe-pt safe-pb">
      <button
        type="button"
        onClick={onBack}
        className="mt-4 flex h-11 w-11 items-center justify-center rounded-full bg-white text-ink shadow-sm ring-1 ring-gray-200/80 transition hover:bg-gray-50 active:scale-95"
        aria-label="Back"
      >
        <ArrowLeft size={22} strokeWidth={2.25} />
      </button>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-8"
      >
        <h2 className="text-2xl font-black text-ink">
          Welcome <span className="text-brand-purple">back</span>
        </h2>
        <p className="mt-2 text-sm font-semibold text-gray-500">
          Log in with your verified phone number and password. Include your country code, for example +254.
        </p>
      </motion.div>

      <div className="mt-10 space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-bold text-gray-500">Phone number</label>
          <div className="flex h-12 items-center rounded-full bg-gray-100 px-4">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^+\d\s()-]/g, ''))}
              placeholder="+254 7XX XXX XXX"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              className="h-full flex-1 bg-transparent text-[15px] font-semibold outline-none"
            />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold text-gray-500">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            className="h-12 w-full rounded-full bg-gray-100 px-5 text-[15px] font-semibold outline-none focus:ring-4 focus:ring-brand-purple/15"
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </div>
        {error && <p className="text-sm font-bold text-brand-red">{error}</p>}
      </div>

      <div className="flex-1" />
      <div className="pb-4">
        <PillButton variant="orange" loading={loading} onClick={submit}>
          Log in
        </PillButton>
      </div>
    </div>
  )
}
