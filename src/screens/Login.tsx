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
  const { login, showToast } = useStore()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')

  const submit = async () => {
    if (!phone.trim() || !password) {
      setError('Enter your phone number and password')
      return
    }
    setLoading(true)
    setError('')
    setOkMsg('')
    try {
      await login(phone.trim().replace(/[^+\d]/g, ''), password)
      setOkMsg('Signed in — opening your chats…')
      try { showToast('Welcome back') } catch { /* */ }
      // Always hand off to inbox — do not stay on this screen after auth
      onSuccess()
    } catch (e: any) {
      setError(e?.message || 'Login failed')
      setLoading(false)
      return
    }
    // Keep button in loading state briefly while stage flips to app
    setLoading(false)
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-gradient-to-b from-[#F8F1FF] via-white to-[#EEF2FF] px-7 safe-pt safe-pb ">
      
      

      

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="relative z-10 mt-6 flex flex-col items-center text-center mt-30"
      >
        <LogoIcon size={72} />
        <div className="mt-3">
          <Wordmark className="text-3xl " />
        </div>
        <h2 className="mt-5 text-2xl font-black tracking-tight text-ink mt-10">Welcome back</h2>
        <p className="mt-1.5 max-w-[280px] text-sm font-semibold text-gray-500 pb-10">
          Sign in to start Safechatting now!
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.4 }}
        className="relative z-10 mt-8 space-y-3.5"
      >
        <div className="rounded-3xl bg-white/90 p-4   ">
          <label className="mb-1.5 block text-xs font-bold text-gray-500 ">Phone number</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/[^+\d\s()-]/g, ''))}
            placeholder="+254..."
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className="h-12 w-full rounded-2xl bg-gray-100 px-4 text-[15px] font-semibold outline-none ring-1 ring-transparent transition focus:bg-white focus:ring-brand-purple/25"
          />
          <label className="mb-1.5 mt-3.5 block text-xs font-bold text-gray-500">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            className="h-12 w-full rounded-2xl bg-gray-100 px-4 text-[15px] font-semibold outline-none ring-1 ring-transparent transition focus:bg-white focus:ring-brand-purple/25"
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          {error && <p className="mt-3 text-sm font-bold text-brand-red">{error}</p>}
          {okMsg && <p className="mt-3 text-sm font-bold text-brand-purple">{okMsg}</p>}
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
          className="h-12 w-full rounded-full bg-white text-sm font-extrabold text-brand-purple shadow-sm ring-1 ring-brand-purple/20 transition hover:bg-brand-purple/5 active:scale-[0.99] mb-10"
        >
          Create a new account
        </button>
      </div>
    </div>
  )
}
